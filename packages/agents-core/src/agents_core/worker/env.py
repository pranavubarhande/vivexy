"""Shared .env loading for worker/scheduler entrypoints run standalone
(`python -m agents_core.worker.consumer` / `.scheduler`), outside of
apps/agents-service's own `configs/__init__.py` (the only other place
that loads .env for this codebase).
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

logger = logging.getLogger(__name__)


def load_worker_env() -> None:
    """Load apps/agents-service/.env into this process's environment.

    load_dotenv() with no args searches upward from the CALLING file's own
    location, not the process's cwd — since packages/agents-core isn't an
    ancestor of apps/agents-service, that search never reaches
    apps/agents-service/.env, so it has to be pointed at explicitly.

    In production this file doesn't exist (env vars come from the
    container/pod env instead) — that's expected, so a missing file is
    only logged, not raised. If this ever logs unexpectedly in local dev,
    the path below has drifted from actual repo layout; fix it here, not
    by re-adding a copy in consumer.py/scheduler.py.

    Products that install agents-core as a package set VIVEXY_ENV_FILE to
    their own .env, since the default path only exists inside this repo.
    """
    env_path = Path(
        os.environ.get("VIVEXY_ENV_FILE")
        or Path(__file__).resolve().parents[5] / "apps" / "agents-service" / ".env"
    )
    if not env_path.exists():
        logger.warning(".env not found at %s — using real process env vars only", env_path)
        return
    load_dotenv(env_path)
