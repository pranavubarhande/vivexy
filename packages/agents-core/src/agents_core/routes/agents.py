import logging

from agents_core.agents.config import get_agent_metadata
from agents_core.business_logic.features import require_feature
from agents_core.constants.features import FEATURE_DEPLOYED_AGENTS
from agents_core.middlewares.auth import auth_middleware
from agents_core.models.base import db
from agents_core.models.deployed_agent import DeployedAgent
from flask import Blueprint, jsonify, request

logger = logging.getLogger(__name__)

bp = Blueprint("agents", __name__, url_prefix="/agents")


@bp.route("/user", methods=["GET"])
@auth_middleware
def list_deployed_agents():
    user_id = request.user.id
    deployed = DeployedAgent.query.filter_by(user_id=user_id).all()
    return jsonify(
        [
            {
                "id": d.id,
                "agentId": d.agent_id,
                "deployedAt": d.deployed_at.isoformat(),
            }
            for d in deployed
        ]
    )


@bp.route("/user", methods=["POST"])
@auth_middleware
@require_feature(FEATURE_DEPLOYED_AGENTS)
def deploy_agent():
    user_id = request.user.id
    body = request.get_json() or {}
    agent_id = body.get("agent_id")

    if not agent_id:
        return jsonify({"error": "agentId is required"}), 400

    if agent_id not in get_agent_metadata():
        return jsonify({"error": f"Unknown agent: {agent_id}"}), 404

    existing = DeployedAgent.query.filter_by(user_id=user_id, agent_id=agent_id).first()
    if existing:
        return (
            jsonify(
                {
                    "id": existing.id,
                    "agentId": existing.agent_id,
                    "deployedAt": existing.deployed_at.isoformat(),
                }
            ),
            200,
        )

    deployed = DeployedAgent(user_id=user_id, agent_id=agent_id)
    db.session.add(deployed)
    db.session.commit()

    return (
        jsonify(
            {
                "id": deployed.id,
                "agentId": deployed.agent_id,
                "deployedAt": deployed.deployed_at.isoformat(),
            }
        ),
        201,
    )


@bp.route("/user/<agent_id>", methods=["DELETE"])
@auth_middleware
def undeploy_agent(agent_id: str):
    user_id = request.user.id
    deployed = DeployedAgent.query.filter_by(user_id=user_id, agent_id=agent_id).first()

    if not deployed:
        return jsonify({"error": "Agent not deployed"}), 404

    db.session.delete(deployed)
    db.session.commit()
    return jsonify({"success": True})
