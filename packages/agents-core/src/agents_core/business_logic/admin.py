"""Client-side admin panel: team OWNER/ADMIN managing their own team."""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Tuple

from agents_core.business_logic.audit import list_audit_logs, record_audit_log
from agents_core.business_logic.usage import (
    get_daily_usage_for_users,
    get_usage_by_model_for_users,
    get_usage_totals,
    get_usage_totals_by_user,
)
from agents_core.constants.audit_actions import (
    AUDIT_TARGET_INVITE,
    AUDIT_TARGET_TEAM,
    AUDIT_TARGET_USER,
    AUDIT_TEAM_INVITE_REVOKED,
    AUDIT_TEAM_MEMBER_REMOVED,
    AUDIT_TEAM_MEMBER_ROLE_CHANGED,
    AUDIT_TEAM_SETTINGS_UPDATED,
)
from agents_core.models import Team, TeamInvite, TeamMember, TeamRole, User, db
from agents_core.schemas import TeamMemberRoleUpdate, TeamSettingsUpdate

ADMIN_ROLES = (TeamRole.OWNER, TeamRole.ADMIN)


def month_start() -> datetime:
    now = datetime.utcnow()
    return datetime(now.year, now.month, 1)


def team_member_ids(team_id: str) -> List[str]:
    return [
        row[0]
        for row in db.session.query(TeamMember.user_id)
        .filter(TeamMember.team_id == team_id)
        .all()
    ]


def get_team_for_admin(team_id: str, user: User) -> Tuple[Team, TeamMember]:
    """Return the team and the caller's membership, or raise.

    LookupError -> 404, PermissionError -> 403."""
    team = Team.query.get(team_id)
    if not team:
        raise LookupError("Team not found")

    membership = TeamMember.query.filter_by(team_id=team_id, user_id=user.id).first()
    if not membership or membership.role not in ADMIN_ROLES:
        raise PermissionError("Only team owners and admins can access this panel")
    return team, membership


def _ensure_writable(team: Team) -> None:
    if team.is_suspended:
        raise PermissionError("This team is suspended. Contact support.")


def get_administered_teams(user: User) -> List[Dict[str, Any]]:
    memberships = (
        TeamMember.query.filter(
            TeamMember.user_id == user.id, TeamMember.role.in_(ADMIN_ROLES)
        )
        .join(Team)
        .order_by(Team.name.asc())
        .all()
    )
    return [
        {
            "id": membership.team.id,
            "name": membership.team.name,
            "slug": membership.team.slug,
            "role": membership.role.value,
            "isSuspended": membership.team.is_suspended,
            "memberCount": TeamMember.query.filter_by(
                team_id=membership.team.id
            ).count(),
        }
        for membership in memberships
    ]


def get_team_overview(team_id: str, user: User, days: int = 30) -> Dict[str, Any]:
    team, membership = get_team_for_admin(team_id, user)
    member_ids = team_member_ids(team_id)
    since = datetime.utcnow() - timedelta(days=days)
    pending_invites = TeamInvite.query.filter(
        TeamInvite.team_id == team_id, TeamInvite.expires_at > datetime.utcnow()
    ).count()
    period_usage = get_usage_totals(member_ids, since)
    active_members = len(get_usage_totals_by_user(member_ids, since))

    return {
        "team": {
            "id": team.id,
            "name": team.name,
            "slug": team.slug,
            "description": team.description,
            "isSuspended": team.is_suspended,
            "seatLimit": team.seat_limit,
            "monthlyBudgetUsd": team.monthly_budget_usd,
            "createdAt": team.created_at.isoformat() if team.created_at else None,
        },
        "viewerRole": membership.role.value,
        "memberCount": len(member_ids),
        "activeMemberCount": active_members,
        "pendingInviteCount": pending_invites,
        "usage": period_usage,
        "monthToDateCostUsd": get_usage_totals(member_ids, month_start())[
            "totalCostUsd"
        ],
        "daily": get_daily_usage_for_users(member_ids, days),
        "byModel": get_usage_by_model_for_users(member_ids, days),
        "periodDays": days,
    }


def build_members_with_usage(team_id: str, days: int = 30) -> List[Dict[str, Any]]:
    since = datetime.utcnow() - timedelta(days=days)
    members = (
        TeamMember.query.filter_by(team_id=team_id)
        .order_by(TeamMember.joined_at.asc())
        .all()
    )
    usage_by_user = get_usage_totals_by_user([m.user_id for m in members], since)
    empty_usage = {
        "totalTokens": 0,
        "totalCostUsd": 0.0,
        "messageCount": 0,
        "lastActiveAt": None,
    }

    return [
        {
            "id": member.id,
            "role": member.role.value,
            "joinedAt": member.joined_at.isoformat() if member.joined_at else None,
            "user": {
                "id": member.user.id,
                "name": member.user.name,
                "email": member.user.email,
                "avatar": member.user.avatar,
                "isSuspended": member.user.is_suspended,
                "lastLoginAt": (
                    member.user.last_login_at.isoformat()
                    if member.user.last_login_at
                    else None
                ),
            },
            "usage": usage_by_user.get(member.user_id, empty_usage),
        }
        for member in members
    ]


