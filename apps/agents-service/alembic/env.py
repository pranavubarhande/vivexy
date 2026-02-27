import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Add the app directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Import your models here
from app.models import db
from app.models import (
    User, Team, TeamMember, TeamInvite, Subscription, Invoice,
    Stock, StockDataBlob, StockNews, Job, JobStock,
    StripeEventLog, LLMModel, Chat, Message, Artifact, Todo, ChatAttachment
)

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = db.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    # Get database URL from environment or config
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        config.set_main_option("sqlalchemy.url", database_url)

    # Create database if it doesn't exist (PostgreSQL only)
    if database_url and database_url.startswith("postgresql"):
        create_database_if_not_exists(database_url)

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


def create_database_if_not_exists(database_url: str) -> None:
    """Create PostgreSQL database if it doesn't exist."""
    from sqlalchemy import create_engine, text
    import re

    # Parse the database URL to extract database name
    # Format: postgresql://user:password@host:port/database
    match = re.match(r'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', database_url)
    if not match:
        return

    user, password, host, port, database = match.groups()

    # Connect to postgres database to create the target database
    admin_url = f"postgresql://{user}:{password}@{host}:{port}/postgres"
    admin_engine = create_engine(admin_url)

    try:
        with admin_engine.connect() as conn:
            # Check if database exists
            result = conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :db_name"),
                                {"db_name": database})
            exists = result.fetchone()

            if not exists:
                # Create database
                conn.execute(text("COMMIT"))  # End any open transaction
                conn.execute(text(f"CREATE DATABASE {database}"))
                print(f"Database '{database}' created successfully.")
            else:
                print(f"Database '{database}' already exists.")
    except Exception as e:
        print(f"Warning: Could not check/create database: {e}")
    finally:
        admin_engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()