"""Helpers for background LLM work (document analyses, workflows): a
deterministic model, token accounting and JSON replies."""

import json
import re
import threading
from dataclasses import replace
from typing import Any, Optional

from langchain_core.messages import HumanMessage

from agents_core.agents.config import AgentConfig
from agents_core.agents.llm_factory import create_llm
from agents_core.business_logic.api_keys import get_decrypted_api_keys
from agents_core.models import LLMModel, TokenUsage, db

JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)
JSON_ARRAY = re.compile(r"\[.*\]", re.DOTALL)


class Usage:
    """Token counts summed across threads."""

    def __init__(self):
        self.lock = threading.Lock()
        self.input_tokens = 0
        self.output_tokens = 0

    def add(self, response: Any) -> None:
        meta = getattr(response, "usage_metadata", None) or {}
        with self.lock:
            self.input_tokens += meta.get("input_tokens", 0) or 0
            self.output_tokens += meta.get("output_tokens", 0) or 0


def response_text(response: Any) -> str:
    content = response.content
    if isinstance(content, list):
        content = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )
    return content or ""


def ask(llm: Any, usage: Usage, prompt: str) -> str:
    response = llm.invoke([HumanMessage(content=prompt)])
    usage.add(response)
    return response_text(response)


def parse_json(raw: str, pattern: re.Pattern) -> Any:
    match = pattern.search(raw)
    if not match:
        raise ValueError("The model did not return JSON")
    return json.loads(match.group(0))


def build_batch_llm(
    model_id: Optional[str],
    owner_id: str,
    max_tokens: int,
    requests_per_second: float,
    temperature: float = 0,
) -> Any:
    model = db.session.get(LLMModel, model_id) if model_id else None
    if model is None:
        raise ValueError("The chosen model is no longer available")
    config = replace(
        AgentConfig.from_env(
            provider=model.provider,
            model=model.model_id,
            user_api_keys=get_decrypted_api_keys(owner_id),
        ),
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return create_llm(config, requests_per_second=requests_per_second)


def record_token_usage(
    owner_id: str, team_id: Optional[str], model_id: Optional[str], usage: Usage
) -> None:
    """Adds a TokenUsage row so batch work counts toward usage and budgets.
    The caller commits."""
    if not usage.input_tokens and not usage.output_tokens:
        return
    model = db.session.get(LLMModel, model_id) if model_id else None
    input_cost = (usage.input_tokens / 1_000_000) * ((model and model.input_cost) or 0)
    output_cost = (usage.output_tokens / 1_000_000) * (
        (model and model.output_cost) or 0
    )
    db.session.add(
        TokenUsage(
            user_id=owner_id,
            team_id=team_id,
            model_id=model_id,
            model_name=model.name if model else None,
            provider=model.provider if model else None,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            total_tokens=usage.input_tokens + usage.output_tokens,
            input_cost_usd=input_cost,
            output_cost_usd=output_cost,
            total_cost_usd=input_cost + output_cost,
        )
    )
