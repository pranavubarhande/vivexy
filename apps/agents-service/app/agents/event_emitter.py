"""
Event Emitter
Publishes agent stream events to Redis so connected clients (SSE) receive them.

For the RabbitMQ worker path, events are published to a Redis pub/sub channel
keyed by chat_id.  For scheduled tasks, no client is subscribed, so events are
silently dropped — results are saved to the DB and visible in chat history.
"""

import json
import logging

import redis as redis_lib

from app.constants.redis_keys import REDIS_CHANNEL_CHAT_STREAM
from app.constants.stream_events import STREAM_EVENT_REDIS_DONE
from app.schemas.stream import StreamEvent
from configs import REDIS_URL

logger = logging.getLogger(__name__)

_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is not None:
        try:
            _redis_client.ping()
            return _redis_client
        except Exception:
            _redis_client = None
    try:
        _redis_client = redis_lib.from_url(REDIS_URL, decode_responses=True)
        _redis_client.ping()
        return _redis_client
    except Exception as e:
        logger.debug("Redis unavailable for event emitter: %s", e)
        return None


def publish_stream_event(chat_id: str, event: StreamEvent) -> None:
    """
    Publish a stream event to the Redis pub/sub channel for this chat.

    Clients subscribed to REDIS_CHANNEL_CHAT_STREAM.format(chat_id=chat_id)
    will receive each event as a JSON payload.  If Redis is unavailable, the
    event is silently dropped (acceptable for scheduled tasks where no client
    is connected).
    """
    r = _get_redis()
    if not r:
        return

    channel = REDIS_CHANNEL_CHAT_STREAM.format(chat_id=chat_id)
    try:
        if event.type == STREAM_EVENT_REDIS_DONE:
            r.publish(channel, "__done__")
        else:
            payload = json.dumps({"type": event.type, "data": event.data})
            r.publish(channel, payload)
    except Exception as e:
        logger.debug("Failed to publish stream event for chat %s: %s", chat_id, e)


__all__ = ["StreamEvent", "publish_stream_event"]
