"""
Job Dispatcher
Publishes chat and RAG jobs to RabbitMQ queues.
Used by the Flask route layer to offload work to worker nodes.

When RabbitMQ is unavailable, falls back to synchronous (in-process) execution
so that the system degrades gracefully.
"""

import json
import logging
from typing import Any, Dict, List, Optional

import pika

from configs import CHAT_QUEUE, RAG_QUEUE
from worker.broker import get_channel

logger = logging.getLogger(__name__)


def dispatch_chat_job(
    *,
    chat_id: str,
    user_id: str,
    messages: List[Dict[str, Any]],
    model_id: Optional[str],
    model_db_id: Optional[str],
    model_provider: str,
    file_context_dicts: List[Dict[str, Any]],
    client_tools_enabled: bool,
    saved_user_message: Dict[str, Any],
) -> bool:
    """
    Publish a chat job to RabbitMQ.

    Returns True if the job was dispatched to a queue, False if it should
    be handled in-process (RabbitMQ unavailable or disabled).
    """
    channel = get_channel()
    if channel is None:
        return False

    body = json.dumps(
        {
            "chat_id": chat_id,
            "user_id": user_id,
            "messages": messages,
            "model_id": model_id,
            "model_db_id": model_db_id,
            "model_provider": model_provider,
            "file_context_dicts": file_context_dicts,
            "client_tools_enabled": client_tools_enabled,
            "saved_user_message": saved_user_message,
        }
    )

    channel.basic_publish(
        exchange="",
        routing_key=CHAT_QUEUE,
        body=body,
        properties=pika.BasicProperties(delivery_mode=2),
    )
    logger.info("Dispatched chat job for chat_id=%s", chat_id)
    return True


def dispatch_rag_job(
    *,
    chat_id: str,
    s3_key: str,
    filename: str,
) -> bool:
    """Publish a RAG indexing job to RabbitMQ.

    Returns True if dispatched, False if should run synchronously.
    """
    channel = get_channel()
    if channel is None:
        return False

    body = json.dumps({"chat_id": chat_id, "s3_key": s3_key, "filename": filename})

    channel.basic_publish(
        exchange="",
        routing_key=RAG_QUEUE,
        body=body,
        properties=pika.BasicProperties(delivery_mode=2),
    )
    logger.info("Dispatched RAG job for %s in chat %s", filename, chat_id)
    return True
