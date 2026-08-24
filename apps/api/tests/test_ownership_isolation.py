"""
WasteWise AI — Citizen Ownership & Report Isolation Security Tests
Validates database-level multi-tenant isolation:
- Citizens can only query and retrieve their own reports.
- Cross-citizen report retrieval by ID returns HTTP 404.
- Officers have global municipal visibility across all incidents and reports.
- Clustered incidents preserve individual citizen report ownership.
- User ID cannot be spoofed via payload.
"""

import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.db import Base, get_db
from app.core.security import hash_password
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

CITIZEN_A_ID = uuid.uuid4()
CITIZEN_B_ID = uuid.uuid4()
OFFICER_ID = uuid.uuid4()


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

    # Seed 2 distinct citizens and 1 officer
    async with TestSessionLocal() as session:
        citizen_a = User(
            id=CITIZEN_A_ID,
            email="citizenA@test.com",
            hashed_password=hash_password("PasswordA123!"),
            full_name="Citizen Alice",
            role=UserRole.CITIZEN,
            is_active=True,
            is_verified=True,
        )
        citizen_b = User(
            id=CITIZEN_B_ID,
            email="citizenB@test.com",
            hashed_password=hash_password("PasswordB123!"),
            full_name="Citizen Bob",
            role=UserRole.CITIZEN,
            is_active=True,
            is_verified=True,
        )
        officer = User(
            id=OFFICER_ID,
            email="officer@test.com",
            hashed_password=hash_password("OfficerPass123!"),
            full_name="Officer Sharma",
            role=UserRole.OFFICER,
            is_active=True,
            is_verified=True,
        )
        session.add_all([citizen_a, citizen_b, officer])
        await session.commit()

    yield

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    app.dependency_overrides.pop(get_db, None)


