import hashlib
import hmac
import json
import time
from unittest.mock import MagicMock, patch

import pytest
from agents_core.business_logic.superadmin import get_platform_overview
from agents_core.models import (
    AuditLog,
    Invoice,
    Plan,
    StripeEventLog,
    Subscription,
    SubscriptionStatus,
    Team,
    TeamMember,
    TeamRole,
    User,
    db,
)
from agents_core.routes.stripe import bp as stripe_bp
from agents_core.utils.auth import generate_token
from flask import Flask

WEBHOOK_SECRET = "whsec_test"


@pytest.fixture(autouse=True)
def stripe_env(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_123")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET)
    monkeypatch.setenv("STRIPE_PRICE_ID_PRO", "price_pro")
    monkeypatch.setenv("STRIPE_PRICE_ID_ENTERPRISE", "price_ent")


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["JWT_SECRET_KEY"] = "test-secret"
    app.config["FRONTEND_URL"] = "http://localhost:3000"
    app.register_blueprint(stripe_bp)
    db.init_app(app)
    with app.app_context():
        db.create_all()
        yield app


@pytest.fixture
def client(app):
    return app.test_client()


def _headers(user):
    return {"Authorization": f"Bearer {generate_token(user.id, user.email)}"}


@pytest.fixture
def org(app):
    owner = User(email="owner@acme.com")
    member = User(email="member@acme.com")
    db.session.add_all([owner, member])
    db.session.flush()
    team = Team(name="Acme", slug="acme", owner_id=owner.id)
    db.session.add(team)
    db.session.flush()
    db.session.add_all(
        [
            TeamMember(user_id=owner.id, team_id=team.id, role=TeamRole.OWNER),
            TeamMember(user_id=member.id, team_id=team.id, role=TeamRole.MEMBER),
        ]
    )
    db.session.commit()
    return {"owner": owner, "member": member, "team": team}


def _signed(payload: dict, secret: str = WEBHOOK_SECRET):
    body = json.dumps(payload)
    timestamp = int(time.time())
    signature = hmac.new(
        secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256
    ).hexdigest()
    return body, {
        "Stripe-Signature": f"t={timestamp},v1={signature}",
        "Content-Type": "application/json",
    }


def _event(event_id, event_type, obj):
    return {"id": event_id, "type": event_type, "data": {"object": obj}}


def _subscription_obj(team, status="active", price="price_pro"):
    return {
        "id": "sub_123",
        "object": "subscription",
        "customer": "cus_123",
        "status": status,
        "cancel_at_period_end": False,
        "metadata": {"team_id": team.id, "user_id": team.owner_id},
        "items": {
            "data": [
                {
                    "price": {"id": price},
                    "current_period_start": 1760000000,
                    "current_period_end": 1762600000,
                }
            ]
        },
    }


def _post_event(client, event):
    body, headers = _signed(event)
    return client.post("/stripe/webhook", data=body, headers=headers)


def test_webhook_rejects_bad_signature(client, org):
    body, headers = _signed(
        _event("evt_1", "customer.subscription.created", {}), secret="wrong"
    )
    response = client.post("/stripe/webhook", data=body, headers=headers)
    assert response.status_code == 400
    assert StripeEventLog.query.count() == 0


def test_subscription_event_creates_live_subscription_counted_in_revenue(client, org):
    team = org["team"]
    response = _post_event(
        client,
        _event("evt_1", "customer.subscription.created", _subscription_obj(team)),
    )
    assert response.status_code == 200

    subscription = Subscription.query.filter_by(stripe_subscription_id="sub_123").one()
    assert subscription.team_id == team.id
    assert subscription.plan == Plan.PRO
    assert subscription.status == SubscriptionStatus.ACTIVE
    assert subscription.current_period_end is not None
    assert db.session.get(Team, team.id).stripe_customer_id == "cus_123"
    assert AuditLog.query.filter_by(action="system.subscription_synced").count() == 1

    overview = get_platform_overview()
    assert overview["revenue"]["mrrUsd"] > 0


def test_duplicate_events_are_ignored(client, org):
    event = _event(
        "evt_1", "customer.subscription.created", _subscription_obj(org["team"])
    )
    _post_event(client, event)
    response = _post_event(client, event)
    assert response.get_json()["duplicate"] is True
    assert StripeEventLog.query.count() == 1


def test_cancellation_and_manual_plan_supersession(client, org):
    team = org["team"]
    manual = Subscription(
        team_id=team.id,
        user_id=team.owner_id,
        stripe_subscription_id="manual_abc",
        status=SubscriptionStatus.TRIALING,
        plan=Plan.PRO,
    )
    db.session.add(manual)
    db.session.commit()

    _post_event(
        client,
        _event("evt_1", "customer.subscription.created", _subscription_obj(team)),
    )
    assert db.session.get(Subscription, manual.id).status == SubscriptionStatus.CANCELED

    _post_event(
        client,
        _event(
            "evt_2",
            "customer.subscription.deleted",
            _subscription_obj(team, status="canceled"),
        ),
    )
    subscription = Subscription.query.filter_by(stripe_subscription_id="sub_123").one()
    assert subscription.status == SubscriptionStatus.CANCELED


def test_invoice_event_records_invoice(client, org):
    team = org["team"]
    _post_event(
        client,
        _event("evt_1", "customer.subscription.created", _subscription_obj(team)),
    )
    invoice_obj = {
        "id": "in_123",
        "status": "paid",
        "amount_paid": 2900,
        "amount_due": 2900,
        "currency": "usd",
        "created": 1760000000,
        "hosted_invoice_url": "https://pay.stripe.com/in_123",
        "invoice_pdf": "https://pay.stripe.com/in_123.pdf",
        "parent": {"subscription_details": {"subscription": "sub_123"}},
    }
    response = _post_event(client, _event("evt_2", "invoice.paid", invoice_obj))
    assert response.status_code == 200
    invoice = Invoice.query.filter_by(stripe_invoice_id="in_123").one()
    assert invoice.amount == 2900
    assert invoice.status == "PAID"
    assert invoice.user_id == team.owner_id

    summary = client.get(
        f"/stripe/subscription?teamId={team.id}", headers=_headers(org["owner"])
    ).get_json()
    assert summary["subscription"]["plan"] == "PRO"
    assert summary["invoices"][0]["hostedInvoiceUrl"].endswith("in_123")


def test_invoice_before_subscription_is_retried(client, org):
    response = _post_event(
        client,
        _event("evt_9", "invoice.paid", {"id": "in_1", "subscription": "sub_unknown"}),
    )
    assert response.status_code == 500
    assert StripeEventLog.query.count() == 0


def test_checkout_completed_fetches_subscription(client, org):
    team = org["team"]
    retrieved = MagicMock()
    retrieved.to_dict.return_value = {**_subscription_obj(team), "metadata": {}}
    session = {
        "id": "cs_1",
        "mode": "subscription",
        "subscription": "sub_123",
        "metadata": {"team_id": team.id, "user_id": team.owner_id},
    }
    with patch(
        "agents_core.business_logic.billing.stripe.Subscription.retrieve",
        return_value=retrieved,
    ):
        response = _post_event(
            client, _event("evt_1", "checkout.session.completed", session)
        )
    assert response.status_code == 200
    assert Subscription.query.filter_by(team_id=team.id).one().plan == Plan.PRO


def test_checkout_creates_customer_and_session(client, org):
    team = org["team"]
    with patch(
        "agents_core.business_logic.billing.stripe.Customer.create",
        return_value=MagicMock(id="cus_new"),
    ), patch(
        "agents_core.business_logic.billing.stripe.checkout.Session.create",
        return_value=MagicMock(url="https://checkout.stripe.com/s"),
    ) as create:
        response = client.post(
            "/stripe/checkout",
            json={"teamId": team.id, "plan": "PRO"},
            headers=_headers(org["owner"]),
        )
    assert response.status_code == 200
    assert response.get_json()["url"] == "https://checkout.stripe.com/s"
    kwargs = create.call_args.kwargs
    assert kwargs["customer"] == "cus_new"
    assert kwargs["line_items"] == [{"price": "price_pro", "quantity": 1}]
    assert kwargs["subscription_data"]["metadata"]["team_id"] == team.id
    assert db.session.get(Team, team.id).stripe_customer_id == "cus_new"


def test_checkout_requires_team_admin_and_paid_plan(client, org):
    team = org["team"]
    response = client.post(
        "/stripe/checkout",
        json={"teamId": team.id, "plan": "PRO"},
        headers=_headers(org["member"]),
    )
    assert response.status_code == 403
    response = client.post(
        "/stripe/checkout",
        json={"teamId": team.id, "plan": "FREE"},
        headers=_headers(org["owner"]),
    )
    assert response.status_code == 400


def test_checkout_unavailable_without_stripe_key(client, org, monkeypatch):
    monkeypatch.delenv("STRIPE_SECRET_KEY")
    response = client.post(
        "/stripe/checkout",
        json={"teamId": org["team"].id, "plan": "PRO"},
        headers=_headers(org["owner"]),
    )
    assert response.status_code == 503
    assert response.get_json()["code"] == "billing_not_configured"


def test_portal_requires_billing_account(client, org):
    team = org["team"]
    response = client.post(
        "/stripe/portal", json={"teamId": team.id}, headers=_headers(org["owner"])
    )
    assert response.status_code == 400
    team.stripe_customer_id = "cus_1"
    db.session.commit()
    with patch(
        "agents_core.business_logic.billing.stripe.billing_portal.Session.create",
        return_value=MagicMock(url="https://billing.stripe.com/p"),
    ):
        response = client.post(
            "/stripe/portal", json={"teamId": team.id}, headers=_headers(org["owner"])
        )
    assert response.get_json()["url"] == "https://billing.stripe.com/p"
