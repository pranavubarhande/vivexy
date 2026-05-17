"""
Scheduled Task Scheduler — scalable, multi-instance safe.

Polls the DB every POLL_INTERVAL seconds for tasks whose next_run_at <= now,
advances their schedule atomically (commit before dispatch), then hands each
task off to a worker thread (or RabbitMQ queue when available).

SELECT FOR UPDATE SKIP LOCKED means multiple scheduler instances can run safely.
"""

import logging
import os
import sys
import time
import warnings
from datetime import datetime

warnings.filterwarnings("ignore", message="urllib3")

_worker_dir = os.path.dirname(os.path.abspath(__file__))
_app_root = os.path.dirname(_worker_dir)
sys.path.insert(0, _app_root)

logger = logging.getLogger(__name__)

POLL_INTERVAL = 30  # seconds — tasks appear "overdue" for at most this long
CLAIM_BATCH = 50

_flask_app = None  # captured at startup so fallback threads can push a context


def _setup_flask_context():
    from app import create_app

    app = create_app()
    app.app_context().push()
    return app


def _poll_and_dispatch():
    from sqlalchemy import text

    from app.business_logic.scheduled_tasks import compute_next_run_at
    from app.models.base import db
    from app.models.scheduled_task import ScheduledTask
    from worker.dispatcher import dispatch_scheduled_task_job

    # Return any idle connection to the pool before querying so we always get
    # a live connection (pool_pre_ping covers the rest).
    db.session.remove()

    now = datetime.utcnow()
    logger.info("Polling at %s UTC", now.strftime("%H:%M:%S"))

    # ── Phase 1: claim + advance ─────────────────────────────────────────────
    # FOR UPDATE SKIP LOCKED: safe to run multiple scheduler instances in parallel.
    # Commit happens BEFORE dispatch so a dispatch failure never leaves next_run_at stale.
    try:
        result = db.session.execute(
            text("""
                SELECT id FROM scheduled_tasks
                WHERE  is_active    = TRUE
                  AND  next_run_at IS NOT NULL
                  AND  next_run_at <= :now
                ORDER  BY next_run_at
                LIMIT  :limit
                FOR UPDATE SKIP LOCKED
            """),
            {"now": now, "limit": CLAIM_BATCH},
        )
        task_ids = [row[0] for row in result]
    except Exception:
        logger.exception("DB query failed — will retry next poll")
        db.session.rollback()
        return

    if not task_ids:
        logger.debug("No due tasks")
        db.session.commit()
        return

    logger.info("Found %d due task(s): %s", len(task_ids), task_ids)
    tasks = ScheduledTask.query.filter(ScheduledTask.id.in_(task_ids)).all()

    for task in tasks:
        if task.schedule_type == "once":
            task.is_active = False
            task.next_run_at = None
        else:
            task.next_run_at = compute_next_run_at(task, after=now)
        task.last_run_at = now
        logger.info(
            "Advanced task id=%s  next_run_at=%s",
            task.id,
            task.next_run_at,
        )

    try:
        db.session.commit()
        logger.info("Schedule advance committed for %d task(s)", len(tasks))
    except Exception:
        logger.exception("Commit failed — tasks will be retried on next poll")
        db.session.rollback()
        return

    # ── Phase 2: dispatch (outside transaction) ──────────────────────────────
    for task in tasks:
        try:
            dispatched = dispatch_scheduled_task_job(
                task_id=task.id, user_id=task.user_id
            )
            if dispatched:
                logger.info("Enqueued task id=%s via RabbitMQ", task.id)
            else:
                logger.info(
                    "RabbitMQ unavailable — running task id=%s in-process thread",
                    task.id,
                )
                _run_fallback(task.id)
        except Exception:
            logger.exception("Dispatch failed for task id=%s", task.id)


def _run_fallback(task_id: str):
    """Run in a thread when RabbitMQ is unavailable. Pushes a fresh app context."""
    import threading

    from worker.scheduled_task_runner import run_scheduled_task

    app = _flask_app

    def _target():
        try:
            if app is not None:
                with app.app_context():
                    run_scheduled_task(task_id)
            else:
                logger.error("No flask app captured — cannot run task id=%s", task_id)
        except Exception:
            logger.exception("Fallback thread failed for task id=%s", task_id)

    threading.Thread(target=_target, daemon=True).start()


def start_scheduler():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    logging.getLogger("pika").setLevel(logging.CRITICAL)

    global _flask_app
    _flask_app = _setup_flask_context()
    logger.info(
        "Scheduler ready — poll every %ds, batch=%d", POLL_INTERVAL, CLAIM_BATCH
    )

    while True:
        try:
            _poll_and_dispatch()
        except Exception:
            logger.exception("Unexpected poll error")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    start_scheduler()