async def get_token_for(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_citizen_report_isolation_and_ownership():
    """Citizen A and Citizen B reports are strictly isolated at the database query level."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token_a = await get_token_for(client, "citizenA@test.com", "PasswordA123!")
        token_b = await get_token_for(client, "citizenB@test.com", "PasswordB123!")
        token_officer = await get_token_for(
            client, "officer@test.com", "OfficerPass123!"
        )

        img_a = "https://qjqfziwzaobizdqcmnxq.supabase.co/storage/v1/object/public/waste-report-images/reports/2026_08/img_alice.jpg"
        img_b = "https://qjqfziwzaobizdqcmnxq.supabase.co/storage/v1/object/public/waste-report-images/reports/2026_08/img_bob.jpg"

        # 1. Citizen A submits Report A (trying to spoof user_id=CITIZEN_B_ID in payload)
        res_a = await client.post(
            "/api/v1/reports",
            json={
                "category": "plastic",
                "description": "Alice Plastic Waste",
                "image_urls": [img_a],
                "latitude": 23.0330,
                "longitude": 72.5860,
                "user_id": str(CITIZEN_B_ID),  # Spoofing attempt
            },
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert res_a.status_code == 201
        report_a = res_a.json()
        # Spoofed user_id MUST be ignored -> must equal Citizen A's actual ID
        assert report_a["user_id"] == str(CITIZEN_A_ID)
        report_a_id = report_a["id"]

        # 2. Citizen B submits Report B
        res_b = await client.post(
            "/api/v1/reports",
            json={
                "category": "organic",
                "description": "Bob Organic Waste",
                "image_urls": [img_b],
                "latitude": 23.0800,
                "longitude": 72.6200,
            },
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert res_b.status_code == 201
        report_b = res_b.json()
        assert report_b["user_id"] == str(CITIZEN_B_ID)
        report_b_id = report_b["id"]

        # 3. Citizen A queries GET /reports -> MUST return ONLY Report A
        res_list_a = await client.get(
            "/api/v1/reports",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert res_list_a.status_code == 200
        reports_a = res_list_a.json()
        assert len(reports_a) == 1
        assert reports_a[0]["id"] == report_a_id
        assert reports_a[0]["image_urls"] == [img_a]

        # 4. Citizen B queries GET /reports -> MUST return ONLY Report B
        res_list_b = await client.get(
            "/api/v1/reports",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert res_list_b.status_code == 200
        reports_b = res_list_b.json()
        assert len(reports_b) == 1
        assert reports_b[0]["id"] == report_b_id
        assert reports_b[0]["image_urls"] == [img_b]

        # 5. Cross-tenant direct access by ID:
        # Citizen A tries to fetch Report B -> MUST return 404
        cross_res_a = await client.get(
            f"/api/v1/reports/{report_b_id}",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert cross_res_a.status_code == 404

        # Citizen B tries to fetch Report A -> MUST return 404
        cross_res_b = await client.get(
            f"/api/v1/reports/{report_a_id}",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert cross_res_b.status_code == 404

        # 6. Officer queries GET /reports -> MUST return BOTH Report A and Report B
        res_officer = await client.get(
            "/api/v1/reports",
            headers={"Authorization": f"Bearer {token_officer}"},
        )
        assert res_officer.status_code == 200
        officer_reports = res_officer.json()
        assert len(officer_reports) == 2
        officer_rep_ids = [r["id"] for r in officer_reports]
        assert report_a_id in officer_rep_ids
        assert report_b_id in officer_rep_ids

        # 7. Officer fetches both by ID -> Success
        get_rep_a = await client.get(
            f"/api/v1/reports/{report_a_id}",
            headers={"Authorization": f"Bearer {token_officer}"},
        )
        assert get_rep_a.status_code == 200
        assert get_rep_a.json()["image_urls"] == [img_a]

        get_rep_b = await client.get(
            f"/api/v1/reports/{report_b_id}",
            headers={"Authorization": f"Bearer {token_officer}"},
        )
        assert get_rep_b.status_code == 200
        assert get_rep_b.json()["image_urls"] == [img_b]


@pytest.mark.asyncio
async def test_clustered_incident_visibility_and_isolation():
    """Clustered reports under 1 Incident maintain strict citizen isolation and full officer visibility."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token_a = await get_token_for(client, "citizenA@test.com", "PasswordA123!")
        token_b = await get_token_for(client, "citizenB@test.com", "PasswordB123!")
        token_officer = await get_token_for(
            client, "officer@test.com", "OfficerPass123!"
        )

        # 2 reports in exact same location (<100m) -> clustered into 1 Incident
        res_a = await client.post(
            "/api/v1/reports",
            json={
                "category": "mixed",
                "description": "Cluster Report A",
                "image_urls": ["https://storage.wastewise.ai/img_a.jpg"],
                "latitude": 23.03300,
                "longitude": 72.58600,
            },
            headers={"Authorization": f"Bearer {token_a}"},
        )
        rep_a = res_a.json()

        res_b = await client.post(
            "/api/v1/reports",
            json={
                "category": "mixed",
                "description": "Cluster Report B",
                "image_urls": ["https://storage.wastewise.ai/img_b.jpg"],
                "latitude": 23.03305,
                "longitude": 72.58605,
            },
            headers={"Authorization": f"Bearer {token_b}"},
        )
        rep_b = res_b.json()

        assert rep_a["incident_id"] == rep_b["incident_id"]
        shared_incident_id = rep_a["incident_id"]

        # Citizen A sees only 1 report
        r_a = await client.get(
            "/api/v1/reports", headers={"Authorization": f"Bearer {token_a}"}
        )
        assert len(r_a.json()) == 1
        assert r_a.json()[0]["id"] == rep_a["id"]

        # Citizen B sees only 1 report
        r_b = await client.get(
            "/api/v1/reports", headers={"Authorization": f"Bearer {token_b}"}
        )
        assert len(r_b.json()) == 1
        assert r_b.json()[0]["id"] == rep_b["id"]

        # Officer sees the shared incident and both distinct clustered reports
        officer_incidents = await client.get(
            "/api/v1/incidents",
            headers={"Authorization": f"Bearer {token_officer}"},
        )
        assert any(inc["id"] == shared_incident_id for inc in officer_incidents.json())

        officer_reports = await client.get(
            f"/api/v1/reports?incident_id={shared_incident_id}",
            headers={"Authorization": f"Bearer {token_officer}"},
        )
        assert len(officer_reports.json()) == 2
