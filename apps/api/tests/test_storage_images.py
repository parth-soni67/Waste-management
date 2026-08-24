"""
WasteWise AI — Image Storage & Evidence Integrity Test Suite
Validates distinct image uploads, Supabase Storage paths, individual report
image retention, clustered incident multi-image preservation, and rejection of invalid uploads.
"""

from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.db import Base, get_db
from app.main import app
from app.services.storage_service import StorageService

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


# 1x1 valid PNG image bytes
VALID_PNG_BYTES_A = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    b"\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00\x02\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"
)

# 1x1 valid JPEG image bytes
VALID_JPEG_BYTES_B = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08"
    b"\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c"
    b"\x1c(7),01444\x1f'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01"
    b"\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00"
    b"?\x00\xbf\x00\xff\xd9"
)


@pytest.mark.asyncio
async def test_storage_service_generates_unique_paths():
    """Two different uploads generate distinct storage paths and public URLs."""
    res_a = await StorageService.upload_report_image(VALID_PNG_BYTES_A, "image/png")
    res_b = await StorageService.upload_report_image(VALID_JPEG_BYTES_B, "image/jpeg")

    assert res_a["storage_path"] != res_b["storage_path"]
    assert res_a["public_url"] != res_b["public_url"]
    assert (
        "waste-report-images" in res_a["storage_path"]
        or "local" in res_a["storage_path"]
    )
    assert (
        "waste-report-images" in res_b["storage_path"]
        or "local" in res_b["storage_path"]
    )


@pytest.mark.asyncio
async def test_analyze_image_file_uploads_and_returns_real_url():
    """POST /api/v1/ai/analyze-image-file uploads real image and returns URL in response."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        files = {"file": ("test_a.png", VALID_PNG_BYTES_A, "image/png")}
        res = await client.post("/api/v1/ai/analyze-image-file", files=files)
        assert res.status_code == 200
        data = res.json()
        assert data["image_url"] is not None
        assert "http" in data["image_url"] or "/uploads/" in data["image_url"]
        assert data["storage_path"] is not None


@pytest.mark.asyncio
async def test_reports_retain_distinct_images():
    """Report A and Report B retain their individual uploaded image URLs."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        img_a_url = "https://qjqfziwzaobizdqcmnxq.supabase.co/storage/v1/object/public/waste-report-images/reports/2026_08/img_a_unique.jpg"
        img_b_url = "https://qjqfziwzaobizdqcmnxq.supabase.co/storage/v1/object/public/waste-report-images/reports/2026_08/img_b_unique.jpg"

        # Submit Report A (Zone 1)
        res_a = await client.post(
            "/api/v1/reports",
            json={
                "category": "plastic",
                "description": "Report A Plastic Waste",
                "image_urls": [img_a_url],
                "latitude": 23.0330,
                "longitude": 72.5860,
            },
        )
        assert res_a.status_code == 201
        rep_a = res_a.json()
        assert rep_a["image_urls"] == [img_a_url]

        # Submit Report B (Zone 2 - far from A, >100m)
        res_b = await client.post(
            "/api/v1/reports",
            json={
                "category": "organic",
                "description": "Report B Organic Waste",
                "image_urls": [img_b_url],
                "latitude": 23.0800,
                "longitude": 72.6200,
            },
        )
        assert res_b.status_code == 201
        rep_b = res_b.json()
        assert rep_b["image_urls"] == [img_b_url]

        # Fetch all reports
        res_list = await client.get("/api/v1/reports")
        assert res_list.status_code == 200
        reports = res_list.json()
        fetched_a = next(r for r in reports if r["id"] == rep_a["id"])
        fetched_b = next(r for r in reports if r["id"] == rep_b["id"])

        assert fetched_a["image_urls"] == [img_a_url]
        assert fetched_b["image_urls"] == [img_b_url]
        assert fetched_a["image_urls"] != fetched_b["image_urls"]


@pytest.mark.asyncio
async def test_clustered_reports_preserve_individual_and_aggregated_images():
    """Two reports within 100m cluster into 1 Incident but retain their individual Report images."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        img_1 = "https://qjqfziwzaobizdqcmnxq.supabase.co/storage/v1/object/public/waste-report-images/reports/2026_08/cluster_1.jpg"
        img_2 = "https://qjqfziwzaobizdqcmnxq.supabase.co/storage/v1/object/public/waste-report-images/reports/2026_08/cluster_2.jpg"

        # Report 1
        res1 = await client.post(
            "/api/v1/reports",
            json={
                "category": "mixed",
                "description": "First cluster report",
                "image_urls": [img_1],
                "latitude": 23.03300,
                "longitude": 72.58600,
            },
        )
        assert res1.status_code == 201
        r1 = res1.json()

        # Report 2 (10 meters away -> clusters with Report 1)
        res2 = await client.post(
            "/api/v1/reports",
            json={
                "category": "mixed",
                "description": "Second cluster report",
                "image_urls": [img_2],
                "latitude": 23.03305,
                "longitude": 72.58605,
            },
        )
        assert res2.status_code == 201
        r2 = res2.json()

        # Verify they share the same Incident ID
        assert r1["incident_id"] == r2["incident_id"]

        # Fetch Reports list: Each report retains ONLY its own image
        res_reports = await client.get("/api/v1/reports")
        reports = res_reports.json()
        f_r1 = next(r for r in reports if r["id"] == r1["id"])
        f_r2 = next(r for r in reports if r["id"] == r2["id"])

        assert f_r1["image_urls"] == [img_1]
        assert f_r2["image_urls"] == [img_2]

        # Fetch Incident: Contains accumulated distinct images from both reports
        res_incidents = await client.get("/api/v1/incidents")
        incidents = res_incidents.json()
        parent_incident = next(
            inc for inc in incidents if inc["id"] == r1["incident_id"]
        )
        assert img_1 in parent_incident["image_urls"]
        assert img_2 in parent_incident["image_urls"]


@pytest.mark.asyncio
async def test_report_without_image_has_empty_list():
    """Report without uploaded images does not receive fake images and returns empty list."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/v1/reports",
            json={
                "category": "mixed",
                "description": "Text only report",
                "image_urls": [],
                "latitude": 23.0500,
                "longitude": 72.5900,
            },
        )
        assert res.status_code == 201
        data = res.json()
        assert data["image_urls"] == []


@pytest.mark.asyncio
async def test_invalid_image_mime_rejected():
    """Uploading non-image binary or text file returns HTTP 400."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        fake_binary = b"<script>alert('hack')</script>"
        files = {"file": ("malicious.txt", fake_binary, "text/plain")}
        res = await client.post("/api/v1/ai/analyze-image-file", files=files)
        assert res.status_code == 400
        assert "Unsupported image format" in res.json()["detail"]


@pytest.mark.asyncio
async def test_oversized_image_rejected():
    """Uploading image exceeding max size returns HTTP 400."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 11MB dummy content
        oversized = b"\xff\xd8\xff" + b"0" * (11 * 1024 * 1024)
        files = {"file": ("oversized.jpg", oversized, "image/jpeg")}
        res = await client.post("/api/v1/ai/analyze-image-file", files=files)
        assert res.status_code == 400
        assert "limit" in res.json()["detail"].lower()
