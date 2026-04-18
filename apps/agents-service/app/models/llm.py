import uuid
from datetime import datetime

from app.models.base import db


class LLMModel(db.Model):
    __tablename__ = "llm_models"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String, unique=True, nullable=False)
    provider = db.Column(db.String, nullable=False)
    model_id = db.Column(db.String, nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    context_window = db.Column(db.Integer, nullable=True)
    max_output_tokens = db.Column(db.Integer, nullable=True)
    input_cost = db.Column(db.Float, nullable=True)  # $ per million tokens
    output_cost = db.Column(db.Float, nullable=True)  # $ per million tokens
    supports_vision = db.Column(db.Boolean, default=False)
    supports_reasoning = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relations
    messages = db.relationship("Message", backref="model", lazy=True)
    last_used_by_chats = db.relationship("Chat", backref="last_model", lazy=True)
