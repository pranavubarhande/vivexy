"""
Cancel Store — Backed by Redis.
Allows setting and checking a cancellation flag for long-running tools.
"""

import logging
import time

from app.agents.pubsub import _get_redis, _use_redis
from app.constants.redis_keys import REDIS_KEY_CANCEL_TOOL

logger = logging.getLogger(__name__)


def set_cancel_flag(chat_id: str, tool_name: str, ttl: int = 300) -> bool:
    """Set a cancellation flag for a specific tool in a chat."""
    r = _get_redis()
    if r and _use_redis:
        key = REDIS_KEY_CANCEL_TOOL.format(chat_id=chat_id, tool_name=tool_name)
        r.setex(key, ttl, "1")
        return True
    return False


def check_cancel_flag(chat_id: str, tool_name: str) -> bool:
    """Check if the cancellation flag is set for a specific tool."""
    r = _get_redis()
    if r and _use_redis:
        key = REDIS_KEY_CANCEL_TOOL.format(chat_id=chat_id, tool_name=tool_name)
        return r.exists(key) > 0
    return False


def clear_cancel_flag(chat_id: str, tool_name: str) -> bool:
    """Clear the cancellation flag after it's been handled."""
    r = _get_redis()
    if r and _use_redis:
        key = REDIS_KEY_CANCEL_TOOL.format(chat_id=chat_id, tool_name=tool_name)
        r.delete(key)
        return True
    return False
