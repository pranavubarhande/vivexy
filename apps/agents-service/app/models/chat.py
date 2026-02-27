import uuid
from datetime import datetime

from sqlalchemy import Enum as SQLEnum

from app.models.base import db
from app.models.enums import ArtifactType, MessageRole, TodoPriority, TodoStatus


class Chat(db.Model):
    __tablename__ = "chats"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String)
    agent_id = db.Column(db.String)  # Which agent is being used for this chat
    last_model_id = db.Column(db.String, db.ForeignKey("llm_models.id"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relations
    messages = db.relationship("Message", backref="chat", lazy=True)
    artifacts = db.relationship("Artifact", backref="chat", lazy=True)
    todos = db.relationship("Todo", backref="chat", lazy=True)
    attachments = db.relationship("ChatAttachment", backref="chat", lazy=True)


class Message(db.Model):
    __tablename__ = "messages"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    chat_id = db.Column(db.String, db.ForeignKey("chats.id"), nullable=False)
    role = db.Column(SQLEnum(MessageRole), nullable=False)
    content = db.Column(db.Text, nullable=False)
    model_id = db.Column(db.String, db.ForeignKey("llm_models.id"))
    reasoning = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relations
    artifacts = db.relationship("Artifact", backref="message", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "chatId": self.chat_id,
            "role": self.role.value.lower(),
            "content": self.content,
            "modelId": self.model_id,
            "reasoning": self.reasoning,
            "createdAt": self.created_at.isoformat(),
        }


class Artifact(db.Model):
    __tablename__ = "artifacts"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    chat_id = db.Column(db.String, db.ForeignKey("chats.id"), nullable=False)
    message_id = db.Column(db.String, db.ForeignKey("messages.id"))
    title = db.Column(db.String)
    type = db.Column(SQLEnum(ArtifactType), nullable=False)
    filename = db.Column(db.String)
    language = db.Column(db.String)
    version = db.Column(db.Integer, default=1)
    seq = db.Column(db.Integer, nullable=False)
    content = db.Column(db.Text, nullable=False)
    artifact_metadata = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Todo(db.Model):
    __tablename__ = "todos"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    chat_id = db.Column(db.String, db.ForeignKey("chats.id"), nullable=False)
    title = db.Column(db.String, nullable=False)
    description = db.Column(db.Text)
    priority = db.Column(SQLEnum(TodoPriority), default=TodoPriority.MEDIUM)
    status = db.Column(SQLEnum(TodoStatus), default=TodoStatus.PENDING)
    due_date = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def to_dict(self):
        return {
            "id": self.id,
            "chatId": self.chat_id,
            "title": self.title,
            "description": self.description,
            "priority": self.priority.value if self.priority else None,
            "status": self.status.value if self.status else None,
            "dueDate": self.due_date.isoformat() if self.due_date else None,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


class ChatAttachment(db.Model):
    __tablename__ = "chat_attachments"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    chat_id = db.Column(db.String, db.ForeignKey("chats.id"), nullable=False)
    filename = db.Column(db.String, nullable=False)
    s3_key = db.Column(db.String, nullable=False)
    mime_type = db.Column(db.String, nullable=False)
    size = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
