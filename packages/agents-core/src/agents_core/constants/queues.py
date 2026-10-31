"""
Queue names for RabbitMQ (single source of truth — apps/agents-service's
configs.worker_config re-exports from here, not the other way around).
"""

CHAT_QUEUE = "chat_jobs"
RAG_QUEUE = "rag_jobs"
SCHEDULED_TASK_QUEUE = (
    "scheduled_task_jobs"  # dedicated queue — never starves real-time chat
)
DOCUMENT_QUEUE = "document_jobs"

__all__ = ["CHAT_QUEUE", "DOCUMENT_QUEUE", "RAG_QUEUE", "SCHEDULED_TASK_QUEUE"]
