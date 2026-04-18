import uuid
from datetime import datetime

from sqlalchemy import Enum as SQLEnum

from app.models.base import db
from app.models.enums import Plan, SubscriptionStatus


class Subscription(db.Model):
    __tablename__ = "subscriptions"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String, db.ForeignKey("users.id"))
    team_id = db.Column(db.String, db.ForeignKey("teams.id"))
    stripe_subscription_id = db.Column(db.String, unique=True, nullable=False)
    stripe_customer_id = db.Column(db.String)
    status = db.Column(SQLEnum(SubscriptionStatus), default=SubscriptionStatus.INACTIVE)
    plan = db.Column(SQLEnum(Plan), default=Plan.FREE)
    current_period_start = db.Column(db.DateTime)
    current_period_end = db.Column(db.DateTime)
    cancel_at_period_end = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relations
    invoices = db.relationship("Invoice", backref="subscription", lazy=True)


class Invoice(db.Model):
    __tablename__ = "invoices"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String, db.ForeignKey("users.id"), nullable=False)
    subscription_id = db.Column(db.String, db.ForeignKey("subscriptions.id"))
    stripe_invoice_id = db.Column(db.String, unique=True)
    amount = db.Column(db.Integer, nullable=False)  # Amount in cents
    currency = db.Column(db.String, default="usd")
    status = db.Column(db.String, nullable=False)
    invoice_pdf = db.Column(db.String)
    hosted_invoice_url = db.Column(db.String)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class StripeEventLog(db.Model):
    __tablename__ = "stripe_event_logs"

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type = db.Column(db.String, nullable=False)
    raw_id = db.Column(db.String, unique=True, nullable=False)
    payload = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
