"""
Client Tool Store — Redis pub/sub backed.

Mirrors approval_store: the streaming generator subscribes to a Redis channel
while the Electron client executes the tool locally and POSTs the result back
via the /chat/<chat_id>/tool-result endpoint, which publishes to the channel.

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

from app.constants.redis_keys import REDIS_CHANNEL_CLIENT_TOOL, REDIS_KEY_CLIENT_TOOL
from configs import REDIS_URL

logger = logging.getLogger(__name__)

_redis_client = None
_use_redis = True


def _get_redis():
    global _redis_client, _use_redis
    if _redis_client is not None:
        return _redis_client
    if redis is None:
        logger.warning(
            "Redis unavailable, falling back to in-memory client tool store: redis not installed"
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
            "Redis unavailable, falling back to in-memory client tool store: %s", e
        )
        _use_redis = False
        return None


# ------------------------------------------------------------------
# In-memory fallback
# ------------------------------------------------------------------

_pending: Dict[str, Tuple[asyncio.AbstractEventLoop, asyncio.Event, list]] = {}


def create_client_tool_event(request_id: str) -> asyncio.Event:
    """Register a pending client tool execution."""
    r = _get_redis()
    if r and _use_redis:
        key = REDIS_KEY_CLIENT_TOOL.format(request_id=request_id)
        r.setex(
            key,
            120,
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


def resolve_client_tool(request_id: str, result: str) -> bool:
    """Signal a waiting generator with the client's tool result."""
    r = _get_redis()
    if r and _use_redis:
        try:
            channel = REDIS_CHANNEL_CLIENT_TOOL.format(request_id=request_id)
            r.publish(channel, json.dumps({"result": result}))
            r.delete(REDIS_KEY_CLIENT_TOOL.format(request_id=request_id))
        except Exception as e:
            logger.error("Redis publish failed for client tool %s: %s", request_id, e)

    entry = _pending.get(request_id)
    if not entry:
        return r is not None and _use_redis

    loop, event, result_holder = entry
    result_holder[0] = result

    if loop.is_running():
        loop.call_soon_threadsafe(event.set)
    else:
        event.set()
    return True


async def wait_for_client_tool(request_id: str, timeout: float = 60.0) -> Optional[str]:
    """
    Await the client's tool result.

    Uses the in-memory asyncio.Event as the primary signalling mechanism
    (set by resolve_client_tool from the Flask POST handler). This avoids
    blocking the event loop with synchronous Redis pubsub polling.

    Redis pubsub is checked as a secondary channel in case the in-memory
    event was missed (e.g. different process).
    """
    entry = _pending.get(request_id)
    if not entry:
        return None

    _, event, result_holder = entry

    r = _get_redis()
    pubsub = None

    if r and _use_redis:
        try:
            pubsub = r.pubsub()
            channel = REDIS_CHANNEL_CLIENT_TOOL.format(request_id=request_id)
            pubsub.subscribe(channel)
        except Exception as e:
            logger.warning("Redis subscribe failed: %s", e)
            pubsub = None

    try:
        deadline = time.time() + timeout
        while time.time() < deadline:
            # Check in-memory event first (set by resolve_client_tool)
            if event.is_set():
                return result_holder[0]

            # Check Redis pubsub as secondary signal (non-blocking)
            if pubsub:
                try:
                    message = pubsub.get_message(timeout=0)
                    if message and message["type"] == "message":
                        data = json.loads(message["data"])
                        result = data.get("result")
                        if result is not None:
                            return result
                except Exception:
                    pass

            # Yield control to the event loop so Flask can process
            # the incoming POST /tool-result request
            await asyncio.sleep(0.2)

        return None
    finally:
        if pubsub:
            try:
                pubsub.unsubscribe()
                pubsub.close()
            except Exception:
                pass
        _pending.pop(request_id, None)
