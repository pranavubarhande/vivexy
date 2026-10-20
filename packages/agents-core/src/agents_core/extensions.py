"""
Extension registry.

Products built on Vivexy (e.g. vivexy-legal) add tools, agents, blueprints and
skills without editing core. A distribution exposes a VivexyExtension under
the ``vivexy.extensions`` entry-point group:

    [project.entry-points."vivexy.extensions"]
    legal = "vivexy_legal.extension:extension"
"""

import logging
from dataclasses import dataclass, field
from functools import lru_cache
from importlib.metadata import entry_points
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from flask import Blueprint
from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)

ENTRY_POINT_GROUP = "vivexy.extensions"


@dataclass(frozen=True)
class ToolContext:
    chat_id: str
    include_rag: bool = True


ToolLoader = Callable[[ToolContext], List[BaseTool]]


@dataclass
class VivexyExtension:
    """
    tool_groups: group name -> loader; agents list group names under "tools".
    agents: agent id -> metadata in the same shape as AGENT_METADATA, plus an
        optional "system_prompt" that overrides the unified prompt.
    """

    name: str
    tool_groups: Dict[str, ToolLoader] = field(default_factory=dict)
    agents: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    blueprints: List[Blueprint] = field(default_factory=list)
    skill_dirs: List[Path] = field(default_factory=list)


@lru_cache(maxsize=1)
def load_extensions() -> List[VivexyExtension]:
    extensions: List[VivexyExtension] = []
    for entry_point in entry_points(group=ENTRY_POINT_GROUP):
        try:
            extension = entry_point.load()
        except Exception as e:
            logger.error("Failed to load extension %s: %s", entry_point.name, e)
            continue
        if callable(extension) and not isinstance(extension, VivexyExtension):
            extension = extension()
        if not isinstance(extension, VivexyExtension):
            logger.error(
                "Extension %s is not a VivexyExtension, skipping", entry_point.name
            )
            continue
        extensions.append(extension)
        logger.info("Loaded Vivexy extension %s", extension.name)
    return extensions


def get_extension_tool_groups() -> Dict[str, ToolLoader]:
    tool_groups: Dict[str, ToolLoader] = {}
    for extension in load_extensions():
        tool_groups.update(extension.tool_groups)
    return tool_groups


def get_extension_agents() -> Dict[str, Dict[str, Any]]:
    agents: Dict[str, Dict[str, Any]] = {}
    for extension in load_extensions():
        for agent_id, metadata in extension.agents.items():
            agents[agent_id] = {
                "id": agent_id,
                **{k: v for k, v in metadata.items() if k != "system_prompt"},
            }
    return agents


def get_extension_blueprints() -> List[Blueprint]:
    return [bp for extension in load_extensions() for bp in extension.blueprints]


def get_extension_skill_dirs() -> List[Path]:
    return [
        Path(skill_dir)
        for extension in load_extensions()
        for skill_dir in extension.skill_dirs
    ]


def get_extension_system_prompt(agent_id: str) -> Optional[str]:
    prompt = None
    for extension in load_extensions():
        prompt = extension.agents.get(agent_id, {}).get("system_prompt", prompt)
    return prompt
