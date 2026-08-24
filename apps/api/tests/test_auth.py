"""
WasteWise AI — Authentication & RBAC Test Suite
Validates registration, Argon2id verification, JWT issuance, token expiration,
and server-side role-based access control (RBAC).
"""

from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.db import Base, get_db
from app.core.security import (
    hash_password,
)
from app.main import app
from app.models.entities import User, UserRole

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@pytest_asyncio.fixture(autouse=True)
async def setup_test_db():
    """Create all tables in memory before each test and seed initial demo users."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    app.dependency_overrides[get_db] = override_get_db

    # Seed demo users for tests
    async with TestSessionLocal() as session:
        officer = User(
            email="officer@wastewise.gov",
            hashed_password=hash_password("officerPass123!"),
            full_name="Officer Rajesh Sharma",
            role=UserRole.OFFICER,
            is_active=True,
            is_verified=True,
        )
        driver = User(
            email="driver@wastewise.gov",
            hashed_password=hash_password("driverPass123!"),
            full_name="Driver Vikram Patel",
            role=UserRole.DRIVER,
            is_active=True,
            is_verified=True,
        )
        citizen = User(
            email="citizen@wastewise.gov",
            hashed_password=hash_password("citizenPass123!"),
            full_name="Citizen Priya Mehta",
            role=UserRole.CITIZEN,
            is_active=True,
            is_verified=True,
        )
        inactive = User(
            email="inactive@wastewise.gov",
            hashed_password=hash_password("password123"),
            full_name="Inactive User",
            role=UserRole.CITIZEN,
            is_active=False,
            is_verified=True,
        )
        session.add_all([officer, driver, citizen, inactive])
        await session.commit()

    yield

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_valid_login_success():
    """Valid credentials return HTTP 200 with JWT access token and user metadata."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/login",
            json={"email": "officer@wastewise.gov", "password": "officerPass123!"},
        )
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["email"] == "officer@wastewise.gov"
        assert data["role"] == "officer"
        # Verify password is never returned
        assert "password" not in data
        assert "hashed_password" not in data
        assert "password_hash" not in data


@pytest.mark.asyncio
async def test_invalid_email_fails():
    """Unregistered email returns HTTP 401 with generic error."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/login",
            json={"email": "nonexistent@wastewise.gov", "password": "anyPassword123!"},
        )
        assert res.status_code == 401
        assert res.json()["detail"] == "Invalid email or password"


@pytest.mark.asyncio
async def test_invalid_password_fails():
    """Registered email with incorrect password returns HTTP 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/login",
            json={"email": "officer@wastewise.gov", "password": "wrongpassword123"},
        )
        assert res.status_code == 401
        assert res.json()["detail"] == "Invalid email or password"


@pytest.mark.asyncio
async def test_empty_password_fails():
    """Empty password payload returns validation error."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/login",
            json={"email": "officer@wastewise.gov", "password": ""},
        )
        assert res.status_code in (401, 422)


@pytest.mark.asyncio
async def test_inactive_account_fails():
    """Inactive account returns HTTP 403 Forbidden."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/login",
            json={"email": "inactive@wastewise.gov", "password": "password123"},
        )
        assert res.status_code == 403
        assert "inactive" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_citizen_success():
    """Registration persists citizen and allows subsequent login."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        reg_res = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "newcitizen@wastewise.gov",
                "password": "strongPassword123!",
                "full_name": "New Citizen Test",
                "phone_number": "+91 9988776655",
            },
        )
        assert reg_res.status_code == 201
        reg_data = reg_res.json()
        assert reg_data["email"] == "newcitizen@wastewise.gov"
        assert reg_data["role"] == "citizen"
        assert "password" not in reg_data

        # Now login with new user
        login_res = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "newcitizen@wastewise.gov",
                "password": "strongPassword123!",
            },
        )
        assert login_res.status_code == 200
        assert login_res.json()["role"] == "citizen"


@pytest.mark.asyncio
async def test_get_me_with_valid_token():
    """GET /api/v1/auth/me returns current token payload when authenticated."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": "driver@wastewise.gov", "password": "driverPass123!"},
        )
        token = login_res.json()["access_token"]

        me_res = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me_res.status_code == 200
        assert me_res.json()["role"] == "driver"


@pytest.mark.asyncio
async def test_invalid_token_returns_401():
    """Forged or malformed JWT returns HTTP 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid.jwt.token"},
        )
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_expired_token_returns_401():
    """Expired JWT token returns HTTP 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        expired_payload = {
            "sub": "some-user-id",
            "role": "officer",
            "exp": past,
            "iat": past - timedelta(minutes=15),
            "jti": "test-jti",
            "type": "access",
        }
        expired_token = jwt.encode(
            expired_payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM
        )

        res = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_missing_token_returns_401():
    """Missing Authorization header on protected route returns HTTP 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/auth/me")
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_citizen_cannot_create_fleet_vehicle():
    """CITIZEN role attempting admin/officer vehicle creation returns 403 Forbidden."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": "citizen@wastewise.gov", "password": "citizenPass123!"},
        )
        token = login_res.json()["access_token"]

        vehicle_res = await client.post(
            "/api/v1/vehicles",
            json={
                "plate_number": "GJ-01-TEST-9999",
                "vehicle_type": "Compactor 5T",
                "capacity_kg": 5000.0,
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert vehicle_res.status_code == 403
        assert vehicle_res.json()["detail"] == "Insufficient permissions"


@pytest.mark.asyncio
async def test_officer_can_create_fleet_vehicle():
    """OFFICER role can create vehicle in fleet."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": "officer@wastewise.gov", "password": "officerPass123!"},
        )
        token = login_res.json()["access_token"]

        vehicle_res = await client.post(
            "/api/v1/vehicles",
            json={
                "plate_number": "GJ-01-TEST-8888",
                "vehicle_type": "Compactor 5T",
                "capacity_kg": 5000.0,
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert vehicle_res.status_code == 201
        assert vehicle_res.json()["plate_number"] == "GJ-01-TEST-8888"
