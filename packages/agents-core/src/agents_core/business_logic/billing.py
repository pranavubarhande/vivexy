"""Stripe billing for teams: Checkout, the customer portal and the webhook that
keeps `subscriptions` / `invoices` in sync (which is what revenue reads)."""

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, Optional

import stripe
from agents_core.business_logic.admin import get_team_for_admin
from agents_core.business_logic.audit import record_audit_log
from agents_core.constants.audit_actions import (
    AUDIT_SUBSCRIPTION_SYNCED,
    AUDIT_TARGET_TEAM,
)
from agents_core.constants.billing import MANUAL_SUBSCRIPTION_PREFIX
from agents_core.models import (
    Invoice,
    Plan,
    StripeEventLog,
    Subscription,
    SubscriptionStatus,
    Team,
    User,
    db,
)
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)

PLAN_PRICE_ENV = {
    Plan.PRO: "STRIPE_PRICE_ID_PRO",
    Plan.ENTERPRISE: "STRIPE_PRICE_ID_ENTERPRISE",
}
STRIPE_STATUS_MAP = {
    "active": SubscriptionStatus.ACTIVE,
    "trialing": SubscriptionStatus.TRIALING,
    "past_due": SubscriptionStatus.PAST_DUE,
    "unpaid": SubscriptionStatus.UNPAID,
    "canceled": SubscriptionStatus.CANCELED,
    "incomplete": SubscriptionStatus.INACTIVE,
    "incomplete_expired": SubscriptionStatus.CANCELED,
    "paused": SubscriptionStatus.INACTIVE,
}
LIVE_STATUSES = (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING)
SUBSCRIPTION_EVENTS = (
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
)
INVOICE_EVENTS = (
    "invoice.finalized",
    "invoice.paid",
    "invoice.payment_failed",
    "invoice.voided",
    "invoice.marked_uncollectible",
)


class BillingNotConfiguredError(RuntimeError):
    pass


def _secret_key() -> str:
    key = os.environ.get("STRIPE_SECRET_KEY")
    if not key:
        raise BillingNotConfiguredError("Stripe billing is not configured")
    return key


def billing_configured() -> bool:
    return bool(os.environ.get("STRIPE_SECRET_KEY"))


def price_id_for_plan(plan: Plan) -> str:
    price_id = os.environ.get(PLAN_PRICE_ENV.get(plan, ""), "")
    if not price_id:
        raise ValueError(f"The {plan.value.title()} plan is not available for purchase")
    return price_id


def plan_for_price(price: Dict[str, Any]) -> Optional[Plan]:
    """Configured price IDs win; price metadata.plan / lookup_key are fallbacks
    so prices created later in the dashboard still map to a plan."""
    for plan, env_name in PLAN_PRICE_ENV.items():
        if price.get("id") and price.get("id") == os.environ.get(env_name):
            return plan
    for candidate in (
        (price.get("metadata") or {}).get("plan"),
        price.get("lookup_key"),
    ):
        if candidate and candidate.upper() in Plan.__members__:
            return Plan[candidate.upper()]
    return None


def _ts(value: Optional[int]) -> Optional[datetime]:
    return datetime.utcfromtimestamp(value) if value else None


def _frontend_url() -> str:
    from flask import current_app

    return current_app.config.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")


def _live_stripe_subscription(team_id: str) -> Optional[Subscription]:
    return (
        Subscription.query.filter(
            Subscription.team_id == team_id,
            Subscription.status.in_(LIVE_STATUSES),
            ~Subscription.stripe_subscription_id.startswith(MANUAL_SUBSCRIPTION_PREFIX),
        )
        .order_by(Subscription.created_at.desc())
        .first()
    )


def _ensure_customer(team: Team, user: User) -> str:
    if team.stripe_customer_id:
        return team.stripe_customer_id
    customer = stripe.Customer.create(
        api_key=_secret_key(),
        email=user.email,
        name=team.name,
        metadata={"team_id": team.id},
    )
    team.stripe_customer_id = customer.id
    db.session.commit()
    return customer.id


# --------------------------------------------------------------------------- #
#  Team-facing                                                                 #
# --------------------------------------------------------------------------- #


def create_checkout_session(team_id: str, plan: Plan, user: User) -> Dict[str, str]:
    team, _ = get_team_for_admin(team_id, user)
    if team.is_suspended:
        raise PermissionError("This team is suspended. Contact support.")
    if _live_stripe_subscription(team.id):
        raise ValueError(
            "This team already has a subscription. Use Manage billing to change it."
        )
    price_id = price_id_for_plan(plan)
    metadata = {"team_id": team.id, "user_id": user.id}
    frontend = _frontend_url()
    session = stripe.checkout.Session.create(
        api_key=_secret_key(),
        mode="subscription",
        customer=_ensure_customer(team, user),
        client_reference_id=team.id,
        line_items=[{"price": price_id, "quantity": 1}],
        metadata=metadata,
        subscription_data={"metadata": metadata},
        success_url=f"{frontend}/billing?checkout=success",
        cancel_url=f"{frontend}/billing?checkout=cancelled",
    )
    return {"url": session.url}


