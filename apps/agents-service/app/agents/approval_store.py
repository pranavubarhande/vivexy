"""
Approval Store
In-process store for human-in-the-loop approval signals.

Each pending approval is represented by an asyncio.Event. The streaming
generator awaits the event; the approve/reject HTTP endpoints resolve it.

NOTE: This works correctly only in a single-process deployment. For multi-
worker deployments (gunicorn --workers N) you would need an external signal
bus such as Redis pub/sub.
"""

import asyncio
from typing import Dict, Tuple

# Maps request_id -> (event, approved_flag_holder)
# We use a list of one bool so we can mutate it from resolve_approval.
_pending: Dict[str, Tuple[asyncio.AbstractEventLoop, asyncio.Event, list]] = {}


def create_approval_event(request_id: str) -> asyncio.Event:
    """Register a new pending approval and return its asyncio.Event."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    event = asyncio.Event()
    _pending[request_id] = (loop, event, [None])  # None = undecided
    return event


def resolve_approval(request_id: str, approved: bool) -> bool:
    """
    Signal a waiting generator with the user's decision.

    Returns True if the request_id was found and signalled, False otherwise.
    """
    entry = _pending.get(request_id)
    if not entry:
        return False

    loop, event, decision = entry
    decision[0] = approved

    # Schedule the event.set() on the event loop that owns it
    if loop.is_running():
        loop.call_soon_threadsafe(event.set)
    else:
        event.set()
    return True


async def wait_for_approval(request_id: str, timeout: float = 120.0) -> bool:
    """
    Await the user's approval decision.

    Returns True if approved, False if rejected or timed out.
    Cleans up the entry from _pending regardless of outcome.
    """
    entry = _pending.get(request_id)
    if not entry:
        return False

    _, event, decision = entry
    try:
        await asyncio.wait_for(event.wait(), timeout=timeout)
        return bool(decision[0])
    except asyncio.TimeoutError:
        return False
    finally:
        _pending.pop(request_id, None)
