"""
WasteWise AI — Redis Configuration

Async Redis connection pool for caching, pub/sub (live updates),
rate limiting, and token revocation tracking.
"""

import redis.asyncio as redis
from typing import AsyncGenerator

from app.core.config import settings


redis_pool: redis.Redis | None = None


async def init_redis() -> redis.Redis:
    """Initialize the Redis connection pool. Called on app startup."""
    global redis_pool
    redis_pool = redis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
    )
    return redis_pool


async def close_redis() -> None:
    """Close the Redis connection pool. Called on app shutdown."""
    global redis_pool
    if redis_pool:
        await redis_pool.close()
        redis_pool = None


async def get_redis() -> AsyncGenerator[redis.Redis, None]:
    """FastAPI dependency that yields the Redis client."""
    if redis_pool is None:
        raise RuntimeError("Redis not initialized — call init_redis() on startup")
    yield redis_pool
