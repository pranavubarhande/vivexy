import json
import os

import sentry_sdk
from flasgger import Swagger
from flask import Flask, g, request
from flask_cors import CORS
from sentry_sdk.integrations.flask import FlaskIntegration

from app.models import db
from app.routes.agents import bp as agents_bp
from app.routes.approval import bp as approval_bp
from app.routes.auth import bp as auth_bp
from app.routes.chat import bp as chat_bp
from app.routes.connectors import bp as connectors_bp
from app.routes.github import bp as github_bp
from app.routes.projects import bp as projects_bp
from app.routes.rag import bp as rag_bp
from app.routes.scheduled_tasks import bp as scheduled_tasks_bp
from app.routes.skills import bp as skills_bp
from app.routes.stripe import bp as stripe_bp
from app.routes.teams import bp as teams_bp
from app.routes.usage import bp as usage_bp
from app.routes.users import bp as users_bp
from app.utils.casing import camel_to_snake, snake_to_camel
from configs import Config
from configs.swagger_config import SWAGGER_CONFIG, SWAGGER_TEMPLATE


def create_app(config_object=None):
    sentry_sdk.init(
        dsn=os.environ.get(
            "SENTRY_DSN", "https://examplePublicKey@o0.ingest.sentry.io/0"
        ),
        integrations=[FlaskIntegration()],
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )

    app = Flask(__name__)
    app.config.from_object(config_object or Config)
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

    app.register_blueprint(auth_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(teams_bp)
    app.register_blueprint(stripe_bp)
    app.register_blueprint(approval_bp)
    app.register_blueprint(rag_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(connectors_bp)
    app.register_blueprint(agents_bp)
    app.register_blueprint(skills_bp)
    app.register_blueprint(github_bp)
    app.register_blueprint(scheduled_tasks_bp)
    app.register_blueprint(projects_bp)
    app.register_blueprint(usage_bp)

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

    Swagger(app, template=SWAGGER_TEMPLATE, config=SWAGGER_CONFIG)

    return app