def update_member_role(
    team_id: str, target_user_id: str, payload: TeamMemberRoleUpdate, actor: User
) -> Dict[str, Any]:
    team, membership = get_team_for_admin(team_id, actor)
    _ensure_writable(team)

    if membership.role != TeamRole.OWNER:
        raise PermissionError("Only the team owner can change member roles")
    if payload.role == TeamRole.OWNER:
        raise ValueError("Ownership transfer is not supported yet")
    if target_user_id == team.owner_id:
        raise ValueError("The team owner's role cannot be changed")

    target = TeamMember.query.filter_by(team_id=team_id, user_id=target_user_id).first()
    if not target:
        raise LookupError("Member not found")

    previous_role = target.role.value
    target.role = payload.role
    record_audit_log(
        actor,
        AUDIT_TEAM_MEMBER_ROLE_CHANGED,
        AUDIT_TARGET_USER,
        target_user_id,
        team_id=team_id,
        details={
            "email": target.user.email,
            "from": previous_role,
            "to": payload.role.value,
        },
        commit=False,
    )
    db.session.commit()
    return {"message": "Role updated", "role": target.role.value}


def remove_member(team_id: str, target_user_id: str, actor: User) -> Dict[str, Any]:
    team, membership = get_team_for_admin(team_id, actor)
    _ensure_writable(team)

    if target_user_id == team.owner_id:
        raise ValueError("The team owner cannot be removed")
    if target_user_id == actor.id:
        raise ValueError("You cannot remove yourself")

    target = TeamMember.query.filter_by(team_id=team_id, user_id=target_user_id).first()
    if not target:
        raise LookupError("Member not found")
    if target.role == TeamRole.ADMIN and membership.role != TeamRole.OWNER:
        raise PermissionError("Only the team owner can remove an admin")

    email = target.user.email
    db.session.delete(target)
    record_audit_log(
        actor,
        AUDIT_TEAM_MEMBER_REMOVED,
        AUDIT_TARGET_USER,
        target_user_id,
        team_id=team_id,
        details={"email": email},
        commit=False,
    )
    db.session.commit()
    return {"message": "Member removed"}


def get_team_members_with_usage(
    team_id: str, user: User, days: int = 30
) -> List[Dict[str, Any]]:
    get_team_for_admin(team_id, user)
    return build_members_with_usage(team_id, days)


def build_team_invites(team_id: str) -> List[Dict[str, Any]]:
    invites = (
        TeamInvite.query.filter_by(team_id=team_id)
        .order_by(TeamInvite.created_at.desc())
        .all()
    )
    now = datetime.utcnow()
    return [
        {
            "id": invite.id,
            "email": invite.email,
            "role": invite.role.value,
            "invitedBy": invite.invited_by,
            "expiresAt": invite.expires_at.isoformat(),
            "isExpired": invite.expires_at <= now,
            "createdAt": (invite.created_at.isoformat() if invite.created_at else None),
        }
        for invite in invites
    ]


def list_team_invites(team_id: str, user: User) -> List[Dict[str, Any]]:
    get_team_for_admin(team_id, user)
    return build_team_invites(team_id)


def revoke_invite(team_id: str, invite_id: str, actor: User) -> Dict[str, Any]:
    team, _ = get_team_for_admin(team_id, actor)
    _ensure_writable(team)

    invite = TeamInvite.query.filter_by(id=invite_id, team_id=team_id).first()
    if not invite:
        raise LookupError("Invite not found")

    email = invite.email
    db.session.delete(invite)
    record_audit_log(
        actor,
        AUDIT_TEAM_INVITE_REVOKED,
        AUDIT_TARGET_INVITE,
        invite_id,
        team_id=team_id,
        details={"email": email},
        commit=False,
    )
    db.session.commit()
    return {"message": "Invite revoked"}


def update_team_settings(
    team_id: str, payload: TeamSettingsUpdate, actor: User
) -> Dict[str, Any]:
    team, _ = get_team_for_admin(team_id, actor)
    _ensure_writable(team)

    changes = {}
    if "monthly_budget_usd" in payload.model_fields_set:
        changes["monthlyBudgetUsd"] = {
            "from": team.monthly_budget_usd,
            "to": payload.monthly_budget_usd,
        }
        team.monthly_budget_usd = payload.monthly_budget_usd

    if changes:
        record_audit_log(
            actor,
            AUDIT_TEAM_SETTINGS_UPDATED,
            AUDIT_TARGET_TEAM,
            team_id,
            team_id=team_id,
            details=changes,
            commit=False,
        )
    db.session.commit()
    return {"message": "Settings updated", "monthlyBudgetUsd": team.monthly_budget_usd}


def get_team_audit_logs(
    team_id: str, user: User, page: int = 1, page_size: int = 50
) -> Dict[str, Any]:
    get_team_for_admin(team_id, user)
    return list_audit_logs(team_id=team_id, page=page, page_size=page_size)
