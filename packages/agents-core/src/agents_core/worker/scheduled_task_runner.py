"""
Scheduled Task Runner
Handles the heavy lifting for a single scheduled-task job:
  1. Load task from DB
  2. Check the scheduled-tasks feature flag and the task team's policy
     (membership, suspension, allowed models, budget block)
  3. Create a new Chat for this run, billed to the task's team (if any)
  4. Record a ScheduledTaskRun (status=running)
  5. Fetch the user's enabled skills from DB
  6. Build file contexts (S3 downloads)
  7. Persist the user message
  8. Run the agent by draining run_agent_stream — this handles the full
     LangGraph loop, tool calls, DB persistence of the assistant message,
     and artifact creation.  SSE strings are discarded (no client connected).
  9. Update ScheduledTaskRun → completed / failed

Desktop vs Web
--------------
Scheduled tasks always run on the server, so:
  ✅  Web search, finance tools, RAG, skills from DB, S3 file attachments
  ❌  Local filesystem tools / MCP tools (require Electron IPC, unavailable server-side)
"""

import logging
import os
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


def run_scheduled_task(task_id: str) -> None:
    from agents_core.models.base import db
    from agents_core.models.scheduled_task import ScheduledTask, ScheduledTaskRun
    from agents_core.models.skill import UserSkill
    from agents_core.schemas.chat import ChatCreate

    from agents_core.agents.config import FileContext, get_default_agent_id
    from agents_core.business_logic.chat import (
        build_image_contexts,
        create_chat,
        create_message,
    )
    from agents_core.business_logic.features import ensure_feature
    from agents_core.business_logic.streaming import NoopAppContext, run_agent_stream
    from agents_core.business_logic.team_policy import (
        check_team_policy,
        resolve_chat_team,
    )
    from agents_core.constants.features import FEATURE_SCHEDULED_TASKS
    from agents_core.models.user import User
    from agents_core.services.file_processor import FileProcessor
    from agents_core.services.s3_service import S3Service

    # ── 1. Load task ────────────────────────────────────────────────────────
    task: Optional[ScheduledTask] = ScheduledTask.query.get(task_id)
    if not task:
        logger.error("Scheduled task id=%s not found — skipping", task_id)
        return

    # ── 2. Check the org still allows this run, and who pays for it ──────────
    # Policy refusals are recorded as failed runs, not raised: retrying won't
    # help until an admin changes the team's settings.
    try:
        ensure_feature(task.user_id, FEATURE_SCHEDULED_TASKS)
        team_id = resolve_chat_team(task.team_id, User.query.get(task.user_id))
        check_team_policy(team_id, task.model_db_id)
    except PermissionError as exc:
        logger.warning("Scheduled task id=%s refused: %s", task_id, exc)
        now = datetime.utcnow()
        db.session.add(
            ScheduledTaskRun(
                task_id=task.id,
                status="failed",
                error=str(exc),
                ran_at=now,
                completed_at=now,
            )
        )
        db.session.commit()
        return

    # ── 3. Create a fresh chat for this run ─────────────────────────────────
    chat_data = ChatCreate(
        agent_id=task.agent_id or get_default_agent_id(),
        title=f"[Scheduled] {task.name}",
        team_id=team_id,
    )
    chat = create_chat(chat_data, task.user_id)
    chat_id = chat.id if hasattr(chat, "id") else chat["id"]

    # ── 4. Record the run (status=running) ──────────────────────────────────
    run = ScheduledTaskRun(task_id=task.id, chat_id=chat_id, status="running")
    db.session.add(run)
    db.session.commit()

    try:
        # ── 5. Fetch user's enabled skills from DB ───────────────────────────
        skills = UserSkill.query.filter_by(user_id=task.user_id, enabled=True).all()
        user_skills = [
            {
                "name": s.name,
                "description": s.description,
                "content": s.content,
                **({"files": s.files} if s.files else {}),
            }
            for s in skills
        ]

        # ── 6. Build file and image contexts from pre-uploaded S3 attachments ─
        file_contexts = _build_file_contexts(task.file_ids or [])
        # build_image_contexts with chat_id=None falls back to ID-only lookup
        image_contexts = build_image_contexts("", task.file_ids or [])

        # ── 7. Persist the user message ─────────────────────────────────────
        messages = [{"role": "user", "content": task.prompt}]
        saved_msg = create_message(
            chat_id,
            {
                "role": "user",
                "content": task.prompt,
                "model_id": task.model_db_id,
            },
            task.user_id,
            skip_auto_response=True,
        )

        # ── 8. Run the agent ─────────────────────────────────────────────────
        # Drain run_agent_stream — it handles the full LangGraph loop, tool
        # calls, and DB persistence.  SSE strings are discarded (no client).
        #
        # run_agent_stream calls app_context.push() internally.  We're already
        # inside an app context (either the consumer's or the scheduler's
        # fallback thread context), so we pass a noop to avoid pushing a second
        # scoped DB session that would detach our ORM objects.
        for _ in run_agent_stream(
            chat_id=chat_id,
            user_id=task.user_id,
            messages=messages,
            model_id=task.model_api_id,
            model_db_id=task.model_db_id,
            model_provider=task.model_provider or "google",
            file_contexts=file_contexts,
            image_contexts=image_contexts,
            client_tools_enabled=False,
            saved_user_message=saved_msg,
            app_context=NoopAppContext(),
            user_skills=user_skills,
            github_context=task.github_context,
        ):
            pass  # SSE strings discarded — DB writes happen inside the generator

        # ── 9. Mark run completed ────────────────────────────────────────────
        run.status = "completed"
        run.completed_at = datetime.utcnow()
        db.session.commit()
        logger.info(
            "Scheduled task id=%s completed, run id=%s, chat id=%s",
            task.id,
            run.id,
            chat_id,
        )

    except Exception as exc:
        logger.exception("Scheduled task id=%s failed", task_id)
        try:
            run.status = "failed"
            run.error = str(exc)
            run.completed_at = datetime.utcnow()
            db.session.commit()
        except Exception:
            logger.exception(
                "Could not persist failed run status for task id=%s", task_id
            )
        raise  # re-raise so RabbitMQ nacks and doesn't silently swallow the failure


def _build_file_contexts(file_ids: list) -> list:
    """Fetch S3 attachments by ID and extract text content as FileContext objects.
    Image files are skipped — build_image_contexts() handles those.
    """
    if not file_ids:
        return []

    from agents_core.models.chat import ChatAttachment

    from agents_core.agents.config import FileContext
    from agents_core.business_logic.chat import IMAGE_MIMES
    from agents_core.services.file_processor import FileProcessor
    from agents_core.services.s3_service import S3Service

    attachments = ChatAttachment.query.filter(ChatAttachment.id.in_(file_ids)).all()
    s3 = S3Service()
    processor = FileProcessor()
    contexts = []

    for att in attachments:
        if not att.s3_key or att.mime_type in IMAGE_MIMES:
            continue
        local_path = s3.download_file(att.s3_key)
        if not local_path:
            continue
        try:
            content = processor.read_file(local_path)
            contexts.append(
                FileContext(
                    file_id=str(att.id),
                    filename=att.filename,
                    file_type=content.get("type", "unknown"),
                    content=content.get("text", ""),
                    s3_key=att.s3_key,
                    metadata={"mime_type": att.mime_type},
                )
            )
        finally:
            try:
                os.unlink(local_path)
            except Exception:
                pass

    return contexts
