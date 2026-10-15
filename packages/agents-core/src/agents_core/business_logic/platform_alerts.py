"""Anomaly detection for the platform operator, delivered to Slack and email."""

import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List

import redis as redis_lib
import requests
from agents_core.business_logic.team_policy import month_start
from agents_core.models import ScheduledTaskRun, Team, TokenUsage, User, db
from agents_core.utils.email import send_platform_alert_email
from sqlalchemy import func

logger = logging.getLogger(__name__)

SPIKE_MULTIPLIER = 3
MIN_SPIKE_COST_USD = 5.0
MIN_SIGNUP_SPIKE = 10
TASK_FAILURE_THRESHOLD = 5
ALERT_DEDUPE_TTL_SECONDS = 24 * 60 * 60
REDIS_KEY_ALERT_SENT = "platform_alert:{key}"

_sent_without_redis: Dict[str, datetime] = {}


def _daily_cost(since: datetime, until: datetime, team_id=None) -> float:
    query = TokenUsage.query.filter(
        TokenUsage.created_at >= since, TokenUsage.created_at < until
    )
    if team_id:
        query = query.filter(TokenUsage.team_id == team_id)
    return float(
        query.with_entities(
            func.coalesce(func.sum(TokenUsage.total_cost_usd), 0.0)
        ).scalar()
        or 0.0
    )


def compute_platform_alerts(now: datetime | None = None) -> List[Dict[str, Any]]:
    now = now or datetime.utcnow()
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=8)
    alerts: List[Dict[str, Any]] = []

    cost_today = _daily_cost(day_ago, now)
    cost_baseline = _daily_cost(week_ago, day_ago) / 7
    if (
        cost_today >= MIN_SPIKE_COST_USD
        and cost_today > cost_baseline * SPIKE_MULTIPLIER
    ):
        alerts.append(
            {
                "key": "platform_cost_spike",
                "severity": "warning",
                "title": "Platform AI spend spike",
                "detail": (
                    f"${cost_today:,.2f} in the last 24h vs "
                    f"${cost_baseline:,.2f}/day average over the prior week"
                ),
            }
        )

    team_costs = (
        db.session.query(
            TokenUsage.team_id, func.sum(TokenUsage.total_cost_usd).label("cost")
        )
        .filter(TokenUsage.created_at >= day_ago, TokenUsage.team_id.isnot(None))
        .group_by(TokenUsage.team_id)
        .having(func.sum(TokenUsage.total_cost_usd) >= MIN_SPIKE_COST_USD)
        .all()
    )
    for team_id, team_cost in team_costs:
        baseline = _daily_cost(week_ago, day_ago, team_id) / 7
        if team_cost > baseline * SPIKE_MULTIPLIER:
            team = Team.query.get(team_id)
            alerts.append(
                {
                    "key": f"client_cost_spike:{team_id}",
                    "severity": "warning",
                    "title": f"Spend spike at {team.name if team else team_id}",
                    "detail": (
                        f"${float(team_cost):,.2f} in 24h vs "
                        f"${baseline:,.2f}/day average"
                    ),
                    "teamId": team_id,
                }
            )

    signups_today = User.query.filter(User.created_at >= day_ago).count()
    signup_baseline = (
        User.query.filter(
            User.created_at >= week_ago, User.created_at < day_ago
        ).count()
        / 7
    )
    if (
        signups_today >= MIN_SIGNUP_SPIKE
        and signups_today > signup_baseline * SPIKE_MULTIPLIER
    ):
        alerts.append(
            {
                "key": "signup_spike",
                "severity": "info",
                "title": "Signup spike",
                "detail": (
                    f"{signups_today} signups in 24h vs "
                    f"{signup_baseline:.1f}/day average — check for abuse"
                ),
            }
        )

    failed_runs = ScheduledTaskRun.query.filter(
        ScheduledTaskRun.ran_at >= day_ago, ScheduledTaskRun.status == "failed"
    ).count()
    if failed_runs >= TASK_FAILURE_THRESHOLD:
        alerts.append(
            {
                "key": "scheduled_task_failures",
                "severity": "critical",
                "title": "Scheduled tasks failing",
                "detail": f"{failed_runs} failed runs in the last 24h",
            }
        )

    for team in Team.query.filter(Team.monthly_budget_usd.isnot(None)).all():
        spent = _daily_cost(month_start(), now, team.id)
        if spent >= team.monthly_budget_usd:
            alerts.append(
                {
                    "key": f"client_over_budget:{team.id}:{now:%Y-%m}",
                    "severity": "info",
                    "title": f"{team.name} is over its monthly budget",
                    "detail": f"${spent:,.2f} of ${team.monthly_budget_usd:,.2f}",
                    "teamId": team.id,
                }
            )
    return alerts


def _claim_alert(key: str) -> bool:
    """True the first time an alert key is seen within the dedupe window."""
    try:
        client = redis_lib.from_url(
            os.environ.get("REDIS_URL", "redis://localhost:6379"),
            socket_connect_timeout=1,
        )
        return bool(
            client.set(
                REDIS_KEY_ALERT_SENT.format(key=key),
                "1",
                nx=True,
                ex=ALERT_DEDUPE_TTL_SECONDS,
            )
        )
    except Exception:
        last_sent = _sent_without_redis.get(key)
        if last_sent and datetime.utcnow() - last_sent < timedelta(days=1):
            return False
        _sent_without_redis[key] = datetime.utcnow()
        return True


def deliver_platform_alerts(alerts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    fresh_alerts = [alert for alert in alerts if _claim_alert(alert["key"])]
    if not fresh_alerts:
        return []

    lines = [f"[{a['severity']}] {a['title']}: {a['detail']}" for a in fresh_alerts]
    webhook_url = os.environ.get("SLACK_ALERT_WEBHOOK_URL")
    if webhook_url:
        try:
            requests.post(
                webhook_url,
                json={"text": "Vivexy platform alerts\n" + "\n".join(lines)},
                timeout=5,
            )
        except Exception:
            logger.exception("Failed to post platform alerts to Slack")

    recipients = [
        email.strip()
        for email in os.environ.get("PLATFORM_ALERT_EMAILS", "").split(",")
        if email.strip()
    ]
    if recipients:
        try:
            send_platform_alert_email(recipients, "Vivexy platform alerts", lines)
        except Exception:
            logger.exception("Failed to email platform alerts")
    return fresh_alerts
