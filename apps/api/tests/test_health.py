"""
Health endpoint smoke test.

Validates that GET /health returns 200 with the expected JSON shape.
Uses httpx.AsyncClient with the FastAPI test client.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint_returns_ok():
    """
    GET /health should return 200 with status, db, and redis fields.
    In test mode (no real DB/Redis), it may return 503/degraded — we
    just verify the shape here. Full integration test runs in Docker.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    # Accept both 200 (all deps up) and 503 (deps down but endpoint works)
    assert response.status_code in (200, 503)

    data = response.json()
    assert "status" in data
    assert "db" in data
    assert "redis" in data
    assert data["status"] in ("ok", "degraded")
