"""
Queue names for RabbitMQ.
Re-exports from configs so app code can use constants without importing configs.
"""

from configs.worker_config import CHAT_QUEUE, RAG_QUEUE, SCHEDULED_TASK_QUEUE

__all__ = ["CHAT_QUEUE", "RAG_QUEUE", "SCHEDULED_TASK_QUEUE"]
