from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from app.models import db, Todo, TodoPriority, TodoStatus

class CreateTodoInput(BaseModel):
    title: str = Field(..., description="Title of the task")
    description: Optional[str] = Field(None, description="Detailed description of the task")
    priority: TodoPriority = Field(TodoPriority.MEDIUM, description="Priority level of the task")
    due_date: Optional[str] = Field(None, description="Due date in ISO format (e.g., 2024-01-15T10:00:00Z)")

class UpdateTodoInput(BaseModel):
    todo_id: str = Field(..., description="ID of the todo to update")
    status: Optional[TodoStatus] = Field(None, description="New status for the todo")
    title: Optional[str] = Field(None, description="New title for the todo")
    description: Optional[str] = Field(None, description="New description for the todo")

class ListTodosInput(BaseModel):
    status: str = Field("ALL", description="Filter todos by status")

def create_todo_func(chat_id: str, input_data: Dict[str, Any]) -> str:
    try:
        from datetime import datetime
        due_date = None
        if input_data.get('due_date'):
            due_date = datetime.fromisoformat(input_data['due_date'].replace('Z', '+00:00'))

        todo = Todo(
            chat_id=chat_id,
            title=input_data['title'],
            description=input_data.get('description'),
            priority=input_data.get('priority', TodoPriority.MEDIUM),
            due_date=due_date
        )

        db.session.add(todo)
        db.session.commit()

        return str({
            "success": True,
            "todo": {
                "id": todo.id,
                "title": todo.title,
                "description": todo.description,
                "priority": todo.priority.value,
                "status": todo.status.value,
                "due_date": todo.due_date.isoformat() if todo.due_date else None,
            }
        })
    except Exception as e:
        db.session.rollback()
        return str({
            "success": False,
            "error": str(e)
        })

def update_todo_func(chat_id: str, input_data: Dict[str, Any]) -> str:
    try:
        # Verify todo belongs to this chat
        todo = Todo.query.filter_by(id=input_data['todo_id'], chat_id=chat_id).first()
        if not todo:
            return str({
                "success": False,
                "error": "Todo not found or does not belong to this chat"
            })

        # Update fields
        if 'status' in input_data:
            todo.status = input_data['status']
        if 'title' in input_data:
            todo.title = input_data['title']
        if 'description' in input_data:
            todo.description = input_data['description']

        db.session.commit()

        return str({
            "success": True,
            "todo": {
                "id": todo.id,
                "title": todo.title,
                "description": todo.description,
                "priority": todo.priority.value,
                "status": todo.status.value,
                "due_date": todo.due_date.isoformat() if todo.due_date else None,
            }
        })
    except Exception as e:
        db.session.rollback()
        return str({
            "success": False,
            "error": str(e)
        })

def list_todos_func(chat_id: str, input_data: Dict[str, Any]) -> str:
    try:
        query = Todo.query.filter_by(chat_id=chat_id)

        status_filter = input_data.get('status', 'ALL')
        if status_filter != 'ALL':
            query = query.filter_by(status=status_filter)

        todos = query.order_by(Todo.priority.desc(), Todo.created_at.desc()).all()

        return str({
            "success": True,
            "todos": [{
                "id": todo.id,
                "title": todo.title,
                "description": todo.description,
                "priority": todo.priority.value,
                "status": todo.status.value,
                "due_date": todo.due_date.isoformat() if todo.due_date else None,
            } for todo in todos]
        })
    except Exception as e:
        return str({
            "success": False,
            "error": str(e)
        })

def get_create_todo_tool(chat_id: str) -> StructuredTool:
    return StructuredTool.from_function(
        func=lambda **kwargs: create_todo_func(chat_id, kwargs),
        name="create_todo",
        description="Create a new task/todo item for the user. Use this when the user asks you to track tasks, create action items, or when you identify actionable items from the conversation.",
        args_schema=CreateTodoInput
    )

def get_update_todo_tool(chat_id: str) -> StructuredTool:
    return StructuredTool.from_function(
        func=lambda **kwargs: update_todo_func(chat_id, kwargs),
        name="update_todo",
        description="Update an existing todo item (status, title, or description). Use this to track progress, mark tasks as complete, or report errors by updating the description.",
        args_schema=UpdateTodoInput
    )

def get_list_todos_tool(chat_id: str) -> StructuredTool:
    return StructuredTool.from_function(
        func=lambda **kwargs: list_todos_func(chat_id, kwargs),
        name="list_todos",
        description="List all todos/tasks for the current chat. Use this when the user wants to see their task list or check on pending items.",
        args_schema=ListTodosInput
    )

def get_todo_tools(chat_id: str) -> List[StructuredTool]:
    return [
        get_create_todo_tool(chat_id),
        get_update_todo_tool(chat_id),
        get_list_todos_tool(chat_id),
    ]