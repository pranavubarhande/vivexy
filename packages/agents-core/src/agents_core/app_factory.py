"""Flask application factory shared by Vivexy and products built on it."""

import json
import os
from typing import Any, Dict, Iterable, Optional

import sentry_sdk
from agents_core.extensions import get_extension_blueprints
from agents_core.models import db
from agents_core.routes.admin import bp as admin_bp
from agents_core.routes.agents import bp as agents_bp
from agents_core.routes.announcements import bp as announcements_bp
from agents_core.routes.approval import bp as approval_bp
from agents_core.routes.auth import bp as auth_bp
from agents_core.routes.chat import bp as chat_bp
from agents_core.routes.connectors import bp as connectors_bp
from agents_core.routes.github import bp as github_bp
from agents_core.routes.projects import bp as projects_bp
from agents_core.routes.rag import bp as rag_bp
from agents_core.routes.scheduled_tasks import bp as scheduled_tasks_bp
from agents_core.routes.skills import bp as skills_bp
from agents_core.routes.stripe import bp as stripe_bp
from agents_core.routes.superadmin import bp as superadmin_bp
from agents_core.routes.teams import bp as teams_bp
from agents_core.routes.usage import bp as usage_bp
from agents_core.routes.users import bp as users_bp
from agents_core.utils.casing import camel_to_snake, snake_to_camel
from agents_core.utils.oauth import init_oauth
from flasgger import Swagger
from flask import Blueprint, Flask, g, request
from flask_cors import CORS
from sentry_sdk.integrations.flask import FlaskIntegration

CORE_BLUEPRINTS = [
    auth_bp,
    users_bp,
    teams_bp,
    stripe_bp,
    approval_bp,
    rag_bp,
    chat_bp,
    connectors_bp,
    agents_bp,
    skills_bp,
    github_bp,
    scheduled_tasks_bp,
    projects_bp,
    usage_bp,
    admin_bp,
    superadmin_bp,
    announcements_bp,
]


def create_app(
    config_object,
    swagger_template: Optional[Dict[str, Any]] = None,
    swagger_config: Optional[Dict[str, Any]] = None,
    blueprints: Iterable[Blueprint] = (),
) -> Flask:
    """Build the Vivexy Flask app: core blueprints, then blueprints from
    installed extensions, then any passed in by the caller."""
    sentry_sdk.init(
        dsn=os.environ.get(
            "SENTRY_DSN", "https://examplePublicKey@o0.ingest.sentry.io/0"
        ),
        integrations=[FlaskIntegration()],
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )

    app = Flask(__name__)
    app.config.from_object(config_object)
    init_oauth(app)
    CORS(app, supports_credentials=True, origins=app.config.get("CORS_ORIGINS", ["*"]))

    db.init_app(app)

    # ------------------------------------------------------------------ #
    #  Case-conversion middleware                                          #
    # ------------------------------------------------------------------ #

    @app.before_request
    def _normalise_request_body():
        """Convert incoming JSON body keys from camelCase -> snake_case.

        Stores the converted payload in g._snake_json and patches
        request.get_json() so every route transparently receives snake_case.
        """
        content_type = request.content_type or ""
        if "application/json" in content_type and request.data:
            try:
                raw = json.loads(request.data)
                g._snake_json = camel_to_snake(raw)
            except Exception:
                g._snake_json = None
        else:
            g._snake_json = None

        # Patch get_json so callers automatically get the snake_case version
        original_get_json = request.get_json

        def _patched_get_json(*args, **kwargs):
            if g._snake_json is not None:
                return g._snake_json
            return original_get_json(*args, **kwargs)

        request.get_json = _patched_get_json  # type: ignore[method-assign]

    @app.after_request
    def _normalise_response_body(response):
        """Convert outgoing JSON response keys from snake_case -> camelCase.

        Safety-net: most business-logic functions already return camelCase dicts
        so this is effectively a no-op for them. SSE and non-JSON responses are
        passed through unchanged.
        """
        content_type = response.content_type or ""
        if "application/json" in content_type:
            try:
                data = response.get_json(force=True, silent=True)
                if data is not None:
                    response.data = json.dumps(snake_to_camel(data))
                    response.content_type = "application/json"
            except Exception:
                pass
        return response

    # ------------------------------------------------------------------ #
    #  Blueprints                                                          #
    # ------------------------------------------------------------------ #

    for blueprint in [*CORE_BLUEPRINTS, *get_extension_blueprints(), *blueprints]:
        app.register_blueprint(blueprint)

    @app.route("/health")
    def _health():
        """Health check endpoint.
        ---
        tags:
          - Health
        responses:
          200:
            description: Service is healthy
            schema:
              type: object
              properties:
                status:
                  type: string
                  example: ok
        """
        return {"status": "ok"}, 200

    Swagger(app, template=swagger_template, config=swagger_config)

    return app
