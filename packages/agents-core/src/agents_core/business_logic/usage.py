"""
Token usage business logic — aggregations for the cost manager.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List

from agents_core.models.token_usage import TokenUsage
from sqlalchemy import func

logger = logging.getLogger(__name__)


def get_usage_summary(user_id: str, days: int = 30) -> Dict[str, Any]:
    """Return total token/cost summary for the last `days` days."""
    since = datetime.utcnow() - timedelta(days=days)

    row = (
        TokenUsage.query.filter(
            TokenUsage.user_id == user_id,
            TokenUsage.created_at >= since,
        )
        .with_entities(
            func.coalesce(func.sum(TokenUsage.input_tokens), 0),
            func.coalesce(func.sum(TokenUsage.output_tokens), 0),
            func.coalesce(func.sum(TokenUsage.total_tokens), 0),
            func.coalesce(func.sum(TokenUsage.input_cost_usd), 0.0),
            func.coalesce(func.sum(TokenUsage.output_cost_usd), 0.0),
            func.coalesce(func.sum(TokenUsage.total_cost_usd), 0.0),
            func.count(TokenUsage.id),
        )
        .one()
    )

    return {
        "inputTokens": int(row[0]),
        "outputTokens": int(row[1]),
        "totalTokens": int(row[2]),
        "inputCostUsd": round(float(row[3]), 6),
        "outputCostUsd": round(float(row[4]), 6),
        "totalCostUsd": round(float(row[5]), 6),
        "messageCount": int(row[6]),
        "periodDays": days,
    }


def get_usage_by_model(user_id: str, days: int = 30) -> List[Dict[str, Any]]:
    """Return per-model token and cost breakdown."""
    since = datetime.utcnow() - timedelta(days=days)

    rows = (
        TokenUsage.query.filter(
            TokenUsage.user_id == user_id,
            TokenUsage.created_at >= since,
        )
        .with_entities(
            TokenUsage.model_name,
            TokenUsage.provider,
            func.coalesce(func.sum(TokenUsage.input_tokens), 0),
            func.coalesce(func.sum(TokenUsage.output_tokens), 0),
            func.coalesce(func.sum(TokenUsage.total_tokens), 0),
            func.coalesce(func.sum(TokenUsage.input_cost_usd), 0.0),
            func.coalesce(func.sum(TokenUsage.output_cost_usd), 0.0),
            func.coalesce(func.sum(TokenUsage.total_cost_usd), 0.0),
            func.count(TokenUsage.id),
        )
        .group_by(TokenUsage.model_name, TokenUsage.provider)
        .order_by(func.sum(TokenUsage.total_cost_usd).desc())
        .all()
    )

    return [
        {
            "modelName": r[0] or "Unknown",
            "provider": r[1] or "unknown",
            "inputTokens": int(r[2]),
            "outputTokens": int(r[3]),
            "totalTokens": int(r[4]),
            "inputCostUsd": round(float(r[5]), 6),
            "outputCostUsd": round(float(r[6]), 6),
            "totalCostUsd": round(float(r[7]), 6),
            "messageCount": int(r[8]),
        }
        for r in rows
    ]


def get_daily_usage(user_id: str, days: int = 30) -> List[Dict[str, Any]]:
    """Return daily token and cost totals for the last `days` days."""
    since = datetime.utcnow() - timedelta(days=days)

    rows = (
        TokenUsage.query.filter(
            TokenUsage.user_id == user_id,
            TokenUsage.created_at >= since,
        )
        .with_entities(
            func.date(TokenUsage.created_at).label("day"),
            func.coalesce(func.sum(TokenUsage.total_tokens), 0),
            func.coalesce(func.sum(TokenUsage.total_cost_usd), 0.0),
            func.count(TokenUsage.id),
        )
        .group_by(func.date(TokenUsage.created_at))
        .order_by(func.date(TokenUsage.created_at).asc())
        .all()
    )

    return [
        {
            "date": str(r[0]),
            "totalTokens": int(r[1]),
            "totalCostUsd": round(float(r[2]), 6),
            "messageCount": int(r[3]),
        }
        for r in rows
    ]


def get_recent_usage(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Return the most recent token usage records."""
    rows = (
        TokenUsage.query.filter(TokenUsage.user_id == user_id)
        .order_by(TokenUsage.created_at.desc())
        .limit(limit)
        .all()
    )
    return [r.to_dict() for r in rows]
