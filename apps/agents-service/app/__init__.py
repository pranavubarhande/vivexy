from flask import Flask
from flask_cors import CORS
from config import Config

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    CORS(app)  # Enable CORS for frontend communication

    from app.routes.rag import bp as rag_bp
    app.register_blueprint(rag_bp)

    return app