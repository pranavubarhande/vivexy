"""
Streaming Business Logic
Extracts the SSE generator and agent orchestration from routes/chat.py.
"""

import asyncio
import json
import logging
import uuid
from typing import Any, Dict, Generator, List, Optional, Set, Tuple, Union

from agents_core.constants.stream_events import (
    STREAM_EVENT_APPROVAL_REQUEST,
    STREAM_EVENT_ARTIFACT,
    STREAM_EVENT_CHART,
    STREAM_EVENT_CLIENT_TOOL_REQUEST,
    STREAM_EVENT_COMPACT,
    STREAM_EVENT_CONTENT,
    STREAM_EVENT_DONE,
    STREAM_EVENT_ERROR,
    STREAM_EVENT_REASONING,
    STREAM_EVENT_START,
    STREAM_EVENT_TOOL_CALL,
    STREAM_EVENT_USAGE,
)
from agents_core.models.chat import Message as DBMessage
from agents_core.models.llm import LLMModel
from agents_core.models.token_usage import TokenUsage
from dotenv import load_dotenv
from langgraph.types import Command, Overwrite

from agents_core.agents.agent_factory import create_agent
from agents_core.agents.approval_store import create_approval_event, wait_for_approval
from agents_core.agents.client_tool_store import create_client_tool_event, wait_for_client_tool
from agents_core.agents.config import FileContext
from agents_core.business_logic.api_keys import get_decrypted_api_keys
from agents_core.business_logic.artifacts import link_artifacts_to_message
from agents_core.business_logic.chat import create_message
from agents_core.business_logic.compact import (
    compact_chat,
    estimate_token_count,
    get_compacted_messages,
    should_auto_compact,
)

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
    user_skills: Optional[List[Dict[str, Any]]] = None,
    mcp_tools: Optional[List[Dict[str, Any]]] = None,
    github_context: Optional[Dict[str, Any]] = None,
    image_contexts: Optional[List[Dict[str, Any]]] = None,
) -> Generator[str, None, None]:
    """
    Generator that drives the agent and yields SSE-formatted strings.
    """
    app_context.push()
    try:
        yield _sse({"type": STREAM_EVENT_START})

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        user_api_keys = {}
        try:
            user_api_keys = get_decrypted_api_keys(user_id) if user_id else {}
        except Exception:
            pass

        agent = create_agent(
            agent_id="assistant",
            provider=model_provider,
            model_id=model_id,
            chat_id=chat_id,
            files=file_contexts,
            client_tools_enabled=client_tools_enabled,
            user_id=user_id,
            user_skills=user_skills or [],
            mcp_tools=mcp_tools or [],
            user_api_keys=user_api_keys,
            github_context=github_context,
        )

        full_content = ""
        reasoning_steps: List[Dict] = []
        tool_call_count = 0
        CHECKPOINT_INTERVAL = 5
        total_usage: Dict[str, int] = {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
        }
        usage_payload: Optional[Dict[str, Any]] = None
        assistant_message: Dict[str, Any] = {}

        # 0. Auto-compaction check
        try:
            context_window = None
            if model_db_id:
                model_record = LLMModel.query.filter_by(id=model_db_id).first()
                if model_record:
                    context_window = model_record.context_window

            all_db_msgs = (
                DBMessage.query.filter_by(chat_id=chat_id)
                .order_by(DBMessage.created_at.asc())
                .all()
            )
            formatted_for_check = [
                {
                    "role": (
                        m.role.value.lower()
                        if hasattr(m.role, "value")
                        else str(m.role).lower()
                    ),
                    "content": m.content,
                }
                for m in all_db_msgs
                if (
                    m.role.value.lower()
                    if hasattr(m.role, "value")
                    else str(m.role).lower()
                )
                in ["user", "assistant"]
            ]

            if should_auto_compact(formatted_for_check, context_window):
                user_api_keys = get_decrypted_api_keys(user_id) if user_id else {}
                compact_result = compact_chat(
                    chat_id,
                    user_id,
                    model_provider,
                    model_id,
                    user_api_keys=user_api_keys,
                )
                yield _sse(
                    {
                        "type": STREAM_EVENT_COMPACT,
                        "data": {
                            "message": "Context compacted — conversation summarized to free up context window",
                            "compactedCount": compact_result["compacted_count"],
                        },
                    }
                )
                logger.info(
                    "Auto-compacted chat %s (%d messages)",
                    chat_id,
                    compact_result["compacted_count"],
                )
        except Exception as e:
            logger.warning("Auto-compaction check failed for chat %s: %s", chat_id, e)

        # 1. Prepare history and state (Amnesia Fix)
        inputs, config, seen_message_ids = _get_history_context(
            agent, chat_id, messages
        )

        # 1b. Inject image parts into the last user message for vision-capable models.
        # We patch the message in `inputs` (the in-memory graph state), not in the DB,
        # so the base64 payload never bloats the message history.
        if image_contexts:
            msgs = list(inputs.get("messages", []))
            if msgs:
                last = dict(msgs[-1])
                text = last.get("content", "")
                last["content"] = [
                    {"type": "text", "text": text if isinstance(text, str) else ""}
                ] + image_contexts
                inputs = {**inputs, "messages": [*msgs[:-1], last]}

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
                            if message_type == "ai":
                                if message_content:
                                    content_str = _extract_text(message_content)
                                    if content_str:
                                        full_content += content_str
                                        yield _sse(
                                            {
                                                "type": STREAM_EVENT_CONTENT,
                                                "data": content_str,
                                            }
                                        )
                                # Accumulate token usage from ALL AI messages (including
                                # tool-calling messages that have no text content).
                                _accumulate_usage(message, total_usage)

                            elif message_type == "tool":
                                yield from _handle_tool_outcome(
                                    message, reasoning_steps
                                )

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
                                    tool_call_count += 1
                                    if tool_call_count % CHECKPOINT_INTERVAL == 0:
                                        try:
                                            with app_context:
                                                from agents_core.business_logic.chat import (
                                                    create_auto_checkpoint,
                                                )

                                                saved_msg_id = (
                                                    saved_user_message.get("id")
                                                    if isinstance(
                                                        saved_user_message, dict
                                                    )
                                                    else None
                                                )
                                                if saved_msg_id:
                                                    create_auto_checkpoint(
                                                        chat_id, user_id, saved_msg_id
                                                    )
                                        except Exception:
                                            pass

                    if interrupt_data:
                        break

                if not interrupt_data:
                    break

                # 4. Handle interruptions — client tool delegation OR approval
                interrupt_type = (
                    interrupt_data.get("type")
                    if isinstance(interrupt_data, dict)
                    else None
                )

                if interrupt_type == "client_tool_request":
                    # ── Delegate to desktop client via SSE and wait for result ──
                    request_id = interrupt_data.get("request_id", str(uuid.uuid4()))
                    tool_name = interrupt_data.get("tool_name", "unknown_tool")
                    tool_input = interrupt_data.get("tool_input", {})

                    yield _sse(
                        {
                            "type": STREAM_EVENT_CLIENT_TOOL_REQUEST,
                            "data": {
                                "request_id": request_id,
                                "tool_name": tool_name,
                                "tool_input": tool_input,
                            },
                        }
                    )

                    create_client_tool_event(request_id)
                    # Form questions need extra time for the user to fill them out
                    wait_timeout = 300.0 if tool_name == "form_question" else 60.0
                    tool_result = loop.run_until_complete(
                        wait_for_client_tool(request_id, timeout=wait_timeout)
                    )
                    inputs = Command(
                        resume=tool_result
                        or json.dumps({"error": "Tool execution timed out"})
                    )

                else:
                    # ── Approval / HITL interrupt (existing flow) ──
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

            # Persist token usage and compute cost
            usage_payload = _save_token_usage(
                user_id=user_id,
                message_id=assistant_message["id"],
                model_db_id=model_db_id,
                model_provider=model_provider,
                usage=total_usage,
            )

        if usage_payload and (usage_payload["totalTokens"] > 0):
            yield _sse({"type": STREAM_EVENT_USAGE, "data": usage_payload})

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
        # GraphRecursionError: agent hit the LangGraph step counter.
        # Save whatever was generated and surface a soft continue-prompt rather than
        # destroying the response — the user can just send a follow-up to resume.
        is_recursion = (
            "GraphRecursionError" in type(e).__name__
            or "recursion limit" in str(e).lower()
        )
        if is_recursion and full_content:
            logger.warning(
                "Agent hit recursion limit for chat %s — soft stopping", chat_id
            )
            full_content += "\n\n---\n*Paused after a long task sequence. Send a follow-up message to continue where I left off.*"
        elif is_recursion:
            logger.warning(
                "Agent hit recursion limit for chat %s with no output", chat_id
            )
            full_content = "*Paused after a long task sequence. Send a follow-up message to continue.*"
        else:
            logger.exception("Streaming error")
            message, code = _friendly_error(e)
            error_data: Dict[str, Any] = {"message": message}
            if code:
                error_data["code"] = code
            yield _sse({"type": STREAM_EVENT_ERROR, "data": error_data})
    finally:
        yield "data: [DONE]\n\n"
        app_context.pop()


