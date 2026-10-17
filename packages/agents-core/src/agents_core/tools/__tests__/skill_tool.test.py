from unittest.mock import MagicMock

from agents_core.agents.agent_factory import build_skills_context
from agents_core.agents.skill_loader import SandboxSkillSync, load_builtin_skills
from agents_core.tools.chat.skill_tool import get_load_skill_tool

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


def test_builtin_skills_are_indexed_without_unsupported_ones():
    skills = load_builtin_skills()
    assert {"docx", "pdf", "pptx", "xlsx", "data-analysis"} <= set(skills)
    assert "skill-creator" not in skills
    assert skills["docx"]["description"]


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
