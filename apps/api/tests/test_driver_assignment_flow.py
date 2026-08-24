"""
WasteWise AI — Driver Assignment Flow & Isolation Test Suite
Verifies Officer Dispatch -> Vehicle Link -> Driver Assignment Isolation -> Execution -> Proof Verification.
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
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
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


def make_test_jpeg():
    img = Image.new("RGB", (200, 200), color=(34, 197, 94))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_available_drivers_and_vehicles_endpoint():
    """Test that GET /api/v1/vehicles/available-drivers returns available fleet with driver details."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        officer_id = uuid.uuid4()
        token = create_access_token(user_id=str(officer_id), role="OFFICER")
        headers = {"Authorization": f"Bearer {token}"}

        # Seed a vehicle
        async with TestSessionLocal() as session:
            veh = Vehicle(
                id=uuid.uuid4(),
                plate_number="GJ-01-WM-9999",
                vehicle_type="Compactor 5T",
                capacity_kg=5000.0,
                status=VehicleStatus.AVAILABLE,
            )
            session.add(veh)
            await session.commit()

        res = await client.get("/api/v1/vehicles/available-drivers", headers=headers)
        assert res.status_code == 200
        vehicles = res.json()
        assert isinstance(vehicles, list)
        assert len(vehicles) >= 1
        first = vehicles[0]
        assert "vehicle_id" in first
        assert "plate_number" in first
        assert "driver_name" in first


