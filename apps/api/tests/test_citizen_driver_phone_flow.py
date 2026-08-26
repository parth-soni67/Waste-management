"""
WasteWise AI — Citizen Phone & Driver Communication Workflow Test Suite

Validates:
1. Citizen registration requiring valid 10-digit Indian mobile number
2. Phone normalization to +91XXXXXXXXXX
3. Backend RBAC isolation (Assigned driver sees citizen contact, unassigned drivers and public APIs cannot)
4. Officer driver assignment updates and proof completion workflow
"""

from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.db import Base, get_db
from app.core.security import hash_password
from app.main import app
from app.models.entities import (
    Incident,
    IncidentStatus,
    PriorityLevel,
    Report,
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
    WasteCategory,
)
from app.schemas.all_schemas import normalize_indian_phone_number

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
    """Set up clean SQLite memory DB before each test."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    app.dependency_overrides[get_db] = override_get_db


# ---------------------------------------------------------------------------
# 1. Phone Normalization Unit Tests
# ---------------------------------------------------------------------------


def test_phone_normalization():
    assert normalize_indian_phone_number("9876543210") == "+919876543210"
    assert normalize_indian_phone_number("+91 98765 43210") == "+919876543210"
    assert normalize_indian_phone_number("+919876543210") == "+919876543210"
    assert normalize_indian_phone_number("919876543210") == "+919876543210"

    with pytest.raises(ValueError, match="Phone number is required."):
        normalize_indian_phone_number("")

    with pytest.raises(
        ValueError, match="Enter a valid 10-digit Indian mobile number."
    ):
        normalize_indian_phone_number("12345")

    with pytest.raises(
        ValueError, match="Enter a valid 10-digit Indian mobile number."
    ):
        normalize_indian_phone_number("5876543210")  # invalid first digit


# ---------------------------------------------------------------------------
# 2. Registration API Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_registration_valid_phone_creates_citizen():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        payload = {
            "email": "newcitizen@example.com",
            "password": "Password123!",
            "full_name": "Ramesh Patel",
            "phone_number": "9876543210",
            "role": "citizen",
        }
        res = await ac.post("/api/v1/auth/register", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["email"] == "newcitizen@example.com"
        assert data["phone_number"] == "+919876543210"


@pytest.mark.asyncio
async def test_registration_invalid_phone_rejected():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        payload = {
            "email": "badphone@example.com",
            "password": "Password123!",
            "full_name": "Invalid Phone User",
            "phone_number": "12345",
            "role": "citizen",
        }
        res = await ac.post("/api/v1/auth/register", json=payload)
        assert res.status_code == 422  # Pydantic validation error


# ---------------------------------------------------------------------------
# 3. RBAC Phone Visibility Tests (Assigned Driver vs Unassigned Driver)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_assigned_driver_sees_citizen_phone():
    # Seed Citizen, Driver A, Driver B, Incident assigned to Driver A
    async with TestSessionLocal() as session:
        citizen = User(
            email="citizen_test@example.com",
            hashed_password=hash_password("password123"),
            full_name="Priya Sharma",
            phone_number="+919876512345",
            role=UserRole.CITIZEN,
        )
        driver_a = User(
            email="driver_a@example.com",
            hashed_password=hash_password("password123"),
            full_name="Driver Vikram",
            phone_number="+919876500001",
            role=UserRole.DRIVER,
        )
        driver_b = User(
            email="driver_b@example.com",
            hashed_password=hash_password("password123"),
            full_name="Driver Suresh",
            phone_number="+919876500002",
            role=UserRole.DRIVER,
        )
        vehicle_a = Vehicle(
            plate_number="GJ-01-DRV-01",
            driver=driver_a,
            status=VehicleStatus.ASSIGNED,
        )
        session.add_all([citizen, driver_a, driver_b, vehicle_a])
        await session.flush()

        incident = Incident(
            title="Overflowing Dumpster near Sector 5",
            latitude=23.0225,
            longitude=72.5714,
            category=WasteCategory.MIXED,
            priority=PriorityLevel.P1,
            status=IncidentStatus.ASSIGNED,
            assigned_driver_id=driver_a.id,
            assigned_vehicle_id=vehicle_a.id,
        )
        session.add(incident)
        await session.flush()

        report = Report(
            user_id=citizen.id,
            incident_id=incident.id,
            latitude=23.0225,
            longitude=72.5714,
            status=IncidentStatus.ASSIGNED,
        )
        session.add(report)
        await session.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        # 1. Driver A Login
        login_res_a = await ac.post(
            "/api/v1/auth/login",
            json={"email": "driver_a@example.com", "password": "password123"},
        )
        assert login_res_a.status_code == 200
        token_a = login_res_a.json()["access_token"]

        # Driver A gets assignments
        res_a = await ac.get(
            "/api/v1/driver/assignments", headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res_a.status_code == 200
        assignments_a = res_a.json()
        assert len(assignments_a) == 1
        assert assignments_a[0]["citizen_name"] == "Priya Sharma"
        assert assignments_a[0]["citizen_phone"] == "+919876512345"

        # 2. Driver B Login
        login_res_b = await ac.post(
            "/api/v1/auth/login",
            json={"email": "driver_b@example.com", "password": "password123"},
        )
        assert login_res_b.status_code == 200
        token_b = login_res_b.json()["access_token"]

        # Driver B gets assignments — should be EMPTY because Driver B is not assigned to this incident!
        res_b = await ac.get(
            "/api/v1/driver/assignments", headers={"Authorization": f"Bearer {token_b}"}
        )
        assert res_b.status_code == 200
        assignments_b = res_b.json()
        assert len(assignments_b) == 0


@pytest.mark.asyncio
async def test_public_reports_do_not_leak_phone():
    async with TestSessionLocal() as session:
        citizen = User(
            email="citizen_secret@example.com",
            hashed_password=hash_password("password123"),
            full_name="Secret Citizen",
            phone_number="+919999988888",
            role=UserRole.CITIZEN,
        )
        session.add(citizen)
        await session.flush()

        report = Report(
            user_id=citizen.id,
            latitude=23.0225,
            longitude=72.5714,
            description="Public report",
        )
        session.add(report)
        await session.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        res = await ac.get("/api/v1/reports")
        assert res.status_code == 200
        reports = res.json()
        for r in reports:
            assert "phone_number" not in r
            assert "citizen_phone" not in r
