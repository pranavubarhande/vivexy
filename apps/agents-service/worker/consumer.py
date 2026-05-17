"""
RabbitMQ Consumer
Listens on three queues and dispatches work:

  chat_jobs            → real-time chat streaming (user-facing, latency-sensitive)
  rag_jobs             → file indexing into vector store
  scheduled_task_jobs  → scheduled task runs (dedicated queue, never starves chat)

Run with:  python -m worker.consumer
Scale by running multiple consumer processes; RabbitMQ distributes messages.
"""

import json
import logging
import os
import sys

_worker_dir = os.path.dirname(os.path.abspath(__file__))
_app_root = os.path.dirname(_worker_dir)
sys.path.insert(0, _app_root)

from app import create_app
from app.agents.event_emitter import StreamEvent, publish_stream_event
from app.business_logic.attachments import _try_index_attachment
from app.constants.stream_events import STREAM_EVENT_ERROR
from configs import CHAT_QUEUE, PREFETCH_COUNT, RAG_QUEUE, SCHEDULED_TASK_QUEUE
from worker.agent_runner import run_agent_job
from worker.broker import get_connection

logger = logging.getLogger(__name__)


def _setup_flask_context():
    """Create a Flask app context so SQLAlchemy and config are available."""
    app = create_app()
    ctx = app.app_context()
    ctx.push()
    return app, ctx


# ── Real-time chat ──────────────────────────────────────────────────────────


def _handle_chat_job(ch, method, properties, body):
    """Process a single real-time chat job."""
    job = json.loads(body)
    chat_id = job.get("chat_id", "unknown")
    logger.info("Processing chat job for chat_id=%s", chat_id)

    try:
        run_agent_job(
            chat_id=job["chat_id"],
            user_id=job["user_id"],
            messages=job["messages"],
            model_id=job.get("model_id"),
            model_db_id=job.get("model_db_id"),
            model_provider=job.get("model_provider", "google"),
            file_context_dicts=job.get("file_context_dicts", []),
            client_tools_enabled=job.get("client_tools_enabled", False),
            saved_user_message=job.get("saved_user_message", {}),
            user_skills=job.get("user_skills", []),
        )
    except Exception as e:
        logger.exception("Chat job failed for chat_id=%s", chat_id)
        publish_stream_event(
            chat_id,
            StreamEvent(type=STREAM_EVENT_ERROR, data={"message": str(e)}),
        )
    finally:
        ch.basic_ack(delivery_tag=method.delivery_tag)


# ── RAG indexing ────────────────────────────────────────────────────────────


def _handle_rag_job(ch, method, properties, body):
    """Process a single RAG indexing job."""
    job = json.loads(body)
    logger.info(
        "Processing RAG job for %s in chat %s",
        job.get("filename"),
        job.get("chat_id"),
    )

    try:
        _try_index_attachment(
            chat_id=job["chat_id"],
            s3_key=job["s3_key"],
            filename=job["filename"],
        )
    except Exception:
        logger.exception("RAG job failed for %s", job.get("filename"))
    finally:
        ch.basic_ack(delivery_tag=method.delivery_tag)


# ── Scheduled tasks ─────────────────────────────────────────────────────────


def _handle_scheduled_task_job(ch, method, properties, body):
    """
    Process a scheduled task job.

    The message contains only {task_id, user_id} — all heavy work (create chat,
    fetch skills, S3 file contexts, run agent) is done here in the worker so the
    scheduler process stays fast and crash-safe.

    We only basic_ack() AFTER the runner returns successfully.  If the worker
    process crashes mid-run, RabbitMQ will redeliver the message to another
    worker automatically (at-least-once delivery).
    """
    job = json.loads(body)
    task_id = job.get("task_id", "unknown")
    logger.info("Processing scheduled task job task_id=%s", task_id)

    try:
        from worker.scheduled_task_runner import run_scheduled_task

        run_scheduled_task(task_id)
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception:
        logger.exception("Scheduled task job failed for task_id=%s", task_id)
        # nack without requeue on unhandled failure to avoid infinite retry loops.
        # Increase to requeue=True if you want automatic retries.
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


# ── Worker bootstrap ────────────────────────────────────────────────────────


def start_worker():
    """Connect to RabbitMQ and start consuming all three queues."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    # pika logs socket/connection errors at ERROR level even for expected
    # "not configured" scenarios.  Silence it to avoid alarming output in dev.
    logging.getLogger("pika").setLevel(logging.CRITICAL)

    _setup_flask_context()

    connection = get_connection()
    if connection is None:
        logger.error("RabbitMQ is disabled or unavailable. Set USE_RABBITMQ=true.")
        return

    channel = connection.channel()
    channel.queue_declare(queue=CHAT_QUEUE, durable=True)
    channel.queue_declare(queue=RAG_QUEUE, durable=True)
    channel.queue_declare(queue=SCHEDULED_TASK_QUEUE, durable=True)

    # prefetch_count=1: each worker handles one job at a time, ensuring fair dispatch.
    channel.basic_qos(prefetch_count=PREFETCH_COUNT)

    channel.basic_consume(queue=CHAT_QUEUE, on_message_callback=_handle_chat_job)
    channel.basic_consume(queue=RAG_QUEUE, on_message_callback=_handle_rag_job)
    channel.basic_consume(
        queue=SCHEDULED_TASK_QUEUE, on_message_callback=_handle_scheduled_task_job
    )

    logger.info(
        "Worker started — listening on queues: %s, %s, %s",
        CHAT_QUEUE,
        RAG_QUEUE,
        SCHEDULED_TASK_QUEUE,
    )

    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        logger.info("Worker shutting down")
        channel.stop_consuming()
    finally:
        connection.close()


if __name__ == "__main__":
    start_worker()
