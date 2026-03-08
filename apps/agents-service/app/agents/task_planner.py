"""
Task Planner
Single LLM call to produce a short task plan (2–6 items) for a user turn.
"""

import json
import logging
from typing import List

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.config import TASK_PLANNING_PROMPT, TaskItem, TaskStatus

logger = logging.getLogger(__name__)


async def plan_tasks(llm, user_message: str, has_files: bool) -> List[TaskItem]:
    """Produce a short task plan (2-6 items) for the current turn."""
    context_note = " Files are attached and will be searched." if has_files else ""
    planning_input = f"User request: {user_message}{context_note}"

    try:
        strict_prompt = (
            TASK_PLANNING_PROMPT
            + "\n\nIMPORTANT: You must return ONLY a JSON array of objects. "
            "Each object MUST have 'id' (e.g., 't1') and 'title' (a short string) fields."
        )
        response = await llm.ainvoke(
            [
                SystemMessage(content=strict_prompt),
                HumanMessage(content=planning_input),
            ]
        )
        content = response.content
        if isinstance(content, list):
            content = "".join(
                (
                    p
                    if isinstance(p, str)
                    else (p.get("text", "") if isinstance(p, dict) else "")
                )
                for p in content
            )
        content = (content or "").strip()
        if content.startswith("```"):
            parts = content.split("```", 2)
            content = (
                parts[-1].replace("json", "", 1).strip() if len(parts) >= 2 else content
            )
            if content.endswith("```"):
                content = content[:-3].strip()

        raw = json.loads(content)
        if not isinstance(raw, list):
            raise ValueError("Expected JSON array")

        tasks = []
        for i, t in enumerate(raw[:8]):
            title_val = t.get("title") or f"Task {i + 1}"
            tasks.append(
                TaskItem(
                    id=t.get("id", f"t{i + 1}"),
                    title=title_val,
                    description=t.get("description"),
                    status=TaskStatus.PENDING.value,
                )
            )
        return tasks

    except Exception as e:
        logger.warning("Task planning failed, using fallback: %s", e)
        tasks = [TaskItem(id="t1", title="Analyze request and gather information")]
        if has_files:
            tasks.append(TaskItem(id="t2", title="Search uploaded documents"))
        tasks.append(TaskItem(id=f"t{len(tasks) + 1}", title="Generate response"))
        return tasks
