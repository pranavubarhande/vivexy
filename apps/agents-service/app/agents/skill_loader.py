"""
Skill Loader
Dynamically loads SKILL.md files from the app/skills directory to inject into the system prompt.
This gives the agent awareness of how to manipulate complex files in the E2B Sandbox.
"""

import logging
import os

import yaml

logger = logging.getLogger(__name__)


def load_skills_context() -> str:
    """Reads all SKILL.md files and returns a compiled markdown string of descriptions."""
    skills_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "skills")

    skill_descriptions = []
    if os.path.exists(skills_dir):
        for root, _, files in os.walk(skills_dir):
            if "SKILL.md" in files:
                try:
                    with open(
                        os.path.join(root, "SKILL.md"), "r", encoding="utf-8"
                    ) as f:
                        content = f.read()

                    # Extract YAML frontmatter and Markdown body
                    if content.startswith("---"):
                        parts = content.split("---", 2)
                        if len(parts) >= 3:
                            yaml_content = parts[1]
                            markdown_content = parts[2].strip()
                            meta = yaml.safe_load(yaml_content) or {}

                            name = meta.get("name", os.path.basename(root))
                            desc = meta.get("description", "")

                            skill_text = f"### Category: {name}\n**Description**: {desc}\n\n{markdown_content}"
                            skill_descriptions.append(skill_text)
                except Exception as e:
                    logger.warning("Failed to parse Skill in %s: %s", root, e)

    if not skill_descriptions:
        return ""

    return "## AVAILABLE SANDBOX SKILLS & LIBRARIES\n\n" + "\n\n---\n\n".join(
        skill_descriptions
    )


def load_skill_deps() -> list[str]:
    """Extract dependency install commands from all SKILL.md files.

    Scans the ## Dependencies section of each skill for lines matching
    ``pip install`` or ``npm install`` patterns and returns a deduplicated
    list of shell commands that the sandbox should run at startup.
    """
    import re

    skills_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "skills")
    commands: list[str] = []
    seen: set[str] = set()

    if not os.path.exists(skills_dir):
        return commands

    # Regex to pull install commands from inside backticks or bare lines
    cmd_re = re.compile(r"`((?:pip|npm)\s+install\S*\s+[^`]+)`")

    for root, _, files in os.walk(skills_dir):
        if "SKILL.md" not in files:
            continue
        try:
            with open(os.path.join(root, "SKILL.md"), "r", encoding="utf-8") as f:
                content = f.read()

            # Extract the Dependencies section
            dep_match = re.search(
                r"## Dependencies\s*\n([\s\S]*?)(?:\n## |\Z)", content
            )
            if not dep_match:
                continue

            dep_section = dep_match.group(1)

            # Strategy 1: extract commands from inline backtick spans
            for m in cmd_re.finditer(dep_section):
                cmd = m.group(1).strip()
                if cmd and cmd not in seen:
                    seen.add(cmd)
                    commands.append(cmd)

            # Strategy 2: also check bare lines (no backticks) for install commands
            for line in dep_section.splitlines():
                stripped = line.strip().lstrip("- ").strip()
                if not stripped or "`" in stripped:
                    continue  # already handled by regex above
                if "pip install" in stripped or "npm install" in stripped:
                    if stripped not in seen:
                        seen.add(stripped)
                        commands.append(stripped)

        except Exception as e:
            logger.warning("Failed to parse skill deps in %s: %s", root, e)

    return commands
