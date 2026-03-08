"""
Event Emitter
StreamEvent dataclass and Redis-backed event publishing for SSE delivery.
"""

import json
import logging
from dataclasses import dataclass
from typing import Any, Optional

try:
    import redis
except ImportError:
    redis = None

from app.constants.redis_keys import REDIS_CHANNEL_CHAT_STREAM
from configs import REDIS_URL

logger = logging.getLogger(__name__)


@dataclass
class StreamEvent:
    """Event emitted during streaming for SSE."""

    type: str
    data: Any
    message_id: Optional[str] = None
    requires_approval: bool = False


def get_redis_client():
    """Lazily create a Redis client from config REDIS_URL."""
    if redis is None:
        raise RuntimeError("redis package is not installed")
    return redis.from_url(REDIS_URL, decode_responses=True)


def publish_stream_event(chat_id: str, event: StreamEvent) -> None:
    """Publish an agent event to a Redis channel for SSE delivery.

    The web worker subscribes to ``chat:stream:<chat_id>`` and forwards
    each message to the client as an SSE frame.
    """
    try:
        r = get_redis_client()
        payload = {
            "type": event.type,
            "data": event.data,
        }
        if event.message_id:
            payload["messageId"] = event.message_id
        if event.requires_approval:
            payload["requires_approval"] = True
        r.publish(
            REDIS_CHANNEL_CHAT_STREAM.format(chat_id=chat_id),
            json.dumps(payload),
        )
    except Exception as e:
        logger.error("Failed to publish stream event: %s", e)
