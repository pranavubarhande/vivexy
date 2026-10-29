"""Seed LLM models (see agents_core.cli.seed_llm_models).

Usage:
    uv run python scripts/seed_llm_models.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents_core.cli.seed_llm_models import main  # noqa: E402

from configs import Config  # noqa: E402

if __name__ == "__main__":
    main(Config)
