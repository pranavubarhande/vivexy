"""
Business logic for scheduled tasks.
Handles CRUD, next-run-time calculation, and dispatch to the chat queue.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from agents_core.models.base import db
from agents_core.models.scheduled_task import ScheduledTask, ScheduledTaskRun

from agents_core.agents.config import DEFAULT_AGENT_ID

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# next_run_at calculation
# ---------------------------------------------------------------------------


def compute_next_run_at(
    task: ScheduledTask, after: Optional[datetime] = None
) -> Optional[datetime]:
    """Return the next UTC datetime this task should fire, or None if exhausted."""
    now = after or datetime.utcnow()

    if task.schedule_type == "once":
        if task.scheduled_at and task.scheduled_at > now:
            return task.scheduled_at
        return None  # already fired or no scheduled_at

    elif task.schedule_type == "daily":
        hh, mm = _parse_time(task.run_time or "09:00")
        candidate = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if candidate <= now:
            candidate += timedelta(days=1)
        return candidate

    elif task.schedule_type == "weekly":
        run_days = task.run_days or [0]  # default Monday
        hh, mm = _parse_time(task.run_time or "09:00")
        for offset in range(8):
            candidate = (now + timedelta(days=offset)).replace(
                hour=hh, minute=mm, second=0, microsecond=0
            )
            if candidate <= now:
                continue
            if candidate.weekday() in run_days:
                return candidate
        return None

    elif task.schedule_type == "cron":
        return _next_cron(task.cron_expression or "0 9 * * 1", now)

    return None


def _parse_time(t: str):
    parts = t.split(":")
    return int(parts[0]), int(parts[1]) if len(parts) > 1 else 0


def _next_cron(expr: str, after: datetime) -> Optional[datetime]:
    """Minimal cron evaluator: minute hour dom month dow.
    Uses croniter if available, else falls back to a simple daily approximation.
    """
    try:
        from croniter import croniter  # type: ignore

        ci = croniter(expr, after)
        return ci.get_next(datetime)
    except ImportError:
        # Fallback: run daily at 09:00 UTC if croniter not installed
        logger.warning(
            "croniter not installed — cron tasks will run daily at 09:00 UTC"
        )
        hh, mm = 9, 0
        candidate = after.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if candidate <= after:
            candidate += timedelta(days=1)
        return candidate


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


def get_user_tasks(user_id: str) -> List[Dict[str, Any]]:
    tasks = (
        ScheduledTask.query.filter_by(user_id=user_id)
        .order_by(ScheduledTask.created_at.desc())
        .all()
    )
    return [t.to_dict() for t in tasks]


def get_task(task_id: str, user_id: str) -> ScheduledTask:
    task = ScheduledTask.query.filter_by(id=task_id, user_id=user_id).first()
    if not task:
        raise ValueError(f"Task {task_id} not found")
    return task


def create_task(user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    task = ScheduledTask(
        user_id=user_id,
        name=data["name"],
        prompt=data["prompt"],
        schedule_type=data.get("schedule_type", "once"),
        scheduled_at=_parse_dt(data.get("scheduled_at")),
        run_time=data.get("run_time"),
        run_days=data.get("run_days"),
        cron_expression=data.get("cron_expression"),
        timezone=data.get("timezone", "UTC"),
        agent_id=data.get("agent_id", DEFAULT_AGENT_ID),
        model_db_id=data.get("model_db_id"),
        model_api_id=data.get("model_api_id"),
        model_provider=data.get("model_provider", "google"),
        model_name=data.get("model_name"),
        file_ids=data.get("file_ids", []),
        github_context=data.get("github_context"),
        is_active=data.get("is_active", True),
    )
    task.next_run_at = compute_next_run_at(task)
    db.session.add(task)
    db.session.commit()
    return task.to_dict()


def update_task(task_id: str, user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    task = get_task(task_id, user_id)

    updatable = [
        "name",
        "prompt",
        "schedule_type",
        "run_time",
        "run_days",
        "cron_expression",
        "timezone",
        "agent_id",
        "model_db_id",
        "model_api_id",
        "model_provider",
        "model_name",
        "file_ids",
        "github_context",
        "is_active",
    ]
    for field in updatable:
        if field in data:
            setattr(task, field, data[field])

    if "scheduled_at" in data:
        task.scheduled_at = _parse_dt(data["scheduled_at"])

    # Recompute next_run_at whenever schedule params change
    task.next_run_at = compute_next_run_at(task)
    db.session.commit()
    return task.to_dict()


def delete_task(task_id: str, user_id: str) -> None:
    task = get_task(task_id, user_id)
    db.session.delete(task)
    db.session.commit()


def get_task_runs(task_id: str, user_id: str) -> List[Dict[str, Any]]:
    get_task(task_id, user_id)  # ownership check
    runs = (
        ScheduledTaskRun.query.filter_by(task_id=task_id)
        .order_by(ScheduledTaskRun.ran_at.desc())
        .limit(50)
        .all()
    )
    return [r.to_dict() for r in runs]


# ---------------------------------------------------------------------------
# Manual trigger (used by the /run endpoint)
# ---------------------------------------------------------------------------


def dispatch_task(task: ScheduledTask) -> ScheduledTaskRun:
    """
    Enqueue a task for immediate execution.

    Pushes a lightweight {task_id} message to SCHEDULED_TASK_QUEUE.
    The consumer worker does all the heavy lifting: create chat, fetch skills,
    S3 downloads, and running the agent.  Falls back to an in-process thread
    when RabbitMQ is unavailable.

    Returns a ScheduledTaskRun record in 'running' status.
    """
    from agents_core.worker.dispatcher import dispatch_scheduled_task_job

    # Create a placeholder run so the caller has something to return immediately.
    run = ScheduledTaskRun(task_id=task.id, chat_id=None, status="running")
    db.session.add(run)
    db.session.commit()

    dispatched = dispatch_scheduled_task_job(task_id=task.id, user_id=task.user_id)

    if not dispatched:
        # RabbitMQ unavailable — run in a background thread.
        # Flask app context is thread-local, so we capture the app and push a
        # fresh context inside the thread.
        import threading

        from flask import current_app

        from agents_core.worker.scheduled_task_runner import run_scheduled_task

        flask_app = current_app._get_current_object()
        task_id = task.id

        def _target():
            try:
                with flask_app.app_context():
                    run_scheduled_task(task_id)
            except Exception:
                logger.exception("In-process run failed for task id=%s", task_id)

        threading.Thread(target=_target, daemon=True).start()

    return run


def _parse_dt(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(
            tzinfo=None
        )
    except Exception:
        return None
