"""Team-level policy applied to chats: membership, suspension, allowed models
and monthly budget enforcement / alerts."""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from agents_core.business_logic.usage import get_usage_totals
from agents_core.models import Chat, Team, TeamMember, TeamRole, User, db
from agents_core.utils.email import send_budget_alert_email

logger = logging.getLogger(__name__)

BUDGET_ALERT_THRESHOLDS = (100, 80)
BUDGET_ENFORCEMENT_MODES = ("warn", "block")


def month_start() -> datetime:
    now = datetime.utcnow()
    return datetime(now.year, now.month, 1)


def team_month_to_date_cost(team_id: str) -> float:
    return get_usage_totals(team_id=team_id, since=month_start())["totalCostUsd"]


def resolve_chat_team(team_id: Optional[str], user: User) -> Optional[str]:
    """Validate that a new chat may be attributed to team_id."""
    if not team_id:
        return None
    team = Team.query.get(team_id)
    membership = TeamMember.query.filter_by(team_id=team_id, user_id=user.id).first()
    if not team or not membership:
        raise PermissionError("You are not a member of this team")
    if team.is_suspended:
        raise PermissionError("This team is suspended. Contact your admin.")
    return team_id


def check_chat_policy(chat: Chat, model_db_id: Optional[str]) -> Dict[str, Any]:
    """Raise PermissionError when the team blocks this request; otherwise return
    non-blocking warnings for the caller to surface."""
    if not chat.team_id:
        return {"warnings": []}

    team = Team.query.get(chat.team_id)
    if not team:
        return {"warnings": []}
    if team.is_suspended:
        raise PermissionError("This team is suspended. Contact your admin.")
    if team.allowed_model_ids and model_db_id not in team.allowed_model_ids:
        raise PermissionError("This model is not enabled for your team")

    warnings: List[str] = []
    if team.monthly_budget_usd:
        spent = team_month_to_date_cost(team.id)
        if spent >= team.monthly_budget_usd:
            message = (
                f"{team.name} has reached its monthly budget "
                f"(${spent:,.2f} of ${team.monthly_budget_usd:,.2f})."
            )
            if team.budget_enforcement == "block":
                raise PermissionError(f"{message} Ask a team admin to raise it.")
            warnings.append(message)
    return {"warnings": warnings}


def filter_models_for_team(models: List[Any], team_id: Optional[str]) -> List[Any]:
    if not team_id:
        return models
    team = Team.query.get(team_id)
    if not team or not team.allowed_model_ids:
        return models
    allowed = set(team.allowed_model_ids)
    return [model for model in models if model.id in allowed]


def maybe_send_budget_alerts(team_id: Optional[str]) -> Optional[int]:
    """Email team owner/admins the first time spend crosses 80% / 100% of the
    monthly budget. Returns the threshold that fired, if any."""
    if not team_id:
        return None
    team = Team.query.get(team_id)
    if not team or not team.monthly_budget_usd:
        return None

    current_month = datetime.utcnow().strftime("%Y-%m")
    already_sent = (
        team.budget_alert_threshold if team.budget_alert_month == current_month else 0
    ) or 0
    spent = team_month_to_date_cost(team.id)
    percent_used = spent / team.monthly_budget_usd * 100

    threshold = next(
        (level for level in BUDGET_ALERT_THRESHOLDS if percent_used >= level), None
    )
    if not threshold or threshold <= already_sent:
        return None

    team.budget_alert_month = current_month
    team.budget_alert_threshold = threshold
    db.session.commit()

    recipients = [
        membership.user.email
        for membership in TeamMember.query.filter(
            TeamMember.team_id == team.id,
            TeamMember.role.in_((TeamRole.OWNER, TeamRole.ADMIN)),
        ).all()
    ]
    try:
        send_budget_alert_email(
            recipients, team.name, threshold, spent, team.monthly_budget_usd
        )
    except Exception:
        logger.exception("Failed to send budget alert for team %s", team.id)
    return threshold
