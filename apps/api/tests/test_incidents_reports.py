"""
WasteWise AI — Incidents & Reports Test Suite
Validates Report creation, GPS and severity validation, Dynamic Priority Engine mapping,
Supabase / PostgreSQL persistence, and Officer Incident triage endpoints.
"""

import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.db import Base, get_db
from app.core.security import create_access_token
from app.main import app
from app.models.entities import (
    UserRole,
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
    """Create all tables in memory before each test and drop after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    app.dependency_overrides[get_db] = override_get_db
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def officer_token():
    """Generate JWT token for Officer role."""
    return create_access_token(
        user_id=str(uuid.uuid4()),
        role=UserRole.OFFICER.value,
    )


@pytest.fixture
def citizen_token():
    """Generate JWT token for Citizen role."""
    return create_access_token(
        user_id=str(uuid.uuid4()),
        role=UserRole.CITIZEN.value,
    )


@pytest.mark.asyncio
async def test_create_report_success():
    """
    POST /api/v1/reports should accept AI results, persist report & incident in DB,
    compute priority, and return 201 with populated metadata.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "category": "hazardous",
            "confidence": 0.94,
            "estimated_volume_m3": 2.5,
            "severity_score": 9.2,
            "detected_tags": ["medical_waste", "bio_hazard", "overflow_bin"],
            "recommended_action": "Immediate dispatch Hazmat compactor",
            "description": "Hospital waste spill near Sector 12",
            "image_urls": [],
            "latitude": 23.0330,
            "longitude": 72.5860,
            "address_text": "Sector 12 Civil Hospital Gate, Gandhinagar",
        }
        res = await client.post("/api/v1/reports", json=payload)
        assert res.status_code == 201
        data = res.json()

        assert "id" in data
        assert "incident_id" in data
        assert data["category"] == "hazardous"
        assert data["severity_score"] == 9.2
        assert data["priority"] == "P0"  # High severity + Hospital Sensitive Zone -> P0
        assert data["status"] == "REPORTED"
        assert data["latitude"] == 23.0330
        assert data["longitude"] == 72.5860


@pytest.mark.asyncio
async def test_create_report_invalid_coordinates():
    """
    POST /api/v1/reports should reject invalid latitude (> 90 or < -90) and longitude (> 180 or < -180).
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Invalid latitude > 90
        payload_bad_lat = {
            "category": "plastic",
            "latitude": 95.0,
            "longitude": 72.58,
        }
        res = await client.post("/api/v1/reports", json=payload_bad_lat)
        assert res.status_code == 422

        # Invalid longitude > 180
        payload_bad_lng = {
            "category": "plastic",
            "latitude": 23.03,
            "longitude": 195.0,
        }
        res = await client.post("/api/v1/reports", json=payload_bad_lng)
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_create_report_invalid_severity():
    """
    POST /api/v1/reports should reject severity score > 10.0 or < 0.0.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload_bad_sev = {
            "category": "organic",
            "severity_score": 15.0,
            "latitude": 23.03,
            "longitude": 72.58,
        }
        res = await client.post("/api/v1/reports", json=payload_bad_sev)
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_duplicate_clustering_consensus():
    """
    Multiple reports within 100m in the same 24h period should cluster into 1 incident
    and increase consensus report count.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Report 1
        res1 = await client.post(
            "/api/v1/reports",
            json={
                "category": "plastic",
                "severity_score": 6.0,
                "latitude": 23.0450,
                "longitude": 72.5500,
                "description": "Plastic bottles pile #1",
            },
        )
        assert res1.status_code == 201
        data1 = res1.json()
        incident_id_1 = data1["incident_id"]

        # Report 2 (30 meters away)
        res2 = await client.post(
            "/api/v1/reports",
            json={
                "category": "plastic",
                "severity_score": 7.5,
                "latitude": 23.0452,
                "longitude": 72.5502,
                "description": "Plastic bottles pile #2",
            },
        )
        assert res2.status_code == 201
        data2 = res2.json()
        incident_id_2 = data2["incident_id"]

        # Both reports must link to the same Clustered Incident
        assert incident_id_1 == incident_id_2

        # Check incidents list to verify report_count == 2
        inc_res = await client.get("/api/v1/incidents")
        assert inc_res.status_code == 200
        incidents = inc_res.json()
        matching = [i for i in incidents if i["id"] == incident_id_1]
        assert len(matching) == 1
        assert matching[0]["report_count"] == 2
        assert matching[0]["severity_score"] == 7.5  # Max severity upgraded


@pytest.mark.asyncio
async def test_list_reports_and_incidents():
    """
    GET /api/v1/reports and GET /api/v1/incidents should retrieve persisted records.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Submit a report
        await client.post(
            "/api/v1/reports",
            json={
                "category": "organic",
                "severity_score": 5.5,
                "latitude": 23.024,
                "longitude": 72.572,
                "description": "Vegetable waste pile",
            },
        )

        # Query reports
        res_reports = await client.get("/api/v1/reports")
        assert res_reports.status_code == 200
        reports = res_reports.json()
        assert len(reports) >= 1
        assert reports[0]["category"] == "organic"

        # Query incidents
        res_incidents = await client.get("/api/v1/incidents")
        assert res_incidents.status_code == 200
        incidents = res_incidents.json()
        assert len(incidents) >= 1
        assert incidents[0]["category"] == "organic"


