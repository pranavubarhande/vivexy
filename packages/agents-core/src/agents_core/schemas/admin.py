import re
from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from agents_core.models.enums import Plan, Role, TeamRole

FEATURE_FLAG_PATTERN = re.compile(r"^[a-z][a-z0-9-]{1,40}$")


class BulkInviteCreate(BaseModel):
    emails: List[str] = Field(min_length=1, max_length=500)
    role: TeamRole = TeamRole.MEMBER


class TeamMemberRoleUpdate(BaseModel):
    role: TeamRole


class OwnershipTransfer(BaseModel):
    user_id: str = Field(min_length=1)


class TeamSettingsUpdate(BaseModel):
    monthly_budget_usd: Optional[float] = Field(default=None, ge=0)
    budget_enforcement: Optional[Literal["warn", "block"]] = None
    allowed_model_ids: Optional[List[str]] = None
    email_domain: Optional[str] = None
    auto_join_domain: Optional[bool] = None
    require_sso: Optional[bool] = None
    retention_days: Optional[int] = Field(default=None, ge=7, le=3650)


class ClientUpdate(BaseModel):
    is_suspended: Optional[bool] = None
    seat_limit: Optional[int] = Field(default=None, ge=1)
    notes: Optional[str] = None
    feature_flags: Optional[Dict[str, bool]] = None
    domain_verified: Optional[bool] = None

    @field_validator("feature_flags")
    @classmethod
    def validate_flag_names(cls, flags):
        # Kebab-case survives the API's automatic snake/camel key conversion.
        for name in flags or {}:
            if not FEATURE_FLAG_PATTERN.match(name):
                raise ValueError(
                    f"Invalid flag name '{name}': use lowercase letters, "
                    "digits and hyphens"
                )
        return flags


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
