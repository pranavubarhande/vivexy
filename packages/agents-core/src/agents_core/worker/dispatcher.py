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

from agents_core.constants.queues import (
    CHAT_QUEUE,
    DOCUMENT_QUEUE,
    RAG_QUEUE,
    SCHEDULED_TASK_QUEUE,
)
from agents_core.worker.broker import get_channel

logger = logging.getLogger(__name__)


def dispatch_chat_job(
    *,
    stream_id: str,
    chat_id: str,
    user_id: str,
    messages: List[Dict[str, Any]],
    model_id: Optional[str],
    model_db_id: Optional[str],
    model_provider: str,
    file_context_dicts: List[Dict[str, Any]],
    image_contexts: Optional[List[Dict[str, Any]]] = None,
    client_tools_enabled: bool = False,
    saved_user_message: Dict[str, Any] = None,
    user_skills: Optional[List[Dict[str, Any]]] = None,
    mcp_tools: Optional[List[Dict[str, Any]]] = None,
    github_context: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Publish a chat job to RabbitMQ.

    ``stream_id`` ties this job back to the Redis Stream
    (``REDIS_STREAM_CHAT.format(stream_id=stream_id)``) that
    ``GET /events/<stream_id>`` reads from — the consumer publishes events
    under that same key so the SSE relay works regardless of which pod
    dispatched vs. which pod is running the agent.

    Returns True if the job was dispatched to a queue, False if it should
    be handled in-process (RabbitMQ unavailable or disabled).
    """
    channel = get_channel()
    if channel is None:
        return False

    body = json.dumps(
        {
            "stream_id": stream_id,
            "chat_id": chat_id,
            "user_id": user_id,
            "messages": messages,
            "model_id": model_id,
            "model_db_id": model_db_id,
            "model_provider": model_provider,
            "file_context_dicts": file_context_dicts,
            "image_contexts": image_contexts or [],
            "client_tools_enabled": client_tools_enabled,
            "saved_user_message": saved_user_message or {},
            "user_skills": user_skills or [],
            "mcp_tools": mcp_tools or [],
            "github_context": github_context,
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


def dispatch_scheduled_task_job(*, task_id: str, user_id: str) -> bool:
    """
    Push a minimal scheduled-task job to the dedicated queue.

    The message intentionally carries only task_id + user_id.  All heavy
    work (create chat, fetch skills, S3 reads, run agent) happens inside
    the consumer so the scheduler stays fast and crash-safe.

    Returns True if enqueued, False if RabbitMQ is unavailable.
    """
    channel = get_channel()
    if channel is None:
        return False

    body = json.dumps({"task_id": task_id, "user_id": user_id})
    channel.basic_publish(
        exchange="",
        routing_key=SCHEDULED_TASK_QUEUE,
        body=body,
        properties=pika.BasicProperties(delivery_mode=2),  # persistent
    )
    logger.info("Enqueued scheduled task job task_id=%s", task_id)
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


def dispatch_document_job(*, document_id: str) -> bool:
    """Publish a document ingestion job. Returns False if it should run in-process."""
    channel = get_channel()
    if channel is None:
        return False

    channel.basic_publish(
        exchange="",
        routing_key=DOCUMENT_QUEUE,
        body=json.dumps({"document_id": document_id}),
        properties=pika.BasicProperties(delivery_mode=2),
    )
    logger.info("Dispatched document job %s", document_id)
    return True
