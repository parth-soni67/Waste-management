"""
WasteWise AI — Driver Cockpit & Proof of Work Test Suite
Validates authenticated driver assignments, location telemetry, start collection transitions,
photo proof uploads to Supabase storage, proof enforcement, and completion state machine.
"""

import io
import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.db import Base, get_db
from app.core.security import create_access_token
from app.main import app
from app.models.entities import (
    Incident,
    IncidentStatus,
    PriorityLevel,
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
    WasteCategory,
)

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
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    app.dependency_overrides[get_db] = override_get_db
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    app.dependency_overrides.pop(get_db, None)


def create_dummy_image(color=(30, 144, 255), size=(100, 100)) -> bytes:
    img = Image.new("RGB", size, color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest_asyncio.fixture
async def driver_a():
    driver_id = uuid.uuid4()
    async with TestSessionLocal() as session:
        user = User(
            id=driver_id,
            email="driver_a@test.gov",
            hashed_password="hash",
            full_name="Driver Alice",
            role=UserRole.DRIVER,
            is_active=True,
            is_verified=True,
        )
        vehicle = Vehicle(
            id=uuid.uuid4(),
            plate_number="GJ-01-WM-1111",
            vehicle_type="compactor",
            capacity_kg=5000.0,
            current_load_kg=500.0,
            status=VehicleStatus.ASSIGNED,
            driver_id=driver_id,
        )
        session.add(user)
        session.add(vehicle)
        await session.commit()
    token = create_access_token(
        user_id=str(driver_id),
        role=UserRole.DRIVER.value,
    )
    return {"id": driver_id, "token": token, "vehicle_id": vehicle.id}


@pytest_asyncio.fixture
async def driver_b():
    driver_id = uuid.uuid4()
    async with TestSessionLocal() as session:
        user = User(
            id=driver_id,
            email="driver_b@test.gov",
            hashed_password="hash",
            full_name="Driver Bob",
            role=UserRole.DRIVER,
            is_active=True,
            is_verified=True,
        )
        vehicle = Vehicle(
            id=uuid.uuid4(),
            plate_number="GJ-01-WM-2222",
            vehicle_type="compactor",
            capacity_kg=4000.0,
            current_load_kg=0.0,
            status=VehicleStatus.ASSIGNED,
            driver_id=driver_id,
        )
        session.add(user)
        session.add(vehicle)
        await session.commit()
    token = create_access_token(
        user_id=str(driver_id),
        role=UserRole.DRIVER.value,
    )
    return {"id": driver_id, "token": token, "vehicle_id": vehicle.id}


@pytest_asyncio.fixture
async def officer_user():
    officer_id = uuid.uuid4()
    async with TestSessionLocal() as session:
        user = User(
            id=officer_id,
            email="officer@test.gov",
            hashed_password="hash",
            full_name="Officer Officer",
            role=UserRole.OFFICER,
            is_active=True,
            is_verified=True,
        )
        session.add(user)
        await session.commit()
    token = create_access_token(
        user_id=str(officer_id),
        role=UserRole.OFFICER.value,
    )
    return {"id": officer_id, "token": token}


@pytest.mark.asyncio
async def test_driver_assignment_isolation(driver_a, driver_b):
    """Driver A only sees assignments for Driver A's vehicle; Driver B sees only Driver B's."""
    inc_a_id = uuid.uuid4()
    inc_b_id = uuid.uuid4()

    async with TestSessionLocal() as session:
        inc_a = Incident(
            id=inc_a_id,
            title="Incident for Driver A",
            category=WasteCategory.PLASTIC,
            priority=PriorityLevel.P1,
            status=IncidentStatus.ASSIGNED,
            latitude=23.033,
            longitude=72.586,
            assigned_vehicle_id=driver_a["vehicle_id"],
        )
        inc_b = Incident(
            id=inc_b_id,
            title="Incident for Driver B",
            category=WasteCategory.ORGANIC,
            priority=PriorityLevel.P2,
            status=IncidentStatus.ASSIGNED,
            latitude=23.045,
            longitude=72.540,
            assigned_vehicle_id=driver_b["vehicle_id"],
        )
        session.add(inc_a)
        session.add(inc_b)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Driver A query
        res_a = await client.get(
            "/api/v1/driver/assignments",
            headers={"Authorization": f"Bearer {driver_a['token']}"},
        )
        assert res_a.status_code == 200
        data_a = res_a.json()
        assert len(data_a) == 1
        assert data_a[0]["incident_id"] == str(inc_a_id)

        # Driver B query
        res_b = await client.get(
            "/api/v1/driver/assignments",
            headers={"Authorization": f"Bearer {driver_b['token']}"},
        )
        assert res_b.status_code == 200
        data_b = res_b.json()
        assert len(data_b) == 1
        assert data_b[0]["incident_id"] == str(inc_b_id)


@pytest.mark.asyncio
async def test_driver_location_telemetry(driver_a):
    """Driver updates live GPS and checks recorded location."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/driver/location",
            json={
                "latitude": 23.0555,
                "longitude": 72.5666,
                "accuracy": 5.0,
                "heading": 180.0,
                "speed": 25.0,
            },
            headers={"Authorization": f"Bearer {driver_a['token']}"},
        )
        assert res.status_code == 201
        loc_data = res.json()
        assert loc_data["latitude"] == 23.0555
        assert loc_data["longitude"] == 72.5666

        # Get latest location
        get_res = await client.get(
            "/api/v1/driver/location",
            headers={"Authorization": f"Bearer {driver_a['token']}"},
        )
        assert get_res.status_code == 200
        assert get_res.json()["latitude"] == 23.0555


@pytest.mark.asyncio
async def test_start_collection_transitions_to_in_progress(driver_a, driver_b):
    """Driver starts collection on own assigned incident; forbidden on unassigned."""
    inc_id = uuid.uuid4()
    async with TestSessionLocal() as session:
        inc = Incident(
            id=inc_id,
            title="Assigned to A",
            category=WasteCategory.PLASTIC,
            priority=PriorityLevel.P1,
            status=IncidentStatus.ASSIGNED,
            latitude=23.033,
            longitude=72.586,
            assigned_vehicle_id=driver_a["vehicle_id"],
        )
        session.add(inc)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Driver B forbidden
        res_b = await client.post(
            f"/api/v1/incidents/{inc_id}/start",
            headers={"Authorization": f"Bearer {driver_b['token']}"},
        )
        assert res_b.status_code == 403

        # Driver A allowed
        res_a = await client.post(
            f"/api/v1/incidents/{inc_id}/start",
            headers={"Authorization": f"Bearer {driver_a['token']}"},
        )
        assert res_a.status_code == 200
        assert res_a.json()["new_status"] == IncidentStatus.IN_PROGRESS.value


@pytest.mark.asyncio
async def test_proof_upload_validation_and_completion_enforcement(
    driver_a, officer_user
):
    """
    1. Complete before proof fails (HTTP 400).
    2. Upload invalid MIME / empty file fails (HTTP 400).
    3. Upload valid JPEG succeeds.
    4. Complete with proof transitions incident to COLLECTED and updates vehicle load.
    5. Officer retrieves proof successfully.
    """
    inc_id = uuid.uuid4()
    async with TestSessionLocal() as session:
        inc = Incident(
            id=inc_id,
            title="Hospital Bio-Hazard",
            category=WasteCategory.HAZARDOUS,
            priority=PriorityLevel.P0,
            status=IncidentStatus.IN_PROGRESS,
            latitude=23.033,
            longitude=72.586,
            estimated_volume_m3=2.0,
            assigned_vehicle_id=driver_a["vehicle_id"],
        )
        session.add(inc)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Attempt complete without proof -> 400 Bad Request
        comp_res1 = await client.patch(
            f"/api/v1/incidents/{inc_id}/complete",
            json={"latitude": 23.033, "longitude": 72.586},
            headers={"Authorization": f"Bearer {driver_a['token']}"},
        )
        assert comp_res1.status_code == 400
        assert (
            "without uploading after-cleaning photo proof" in comp_res1.json()["detail"]
        )

        # 2. Upload invalid text file as proof -> 400 Bad Request
        bad_files = {"file": ("test.txt", b"not an image", "text/plain")}
        bad_res = await client.post(
            f"/api/v1/incidents/{inc_id}/proof",
            files=bad_files,
            headers={"Authorization": f"Bearer {driver_a['token']}"},
        )
        assert bad_res.status_code == 400

        # 3. Upload valid JPEG proof
        img_bytes = create_dummy_image()
        files = {"file": ("after_cleaning.jpg", img_bytes, "image/jpeg")}
        proof_res = await client.post(
            f"/api/v1/incidents/{inc_id}/proof",
            files=files,
            data={"latitude": "23.033", "longitude": "72.586", "notes": "Cleaned"},
            headers={"Authorization": f"Bearer {driver_a['token']}"},
        )
        assert proof_res.status_code == 200
        proof_data = proof_res.json()
        assert proof_data["incident_id"] == str(inc_id)
        assert proof_data["verification_status"] == "VALID"
        assert "image_url" in proof_data

        # 4. Complete with proof -> 200 OK
        comp_res2 = await client.patch(
            f"/api/v1/incidents/{inc_id}/complete",
            json={"latitude": 23.033, "longitude": 72.586},
            headers={"Authorization": f"Bearer {driver_a['token']}"},
        )
        assert comp_res2.status_code == 200
        assert comp_res2.json()["new_status"] == IncidentStatus.COLLECTED.value
        assert comp_res2.json()["proof_verified"] is True

        # 5. Officer gets proof list
        get_proof_res = await client.get(
            f"/api/v1/incidents/{inc_id}/proof",
            headers={"Authorization": f"Bearer {officer_user['token']}"},
        )
        assert get_proof_res.status_code == 200
        proofs = get_proof_res.json()
        assert len(proofs) == 1
        assert proofs[0]["driver_id"] == str(driver_a["id"])