def _friendly_error(exc: Exception) -> Tuple[str, Optional[str]]:
    """Returns (message, code). code is set when the chat UI should offer a
    fix-it action (e.g. a button to Settings → API Keys) instead of just
    displaying the text."""
    raw = str(exc)
    exc_type = type(exc).__name__
    lower = raw.lower()

    if "GraphRecursionError" in exc_type or "Recursion limit" in raw:
        return (
            "The agent reached its maximum step limit for this task. "
            "The work completed so far is saved. You can continue by sending a follow-up message.",
            None,
        )
    if "does not support tools" in raw:
        model = raw.split("/")[-1].split(" ")[0] if "/" in raw else "This model"
        return (
            f"Model '{model}' does not support tool calling. Please choose a model that supports tools (e.g. llama3.1:8b, mistral:7b).",
            None,
        )
    if "model" in lower and "not found" in lower:
        return (
            f"Model not found in Ollama. Run `ollama pull <model>` to download it first. ({raw})",
            None,
        )
    if "api key" in lower or "authentication" in lower or "unauthorized" in lower:
        return (
            "Invalid or missing API key for this provider. Add your own key in Settings → API Keys.",
            "api_key",
        )
    if "quota" in lower or "insufficient" in lower or "credit balance" in lower:
        return (
            "This model is out of usage on the shared key. Add your own API key in Settings → API Keys to keep going.",
            "usage_limit",
        )
    if "rate limit" in lower or "429" in raw:
        return (
            "Rate limit exceeded for this model. Please wait a moment and try again.",
            None,
        )
    if "context length" in lower or "maximum context" in lower:
        return (
            "The conversation is too long for this model's context window. Start a new chat.",
            None,
        )
    return (raw, None)


