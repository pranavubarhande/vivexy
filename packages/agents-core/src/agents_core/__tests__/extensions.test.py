from unittest.mock import MagicMock, patch

import pytest
from agents_core import extensions
from agents_core.agents.config import (
    UNIFIED_SYSTEM_PROMPT,
    get_agent_metadata,
    get_system_prompt,
)
from agents_core.agents.skill_loader import load_builtin_skills
from agents_core.app_factory import create_app
from agents_core.extensions import ToolContext, VivexyExtension
from flask import Blueprint
from langchain_core.tools import tool


@tool
def clause_lookup(clause: str) -> str:
    """Look up a clause."""
    return clause


legal_bp = Blueprint("legal_extension", __name__, url_prefix="/legal")


@legal_bp.route("/ping")
def ping():
    return {"ok": True}


def _entry_point(name, value):
    entry_point = MagicMock()
    entry_point.name = name
    entry_point.load.return_value = value
    return entry_point


@pytest.fixture
def skills_dir(tmp_path):
    skill_dir = tmp_path / "nda-review"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text(
        "---\nname: nda-review\ndescription: Review NDAs. More text.\n---\nBody"
    )
    return tmp_path


@pytest.fixture
def legal_extension(skills_dir):
    return VivexyExtension(
        name="legal",
        tool_groups={"clauses": lambda context: [clause_lookup]},
        agents={
            "nda-reviewer": {
                "name": "NDA Reviewer",
                "description": "Reviews NDAs.",
                "tools": ["base", "clauses"],
                "system_prompt": "You review NDAs.",
            }
        },
        blueprints=[legal_bp],
        skill_dirs=[skills_dir],
    )


@pytest.fixture
def installed(legal_extension):
    def _install(*entry_point_values):
        entry_points = [
            _entry_point(f"ext{index}", value)
            for index, value in enumerate(entry_point_values)
        ]
        patcher = patch.object(extensions, "entry_points", return_value=entry_points)
        patcher.start()
        extensions.load_extensions.cache_clear()
        load_builtin_skills.cache_clear()
        return patcher

    patchers = []
    yield lambda *values: patchers.append(_install(*values))
    for patcher in patchers:
        patcher.stop()
    extensions.load_extensions.cache_clear()
    load_builtin_skills.cache_clear()


def test_no_extensions_keeps_core_agents(installed):
    installed()
    assert "contract-review" in get_agent_metadata()
    assert extensions.get_extension_tool_groups() == {}


def test_extension_agents_and_prompt(installed, legal_extension):
    installed(legal_extension)
    metadata = get_agent_metadata()["nda-reviewer"]
    assert metadata["id"] == "nda-reviewer"
    assert "system_prompt" not in metadata
    assert get_system_prompt("nda-reviewer") == "You review NDAs."
    assert get_system_prompt("unknown-agent") == UNIFIED_SYSTEM_PROMPT


def test_extension_factory_and_tool_groups(installed, legal_extension):
    installed(lambda: legal_extension)
    loader = extensions.get_extension_tool_groups()["clauses"]
    assert loader(ToolContext(chat_id="c1")) == [clause_lookup]


def test_invalid_and_failing_extensions_are_skipped(installed, legal_extension):
    broken = MagicMock()
    broken.name = "broken"
    broken.load.side_effect = ImportError("missing")
    patcher = patch.object(
        extensions,
        "entry_points",
        return_value=[
            broken,
            _entry_point("bad", object()),
            _entry_point("ok", legal_extension),
        ],
    )
    with patcher:
        extensions.load_extensions.cache_clear()
        assert [e.name for e in extensions.load_extensions()] == ["legal"]
    extensions.load_extensions.cache_clear()


def test_extension_skills_are_indexed(installed, legal_extension):
    installed(legal_extension)
    skill = load_builtin_skills()["nda-review"]
    assert skill["description"] == "Review NDAs."


def test_create_app_registers_extension_blueprints(installed, legal_extension):
    installed(legal_extension)
    config = type(
        "TestConfig",
        (),
        {
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "TESTING": True,
            "GOOGLE_CLIENT_ID": "",
            "GOOGLE_CLIENT_SECRET": "",
            "MICROSOFT_CLIENT_ID": "",
            "MICROSOFT_CLIENT_SECRET": "",
        },
    )
    extra_bp = Blueprint("extra", __name__, url_prefix="/extra")
    app = create_app(config, blueprints=[extra_bp])
    assert "legal_extension" in app.blueprints
    assert "extra" in app.blueprints
    assert app.test_client().get("/legal/ping").get_json() == {"ok": True}
