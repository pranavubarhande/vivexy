"""
Shared RabbitMQ connection and channel management.
Single place for connection lifecycle and queue declaration so dispatcher
and consumer stay in sync and scale consistently.

Connections are thread-local: pika.BlockingConnection is not thread-safe,
and producers (dispatch_*) are now called from gunicorn's request threads,
so a single shared global connection/channel would corrupt under concurrent
publishes. Each thread lazily gets its own connection.
"""

import logging
import os
import threading
from typing import Optional

import pika

from agents_core.constants.queues import CHAT_QUEUE, RAG_QUEUE, SCHEDULED_TASK_QUEUE

# Broker connection settings: trivial env reads, inlined here rather than
# importing from the app-level `configs` package (see worker/consumer.py and
# worker/dispatcher.py for the same pattern) so packages/agents-core doesn't
# depend on apps/agents-service to import its own worker modules.
RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")
USE_RABBITMQ = os.environ.get("USE_RABBITMQ", "").lower() in ("1", "true", "yes")

# Dead-letter exchange: chat_jobs/rag_jobs messages that fail processing land
# here (via a per-queue .dlq) instead of being silently ack-and-dropped.
DLX_EXCHANGE = "jobs.dlx"

logger = logging.getLogger(__name__)

_local = threading.local()

# Queues that get a dead-letter exchange so a failed message is inspectable
# instead of silently ack-and-dropped. scheduled_task_jobs deliberately nacks
# without requeue on failure already (see consumer.py), so it's excluded here.
_DLX_QUEUES = (CHAT_QUEUE, RAG_QUEUE)

# Quorum queues replicate across the RabbitMQ cluster (vs. a classic durable
# queue, which lives on a single node even in a clustered broker).
_QUEUE_ARGS = {"x-queue-type": "quorum"}


def get_connection() -> Optional[pika.BlockingConnection]:
    """Lazily create a persistent, thread-local RabbitMQ connection. Returns None if disabled or unavailable."""
    if not USE_RABBITMQ:
        return None
    conn = getattr(_local, "connection", None)
    try:
        if conn is None or conn.is_closed:
            conn = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
            _local.connection = conn
        return conn
    except Exception as e:
        logger.warning("RabbitMQ unavailable — jobs will run in-process: %s", e)
        _local.connection = None
        return None


def _declare_topology(channel) -> None:
    """Declare the dead-letter exchange plus all durable/quorum queues."""
    channel.exchange_declare(
        exchange=DLX_EXCHANGE, exchange_type="fanout", durable=True
    )

    for queue in (CHAT_QUEUE, RAG_QUEUE, SCHEDULED_TASK_QUEUE):
        args = dict(_QUEUE_ARGS)
        if queue in _DLX_QUEUES:
            args["x-dead-letter-exchange"] = DLX_EXCHANGE
        channel.queue_declare(queue=queue, durable=True, arguments=args)

    # One dead-letter queue per DLX'd source queue, bound to the fanout DLX.
    for queue in _DLX_QUEUES:
        dlq = f"{queue}.dlq"
        channel.queue_declare(queue=dlq, durable=True)
        channel.queue_bind(queue=dlq, exchange=DLX_EXCHANGE)


def get_channel():
    """Create a channel and declare topology. Returns None if RabbitMQ is unavailable."""
    conn = get_connection()
    if conn is None:
        return None
    try:
        channel = conn.channel()
        _declare_topology(channel)
        return channel
    except Exception as e:
        logger.warning("Failed to get RabbitMQ channel: %s", e)
        return None


def close_connection() -> None:
    """Close this thread's connection (e.g. on shutdown)."""
    conn = getattr(_local, "connection", None)
    if conn and not conn.is_closed:
        try:
            conn.close()
        except Exception:
            pass
    _local.connection = None
