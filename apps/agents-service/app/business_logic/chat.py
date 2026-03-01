from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import joinedload

from app.models import Chat, LLMModel, Message, db
from app.schemas import ChatCreate, ChatResponse, LLMModelResponse, MessageRole


def get_user_chats(user_id: str) -> List[Dict[str, Any]]:
    """Get all chats for a user."""
    chats = Chat.query.filter_by(user_id=user_id).order_by(Chat.updated_at.desc()).all()

    result = []
    for chat in chats:
        # Get first message for preview
        first_message = (
            Message.query.filter_by(chat_id=chat.id)
            .order_by(Message.created_at.asc())
            .first()
        )

        chat_data = {
            "id": chat.id,
            "userId": chat.user_id,
            "title": chat.title,
            "agentId": chat.agent_id,
            "lastModelId": chat.last_model_id,
            "createdAt": chat.created_at.isoformat(),
            "updatedAt": chat.updated_at.isoformat(),
            "messages": [first_message.to_dict()] if first_message else [],
        }
        result.append(chat_data)

    return result


def get_user_chat(chat_id: str, user_id: str) -> Dict[str, Any]:
    """Get a specific chat with messages."""
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    messages = (
        Message.query.filter_by(chat_id=chat_id)
        .options(joinedload(Message.artifacts))
        .order_by(Message.created_at.asc())
        .all()
    )

    return {
        "id": chat.id,
        "userId": chat.user_id,
        "title": chat.title,
        "agentId": chat.agent_id,
        "lastModelId": chat.last_model_id,
        "createdAt": chat.created_at.isoformat(),
        "updatedAt": chat.updated_at.isoformat(),
        "messages": [msg.to_dict() for msg in messages],
    }


def create_chat(data: ChatCreate, user_id: str) -> ChatResponse:
    """Create a new chat."""
    chat = Chat(user_id=user_id, title=data.title or "New Chat", agent_id=data.agent_id)
    db.session.add(chat)
    db.session.commit()
    return ChatResponse.from_orm(chat)


def update_chat_title(chat_id: str, title: str, user_id: str) -> ChatResponse:
    """Update chat title."""
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    chat.title = title
    chat.updated_at = datetime.utcnow()
    db.session.commit()
    return ChatResponse.from_orm(chat)


def update_chat(
    chat_id: str, updates: Dict[str, Any], user_id: str = None
) -> ChatResponse:
    """Update chat fields."""
    query = Chat.query.filter_by(id=chat_id)
    if user_id:
        query = query.filter_by(user_id=user_id)

    chat = query.first()
    if not chat:
        raise ValueError("Chat not found")

    # Update fields
    if "title" in updates:
        chat.title = updates["title"]
    if "agent_id" in updates:
        chat.agent_id = updates["agent_id"]
    if "last_model_id" in updates:
        chat.last_model_id = updates["last_model_id"]

    chat.updated_at = datetime.utcnow()
    db.session.commit()
    return ChatResponse.from_orm(chat)


def delete_chat(chat_id: str, user_id: str) -> int:
    """Delete a chat."""
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    # Messages will be deleted automatically due to cascade
    db.session.delete(chat)
    db.session.commit()
    return 1


def revert_to_message(chat_id: str, message_id: str, user_id: str) -> int:
    """
    Delete all messages created AFTER the given message_id.

    This effectively reverts the conversation to the state it was in
    immediately after the specified message was sent. The message itself
    is kept; only subsequent messages are removed.

    Returns the number of deleted messages.
    """
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    pivot = Message.query.filter_by(id=message_id, chat_id=chat_id).first()
    if not pivot:
        raise ValueError("Message not found")

    deleted = Message.query.filter(
        Message.chat_id == chat_id,
        Message.created_at > pivot.created_at,
    ).delete(synchronize_session=False)

    chat.updated_at = datetime.utcnow()
    db.session.commit()
    return deleted


def get_chat_messages(chat_id: str, user_id: str) -> List[Dict[str, Any]]:
    """Get messages for a chat."""
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    messages = (
        Message.query.filter_by(chat_id=chat_id)
        .options(joinedload(Message.artifacts))
        .order_by(Message.created_at.asc())
        .all()
    )

    return [msg.to_dict() for msg in messages]


