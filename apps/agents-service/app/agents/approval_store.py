"""
Approval Store — Redis pub/sub backed.

Each pending approval lives as a Redis key with TTL. The streaming generator
subscribes to a Redis channel and waits; the approve/reject HTTP endpoints
publish the decision. Works across multiple workers/processes.

Falls back to in-memory asyncio.Events when Redis is unavailable.
"""

import asyncio
import json
import logging
import time
from typing import Dict, Optional, Tuple

try:
    import redis
except ImportError:
    redis = None

from app.constants.redis_keys import REDIS_CHANNEL_APPROVAL, REDIS_KEY_APPROVAL
from configs import REDIS_URL

logger = logging.getLogger(__name__)

_redis_client = None
_use_redis = True


def _get_redis():
    """Lazy Redis client initialisation."""
    global _redis_client, _use_redis
    if _redis_client is not None:
        return _redis_client
    if redis is None:
        logger.warning(
            "Redis unavailable, falling back to in-memory approval store: redis not installed"
        )
        _use_redis = False
        return None
    try:
        url = REDIS_URL
        _redis_client = redis.from_url(url, decode_responses=True)
        _redis_client.ping()
        return _redis_client
    except Exception as e:
        logger.warning(
            "Redis unavailable, falling back to in-memory approval store: %s", e
        )
        _use_redis = False
        return None


# ------------------------------------------------------------------
# In-memory fallback (single-process only)
# ------------------------------------------------------------------

_pending: Dict[str, Tuple[asyncio.AbstractEventLoop, asyncio.Event, list]] = {}


def create_approval_event(request_id: str) -> asyncio.Event:
    """Register a new pending approval."""
    r = _get_redis()
    if r and _use_redis:
        key = REDIS_KEY_APPROVAL.format(request_id=request_id)
        r.setex(
            key,
            300,
            json.dumps({"status": "pending", "created_at": time.time()}),
        )

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    event = asyncio.Event()
    _pending[request_id] = (loop, event, [None])
    return event


def resolve_approval(request_id: str, approved: bool) -> bool:
    """Signal a waiting generator with the user's decision."""
    r = _get_redis()
    if r and _use_redis:
        try:
            channel = REDIS_CHANNEL_APPROVAL.format(request_id=request_id)
            r.publish(channel, json.dumps({"approved": approved}))
            r.delete(REDIS_KEY_APPROVAL.format(request_id=request_id))
        except Exception as e:
            logger.error("Redis publish failed for approval %s: %s", request_id, e)

    entry = _pending.get(request_id)
    if not entry:
        return r is not None and _use_redis

    loop, event, decision = entry
    decision[0] = approved

    if loop.is_running():
        loop.call_soon_threadsafe(event.set)
    else:
        event.set()
    return True


async def wait_for_approval(request_id: str, timeout: float = 120.0) -> bool:
    """
    Await the user's approval decision.

    Uses the in-memory asyncio.Event as the primary signalling mechanism
    (set by resolve_approval from the Flask POST handler). Redis pubsub
    is checked as a secondary non-blocking channel.
    """
    entry = _pending.get(request_id)
    if not entry:
        return False

    _, event, decision = entry

    r = _get_redis()
    pubsub = None

    if r and _use_redis:
        try:
            pubsub = r.pubsub()
            channel = REDIS_CHANNEL_APPROVAL.format(request_id=request_id)
            pubsub.subscribe(channel)
        except Exception as e:
            logger.warning("Redis subscribe failed: %s", e)
            pubsub = None

    try:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if event.is_set():
                return bool(decision[0])

            if pubsub:
                try:
                    message = pubsub.get_message(timeout=0)
                    if message and message["type"] == "message":
                        data = json.loads(message["data"])
                        return data.get("approved", False)
                except Exception:
                    pass

            await asyncio.sleep(0.2)

        return False
    finally:
        if pubsub:
            try:
                pubsub.unsubscribe()
                pubsub.close()
            except Exception:
                pass
        _pending.pop(request_id, None)
