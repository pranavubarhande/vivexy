"""
Scheduled Tasks API
CRUD for user-defined tasks that run a chat prompt on a schedule.
"""

import logging

from agents_core.business_logic.scheduled_tasks import (
    create_task,
    delete_task,
    dispatch_task,
    get_task,
    get_task_runs,
    get_user_tasks,
    update_task,
)
from agents_core.middlewares.auth import auth_middleware
from agents_core.models.scheduled_task import ScheduledTask
from flask import Blueprint, jsonify, request

logger = logging.getLogger(__name__)

bp = Blueprint("scheduled_tasks", __name__, url_prefix="/scheduled-tasks")


@bp.route("", methods=["GET"])
@auth_middleware
def list_tasks():
    try:
        tasks = get_user_tasks(request.user.id)
        return jsonify(tasks)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("", methods=["POST"])
@auth_middleware
def create_new_task():
    try:
        data = request.get_json() or {}
        if not data.get("name") or not data.get("prompt"):
            return jsonify({"error": "name and prompt are required"}), 400
        task = create_task(request.user.id, data)
        return jsonify(task), 201
    except Exception as e:
        logger.exception("create_task error")
        return jsonify({"error": str(e)}), 500


@bp.route("/<task_id>", methods=["GET"])
@auth_middleware
def get_one_task(task_id):
    try:
        task = get_task(task_id, request.user.id)
        runs = get_task_runs(task_id, request.user.id)
        data = task.to_dict()
        data["runs"] = runs
        return jsonify(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<task_id>", methods=["PUT"])
@auth_middleware
def update_existing_task(task_id):
    try:
        data = request.get_json() or {}
        task = update_task(task_id, request.user.id, data)
        return jsonify(task)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        logger.exception("update_task error")
        return jsonify({"error": str(e)}), 500


@bp.route("/<task_id>", methods=["DELETE"])
@auth_middleware
def delete_existing_task(task_id):
    try:
        delete_task(task_id, request.user.id)
        return jsonify({"success": True})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<task_id>/run", methods=["POST"])
@auth_middleware
def run_task_now(task_id):
    """Trigger a task immediately regardless of schedule."""
    try:
        task = get_task(task_id, request.user.id)
        run = dispatch_task(task)
        return jsonify(run.to_dict()), 202
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        logger.exception("run_task_now error")
        return jsonify({"error": str(e)}), 500


@bp.route("/<task_id>/runs", methods=["GET"])
@auth_middleware
def list_runs(task_id):
    try:
        runs = get_task_runs(task_id, request.user.id)
        return jsonify(runs)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500
