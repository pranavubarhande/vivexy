"""
Client Tool Store — Backed by generic AsyncPubSubStore.
"""

from typing import Optional

from agents_core.constants.redis_keys import (
    REDIS_CHANNEL_CLIENT_TOOL,
    REDIS_KEY_CLIENT_TOOL,
)

from app.agents.pubsub import AsyncPubSubStore

_store = AsyncPubSubStore(
    key_pattern=REDIS_KEY_CLIENT_TOOL,
    channel_pattern=REDIS_CHANNEL_CLIENT_TOOL,
    ttl=120,
)


def create_client_tool_event(request_id: str):
    return _store.create_event(request_id)


def resolve_client_tool(request_id: str, result: str) -> bool:
    return _store.resolve_event(request_id, {"result": result})


async def wait_for_client_tool(request_id: str, timeout: float = 60.0) -> Optional[str]:
    data = await _store.wait_for_event(request_id, timeout)
    if data is None:
        return None
    return data.get("result")
