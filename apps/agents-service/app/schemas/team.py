from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import TeamRole


class TeamBase(BaseModel):
    name: str
    description: Optional[str] = None
    slug: str


class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class TeamResponse(TeamBase):
    id: str
    owner_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TeamMemberBase(BaseModel):
    user_id: str
    team_id: str
    role: TeamRole


class TeamMemberCreate(BaseModel):
    email: str
    role: TeamRole = TeamRole.MEMBER


class TeamMemberResponse(TeamMemberBase):
    id: str
    joined_at: datetime

    class Config:
        from_attributes = True
