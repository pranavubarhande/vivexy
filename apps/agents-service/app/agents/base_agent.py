"""
Base Agent Implementation
Slim orchestration loop — delegates LLM construction, task planning,
tool execution, and event publishing to dedicated modules.
"""

import asyncio
import json
import logging
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import BaseTool
from langchain_core.utils.json import parse_partial_json

from app.agents.approval_store import (
    create_approval_event,
    resolve_approval,
    wait_for_approval,
)
from app.agents.client_tool_store import create_client_tool_event, wait_for_client_tool
from app.agents.config import (
    APPROVAL_REQUIRED_TOOLS,
    CLIENT_EXECUTABLE_TOOLS,
    SYSTEM_PROMPTS,
    AgentConfig,
    AgentPhase,
    AgentType,
    FileContext,
    TaskStatus,
)
from app.agents.event_emitter import StreamEvent
from app.agents.llm_factory import create_llm
from app.agents.task_planner import plan_tasks
from app.agents.tool_executor import execute_tool, parse_client_result
from app.constants.stream_events import (
    STREAM_EVENT_APPROVAL_REQUEST,
    STREAM_EVENT_ARTIFACT,
    STREAM_EVENT_ARTIFACT_STREAM,
    STREAM_EVENT_CLIENT_TOOL_REQUEST,
    STREAM_EVENT_CONTENT,
    STREAM_EVENT_DONE,
    STREAM_EVENT_ERROR,
    STREAM_EVENT_FILE_VERSION,
    STREAM_EVENT_PHASE_CHANGE,
    STREAM_EVENT_REASONING,
    STREAM_EVENT_START,
    STREAM_EVENT_TASK_COMPLETED,
    STREAM_EVENT_TASK_ERROR,
    STREAM_EVENT_TASK_PLANNED,
    STREAM_EVENT_TASK_STARTED,
    STREAM_EVENT_TODO,
    STREAM_EVENT_TOOL_CALL,
)

logger = logging.getLogger(__name__)


