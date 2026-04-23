"""
Swagger / OpenAPI configuration for flasgger.
"""

SWAGGER_TEMPLATE = {
    "swagger": "2.0",
    "info": {
        "title": "Portfolio Helper - Agents Service API",
        "description": "Backend API for the Portfolio Helper AI agents platform. "
        "Provides endpoints for authentication, chat, streaming, "
        "teams, connectors, skills, and more.",
        "version": "1.0.0",
        "contact": {
            "name": "Pranav Ubarhande",
            "email": "pranavubarhande@gmail.com",
        },
    },
    "securityDefinitions": {
        "BearerAuth": {
            "type": "apiKey",
            "name": "Authorization",
            "in": "header",
            "description": "JWT token. Format: `Bearer <token>`",
        }
    },
    "tags": [
        {"name": "Auth", "description": "Authentication & registration"},
        {"name": "Users", "description": "User profile & API key management"},
        {"name": "Chat", "description": "Chat CRUD & messaging"},
        {"name": "Streaming", "description": "Agent streaming via SSE & Redis"},
        {"name": "Artifacts", "description": "Chat artifacts & exports"},
        {"name": "Attachments", "description": "File attachments"},
        {"name": "Approvals", "description": "Tool call approval / rejection"},
        {"name": "Teams", "description": "Team management & membership"},
        {"name": "Connectors", "description": "Third-party integrations via Composio"},
        {"name": "Skills", "description": "Official & user-defined skills"},
        {"name": "RAG", "description": "Retrieval-Augmented Generation pipeline"},
        {"name": "Stripe", "description": "Billing & payments (placeholder)"},
        {"name": "Health", "description": "Service health checks"},
    ],
}

SWAGGER_CONFIG = {
    "headers": [],
    "specs": [
        {
            "endpoint": "apispec",
            "route": "/apispec.json",
            "rule_filter": lambda rule: True,
            "model_filter": lambda tag: True,
        }
    ],
    "static_url_path": "/flasgger_static",
    "swagger_ui": True,
    "specs_route": "/api/docs",
}
