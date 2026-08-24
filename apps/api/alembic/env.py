"""
Alembic environment configuration for async SQLAlchemy.

Uses the DATABASE_URL from app settings and imports Base.metadata
for autogenerate support.
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Import our app's config and models
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.config import settings
from app.core.db import Base, engine
import app.models.entities  # noqa: F401

config = context.config
db_async_url = settings.DATABASE_URL
if db_async_url.startswith("postgres://"):
    db_async_url = db_async_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif db_async_url.startswith("postgresql://") and not db_async_url.startswith("postgresql+asyncpg://"):
    db_async_url = db_async_url.replace("postgresql://", "postgresql+asyncpg://", 1)

config.set_main_option("sqlalchemy.url", db_async_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def include_object(object, name, type_, reflected, compare_to):
    if type_ == "table" and name in ("spatial_ref_sys", "geography_columns", "geometry_columns"):
        return False
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — generate SQL without a live DB."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode with the app async engine."""
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)


def run_migrations_online() -> None:
    """Entry point for online migrations — runs async."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
