"""Chat deletion, retention purges and GDPR export / erasure."""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List

from agents_core.business_logic.audit import record_audit_log
from agents_core.constants.audit_actions import (
    AUDIT_TARGET_USER,
    AUDIT_USER_DATA_EXPORTED,
    AUDIT_USER_ERASED,
)
from agents_core.models import (
    Artifact,
    Chat,
    ChatAttachment,
    ChatCheckpoint,
    Message,
    ProjectChat,
    ScheduledTask,
    ScheduledTaskRun,
    Team,
    TeamInvite,
    TeamMember,
    Todo,
    TokenUsage,
    User,
    UserApiKey,
    UserSkill,
    db,
)
from agents_core.services.s3_service import S3Service

logger = logging.getLogger(__name__)

MIN_RETENTION_DAYS = 7


def _delete_agent_state(chat_ids: List[str]) -> None:
    """Drop the LangGraph checkpoints in Redis (thread_id == chat_id)."""
    try:
        from agents_core.agents.agent_factory import get_global_checkpointer

        checkpointer = get_global_checkpointer()
    except Exception:
        logger.exception("Checkpointer unavailable; agent state left in Redis")
        return
    for chat_id in chat_ids:
        try:
            checkpointer.delete_thread(chat_id)
        except Exception:
            logger.exception("Failed to delete agent state for chat %s", chat_id)


def hard_delete_chats(chat_ids: Iterable[str], delete_files: bool = True) -> int:
    """Delete chats and everything hanging off them, in FK-safe order, plus
    their stored files and the agent's saved conversation state.

    Token usage rows are kept (detached from their message) so spend history
    and invoices stay correct after content is gone."""
    chat_ids = list(chat_ids)
    if not chat_ids:
        return 0

    message_ids = db.session.query(Message.id).filter(Message.chat_id.in_(chat_ids))
    TokenUsage.query.filter(TokenUsage.message_id.in_(message_ids)).update(
        {TokenUsage.message_id: None}, synchronize_session=False
    )
    ScheduledTaskRun.query.filter(ScheduledTaskRun.chat_id.in_(chat_ids)).update(
        {ScheduledTaskRun.chat_id: None}, synchronize_session=False
    )
    for model in (ProjectChat, ChatCheckpoint, ChatAttachment, Artifact):
        model.query.filter(model.chat_id.in_(chat_ids)).delete(
            synchronize_session=False
        )
    Todo.query.filter(Todo.chat_id.in_(chat_ids)).delete(synchronize_session=False)
    Message.query.filter(Message.chat_id.in_(chat_ids)).delete(
        synchronize_session=False
    )
    deleted = Chat.query.filter(Chat.id.in_(chat_ids)).delete(synchronize_session=False)
    db.session.commit()

    _delete_agent_state(chat_ids)
    if delete_files:
        storage = S3Service()
        for chat_id in chat_ids:
            try:
                storage.delete_chat_files(chat_id)
            except Exception:
                logger.exception("Failed to delete stored files for chat %s", chat_id)
    return deleted


def purge_expired_team_chats(now: datetime | None = None) -> Dict[str, int]:
    """Apply each team's retention policy. Returns deleted chat counts by team."""
    now = now or datetime.utcnow()
    results = {}
    for team in Team.query.filter(Team.retention_days.isnot(None)).all():
        cutoff = now - timedelta(days=max(team.retention_days, MIN_RETENTION_DAYS))
        expired_ids = [
            row[0]
            for row in db.session.query(Chat.id)
            .filter(Chat.team_id == team.id, Chat.updated_at < cutoff)
            .all()
        ]
        if expired_ids:
            results[team.id] = hard_delete_chats(expired_ids)
    return results


def _iso(value):
    return value.isoformat() if value else None