@pytest.mark.asyncio
async def test_officer_dispatch_and_driver_cockpit_isolation():
    """
    Test end-to-end assignment flow:
    1. Officer creates vehicle & assigns driver.
    2. Citizen submits waste report.
    3. Officer approves & dispatches vehicle.
    4. Database persists assigned_driver_id, assigned_vehicle_id, assigned_at, assigned_by_id.
    5. Assigned Driver sees assignment.
    6. Unassigned Driver sees empty list.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        officer_id = uuid.uuid4()
        officer_token = create_access_token(user_id=str(officer_id), role="OFFICER")
        officer_headers = {"Authorization": f"Bearer {officer_token}"}

        driver_a_id = uuid.uuid4()
        driver_a_token = create_access_token(user_id=str(driver_a_id), role="DRIVER")
        driver_a_headers = {"Authorization": f"Bearer {driver_a_token}"}

        driver_b_id = uuid.uuid4()
        driver_b_token = create_access_token(user_id=str(driver_b_id), role="DRIVER")
        driver_b_headers = {"Authorization": f"Bearer {driver_b_token}"}

        # Seed drivers in database
        async with TestSessionLocal() as session:
            da = User(
                id=driver_a_id,
                email="driverA@test.gov",
                hashed_password="hash",
                full_name="Driver Ashok",
                role=UserRole.DRIVER,
            )
            db_u = User(
                id=driver_b_id,
                email="driverB@test.gov",
                hashed_password="hash",
                full_name="Driver Bipin",
                role=UserRole.DRIVER,
            )
            session.add_all([da, db_u])
            await session.commit()

        # 4. Officer registers vehicle and links to Driver A
        plate = f"GJ-01-WM-{uuid.uuid4().hex[:4].upper()}"
        veh_res = await client.post(
            "/api/v1/vehicles",
            json={
                "plate_number": plate,
                "vehicle_type": "Compactor 5T",
                "capacity_kg": 5000.0,
                "driver_id": str(driver_a_id),
                "current_lat": 23.033,
                "current_lng": 72.586,
            },
            headers=officer_headers,
        )
        assert veh_res.status_code == 201
        vehicle_id = veh_res.json()["id"]

        # 5. Citizen submits report
        rep_res = await client.post(
            "/api/v1/reports",
            json={
                "category": "mixed",
                "confidence": 0.94,
                "estimated_volume_m3": 2.5,
                "severity_score": 8.0,
                "description": "Sector 28 Smart Hub overflow",
                "latitude": 23.055,
                "longitude": 72.570,
                "address_text": "Sector 28 Smart Hub, Gandhinagar",
            },
        )
        assert rep_res.status_code == 201
        incident_id = rep_res.json()["incident_id"]

        # 6. Officer Approves & Dispatches vehicle to Incident
        patch_res = await client.patch(
            f"/api/v1/incidents/{incident_id}",
            json={
                "status": "ASSIGNED",
                "assigned_vehicle_id": vehicle_id,
                "priority": "P1",
            },
            headers=officer_headers,
        )
        assert patch_res.status_code == 200
        patched_inc = patch_res.json()
        assert patched_inc["status"] == "ASSIGNED"
        assert patched_inc["assigned_vehicle_id"] == vehicle_id
        assert patched_inc["assigned_driver_id"] == str(driver_a_id)
        assert patched_inc["assigned_at"] is not None

        # 7. Driver A queries assignments -> gets Stop #1
        d_a_assign = await client.get(
            "/api/v1/driver/assignments", headers=driver_a_headers
        )
        assert d_a_assign.status_code == 200
        assignments_a = d_a_assign.json()
        assert len(assignments_a) == 1
        assert assignments_a[0]["incident_id"] == incident_id
        assert assignments_a[0]["priority"] == "P1"
        assert assignments_a[0]["vehicle_plate"] == plate

        # 8. Driver B queries assignments -> isolated, returns 0
        d_b_assign = await client.get(
            "/api/v1/driver/assignments", headers=driver_b_headers
        )
        assert d_b_assign.status_code == 200
        assignments_b = d_b_assign.json()
        assert len(assignments_b) == 0

        # 9. Driver A starts collection
        start_res = await client.post(
            f"/api/v1/incidents/{incident_id}/start", headers=driver_a_headers
        )
        assert start_res.status_code == 200
        assert start_res.json()["new_status"] == "IN_PROGRESS"

        # 10. Attempt complete without proof -> rejected with 400
        gate_res = await client.patch(
            f"/api/v1/incidents/{incident_id}/complete",
            json={
                "latitude": 23.055,
                "longitude": 72.570,
            },
            headers=driver_a_headers,
        )
        assert gate_res.status_code == 400

        # 11. Driver A uploads proof photo
        proof_img = make_test_jpeg()
        proof_res = await client.post(
            f"/api/v1/incidents/{incident_id}/proof",
            files={"file": ("cleaned.jpg", proof_img, "image/jpeg")},
            data={
                "latitude": "23.055",
                "longitude": "72.570",
                "notes": "Sanitized site",
            },
            headers=driver_a_headers,
        )
        assert proof_res.status_code == 200
        assert proof_res.json()["verification_status"] in ("VALID", "GPS_VERIFIED")

        # 12. Driver A completes collection
        complete_res = await client.patch(
            f"/api/v1/incidents/{incident_id}/complete",
            json={
                "latitude": 23.055,
                "longitude": 72.570,
            },
            headers=driver_a_headers,
        )
        assert complete_res.status_code == 200
        assert complete_res.json()["new_status"] == "COLLECTED"


@pytest.mark.asyncio
async def test_driver_assignment_primary_vs_cluster_evidence_and_volume():
    """
    Verify:
    1. Report 1 submitted with image A (vol = 2.44).
    2. Report 2 submitted nearby (<100m) with image B (vol = 5.25).
    3. Merged incident has volume 7.69 (properly rounded, not float artifact).
    4. Driver assignment returns primary_image_urls = [imageA] and cluster_image_urls = [imageB].
    5. volume_source = "CLUSTER_AGGREGATE".
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        officer_id = uuid.uuid4()
        officer_token = create_access_token(user_id=str(officer_id), role="OFFICER")
        officer_headers = {"Authorization": f"Bearer {officer_token}"}

        driver_id = uuid.uuid4()
        driver_token = create_access_token(user_id=str(driver_id), role="DRIVER")
        driver_headers = {"Authorization": f"Bearer {driver_token}"}

        # Seed driver in database
        async with TestSessionLocal() as session:
            d_user = User(
                id=driver_id,
                email=f"driver_{uuid.uuid4().hex[:6]}@test.gov",
                hashed_password="hash",
                full_name="Driver Dilip",
                role=UserRole.DRIVER,
            )
            session.add(d_user)
            await session.commit()

        # 1. Create vehicle assigned to driver
        veh_res = await client.post(
            "/api/v1/vehicles",
            json={
                "plate_number": f"GJ-01-WM-{uuid.uuid4().hex[:4].upper()}",
                "vehicle_type": "Compactor 5T",
                "capacity_kg": 5000.0,
                "driver_id": str(driver_id),
                "current_lat": 23.0500,
                "current_lng": 72.5600,
            },
            headers=officer_headers,
        )
        assert veh_res.status_code == 201
        vehicle_id = veh_res.json()["id"]

        # 2. Citizen 1 submits Report 1
        rep1_res = await client.post(
            "/api/v1/reports",
            json={
                "category": "mixed",
                "confidence": 0.92,
                "estimated_volume_m3": 2.44,
                "severity_score": 7.5,
                "description": "First report at market",
                "latitude": 23.0500,
                "longitude": 72.5600,
                "image_urls": ["https://supabase.co/img1.jpg"],
            },
        )
        assert rep1_res.status_code == 201
        inc_id = rep1_res.json()["incident_id"]

        # 3. Citizen 2 submits Report 2 nearby (< 50m)
        rep2_res = await client.post(
            "/api/v1/reports",
            json={
                "category": "mixed",
                "confidence": 0.95,
                "estimated_volume_m3": 5.25,
                "severity_score": 8.0,
                "description": "Second report at same market pile",
                "latitude": 23.0502,
                "longitude": 72.5601,
                "image_urls": ["https://supabase.co/img2.jpg"],
            },
        )
        assert rep2_res.status_code == 201
        assert rep2_res.json()["incident_id"] == inc_id  # Clustered into same incident

        # 4. Officer assigns vehicle to incident
        assign_res = await client.patch(
            f"/api/v1/incidents/{inc_id}",
            json={
                "status": "ASSIGNED",
                "assigned_vehicle_id": vehicle_id,
                "priority": "P1",
            },
            headers=officer_headers,
        )
        assert assign_res.status_code == 200

        # 5. Driver queries assignments
        d_res = await client.get("/api/v1/driver/assignments", headers=driver_headers)
        assert d_res.status_code == 200
        assignments = d_res.json()
        assert len(assignments) >= 1
        inc_assign = next(a for a in assignments if a["incident_id"] == inc_id)

        # 6. Assert clean rounding and separated evidence
        assert inc_assign["estimated_volume_m3"] == 7.69
        assert inc_assign["volume_source"] == "CLUSTER_AGGREGATE"
        assert inc_assign["report_count"] == 2
        assert "https://supabase.co/img1.jpg" in inc_assign["primary_image_urls"]
        assert "https://supabase.co/img2.jpg" in inc_assign["cluster_image_urls"]
