import uuid
from typing import List

from agents_core.models.base import db
from agents_core.models.skill import UserSkill
from agents_core.schemas.skill import UserSkillCreate, UserSkillUpdate


def get_user_skills(user_id: str) -> List[UserSkill]:
    return (
        UserSkill.query.filter_by(user_id=user_id).order_by(UserSkill.created_at).all()
    )


def upsert_user_skill(user_id: str, data: UserSkillCreate) -> UserSkill:
    skill_id = data.id or str(uuid.uuid4())
    skill = UserSkill.query.filter_by(id=skill_id, user_id=user_id).first()

    if skill:
        if data.description is not None:
            skill.description = data.description
        if data.content is not None:
            skill.content = data.content
        skill.files = data.files
        skill.enabled = data.enabled
        skill.platform = data.platform
    else:
        skill = UserSkill(
            id=skill_id,
            user_id=user_id,
            name=data.name,
            description=data.description or "",
            content=data.content,
            files=data.files,
            enabled=data.enabled,
            platform=data.platform,
        )
        db.session.add(skill)

    db.session.commit()
    db.session.refresh(skill)
    return skill


def update_user_skill(
    user_id: str, skill_id: str, data: UserSkillUpdate
) -> UserSkill | None:
    skill = UserSkill.query.filter_by(id=skill_id, user_id=user_id).first()
    if not skill:
        return None

    if data.description is not None:
        skill.description = data.description
    if data.content is not None:
        skill.content = data.content
    if data.files is not None:
        skill.files = data.files
    if data.enabled is not None:
        skill.enabled = data.enabled
    if data.platform is not None:
        skill.platform = data.platform

    db.session.commit()
    db.session.refresh(skill)
    return skill


def delete_user_skill(user_id: str, skill_id: str) -> bool:
    skill = UserSkill.query.filter_by(id=skill_id, user_id=user_id).first()
    if not skill:
        return False

    db.session.delete(skill)
    db.session.commit()
    return True