@pytest.mark.asyncio
async def test_officer_update_incident_status(officer_token: str):
    """
    PATCH /api/v1/incidents/{id} allows Officers to change status, priority, and assign vehicles.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create incident via report
        create_res = await client.post(
            "/api/v1/reports",
            json={
                "category": "mixed",
                "severity_score": 4.0,
                "latitude": 23.018,
                "longitude": 72.562,
                "description": "General street litter",
            },
        )
        assert create_res.status_code == 201
        incident_id = create_res.json()["incident_id"]

        # 2. Officer updates status to ASSIGNED and priority to P1
        patch_res = await client.patch(
            f"/api/v1/incidents/{incident_id}",
            json={
                "status": "ASSIGNED",
                "priority": "P1",
            },
            headers={"Authorization": f"Bearer {officer_token}"},
        )
        assert patch_res.status_code == 200
        updated = patch_res.json()
        assert updated["status"] == "ASSIGNED"
        assert updated["priority"] == "P1"

        # 3. Verify get incident returns updated status
        get_res = await client.get(f"/api/v1/incidents/{incident_id}")
        assert get_res.status_code == 200
        assert get_res.json()["status"] == "ASSIGNED"
        assert get_res.json()["priority"] == "P1"


@pytest.mark.asyncio
async def test_officer_update_incident_unauthorized():
    """
    PATCH /api/v1/incidents/{id} without officer token should return 401/403.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create an incident
        create_res = await client.post(
            "/api/v1/reports",
            json={
                "category": "construction",
                "severity_score": 3.0,
                "latitude": 23.008,
                "longitude": 72.595,
            },
        )
        incident_id = create_res.json()["incident_id"]

        # Attempt unauthorized patch without token
        patch_res = await client.patch(
            f"/api/v1/incidents/{incident_id}",
            json={"status": "CLOSED"},
        )
        assert patch_res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_report_and_incident_timestamps_authoritative_and_timezone_aware(
    officer_token,
):
    """
    Verify report and incident creation timestamps are generated server-side,
    timezone-aware UTC, and match between report creation and subsequent GETs.
    """
    from datetime import datetime, timezone

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create a report (client cannot dictate created_at)
        start_time = datetime.now(timezone.utc)
        res = await client.post(
            "/api/v1/reports",
            json={
                "category": "organic",
                "severity_score": 7.0,
                "latitude": 23.045,
                "longitude": 72.540,
                "description": "Vegetable waste pile near market",
                "created_at": "1990-01-01T00:00:00Z",  # Bogus client timestamp
            },
            headers={"Authorization": f"Bearer {officer_token}"},
        )
        assert res.status_code == 201
        data = res.json()
        report_id = data["id"]
        incident_id = data["incident_id"]
        created_at_str = data["created_at"]

        # Verify timestamp contains timezone info (Z or +00:00)
        assert (
            "Z" in created_at_str
            or "+00:00" in created_at_str
            or "+00" in created_at_str
        )

        # Parse and verify within 10s of now (bogus 1990 timestamp was ignored)
        parsed_dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
        assert (datetime.now(timezone.utc) - parsed_dt).total_seconds() < 10.0
        assert (
            parsed_dt >= start_time
            or abs((start_time - parsed_dt).total_seconds()) < 2.0
        )

        # 2. Verify GET /api/v1/reports returns exact same timestamp
        get_rep = await client.get(
            "/api/v1/reports", headers={"Authorization": f"Bearer {officer_token}"}
        )
        assert get_rep.status_code == 200
        reports = get_rep.json()
        matched_rep = next(r for r in reports if r["id"] == report_id)
        assert matched_rep["created_at"] == created_at_str

        # 3. Verify GET /api/v1/incidents returns timezone-aware created_at and updated_at
        get_inc = await client.get(f"/api/v1/incidents/{incident_id}")
        assert get_inc.status_code == 200
        inc_data = get_inc.json()
        assert "created_at" in inc_data
        assert "updated_at" in inc_data
        inc_created = inc_data["created_at"]
        assert "Z" in inc_created or "+00:00" in inc_created or "+00" in inc_created
