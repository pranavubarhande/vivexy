from agents_core.business_logic.announcements import get_active_announcements
from agents_core.middlewares.auth import auth_middleware
from agents_core.utils.http import error_response
from flask import Blueprint, jsonify, request

bp = Blueprint("announcements", __name__, url_prefix="/announcements")


@bp.route("", methods=["GET"])
@auth_middleware
def active_announcements():
    """Announcements currently visible to the caller.
    ---
    tags:
      - Announcements
    security:
      - BearerAuth: []
    responses:
      200:
        description: Active platform-wide and team announcements
    """
    try:
        return jsonify({"announcements": get_active_announcements(request.user)})
    except Exception as e:
        return error_response(e)