def _get_history_context(
    agent: Any, chat_id: str, messages: List[Dict]
) -> Tuple[Dict, Dict, Set[str]]:
    """Detect checkpointer state and restore history from DB if empty (Amnesia Fix)."""
    # No hard recursion cap — let the agent run until it decides to stop.
    # LangGraph's default is 25; we use a very high value to avoid premature
    # termination on long multi-step tasks.
    config = {"configurable": {"thread_id": chat_id}, "recursion_limit": 1000}
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

        # Apply compaction if available
        formatted_messages = get_compacted_messages(chat_id, formatted_messages)

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


def _handle_tool_outcome(
    message: Any, reasoning_steps: List[Dict]
) -> Generator[str, None, None]:
    """Process artifact creations and broadcast statuses from tool messages."""
    content = getattr(message, "content", "")
    if not content:
        return

    try:
        # 1. Try to parse JSON — plain-text tool outputs (execute_code, list_sandbox_files)
        #    are not JSON; handle both so we never silently drop the event.
        data: Any = {}
        try:
            data = json.loads(content) if isinstance(content, str) else {}
        except (json.JSONDecodeError, ValueError):
            data = {}

        if isinstance(data, dict) and data.get("chart_spec"):
            yield _sse(
                {
                    "type": STREAM_EVENT_CHART,
                    "data": {
                        "title": data.get("title", "Chart"),
                        "spec": data["chart_spec"],
                    },
                }
            )

        elif isinstance(data, dict) and data.get("artifact_id"):
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

        # 3. Patch the matching reasoning step
        for step in reversed(reasoning_steps):
            tc_list = step.get("tool_calls", [])
            if (
                tc_list
                and tc_list[0].get("tool") == tool_name
                and not tc_list[0].get("output")
            ):
                tc_list[0]["output"] = status_text[:500]
                break
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


