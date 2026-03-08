"""
Tool Executor
Unified tool result parsing and structured event extraction (artifact, todo, file_version).
Eliminates duplication between server-side and client-side tool handling.
"""

import ast
import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)


@dataclass
class ToolResult:
    """Outcome of running a single tool."""

    output: str
    artifacts: List[Dict[str, Any]]
    todos: List[Dict[str, Any]]
    file_versions: List[Dict[str, Any]]


def execute_tool(
    tool: BaseTool,
    tool_input: Dict[str, Any],
) -> ToolResult:
    """Run a server-side tool and parse structured results."""
    result = tool.invoke(tool_input)
    output_str = result if isinstance(result, str) else json.dumps(result)
    return _parse_result(result if isinstance(result, dict) else None, output_str)


def parse_client_result(output_str: str) -> ToolResult:
    """Parse the JSON result string returned by an Electron client tool."""
    parsed: Optional[Dict] = None
    if output_str.strip().startswith("{"):
        try:
            parsed = json.loads(output_str)
        except (json.JSONDecodeError, TypeError):
            parsed = None
    return _parse_result(parsed, output_str)


def _parse_result(
    parsed: Optional[Dict[str, Any]],
    output_str: str,
) -> ToolResult:
    """Shared extraction logic for artifacts, todos, and file versions."""

    if (
        parsed is None
        and isinstance(output_str, str)
        and output_str.strip().startswith("{")
    ):
        try:
            parsed = json.loads(output_str)
        except (json.JSONDecodeError, TypeError):
            try:
                parsed = ast.literal_eval(output_str)
            except Exception:
                parsed = None

    artifacts: List[Dict[str, Any]] = []
    todos: List[Dict[str, Any]] = []
    file_versions: List[Dict[str, Any]] = []

    if not isinstance(parsed, dict):
        return ToolResult(
            output=output_str,
            artifacts=artifacts,
            todos=todos,
            file_versions=file_versions,
        )

    if parsed.get("todo"):
        todos.append(parsed["todo"])
    if parsed.get("todos") and isinstance(parsed["todos"], list):
        for t in parsed["todos"]:
            if isinstance(t, dict) and t.get("id"):
                todos.append(t)

    if parsed.get("artifact"):
        artifact_data = parsed["artifact"]
        if "version" in parsed and "version" not in artifact_data:
            artifact_data["version"] = parsed["version"]
        artifacts.append(artifact_data)

    if parsed.get("version") and parsed.get("url"):
        file_versions.append(
            {
                "filename": parsed.get("filename"),
                "version": parsed.get("version"),
                "url": parsed.get("url"),
                "s3_key": parsed.get("s3_key"),
            }
        )

    return ToolResult(
        output=output_str,
        artifacts=artifacts,
        todos=todos,
        file_versions=file_versions,
    )