def create_portal_session(team_id: str, user: User) -> Dict[str, str]:
    team, _ = get_team_for_admin(team_id, user)
    if not team.stripe_customer_id:
        raise ValueError("This team has no Stripe billing account yet")
    session = stripe.billing_portal.Session.create(
        api_key=_secret_key(),
        customer=team.stripe_customer_id,
        return_url=f"{_frontend_url()}/billing",
    )
    return {"url": session.url}


def _serialize_subscription(subscription: Subscription) -> Dict[str, Any]:
    return {
        "id": subscription.id,
        "teamId": subscription.team_id,
        "plan": subscription.plan.value,
        "status": subscription.status.value,
        "isManual": subscription.stripe_subscription_id.startswith(
            MANUAL_SUBSCRIPTION_PREFIX
        ),
        "currentPeriodStart": (
            subscription.current_period_start.isoformat()
            if subscription.current_period_start
            else None
        ),
        "currentPeriodEnd": (
            subscription.current_period_end.isoformat()
            if subscription.current_period_end
            else None
        ),
        "cancelAtPeriodEnd": bool(subscription.cancel_at_period_end),
    }


def get_billing_summary(team_id: str, user: User) -> Dict[str, Any]:
    team, membership = get_team_for_admin(team_id, user)
    subscription = (
        Subscription.query.filter(
            Subscription.team_id == team.id, Subscription.status.in_(LIVE_STATUSES)
        )
        .order_by(Subscription.created_at.desc())
        .first()
    ) or (
        Subscription.query.filter_by(team_id=team.id)
        .order_by(Subscription.updated_at.desc())
        .first()
    )
    invoices = (
        Invoice.query.join(Subscription, Invoice.subscription_id == Subscription.id)
        .filter(Subscription.team_id == team.id)
        .order_by(Invoice.created_at.desc())
        .limit(24)
        .all()
    )
    return {
        "teamId": team.id,
        "teamName": team.name,
        "viewerRole": membership.role.value,
        "billingConfigured": billing_configured(),
        "hasBillingAccount": bool(team.stripe_customer_id),
        "purchasablePlans": [
            plan.value for plan, env in PLAN_PRICE_ENV.items() if os.environ.get(env)
        ],
        "subscription": _serialize_subscription(subscription) if subscription else None,
        "invoices": [
            {
                "id": invoice.id,
                "amount": invoice.amount,
                "currency": invoice.currency,
                "status": invoice.status,
                "plan": (
                    invoice.subscription.plan.value if invoice.subscription else None
                ),
                "invoicePdf": invoice.invoice_pdf,
                "hostedInvoiceUrl": invoice.hosted_invoice_url,
                "createdAt": (
                    invoice.created_at.isoformat() if invoice.created_at else None
                ),
            }
            for invoice in invoices
        ],
    }


# --------------------------------------------------------------------------- #
#  Webhook                                                                     #
# --------------------------------------------------------------------------- #


def _team_for(customer_id: Optional[str], metadata: Dict[str, Any]) -> Optional[Team]:
    team = Team.query.get(metadata["team_id"]) if metadata.get("team_id") else None
    if not team and customer_id:
        team = Team.query.filter_by(stripe_customer_id=customer_id).first()
    if team and customer_id and not team.stripe_customer_id:
        team.stripe_customer_id = customer_id
    return team


