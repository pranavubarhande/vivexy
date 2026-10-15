import logging
import re
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List
from urllib.parse import urlencode

from agents_core.models import Chat, Team, TeamInvite, TeamMember, User, db
from agents_core.schemas import TeamCreate, TeamMemberCreate, TeamUpdate
from agents_core.utils.email import send_team_invite_email
from flask import current_app, has_app_context

logger = logging.getLogger(__name__)


def _send_invite_email(invite: TeamInvite, team: Team) -> None:
    frontend_url = (
        current_app.config.get("FRONTEND_URL", "") if has_app_context() else ""
    )
    query = urlencode({"email": invite.email, "invite": invite.token})
    try:
        send_team_invite_email(
            invite.email, team.name, f"{frontend_url}/register?{query}"
        )
    except Exception:
        logger.exception("Failed to send invite email for team %s", team.id)


def claim_pending_invites(user: User) -> List[str]:
    """Turn unexpired invites for a verified email into memberships.

    Only call once the email is proven (verified address or SSO): email
    verification is soft, so claiming earlier would let anyone who registers
    an invitee's address join their team."""
    if not user.email_verified:
        return []

    invites = TeamInvite.query.filter(
        db.func.lower(TeamInvite.email) == user.email.lower(),
        TeamInvite.expires_at > datetime.utcnow(),
    ).all()
    joined_team_ids = []
    for invite in invites:
        already_member = TeamMember.query.filter_by(
            team_id=invite.team_id, user_id=user.id
        ).first()
        if not already_member:
            db.session.add(
                TeamMember(user_id=user.id, team_id=invite.team_id, role=invite.role)
            )
            joined_team_ids.append(invite.team_id)
        db.session.delete(invite)
    if invites:
        db.session.commit()
    return joined_team_ids


def bulk_invite_members(
    team_id: str, emails: List[str], role, invited_by: str
) -> Dict[str, Any]:
    results = {"added": [], "invited": [], "skipped": []}
    seen = set()
    for raw_email in emails:
        email = raw_email.strip().lower()
        if not email or email in seen:
            continue
        seen.add(email)
        try:
            outcome = add_team_member(
                team_id, TeamMemberCreate(email=email, role=role), invited_by
            )
            results["invited" if outcome.get("invited") else "added"].append(email)
        except ValueError as error:
            results["skipped"].append({"email": email, "reason": str(error)})
    return results


