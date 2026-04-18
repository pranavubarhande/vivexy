"""
Agent Runner
Executes a chat agent job and publishes stream events to Redis pub/sub.
Designed to run inside a RabbitMQ consumer worker process.
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional

from app.agents.agent_factory import create_langgraph_agent
from app.agents.config import DEFAULT_AGENT_ID, FileContext
from app.agents.event_emitter import StreamEvent, publish_stream_event
from app.business_logic.artifacts import link_artifacts_to_message
from app.business_logic.chat import create_message
from app.constants.stream_events import (
    STREAM_EVENT_CONTENT,
    STREAM_EVENT_DONE,
    STREAM_EVENT_ERROR,
    STREAM_EVENT_REASONING,
    STREAM_EVENT_REDIS_DONE,
    STREAM_EVENT_START,
)

logger = logging.getLogger(__name__)


def run_agent_job(
    *,
    chat_id: str,
    user_id: str,
    messages: List[Dict[str, Any]],
    model_id: Optional[str],
    model_db_id: Optional[str],
    model_provider: str,
    file_context_dicts: List[Dict[str, Any]],
    client_tools_enabled: bool,
    saved_user_message: Dict[str, Any],
) -> None:
    """
    Run the agent synchronously and publish each event to Redis.

    This is the worker-side counterpart to ``business_logic.streaming.run_agent_stream``.
    Instead of yielding SSE strings, it publishes to ``chat:stream:<chat_id>``.
    """
    file_contexts = (
        [FileContext(**fc) for fc in file_context_dicts] if file_context_dicts else []
    )

    agent = create_langgraph_agent(
        DEFAULT_AGENT_ID,
        model_provider,
        model_id,
        chat_id,
        client_tools_enabled=client_tools_enabled,
    )

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    full_content = ""
    reasoning_steps: List[Dict] = []
    agent_done_data: Optional[Dict] = None

    async def get_next(gen):
        try:
            return await gen.__anext__()
        except StopAsyncIteration:
            return None

    try:
        publish_stream_event(chat_id, StreamEvent(type=STREAM_EVENT_START, data={}))

        async_gen = agent.stream_simple(
            messages, file_contexts if file_contexts else None
        )

        while True:
            event = loop.run_until_complete(get_next(async_gen))
            if event is None:
                break

            if event.type == STREAM_EVENT_DONE:
                agent_done_data = event.data or {}
                continue

            if event.type == STREAM_EVENT_CONTENT:
                full_content += event.data if isinstance(event.data, str) else ""
            elif event.type == STREAM_EVENT_REASONING:
                reasoning_steps.append(event.data)

            publish_stream_event(chat_id, event)

    except Exception as e:
        logger.exception("Agent job error for chat %s", chat_id)
        publish_stream_event(
            chat_id,
            StreamEvent(type=STREAM_EVENT_ERROR, data={"message": str(e)}),
        )
    finally:
        loop.close()

    # Persist assistant message
    try:
        assistant_message = create_message(
            chat_id,
            {
                "role": "assistant",
                "content": full_content,
                "model_id": model_db_id,
                "reasoning": reasoning_steps,
            },
            user_id,
        )
        try:
            link_artifacts_to_message(chat_id, assistant_message["id"], user_id)
        except Exception as e:
            logger.warning("link_artifacts_to_message: %s", e)

        done_event = StreamEvent(
            type=STREAM_EVENT_DONE,
            data={
                **(agent_done_data or {}),
                "messageId": assistant_message["id"],
                "userMessageId": (
                    saved_user_message.get("id") if saved_user_message else None
                ),
                "refetch": ["artifacts"],
            },
        )
        publish_stream_event(chat_id, done_event)

    except Exception as e:
        logger.exception("Failed to persist assistant message for chat %s", chat_id)
        publish_stream_event(
            chat_id,
            StreamEvent(
                type=STREAM_EVENT_ERROR,
                data={"message": f"Failed to save response: {e}"},
            ),
        )

    # Terminal marker
    publish_stream_event(chat_id, StreamEvent(type=STREAM_EVENT_REDIS_DONE, data=None))
