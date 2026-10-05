"""
Approval Store — Backed by generic AsyncPubSubStore.
"""

from agents_core.constants.redis_keys import REDIS_CHANNEL_APPROVAL, REDIS_KEY_APPROVAL

from agents_core.agents.pubsub import AsyncPubSubStore

_store = AsyncPubSubStore(
    key_pattern=REDIS_KEY_APPROVAL,
    channel_pattern=REDIS_CHANNEL_APPROVAL,
    ttl=300,
)


def create_approval_event(request_id: str):
    return _store.create_event(request_id)


def resolve_approval(request_id: str, approved: bool) -> bool:
    return _store.resolve_event(request_id, {"approved": approved})


async def wait_for_approval(request_id: str, timeout: float = 120.0) -> bool:
    data = await _store.wait_for_event(request_id, timeout)
    if data is None:
        return False
    return data.get("approved", False)
