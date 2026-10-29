"""Grant (or revoke) the platform SUPER_ADMIN role.

python -m agents_core.cli.promote_superadmin <email> [--revoke]
"""

import argparse
import sys

from agents_core.app_factory import create_app
from agents_core.flask_config import BaseConfig
from agents_core.models import Role, User, db


def promote_superadmin(email: str, revoke: bool = False) -> int:
    """Needs an app context. Returns a process exit code."""
    user = User.query.filter(User.email.ilike(email.strip())).first()
    if not user:
        print(f"No user found with email {email}")
        return 1
    user.role = Role.USER if revoke else Role.SUPER_ADMIN
    db.session.commit()
    print(f"{user.email} is now {user.role.value}")
    return 0


def main(config_object=BaseConfig) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email")
    parser.add_argument("--revoke", action="store_true")
    args = parser.parse_args()
    with create_app(config_object).app_context():
        return promote_superadmin(args.email, args.revoke)


if __name__ == "__main__":
    sys.exit(main())
