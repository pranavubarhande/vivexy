#!/usr/bin/env python3
"""
Script to seed LLM models in the database.
This replicates the functionality of apps/frontend/scripts/seed-llm-models.ts
"""

import os
import sys
from pathlib import Path

# Add the parent directory to the path so we can import the app
sys.path.insert(0, str(Path(__file__).parent.parent))

from app import create_app
from app.models import LLMModel, db

llm_models = [
    # OpenAI Models
    {
        "name": "GPT-4",
        "provider": "openai",
        "model_id": "gpt-4",
        "is_active": True,
        "context_window": 8192,
    },
    {
        "name": "GPT-4 Turbo",
        "provider": "openai",
        "model_id": "gpt-4-turbo",
        "is_active": True,
        "context_window": 128000,
    },
    {
        "name": "GPT-3.5 Turbo",
        "provider": "openai",
        "model_id": "gpt-3.5-turbo",
        "is_active": True,
        "context_window": 16385,
    },
    # Anthropic Claude Models
    {
        "name": "Claude 3 Opus",
        "provider": "anthropic",
        "model_id": "claude-3-opus-20240229",
        "is_active": True,
        "context_window": 200000,
    },
    {
        "name": "Claude 3 Sonnet",
        "provider": "anthropic",
        "model_id": "claude-3-sonnet-20240229",
        "is_active": True,
        "context_window": 200000,
    },
    {
        "name": "Claude 3 Haiku",
        "provider": "anthropic",
        "model_id": "claude-3-haiku-20240307",
        "is_active": True,
        "context_window": 200000,
    },
    # Google Gemini Models
    {
        "name": "Gemini 2.5 Flash",
        "provider": "google",
        "model_id": "gemini-2.5-flash",
        "is_active": True,
        "context_window": 1048576,
    },
    {
        "name": "Gemini 1.5 Pro",
        "provider": "google",
        "model_id": "gemini-1.5-pro",
        "is_active": True,
        "context_window": 2097152,
    },
    {
        "name": "Gemini 1.5 Flash",
        "provider": "google",
        "model_id": "gemini-1.5-flash",
        "is_active": True,
        "context_window": 1048576,
    },
    # Groq Models (ultra-fast inference, native tool calling)
    {
        "name": "Llama 3.3 70B (Groq)",
        "provider": "groq",
        "model_id": "llama-3.3-70b-versatile",
        "is_active": True,
        "context_window": 128000,
    },
    {
        "name": "Llama 3.1 8B (Groq)",
        "provider": "groq",
        "model_id": "llama-3.1-8b-instant",
        "is_active": True,
        "context_window": 131072,
    },
    {
        "name": "Gemma 2 9B (Groq)",
        "provider": "groq",
        "model_id": "gemma2-9b-it",
        "is_active": True,
        "context_window": 8192,
    },
    {
        "name": "Llama 3 70B (Groq)",
        "provider": "groq",
        "model_id": "llama3-70b-8192",
        "is_active": True,
        "context_window": 8192,
    },
    {
        "name": "GPT-OSS 120B (Groq)",
        "provider": "groq",
        "model_id": "openai/gpt-oss-120b",
        "is_active": True,
        "context_window": 32768,
    },
]


def main():
    """Main seeding function."""
    print("Seeding LLM models...")

    app = create_app()

    with app.app_context():
        for model_data in llm_models:
            # Check if model already exists
            existing_model = LLMModel.query.filter_by(
                provider=model_data["provider"], model_id=model_data["model_id"]
            ).first()

            if not existing_model:
                model = LLMModel(**model_data)
                db.session.add(model)
                print(f"Created model: {model_data['name']}")
            else:
                # Update context_window if it changed
                if existing_model.context_window != model_data["context_window"]:
                    existing_model.context_window = model_data["context_window"]
                    print(
                        f"Updated context_window for: {model_data['name']} -> {model_data['context_window']}"
                    )
                else:
                    print(f"Model already exists: {model_data['name']}")

        db.session.commit()
        print("Seeding completed!")


if __name__ == "__main__":
    main()
