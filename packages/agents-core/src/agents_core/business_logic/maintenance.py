"""Periodic housekeeping: retention purges and platform alerts."""

import logging
from typing import Any, Dict

from agents_core.business_logic.audit import record_audit_log
from agents_core.business_logic.data_lifecycle import (
    purge_expired_team_chats,
    purge_expired_team_work,
)
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
    purged_work = purge_expired_team_work()
    for team_id in sorted({*purged, *purged_work}):
        work = purged_work.get(team_id, {})
        record_audit_log(
            None,
            AUDIT_RETENTION_PURGED,
            AUDIT_TARGET_TEAM,
            team_id,
            team_id=team_id,
            details={
                "deletedChats": purged.get(team_id, 0),
                "deletedAnalyses": work.get("analyses", 0),
                "deletedWorkflowRuns": work.get("workflowRuns", 0),
            },
        )
    delivered = deliver_platform_alerts(compute_platform_alerts())
    logger.info(
        "Maintenance: purged %d chats, %d analyses and %d workflow runs, "
        "delivered %d alerts",
        sum(purged.values()),
        sum(work["analyses"] for work in purged_work.values()),
        sum(work["workflowRuns"] for work in purged_work.values()),
        len(delivered),
    )
    return {
        "purged": purged,
        "purgedWork": purged_work,
        "alertsDelivered": len(delivered),
    }
