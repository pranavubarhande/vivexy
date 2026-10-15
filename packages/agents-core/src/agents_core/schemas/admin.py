from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from agents_core.models.enums import Plan, Role, TeamRole


class BulkInviteCreate(BaseModel):
    emails: List[str] = Field(min_length=1, max_length=500)
    role: TeamRole = TeamRole.MEMBER


class TeamMemberRoleUpdate(BaseModel):
    role: TeamRole


class TeamSettingsUpdate(BaseModel):
    monthly_budget_usd: Optional[float] = Field(default=None, ge=0)
    budget_enforcement: Optional[Literal["warn", "block"]] = None
    allowed_model_ids: Optional[List[str]] = None


class ClientUpdate(BaseModel):
    is_suspended: Optional[bool] = None
    seat_limit: Optional[int] = Field(default=None, ge=1)
    notes: Optional[str] = None
    feature_flags: Optional[Dict[str, bool]] = None


class PlatformUserUpdate(BaseModel):
    is_suspended: Optional[bool] = None
    role: Optional[Role] = None


class ClientPlanUpdate(BaseModel):
    plan: Plan
    status: Literal["ACTIVE", "TRIALING"] = "ACTIVE"
    period_end: Optional[datetime] = None


class LLMModelAdminUpdate(BaseModel):
    is_active: Optional[bool] = None
    input_cost: Optional[float] = Field(default=None, ge=0)
    output_cost: Optional[float] = Field(default=None, ge=0)


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: Optional[str] = Field(default=None, max_length=2000)
    level: Literal["info", "warning", "critical"] = "info"
    team_id: Optional[str] = None
    is_active: bool = True
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    body: Optional[str] = Field(default=None, max_length=2000)
    level: Optional[Literal["info", "warning", "critical"]] = None
    is_active: Optional[bool] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
