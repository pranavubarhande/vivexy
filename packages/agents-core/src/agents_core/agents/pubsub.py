"""
Async PubSub Store
Redis-backed pub/sub event store used to signal pending async events (human
approvals, client tool executions) across pods — the POST that resolves an
event and the generator waiting on it may land on different pods, so Redis
is the only thing that can carry that signal between them.

Redis is a hard dependency here, not an optional accelerator: this store
used to silently degrade to a process-local-only mode when Redis was
unreachable, which meant a resolving POST landing on a different pod than
the one waiting would time out with no way to ever succeed. That failure
mode is invisible until you run more than one replica. Now, a Redis outage
raises immediately so the caller (streaming.py) surfaces a clear error to
the user instead of silently waiting out a 60-300s timeout.
"""

import asyncio
import json
import logging
import os
import time
from typing import Dict, Optional, Tuple

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

logger = logging.getLogger(__name__)

_redis_client: Optional["redis.Redis"] = None
_pending_events: Dict[str, Tuple[asyncio.AbstractEventLoop, asyncio.Event, list]] = {}


def _get_redis():
    """Return a connected Redis client, or None if Redis is unreachable.

    Deliberately does not cache a "give up" verdict — every call retries,
    since a Redis outage here is meant to be transient and visible, not a
    permanent silent downgrade.
    """
    global _redis_client
    if _redis_client is not None:
        try:
            _redis_client.ping()
            return _redis_client
        except Exception:
            _redis_client = None
    try:
        _redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        _redis_client.ping()
        return _redis_client
    except Exception as e:
        logger.error("Redis unavailable for pubsub store: %s", e)
        _redis_client = None
        return None


class AsyncPubSubStore:
    """Generic store for signalling async generators from external endpoints."""

    def __init__(self, key_pattern: str, channel_pattern: str, ttl: int = 120):
        self.key_pattern = key_pattern
        self.channel_pattern = channel_pattern
        self.ttl = ttl

    def create_event(self, request_id: str) -> asyncio.Event:
        """Register a new pending event.

        Raises RuntimeError if Redis is unreachable — without it, no other
        pod could ever resolve this event, so waiting on it would just be a
        guaranteed timeout dressed up as normal operation.
        """
        r = _get_redis()
        if r is None:
            raise RuntimeError(
                "Cannot register approval/tool event — Redis is unavailable"
            )

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
        """Signal a waiting generator with a result payload (possibly on another pod)."""
        r = _get_redis()
        if r is None:
            logger.error("Cannot resolve event %s — Redis is unavailable", request_id)
            return False

        try:
            channel = self.channel_pattern.format(request_id=request_id)
            r.publish(channel, json.dumps(result_data))
            r.delete(self.key_pattern.format(request_id=request_id))
        except Exception as e:
            logger.error("Redis publish failed for %s: %s", request_id, e)
            return False

        # Fast path: if the waiter happens to be in this same process, wake
        # it immediately instead of waiting for its own pubsub poll loop.
        entry = _pending_events.get(request_id)
        if entry:
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
        if r is None:
            _pending_events.pop(request_id, None)
            raise RuntimeError(
                "Cannot wait for approval/tool event — Redis is unavailable"
            )

        pubsub = r.pubsub()
        channel = self.channel_pattern.format(request_id=request_id)
        pubsub.subscribe(channel)

        try:
            deadline = time.time() + timeout
            while time.time() < deadline:
                if event.is_set():
                    return result_holder[0]

                try:
                    message = pubsub.get_message(timeout=0)
                    if message and message["type"] == "message":
                        return json.loads(message["data"])
                except Exception as e:
                    logger.error(
                        "Redis pubsub read failed while waiting for %s: %s",
                        request_id,
                        e,
                    )
                    raise RuntimeError(
                        "Lost Redis connection while waiting for approval/tool event"
                    ) from e

                await asyncio.sleep(0.2)
            return None
        finally:
            try:
                pubsub.unsubscribe()
                pubsub.close()
            except Exception:
                pass
            _pending_events.pop(request_id, None)
