"""
Skill Tool — loads a built-in or user-defined skill's full instructions on demand so
the system prompt only carries each skill's name and description.
"""

from pathlib import Path
from typing import Dict, List, Optional

from agents_core.agents.skill_loader import SandboxSkillSync, load_builtin_skills
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field


class LoadSkillInput(BaseModel):
    name: str = Field(..., description="Skill name, without the leading slash.")
    file: Optional[str] = Field(
        None,
        description="A reference file the skill points to (e.g. 'editing.md'). Omit for the main instructions.",
    )


def _format_user_skill(skill: Dict, file: Optional[str]) -> str:
    files = skill.get("files") or {}
    if file:
        if file in files:
            return files[file]
        return f"Unknown file '{file}'. Available: {', '.join(files) or 'none'}"
    sections = [skill.get("content", "")]
    for filename, file_content in files.items():
        sections.append(f"#### Reference: {filename}\n\n{file_content}")
    return "\n\n".join(sections)


def _read_reference_file(skill_dir: Path, file: str) -> str:
    path = (skill_dir / file).resolve()
    if skill_dir.resolve() in path.parents and path.is_file():
        return path.read_text(encoding="utf-8")
    references = sorted(p.name for p in skill_dir.glob("*.md") if p.name != "SKILL.md")
    return f"Unknown file '{file}'. Available: {', '.join(references) or 'none'}"


def _format_builtin_skill(
    skill: Dict, file: Optional[str], skill_sync: Optional[SandboxSkillSync]
) -> str:
    skill_dir = Path(skill["dir"])
    if file:
        return _read_reference_file(skill_dir, file)
    sandbox_path = skill_sync.ensure(skill["name"]) if skill_sync else None
    if sandbox_path:
        note = (
            f"Skill files are in the sandbox at `{sandbox_path}/`. Paths like "
            f"`scripts/...` below are relative to it, e.g. `python {sandbox_path}/scripts/...`. "
            "Load other referenced .md files with `load_skill(name, file=...)`."
        )
    else:
        note = "Skill scripts are unavailable (no sandbox); follow the guidance without them."
    return f"{note}\n\n{skill['content']}"


def get_load_skill_tool(
    user_skills: List[Dict], skill_sync: Optional[SandboxSkillSync] = None
) -> StructuredTool:
    builtin_skills = load_builtin_skills()
    user_skills_by_name = {
        skill.get("name", "").lstrip("/"): skill for skill in user_skills
    }

    def load_skill(name: str, file: Optional[str] = None) -> str:
        key = name.strip().lstrip("/")
        if key in user_skills_by_name:
            return _format_user_skill(user_skills_by_name[key], file)
        if key in builtin_skills:
            return _format_builtin_skill(builtin_skills[key], file, skill_sync)
        available = [*builtin_skills, *user_skills_by_name]
        return f"Unknown skill '{name}'. Available: {', '.join(available)}"

    return StructuredTool.from_function(
        func=load_skill,
        name="load_skill",
        description="Load a skill's full instructions (or one of its reference files) before applying it.",
        args_schema=LoadSkillInput,
    )
