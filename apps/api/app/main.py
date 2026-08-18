"""
WasteWise AI — FastAPI Application Entry Point

Mounts all versioned routers:
- /api/v1/auth
- /api/v1/vehicles
- /api/v1/incidents
- /api/v1/reports
- /api/v1/ai
- /api/v1/optimization (Vehicle Assignment, Route Optimization, Loop C, WebSockets)
- /api/v1/verification (Collection evidence, AI clearance, citizen confirmation)
- /api/v1/agent (AI Municipal Decision Assistant)
- /api/v1/analytics (KPIs, environmental impact, smart alerts)
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.db import engine
from app.core.redis import init_redis, close_redis, redis_pool
from app.routers.auth import router as auth_router
from app.routers.vehicles import router as vehicles_router
from app.routers.incidents import (
    incidents_router,
    reports_router,
)
from app.routers.ai_router import router as ai_router
from app.routers.optimization_router import router as optimization_router
from app.routers.verification_router import router as verification_router
from app.routers.agent_router import router as agent_router
from app.routers.analytics_router import router as analytics_router


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage async resources: DB engine + Redis pool."""
    # Startup
    await init_redis()
    yield
    # Shutdown
    await close_redis()
    await engine.dispose()


# ---------------------------------------------------------------------------
# App instance
# ---------------------------------------------------------------------------

app = FastAPI(
    title="WasteWise AI",
    description=(
        "AI-Powered Predictive Waste Management & Municipal Intelligence Platform. "
        "Built for Smart India Hackathon 2026 — Problem Statement 8 (LDRP-ITR)."
    ),
    version="0.4.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health endpoint — system_guide.md §6
# ---------------------------------------------------------------------------

@app.get("/health", tags=["system"])
async def health_check():
    """
    Health check with actual connectivity verification for Postgres and Redis.
    """
    health = {"status": "ok", "db": "unknown", "redis": "unknown"}
    overall_ok = True

    # Check Postgres
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        health["db"] = "ok"
    except Exception as e:
        health["db"] = f"error: {type(e).__name__}"
        overall_ok = False

    # Check Redis
    try:
        if redis_pool:
            await redis_pool.ping()
            health["redis"] = "ok"
        else:
            health["redis"] = "not_initialized"
            overall_ok = False
    except Exception as e:
        health["redis"] = f"error: {type(e).__name__}"
        overall_ok = False

    if not overall_ok:
        health["status"] = "degraded"

    from fastapi.responses import JSONResponse
    status_code = 200 if overall_ok else 503
    return JSONResponse(content=health, status_code=status_code)


# ---------------------------------------------------------------------------
# Mount Versioned Routers (/api/v1/)
# ---------------------------------------------------------------------------

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(vehicles_router, prefix="/api/v1/vehicles", tags=["vehicles"])
app.include_router(incidents_router, prefix="/api/v1/incidents", tags=["incidents"])
app.include_router(reports_router, prefix="/api/v1/reports", tags=["reports"])
app.include_router(ai_router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(optimization_router, prefix="/api/v1/optimization", tags=["optimization"])
app.include_router(verification_router, prefix="/api/v1/verification", tags=["verification"])
app.include_router(agent_router, prefix="/api/v1/agent", tags=["agent"])
app.include_router(analytics_router, prefix="/api/v1/analytics", tags=["analytics"])
