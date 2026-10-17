"""Enforcement for per-team feature flags (see constants/features.py)."""

from functools import wraps
from typing import Dict, Optional, Set

from agents_core.constants.features import KNOWN_FEATURES
from agents_core.models import Team, TeamMember, db
from flask import jsonify, request


class FeatureDisabledError(PermissionError):
    def __init__(self, flag: str):
        self.flag = flag
        label = KNOWN_FEATURES.get(flag, flag)
        super().__init__(f"{label} has been turned off for your organization")


def team_features(team: Optional[Team]) -> Dict[str, bool]:
    """Known flags default to on; a team's stored flags override them."""
    flags = {name: True for name in KNOWN_FEATURES}
    if team and team.feature_flags:
        flags.update({k: bool(v) for k, v in team.feature_flags.items()})
    return flags


def disabled_features_for_user(user_id: Optional[str]) -> Set[str]:
    """Flags switched off by any team the user belongs to."""
    if not user_id:
        return set()
    rows = (
        db.session.query(Team.feature_flags)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(TeamMember.user_id == user_id, Team.feature_flags.isnot(None))
        .all()
    )
    disabled = set()
    for (flags,) in rows:
        disabled.update(name for name, enabled in (flags or {}).items() if not enabled)
    return disabled


def user_features(user_id: str) -> Dict[str, bool]:
    disabled = disabled_features_for_user(user_id)
    return {name: name not in disabled for name in KNOWN_FEATURES}


def user_has_feature(user_id: Optional[str], flag: str) -> bool:
    return flag not in disabled_features_for_user(user_id)


def ensure_feature(user_id: Optional[str], flag: str) -> None:
    if not user_has_feature(user_id, flag):
        raise FeatureDisabledError(flag)


def require_feature(flag: str):
    """Route guard; apply below @auth_middleware so request.user is set."""

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not user_has_feature(request.user.id, flag):
                return (
                    jsonify(
                        {
                            "error": str(FeatureDisabledError(flag)),
                            "code": "feature_disabled",
                            "feature": flag,
                        }
                    ),
                    403,
                )
            return f(*args, **kwargs)

        return decorated_function

    return decorator
