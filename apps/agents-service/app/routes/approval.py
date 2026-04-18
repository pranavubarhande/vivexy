from flask import Blueprint, jsonify, request

from app.business_logic.chat import get_user_chat
from app.middlewares.auth import auth_middleware

bp = Blueprint("approval", __name__, url_prefix="/chat")


@bp.route("/<chat_id>/approve", methods=["POST"])
@auth_middleware
def approve_tool(chat_id):
    """Approve a pending tool call — signals the awaiting async generator."""
    try:
        user = request.user
        data = request.get_json() or {}
        request_id = data.get("request_id")

        if not request_id:
            return jsonify({"error": "request_id is required"}), 400

        # Verify chat belongs to user
        chat = get_user_chat(chat_id, user.id)
        if not chat:
            return jsonify({"error": "Chat not found"}), 404

        from app.agents.approval_store import resolve_approval

        signalled = resolve_approval(request_id, approved=True)

        return jsonify(
            {
                "success": True,
                "message": "Tool approved",
                "requestId": request_id,
                "status": "approved",
                "signalled": signalled,
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/reject", methods=["POST"])
@auth_middleware
def reject_tool(chat_id):
    """Reject a pending tool call — signals the awaiting async generator with denial."""
    try:
        user = request.user
        data = request.get_json() or {}
        request_id = data.get("request_id")

        if not request_id:
            return jsonify({"error": "request_id is required"}), 400

        # Verify chat belongs to user
        chat = get_user_chat(chat_id, user.id)
        if not chat:
            return jsonify({"error": "Chat not found"}), 404

        from app.agents.approval_store import resolve_approval

        signalled = resolve_approval(request_id, approved=False)

        return jsonify(
            {
                "success": True,
                "message": "Tool rejected",
                "requestId": request_id,
                "status": "rejected",
                "signalled": signalled,
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500
