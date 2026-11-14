from typing import Any, Dict, List, Optional

from agents_core.business_logic.audit import record_audit_log
from agents_core.constants.audit_actions import (
    AUDIT_PROMPT_CREATED,
    AUDIT_PROMPT_DELETED,
    AUDIT_PROMPT_UPDATED,
    AUDIT_TARGET_PROMPT,
)
from agents_core.constants.prompts import (
    PROMPT_BUILT_IN_PREFIX,
    PROMPT_FIELD_CHOICE,
    PROMPT_VISIBILITY_PERSONAL,
    PROMPT_VISIBILITY_TEAM,
)
from agents_core.library.registry import built_in_prompts
from agents_core.library.types import PromptTemplate
from agents_core.models import Prompt, TeamMember, TeamRole, User, db
from agents_core.schemas.prompt import PLACEHOLDER, PromptInput

SOURCE_BUILT_IN = "built_in"
SOURCE_TEAM = "team"
SOURCE_PERSONAL = "personal"
ADMIN_ROLES = (TeamRole.OWNER, TeamRole.ADMIN)


class PromptNotFoundError(LookupError):
    pass


class PromptAccessError(PermissionError):
    pass


class PromptValidationError(ValueError):
    pass


def _membership(user: User, team_id: Optional[str]) -> Optional[TeamMember]:
    if not team_id:
        return None
    membership = TeamMember.query.filter_by(user_id=user.id, team_id=team_id).first()
    if membership is None:
        raise PromptAccessError("You are not a member of this team")
    return membership


def _is_admin(membership: Optional[TeamMember]) -> bool:
    return membership is not None and membership.role in ADMIN_ROLES


def _built_in_to_dict(template: PromptTemplate) -> Dict[str, Any]:
    return {
        "id": f"{PROMPT_BUILT_IN_PREFIX}{template.key}",
        "source": SOURCE_BUILT_IN,
        "title": template.title,
        "description": template.description,
        "category": template.category,
        "body": template.body,
        "fields": [field.to_dict() for field in template.fields],
        "teamId": None,
        "ownerId": None,
        "canEdit": False,
        "useCount": 0,
        "updatedAt": None,
    }


def _prompt_to_dict(prompt: Prompt, can_edit: bool) -> Dict[str, Any]:
    return {
        "id": prompt.id,
        "source": (
            SOURCE_TEAM
            if prompt.visibility == PROMPT_VISIBILITY_TEAM
            else SOURCE_PERSONAL
        ),
        "title": prompt.title,
        "description": prompt.description,
        "category": prompt.category,
        "body": prompt.body,
        "fields": prompt.fields or [],
        "teamId": prompt.team_id,
        "ownerId": prompt.owner_id,
        "canEdit": can_edit,
        "useCount": prompt.use_count,
        "updatedAt": prompt.updated_at.isoformat() if prompt.updated_at else None,
    }


def _can_edit(prompt: Prompt, user: User) -> bool:
    if prompt.visibility == PROMPT_VISIBILITY_TEAM:
        membership = TeamMember.query.filter_by(
            user_id=user.id, team_id=prompt.team_id
        ).first()
        return _is_admin(membership)
    return prompt.owner_id == user.id


def _matches(prompt: Dict[str, Any], category: Optional[str], search: str) -> bool:
    if category and prompt["category"] != category:
        return False
    if not search:
        return True
    haystack = " ".join(
        [prompt["title"], prompt["description"] or "", prompt["category"] or ""]
    ).lower()
    return all(word in haystack for word in search.lower().split())


def list_prompts(
    user: User,
    team_id: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
) -> Dict[str, Any]:
    """Built-in prompts, the team's shared prompts and the user's own."""
    membership = _membership(user, team_id)
    stored = Prompt.query.filter(
        Prompt.owner_id == user.id, Prompt.visibility == PROMPT_VISIBILITY_PERSONAL
    ).all()
    if team_id:
        stored += Prompt.query.filter_by(
            team_id=team_id, visibility=PROMPT_VISIBILITY_TEAM
        ).all()
    prompts = [
        *(_built_in_to_dict(template) for template in built_in_prompts().values()),
        *(
            _prompt_to_dict(
                prompt,
                (
                    _is_admin(membership)
                    if prompt.visibility == PROMPT_VISIBILITY_TEAM
                    else True
                ),
            )
            for prompt in sorted(stored, key=lambda p: p.title.lower())
        ),
    ]
    categories = sorted({p["category"] for p in prompts if p["category"]})
    return {
        "prompts": [p for p in prompts if _matches(p, category, search or "")],
        "categories": categories,
        "canManageTeamPrompts": _is_admin(membership),
    }


def _load_stored(prompt_id: str, user: User) -> Prompt:
    prompt = db.session.get(Prompt, prompt_id)
    if prompt is None:
        raise PromptNotFoundError("Prompt not found")
    if prompt.visibility == PROMPT_VISIBILITY_TEAM:
        try:
            _membership(user, prompt.team_id)
        except PromptAccessError:
            raise PromptNotFoundError("Prompt not found")
    elif prompt.owner_id != user.id:
        raise PromptNotFoundError("Prompt not found")
    return prompt


