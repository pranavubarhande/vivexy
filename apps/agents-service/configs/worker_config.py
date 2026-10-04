"""
Worker and broker configuration.
Used by the RabbitMQ consumer and dispatcher; also feature flags for Redis/RabbitMQ.
"""

import os

from agents_core.constants.queues import CHAT_QUEUE, RAG_QUEUE, SCHEDULED_TASK_QUEUE

# Broker URLs
RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

# Queue names: canonical source is agents_core.constants.queues; re-exported
# here (and from configs/__init__.py) so existing app-level call sites that
# import from configs don't need to change.

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
