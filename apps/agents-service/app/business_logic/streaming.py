"""
Streaming Business Logic
Extracts the SSE generator and agent orchestration from routes/chat.py.
Supports two modes:
  1. Direct mode — yields SSE frames directly (current behaviour).
  2. Redis mode  — publishes events to Redis; the route subscribes.
"""

import asyncio
import json
import logging
from typing import Any, Dict, Generator, List, Optional

from app.agents.agent_factory import create_langgraph_agent
from app.agents.config import DEFAULT_AGENT_ID, FileContext
from app.agents.event_emitter import StreamEvent
from app.business_logic.artifacts import link_artifacts_to_message
from app.business_logic.chat import create_message, update_chat
from app.constants.stream_events import (
    STREAM_EVENT_APPROVAL_REQUEST,
    STREAM_EVENT_ARTIFACT,
    STREAM_EVENT_CONTENT,
    STREAM_EVENT_DONE,
    STREAM_EVENT_ERROR,
    STREAM_EVENT_REASONING,
    STREAM_EVENT_START,
)
from configs import USE_REDIS_STREAM

logger = logging.getLogger(__name__)


def run_agent_stream(
    *,
    chat_id: str,
    user_id: str,
    messages: List[Dict[str, Any]],
    model_id: Optional[str],
    model_db_id: Optional[str],
    model_provider: str,
    file_contexts: List[FileContext],
    client_tools_enabled: bool,
    saved_user_message: Dict[str, Any],
    app_context,
) -> Generator[str, None, None]:
    """
    Generator that drives the agent and yields SSE-formatted strings.

    This is the extracted ``generate()`` from ``routes/chat.py``.
    The route simply wraps this in a ``Response(mimetype="text/event-stream")``.
    """
    app_context.push()
    try:
        yield _sse({"type": STREAM_EVENT_START})

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

                event_dict: Dict[str, Any] = {"type": event.type, "data": event.data}

                if event.type == STREAM_EVENT_CONTENT:
                    full_content += event.data if isinstance(event.data, str) else ""
                elif event.type == STREAM_EVENT_REASONING:
                    reasoning_steps.append(event.data)
                elif event.type == STREAM_EVENT_APPROVAL_REQUEST:
                    event_dict["requires_approval"] = True
                elif event.type == STREAM_EVENT_ARTIFACT and client_tools_enabled:
                    _save_client_artifact(chat_id, event.data)

                if getattr(event, "message_id", None):
                    event_dict["messageId"] = event.message_id

                yield _sse(event_dict)

        finally:
            loop.close()
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

        done_event = {
            "type": STREAM_EVENT_DONE,
            "messageId": assistant_message["id"],
            "userMessageId": (
                saved_user_message.get("id") if saved_user_message else None
            ),
            "data": {
                **(agent_done_data or {}),
                "refetch": ["artifacts"],
            },
        }
        yield _sse(done_event)

    except Exception as e:
        logger.exception("Streaming error")
        yield _sse({"type": STREAM_EVENT_ERROR, "data": {"message": str(e)}})
    finally:
        yield "data: [DONE]\n\n"
        app_context.pop()


def _sse(data: Dict[str, Any]) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _save_client_artifact(chat_id: str, data: Dict[str, Any]) -> None:
    """Save a DB record of a locally-created artifact so it links to the message."""
    try:
        from app.models import Artifact, db
        from app.models.enums import ArtifactType

        title = data.get("title")
        if not title:
            return

        existing = (
            Artifact.query.filter_by(chat_id=chat_id, title=title)
            .order_by(Artifact.version.desc())
            .first()
        )
        version = existing.version + 1 if existing else 1
        next_seq = Artifact.query.filter_by(chat_id=chat_id).count() + 1

        artifact = Artifact(
            chat_id=chat_id,
            title=title,
            type=ArtifactType(data.get("type", "MD")),
            filename=data.get("filename"),
            version=version,
            seq=next_seq,
            content=data.get("content", ""),
            artifact_metadata=data.get("metadata", {}),
        )
        db.session.add(artifact)
        db.session.commit()
    except Exception as e:
        logger.error("Failed to save local artifact to DB: %s", e)
