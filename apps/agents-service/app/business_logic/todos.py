from datetime import datetime
from typing import Any, Dict, List, Optional

from agents_core.models import Chat, Todo, db
from agents_core.schemas import (
    TodoCreate,
    TodoPriority,
    TodoResponse,
    TodoStatus,
    TodoUpdate,
)


def get_chat_todos(chat_id: str, user_id: str) -> List[Dict[str, Any]]:
    """Get all todos for a chat."""
    # Verify chat belongs to user
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    todos = (
        Todo.query.filter_by(chat_id=chat_id)
        .order_by(Todo.priority.desc(), Todo.created_at.desc())
        .all()
    )

    return [
        {
            "id": todo.id,
            "chatId": todo.chat_id,
            "title": todo.title,
            "description": todo.description,
            "priority": todo.priority.value,
            "status": todo.status.value,
            "dueDate": todo.due_date.isoformat() if todo.due_date else None,
            "createdAt": todo.created_at.isoformat(),
            "updatedAt": todo.updated_at.isoformat(),
        }
        for todo in todos
    ]


def create_todo(chat_id: str, data: TodoCreate, user_id: str) -> Dict[str, Any]:
    """Create a new todo."""
    # Verify chat belongs to user
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    todo = Todo(
        chat_id=chat_id,
        title=data.title,
        description=data.description,
        priority=data.priority,
        status=data.status,
        due_date=data.due_date,
    )

    db.session.add(todo)
    db.session.commit()

    return {
        "id": todo.id,
        "chatId": todo.chat_id,
        "title": todo.title,
        "description": todo.description,
        "priority": todo.priority.value,
        "status": todo.status.value,
        "dueDate": todo.due_date.isoformat() if todo.due_date else None,
        "createdAt": todo.created_at.isoformat(),
        "updatedAt": todo.updated_at.isoformat(),
    }


def get_todo(todo_id: str, chat_id: str, user_id: str) -> Dict[str, Any]:
    """Get a specific todo."""
    # Verify chat belongs to user
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    todo = Todo.query.filter_by(id=todo_id, chat_id=chat_id).first()
    if not todo:
        raise ValueError("Todo not found")

    return todo.to_dict()


def update_todo(
    todo_id: str, chat_id: str, data: TodoUpdate, user_id: str
) -> Dict[str, Any]:
    """Update a todo."""
    # Verify chat belongs to user
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    todo = Todo.query.filter_by(id=todo_id, chat_id=chat_id).first()
    if not todo:
        raise ValueError("Todo not found")

    # Update fields
    if data.title is not None:
        todo.title = data.title
    if data.description is not None:
        todo.description = data.description
    if data.priority is not None:
        todo.priority = data.priority
    if data.status is not None:
        todo.status = data.status
    if data.due_date is not None:
        todo.due_date = data.due_date

    todo.updated_at = datetime.utcnow()
    db.session.commit()

    return todo.to_dict()


def delete_todo(todo_id: str, chat_id: str, user_id: str) -> bool:
    """Delete a todo."""
    # Verify chat belongs to user
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    todo = Todo.query.filter_by(id=todo_id, chat_id=chat_id).first()
    if not todo:
        raise ValueError("Todo not found")

    db.session.delete(todo)
    db.session.commit()

    return True
