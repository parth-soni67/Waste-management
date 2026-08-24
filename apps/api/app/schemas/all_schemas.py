"""
WasteWise AI — Pydantic Schemas

Strict input/output schemas for all API endpoints.
Implements system_guide.md §3: dedicated schemas per direction (Create, Read, Update).
"""

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.entities import (
    IncidentStatus,
    PriorityLevel,
    UserRole,
    VehicleStatus,
    WasteCategory,
)

# ---------------------------------------------------------------------------
# Auth & User Schemas
# ---------------------------------------------------------------------------


class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=255)
    phone_number: Optional[str] = Field(None, max_length=30)
    role: UserRole = UserRole.CITIZEN


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: uuid.UUID
    email: str
    full_name: str
    role: UserRole


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: UserRole
    phone_number: Optional[str] = None
    is_active: bool
    is_verified: bool
    mfa_enabled: bool
    created_at: datetime


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


# ---------------------------------------------------------------------------
# Vehicle Schemas
# ---------------------------------------------------------------------------


class VehicleCreate(BaseModel):
    plate_number: str = Field(min_length=3, max_length=50)
    vehicle_type: str = Field(default="compactor", max_length=50)
    capacity_kg: float = Field(default=5000.0, gt=0)
    driver_id: Optional[uuid.UUID] = None
    current_lat: Optional[float] = Field(None, ge=-90.0, le=90.0)
    current_lng: Optional[float] = Field(None, ge=-180.0, le=180.0)


class VehicleUpdate(BaseModel):
    status: Optional[VehicleStatus] = None
    current_load_kg: Optional[float] = Field(None, ge=0)
    driver_id: Optional[uuid.UUID] = None
    current_lat: Optional[float] = Field(None, ge=-90.0, le=90.0)
    current_lng: Optional[float] = Field(None, ge=-180.0, le=180.0)


class VehicleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plate_number: str
    vehicle_type: str
    capacity_kg: float
    current_load_kg: float
    status: VehicleStatus
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    driver_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Report Schemas
# ---------------------------------------------------------------------------


class ReportCreate(BaseModel):
    description: Optional[str] = Field(None, max_length=2000)
    category: Optional[str] = Field(None, max_length=50)
    image_urls: List[str] = Field(default_factory=list, max_length=5)
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    address_text: Optional[str] = Field(None, max_length=500)


class ReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    incident_id: Optional[uuid.UUID] = None
    category: Optional[str] = None
    description: Optional[str] = None
    image_urls: List[str]
    latitude: float
    longitude: float
    address_text: Optional[str] = None
    status: IncidentStatus
    created_at: datetime


# ---------------------------------------------------------------------------
# Incident Schemas
# ---------------------------------------------------------------------------


class IncidentCreate(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: Optional[str] = None
    category: WasteCategory = WasteCategory.MIXED
    priority: PriorityLevel = PriorityLevel.P3
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    zone_id: Optional[str] = None
    estimated_volume_m3: Optional[float] = None


class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[PriorityLevel] = None
    status: Optional[IncidentStatus] = None
    assigned_vehicle_id: Optional[uuid.UUID] = None
    estimated_volume_m3: Optional[float] = None


class IncidentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: Optional[str] = None
    category: WasteCategory
    priority: PriorityLevel
    status: IncidentStatus
    latitude: float
    longitude: float
    zone_id: Optional[str] = None
    estimated_volume_m3: Optional[float] = None
    report_count: int
    assigned_vehicle_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Notification Schemas
# ---------------------------------------------------------------------------


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    message: str
    notification_type: str
    is_read: bool
    created_at: datetime


class WasteAnalysisResult(BaseModel):
    category: str = Field(description="Primary detected waste type")
    confidence: float = Field(ge=0.0, le=1.0, description="Detection confidence score")
    estimated_volume_m3: float = Field(
        ge=0.0, description="Estimated waste volume in cubic meters"
    )
    severity_score: float = Field(
        ge=0.0, le=10.0, description="Severity score from 0 (minor) to 10 (critical)"
    )
    detected_tags: List[str] = Field(
        default_factory=list, description="Specific identified waste items/hazards"
    )
    recommended_action: str = Field(description="Recommended collection action")
    is_fallback: bool = Field(
        default=False, description="True if computed via heuristic fallback engine"
    )
