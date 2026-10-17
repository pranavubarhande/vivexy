"""
User Skill Tool — loads a user-defined skill's full instructions on demand so the
system prompt only carries each skill's name and description.
"""

from typing import Dict, List

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field


class LoadUserSkillInput(BaseModel):
    name: str = Field(..., description="Skill name, without the leading slash.")


def _format_skill(skill: Dict) -> str:
    sections = [skill.get("content", "")]
    for filename, file_content in (skill.get("files") or {}).items():
        sections.append(f"#### Reference: {filename}\n\n{file_content}")
    return "\n\n".join(sections)


def get_load_user_skill_tool(user_skills: List[Dict]) -> StructuredTool:
    skills_by_name = {skill.get("name", "").lstrip("/"): skill for skill in user_skills}

    def load_user_skill(name: str) -> str:
        skill = skills_by_name.get(name.strip().lstrip("/"))
        if not skill:
            return f"Unknown skill '{name}'. Available: {', '.join(skills_by_name)}"
        return _format_skill(skill)

    return StructuredTool.from_function(
        func=load_user_skill,
        name="load_user_skill",
        description="Load the full instructions of a user-installed skill before applying it.",
        args_schema=LoadUserSkillInput,
    )
