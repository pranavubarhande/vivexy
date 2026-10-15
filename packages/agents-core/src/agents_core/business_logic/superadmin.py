"""Platform operator (SUPER_ADMIN) views across every client and user."""

import os
import time
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import redis as redis_lib
from agents_core.business_logic.admin import (
    build_members_with_usage,
    build_team_invites,
)
from agents_core.business_logic.audit import list_audit_logs, record_audit_log
from agents_core.business_logic.org_policy import ensure_domain_available
from agents_core.business_logic.team_policy import month_start
from agents_core.business_logic.usage import (
    get_daily_usage_for_users,
    get_usage_by_model_for_users,
    get_usage_totals,
)
from agents_core.constants.audit_actions import (
    AUDIT_CLIENT_PLAN_CHANGED,
    AUDIT_CLIENT_UPDATED,
    AUDIT_IMPERSONATION_STARTED,
    AUDIT_MODEL_UPDATED,
    AUDIT_TARGET_MODEL,
    AUDIT_TARGET_TEAM,
    AUDIT_TARGET_USER,
    AUDIT_USER_UPDATED,
)
from agents_core.constants.billing import (
    IMPERSONATION_TTL_MINUTES,
    MANUAL_SUBSCRIPTION_PREFIX,
    PLAN_PRICES_USD,
)
from agents_core.models import (
    Chat,
    LLMModel,
    Message,
    Plan,
    Role,
    ScheduledTask,
    ScheduledTaskRun,
    Subscription,
    SubscriptionStatus,
    Team,
    TeamMember,
    TokenUsage,
    User,
    db,
)
from agents_core.schemas import (
    ClientPlanUpdate,
    ClientUpdate,
    LLMModelAdminUpdate,
    PlatformUserUpdate,
)
from agents_core.utils.auth import generate_token
from sqlalchemy import func

LIVE_SUBSCRIPTION_STATUSES = (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING)


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _paginate(query, page: int, page_size: int):
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return rows, total


def _team_plan(team_id: str) -> str:
    subscription = (
        Subscription.query.filter(
            Subscription.team_id == team_id,
            Subscription.status.in_(LIVE_SUBSCRIPTION_STATUSES),
        )
        .order_by(Subscription.created_at.desc())
        .first()
    )
    return subscription.plan.value if subscription else Plan.FREE.value


def get_platform_overview() -> Dict[str, Any]:
    now = datetime.utcnow()
    last_7_days = now - timedelta(days=7)
    last_30_days = now - timedelta(days=30)

    active_users_30d = (
        db.session.query(func.count(func.distinct(TokenUsage.user_id)))
        .filter(TokenUsage.created_at >= last_30_days)
        .scalar()
    )
    plan_rows = (
        db.session.query(Subscription.plan, func.count(Subscription.id))
        .filter(Subscription.status.in_(LIVE_SUBSCRIPTION_STATUSES))
        .group_by(Subscription.plan)
        .all()
    )
    paid_plans = {plan.value: count for plan, count in plan_rows}
    active_rows = (
        db.session.query(Subscription.plan, func.count(Subscription.id))
        .filter(Subscription.status == SubscriptionStatus.ACTIVE)
        .group_by(Subscription.plan)
        .all()
    )
    mrr = sum(PLAN_PRICES_USD.get(plan.value, 0) * count for plan, count in active_rows)
    churned_30d = Subscription.query.filter(
        Subscription.status == SubscriptionStatus.CANCELED,
        Subscription.updated_at >= last_30_days,
    ).count()
    trialing = Subscription.query.filter(
        Subscription.status == SubscriptionStatus.TRIALING
    ).count()

    return {
        "users": {
            "total": User.query.count(),
            "new7d": User.query.filter(User.created_at >= last_7_days).count(),
            "new30d": User.query.filter(User.created_at >= last_30_days).count(),
            "active30d": int(active_users_30d or 0),
            "suspended": User.query.filter(User.is_suspended.is_(True)).count(),
        },
        "clients": {
            "total": Team.query.count(),
            "new30d": Team.query.filter(Team.created_at >= last_30_days).count(),
            "suspended": Team.query.filter(Team.is_suspended.is_(True)).count(),
        },
        "activity": {
            "chats": Chat.query.count(),
            "messages": Message.query.count(),
        },
        "usage": {
            "allTime": get_usage_totals(None),
            "last30d": get_usage_totals(None, last_30_days),
            "monthToDate": get_usage_totals(None, month_start()),
        },
        "subscriptions": {
            "paidByPlan": paid_plans,
            "activeTotal": sum(paid_plans.values()),
            "trialing": trialing,
            "churned30d": churned_30d,
        },
        "revenue": {
            "mrrUsd": round(mrr, 2),
            "arrUsd": round(mrr * 12, 2),
            "aiCost30dUsd": get_usage_totals(None, last_30_days)["totalCostUsd"],
        },
    }


