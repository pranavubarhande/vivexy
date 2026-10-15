"""Run retention purges and platform alerts once (for cron / Kubernetes CronJob).

Usage:
    uv run python scripts/run_maintenance.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from agents_core.business_logic.maintenance import run_maintenance  # noqa: E402

from app import create_app  # noqa: E402
from configs import Config  # noqa: E402

if __name__ == "__main__":
    app = create_app(Config)
    with app.app_context():
        print(json.dumps(run_maintenance(), indent=2))
