from datetime import datetime
from typing import Any, Dict, List

from agents_core.business_logic.audit import record_audit_log
from agents_core.constants.audit_actions import (
    AUDIT_ANNOUNCEMENT_CREATED,
    AUDIT_ANNOUNCEMENT_DELETED,
    AUDIT_ANNOUNCEMENT_UPDATED,
    AUDIT_TARGET_ANNOUNCEMENT,
)
from agents_core.models import Announcement, TeamMember, User, db
from agents_core.schemas import AnnouncementCreate, AnnouncementUpdate


def get_active_announcements(user: User) -> List[Dict[str, Any]]:
    now = datetime.utcnow()
    team_ids = [
        row[0]
        for row in db.session.query(TeamMember.team_id)
        .filter(TeamMember.user_id == user.id)
        .all()
    ]
    announcements = (
        Announcement.query.filter(
            Announcement.is_active.is_(True),
            db.or_(Announcement.starts_at.is_(None), Announcement.starts_at <= now),
            db.or_(Announcement.ends_at.is_(None), Announcement.ends_at > now),
            db.or_(
                Announcement.team_id.is_(None),
                Announcement.team_id.in_(team_ids or [""]),
            ),
        )
        .order_by(Announcement.created_at.desc())
        .all()
    )
    return [announcement.to_dict() for announcement in announcements]


def list_announcements() -> List[Dict[str, Any]]:
    return [
        announcement.to_dict()
        for announcement in Announcement.query.order_by(
            Announcement.created_at.desc()
        ).all()
    ]


def create_announcement(payload: AnnouncementCreate, actor: User) -> Dict[str, Any]:
    announcement = Announcement(**payload.model_dump(), created_by=actor.id)
    db.session.add(announcement)
    db.session.flush()
    record_audit_log(
        actor,
        AUDIT_ANNOUNCEMENT_CREATED,
        AUDIT_TARGET_ANNOUNCEMENT,
        announcement.id,
        team_id=announcement.team_id,
        details={"title": announcement.title},
        commit=False,
    )
    db.session.commit()
    return announcement.to_dict()


def update_announcement(
    announcement_id: str, payload: AnnouncementUpdate, actor: User
) -> Dict[str, Any]:
    announcement = Announcement.query.get(announcement_id)
    if not announcement:
        raise LookupError("Announcement not found")
    for field in payload.model_fields_set:
        setattr(announcement, field, getattr(payload, field))
    record_audit_log(
        actor,
        AUDIT_ANNOUNCEMENT_UPDATED,
        AUDIT_TARGET_ANNOUNCEMENT,
        announcement.id,
        team_id=announcement.team_id,
        details={
            "title": announcement.title,
            "fields": sorted(payload.model_fields_set),
        },
        commit=False,
    )
    db.session.commit()
    return announcement.to_dict()


def delete_announcement(announcement_id: str, actor: User) -> Dict[str, Any]:
    announcement = Announcement.query.get(announcement_id)
    if not announcement:
        raise LookupError("Announcement not found")
    record_audit_log(
        actor,
        AUDIT_ANNOUNCEMENT_DELETED,
        AUDIT_TARGET_ANNOUNCEMENT,
        announcement.id,
        team_id=announcement.team_id,
        details={"title": announcement.title},
        commit=False,
    )
    db.session.delete(announcement)
    db.session.commit()
    return {"message": "Announcement deleted"}