def get_platform_usage(days: int = 30) -> Dict[str, Any]:
    return {
        "daily": get_daily_usage_for_users(None, days),
        "byModel": get_usage_by_model_for_users(None, days),
        "periodDays": days,
    }


def list_clients(
    search: Optional[str] = None,
    suspended: Optional[bool] = None,
    page: int = 1,
    page_size: int = 25,
    days: int = 30,
) -> Dict[str, Any]:
    query = Team.query.join(User, Team.owner_id == User.id)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            db.or_(
                Team.name.ilike(pattern),
                Team.slug.ilike(pattern),
                User.email.ilike(pattern),
            )
        )
    if suspended is not None:
        query = query.filter(Team.is_suspended.is_(suspended))

    teams, total = _paginate(query.order_by(Team.created_at.desc()), page, page_size)
    team_ids = [team.id for team in teams] or [""]
    since = datetime.utcnow() - timedelta(days=days)

    member_counts = dict(
        db.session.query(TeamMember.team_id, func.count(TeamMember.id))
        .filter(TeamMember.team_id.in_(team_ids))
        .group_by(TeamMember.team_id)
        .all()
    )
    usage_rows = (
        db.session.query(
            TokenUsage.team_id,
            func.coalesce(func.sum(TokenUsage.total_cost_usd), 0.0),
            func.coalesce(func.sum(TokenUsage.total_tokens), 0),
            func.max(TokenUsage.created_at),
        )
        .filter(TokenUsage.team_id.in_(team_ids), TokenUsage.created_at >= since)
        .group_by(TokenUsage.team_id)
        .all()
    )
    usage_by_team = {
        row[0]: {
            "totalCostUsd": round(float(row[1]), 6),
            "totalTokens": int(row[2]),
            "lastActiveAt": _iso(row[3]),
        }
        for row in usage_rows
    }
    empty_usage = {"totalCostUsd": 0.0, "totalTokens": 0, "lastActiveAt": None}

    return {
        "items": [
            {
                "id": team.id,
                "name": team.name,
                "slug": team.slug,
                "owner": {
                    "id": team.owner.id,
                    "name": team.owner.name,
                    "email": team.owner.email,
                },
                "memberCount": member_counts.get(team.id, 0),
                "seatLimit": team.seat_limit,
                "isSuspended": team.is_suspended,
                "plan": _team_plan(team.id),
                "usage": usage_by_team.get(team.id, empty_usage),
                "createdAt": _iso(team.created_at),
            }
            for team in teams
        ],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "periodDays": days,
    }


def get_client_detail(team_id: str, days: int = 30) -> Dict[str, Any]:
    team = Team.query.get(team_id)
    if not team:
        raise LookupError("Client not found")

    since = datetime.utcnow() - timedelta(days=days)
    return {
        "id": team.id,
        "name": team.name,
        "slug": team.slug,
        "description": team.description,
        "owner": {
            "id": team.owner.id,
            "name": team.owner.name,
            "email": team.owner.email,
        },
        "isSuspended": team.is_suspended,
        "seatLimit": team.seat_limit,
        "monthlyBudgetUsd": team.monthly_budget_usd,
        "notes": team.notes,
        "featureFlags": team.feature_flags or {},
        "budgetEnforcement": team.budget_enforcement,
        "emailDomain": team.email_domain,
        "domainVerified": team.domain_verified,
        "autoJoinDomain": team.auto_join_domain,
        "requireSso": team.require_sso,
        "retentionDays": team.retention_days,
        "plan": _team_plan(team.id),
        "createdAt": _iso(team.created_at),
        "members": build_members_with_usage(team_id, days),
        "invites": build_team_invites(team_id),
        "usage": {
            "period": get_usage_totals(team_id=team_id, since=since),
            "allTime": get_usage_totals(team_id=team_id),
            "monthToDate": get_usage_totals(team_id=team_id, since=month_start()),
            "daily": get_daily_usage_for_users(days=days, team_id=team_id),
        },
        "recentAuditLogs": list_audit_logs(team_id=team_id, page_size=20)["items"],
        "periodDays": days,
    }


