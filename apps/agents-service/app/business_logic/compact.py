"""
Chat compaction logic — Claude Code-style context summarization.
Summarizes older messages into a compact summary when the context window
is nearing its limit, or when manually triggered via /compact.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage

from app.agents.agent_factory import global_checkpointer
from app.agents.config import AgentConfig
from app.agents.llm_factory import create_llm
from app.models import Chat, LLMModel, Message, db

logger = logging.getLogger(__name__)

COMPACT_THRESHOLD = 0.80  # trigger at 80% of context window
MIN_MESSAGES_TO_COMPACT = 6  # don't compact tiny conversations
CHARS_PER_TOKEN = 4  # rough heuristic

COMPACT_SYSTEM_PROMPT = """You are a conversation summarizer. Your task is to create a concise but comprehensive summary of the conversation so far.

The summary should capture:
- Key topics discussed and conclusions reached
- Important decisions made
- Current state of any ongoing tasks
- Pending items or next steps
- Any critical context the assistant needs to continue the conversation

Be concise but don't lose important details. Write in third person (e.g., "The user asked about...", "The assistant created...").
Do NOT include pleasantries, greetings, or filler. Focus on actionable information."""

COMPACT_FOCUS_ADDENDUM = """
Additionally, pay special attention to and prioritize information related to: {focus}"""


def estimate_token_count(messages: List[Dict[str, Any]]) -> int:
    """Estimate token count from messages using a character-based heuristic."""
    total_chars = 0
    for msg in messages:
        content = msg.get("content", "")
        total_chars += len(content)
        reasoning = msg.get("reasoning", [])
        if reasoning:
            for step in reasoning:
                if isinstance(step, dict):
                    total_chars += len(step.get("thought", ""))
    return total_chars // CHARS_PER_TOKEN


def should_auto_compact(
    messages: List[Dict[str, Any]], context_window: Optional[int]
) -> bool:
    """Check if auto-compaction should be triggered."""
    if not context_window or context_window <= 0:
        return False
    if len(messages) < MIN_MESSAGES_TO_COMPACT:
        return False
    estimated_tokens = estimate_token_count(messages)
    threshold = int(context_window * COMPACT_THRESHOLD)
    return estimated_tokens >= threshold


def _build_summary_prompt(
    messages: List[Dict[str, Any]], focus: Optional[str] = None
) -> str:
    """Build the conversation text to be summarized."""
    conversation_parts = []
    for msg in messages:
        role = msg.get("role", "unknown").capitalize()
        content = msg.get("content", "")
        if content.strip():
            conversation_parts.append(f"**{role}**: {content}")

    prompt = COMPACT_SYSTEM_PROMPT
    if focus:
        prompt += COMPACT_FOCUS_ADDENDUM.format(focus=focus)

    conversation_text = "\n\n".join(conversation_parts)
    return (
        f"{prompt}\n\n"
        f"---\n\n"
        f"CONVERSATION TO SUMMARIZE ({len(messages)} messages):\n\n"
        f"{conversation_text}\n\n"
        f"---\n\n"
        f"Provide a concise summary:"
    )


def generate_compact_summary(
    messages: List[Dict[str, Any]],
    provider: str,
    model_id: str,
    user_api_keys: Optional[Dict[str, str]] = None,
    focus: Optional[str] = None,
) -> str:
    """Use the LLM to generate a compact summary of the conversation."""

    config = AgentConfig.from_env(
        provider=provider, model=model_id, user_api_keys=user_api_keys
    )
    llm = create_llm(config)

    summary_prompt = _build_summary_prompt(messages, focus)
    response = llm.invoke([HumanMessage(content=summary_prompt)])
    content = response.content if hasattr(response, "content") else str(response)
    if isinstance(content, list):
        text_parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                text_parts.append(block.get("text", ""))
            elif isinstance(block, str):
                text_parts.append(block)
        return "".join(text_parts)
    return str(content)


def compact_chat(
    chat_id: str,
    user_id: str,
    provider: str,
    model_id: str,
    user_api_keys: Optional[Dict[str, str]] = None,
    focus: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Compact a chat's context by summarizing older messages.

    Returns dict with 'summary' and 'compacted_count'.
    """
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    db_messages = (
        Message.query.filter_by(chat_id=chat_id)
        .order_by(Message.created_at.asc())
        .all()
    )

    if len(db_messages) < MIN_MESSAGES_TO_COMPACT:
        raise ValueError(
            f"Not enough messages to compact (need at least {MIN_MESSAGES_TO_COMPACT})"
        )

    formatted = []
    for msg in db_messages:
        role = (
            msg.role.value.lower()
            if hasattr(msg.role, "value")
            else str(msg.role).lower()
        )
        if role in ["user", "assistant"]:
            formatted.append({"role": role, "content": msg.content})

    summary = generate_compact_summary(
        formatted, provider, model_id, user_api_keys, focus
    )

    chat.compact_summary = summary
    chat.compact_message_count = len(db_messages)
    chat.updated_at = datetime.utcnow()
    db.session.commit()

    # Reset checkpointer state for this thread so the next invocation
    # starts with the compact summary instead of full history
    _reset_checkpointer_state(chat_id, summary)

    logger.info(
        "Compacted chat %s: %d messages -> summary (%d chars)",
        chat_id,
        len(db_messages),
        len(summary),
    )

    return {
        "summary": summary,
        "compacted_count": len(db_messages),
    }


def _reset_checkpointer_state(chat_id: str, summary: str):
    """Clear the in-memory checkpointer state for a chat thread.

    On the next agent invocation, _get_history_context will detect that
    there is no checkpointer state and rebuild from DB — at which point
    the compact_summary will be used instead of raw message history.
    """
    try:
        config = {"configurable": {"thread_id": chat_id}}
        # MemorySaver stores state keyed by thread_id in its internal dict
        if hasattr(global_checkpointer, "storage"):
            global_checkpointer.storage.pop(chat_id, None)
        elif hasattr(global_checkpointer, "store"):
            global_checkpointer.store.pop(chat_id, None)
    except Exception as e:
        logger.warning("Could not reset checkpointer state for %s: %s", chat_id, e)


def get_compacted_messages(
    chat_id: str, messages: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    If the chat has been compacted, return the compact summary as a system
    message followed by only the messages created after the compaction point.
    Otherwise, return messages unchanged.
    """
    chat = Chat.query.filter_by(id=chat_id).first()
    if not chat or not chat.compact_summary:
        return messages

    compact_count = chat.compact_message_count or 0

    # Messages after the compaction point
    recent_messages = messages[compact_count:] if compact_count < len(messages) else []

    # Always include at least the last few messages for continuity
    if not recent_messages and messages:
        recent_messages = messages[-2:]

    summary_message = {
        "role": "system",
        "content": (
            f"[Conversation Summary — the following is a summary of the "
            f"previous {compact_count} messages in this conversation]\n\n"
            f"{chat.compact_summary}"
        ),
    }

    return [summary_message] + recent_messages
