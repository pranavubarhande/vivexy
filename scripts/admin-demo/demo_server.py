"""Demo backend for the walkthrough recording.

Mounts the real auth / users / teams / admin / superadmin / announcements /
usage blueprints with the same camelCase<->snake_case middleware as
apps/agents-service/app/__init__.py. Chat/agent endpoints (which need the
LangChain stack) are replaced by empty responses — they are not part of the
admin panels being demonstrated.
"""

import json
import os

from agents_core.models import LLMModel, db
from agents_core.routes.admin import bp as admin_bp
from agents_core.routes.announcements import bp as announcements_bp
from agents_core.routes.auth import bp as auth_bp
from agents_core.routes.superadmin import bp as superadmin_bp
from agents_core.routes.teams import bp as teams_bp
from agents_core.routes.usage import bp as usage_bp
from agents_core.routes.users import bp as users_bp
from agents_core.utils.casing import camel_to_snake, snake_to_camel
from flask import Flask, g, jsonify, request
from flask_cors import CORS


def create_demo_app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ["DATABASE_URL"]
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True}
    app.config["JWT_SECRET_KEY"] = "demo-secret-key-that-is-long-enough-for-hs256"
    app.config["FRONTEND_URL"] = "http://localhost:3100"
    app.config["BACKEND_URL"] = "http://localhost:5050"
    app.config["GOOGLE_CLIENT_ID"] = "demo"
    app.config["MICROSOFT_CLIENT_ID"] = "demo"
    CORS(app, supports_credentials=True, origins=["http://localhost:3100"])
    db.init_app(app)

    @app.before_request
    def normalise_request_body():
        content_type = request.content_type or ""
        g._snake_json = None
        if "application/json" in content_type and request.data:
            try:
                g._snake_json = camel_to_snake(json.loads(request.data))
            except Exception:
                g._snake_json = None
        original_get_json = request.get_json

        def patched_get_json(*args, **kwargs):
            if g._snake_json is not None:
                return g._snake_json
            return original_get_json(*args, **kwargs)

        request.get_json = patched_get_json

    @app.after_request
    def normalise_response_body(response):
        if "application/json" in (response.content_type or ""):
            data = response.get_json(force=True, silent=True)
            if data is not None:
                response.data = json.dumps(snake_to_camel(data))
        return response

    for blueprint in (
        auth_bp,
        users_bp,
        teams_bp,
        usage_bp,
        admin_bp,
        superadmin_bp,
        announcements_bp,
    ):
        app.register_blueprint(blueprint)

    @app.route("/chat/models")
    def chat_models():
        models = LLMModel.query.filter_by(is_active=True).order_by(LLMModel.name)
        return jsonify(
            [
                {
                    "id": model.id,
                    "name": model.name,
                    "provider": model.provider,
                    "model_id": model.model_id,
                    "context_window": model.context_window,
                    "max_output_tokens": model.max_output_tokens,
                }
                for model in models
            ]
        )

    @app.route("/<path:path>", methods=["GET"])
    def not_part_of_demo(path):
        return jsonify([])

    return app


if __name__ == "__main__":
    create_demo_app().run(port=5050)
