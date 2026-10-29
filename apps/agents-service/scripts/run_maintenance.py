"""Run retention purges and platform alerts once (for cron / Kubernetes CronJob).

Usage:
    uv run python scripts/run_maintenance.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents_core.cli.run_maintenance import main  # noqa: E402

from configs import Config  # noqa: E402

if __name__ == "__main__":
    main(Config)