def _accumulate_usage(message: Any, total_usage: Dict[str, int]) -> None:
    """Extract token counts from an AIMessage and add them to the running total.

    Tries `usage_metadata` first (LangChain standard), then falls back to
    `response_metadata` where some providers (e.g. Gemini) also store usage.
    """
    # Standard LangChain attribute (present on most providers)
    usage_meta = getattr(message, "usage_metadata", None)
    if usage_meta and isinstance(usage_meta, dict) and any(usage_meta.values()):
        total_usage["input_tokens"] += usage_meta.get("input_tokens", 0)
        total_usage["output_tokens"] += usage_meta.get("output_tokens", 0)
        # Some providers omit total_tokens; compute it as a fallback
        total_usage["total_tokens"] += usage_meta.get("total_tokens", 0) or (
            usage_meta.get("input_tokens", 0) + usage_meta.get("output_tokens", 0)
        )
        return

    # Fallback: response_metadata (Gemini / older providers)
    resp_meta = getattr(message, "response_metadata", None) or {}
    token_meta = resp_meta.get("usage_metadata") or resp_meta.get("token_counts") or {}
    if token_meta and isinstance(token_meta, dict):
        # Gemini keys: prompt_token_count, candidates_token_count, total_token_count
        inp = (
            token_meta.get("input_tokens") or token_meta.get("prompt_token_count") or 0
        )
        out = (
            token_meta.get("output_tokens")
            or token_meta.get("candidates_token_count")
            or 0
        )
        tot = (
            token_meta.get("total_tokens")
            or token_meta.get("total_token_count")
            or (inp + out)
        )
        total_usage["input_tokens"] += inp
        total_usage["output_tokens"] += out
        total_usage["total_tokens"] += tot


def _save_token_usage(
    *,
    user_id: str,
    message_id: str,
    model_db_id: Optional[str],
    model_provider: str,
    usage: Dict[str, int],
) -> Optional[Dict[str, Any]]:
    """Persist token counts + computed cost. Returns a dict for the SSE payload."""
    try:
        from agents_core.models.base import db as _db

        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
        total_tokens = usage.get("total_tokens", 0) or (input_tokens + output_tokens)

        model_name = None
        input_cost_usd = 0.0
        output_cost_usd = 0.0

        if model_db_id:
            model_record = LLMModel.query.filter_by(id=model_db_id).first()
            if model_record:
                model_name = model_record.name
                if model_record.input_cost:
                    input_cost_usd = (
                        input_tokens / 1_000_000
                    ) * model_record.input_cost
                if model_record.output_cost:
                    output_cost_usd = (
                        output_tokens / 1_000_000
                    ) * model_record.output_cost

        total_cost_usd = input_cost_usd + output_cost_usd

        record = TokenUsage(
            user_id=user_id,
            message_id=message_id,
            model_id=model_db_id,
            model_name=model_name,
            provider=model_provider,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            input_cost_usd=input_cost_usd,
            output_cost_usd=output_cost_usd,
            total_cost_usd=total_cost_usd,
        )
        _db.session.add(record)
        _db.session.commit()

        return {
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "totalTokens": total_tokens,
            "inputCostUsd": round(input_cost_usd, 6),
            "outputCostUsd": round(output_cost_usd, 6),
            "totalCostUsd": round(total_cost_usd, 6),
            "modelName": model_name,
            "provider": model_provider,
        }
    except Exception as e:
        logger.warning("Failed to save token usage: %s", e)
        return None


def _sse(data: Dict[str, Any]) -> str:
    """Formats a dictionary as a Server-Sent Events (SSE) string."""
    return f"data: {json.dumps(data)}\n\n"


class NoopAppContext:
    """
    Stand-in for a Flask app context when the caller is already running
    inside one it doesn't want ``run_agent_stream`` to pop (e.g. a worker
    process that pushes a single app context once at startup). Passing a
    real ``app.app_context()`` here would push a second scoped DB session
    and detach any ORM objects loaded under the outer context.
    """

    def push(self):
        pass

    def pop(self, exc=None):
        pass


def run_agent_stream_to_redis(*, stream_id: str, r, stream_key: str, **kwargs) -> None:
    """Thread target: runs agent stream and publishes each event to a Redis stream."""
    try:
        for sse_string in run_agent_stream(**kwargs):
            for line in sse_string.split("\n"):
                if line.startswith("data:"):
                    payload = line[5:].strip()
                    if payload and payload != "[DONE]":
                        r.xadd(stream_key, {"payload": payload})
                    break
    except Exception as e:
        logger.exception("run_agent_stream_to_redis error for stream %s", stream_id)
        r.xadd(stream_key, {"payload": json.dumps({"type": "error", "data": str(e)})})
    finally:
        r.xadd(stream_key, {"payload": "__done__"})
        r.expire(stream_key, 30)