def slugify(text: str) -> str:
    """Convert text to slug format."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text.strip("-")


def get_user_teams(user_id: str) -> List[Dict[str, Any]]:
    """Get all teams for a user (owned or member)."""
    # Get teams where user is owner
    owned_teams = Team.query.filter_by(owner_id=user_id).all()

    # Get teams where user is member
    member_teams = (
        Team.query.join(TeamMember).filter(TeamMember.user_id == user_id).all()
    )

    # Combine and deduplicate
    all_teams = list(set(owned_teams + member_teams))

    teams_data = []
    for team in all_teams:
        owner = User.query.filter_by(id=team.owner_id).first()
        members = TeamMember.query.filter_by(team_id=team.id).all()
        member_count = len(members)

        teams_data.append(
            {
                "id": team.id,
                "name": team.name,
                "description": team.description,
                "slug": team.slug,
                "owner": (
                    {
                        "id": owner.id,
                        "name": owner.name,
                        "email": owner.email,
                    }
                    if owner
                    else None
                ),
                "members": [
                    {
                        "id": member.id,
                        "user": {
                            "id": member.user.id,
                            "name": member.user.name,
                            "email": member.user.email,
                        },
                        "role": member.role.value,
                        "joinedAt": member.joined_at.isoformat(),
                    }
                    for member in members
                ],
                "_count": {
                    "members": member_count,
                },
                "createdAt": team.created_at.isoformat(),
                "updatedAt": team.updated_at.isoformat(),
            }
        )

    return teams_data


def create_team(team_data: TeamCreate, owner_id: str) -> Dict[str, Any]:
    """Create a new team."""
    # Check if user already has a team with this name
    existing_team = Team.query.filter(
        Team.owner_id == owner_id, Team.name.ilike(team_data.name)
    ).first()

    if existing_team:
        raise ValueError("You already have a team with this name")

    # Create team
    team = Team(
        name=team_data.name,
        description=team_data.description,
        slug=slugify(team_data.name),
        owner_id=owner_id,
    )

    db.session.add(team)
    db.session.flush()  # Get the team ID

    # Add owner as member
    owner_member = TeamMember(user_id=owner_id, team_id=team.id, role="OWNER")
    db.session.add(owner_member)
    db.session.commit()

    # Return team data
    owner = User.query.filter_by(id=owner_id).first()
    return {
        "id": team.id,
        "name": team.name,
        "description": team.description,
        "slug": team.slug,
        "owner": (
            {
                "id": owner.id,
                "name": owner.name,
                "email": owner.email,
            }
            if owner
            else None
        ),
        "members": [
            {
                "id": owner_member.id,
                "user": {
                    "id": owner.id,
                    "name": owner.name,
                    "email": owner.email,
                },
                "role": "OWNER",
                "joinedAt": owner_member.joined_at.isoformat(),
            }
        ],
        "_count": {
            "members": 1,
        },
        "createdAt": team.created_at.isoformat(),
        "updatedAt": team.updated_at.isoformat(),
    }


def get_team(team_id: str, user_id: str) -> Dict[str, Any]:
    """Get a specific team with access check."""
    team = Team.query.filter(
        Team.id == team_id,
        db.or_(Team.owner_id == user_id, Team.members.any(user_id=user_id)),
    ).first()

    if not team:
        raise ValueError("Team not found or access denied")

    owner = User.query.filter_by(id=team.owner_id).first()
    members = TeamMember.query.filter_by(team_id=team.id).all()
    member_count = len(members)

    return {
        "id": team.id,
        "name": team.name,
        "description": team.description,
        "slug": team.slug,
        "owner": (
            {
                "id": owner.id,
                "name": owner.name,
                "email": owner.email,
            }
            if owner
            else None
        ),
        "members": [
            {
                "id": member.id,
                "user": {
                    "id": member.user.id,
                    "name": member.user.name,
                    "email": member.user.email,
                },
                "role": member.role.value,
                "joinedAt": member.joined_at.isoformat(),
            }
            for member in members
        ],
        "_count": {
            "members": member_count,
        },
        "createdAt": team.created_at.isoformat(),
        "updatedAt": team.updated_at.isoformat(),
    }


def update_team(team_id: str, team_data: TeamUpdate, user_id: str) -> Dict[str, Any]:
    """Update a team."""
    # Check if user is owner or admin
    team_member = TeamMember.query.filter(
        TeamMember.team_id == team_id,
        TeamMember.user_id == user_id,
        TeamMember.role.in_(["OWNER", "ADMIN"]),
    ).first()

    if not team_member:
        raise ValueError("Access denied. Only team owners and admins can update teams.")

    team = Team.query.filter_by(id=team_id).first()
    if not team:
        raise ValueError("Team not found")

    # Update fields
    if team_data.name is not None:
        team.name = team_data.name
        team.slug = slugify(team_data.name)
    if team_data.description is not None:
        team.description = team_data.description

    team.updated_at = datetime.utcnow()
    db.session.commit()

    # Return updated team data
    return get_team(team_id, user_id)


def delete_team(team_id: str, user_id: str) -> Dict[str, Any]:
    """Delete a team."""
    team = Team.query.filter_by(id=team_id, owner_id=user_id).first()
    if not team:
        raise ValueError("Access denied. Only team owners can delete teams.")

    Chat.query.filter_by(team_id=team_id).update({Chat.team_id: None})

    # Delete team invites first (due to foreign key constraint)
    TeamInvite.query.filter_by(team_id=team_id).delete()

    # Delete team members (cascade should handle this, but being explicit)
    TeamMember.query.filter_by(team_id=team_id).delete()

    # Delete the team
    db.session.delete(team)
    db.session.commit()

    return {"message": "Team deleted successfully"}


def get_team_members(team_id: str, user_id: str) -> List[Dict[str, Any]]:
    """Get team members."""
    # Check access
    team_member = TeamMember.query.filter(
        TeamMember.team_id == team_id, TeamMember.user_id == user_id
    ).first()

    if not team_member:
        raise ValueError("Access denied")

    members = (
        TeamMember.query.filter_by(team_id=team_id)
        .order_by(TeamMember.role.desc(), TeamMember.joined_at.asc())
        .all()
    )

    return [
        {
            "id": member.id,
            "user": {
                "id": member.user.id,
                "name": member.user.name,
                "email": member.user.email,
                "avatar": member.user.avatar,
            },
            "role": member.role.value,
            "joinedAt": member.joined_at.isoformat(),
        }
        for member in members
    ]


def add_team_member(
    team_id: str, member_data: TeamMemberCreate, invited_by: str
) -> Dict[str, Any]:
    """Add a member to the team."""
    # Check if inviter is owner or admin
    team_member = TeamMember.query.filter(
        TeamMember.team_id == team_id,
        TeamMember.user_id == invited_by,
        TeamMember.role.in_(["OWNER", "ADMIN"]),
    ).first()

    if not team_member:
        raise ValueError(
            "Access denied. Only team owners and admins can invite members."
        )

    team = Team.query.get(team_id)
    if team.is_suspended:
        raise ValueError("This team is suspended. Contact support.")
    if team.seat_limit is not None:
        seats_used = (
            TeamMember.query.filter_by(team_id=team_id).count()
            + TeamInvite.query.filter(
                TeamInvite.team_id == team_id,
                TeamInvite.expires_at > datetime.utcnow(),
            ).count()
        )
        if seats_used >= team.seat_limit:
            raise ValueError(
                f"Seat limit reached ({team.seat_limit}). Contact support to add seats."
            )

    # Check if user is already a member
    existing_member = TeamMember.query.filter(
        TeamMember.team_id == team_id, TeamMember.user.has(email=member_data.email)
    ).first()

    if existing_member:
        raise ValueError("User is already a member of this team")

    # Check if there's already a pending invite
    existing_invite = TeamInvite.query.filter(
        TeamInvite.team_id == team_id, TeamInvite.email == member_data.email
    ).first()

    if existing_invite:
        raise ValueError("There is already a pending invite for this email")

    # Check if the invited user exists
    invited_user = User.query.filter_by(email=member_data.email).first()

    if invited_user:
        # Add user directly as member
        new_member = TeamMember(
            user_id=invited_user.id, team_id=team_id, role=member_data.role
        )
        db.session.add(new_member)
        db.session.commit()

        return {
            "message": "Member added successfully",
            "member": {
                "id": new_member.id,
                "user": {
                    "id": invited_user.id,
                    "name": invited_user.name,
                    "email": invited_user.email,
                },
                "role": new_member.role.value,
                "joinedAt": new_member.joined_at.isoformat(),
            },
        }
    else:
        token = str(uuid.uuid4())
        expires_at = datetime.utcnow() + timedelta(days=7)

        invite = TeamInvite(
            email=member_data.email,
            role=member_data.role,
            token=token,
            team_id=team_id,
            invited_by=invited_by,
            expires_at=expires_at,
        )
        db.session.add(invite)
        db.session.commit()
        _send_invite_email(invite, team)

        return {"message": "Invite sent successfully", "invited": True}


def remove_team_member(
    team_id: str, member_user_id: str, requester_id: str
) -> Dict[str, Any]:
    """Remove a member from the team."""
    # Check if requester is owner or admin
    team_member = TeamMember.query.filter(
        TeamMember.team_id == team_id,
        TeamMember.user_id == requester_id,
        TeamMember.role.in_(["OWNER", "ADMIN"]),
    ).first()

    if not team_member:
        raise ValueError(
            "Access denied. Only team owners and admins can remove members."
        )

    team = Team.query.filter_by(id=team_id).first()
    if not team:
        raise ValueError("Team not found")

    # Prevent removing the team owner
    if member_user_id == team.owner_id:
        raise ValueError("Cannot remove the team owner")

    # Find the member
    member = TeamMember.query.filter(
        TeamMember.team_id == team_id, TeamMember.user_id == member_user_id
    ).first()

    if not member:
        raise ValueError("Member not found")

    db.session.delete(member)
    db.session.commit()

    return {"message": "Member removed successfully"}


def get_team_features(team_id: str, user_id: str) -> Dict[str, bool]:
    membership = TeamMember.query.filter_by(team_id=team_id, user_id=user_id).first()
    if not membership:
        raise ValueError("Access denied")
    return membership.team.feature_flags or {}


def team_has_feature(team_id: str, flag: str, default: bool = False) -> bool:
    team = Team.query.get(team_id) if team_id else None
    if not team or not team.feature_flags:
        return default
    return bool(team.feature_flags.get(flag, default))