def export_user_data(user_id: str, actor: User | None = None) -> Dict[str, Any]:
    user = User.query.get(user_id)
    if not user:
        raise LookupError("User not found")

    chats = Chat.query.filter_by(user_id=user_id).order_by(Chat.created_at).all()
    messages_by_chat: Dict[str, List[Message]] = {}
    for message in (
        Message.query.filter(Message.chat_id.in_([chat.id for chat in chats] or [""]))
        .order_by(Message.created_at)
        .all()
    ):
        messages_by_chat.setdefault(message.chat_id, []).append(message)

    export = {
        "exportedAt": datetime.utcnow().isoformat(),
        "profile": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role.value,
            "emailVerified": user.email_verified,
            "oauthProvider": user.oauth_provider,
            "createdAt": _iso(user.created_at),
            "lastLoginAt": _iso(user.last_login_at),
        },
        "teams": [
            {
                "teamId": membership.team_id,
                "teamName": membership.team.name,
                "role": membership.role.value,
                "joinedAt": _iso(membership.joined_at),
            }
            for membership in TeamMember.query.filter_by(user_id=user_id).all()
        ],
        "chats": [
            {
                "id": chat.id,
                "title": chat.title,
                "teamId": chat.team_id,
                "createdAt": _iso(chat.created_at),
                "messages": [
                    {
                        "role": message.role.value,
                        "content": message.content,
                        "createdAt": _iso(message.created_at),
                    }
                    for message in messages_by_chat.get(chat.id, [])
                ],
            }
            for chat in chats
        ],
        "usage": [
            {
                "createdAt": _iso(usage.created_at),
                "model": usage.model_name,
                "totalTokens": usage.total_tokens,
                "costUsd": usage.total_cost_usd,
            }
            for usage in TokenUsage.query.filter_by(user_id=user_id)
            .order_by(TokenUsage.created_at)
            .all()
        ],
    }
    if actor:
        record_audit_log(
            actor,
            AUDIT_USER_DATA_EXPORTED,
            AUDIT_TARGET_USER,
            user_id,
            details={"email": user.email},
        )
    return export


def erase_user(user_id: str, actor: User, allow_self: bool = False) -> Dict[str, Any]:
    """GDPR erasure: delete content and personal data, keep an anonymized row
    so usage totals and audit history stay consistent."""
    user = User.query.get(user_id)
    if not user:
        raise LookupError("User not found")
    if user.id == actor.id and not allow_self:
        raise ValueError("You cannot erase your own account from here")
    if user.deleted_at:
        raise ValueError("This user has already been erased")

    owned_teams = Team.query.filter_by(owner_id=user.id).all()
    for team in owned_teams:
        other_members = TeamMember.query.filter(
            TeamMember.team_id == team.id, TeamMember.user_id != user.id
        ).count()
        if other_members:
            raise ValueError(
                f"{user.email} owns {team.name}, which has other members. "
                "Transfer ownership or remove the members first."
            )

    original_email = user.email
    deleted_chats = hard_delete_chats(
        [row[0] for row in db.session.query(Chat.id).filter_by(user_id=user.id)]
    )
    for team in owned_teams:
        Chat.query.filter_by(team_id=team.id).update({Chat.team_id: None})
        TeamInvite.query.filter_by(team_id=team.id).delete()
        TeamMember.query.filter_by(team_id=team.id).delete()
        db.session.delete(team)
    TeamMember.query.filter_by(user_id=user.id).delete()
    UserApiKey.query.filter_by(user_id=user.id).delete()
    UserSkill.query.filter_by(user_id=user.id).delete()
    ScheduledTask.query.filter_by(user_id=user.id).update(
        {ScheduledTask.is_active: False}
    )

    user.email = f"erased-{user.id}@erased.invalid"
    user.name = None
    user.avatar = None
    user.password = None
    user.oauth_provider = None
    user.oauth_subject_id = None
    user.is_suspended = True
    user.deleted_at = datetime.utcnow()

    record_audit_log(
        actor,
        AUDIT_USER_ERASED,
        AUDIT_TARGET_USER,
        user.id,
        details={"deletedChats": deleted_chats, "ownedTeamsDeleted": len(owned_teams)},
        commit=False,
    )
    db.session.commit()
    logger.info("Erased user %s (%s)", user.id, original_email)
    return {"message": "User erased", "deletedChats": deleted_chats}
