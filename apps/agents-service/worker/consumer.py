"""
RabbitMQ Consumer
Listens on three queues and dispatches work:

  chat_jobs            → real-time chat streaming (user-facing, latency-sensitive)
  rag_jobs             → file indexing into vector store
  scheduled_task_jobs  → scheduled task runs (dedicated queue, never starves chat)

Run with:  python -m worker.consumer
Scale by running multiple consumer processes; RabbitMQ distributes messages.

Chat/RAG jobs that raise are nacked without requeue — the queues are
declared (in worker/broker.py) with a dead-letter exchange, so a failed
message lands in a `.dlq` for inspection instead of being silently dropped.
Scheduled-task jobs keep their existing nack-without-requeue-on-failure
behavior (no DLX needed there; failure is already recorded on the
ScheduledTaskRun row).
"""

import json
import logging
import os
import signal
import sys

_worker_dir = os.path.dirname(os.path.abspath(__file__))
_app_root = os.path.dirname(_worker_dir)
sys.path.insert(0, _app_root)

import redis as redis_lib

from app import create_app
from app.agents.config import FileContext
from app.business_logic.attachments import _try_index_attachment
from app.business_logic.streaming import NoopAppContext, run_agent_stream_to_redis
from app.constants.redis_keys import REDIS_STREAM_CHAT
from configs import (
    CHAT_QUEUE,
    PREFETCH_COUNT,
    RAG_QUEUE,
    REDIS_URL,
    SCHEDULED_TASK_QUEUE,
)
from worker.broker import get_connection

logger = logging.getLogger(__name__)

_redis_client = None
_shutting_down = False


def _setup_flask_context():
    """Create a Flask app context so SQLAlchemy and config are available."""
    app = create_app()
    ctx = app.app_context()
    ctx.push()
    return app, ctx


def _get_redis():
    """One Redis client for the life of the worker process (redis-py pools internally)."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis_lib.from_url(REDIS_URL, decode_responses=True)
    return _redis_client


# ── Real-time chat ──────────────────────────────────────────────────────────


def _handle_chat_job(ch, method, properties, body):
    """Process a single real-time chat job, streaming events to the same
    Redis Stream (keyed by stream_id) that GET /events/<stream_id> reads —
    so it doesn't matter which pod dispatched vs. which pod is consuming.
    """
    job = json.loads(body)
    chat_id = job.get("chat_id", "unknown")
    stream_id = job.get("stream_id")
    logger.info("Processing chat job for chat_id=%s stream_id=%s", chat_id, stream_id)

    file_contexts = [FileContext(**fc) for fc in job.get("file_context_dicts", [])]

    try:
        run_agent_stream_to_redis(
            stream_id=stream_id,
            r=_get_redis(),
            stream_key=REDIS_STREAM_CHAT.format(stream_id=stream_id),
            chat_id=chat_id,
            user_id=job["user_id"],
            messages=job["messages"],
            model_id=job.get("model_id"),
            model_db_id=job.get("model_db_id"),
            model_provider=job.get("model_provider", "google"),
            file_contexts=file_contexts,
            image_contexts=job.get("image_contexts", []),
            client_tools_enabled=job.get("client_tools_enabled", False),
            saved_user_message=job.get("saved_user_message", {}),
            app_context=NoopAppContext(),
            user_skills=job.get("user_skills", []),
            mcp_tools=job.get("mcp_tools", []),
            github_context=job.get("github_context"),
        )
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception:
        # run_agent_stream_to_redis already turns ordinary agent failures into
        # a stream error event and swallows them — an exception escaping here
        # means something broke outside the agent run itself (e.g. Redis).
        logger.exception("Chat job failed for chat_id=%s", chat_id)
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


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
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception:
        logger.exception("RAG job failed for %s", job.get("filename"))
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


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
        # Failure is already recorded on the ScheduledTaskRun row.
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
    from worker.broker import _declare_topology

    _declare_topology(channel)

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

    def _handle_sigterm(signum, frame):
        # Graceful drain: stop consuming NEW messages but let pika return
        # control to start_consuming()'s loop so the in-flight callback (if
        # any) finishes normally and its own basic_ack/nack still fires.
        # This is what lets a rolling k8s deploy / KEDA scale-down avoid
        # needlessly killing a chat job seconds from completing — pair with
        # a generous terminationGracePeriodSeconds on the worker Deployment.
        global _shutting_down
        if _shutting_down:
            return
        _shutting_down = True
        logger.info("Received signal %s — draining in-flight job, then exiting", signum)
        channel.stop_consuming()

    signal.signal(signal.SIGTERM, _handle_sigterm)
    signal.signal(signal.SIGINT, _handle_sigterm)

    try:
        channel.start_consuming()
    finally:
        logger.info("Worker shutting down")
        connection.close()


if __name__ == "__main__":
    start_worker()