def sync_subscription(data: Dict[str, Any]) -> Optional[Subscription]:
    """Upsert a Stripe subscription object into `subscriptions`."""
    metadata = data.get("metadata") or {}
    team = _team_for(data.get("customer"), metadata)
    if not team:
        logger.warning("Stripe subscription %s has no matching team", data.get("id"))
        return None

    items = (data.get("items") or {}).get("data") or []
    first_item = items[0] if items else {}
    plan = plan_for_price(first_item.get("price") or {})
    status = STRIPE_STATUS_MAP.get(data.get("status"), SubscriptionStatus.INACTIVE)

    subscription = Subscription.query.filter_by(
        stripe_subscription_id=data["id"]
    ).first()
    previous = (
        (subscription.plan.value, subscription.status.value) if subscription else None
    )
    if not subscription:
        subscription = Subscription(
            stripe_subscription_id=data["id"],
            team_id=team.id,
            user_id=metadata.get("user_id") or team.owner_id,
        )
        db.session.add(subscription)
    subscription.stripe_customer_id = data.get("customer")
    subscription.status = status
    if plan:
        subscription.plan = plan
    elif not subscription.plan:
        logger.warning("Stripe subscription %s uses an unknown price", data["id"])
        subscription.plan = Plan.FREE
    # Newer API versions report the billing period per item.
    subscription.current_period_start = _ts(
        data.get("current_period_start") or first_item.get("current_period_start")
    )
    subscription.current_period_end = _ts(
        data.get("current_period_end") or first_item.get("current_period_end")
    )
    subscription.cancel_at_period_end = bool(data.get("cancel_at_period_end"))

    if status in LIVE_STATUSES:
        # A paid plan supersedes any manual comp/trial so revenue isn't doubled.
        Subscription.query.filter(
            Subscription.team_id == team.id,
            Subscription.status.in_(LIVE_STATUSES),
            Subscription.stripe_subscription_id.startswith(MANUAL_SUBSCRIPTION_PREFIX),
        ).update(
            {Subscription.status: SubscriptionStatus.CANCELED},
            synchronize_session=False,
        )

    current = (subscription.plan.value, subscription.status.value)
    if current != previous:
        record_audit_log(
            None,
            AUDIT_SUBSCRIPTION_SYNCED,
            AUDIT_TARGET_TEAM,
            team.id,
            team_id=team.id,
            details={
                "stripeSubscriptionId": data["id"],
                "from": (
                    {"plan": previous[0], "status": previous[1]} if previous else None
                ),
                "to": {"plan": current[0], "status": current[1]},
            },
            commit=False,
        )
    return subscription


def _invoice_subscription_id(data: Dict[str, Any]) -> Optional[str]:
    subscription_id = data.get("subscription")
    if not subscription_id:
        details = (data.get("parent") or {}).get("subscription_details") or {}
        subscription_id = details.get("subscription")
    if isinstance(subscription_id, dict):
        subscription_id = subscription_id.get("id")
    return subscription_id


def sync_invoice(data: Dict[str, Any]) -> Optional[Invoice]:
    stripe_subscription_id = _invoice_subscription_id(data)
    subscription = (
        Subscription.query.filter_by(
            stripe_subscription_id=stripe_subscription_id
        ).first()
        if stripe_subscription_id
        else None
    )
    if not subscription:
        # The subscription event usually lands first; Stripe retries otherwise.
        raise LookupError(
            f"Invoice {data.get('id')} references an unknown subscription"
        )

    invoice = Invoice.query.filter_by(stripe_invoice_id=data["id"]).first()
    if not invoice:
        invoice = Invoice(
            stripe_invoice_id=data["id"],
            user_id=subscription.user_id,
            created_at=_ts(data.get("created")) or datetime.utcnow(),
        )
        db.session.add(invoice)
    status = (data.get("status") or "open").upper()
    invoice.subscription_id = subscription.id
    invoice.amount = (
        data.get("amount_paid") if status == "PAID" else data.get("amount_due")
    ) or 0
    invoice.currency = (data.get("currency") or "usd").lower()
    invoice.status = status
    invoice.invoice_pdf = data.get("invoice_pdf")
    invoice.hosted_invoice_url = data.get("hosted_invoice_url")
    return invoice


def _handle_event(event: Dict[str, Any]) -> None:
    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        if data.get("mode") != "subscription" or not data.get("subscription"):
            return
        subscription = stripe.Subscription.retrieve(
            data["subscription"], api_key=_secret_key()
        ).to_dict()
        subscription["metadata"] = {
            **(data.get("metadata") or {}),
            **(subscription.get("metadata") or {}),
        }
        sync_subscription(subscription)
    elif event_type in SUBSCRIPTION_EVENTS:
        sync_subscription(data)
    elif event_type in INVOICE_EVENTS:
        sync_invoice(data)


def handle_webhook(payload: bytes, signature: Optional[str]) -> Dict[str, Any]:
    """Verify, de-duplicate and apply a Stripe event.

    Raises ValueError for a bad signature/payload. Any other exception leaves
    the event unrecorded so Stripe's retry applies it later."""
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    if not secret:
        raise BillingNotConfiguredError("Stripe webhook secret is not configured")
    try:
        stripe.Webhook.construct_event(payload, signature or "", secret)
    except stripe.SignatureVerificationError as e:
        raise ValueError("Invalid Stripe signature") from e
    event = json.loads(payload)

    if StripeEventLog.query.filter_by(raw_id=event["id"]).first():
        return {"received": True, "duplicate": True}

    try:
        _handle_event(event)
        db.session.add(
            StripeEventLog(type=event["type"], raw_id=event["id"], payload=event)
        )
        db.session.commit()
    except IntegrityError:
        # A concurrent delivery of the same event won the race.
        db.session.rollback()
        return {"received": True, "duplicate": True}
    except Exception:
        db.session.rollback()
        raise
    return {"received": True}
