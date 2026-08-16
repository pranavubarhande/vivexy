"""
Worker and broker configuration.
Used by the RabbitMQ consumer and dispatcher; also feature flags for Redis/RabbitMQ.
"""

import os

# Broker URLs
RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

# Queue names (single source of truth; re-exported from app.constants.queues)
CHAT_QUEUE = "chat_jobs"
RAG_QUEUE = "rag_jobs"
SCHEDULED_TASK_QUEUE = (
    "scheduled_task_jobs"  # dedicated queue — never starves real-time chat
)

# Dead-letter exchange: chat_jobs/rag_jobs messages that fail processing land
# here (via a per-queue .dlq) instead of being silently ack-and-dropped.
DLX_EXCHANGE = "jobs.dlx"

# Consumer prefetch
PREFETCH_COUNT = 1

# Feature flags
USE_RABBITMQ = os.environ.get("USE_RABBITMQ", "").lower() in ("1", "true", "yes")
USE_REDIS_STREAM = os.environ.get("USE_REDIS_STREAM", "").lower() in (
    "1",
    "true",
    "yes",
)
