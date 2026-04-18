import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List

import yaml
from flask import Blueprint, jsonify, request

from app.business_logic.skills import (
    delete_user_skill,
    get_user_skills,
    update_user_skill,
    upsert_user_skill,
)
from app.middlewares.auth import auth_middleware
from app.schemas.skill import UserSkillCreate, UserSkillUpdate

logger = logging.getLogger(__name__)

bp = Blueprint("skills", __name__, url_prefix="/skills")

SKILLS_DIR = Path(os.path.dirname(os.path.dirname(__file__))) / "skills"


def _parse_frontmatter(raw: str) -> tuple[Dict[str, Any], str]:
    match = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$", raw.strip())
    if not match:
        return {}, raw.strip()

    try:
        fm = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError:
        fm = {}

    body = match.group(2).strip()
    return fm, body


def _load_skill_folder(folder: Path) -> Dict[str, Any] | None:
    main_file = folder / "SKILL.md"
    if not main_file.exists():
        return None

    try:
        raw = main_file.read_text(encoding="utf-8")
    except OSError:
        return None

    fm, body = _parse_frontmatter(raw)
    if not fm.get("name"):
        return None

    meta = fm.get("metadata", {}) or {}

    files: Dict[str, str] = {}
    try:
        for f in folder.iterdir():
            if f.is_file() and f.name != "SKILL.md" and f.suffix == ".md":
                try:
                    files[f.name] = f.read_text(encoding="utf-8")
                except OSError:
                    pass
    except OSError:
        pass

    return {
        "name": fm["name"],
        "displayName": meta.get("displayName", fm["name"]),
        "description": fm.get("description", ""),
        "category": meta.get("category", "general"),
        "tags": meta.get("tags", []),
        "official": bool(meta.get("official", False)),
        "content": body,
        "files": files if files else None,
    }


def get_official_skills() -> List[Dict[str, Any]]:
    skills: List[Dict[str, Any]] = []
    if not SKILLS_DIR.exists():
        return skills

    for entry in sorted(SKILLS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        skill = _load_skill_folder(entry)
        if skill and skill.get("official"):
            skills.append(skill)

    return skills


@bp.route("/catalog", methods=["GET"])
def get_catalog():
    try:
        return jsonify(get_official_skills())
    except Exception as e:
        logger.exception("Error loading skills catalog")
        return jsonify({"error": str(e)}), 500


@bp.route("/user", methods=["GET"])
@auth_middleware
def list_user_skills():
    try:
        skills = get_user_skills(request.user.id)
        return jsonify(
            [
                {
                    "id": s.id,
                    "name": s.name,
                    "description": s.description,
                    "content": s.content,
                    "files": s.files,
                    "enabled": s.enabled,
                    "platform": s.platform,
                }
                for s in skills
            ]
        )
    except Exception as e:
        logger.exception("Error listing user skills")
        return jsonify({"error": str(e)}), 500


@bp.route("/user", methods=["POST"])
@auth_middleware
def save_user_skill():
    try:
        body = request.get_json() or {}
        data = UserSkillCreate(**body)
        skill = upsert_user_skill(request.user.id, data)
        return (
            jsonify(
                {
                    "id": skill.id,
                    "name": skill.name,
                    "description": skill.description,
                    "content": skill.content,
                    "files": skill.files,
                    "enabled": skill.enabled,
                    "platform": skill.platform,
                }
            ),
            201,
        )
    except Exception as e:
        logger.exception("Error saving user skill")
        return jsonify({"error": str(e)}), 500


@bp.route("/user/<skill_id>", methods=["PUT"])
@auth_middleware
def update_skill(skill_id: str):
    try:
        body = request.get_json() or {}
        data = UserSkillUpdate(**body)
        skill = update_user_skill(request.user.id, skill_id, data)
        if not skill:
            return jsonify({"error": "Skill not found"}), 404
        return jsonify(
            {
                "id": skill.id,
                "name": skill.name,
                "description": skill.description,
                "content": skill.content,
                "files": skill.files,
                "enabled": skill.enabled,
                "platform": skill.platform,
            }
        )
    except Exception as e:
        logger.exception("Error updating user skill")
        return jsonify({"error": str(e)}), 500


@bp.route("/user/<skill_id>", methods=["DELETE"])
@auth_middleware
def delete_skill(skill_id: str):
    try:
        deleted = delete_user_skill(request.user.id, skill_id)
        if not deleted:
            return jsonify({"error": "Skill not found"}), 404
        return jsonify({"success": True})
    except Exception as e:
        logger.exception("Error deleting user skill")
        return jsonify({"error": str(e)}), 500