def update_client(team_id: str, payload: ClientUpdate, actor: User) -> Dict[str, Any]:
    team = Team.query.get(team_id)
    if not team:
        raise LookupError("Client not found")

    changes = {}
    for field, column in (
        ("is_suspended", "is_suspended"),
        ("seat_limit", "seat_limit"),
        ("notes", "notes"),
        ("feature_flags", "feature_flags"),
        ("domain_verified", "domain_verified"),
    ):
        if field not in payload.model_fields_set:
            continue
        new_value = getattr(payload, field)
        if field in ("is_suspended", "domain_verified") and new_value is None:
            continue
        if field == "domain_verified" and new_value:
            if not team.email_domain:
                raise ValueError("This client has not set an email domain")
            ensure_domain_available(team, team.email_domain)
        old_value = getattr(team, column)
        if old_value != new_value:
            setattr(team, column, new_value)
            changes[field] = {"from": old_value, "to": new_value}

    if changes:
        record_audit_log(
            actor,
            AUDIT_CLIENT_UPDATED,
            AUDIT_TARGET_TEAM,
            team_id,
            team_id=team_id,
            details=changes,
            commit=False,
        )
    db.session.commit()
    return get_client_detail(team_id)


def _serialize_platform_user(
    user: User, team_count: int, usage: Dict[str, Any]
) -> Dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar": user.avatar,
        "role": user.role.value,
        "emailVerified": user.email_verified,
        "isSuspended": user.is_suspended,
        "oauthProvider": user.oauth_provider,
        "lastLoginAt": _iso(user.last_login_at),
        "createdAt": _iso(user.created_at),
        "teamCount": team_count,
        "usage": usage,
    }


def list_users(
    search: Optional[str] = None,
    role: Optional[Role] = None,
    suspended: Optional[bool] = None,
    page: int = 1,
    page_size: int = 25,
    days: int = 30,
) -> Dict[str, Any]:
    query = User.query
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            db.or_(User.email.ilike(pattern), User.name.ilike(pattern))
        )
    if role:
        query = query.filter(User.role == role)
    if suspended is not None:
        query = query.filter(User.is_suspended.is_(suspended))

    users, total = _paginate(query.order_by(User.created_at.desc()), page, page_size)
    user_ids = [user.id for user in users] or [""]
    since = datetime.utcnow() - timedelta(days=days)

    team_counts = dict(
        db.session.query(TeamMember.user_id, func.count(TeamMember.id))
        .filter(TeamMember.user_id.in_(user_ids))
        .group_by(TeamMember.user_id)
        .all()
    )
    usage_rows = (
        db.session.query(
            TokenUsage.user_id,
            func.coalesce(func.sum(TokenUsage.total_cost_usd), 0.0),
            func.coalesce(func.sum(TokenUsage.total_tokens), 0),
            func.count(TokenUsage.id),
        )
        .filter(TokenUsage.user_id.in_(user_ids), TokenUsage.created_at >= since)
        .group_by(TokenUsage.user_id)
        .all()
    )
    usage_by_user = {
        row[0]: {
            "totalCostUsd": round(float(row[1]), 6),
            "totalTokens": int(row[2]),
            "messageCount": int(row[3]),
        }
        for row in usage_rows
    }
    empty_usage = {"totalCostUsd": 0.0, "totalTokens": 0, "messageCount": 0}

    return {
        "items": [
            _serialize_platform_user(
                user,
                team_counts.get(user.id, 0),
                usage_by_user.get(user.id, empty_usage),
            )
            for user in users
        ],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "periodDays": days,
    }


def get_user_detail(user_id: str, days: int = 30) -> Dict[str, Any]:
    user = User.query.get(user_id)
    if not user:
        raise LookupError("User not found")

    since = datetime.utcnow() - timedelta(days=days)
    memberships = TeamMember.query.filter_by(user_id=user_id).all()
    detail = _serialize_platform_user(
        user, len(memberships), get_usage_totals([user_id], since)
    )
    detail.update(
        {
            "teams": [
                {
                    "id": membership.team.id,
                    "name": membership.team.name,
                    "role": membership.role.value,
                    "isSuspended": membership.team.is_suspended,
                    "joinedAt": _iso(membership.joined_at),
                }
                for membership in memberships
            ],
            "chatCount": Chat.query.filter_by(user_id=user_id).count(),
            "allTimeUsage": get_usage_totals([user_id]),
            "daily": get_daily_usage_for_users([user_id], days),
            "byModel": get_usage_by_model_for_users([user_id], days),
            "periodDays": days,
        }
    )
    return detail


