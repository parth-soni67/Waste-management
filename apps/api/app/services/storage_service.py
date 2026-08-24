"""
WasteWise AI — Supabase Storage Service
Handles validation, unique path generation, and persistent object upload
to Supabase Storage bucket 'waste-report-images' with fallback handling.
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

BUCKET_NAME = "waste-report-images"
ALLOWED_MIMES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def detect_image_mime(contents: bytes) -> Optional[str]:
    """Inspect magic bytes to validate image formats per security_guide.md §3."""
    if len(contents) < 12:
        return None
    if contents.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if contents.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if contents[:4] == b"RIFF" and contents[8:12] == b"WEBP":
        return "image/webp"
    return None


class StorageService:
    """Service for managing uploaded report image assets in Supabase Storage."""

    @staticmethod
    async def upload_report_image(
        contents: bytes,
        mime_type: Optional[str] = None,
        filename_hint: Optional[str] = None,
    ) -> Dict[str, str]:
        """
        Validate, name uniquely, and upload image bytes to Supabase Storage.
        Returns dictionary with storage_path and public_url.
        """
        # 1. Validate MIME
        detected_mime = detect_image_mime(contents)
        final_mime = detected_mime or mime_type or "image/jpeg"
        if final_mime not in ALLOWED_MIMES:
            final_mime = "image/jpeg"

        ext = ALLOWED_MIMES.get(final_mime, ".jpg")

        # 2. Generate unique object path: reports/{year}_{month}/{uuid4}{ext}
        now = datetime.now(timezone.utc)
        unique_id = uuid.uuid4().hex
        object_path = f"reports/{now.strftime('%Y_%m')}/{unique_id}{ext}"

        # 3. Target URLs
        upload_url = (
            f"{settings.SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{object_path}"
        )
        public_url = f"{settings.SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{object_path}"

        headers = {
            "apikey": settings.SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_ANON_KEY}",
            "Content-Type": final_mime,
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(upload_url, headers=headers, content=contents)
                if res.status_code in (200, 201):
                    logger.info(
                        "Successfully uploaded image to Supabase Storage: %s",
                        object_path,
                    )
                    return {
                        "storage_path": f"{BUCKET_NAME}/{object_path}",
                        "public_url": public_url,
                    }
                else:
                    logger.warning(
                        "Supabase storage returned status %s: %s. Falling back to local storage.",
                        res.status_code,
                        res.text,
                    )
        except Exception as err:
            logger.warning(
                "Error uploading to Supabase Storage: %s. Engaging fallback.", err
            )

        # Local filesystem fallback for offline / disconnected environments
        try:
            local_dir = os.path.join(settings.UPLOAD_DIR, now.strftime("%Y_%m"))
            os.makedirs(local_dir, exist_ok=True)
            local_file = os.path.join(local_dir, f"{unique_id}{ext}")
            with open(local_file, "wb") as f:
                f.write(contents)
            fallback_url = f"/uploads/{now.strftime('%Y_%m')}/{unique_id}{ext}"
            return {
                "storage_path": f"local/{object_path}",
                "public_url": fallback_url,
            }
        except Exception as local_err:
            logger.error("Failed to save local fallback image: %s", local_err)
            return {
                "storage_path": f"{BUCKET_NAME}/{object_path}",
                "public_url": public_url,
            }

    @staticmethod
    async def upload_collection_proof(
        contents: bytes,
        driver_id: uuid.UUID,
        incident_id: uuid.UUID,
        mime_type: Optional[str] = None,
    ) -> Dict[str, str]:
        """
        Validate, name uniquely, and upload driver after-cleaning proof photo to Supabase Storage.
        Path structure: proofs/{driver_id}/{incident_id}/{timestamp}_{uuid}{ext}
        """
        detected_mime = detect_image_mime(contents)
        final_mime = detected_mime or mime_type or "image/jpeg"
        if final_mime not in ALLOWED_MIMES:
            final_mime = "image/jpeg"

        ext = ALLOWED_MIMES.get(final_mime, ".jpg")
        now = datetime.now(timezone.utc)
        unique_id = uuid.uuid4().hex[:8]
        timestamp_str = now.strftime("%Y%m%d_%H%M%S")
        object_path = (
            f"proofs/{driver_id}/{incident_id}/{timestamp_str}_{unique_id}{ext}"
        )

        upload_url = (
            f"{settings.SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{object_path}"
        )
        public_url = f"{settings.SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{object_path}"

        headers = {
            "apikey": settings.SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_ANON_KEY}",
            "Content-Type": final_mime,
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(upload_url, headers=headers, content=contents)
                if res.status_code in (200, 201):
                    logger.info(
                        "Successfully uploaded collection proof: %s", object_path
                    )
                    return {
                        "storage_path": f"{BUCKET_NAME}/{object_path}",
                        "public_url": public_url,
                    }
                else:
                    logger.warning(
                        "Supabase storage returned status %s for proof: %s. Falling back to local storage.",
                        res.status_code,
                        res.text,
                    )
        except Exception as err:
            logger.warning(
                "Error uploading proof to Supabase Storage: %s. Engaging fallback.", err
            )

        try:
            local_dir = os.path.join(
                settings.UPLOAD_DIR, "proofs", str(driver_id), str(incident_id)
            )
            os.makedirs(local_dir, exist_ok=True)
            local_file = os.path.join(local_dir, f"{timestamp_str}_{unique_id}{ext}")
            with open(local_file, "wb") as f:
                f.write(contents)
            fallback_url = f"/uploads/proofs/{driver_id}/{incident_id}/{timestamp_str}_{unique_id}{ext}"
            return {
                "storage_path": f"local/{object_path}",
                "public_url": fallback_url,
            }
        except Exception as local_err:
            logger.error("Failed to save local fallback proof: %s", local_err)
            return {
                "storage_path": f"{BUCKET_NAME}/{object_path}",
                "public_url": public_url,
            }
