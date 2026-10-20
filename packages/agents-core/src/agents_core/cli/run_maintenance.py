"""Run retention purges and platform alerts once (for cron / Kubernetes CronJob).

python -m agents_core.cli.run_maintenance
"""

import json

from agents_core.app_factory import create_app
from agents_core.business_logic.maintenance import run_maintenance
from agents_core.flask_config import BaseConfig


def main(config_object=BaseConfig) -> None:
    with create_app(config_object).app_context():
        print(json.dumps(run_maintenance(), indent=2))


if __name__ == "__main__":
    main()
