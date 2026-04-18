import os
from unittest.mock import patch

import pytest

from app.agents.config import AgentConfig, AgentPhase, AgentType, TaskItem, TaskStatus


def test_task_item_to_dict():
    task = TaskItem(
        id="t1", title="Test Task", description="A description", status="RUNNING"
    )
    assert task.to_dict() == {
        "id": "t1",
        "title": "Test Task",
        "description": "A description",
        "status": "RUNNING",
        "error": None,
    }


@pytest.mark.parametrize(
    "provider, env_var, mocked_key",
    [
        ("google", "GOOGLE_AI_API_KEY", "google_key"),
        ("openai", "OPENAI_API_KEY", "openai_key"),
        ("anthropic", "ANTHROPIC_API_KEY", "anthropic_key"),
        ("groq", "GROQ_API_KEY", "groq_key"),
    ],
)
def test_agent_config_from_env(provider, env_var, mocked_key):
    with patch.dict(os.environ, {env_var: mocked_key}):
        # Mock other keys to ensure it picks the right one
        for other_var in [
            "GOOGLE_AI_API_KEY",
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
            "GROQ_API_KEY",
        ]:
            if other_var != env_var:
                os.environ[other_var] = "wrong_key"

        config = AgentConfig.from_env(provider=provider, model="test-model")

        assert config.provider == provider
        assert config.model == "test-model"
        assert config.api_key == mocked_key


def test_agent_config_fallback_google_key():
    with patch.dict(os.environ, {}, clear=True):
        os.environ["GOOGLE_API_KEY"] = "fallback_google_key"
        config = AgentConfig.from_env(provider="google")
        assert config.api_key == "fallback_google_key"


def test_agent_config_unsupported_provider():
    config = AgentConfig.from_env(provider="unsupported")
    assert config.api_key == ""
