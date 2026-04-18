from flask import Blueprint, jsonify, request

from app.middlewares.auth import auth_middleware

bp = Blueprint("stripe", __name__, url_prefix="/stripe")

# TODO: Implement Stripe API routes
# - POST /stripe/checkout - Create checkout session
# - POST /stripe/webhook - Handle webhooks


@bp.route("/checkout", methods=["POST"])
@auth_middleware
def create_checkout():
    # Placeholder implementation
    return jsonify({"message": "Stripe checkout not yet implemented"}), 501


@bp.route("/webhook", methods=["POST"])
def handle_webhook():
    # Placeholder implementation
    return jsonify({"message": "Stripe webhook not yet implemented"}), 501
