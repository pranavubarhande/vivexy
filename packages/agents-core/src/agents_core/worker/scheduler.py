"""
Scheduled Task Scheduler — scalable, multi-instance safe.

Polls the DB every POLL_INTERVAL seconds for tasks whose next_run_at <= now,
advances their schedule atomically (commit before dispatch), then hands each
task off to a worker thread (or RabbitMQ queue when available).

SELECT FOR UPDATE SKIP LOCKED means multiple scheduler instances can run safely.
"""

import logging
import time
import warnings
from datetime import datetime

from agents_core.worker.env import load_worker_env

load_worker_env()

warnings.filterwarnings("ignore", message="urllib3")

logger = logging.getLogger(__name__)

POLL_INTERVAL = 30  # seconds — tasks appear "overdue" for at most this long
CLAIM_BATCH = 50
MAINTENANCE_INTERVAL = 60 * 60  # retention purges + platform alerts

_flask_app = None  # captured at startup so fallback threads can push a context


def _setup_flask_context():
    """Create a minimal Flask app context so SQLAlchemy/db.session is usable
    from this background scheduler process.

    See worker/consumer.py's `_setup_flask_context` for why this doesn't use
    apps/agents-service's `create_app()`: that factory wires up all HTTP
    blueprints, which aren't a dependency of packages/agents-core.

    The DB settings come from agents_core.flask_config.BaseConfig; see
    consumer.py for why it is imported here rather than at module level.
    """
    from agents_core.flask_config import BaseConfig
    from agents_core.models import db
    from flask import Flask

    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = BaseConfig.SQLALCHEMY_DATABASE_URI
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = BaseConfig.SQLALCHEMY_ENGINE_OPTIONS
    db.init_app(app)
    app.app_context().push()
    return app


def _run_maintenance():
    from agents_core.business_logic.maintenance import run_maintenance
    from agents_core.models.base import db

    db.session.remove()
    run_maintenance()


def _poll_and_dispatch():
    from agents_core.business_logic.scheduled_tasks import compute_next_run_at
    from agents_core.models.base import db
    from agents_core.models.scheduled_task import ScheduledTask
    from agents_core.worker.dispatcher import dispatch_scheduled_task_job
    from sqlalchemy import text

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

    from agents_core.worker.scheduled_task_runner import run_scheduled_task

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

    last_maintenance = 0.0
    while True:
        try:
            _poll_and_dispatch()
        except Exception:
            logger.exception("Unexpected poll error")
        if time.monotonic() - last_maintenance >= MAINTENANCE_INTERVAL:
            last_maintenance = time.monotonic()
            try:
                _run_maintenance()
            except Exception:
                logger.exception("Maintenance run failed")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    start_scheduler()
