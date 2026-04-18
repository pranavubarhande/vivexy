from datetime import datetime
from typing import Dict, Literal, Optional

from pydantic import BaseModel, field_validator

SkillPlatform = Literal["desktop", "web", "both"]


class UserSkillCreate(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    content: str
    files: Optional[Dict[str, str]] = None
    enabled: bool = True
    platform: SkillPlatform = "both"

    @field_validator("platform")
    @classmethod
    def validate_platform(cls, value: str) -> str:
        if value not in ("desktop", "web", "both"):
            raise ValueError("platform must be 'desktop', 'web', or 'both'")
        return value


class UserSkillUpdate(BaseModel):
    description: Optional[str] = None
    content: Optional[str] = None
    files: Optional[Dict[str, str]] = None
    enabled: Optional[bool] = None
    platform: Optional[SkillPlatform] = None


class UserSkillResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    content: str
    files: Optional[Dict[str, str]] = None
    enabled: bool
    platform: str = "both"
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
