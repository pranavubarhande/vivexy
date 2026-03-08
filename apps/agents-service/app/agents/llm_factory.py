"""
LLM Factory
Centralised LLM construction for all providers (Google, OpenAI, Anthropic, Groq).
"""

import logging
import os

from langchain_anthropic import ChatAnthropic
from langchain_core.rate_limiters import InMemoryRateLimiter
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI

from app.agents.config import AgentConfig

logger = logging.getLogger(__name__)


def create_llm(config: AgentConfig):
    """Create a LangChain chat model from the given AgentConfig."""
    rate_limiter = InMemoryRateLimiter(
        requests_per_second=0.1,
        check_every_n_seconds=0.1,
        max_bucket_size=10,
    )

    if config.provider == "google":
        os.environ["GOOGLE_API_KEY"] = config.api_key
        return ChatGoogleGenerativeAI(
            model=config.model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            streaming=True,
            max_retries=1,
            rate_limiter=rate_limiter,
        )

    if config.provider == "openai":
        return ChatOpenAI(
            model=config.model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            api_key=config.api_key,
            streaming=True,
            rate_limiter=rate_limiter,
        )

    if config.provider == "anthropic":
        return ChatAnthropic(
            model=config.model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            api_key=config.api_key,
            streaming=True,
        )

    if config.provider == "groq":
        return ChatGroq(
            model=config.model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            api_key=config.api_key,
            streaming=True,
            rate_limiter=rate_limiter,
        )

    raise ValueError(f"Unsupported provider: {config.provider}")
