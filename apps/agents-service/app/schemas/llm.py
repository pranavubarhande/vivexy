from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class LLMModelBase(BaseModel):
    name: str
    provider: str
    model_id: str
    is_active: bool = True
    context_window: Optional[int] = None


class LLMModelResponse(LLMModelBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    def dict(self, **kwargs):
        data = super().dict(**kwargs)
        return {
            "id": data["id"],
            "name": data["name"],
            "provider": data["provider"],
            "modelId": data["model_id"],
            "isActive": data["is_active"],
            "contextWindow": data.get("context_window"),
            "createdAt": (
                data["created_at"].isoformat() if data.get("created_at") else None
            ),
            "updatedAt": (
                data["updated_at"].isoformat() if data.get("updated_at") else None
            ),
        }
