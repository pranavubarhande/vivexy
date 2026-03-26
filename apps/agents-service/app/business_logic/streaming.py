"""
Streaming Business Logic
Extracts the SSE generator and agent orchestration from routes/chat.py.
"""

import asyncio
import json
import logging
import uuid
from typing import Any, Dict, Generator, List, Optional, Set, Tuple, Union

from dotenv import load_dotenv
from langgraph.types import Command, Overwrite

from app.agents.agent_factory import create_agent
from app.agents.approval_store import create_approval_event, wait_for_approval
from app.agents.config import FileContext
from app.business_logic.artifacts import link_artifacts_to_message
from app.business_logic.chat import create_message
from app.constants.stream_events import (
    STREAM_EVENT_APPROVAL_REQUEST,
    STREAM_EVENT_ARTIFACT,
    STREAM_EVENT_CONTENT,
    STREAM_EVENT_DONE,
    STREAM_EVENT_ERROR,
    STREAM_EVENT_REASONING,
    STREAM_EVENT_START,
    STREAM_EVENT_TOOL_CALL,
)
from app.models.chat import Message as DBMessage

load_dotenv()
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
    """
    app_context.push()
    try:
        yield _sse({"type": STREAM_EVENT_START})

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        agent = create_agent(
            agent_id="assistant",
            provider=model_provider,
            model_id=model_id,
            chat_id=chat_id,
            files=file_contexts,
            client_tools_enabled=client_tools_enabled,
            user_id=user_id,
        )

        full_content = ""
        reasoning_steps: List[Dict] = []

        # 1. Prepare history and state (Amnesia Fix)
        inputs, config, seen_message_ids = _get_history_context(
            agent, chat_id, messages
        )

        try:
            while True:
                interrupt_data = None

                # 2. Main agent execution loop
                for chunk in agent.stream(inputs, config=config, stream_mode="updates"):
                    for node, delta in chunk.items():
                        if node == "__interrupt__":
                            interrupt_data = delta[0].value
                            break

                        # 3. Process every message update (Deduplication Fix)
                        for message in _iter_messages(delta):
                            message_id = getattr(message, "id", None)
                            if message_id and message_id in seen_message_ids:
                                continue
                            if message_id:
                                seen_message_ids.add(message_id)

                            message_type = getattr(message, "type", "")
                            message_content = getattr(message, "content", "")

                            # Handle different message types specifically
                            if message_type == "ai" and message_content:
                                content_str = _extract_text(message_content)
                                if content_str:
                                    full_content += content_str
                                    yield _sse(
                                        {
                                            "type": STREAM_EVENT_CONTENT,
                                            "data": content_str,
                                        }
                                    )

                            elif message_type == "tool":
                                yield from _handle_tool_outcome(message)

                            # Reasoning / Tool Calls
                            if getattr(message, "tool_calls", None):
                                for tool_call in message.tool_calls:
                                    tool_name = tool_call.get("name", "")
                                    tool_args = tool_call.get("args", {})
                                    reasoning = {
                                        "thought": f"Using tool: {tool_name}",
                                        "tool_calls": [
                                            {"tool": tool_name, "input": tool_args}
                                        ],
                                    }
                                    reasoning_steps.append(reasoning)
                                    yield _sse(
                                        {
                                            "type": STREAM_EVENT_REASONING,
                                            "data": reasoning,
                                        }
                                    )

                    if interrupt_data:
                        break

                if not interrupt_data:
                    break

                # 4. Handle Human-in-the-loop (Interruptions)
                actions = interrupt_data.get("action_requests", [])
                if not actions:
                    break

                request_id = str(uuid.uuid4())
                yield _sse(
                    {
                        "type": STREAM_EVENT_APPROVAL_REQUEST,
                        "requires_approval": True,
                        "data": {
                            "request_id": request_id,
                            "tool_name": actions[0]["name"],
                            "tool_input": actions[0]["args"],
                            "description": f"{actions[0]['name']}: {json.dumps(actions[0]['args'])[:150]}",
                        },
                    }
                )

                create_approval_event(request_id)
                approved = loop.run_until_complete(
                    wait_for_approval(request_id, timeout=120.0)
                )
                inputs = Command(
                    resume=[{"type": "approve"} if approved else {"type": "reject"}]
                )

        finally:
            loop.close()
            _cleanup_sandbox(agent)

            # Persist and wrap up
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
                logger.warning("link_artifacts_to_message failure: %s", e)

        yield _sse(
            {
                "type": STREAM_EVENT_DONE,
                "messageId": assistant_message["id"],
                "userMessageId": (
                    saved_user_message.get("id") if saved_user_message else None
                ),
                "data": {"refetch": ["artifacts"]},
            }
        )

    except Exception as e:
        logger.exception("Streaming error")
        yield _sse({"type": STREAM_EVENT_ERROR, "data": {"message": str(e)}})
    finally:
        yield "data: [DONE]\n\n"
        app_context.pop()


def _get_history_context(
    agent: Any, chat_id: str, messages: List[Dict]
) -> Tuple[Dict, Dict, Set[str]]:
    """Detect checkpointer state and restore history from DB if empty (Amnesia Fix)."""
    config = {"configurable": {"thread_id": chat_id}}
    state_messages = []
    has_history = False

    try:
        state = agent.get_state(config)
        state_messages = (
            state.values.get("messages", []) if state and state.values else []
        )
        if len(state_messages) > 1 or (
            len(state_messages) == 1
            and getattr(state_messages[0], "type", "") != "system"
        ):
            has_history = True
    except Exception as e:
        logger.warning("State check failed for chat %s: %s", chat_id, e)

    seen_message_ids = set()
    if not has_history:
        db_messages = (
            DBMessage.query.filter_by(chat_id=chat_id)
            .order_by(DBMessage.created_at.asc())
            .all()
        )
        formatted_messages = []
        for db_msg in db_messages:
            message_id = str(db_msg.id)
            message_role = (
                db_msg.role.value.lower()
                if hasattr(db_msg.role, "value")
                else str(db_msg.role).lower()
            )
            if message_role in ["user", "assistant"]:
                formatted_messages.append(
                    {"role": message_role, "content": db_msg.content, "id": message_id}
                )
                seen_message_ids.add(message_id)

        # Add newest user message if missing
        if not any(m["role"] == "user" for m in formatted_messages) and messages:
            last_user_message = next(
                (m for m in reversed(messages) if m["role"] == "user"), None
            )
            if last_user_message:
                user_message_id = last_user_message.get("id") or str(uuid.uuid4())
                formatted_messages.append(
                    {
                        "role": "user",
                        "content": last_user_message["content"],
                        "id": user_message_id,
                    }
                )
                seen_message_ids.add(user_message_id)

        return {"messages": formatted_messages}, config, seen_message_ids

    # Existing history in memory
    last_user_message = next(
        (m for m in reversed(messages) if m["role"] == "user"), None
    )
    user_message_id = (
        last_user_message.get("id") if last_user_message else str(uuid.uuid4())
    )
    seen_message_ids.add(user_message_id)
    for state_msg in state_messages:
        if hasattr(state_msg, "id"):
            seen_message_ids.add(state_msg.id)

    return (
        {
            "messages": [
                {
                    "role": "user",
                    "content": (
                        last_user_message["content"] if last_user_message else ""
                    ),
                    "id": user_message_id,
                }
            ]
        },
        config,
        seen_message_ids,
    )


def _iter_messages(delta: Any) -> Generator[Any, None, None]:
    """Gracefully extracts messages from LangGraph updates (list or Overwrite)."""
    if not isinstance(delta, dict):
        return
    raw_payload = delta.get("messages")
    if raw_payload is None:
        return
    if isinstance(raw_payload, Overwrite):
        raw_payload = raw_payload.value
    if isinstance(raw_payload, (list, tuple)):
        yield from raw_payload
    else:
        yield raw_payload


def _extract_text(content: Any) -> str:
    """Flatten tool/multimodal content parts into a simple string."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            [
                (
                    part
                    if isinstance(part, str)
                    else (part.get("text", "") if isinstance(part, dict) else "")
                )
                for part in content
            ]
        )
    return ""


