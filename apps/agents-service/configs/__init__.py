"""
Centralized configuration for the agents-service.
Load env once and expose Flask config plus worker/broker settings.
"""

from dotenv import load_dotenv

load_dotenv()

from configs.flask_config import Config
from configs.worker_config import (
    CHAT_QUEUE,
    PREFETCH_COUNT,
    RABBITMQ_URL,
    RAG_QUEUE,
    REDIS_URL,
    USE_RABBITMQ,
    USE_REDIS_STREAM,
)

__all__ = [
    "Config",
    "CHAT_QUEUE",
    "PREFETCH_COUNT",
    "RAG_QUEUE",
    "RABBITMQ_URL",
    "REDIS_URL",
    "USE_RABBITMQ",
    "USE_REDIS_STREAM",
]
