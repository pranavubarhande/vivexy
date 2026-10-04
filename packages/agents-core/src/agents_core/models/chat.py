import uuid
from datetime import datetime

from sqlalchemy import Enum as SQLEnum

from agents_core.models.base import db
from agents_core.models.enums import ArtifactType, MessageRole, TodoPriority, TodoStatus


class Chat(db.Model):
    __tablename__ = "chats"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String)
    agent_id = db.Column(db.String)  # Which agent is being used for this chat
    last_model_id = db.Column(db.String, db.ForeignKey("llm_models.id"))
    compact_summary = db.Column(db.Text, nullable=True)
    compact_message_count = db.Column(db.Integer, nullable=True)
    github_context = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relations
    messages = db.relationship("Message", backref="chat", lazy=True)
    artifacts = db.relationship("Artifact", backref="chat", lazy=True)
    todos = db.relationship("Todo", backref="chat", lazy=True)
    attachments = db.relationship("ChatAttachment", backref="chat", lazy=True)
    checkpoints = db.relationship(
        "ChatCheckpoint", backref="chat", lazy=True, cascade="all, delete-orphan"
    )


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
    attachments = db.relationship(
        "ChatAttachment",
        backref="message",
        lazy=True,
        foreign_keys="ChatAttachment.message_id",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "chatId": self.chat_id,
            "role": self.role.value.lower(),
            "content": self.content,
            "modelId": self.model_id,
            "reasoning": self.reasoning,
            "createdAt": self.created_at.isoformat(),
            "attachments": [a.to_dict() for a in self.attachments],
            "artifacts": [
                {
                    "id": a.id,
                    "chatId": a.chat_id,
                    "messageId": a.message_id,
                    "title": a.title,
                    "type": a.type.value if hasattr(a.type, "value") else str(a.type),
                    "filename": a.filename,
                    "language": a.language,
                    "version": a.version,
                    "seq": a.seq,
                    "content": a.content,
                    "metadata": a.artifact_metadata,
                    "createdAt": a.created_at.isoformat(),
                }
                for a in self.artifacts
            ],
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
    content = db.Column(db.Text, nullable=True)
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
    # nullable — set after the user message is created
    message_id = db.Column(db.String, db.ForeignKey("messages.id"), nullable=True)
    filename = db.Column(db.String, nullable=False)
    s3_key = db.Column(db.String, nullable=False)
    mime_type = db.Column(db.String, nullable=False)
    size = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "chatId": self.chat_id,
            "messageId": self.message_id,
            "filename": self.filename,
            "mimeType": self.mime_type,
            "size": self.size,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class ChatCheckpoint(db.Model):
    __tablename__ = "chat_checkpoints"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    chat_id = db.Column(db.String, db.ForeignKey("chats.id"), nullable=False)
    message_id = db.Column(db.String, db.ForeignKey("messages.id"), nullable=False)
    label = db.Column(db.String)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "chatId": self.chat_id,
            "messageId": self.message_id,
            "label": self.label,
            "createdAt": self.created_at.isoformat(),
        }