def get_prompt(prompt_id: str, user: User) -> Dict[str, Any]:
    if prompt_id.startswith(PROMPT_BUILT_IN_PREFIX):
        template = built_in_prompts().get(prompt_id[len(PROMPT_BUILT_IN_PREFIX) :])
        if template is None:
            raise PromptNotFoundError("Prompt not found")
        return _built_in_to_dict(template)
    prompt = _load_stored(prompt_id, user)
    return _prompt_to_dict(prompt, _can_edit(prompt, user))


def _apply(prompt: Prompt, data: PromptInput) -> None:
    prompt.title = data.title
    prompt.description = (data.description or "").strip() or None
    prompt.category = (data.category or "").strip() or None
    prompt.body = data.body
    prompt.fields = [field.model_dump() for field in data.fields]


def _audit(user: User, action: str, prompt: Prompt) -> None:
    record_audit_log(
        user,
        action,
        AUDIT_TARGET_PROMPT,
        target_id=prompt.id,
        team_id=prompt.team_id,
        details={"title": prompt.title, "visibility": prompt.visibility},
        commit=False,
    )


def _check_can_share(user: User, visibility: str, team_id: Optional[str]) -> None:
    if visibility != PROMPT_VISIBILITY_TEAM:
        return
    if not team_id:
        raise PromptValidationError("Choose the team to share this prompt with")
    if not _is_admin(_membership(user, team_id)):
        raise PromptAccessError("Only team admins can share prompts with the team")


def create_prompt(user: User, data: PromptInput) -> Dict[str, Any]:
    team_id = data.team_id if data.visibility == PROMPT_VISIBILITY_TEAM else None
    _check_can_share(user, data.visibility, team_id)
    prompt = Prompt(owner_id=user.id, team_id=team_id, visibility=data.visibility)
    _apply(prompt, data)
    db.session.add(prompt)
    db.session.flush()
    _audit(user, AUDIT_PROMPT_CREATED, prompt)
    db.session.commit()
    return _prompt_to_dict(prompt, True)


def update_prompt(prompt_id: str, user: User, data: PromptInput) -> Dict[str, Any]:
    prompt = _load_stored(prompt_id, user)
    if not _can_edit(prompt, user):
        raise PromptAccessError("Only team admins can change team prompts")
    if data.visibility != prompt.visibility:
        raise PromptValidationError(
            "Duplicate the prompt to share it or keep a personal copy"
        )
    _apply(prompt, data)
    _audit(user, AUDIT_PROMPT_UPDATED, prompt)
    db.session.commit()
    return _prompt_to_dict(prompt, True)


def duplicate_prompt(
    prompt_id: str, user: User, visibility: str, team_id: Optional[str]
) -> Dict[str, Any]:
    """Copies any prompt the user can see, built-in ones included, as a
    personal prompt or, for team admins, a team prompt."""
    source = get_prompt(prompt_id, user)
    data = PromptInput(
        title=source["title"],
        description=source["description"],
        category=source["category"],
        body=source["body"],
        fields=source["fields"],
        visibility=visibility,
        teamId=team_id,
    )
    return create_prompt(user, data)


def delete_prompt(prompt_id: str, user: User) -> None:
    prompt = _load_stored(prompt_id, user)
    if not _can_edit(prompt, user):
        raise PromptAccessError("Only team admins can delete team prompts")
    _audit(user, AUDIT_PROMPT_DELETED, prompt)
    db.session.delete(prompt)
    db.session.commit()


def fill_template(body: str, fields: List[Dict[str, Any]], values: Dict[str, str]):
    """The prompt text with every {{key}} replaced by its value. Raises
    PromptValidationError for a missing required value or an unknown choice."""
    by_key = {field["key"]: field for field in fields}
    clean: Dict[str, str] = {}
    for key, field in by_key.items():
        value = (values.get(key) or "").strip()
        if not value and field.get("required", True):
            raise PromptValidationError(f"Fill in {field['label']}")
        if (
            value
            and field.get("type") == PROMPT_FIELD_CHOICE
            and value not in field.get("options", [])
        ):
            raise PromptValidationError(
                f"Choose one of the options for {field['label']}"
            )
        clean[key] = value
    return PLACEHOLDER.sub(lambda match: clean.get(match.group(1), ""), body).strip()


def render_prompt(prompt_id: str, user: User, values: Dict[str, str]) -> Dict[str, Any]:
    """Fills in a prompt so it can be sent to the assistant, and counts the
    use for stored prompts."""
    prompt = get_prompt(prompt_id, user)
    text = fill_template(prompt["body"], prompt["fields"], values)
    if prompt["source"] != SOURCE_BUILT_IN:
        Prompt.query.filter_by(id=prompt_id).update(
            {Prompt.use_count: Prompt.use_count + 1}
        )
        db.session.commit()
    return {"text": text}
