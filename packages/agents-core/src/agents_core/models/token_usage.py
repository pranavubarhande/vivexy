import uuid
from datetime import datetime

from agents_core.models.base import db


class TokenUsage(db.Model):
    __tablename__ = "token_usage"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String, db.ForeignKey("users.id"), nullable=False)
    message_id = db.Column(db.String, db.ForeignKey("messages.id"), nullable=True)
    model_id = db.Column(db.String, db.ForeignKey("llm_models.id"), nullable=True)
    model_name = db.Column(db.String, nullable=True)
    provider = db.Column(db.String, nullable=True)
    input_tokens = db.Column(db.Integer, default=0)
    output_tokens = db.Column(db.Integer, default=0)
    total_tokens = db.Column(db.Integer, default=0)
    input_cost_usd = db.Column(db.Float, default=0.0)
    output_cost_usd = db.Column(db.Float, default=0.0)
    total_cost_usd = db.Column(db.Float, default=0.0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "messageId": self.message_id,
            "modelId": self.model_id,
            "modelName": self.model_name,
            "provider": self.provider,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "totalTokens": self.total_tokens,
            "inputCostUsd": self.input_cost_usd,
            "outputCostUsd": self.output_cost_usd,
            "totalCostUsd": self.total_cost_usd,
            "createdAt": self.created_at.isoformat(),
        }
