"""
RabbitMQ Consumer
Listens on the chat_jobs and rag_jobs queues and dispatches work.

Run with:  python -m worker.consumer
"""

import json
import logging
import os
import sys

# Ensure app root is on path when run as python -m worker.consumer
_worker_dir = os.path.dirname(os.path.abspath(__file__))
_app_root = os.path.dirname(_worker_dir)
sys.path.insert(0, _app_root)

from app import create_app
from app.agents.event_emitter import StreamEvent, publish_stream_event
from app.business_logic.attachments import _try_index_attachment
from app.constants.stream_events import STREAM_EVENT_ERROR
from configs import CHAT_QUEUE, PREFETCH_COUNT, RAG_QUEUE
from worker.agent_runner import run_agent_job
from worker.broker import get_connection

logger = logging.getLogger(__name__)


def _setup_flask_context():
    """Create a Flask app context so SQLAlchemy and config are available."""
    app = create_app()
    ctx = app.app_context()
    ctx.push()
    return app, ctx


def _handle_chat_job(ch, method, properties, body):
    """Process a single chat job."""

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
        )
    except Exception as e:
        logger.exception("Chat job failed for chat_id=%s", chat_id)

        publish_stream_event(
            chat_id,
            StreamEvent(type=STREAM_EVENT_ERROR, data={"message": str(e)}),
        )
    finally:
        ch.basic_ack(delivery_tag=method.delivery_tag)


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


def start_worker():
    """Connect to RabbitMQ and start consuming jobs."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    _setup_flask_context()

    connection = get_connection()
    if connection is None:
        logger.error("RabbitMQ is disabled or unavailable. Set USE_RABBITMQ=true.")
        return

    channel = connection.channel()
    channel.queue_declare(queue=CHAT_QUEUE, durable=True)
    channel.queue_declare(queue=RAG_QUEUE, durable=True)
    channel.basic_qos(prefetch_count=PREFETCH_COUNT)

    channel.basic_consume(queue=CHAT_QUEUE, on_message_callback=_handle_chat_job)
    channel.basic_consume(queue=RAG_QUEUE, on_message_callback=_handle_rag_job)

    logger.info("Worker started — listening on queues: %s, %s", CHAT_QUEUE, RAG_QUEUE)

    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        logger.info("Worker shutting down")
        channel.stop_consuming()
    finally:
        connection.close()


if __name__ == "__main__":
    start_worker()
