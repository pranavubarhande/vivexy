"""Periodic housekeeping: retention purges and platform alerts."""

import logging
from typing import Any, Dict

from agents_core.business_logic.audit import record_audit_log
from agents_core.business_logic.data_lifecycle import purge_expired_team_chats
from agents_core.business_logic.platform_alerts import (
    compute_platform_alerts,
    deliver_platform_alerts,
)
from agents_core.constants.audit_actions import (
    AUDIT_RETENTION_PURGED,
    AUDIT_TARGET_TEAM,
)

logger = logging.getLogger(__name__)


def run_maintenance() -> Dict[str, Any]:
    purged = purge_expired_team_chats()
    for team_id, deleted_count in purged.items():
        record_audit_log(
            None,
            AUDIT_RETENTION_PURGED,
            AUDIT_TARGET_TEAM,
            team_id,
            team_id=team_id,
            details={"deletedChats": deleted_count},
        )
    delivered = deliver_platform_alerts(compute_platform_alerts())
    logger.info(
        "Maintenance: purged %d chats, delivered %d alerts",
        sum(purged.values()),
        len(delivered),
    )
    return {"purged": purged, "alertsDelivered": len(delivered)}
