"""Organization-level identity policy: SSO enforcement and verified-domain
auto-join."""

import re
from datetime import datetime
from typing import List, Optional

from agents_core.business_logic.audit import record_audit_log
from agents_core.business_logic.teams import claim_pending_invites
from agents_core.constants.audit_actions import (
    AUDIT_TARGET_USER,
    AUDIT_TEAM_MEMBER_AUTO_JOINED,
)
from agents_core.models import Team, TeamInvite, TeamMember, TeamRole, User, db

DOMAIN_PATTERN = re.compile(r"^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$")
SSO_REQUIRED_MESSAGE = (
    "Your organization requires single sign-on. "
    "Continue with Google or Microsoft instead."
)


def email_domain_of(email: str) -> str:
    return email.rsplit("@", 1)[-1].strip().lower()


def normalize_domain(domain: Optional[str]) -> Optional[str]:
    if not domain:
        return None
    normalized = domain.strip().lower().lstrip("@")
    if not DOMAIN_PATTERN.match(normalized):
        raise ValueError("Enter a valid domain, e.g. acme.com")
    return normalized


def ensure_password_login_allowed(email: str, user: Optional[User] = None) -> None:
    """Raise PermissionError when the user's organization requires SSO."""
    domain = email_domain_of(email)
    domain_requires_sso = Team.query.filter(
        Team.email_domain == domain,
        Team.domain_verified.is_(True),
        Team.require_sso.is_(True),
    ).first()
    if domain_requires_sso:
        raise PermissionError(SSO_REQUIRED_MESSAGE)
    if user:
        member_of_sso_team = (
            TeamMember.query.join(Team)
            .filter(TeamMember.user_id == user.id, Team.require_sso.is_(True))
            .first()
        )
        if member_of_sso_team:
            raise PermissionError(SSO_REQUIRED_MESSAGE)


def _seats_available(team: Team) -> bool:
    if team.seat_limit is None:
        return True
    seats_used = (
        TeamMember.query.filter_by(team_id=team.id).count()
        + TeamInvite.query.filter(
            TeamInvite.team_id == team.id,
            TeamInvite.expires_at > datetime.utcnow(),
        ).count()
    )
    return seats_used < team.seat_limit


def auto_join_by_domain(user: User) -> List[str]:
    if not user.email_verified:
        return []
    teams = Team.query.filter(
        Team.email_domain == email_domain_of(user.email),
        Team.domain_verified.is_(True),
        Team.auto_join_domain.is_(True),
        Team.is_suspended.is_(False),
    ).all()
    joined_team_ids = []
    for team in teams:
        if TeamMember.query.filter_by(team_id=team.id, user_id=user.id).first():
            continue
        if not _seats_available(team):
            continue
        db.session.add(
            TeamMember(user_id=user.id, team_id=team.id, role=TeamRole.MEMBER)
        )
        record_audit_log(
            None,
            AUDIT_TEAM_MEMBER_AUTO_JOINED,
            AUDIT_TARGET_USER,
            user.id,
            team_id=team.id,
            details={"email": user.email, "domain": team.email_domain},
            commit=False,
        )
        joined_team_ids.append(team.id)
    if joined_team_ids:
        db.session.commit()
    return joined_team_ids


def join_teams_for_verified_user(user: User) -> List[str]:
    """Run after any event that proves the user owns their email."""
    return claim_pending_invites(user) + auto_join_by_domain(user)


def ensure_domain_available(team: Team, domain: str) -> None:
    conflict = Team.query.filter(
        Team.id != team.id,
        Team.email_domain == domain,
        Team.domain_verified.is_(True),
    ).first()
    if conflict:
        raise ValueError(f"{domain} is already verified by another client")
