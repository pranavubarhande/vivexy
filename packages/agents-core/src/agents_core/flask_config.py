"""
Flask application configuration shared by Vivexy and products built on it.
All env-derived settings for the web app; apps subclass BaseConfig.
"""

import os


class BaseConfig:
    # Flask Configuration
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    PORT = int(os.getenv("PORT", 5000))
    SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")

    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:pranav@localhost:5432/vivexy",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Bounded pool per process, not SQLAlchemy's defaults: each pod runs
    # `gunicorn --workers 2 --threads 4` (see infra/docker/agents-service.Dockerfile),
    # i.e. up to 8 concurrent DB users per process x 2 processes = 16 threads/pod.
    # pool_size + max_overflow must be sized so that
    # (pods x this value) stays under the connection pooler's (pgpool) max
    # client connections — see infra/k8s chart values comments for the
    # matching pgpool number. pool_pre_ping detects stale pooled connections
    # (after idle minutes) instead of silently failing on first query.
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_size": int(os.getenv("DB_POOL_SIZE", 5)),
        "max_overflow": int(os.getenv("DB_POOL_MAX_OVERFLOW", 5)),
        "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT", 30)),
        "pool_recycle": int(os.getenv("DB_POOL_RECYCLE", 1800)),
    }

    # AI Providers
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
    GOOGLE_AI_API_KEY = os.getenv("GOOGLE_AI_API_KEY")
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
    TOGETHER_API_KEY = os.getenv("TOGETHER_API_KEY")
    FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY")
    COHERE_API_KEY = os.getenv("COHERE_API_KEY")
    XAI_API_KEY = os.getenv("XAI_API_KEY")

    PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")

    # JWT
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-jwt-secret-key")

    # SSO (Google / Microsoft OAuth2 via Authlib)
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
    MICROSOFT_CLIENT_ID = os.getenv("MICROSOFT_CLIENT_ID")
    MICROSOFT_CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET")
    # "common" accepts both work/school and personal Microsoft accounts.
    MICROSOFT_TENANT = os.getenv("MICROSOFT_TENANT", "common")

    # Email (Resend) — verification emails
    RESEND_API_KEY = os.getenv("RESEND_API_KEY")
    RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "Vivexy <noreply@vivexy.app>")

    # Used to build OAuth callback redirect_uris (BACKEND_URL) and links
    # that go out in emails / the final post-OAuth browser redirect
    # (FRONTEND_URL). Deliberately explicit env vars rather than inferring
    # from the request (e.g. via Flask's url_for(..., _external=True)) —
    # behind a proxy/ingress, scheme/host inference is easy to get wrong
    # and an OAuth redirect_uri mismatch just fails outright.
    BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5000")
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

    # Redis (shared with worker)
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

    # AWS S3 Configuration
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_S3_BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME", "vivexy-files")
    AWS_S3_REGION = os.getenv("AWS_S3_REGION", "us-east-1")

    # RAG Configuration
    CHUNK_SIZE = 1000
    CHUNK_OVERLAP = 200
    TOP_K_RETRIEVAL = 5
    BM25_K = 3
    PINECONE_INDEX_NAME = "rag-index"

    # Web Search & Crawling
    EXA_API_KEY = os.getenv("EXA_API_KEY")
