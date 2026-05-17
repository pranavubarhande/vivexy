"""
Flask application configuration.
All env-derived settings for the web app.
"""

import os


class Config:
    # Flask Configuration
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    PORT = int(os.getenv("PORT", 5000))
    SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")

    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:pranav@localhost:5432/portfolio_helper_llm?schema=public",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Test connections before use so stale pool connections (after idle minutes)
    # are detected and replaced instead of silently failing on first query.
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

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

    # Redis (shared with worker)
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

    # AWS S3 Configuration
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_S3_BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME", "portfolio-helper-files")
    AWS_S3_REGION = os.getenv("AWS_S3_REGION", "us-east-1")

    # RAG Configuration
    CHUNK_SIZE = 1000
    CHUNK_OVERLAP = 200
    TOP_K_RETRIEVAL = 5
    BM25_K = 3
    PINECONE_INDEX_NAME = "rag-index"

    # Web Search & Crawling
    EXA_API_KEY = os.getenv("EXA_API_KEY")
