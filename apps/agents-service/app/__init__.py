"""
Agents Service - Flask application factory.
"""

from flask import Flask
from flask_cors import CORS

from config import Config
from app.models import db


def create_app(config_object=None):
    app = Flask(__name__)
    app.config.from_object(config_object or Config)
    CORS(app, supports_credentials=True, origins=app.config.get("CORS_ORIGINS", ["*"]))

    db.init_app(app)

    from app.routes.auth import bp as auth_bp
    from app.routes.users import bp as users_bp
    from app.routes.teams import bp as teams_bp
    from app.routes.stripe import bp as stripe_bp
    from app.routes.approval import bp as approval_bp
    from app.routes.rag import bp as rag_bp
    from app.routes.chat import bp as chat_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(teams_bp)
    app.register_blueprint(stripe_bp)
    app.register_blueprint(approval_bp)
    app.register_blueprint(rag_bp)
    app.register_blueprint(chat_bp)

    return app