def update_user(
    user_id: str, payload: PlatformUserUpdate, actor: User
) -> Dict[str, Any]:
    user = User.query.get(user_id)
    if not user:
        raise LookupError("User not found")
    if user.id == actor.id:
        raise ValueError("You cannot change your own role or suspension status")

    changes = {}
    if payload.is_suspended is not None and payload.is_suspended != user.is_suspended:
        changes["isSuspended"] = {"from": user.is_suspended, "to": payload.is_suspended}
        user.is_suspended = payload.is_suspended
    if payload.role is not None and payload.role != user.role:
        changes["role"] = {"from": user.role.value, "to": payload.role.value}
        user.role = payload.role

    if changes:
        record_audit_log(
            actor,
            AUDIT_USER_UPDATED,
            AUDIT_TARGET_USER,
            user_id,
            details={"email": user.email, **changes},
            commit=False,
        )
    db.session.commit()
    return get_user_detail(user_id)


def get_platform_audit_logs(
    team_id: Optional[str] = None,
    action: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    return list_audit_logs(
        team_id=team_id, action=action, page=page, page_size=page_size
    )


def _live_team_subscription(team_id: str) -> Optional[Subscription]:
    return (
        Subscription.query.filter(
            Subscription.team_id == team_id,
            Subscription.status.in_(LIVE_SUBSCRIPTION_STATUSES),
        )
        .order_by(Subscription.created_at.desc())
        .first()
    )


def set_client_plan(
    team_id: str, payload: ClientPlanUpdate, actor: User
) -> Dict[str, Any]:
    """Manually comp, upgrade or trial a client outside Stripe."""
    team = Team.query.get(team_id)
    if not team:
        raise LookupError("Client not found")

    current = _live_team_subscription(team_id)
    previous_plan = current.plan.value if current else Plan.FREE.value
    if current and not current.stripe_subscription_id.startswith(
        MANUAL_SUBSCRIPTION_PREFIX
    ):
        raise ValueError(
            "This client is billed through Stripe. Change the plan in Stripe."
        )

    now = datetime.utcnow()
    if payload.plan == Plan.FREE:
        if current:
            current.status = SubscriptionStatus.CANCELED
            current.current_period_end = now
    else:
        subscription = current or Subscription(
            team_id=team_id,
            user_id=team.owner_id,
            stripe_subscription_id=f"{MANUAL_SUBSCRIPTION_PREFIX}{uuid.uuid4()}",
            current_period_start=now,
        )
        subscription.plan = payload.plan
        subscription.status = SubscriptionStatus(payload.status)
        subscription.current_period_end = payload.period_end
        db.session.add(subscription)

    record_audit_log(
        actor,
        AUDIT_CLIENT_PLAN_CHANGED,
        AUDIT_TARGET_TEAM,
        team_id,
        team_id=team_id,
        details={
            "plan": {"from": previous_plan, "to": payload.plan.value},
            "status": payload.status,
            "periodEnd": payload.period_end.isoformat() if payload.period_end else None,
        },
        commit=False,
    )
    db.session.commit()
    return get_client_detail(team_id)


def start_impersonation(user_id: str, actor: User) -> Dict[str, Any]:
    target = User.query.get(user_id)
    if not target:
        raise LookupError("User not found")
    if target.id == actor.id:
        raise ValueError("You cannot impersonate yourself")
    if target.role == Role.SUPER_ADMIN:
        raise PermissionError("Super admins cannot be impersonated")
    if target.is_suspended:
        raise ValueError("Suspended users cannot be impersonated")

    record_audit_log(
        actor,
        AUDIT_IMPERSONATION_STARTED,
        AUDIT_TARGET_USER,
        target.id,
        details={"email": target.email, "minutes": IMPERSONATION_TTL_MINUTES},
    )
    token = generate_token(
        target.id,
        target.email,
        expires_in=timedelta(minutes=IMPERSONATION_TTL_MINUTES),
        extra_claims={"impersonatorId": actor.id},
    )
    return {
        "token": token,
        "expiresInMinutes": IMPERSONATION_TTL_MINUTES,
        "user": {"id": target.id, "email": target.email, "name": target.name},
    }


def list_models(days: int = 30) -> List[Dict[str, Any]]:
    since = datetime.utcnow() - timedelta(days=days)
    usage_by_model = {
        row[0]: {"totalCostUsd": round(float(row[1]), 6), "messageCount": int(row[2])}
        for row in db.session.query(
            TokenUsage.model_id,
            func.coalesce(func.sum(TokenUsage.total_cost_usd), 0.0),
            func.count(TokenUsage.id),
        )
        .filter(TokenUsage.created_at >= since)
        .group_by(TokenUsage.model_id)
        .all()
    }
    models = LLMModel.query.order_by(LLMModel.provider.asc(), LLMModel.name.asc())
    return [
        {
            "id": model.id,
            "name": model.name,
            "provider": model.provider,
            "modelId": model.model_id,
            "isActive": bool(model.is_active),
            "inputCost": model.input_cost,
            "outputCost": model.output_cost,
            "contextWindow": model.context_window,
            "usage": usage_by_model.get(
                model.id, {"totalCostUsd": 0.0, "messageCount": 0}
            ),
        }
        for model in models.all()
    ]


def update_model(
    model_id: str, payload: LLMModelAdminUpdate, actor: User
) -> Dict[str, Any]:
    model = LLMModel.query.get(model_id)
    if not model:
        raise LookupError("Model not found")

    changes = {}
    for field in ("is_active", "input_cost", "output_cost"):
        if field not in payload.model_fields_set:
            continue
        new_value = getattr(payload, field)
        if field == "is_active" and new_value is None:
            continue
        if getattr(model, field) != new_value:
            changes[field] = {"from": getattr(model, field), "to": new_value}
            setattr(model, field, new_value)

    if changes:
        record_audit_log(
            actor,
            AUDIT_MODEL_UPDATED,
            AUDIT_TARGET_MODEL,
            model.id,
            details={"model": model.name, **changes},
            commit=False,
        )
    db.session.commit()
    return next(item for item in list_models() if item["id"] == model.id)


def _redis_health() -> Dict[str, Any]:
    started = time.perf_counter()
    try:
        client = redis_lib.from_url(
            os.environ.get("REDIS_URL", "redis://localhost:6379"),
            socket_connect_timeout=1,
            socket_timeout=1,
        )
        client.ping()
        return {
            "ok": True,
            "latencyMs": round((time.perf_counter() - started) * 1000, 1),
        }
    except Exception as error:
        return {"ok": False, "error": str(error)}


def get_platform_health() -> Dict[str, Any]:
    now = datetime.utcnow()
    last_24h = now - timedelta(hours=24)
    last_hour = now - timedelta(hours=1)

    runs_24h = ScheduledTaskRun.query.filter(ScheduledTaskRun.ran_at >= last_24h)
    failed_runs = (
        db.session.query(ScheduledTaskRun, ScheduledTask.name)
        .join(ScheduledTask, ScheduledTask.id == ScheduledTaskRun.task_id)
        .filter(
            ScheduledTaskRun.ran_at >= last_24h, ScheduledTaskRun.status == "failed"
        )
        .order_by(ScheduledTaskRun.ran_at.desc())
        .limit(10)
        .all()
    )
    stuck_runs = ScheduledTaskRun.query.filter(
        ScheduledTaskRun.status == "running", ScheduledTaskRun.ran_at < last_hour
    ).count()
    started_db = time.perf_counter()
    db.session.execute(db.text("SELECT 1"))
    db_latency = round((time.perf_counter() - started_db) * 1000, 1)

    return {
        "database": {"ok": True, "latencyMs": db_latency},
        "redis": _redis_health(),
        "broker": {
            "rabbitmq": os.environ.get("USE_RABBITMQ", "false").lower() == "true",
            "redisStream": os.environ.get("USE_REDIS_STREAM", "false").lower()
            == "true",
        },
        "scheduledTasks": {
            "runs24h": runs_24h.count(),
            "failed24h": runs_24h.filter(ScheduledTaskRun.status == "failed").count(),
            "stuck": stuck_runs,
            "recentFailures": [
                {
                    "id": run.id,
                    "taskName": task_name,
                    "error": (run.error or "")[:300],
                    "ranAt": _iso(run.ran_at),
                }
                for run, task_name in failed_runs
            ],
        },
        "activity": {
            "messagesLastHour": TokenUsage.query.filter(
                TokenUsage.created_at >= last_hour
            ).count(),
            "activeUsersLastHour": db.session.query(
                func.count(func.distinct(TokenUsage.user_id))
            )
            .filter(TokenUsage.created_at >= last_hour)
            .scalar(),
        },
        "checkedAt": now.isoformat(),
    }