def create_message(
    chat_id: str,
    data: Dict[str, Any],
    user_id: str,
    *,
    skip_auto_response: bool = False,
) -> Dict[str, Any]:
    """Create a new message. Set skip_auto_response=True when using stream (agent runs separately)."""
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    # Update chat timestamp
    chat.updated_at = datetime.utcnow()
    if data.get("model_id"):
        chat.last_model_id = data["model_id"]
    db.session.commit()

    # Create the message
    user_message = Message(
        chat_id=chat_id,
        role=MessageRole(data["role"].upper()),
        content=data["content"],
        model_id=data.get("model_id"),
        reasoning=data.get("reasoning", []),
    )
    db.session.add(user_message)
    db.session.commit()

    # If this is a user message and we have a model, generate AI response (unless streaming)
    if (
        not skip_auto_response
        and data["role"].upper() == MessageRole.USER.value
        and data.get("model_id")
    ):
        model = LLMModel.query.filter_by(id=data["model_id"]).first()
        if model:
            try:
                # Get the full conversation history including the new user message
                conversation_messages = (
                    Message.query.filter_by(chat_id=chat_id)
                    .order_by(Message.created_at.asc())
                    .all()
                )

                # Generate AI response using agent
                agent_response = create_agent_response(
                    chat_id,
                    [msg.to_dict() for msg in conversation_messages],
                    model.provider,
                    model.model_id,
                )

                # Create AI response message with reasoning
                ai_message = Message(
                    chat_id=chat_id,
                    role=MessageRole.ASSISTANT,
                    content=agent_response["content"],
                    model_id=data["model_id"],
                    reasoning=agent_response["reasoning"],
                )
                db.session.add(ai_message)
                db.session.commit()

                # Update chat timestamp
                chat.updated_at = datetime.utcnow()
                db.session.commit()

                # Generate chat title if this is the first user message
                message_count = Message.query.filter_by(chat_id=chat_id).count()
                if message_count == 2:  # User message + AI response just created
                    generated_title = generate_chat_title(
                        data["content"], agent_response["content"]
                    )
                    if generated_title:
                        chat.title = generated_title
                        db.session.commit()

            except Exception as e:
                print(f"Error generating AI response: {e}")
                # Don't throw error - user message was created successfully

    return user_message.to_dict()


def update_message(
    message_id: str, content: str, user_id: str, model_id: Optional[str] = None
) -> Dict[str, Any]:
    """Update a message."""
    message = Message.query.filter_by(id=message_id).first()
    if not message:
        raise ValueError("Message not found")

    chat = Chat.query.filter_by(id=message.chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Message not found")

    # Update message
    message.content = content
    if model_id:
        message.model_id = model_id
    db.session.commit()

    # Delete subsequent messages
    Message.query.filter(
        Message.chat_id == message.chat_id, Message.created_at > message.created_at
    ).delete()
    db.session.commit()

    # Update chat timestamp
    chat.updated_at = datetime.utcnow()
    db.session.commit()

    # Generate new AI response if this was a user message and had a model
    if message.role == MessageRole.USER and message.model_id:
        model = LLMModel.query.filter_by(id=message.model_id).first()
        if model:
            try:
                # Get the updated conversation history
                conversation_messages = (
                    Message.query.filter_by(chat_id=message.chat_id)
                    .order_by(Message.created_at.asc())
                    .all()
                )

                # Generate AI response
                agent_response = create_agent_response(
                    message.chat_id,
                    [msg.to_dict() for msg in conversation_messages],
                    model.provider,
                    model.model_id,
                )

                # Create AI response message
                ai_message = Message(
                    chat_id=message.chat_id,
                    role=MessageRole.ASSISTANT,
                    content=agent_response["content"],
                    model_id=message.model_id,
                    reasoning=agent_response["reasoning"],
                )
                db.session.add(ai_message)
                db.session.commit()

                # Update chat timestamp again
                chat.updated_at = datetime.utcnow()
                db.session.commit()

                # Generate chat title if this is the first user message
                message_count = Message.query.filter_by(chat_id=message.chat_id).count()
                if message_count == 2:  # User message + AI response just created
                    generated_title = generate_chat_title(
                        message.content, agent_response["content"]
                    )
                    if generated_title:
                        chat.title = generated_title
                        db.session.commit()

            except Exception as e:
                print(f"Error generating AI response after message edit: {e}")

    return message.to_dict()


def get_llm_models() -> List[LLMModelResponse]:
    """Get all active LLM models."""
    models = (
        LLMModel.query.filter_by(is_active=True).order_by(LLMModel.name.asc()).all()
    )
    return [LLMModelResponse.from_orm(model) for model in models]


def generate_chat_title(user_content: str, assistant_content: str) -> Optional[str]:
    """Generate a title for the chat."""
    # This would use LLM to generate title, but for now return None
    # TODO: Implement LLM-based title generation
    return None


def create_agent_response(
    chat_id: str, messages: List[Dict[str, Any]], provider: str, model_id: str
) -> Dict[str, Any]:
    """Create an AI response using the unified agent."""
    try:
        import asyncio

        from ..agents.agent_factory import create_langgraph_agent
        from ..agents.config import DEFAULT_AGENT_ID

        agent = create_langgraph_agent(DEFAULT_AGENT_ID, provider, model_id, chat_id)
        simple_messages = [
            {"role": msg["role"], "content": msg["content"]} for msg in messages
        ]

        response_content = ""
        reasoning_steps = []

        async def collect_response():
            nonlocal response_content, reasoning_steps
            async for event in agent.stream_simple(simple_messages, None):
                if event.type == "content":
                    response_content += (
                        event.data if isinstance(event.data, str) else ""
                    )
                elif event.type == "reasoning" and isinstance(event.data, dict):
                    reasoning_steps.append(
                        {
                            "thought": event.data.get("thought", ""),
                            "tool_calls": event.data.get(
                                "tool_calls", event.data.get("toolCalls", [])
                            ),
                        }
                    )
                elif event.type == "done":
                    break
            return {"content": response_content, "reasoning": reasoning_steps}

        return asyncio.run(collect_response())

    except Exception as e:
        print(f"Error generating agent response: {e}")
        return {
            "content": "I apologize, but I encountered an error while processing your request.",
            "reasoning": [],
        }
