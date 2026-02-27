from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
from app.models.enums import MessageRole, ArtifactType, TodoPriority, TodoStatus


# Chat schemas
class ChatBase(BaseModel):
    title: Optional[str] = None
    agent_id: Optional[str] = None

class ChatCreate(ChatBase):
    pass

class ChatResponse(ChatBase):
    id: str
    user_id: str
    last_model_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Message schemas
class MessageBase(BaseModel):
    role: MessageRole
    content: str
    model_id: Optional[str] = None
    reasoning: Optional[Dict[str, Any]] = None

class MessageCreate(MessageBase):
    chat_id: str

class MessageResponse(MessageBase):
    id: str
    chat_id: str
    created_at: datetime

    class Config:
        from_attributes = True

# Artifact schemas
class ArtifactBase(BaseModel):
    chat_id: str
    message_id: Optional[str] = None
    title: Optional[str] = None
    type: ArtifactType
    filename: Optional[str] = None
    language: Optional[str] = None
    version: int = 1
    seq: int
    content: str
    metadata: Optional[Dict[str, Any]] = None

class ArtifactCreate(ArtifactBase):
    pass

class ArtifactResponse(ArtifactBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


# Todo schemas
class TodoBase(BaseModel):
    chat_id: str
    title: str
    description: Optional[str] = None
    priority: TodoPriority = TodoPriority.MEDIUM
    status: TodoStatus = TodoStatus.PENDING
    due_date: Optional[datetime] = None

class TodoCreate(TodoBase):
    pass

class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[TodoPriority] = None
    status: Optional[TodoStatus] = None
    due_date: Optional[datetime] = None

class TodoResponse(TodoBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
