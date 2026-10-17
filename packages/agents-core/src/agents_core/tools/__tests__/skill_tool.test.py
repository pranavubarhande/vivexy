import json
from unittest.mock import MagicMock

import pytest
from agents_core.agents.agent_factory import build_skills_context
from agents_core.agents.skill_loader import SandboxSkillSync, load_builtin_skills
from agents_core.business_logic.skills import get_agent_skills
from agents_core.models import User, UserSkill, db
from agents_core.tools.chat.skill_tool import (
    get_load_skill_tool,
    get_save_user_skill_tool,
)
from flask import Flask

USER_SKILLS = [
    {
        "name": "memo",
        "description": "Write investment memos",
        "content": "Use the memo template.",
        "files": {"template.md": "# Memo"},
    }
]


def _fake_backend():
    backend = MagicMock()
    backend.execute.return_value = MagicMock(output="/home/daytona\n")
    backend.upload_files.side_effect = lambda files: [
        MagicMock(path=path, error=None) for path, _ in files
    ]
    return backend


@pytest.fixture
def user():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    db.init_app(app)
    with app.app_context():
        db.create_all()
        user = User(email="ana@acme.com", name="ana")
        db.session.add(user)
        db.session.commit()
        yield user


def test_builtin_skills_are_indexed_with_first_sentence_descriptions():
    skills = load_builtin_skills()
    assert {"docx", "pdf", "pptx", "xlsx", "data-analysis", "skill-creator"} <= set(
        skills
    )
    assert skills["docx"]["description"].endswith("(.docx files).")


def test_skills_context_lists_only_names_and_descriptions():
    context = build_skills_context(USER_SKILLS)
    assert "- docx: " in context
    assert "- /memo (user skill): Write investment memos" in context
    assert "Use the memo template." not in context
    assert load_builtin_skills()["docx"]["content"] not in context


def test_load_user_skill_returns_body_and_reference_files():
    tool = get_load_skill_tool(USER_SKILLS)
    result = tool.invoke({"name": "/memo"})
    assert "Use the memo template." in result
    assert "#### Reference: template.md" in result
    assert tool.invoke({"name": "memo", "file": "template.md"}) == "# Memo"


def test_load_builtin_skill_syncs_files_to_sandbox_once():
    backend = _fake_backend()
    tool = get_load_skill_tool([], SandboxSkillSync(backend))
    result = tool.invoke({"name": "docx"})
    assert "./skills/docx/" in result
    uploaded = [path for path, _ in backend.upload_files.call_args[0][0]]
    assert "/home/daytona/skills/docx/SKILL.md" in uploaded
    assert "/home/daytona/skills/docx/scripts/office/unpack.py" in uploaded
    tool.invoke({"name": "docx"})
    assert backend.upload_files.call_count == 1


def test_load_builtin_skill_reference_file_stays_inside_skill_dir():
    tool = get_load_skill_tool([])
    assert "Edit" in tool.invoke({"name": "pptx", "file": "editing.md"})
    assert "Unknown file" in tool.invoke({"name": "pptx", "file": "../docx/SKILL.md"})


def test_execute_code_reference_triggers_sync():
    backend = _fake_backend()
    skill_sync = SandboxSkillSync(backend)
    skill_sync.ensure_referenced(
        "subprocess.run(['python', './skills/xlsx/scripts/recalc.py'])"
    )
    assert skill_sync.synced == {"xlsx"}


def test_unknown_skill_lists_available():
    result = get_load_skill_tool(USER_SKILLS).invoke({"name": "other"})
    assert "Unknown skill" in result
    assert "docx" in result and "memo" in result


def test_save_user_skill_creates_then_updates_by_name(user):
    tool = get_save_user_skill_tool(user.id)
    args = {
        "name": "board-memo",
        "description": "Use for board memos.",
        "content": "v1",
    }
    created = json.loads(tool.invoke(args))
    assert created["success"] and "created" in created["message"]
    updated = json.loads(tool.invoke({**args, "content": "v2", "files": {"a.md": "x"}}))
    assert updated["id"] == created["id"] and "updated" in updated["message"]
    skill = UserSkill.query.filter_by(user_id=user.id).one()
    assert skill.content == "v2" and skill.files == {"a.md": "x"}


def test_save_user_skill_rejects_invalid_and_builtin_names(user):
    tool = get_save_user_skill_tool(user.id)
    base = {"description": "d", "content": "c"}
    assert not json.loads(tool.invoke({**base, "name": "Board Memo"}))["success"]
    assert not json.loads(tool.invoke({**base, "name": "docx"}))["success"]
    assert UserSkill.query.count() == 0


def test_get_agent_skills_filters_platform_and_enabled(user):
    for name, platform, enabled in [
        ("web-skill", "web", True),
        ("both-skill", "both", True),
        ("desktop-skill", "desktop", True),
        ("off-skill", "both", False),
    ]:
        db.session.add(
            UserSkill(
                user_id=user.id,
                name=name,
                content="c",
                platform=platform,
                enabled=enabled,
            )
        )
    db.session.commit()
    names = {skill["name"] for skill in get_agent_skills(user.id, "web")}
    assert names == {"web-skill", "both-skill"}
