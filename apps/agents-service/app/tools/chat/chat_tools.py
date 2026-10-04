"""
Chat Tools
Tools for chat management: title setting and conversation summarization.
"""

import os
from typing import Any, Dict

from langchain_core.messages import HumanMessage
from langchain_core.tools import StructuredTool
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from configs import Config

# ============================================
# Input Schemas
# ============================================


class SetChatTitleInput(BaseModel):
    """Input for setting the chat title"""

    title: str = Field(
        ...,
        description=(
            "A concise, descriptive title (max 6 words) for this chat based on the user's request. "
            "Capitalize like a title, no trailing punctuation."
        ),
    )


class GenerateTitleInput(BaseModel):
    """Input for generating chat title via LLM (internal helper)"""

    user_message: str = Field(
        ..., description="The user's message to base the title on"
    )
    assistant_response: str = Field(
        "", description="Optional assistant response for context"
    )


class ConversationSummaryInput(BaseModel):
    """Input for summarizing conversation"""

    messages: str = Field(
        ..., description="JSON string of conversation messages to summarize"
    )


# ============================================
# Tool Functions
# ============================================


def set_chat_title_func(chat_id: str, title: str) -> Dict[str, Any]:
    """
    Persist a human-readable title for this chat in the database.
    The agent should call this on the first user turn when the chat
    title is still 'New Chat' or empty.
    """
    try:
        from agents_core.models import Chat, db

        chat = Chat.query.filter_by(id=chat_id).first()
        if not chat:
            return {"success": False, "error": "Chat not found"}

        title = title.strip().strip('"').strip("'")
        words = title.split()
        if len(words) > 6:
            title = " ".join(words[:6])

        chat.title = title
        db.session.commit()
        return {"success": True, "title": title}

    except Exception as e:
        return {"success": False, "error": str(e)}


def generate_chat_title_func(
    user_message: str, assistant_response: str = ""
) -> Dict[str, Any]:
    """
    Generate a concise title for a chat (used by the stream route as a fallback).
    """
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0.3,
            max_tokens=50,
            api_key=Config.GOOGLE_AI_API_KEY,
        )
        prompt = (
            "Generate a short, concise title (max 5 words) for a chat that starts with this message:\n\n"
            f"User: {user_message[:500]}\n"
            f"{'Assistant: ' + assistant_response[:200] if assistant_response else ''}\n\n"
            "Requirements:\n"
            "- Maximum 5 words\n"
            "- Be specific to the topic\n"
            "- No quotes or punctuation at the end\n"
            "- Capitalize like a title\n\n"
            "Title:"
        )
        response = llm.invoke([HumanMessage(content=prompt)])
        title = response.content.strip().strip('"').strip("'")
        words = title.split()
        if len(words) > 5:
            title = " ".join(words[:5])
        return {"success": True, "title": title}

    except Exception as e:
        return {"success": False, "error": str(e), "title": "New Chat"}


def summarize_conversation_func(messages: str) -> Dict[str, Any]:
    """Summarize a conversation for context."""
    try:
        import json

        msg_list = json.loads(messages)
        conv_text = "".join(
            f"{msg.get('role', 'user').capitalize()}: {msg.get('content', '')[:500]}\n\n"
            for msg in msg_list[-10:]
        )
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0.3,
            max_tokens=200,
            api_key=Config.GOOGLE_AI_API_KEY,
        )
        prompt = (
            "Summarize this conversation in 2-3 sentences, focusing on the main topic and key points:\n\n"
            f"{conv_text}\n\nSummary:"
        )
        response = llm.invoke([HumanMessage(content=prompt)])
        return {
            "success": True,
            "summary": response.content.strip(),
            "message_count": len(msg_list),
        }

    except json.JSONDecodeError:
        return {"success": False, "error": "Invalid messages JSON"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================
# Tool Factory Functions
# ============================================


def get_set_chat_title_tool(chat_id: str) -> StructuredTool:
    """
    Returns the set_chat_title tool bound to the current chat_id.
    The agent should call this ONCE on the first user turn to give the chat
    a meaningful title instead of 'New Chat'.
    """

    async def async_set_title(**kwargs):
        return set_chat_title_func(chat_id, **kwargs)

    return StructuredTool.from_function(
        func=lambda **kwargs: set_chat_title_func(chat_id, **kwargs),
        coroutine=async_set_title,
        name="set_chat_title",
        description=(
            "Set a concise, descriptive title for this chat. "
            "Call this ONCE at the start of the first user turn when the chat has no meaningful title yet. "
            "The title should reflect the user's main topic or goal."
        ),
        args_schema=SetChatTitleInput,
    )


def get_chat_title_tool() -> StructuredTool:
    """Get chat title generation tool (standalone, not bound to a chat)"""
    return StructuredTool.from_function(
        func=generate_chat_title_func,
        name="generate_chat_title",
        description="Generate a concise title for the current chat based on the conversation content.",
        args_schema=GenerateTitleInput,
    )


def get_conversation_summary_tool() -> StructuredTool:
    """Get conversation summary tool"""
    return StructuredTool.from_function(
        func=summarize_conversation_func,
        name="summarize_conversation",
        description="Create a brief summary of the conversation for context or handoff.",
        args_schema=ConversationSummaryInput,
    )
