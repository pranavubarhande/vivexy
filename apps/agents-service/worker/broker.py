"""
Shared RabbitMQ connection and channel management.
Single place for connection lifecycle and queue declaration so dispatcher
and consumer stay in sync and scale consistently.
"""

import logging
from typing import Optional

import pika

from configs import CHAT_QUEUE, RABBITMQ_URL, RAG_QUEUE, USE_RABBITMQ

logger = logging.getLogger(__name__)

_connection: Optional[pika.BlockingConnection] = None


def get_connection() -> Optional[pika.BlockingConnection]:
    """Lazily create a persistent RabbitMQ connection. Returns None if disabled or unavailable."""
    global _connection
    if not USE_RABBITMQ:
        return None
    try:
        if _connection is None or _connection.is_closed:
            _connection = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
        return _connection
    except Exception as e:
        logger.warning("RabbitMQ unavailable — jobs will run in-process: %s", e)
        return None


def get_channel():
    """Create a channel and declare durable queues. Returns None if RabbitMQ is unavailable."""
    conn = get_connection()
    if conn is None:
        return None
    try:
        channel = conn.channel()
        channel.queue_declare(queue=CHAT_QUEUE, durable=True)
        channel.queue_declare(queue=RAG_QUEUE, durable=True)
        return channel
    except Exception as e:
        logger.warning("Failed to get RabbitMQ channel: %s", e)
        return None


def close_connection() -> None:
    """Close the shared connection (e.g. on shutdown)."""
    global _connection
    if _connection and not _connection.is_closed:
        try:
            _connection.close()
        except Exception:
            pass
        _connection = None