class BaseAgent:
    """
    Unified agent: streaming, tool execution, task planning, and clear events for the client.

    Tools are executed sequentially within each LLM iteration.
    Human-in-the-loop approval pauses the async generator until the user
    responds via the approve/reject HTTP endpoints.
    """

    def __init__(
        self,
        config: AgentConfig,
        chat_id: str,
        tools: List[BaseTool],
        system_prompt: Optional[str] = None,
        agent_type: AgentType = AgentType.GENERAL,
        client_tools_enabled: bool = False,
    ):
        self.config = config
        self.chat_id = chat_id
        self.agent_type = agent_type
        self.client_tools_enabled = client_tools_enabled
        self.system_prompt = system_prompt or SYSTEM_PROMPTS.get(
            agent_type.value, SYSTEM_PROMPTS["general"]
        )

        seen_names: set = set()
        unique_tools: List[BaseTool] = []
        for tool in tools:
            if tool.name not in seen_names:
                seen_names.add(tool.name)
                unique_tools.append(tool)
        self.tools = unique_tools
        self.llm = create_llm(config)
        self.llm_with_tools = (
            self.llm.bind_tools(self.tools) if self.tools else self.llm
        )
        self.tool_map = {t.name: t for t in self.tools}

    # ------------------------------------------------------------------
    # File Context
    # ------------------------------------------------------------------

    @staticmethod
    def _build_file_context(files: List[FileContext]) -> str:
        parts = []
        for f in files:
            if f.content:
                content = f.content[:3000] if len(f.content) > 3000 else f.content
                parts.append(f"File: {f.filename} ({f.file_type})\n{content}")
        return "\n\n---\n\n".join(parts)

    # ------------------------------------------------------------------
    # Main Streaming Entry Point
    # ------------------------------------------------------------------

    async def stream_simple(
        self,
        messages: List[Dict[str, Any]],
        files: Optional[List[FileContext]] = None,
    ) -> AsyncGenerator[StreamEvent, None]:
        """Stream agent run with clear events."""
        lc_messages = [SystemMessage(content=self.system_prompt)]
        if files:
            ctx = self._build_file_context(files)
            if ctx:
                lc_messages.append(HumanMessage(content=f"[File Context]\n{ctx}"))
        for msg in messages:
            if msg.get("role") == "user":
                lc_messages.append(HumanMessage(content=msg.get("content", "")))
            elif msg.get("role") == "assistant":
                lc_messages.append(AIMessage(content=msg.get("content", "")))

        last_user = next(
            (m["content"] for m in reversed(messages) if m.get("role") == "user"),
            "",
        )
        has_files = bool(files)

        yield StreamEvent(type=STREAM_EVENT_START, data={})
        yield StreamEvent(
            type=STREAM_EVENT_PHASE_CHANGE, data={"phase": AgentPhase.PLANNING.value}
        )

        task_plan = await plan_tasks(self.llm, last_user, has_files)
        for task in task_plan:
            yield StreamEvent(type=STREAM_EVENT_TASK_PLANNED, data=task.to_dict())

        total_tasks = len(task_plan)
        task_idx = 0
        artifact_created = False

        # Detect if any planned task explicitly expects artifact creation.
        # Only match unambiguous artifact-related keywords to avoid false
        # positives from generic tasks like "Generate response".
        _artifact_keywords = {
            "create file",
            "create report",
            "build report",
            "export",
            "excel",
            "xlsx",
            "csv file",
            "md file",
            "create_artifact",
        }
        _expects_artifacts = any(
            any(kw in t.title.lower() for kw in _artifact_keywords) for t in task_plan
        )

        def _advance_task(
            status: str = TaskStatus.DONE.value, error: str = None, force: bool = False
        ):
            """Advance the current task and return a StreamEvent, or None."""
            nonlocal task_idx
            if task_idx >= total_tasks:
                return None
            # Don't complete the last task prematurely if artifacts are expected,
            # unless forced (used during final cleanup to avoid infinite loops).
            if (
                not force
                and _expects_artifacts
                and not artifact_created
                and task_idx >= total_tasks - 1
            ):
                return None
            task = task_plan[task_idx]
            task.status = status
            if error:
                task.error = error
            evt_type = (
                STREAM_EVENT_TASK_COMPLETED
                if status == TaskStatus.DONE.value
                else STREAM_EVENT_TASK_ERROR
            )
            task_idx += 1
            return StreamEvent(type=evt_type, data=task.to_dict())

        def _start_task():
            """Mark the current task as RUNNING and return a StreamEvent, or None."""
            if task_idx >= total_tasks:
                return None
            task = task_plan[task_idx]
            if task.status != TaskStatus.RUNNING.value:
                task.status = TaskStatus.RUNNING.value
                return StreamEvent(type=STREAM_EVENT_TASK_STARTED, data=task.to_dict())
            return None

        try:
            full_content = ""
            iteration = 0
            tools_called = 0

            yield StreamEvent(
                type=STREAM_EVENT_PHASE_CHANGE,
                data={
                    "phase": (
                        AgentPhase.SEARCHING.value
                        if has_files
                        else AgentPhase.EXECUTING.value
                    )
                },
            )

            # Start the first task
            ev = _start_task()
            if ev:
                yield ev

            while iteration < self.config.max_iterations:
                await asyncio.sleep(0.3)
                iteration += 1
                response_content = ""
                tool_calls_in_iteration: List[Dict] = []
                active_tool_calls: Dict[int, Dict] = {}

                async for chunk in self.llm_with_tools.astream(lc_messages):
                    if getattr(chunk, "content", None):
                        cv = chunk.content
                        if isinstance(cv, list):
                            cv = "".join(
                                (
                                    p
                                    if isinstance(p, str)
                                    else (
                                        p.get("text", "") if isinstance(p, dict) else ""
                                    )
                                )
                                for p in cv
                            )
                        if isinstance(cv, str) and cv:
                            response_content += cv
                            full_content += cv
                            yield StreamEvent(type=STREAM_EVENT_CONTENT, data=cv)

                    if getattr(chunk, "tool_call_chunks", None):
                        for tcc in chunk.tool_call_chunks:
                            idx = tcc.get("index")
                            if idx not in active_tool_calls:
                                active_tool_calls[idx] = {
                                    "name": "",
                                    "args": "",
                                    "id": "",
                                }
                            if tcc.get("name"):
                                active_tool_calls[idx]["name"] += tcc["name"]
                            if tcc.get("id"):
                                active_tool_calls[idx]["id"] += tcc["id"]
                            if tcc.get("args"):
                                active_tool_calls[idx]["args"] += tcc["args"]

                            if active_tool_calls[idx]["name"] == "create_artifact":
                                try:
                                    parsed = parse_partial_json(
                                        active_tool_calls[idx]["args"]
                                    )
                                    if (
                                        parsed
                                        and isinstance(parsed, dict)
                                        and (
                                            parsed.get("content")
                                            or parsed.get("title")
                                            or parsed.get("filename")
                                        )
                                    ):
                                        yield StreamEvent(
                                            type=STREAM_EVENT_ARTIFACT_STREAM,
                                            data={
                                                "filename": parsed.get("filename")
                                                or parsed.get("title")
                                                or "Untitled",
                                                "title": parsed.get("title"),
                                                "type": parsed.get("type", "MD"),
                                                "language": parsed.get("language"),
                                                "content": parsed.get("content", ""),
                                            },
                                        )
                                except Exception:
                                    pass

                    if getattr(chunk, "tool_calls", None):
                        tool_calls_in_iteration.extend(chunk.tool_calls)

                if not tool_calls_in_iteration:
                    break

                lc_messages.append(
                    AIMessage(
                        content=response_content,
                        tool_calls=tool_calls_in_iteration,
                    )
                )

                if iteration == 1 and has_files:
                    yield StreamEvent(
                        type=STREAM_EVENT_PHASE_CHANGE,
                        data={"phase": AgentPhase.EXECUTING.value},
                    )

                for tc in tool_calls_in_iteration:
                    tool_name = tc.get("name", "")
                    tool_input = tc.get("args", {}) or {}
                    tool_call_id = tc.get("id", tool_name)

                    yield StreamEvent(
                        type=STREAM_EVENT_REASONING,
                        data={
                            "thought": f"Using tool: {tool_name}",
                            "tool_calls": [{"tool": tool_name, "input": tool_input}],
                        },
                    )

                    # --- Human-in-the-loop approval ---
                    if tool_name in APPROVAL_REQUIRED_TOOLS:
                        request_id = str(uuid.uuid4())
                        description = (
                            f"{tool_name}: {json.dumps(tool_input, default=str)[:200]}"
                        )
                        yield StreamEvent(
                            type=STREAM_EVENT_APPROVAL_REQUEST,
                            data={
                                "request_id": request_id,
                                "tool_name": tool_name,
                                "tool_input": tool_input,
                                "description": description,
                            },
                        )
                        approved = await self._handle_approval(
                            tool_name, tool_input, request_id=request_id
                        )
                        if not approved:
                            lc_messages.append(
                                ToolMessage(
                                    content="User rejected this action. Do not attempt it again.",
                                    tool_call_id=tool_call_id,
                                )
                            )
                            continue

                    # --- Client-side tool delegation (Electron) ---
                    if (
                        tool_name in CLIENT_EXECUTABLE_TOOLS
                        and self.client_tools_enabled
                    ):
                        if tool_name == "create_artifact":
                            artifact_created = True
                        async for ev in self._handle_client_tool(
                            tool_name, tool_input, tool_call_id, lc_messages
                        ):
                            yield ev
                        tools_called += 1
                        continue

                    if tool_name == "create_artifact":
                        artifact_created = True
                        yield StreamEvent(
                            type=STREAM_EVENT_PHASE_CHANGE,
                            data={"phase": AgentPhase.GENERATING.value},
                        )

                    # --- Execute server-side tool ---
                    tool = self.tool_map.get(tool_name)
                    if tool:
                        try:
                            result = execute_tool(tool, tool_input)
                            yield StreamEvent(
                                type=STREAM_EVENT_TOOL_CALL,
                                data={
                                    "tool": tool_name,
                                    "input": tool_input,
                                    "output": result.output[:500],
                                },
                            )
                            for art in result.artifacts:
                                yield StreamEvent(type=STREAM_EVENT_ARTIFACT, data=art)
                            for todo in result.todos:
                                yield StreamEvent(type=STREAM_EVENT_TODO, data=todo)
                            for fv in result.file_versions:
                                yield StreamEvent(
                                    type=STREAM_EVENT_FILE_VERSION, data=fv
                                )

                            lc_messages.append(
                                ToolMessage(
                                    content=result.output,
                                    tool_call_id=tool_call_id,
                                )
                            )
                            tools_called += 1

                        except Exception as e:
                            err_msg = f"Error: {e}"
                            yield StreamEvent(
                                type=STREAM_EVENT_ERROR, data={"message": err_msg}
                            )
                            lc_messages.append(
                                ToolMessage(content=err_msg, tool_call_id=tool_call_id)
                            )
                    else:
                        lc_messages.append(
                            ToolMessage(
                                content=f"Tool not found: {tool_name}",
                                tool_call_id=tool_call_id,
                            )
                        )

                    # Advance tasks proportionally. Use max_iterations as
                    # the denominator so tasks spread across the full run,
                    # not just the first few tool calls.
                    if total_tasks > 0:
                        expected_calls = max(
                            total_tasks * 2, self.config.max_iterations
                        )
                        progress = tools_called / expected_calls
                        target_task = min(
                            int(progress * total_tasks),
                            total_tasks - 1,
                        )
                        while task_idx <= target_task:
                            ev = _advance_task()
                            if ev:
                                yield ev
                            else:
                                break
                        ev = _start_task()
                        if ev:
                            yield ev

            # Mark all remaining tasks as done (force=True prevents deadlock
            # when _expects_artifacts was a false positive)
            while task_idx < total_tasks:
                ev = _advance_task(force=True)
                if ev:
                    yield ev

            yield StreamEvent(
                type=STREAM_EVENT_PHASE_CHANGE,
                data={"phase": AgentPhase.DONE.value},
            )
            yield StreamEvent(
                type=STREAM_EVENT_DONE,
                data={"content": full_content, "refetch": ["artifacts"]},
            )

        except Exception as e:
            logger.exception("Agent streaming error")
            yield StreamEvent(type=STREAM_EVENT_ERROR, data={"message": str(e)})

    # ------------------------------------------------------------------
    # Approval flow
    # ------------------------------------------------------------------

    async def _handle_approval(
        self,
        tool_name: str,
        tool_input: Dict,
        request_id: str | None = None,
    ) -> bool:
        if request_id is None:
            request_id = str(uuid.uuid4())
        try:
            create_approval_event(request_id)
            return await wait_for_approval(request_id, timeout=120.0)
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Client tool delegation
    # ------------------------------------------------------------------

    async def _handle_client_tool(
        self,
        tool_name: str,
        tool_input: Dict,
        tool_call_id: str,
        lc_messages: list,
    ) -> AsyncGenerator[StreamEvent, None]:
        request_id = str(uuid.uuid4())
        client_input = {**tool_input, "chat_id": self.chat_id}
        yield StreamEvent(
            type=STREAM_EVENT_CLIENT_TOOL_REQUEST,
            data={
                "request_id": request_id,
                "tool_name": tool_name,
                "tool_input": client_input,
            },
        )

        try:
            create_client_tool_event(request_id)
            client_result = await wait_for_client_tool(request_id, timeout=60.0)
        except Exception:
            client_result = None

        if client_result is not None:
            tool_output_str = client_result
            result = parse_client_result(tool_output_str)
        else:
            tool_output_str = json.dumps(
                {"success": False, "error": "Client tool execution timed out"}
            )
            result = parse_client_result(tool_output_str)

        yield StreamEvent(
            type=STREAM_EVENT_TOOL_CALL,
            data={
                "tool": tool_name,
                "input": tool_input,
                "output": tool_output_str[:500],
            },
        )

        for art in result.artifacts:
            yield StreamEvent(type=STREAM_EVENT_ARTIFACT, data=art)
        for todo in result.todos:
            yield StreamEvent(type=STREAM_EVENT_TODO, data=todo)

        lc_messages.append(
            ToolMessage(content=tool_output_str, tool_call_id=tool_call_id)
        )

    # ------------------------------------------------------------------
    # Approval helpers (kept for route compatibility)
    # ------------------------------------------------------------------

    def approve_tool_call(self, request_id: str) -> bool:
        return resolve_approval(request_id, approved=True)

    def reject_tool_call(self, request_id: str) -> bool:
        return resolve_approval(request_id, approved=False)
