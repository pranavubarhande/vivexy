"""
Base Agent Implementation
LangGraph-based agent with streaming, tool execution, and SSE events for the frontend.
Supports task planning, RAG, todos, artifacts, file tools, and human-in-the-loop approval.

Tool execution is always SEQUENTIAL — never concurrent — to avoid LLM rate limits.
"""

import os
import json
import uuid
import asyncio
from typing import List, Dict, Any, Optional, AsyncGenerator
from datetime import datetime
from dataclasses import dataclass

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_core.tools import BaseTool
from langchain_core.rate_limiters import InMemoryRateLimiter

from app.agents.config import (
    AgentConfig,
    AgentType,
    FileContext,
    ToolCall,
    ReasoningStep,
    ApprovalRequest,
    SYSTEM_PROMPTS,
    APPROVAL_REQUIRED_TOOLS,
    TASK_PLANNING_PROMPT,
    AgentPhase,
    TaskItem,
    TaskStatus,
)


@dataclass
class StreamEvent:
    """Event emitted during streaming for SSE."""
    type: str  # start, content, reasoning, tool_call, approval_request, artifact, todo,
    # task_planned, task_started, task_completed, task_error, phase_change, done, error
    data: Any
    message_id: Optional[str] = None
    requires_approval: bool = False


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
    ):
        self.config = config
        self.chat_id = chat_id
        self.agent_type = agent_type
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
        self.llm = self._create_llm()
        self.llm_with_tools = self.llm.bind_tools(self.tools) if self.tools else self.llm
        self.tool_map = {t.name: t for t in self.tools}

    # ------------------------------------------------------------------
    # LLM Construction
    # ------------------------------------------------------------------

    def _create_llm(self):
        """Create LLM from config."""
        rate_limiter = InMemoryRateLimiter(
            requests_per_second=0.1,  # <-- Can only make a request once every 10 seconds!!
            check_every_n_seconds=0.1,  # Wake up every 100 ms to check whether allowed to make a request,
            max_bucket_size=10,  # Controls the maximum burst size.
        )
        if self.config.provider == "google":
            os.environ["GOOGLE_API_KEY"] = self.config.api_key
            return ChatGoogleGenerativeAI(
                model=self.config.model,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
                streaming=True,
                max_retries=1,
                rate_limiter=rate_limiter,
            )
        if self.config.provider == "openai":
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                model=self.config.model,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
                api_key=self.config.api_key,
                streaming=True,
                rate_limiter=rate_limiter,
            )
        if self.config.provider == "anthropic":
            from langchain_anthropic import ChatAnthropic
            return ChatAnthropic(
                model=self.config.model,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
                api_key=self.config.api_key,
                streaming=True,
            )
        if self.config.provider == "groq":
            from langchain_groq import ChatGroq
            return ChatGroq(
                model=self.config.model,
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
                api_key=self.config.api_key,
                streaming=True,
                rate_limiter=rate_limiter,
                # Groq natively supports tool calling — no extra config needed
            )
        raise ValueError(f"Unsupported provider: {self.config.provider}")

    # ------------------------------------------------------------------
    # File Context
    # ------------------------------------------------------------------

    def _build_file_context(self, files: List[FileContext]) -> str:
        """Build context string from uploaded files."""
        parts = []
        for f in files:
            if f.content:
                content = f.content[:3000] if len(f.content) > 3000 else f.content
                parts.append(f"File: {f.filename} ({f.file_type})\n{content}")
        return "\n\n---\n\n".join(parts)

    # ------------------------------------------------------------------
    # Task Planning  (single LLM call, NOT counted against tool rate limits)
    # ------------------------------------------------------------------

    async def _plan_tasks(self, user_message: str, has_files: bool) -> List[TaskItem]:
        """Produce a short task plan (2–6 items) for the current turn."""
        context_note = " Files are attached and will be searched." if has_files else ""
        planning_input = f"User request: {user_message}{context_note}"
        try:
            response = await self.llm.ainvoke([
                SystemMessage(content=TASK_PLANNING_PROMPT),
                HumanMessage(content=planning_input),
            ])
            content = response.content
            if isinstance(content, list):
                content = "".join(
                    p if isinstance(p, str) else (p.get("text", "") if isinstance(p, dict) else "")
                    for p in content
                )
            content = (content or "").strip()
            if content.startswith("```"):
                parts = content.split("```", 2)
                content = parts[-1].replace("json", "", 1).strip() if len(parts) >= 2 else content
                if content.endswith("```"):
                    content = content[:-3].strip()
            raw = json.loads(content)
            if not isinstance(raw, list):
                raise ValueError("Expected JSON array")
            tasks = []
            for i, t in enumerate(raw[:8]):
                tasks.append(TaskItem(
                    id=t.get("id", f"t{i+1}"),
                    title=t.get("title", f"Task {i+1}"),
                    description=t.get("description"),
                    status=TaskStatus.PENDING.value,
                ))
            return tasks
        except Exception:
            tasks = [TaskItem(id="t1", title="Analyze request and gather information")]
            if has_files:
                tasks.append(TaskItem(id="t2", title="Search uploaded documents"))
            tasks.append(TaskItem(id=f"t{len(tasks)+1}", title="Generate response"))
            return tasks

    # ------------------------------------------------------------------
    # Main Streaming Entry Point
    # ------------------------------------------------------------------

    async def stream_simple(
        self,
        messages: List[Dict[str, Any]],
        files: Optional[List[FileContext]] = None,
    ) -> AsyncGenerator[StreamEvent, None]:
        """
        Stream agent run with clear events:
          start → phase_change → task_planned → (content | reasoning | tool_call |
          approval_request | artifact | todo | task_started | task_completed |
          task_error | phase_change)* → done

        Tool calls within a single LLM response are executed ONE AT A TIME
        (sequential for-loop). No asyncio.gather or ThreadPoolExecutor is used.
        """
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

        yield StreamEvent(type="start", data={})
        yield StreamEvent(type="phase_change", data={"phase": AgentPhase.PLANNING.value})

        task_plan = await self._plan_tasks(last_user, has_files)
        for task in task_plan:
            yield StreamEvent(type="task_planned", data=task.to_dict())

        task_iter = iter(task_plan)
        current_task: Optional[TaskItem] = next(task_iter, None)

        try:
            full_content = ""
            iteration = 0

            if has_files:
                yield StreamEvent(type="phase_change", data={"phase": AgentPhase.SEARCHING.value})
            else:
                yield StreamEvent(type="phase_change", data={"phase": AgentPhase.EXECUTING.value})

            while iteration < self.config.max_iterations:
                # Yield control to the event loop between iterations to keep SSE alive
                await asyncio.sleep(0.3)
                iteration += 1
                response_content = ""
                tool_calls_in_iteration: List[Dict] = []

                # ---- Single LLM call (streaming) ----
                async for chunk in self.llm_with_tools.astream(lc_messages):
                    if getattr(chunk, "content", None):
                        cv = chunk.content
                        if isinstance(cv, list):
                            cv = "".join(
                                p if isinstance(p, str)
                                else (p.get("text", "") if isinstance(p, dict) else "")
                                for p in cv
                            )
                        if isinstance(cv, str) and cv:
                            response_content += cv
                            full_content += cv
                            yield StreamEvent(type="content", data=cv)
                    if getattr(chunk, "tool_calls", None):
                        tool_calls_in_iteration.extend(chunk.tool_calls)

                if not tool_calls_in_iteration:
                    # No tool calls → generation is complete
                    break

                lc_messages.append(AIMessage(
                    content=response_content,
                    tool_calls=tool_calls_in_iteration,
                ))

                if iteration == 1 and has_files:
                    yield StreamEvent(type="phase_change", data={"phase": AgentPhase.EXECUTING.value})

                # ---- Sequential tool execution ----
                for tc in tool_calls_in_iteration:
                    tool_name = tc.get("name", "")
                    tool_input = tc.get("args", {}) or {}
                    tool_call_id = tc.get("id", tool_name)

                    if current_task:
                        current_task.status = TaskStatus.RUNNING.value
                        yield StreamEvent(type="task_started", data=current_task.to_dict())

                    yield StreamEvent(
                        type="reasoning",
                        data={
                            "thought": f"Using tool: {tool_name}",
                            "tool_calls": [{"tool": tool_name, "input": tool_input}],
                        },
                    )

                    # ---- Human-in-the-loop approval (blocking await) ----
                    if tool_name in APPROVAL_REQUIRED_TOOLS:
                        request_id = str(uuid.uuid4())
                        yield StreamEvent(
                            type="approval_request",
                            data={
                                "request_id": request_id,
                                "tool_name": tool_name,
                                "tool_input": tool_input,
                                "description": f"The agent wants to run: {tool_name}",
                            },
                            requires_approval=True,
                        )

                        try:
                            from app.agents.approval_store import (
                                create_approval_event,
                                wait_for_approval,
                            )
                            create_approval_event(request_id)
                            approved = await wait_for_approval(request_id, timeout=120.0)
                        except Exception:
                            approved = False  # Fail-safe: reject on error

                        if not approved:
                            lc_messages.append(ToolMessage(
                                content="User rejected this action. Do not attempt it again.",
                                tool_call_id=tool_call_id,
                            ))
                            if current_task:
                                current_task.status = TaskStatus.ERROR.value
                                current_task.error = "Rejected by user"
                                yield StreamEvent(type="task_error", data=current_task.to_dict())
                                current_task = next(task_iter, None)
                            continue

                    if tool_name == "create_artifact":
                        yield StreamEvent(type="phase_change", data={"phase": AgentPhase.GENERATING.value})

                    # ---- Execute tool ----
                    tool = self.tool_map.get(tool_name)
                    if tool:
                        try:
                            result = tool.invoke(tool_input)
                            tool_output_str = (
                                result if isinstance(result, str) else json.dumps(result)
                            )
                            yield StreamEvent(
                                type="tool_call",
                                data={
                                    "tool": tool_name,
                                    "input": tool_input,
                                    "output": tool_output_str[:500],
                                },
                            )

                            # Parse structured results and emit typed events
                            parsed: Optional[Dict] = None
                            if isinstance(result, dict):
                                parsed = result
                            elif isinstance(result, str) and result.strip().startswith("{"):
                                try:
                                    parsed = json.loads(result)
                                except (json.JSONDecodeError, TypeError):
                                    parsed = None

                            if isinstance(parsed, dict):
                                if parsed.get("todo"):
                                    yield StreamEvent(type="todo", data=parsed["todo"])
                                if parsed.get("todos") and isinstance(parsed["todos"], list):
                                    for t in parsed["todos"]:
                                        if isinstance(t, dict) and t.get("id"):
                                            yield StreamEvent(type="todo", data=t)
                                if parsed.get("artifact"):
                                    artifact_data = parsed["artifact"]
                                    # Propagate version if present at top level
                                    if "version" in parsed and "version" not in artifact_data:
                                        artifact_data["version"] = parsed["version"]
                                    yield StreamEvent(type="artifact", data=artifact_data)
                                # Versioned file event for frontend artifact panel
                                if parsed.get("version") and parsed.get("url"):
                                    yield StreamEvent(
                                        type="file_version",
                                        data={
                                            "filename": parsed.get("filename"),
                                            "version": parsed.get("version"),
                                            "url": parsed.get("url"),
                                            "s3_key": parsed.get("s3_key"),
                                        },
                                    )

                            lc_messages.append(ToolMessage(
                                content=tool_output_str,
                                tool_call_id=tool_call_id,
                            ))
                            if current_task:
                                current_task.status = TaskStatus.DONE.value
                                yield StreamEvent(type="task_completed", data=current_task.to_dict())
                                current_task = next(task_iter, None)

                        except Exception as e:
                            err_msg = f"Error: {str(e)}"
                            yield StreamEvent(type="error", data={"message": err_msg})
                            lc_messages.append(ToolMessage(
                                content=err_msg,
                                tool_call_id=tool_call_id,
                            ))
                            if current_task:
                                current_task.status = TaskStatus.ERROR.value
                                current_task.error = str(e)
                                yield StreamEvent(type="task_error", data=current_task.to_dict())
                                current_task = next(task_iter, None)
                    else:
                        lc_messages.append(ToolMessage(
                            content=f"Tool not found: {tool_name}",
                            tool_call_id=tool_call_id,
                        ))

            # Mark any remaining pending tasks as done
            while current_task:
                if current_task.status == TaskStatus.PENDING.value:
                    current_task.status = TaskStatus.DONE.value
                    yield StreamEvent(type="task_completed", data=current_task.to_dict())
                current_task = next(task_iter, None)

            yield StreamEvent(type="phase_change", data={"phase": AgentPhase.DONE.value})
            yield StreamEvent(
                type="done",
                data={"content": full_content, "refetch": ["artifacts", "todos"]},
            )

        except Exception as e:
            yield StreamEvent(type="error", data={"message": str(e)})

    # ------------------------------------------------------------------
    # Approval helpers (kept for compatibility, superseded by approval_store)
    # ------------------------------------------------------------------

    def approve_tool_call(self, request_id: str) -> bool:
        from app.agents.approval_store import resolve_approval
        return resolve_approval(request_id, approved=True)

    def reject_tool_call(self, request_id: str) -> bool:
        from app.agents.approval_store import resolve_approval
        return resolve_approval(request_id, approved=False)
