"""
Skill Loader
Indexes the built-in skills under agents_core/skills (name and description from each
SKILL.md frontmatter) and copies a skill's files into the Daytona sandbox on demand.
"""

import logging
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Dict, Optional, Set, Tuple

import yaml

logger = logging.getLogger(__name__)

BUILTIN_SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"
SANDBOX_SKILLS_DIR = "skills"


def _parse_skill_md(text: str) -> Tuple[Dict, str]:
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            return yaml.safe_load(parts[1]) or {}, parts[2].strip()
    return {}, text.strip()


def _first_sentence(text: str) -> str:
    return re.split(r"(?<=[.!?])\s", " ".join(text.split()), maxsplit=1)[0]


@lru_cache(maxsize=1)
def load_builtin_skills() -> Dict[str, Dict[str, str]]:
    skills: Dict[str, Dict[str, str]] = {}
    for skill_md in sorted(BUILTIN_SKILLS_DIR.glob("*/SKILL.md")):
        try:
            meta, body = _parse_skill_md(skill_md.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("Failed to parse skill %s: %s", skill_md, e)
            continue
        name = meta.get("name") or skill_md.parent.name
        skills[name] = {
            "name": name,
            "description": _first_sentence(str(meta.get("description", ""))),
            "content": body,
            "dir": str(skill_md.parent),
        }
    return skills


class SandboxSkillSync:
    """Copies built-in skill files into the sandbox at ./skills/<name>/ once per sandbox."""

    def __init__(self, backend):
        self.backend = backend
        self.synced: Set[str] = set()
        self._cwd: Optional[str] = None

    def _sandbox_cwd(self) -> str:
        if self._cwd is None:
            result = self.backend.execute("pwd")
            self._cwd = getattr(result, "output", "").strip() or "/home/daytona"
        return self._cwd

    def ensure(self, name: str) -> Optional[str]:
        skill = load_builtin_skills().get(name)
        if not skill or self.backend is None:
            return None
        sandbox_path = f"./{SANDBOX_SKILLS_DIR}/{name}"
        if name in self.synced:
            return sandbox_path
        skill_dir = Path(skill["dir"])
        destination = f"{self._sandbox_cwd()}/{SANDBOX_SKILLS_DIR}/{name}"
        files = [
            (
                f"{destination}/{path.relative_to(skill_dir).as_posix()}",
                path.read_bytes(),
            )
            for path in skill_dir.rglob("*")
            if path.is_file()
            and "__pycache__" not in path.parts
            and path.name != "LICENSE.txt"
        ]
        try:
            responses = self.backend.upload_files(files)
        except Exception as e:
            logger.warning("Failed to sync skill %s to sandbox: %s", name, e)
            return None
        if any(getattr(response, "error", None) for response in responses):
            logger.warning("Some files of skill %s failed to upload", name)
            return None
        self.synced.add(name)
        return sandbox_path

    def ensure_referenced(self, code: str) -> None:
        for name in load_builtin_skills():
            if re.search(rf"\b{SANDBOX_SKILLS_DIR}/{re.escape(name)}/", code):
                self.ensure(name)


def load_skill_deps() -> list[str]:
    """Extract dependency install commands from all SKILL.md files.

    Scans the ## Dependencies section of each skill for lines matching
    ``pip install`` or ``npm install`` patterns and returns a deduplicated
    list of shell commands that the sandbox should run at startup.
    """
    skills_dir = str(BUILTIN_SKILLS_DIR)
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
