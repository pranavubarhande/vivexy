from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from agents_core.models.enums import Role, TeamRole


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
