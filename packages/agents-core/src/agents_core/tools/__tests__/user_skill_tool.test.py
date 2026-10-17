from agents_core.agents.agent_factory import build_user_skills_context
from agents_core.tools.chat.user_skill_tool import get_load_user_skill_tool

SKILLS = [
    {
        "name": "memo",
        "description": "Write investment memos",
        "content": "Use the memo template.",
        "files": {"template.md": "# Memo"},
    }
]


def test_skills_context_lists_only_name_and_description():
    context = build_user_skills_context(SKILLS)
    assert "- /memo: Write investment memos" in context
    assert "Use the memo template." not in context


def test_load_user_skill_returns_body_and_reference_files():
    result = get_load_user_skill_tool(SKILLS).invoke({"name": "/memo"})
    assert "Use the memo template." in result
    assert "#### Reference: template.md" in result


def test_load_user_skill_unknown_name_lists_available():
    result = get_load_user_skill_tool(SKILLS).invoke({"name": "other"})
    assert "Unknown skill" in result
    assert "memo" in result
