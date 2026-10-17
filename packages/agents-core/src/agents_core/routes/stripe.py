from agents_core.business_logic.billing import (
    BillingNotConfiguredError,
    create_checkout_session,
    create_portal_session,
    get_billing_summary,
    handle_webhook,
)
from agents_core.middlewares.auth import auth_middleware
from agents_core.models import Plan
from agents_core.utils.http import error_response
from flask import Blueprint, current_app, jsonify, request

bp = Blueprint("stripe", __name__, url_prefix="/stripe")


def _fail(error: Exception):
    if isinstance(error, BillingNotConfiguredError):
        return jsonify({"error": str(error), "code": "billing_not_configured"}), 503
    if not isinstance(error, (ValueError, PermissionError, LookupError)):
        current_app.logger.exception("Billing request failed")
    return error_response(error)


def _team_id_from(source) -> str:
    team_id = source.get("team_id") or source.get("teamId")
    if not team_id:
        raise ValueError("Choose a team to manage billing for")
    return team_id


@bp.route("/subscription", methods=["GET"])
@auth_middleware
def billing_summary():
    """Current subscription and invoices for a team (owner/admin).
    ---
    tags:
      - Stripe
    security:
      - BearerAuth: []
    parameters:
      - in: query
        name: teamId
        type: string
        required: true
    responses:
      200:
        description: Billing summary
    """
    try:
        return jsonify(get_billing_summary(_team_id_from(request.args), request.user))
    except Exception as e:
        return _fail(e)


@bp.route("/checkout", methods=["POST"])
@auth_middleware
def create_checkout():
    """Create a Stripe Checkout session for a team subscription.
    ---
    tags:
      - Stripe
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            teamId:
              type: string
            plan:
              type: string
              enum: [PRO, ENTERPRISE]
    responses:
      200:
        description: Checkout URL
      503:
        description: Stripe is not configured
    """
    try:
        data = request.get_json() or {}
        plan_name = (data.get("plan") or "").upper()
        if plan_name not in Plan.__members__ or plan_name == Plan.FREE.value:
            raise ValueError("Choose a paid plan")
        return jsonify(
            create_checkout_session(_team_id_from(data), Plan[plan_name], request.user)
        )
    except Exception as e:
        return _fail(e)


@bp.route("/portal", methods=["POST"])
@auth_middleware
def create_portal():
    """Open the Stripe customer portal (change plan, card, cancel).
    ---
    tags:
      - Stripe
    security:
      - BearerAuth: []
    responses:
      200:
        description: Portal URL
    """
    try:
        data = request.get_json() or {}
        return jsonify(create_portal_session(_team_id_from(data), request.user))
    except Exception as e:
        return _fail(e)


@bp.route("/webhook", methods=["POST"])
def stripe_webhook():
    """Receive Stripe events (signature-verified).
    ---
    tags:
      - Stripe
    responses:
      200:
        description: Event received
      400:
        description: Invalid payload or signature
    """
    try:
        return jsonify(
            handle_webhook(request.get_data(), request.headers.get("Stripe-Signature"))
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except BillingNotConfiguredError as e:
        return jsonify({"error": str(e)}), 503
    except Exception:
        current_app.logger.exception("Stripe webhook failed")
        return jsonify({"error": "Webhook handling failed"}), 500
