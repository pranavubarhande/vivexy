"""Grant (or revoke) the platform SUPER_ADMIN role.

Usage:
    uv run python scripts/promote_superadmin.py <email>
    uv run python scripts/promote_superadmin.py <email> --revoke
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents_core.models import Role, User, db  # noqa: E402

from app import create_app  # noqa: E402
from configs import Config  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email")
    parser.add_argument("--revoke", action="store_true")
    args = parser.parse_args()

    app = create_app(Config)
    with app.app_context():
        user = User.query.filter(User.email.ilike(args.email.strip())).first()
        if not user:
            print(f"No user found with email {args.email}")
            return 1

        user.role = Role.USER if args.revoke else Role.SUPER_ADMIN
        db.session.commit()
        print(f"{user.email} is now {user.role.value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
