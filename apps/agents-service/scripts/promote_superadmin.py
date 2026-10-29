"""Grant (or revoke) the platform SUPER_ADMIN role.

Usage:
    uv run python scripts/promote_superadmin.py <email>
    uv run python scripts/promote_superadmin.py <email> --revoke
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents_core.cli.promote_superadmin import main  # noqa: E402

from configs import Config  # noqa: E402

if __name__ == "__main__":
    sys.exit(main(Config))
