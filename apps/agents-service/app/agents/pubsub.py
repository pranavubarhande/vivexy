"""
Async PubSub Store
Provides a generic Redis-backed (with in-memory fallback) Pub/Sub event store.
Used to manage pending async events (e.g. human approvals, client tool executions).
"""

import asyncio
import json
import logging
import time
from typing import Dict, Optional, Tuple

import redis

from configs import REDIS_URL

logger = logging.getLogger(__name__)

# Global singletons
_redis_client = None
_use_redis = True
_pending_events: Dict[str, Tuple[asyncio.AbstractEventLoop, asyncio.Event, list]] = {}


def _get_redis():
    global _redis_client, _use_redis
    if _redis_client is not None:
        return _redis_client
    if redis is None:
        if _use_redis:
            logger.warning(
                "Redis unavailable, falling back to in-memory store: redis package not installed"
            )
            _use_redis = False
        return None
    try:
        url = REDIS_URL
        _redis_client = redis.from_url(url, decode_responses=True)
        _redis_client.ping()
        return _redis_client
    except Exception as e:
        if _use_redis:
            logger.warning("Redis unavailable, falling back to in-memory store: %s", e)
            _use_redis = False
        return None


class AsyncPubSubStore:
    """Generic store for signalling async generators from external endpoints."""

    def __init__(self, key_pattern: str, channel_pattern: str, ttl: int = 120):
        self.key_pattern = key_pattern
        self.channel_pattern = channel_pattern
        self.ttl = ttl

    def create_event(self, request_id: str) -> asyncio.Event:
        """Register a new pending event."""
        r = _get_redis()
        if r and _use_redis:
            key = self.key_pattern.format(request_id=request_id)
            r.setex(
                key,
                self.ttl,
                json.dumps({"status": "pending", "created_at": time.time()}),
            )

        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        event = asyncio.Event()
        _pending_events[request_id] = (loop, event, [None])
        return event

    def resolve_event(self, request_id: str, result_data: Dict) -> bool:
        """Signal a waiting generator with a result payload."""
        r = _get_redis()
        if r and _use_redis:
            try:
                channel = self.channel_pattern.format(request_id=request_id)
                r.publish(channel, json.dumps(result_data))
                r.delete(self.key_pattern.format(request_id=request_id))
            except Exception as e:
                logger.error("Redis publish failed for %s: %s", request_id, e)

        entry = _pending_events.get(request_id)
        if not entry:
            return r is not None and _use_redis

        loop, event, result_holder = entry
        result_holder[0] = result_data

        if loop.is_running():
            loop.call_soon_threadsafe(event.set)
        else:
            event.set()
        return True

    async def wait_for_event(
        self, request_id: str, timeout: float = 60.0
    ) -> Optional[Dict]:
        """Await a remote or local signal representing the event resolution."""
        entry = _pending_events.get(request_id)
        if not entry:
            return None

        _, event, result_holder = entry

        r = _get_redis()
        pubsub = None

        if r and _use_redis:
            try:
                pubsub = r.pubsub()
                channel = self.channel_pattern.format(request_id=request_id)
                pubsub.subscribe(channel)
            except Exception as e:
                logger.warning("Redis subscribe failed: %s", e)
                pubsub = None

        try:
            deadline = time.time() + timeout
            while time.time() < deadline:
                if event.is_set():
                    return result_holder[0]

                if pubsub:
                    try:
                        message = pubsub.get_message(timeout=0)
                        if message and message["type"] == "message":
                            return json.loads(message["data"])
                    except Exception:
                        pass

                await asyncio.sleep(0.2)
            return None
        finally:
            if pubsub:
                try:
                    pubsub.unsubscribe()
                    pubsub.close()
                except Exception:
                    pass
            _pending_events.pop(request_id, None)