def _handle_tool_outcome(message: Any) -> Generator[str, None, None]:
    """Process artifact creations and broadcast statuses from tool messages."""
    content = getattr(message, "content", "")
    if not content:
        return

    try:
        # 1. Check for artifact creation in JSON
        data = json.loads(content) if isinstance(content, str) else {}
        if isinstance(data, dict) and data.get("artifact_id"):
            yield _sse(
                {
                    "type": STREAM_EVENT_ARTIFACT,
                    "data": {
                        "id": data["artifact_id"],
                        "chatId": data.get("chat_id"),
                        "title": data.get("filename")
                        or data.get("title")
                        or "Artifact",
                        "filename": data.get("filename"),
                        "type": data.get("type"),
                        "content": data.get("content", ""),
                        "seq": data.get("seq", 1),
                        "version": data.get("version", 1),
                        "url": data.get("url"),
                        "metadata": data.get(
                            "artifact_metadata", data.get("metadata", {})
                        ),
                    },
                }
            )

        # 2. Broadcast generic status for any tool call
        tool_name = getattr(message, "name", "tool")
        status_text = (
            data.get("message", str(content))
            if isinstance(data, dict)
            else str(content)
        )
        yield _sse(
            {
                "type": STREAM_EVENT_TOOL_CALL,
                "data": {"tool": tool_name, "input": {}, "output": status_text[:500]},
            }
        )
    except Exception:
        pass


def _cleanup_sandbox(agent: Any):
    """Safely stop the Daytona sandbox if it exists on the agent."""
    sandbox = getattr(agent, "_agent__sandbox", None) or getattr(
        agent, "__sandbox", None
    )
    if sandbox:
        try:
            sandbox.stop()
        except Exception:
            pass


def _sse(data: Dict[str, Any]) -> str:
    """Formats a dictionary as a Server-Sent Events (SSE) string."""
    return f"data: {json.dumps(data)}\n\n"
