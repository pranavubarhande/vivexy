"""
LLM Factory
Centralised LLM construction for all providers supported by LangChain.
"""

import logging
import os

from langchain_anthropic import ChatAnthropic
from langchain_cohere import ChatCohere
from langchain_core.rate_limiters import InMemoryRateLimiter
from langchain_fireworks import ChatFireworks
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_mistralai import ChatMistralAI
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from langchain_together import ChatTogether
from langchain_xai import ChatXAI

from agents_core.agents.config import AgentConfig

logger = logging.getLogger(__name__)


def create_llm(config: AgentConfig):
    """Create a LangChain chat model from the given AgentConfig."""
    rate_limiter = InMemoryRateLimiter(
        requests_per_second=0.1,
        check_every_n_seconds=0.1,
        max_bucket_size=10,
    )

    if config.provider == "google":
        return ChatGoogleGenerativeAI(
            model=config.model,
            google_api_key=config.api_key,
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

    if config.provider == "mistral":
        return ChatMistralAI(
            model=config.model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            api_key=config.api_key,
            streaming=True,
        )

    if config.provider == "together":
        return ChatTogether(
            model=config.model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            together_api_key=config.api_key,
        )

    if config.provider == "fireworks":
        return ChatFireworks(
            model=config.model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            fireworks_api_key=config.api_key,
        )

    if config.provider == "cohere":
        return ChatCohere(
            model=config.model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            cohere_api_key=config.api_key,
        )

    if config.provider == "xai":
        return ChatXAI(
            model=config.model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            xai_api_key=config.api_key,
        )

    if config.provider == "ollama":
        return ChatOllama(
            model=config.model,
            temperature=config.temperature,
            num_predict=config.max_tokens,
        )

    raise ValueError(f"Unsupported provider: {config.provider}")
