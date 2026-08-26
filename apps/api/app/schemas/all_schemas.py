"""
WasteWise AI — Pydantic Schemas

Strict input/output schemas for all API endpoints.
Implements system_guide.md §3: dedicated schemas per direction (Create, Read, Update).
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer

from app.models.entities import (
    IncidentStatus,
    PriorityLevel,
    UserRole,
    VehicleStatus,
    WasteCategory,
)


def _serialize_utc_iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat()


# ---------------------------------------------------------------------------
# Auth & User Schemas
# ---------------------------------------------------------------------------


import re
from pydantic import field_validator

def normalize_indian_phone_number(val: Optional[str]) -> str:
    """
    Validate and normalize Indian phone numbers.
    Accepts formats: +91 9876543210, 9876543210, +919876543210, 98765 43210.
    Normalizes to +91XXXXXXXXXX format.
    """
    if not val or not str(val).strip():
        raise ValueError("Phone number is required.")

    cleaned = str(val).strip()
    digits = re.sub(r"\D", "", cleaned)

    if len(digits) == 10:
        if not digits[0] in "6789":
            raise ValueError("Enter a valid 10-digit Indian mobile number.")
        return f"+91{digits}"
    elif len(digits) == 12 and digits.startswith("91"):
        mobile_digits = digits[2:]
        if not mobile_digits[0] in "6789":
            raise ValueError("Enter a valid 10-digit Indian mobile number.")
        return f"+91{mobile_digits}"
    else:
        raise ValueError("Enter a valid 10-digit Indian mobile number.")


def validate_password_strength(password: str) -> str:
    """
    Validates that the password satisfies municipal security requirements:
    - 8+ characters
    - At least 1 uppercase letter
    - At least 1 lowercase letter
    - At least 1 number
    - At least 1 special character
    """
    if not password or len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least 1 uppercase letter.")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least 1 lowercase letter.")
    if not re.search(r"[0-9]", password):
        raise ValueError("Password must contain at least 1 number.")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>\-_+=\[\]\\/'`~;]", password):
        raise ValueError("Password must contain at least 1 special character.")
    return password


class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=255)
    phone_number: str = Field(..., min_length=10, max_length=30)
    role: UserRole = UserRole.CITIZEN

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: Optional[str]) -> str:
        if v and isinstance(v, str):
            return v.strip().lower()
        return str(v) if v is not None else ""

    @field_validator("phone_number", mode="before")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> str:
        return normalize_indian_phone_number(v)

    @field_validator("password")
    @classmethod
    def validate_pwd(cls, v: str) -> str:
        return validate_password_strength(v)


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: Optional[str]) -> str:
        if v and isinstance(v, str):
            return v.strip().lower()
        return str(v) if v is not None else ""


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

    @field_serializer("created_at")
    def serialize_created_at(self, dt: datetime) -> str:
        return _serialize_utc_iso(dt) or ""


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
    driver_name: Optional[str] = None
    driver_email: Optional[str] = None
    driver_phone: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at", check_fields=False)
    def serialize_vehicle_dt(self, dt: datetime) -> str:
        return _serialize_utc_iso(dt) or ""


class AvailableDriverVehicleRead(BaseModel):
    vehicle_id: uuid.UUID
    plate_number: str
    vehicle_type: str
    capacity_kg: float
    current_load_kg: float
    status: VehicleStatus
    driver_id: Optional[uuid.UUID] = None
    driver_name: Optional[str] = None
    driver_email: Optional[str] = None
    driver_phone: Optional[str] = None


# ---------------------------------------------------------------------------
# Report Schemas
# ---------------------------------------------------------------------------


class ReportCreate(BaseModel):
    description: Optional[str] = Field(None, max_length=2000)
    category: Optional[str] = Field(None, max_length=50)
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    estimated_volume_m3: Optional[float] = Field(None, ge=0.0)
    severity_score: Optional[float] = Field(None, ge=0.0, le=10.0)
    detected_tags: List[str] = Field(default_factory=list)
    recommended_action: Optional[str] = Field(None, max_length=500)
    image_urls: List[str] = Field(default_factory=list, max_length=5)
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    address_text: Optional[str] = Field(None, max_length=500)
    is_fallback: Optional[bool] = False


class ReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    incident_id: Optional[uuid.UUID] = None
    category: Optional[str] = None
    confidence: Optional[float] = None
    estimated_volume_m3: Optional[float] = None
    severity_score: Optional[float] = None
    detected_tags: List[str] = Field(default_factory=list)
    recommended_action: Optional[str] = None
    description: Optional[str] = None
    image_urls: List[str] = Field(default_factory=list)
    latitude: float
    longitude: float
    address_text: Optional[str] = None
    status: IncidentStatus
    priority: Optional[PriorityLevel] = None
    created_at: datetime

    @field_serializer("created_at")
    def serialize_report_dt(self, dt: datetime) -> str:
        return _serialize_utc_iso(dt) or ""


class ReportUpdate(BaseModel):
    status: Optional[IncidentStatus] = None
    officer_notes: Optional[str] = Field(None, max_length=1000)
    assigned_vehicle_id: Optional[uuid.UUID] = None



# ---------------------------------------------------------------------------
# Incident Schemas
# ---------------------------------------------------------------------------


class IncidentCreate(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: Optional[str] = None
    category: WasteCategory = WasteCategory.MIXED
    priority: PriorityLevel = PriorityLevel.P3
    status: IncidentStatus = IncidentStatus.REPORTED
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    zone_id: Optional[str] = None
    estimated_volume_m3: Optional[float] = None
    confidence: Optional[float] = None
    severity_score: Optional[float] = None
    detected_tags: List[str] = Field(default_factory=list)
    recommended_action: Optional[str] = None
    address_text: Optional[str] = None
    image_urls: List[str] = Field(default_factory=list)


class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[PriorityLevel] = None
    status: Optional[IncidentStatus] = None
    assigned_vehicle_id: Optional[uuid.UUID] = None
    assigned_driver_id: Optional[uuid.UUID] = None
    assigned_at: Optional[datetime] = None
    assigned_by_id: Optional[uuid.UUID] = None
    estimated_volume_m3: Optional[float] = None
    severity_score: Optional[float] = None
    recommended_action: Optional[str] = None


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
    confidence: Optional[float] = None
    severity_score: Optional[float] = None
    detected_tags: List[str] = Field(default_factory=list)
    recommended_action: Optional[str] = None
    address_text: Optional[str] = None
    image_urls: List[str] = Field(default_factory=list)
    report_count: int
    assigned_vehicle_id: Optional[uuid.UUID] = None
    assigned_driver_id: Optional[uuid.UUID] = None
    assigned_at: Optional[datetime] = None
    assigned_by_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at", "assigned_at", check_fields=False)
    def serialize_incident_dt(self, dt: Optional[datetime]) -> Optional[str]:
        return _serialize_utc_iso(dt)


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
    priority: Optional[str] = None
    incident_id: Optional[uuid.UUID] = None
    vehicle_id: Optional[uuid.UUID] = None
    recipient_role: Optional[str] = None
    action_url: Optional[str] = None
    is_read: bool
    read_at: Optional[datetime] = None
    metadata_json: Optional[dict] = None
    created_at: datetime
    incident_code: Optional[str] = None

    @field_serializer("created_at")
    def serialize_notification_dt(self, dt: datetime) -> str:
        return _serialize_utc_iso(dt) or ""

    @field_serializer("read_at")
    def serialize_read_at_dt(self, dt: Optional[datetime]) -> Optional[str]:
        return _serialize_utc_iso(dt) if dt else None


class NotificationUnreadCountResponse(BaseModel):
    count: int


class NotificationMarkReadRequest(BaseModel):
    notification_id: Optional[uuid.UUID] = None


class NotificationListResponse(BaseModel):
    unread_count: int
    total_count: int
    items: List[NotificationRead]


class WasteAnalysisResult(BaseModel):
    analysis_id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        description="Unique trace ID for this specific image analysis request",
    )
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
    provider_used: str = Field(
        default="fallback",
        description="Provider that executed the inference ('gemini' or 'fallback')",
    )
    image_url: Optional[str] = Field(
        default=None, description="Persisted Supabase Storage public URL"
    )
    storage_path: Optional[str] = Field(
        default=None, description="Persisted Supabase Storage object path"
    )


# ---------------------------------------------------------------------------
# Driver & Proof Schemas
# ---------------------------------------------------------------------------


class DriverLocationCreate(BaseModel):
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    accuracy: Optional[float] = None
    heading: Optional[float] = None
    speed: Optional[float] = None


class DriverLocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    driver_id: uuid.UUID
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    heading: Optional[float] = None
    speed: Optional[float] = None
    recorded_at: datetime

    @field_serializer("recorded_at")
    def serialize_recorded_at(self, dt: datetime) -> str:
        return _serialize_utc_iso(dt) or ""


class CollectionProofRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    incident_id: uuid.UUID
    driver_id: uuid.UUID
    image_url: str
    storage_path: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    captured_at: Optional[datetime] = None
    uploaded_at: datetime
    notes: Optional[str] = None
    verification_status: str

    @field_serializer("captured_at", "uploaded_at", check_fields=False)
    def serialize_proof_dt(self, dt: Optional[datetime]) -> Optional[str]:
        return _serialize_utc_iso(dt)


class DriverAssignmentRead(BaseModel):
    incident_id: uuid.UUID
    incident_code: str
    title: str
    description: Optional[str] = None
    priority: PriorityLevel
    category: WasteCategory
    severity_score: Optional[float] = None
    estimated_volume_m3: Optional[float] = None
    volume_source: str = "AI_ESTIMATE"
    volume_confidence: float = 0.90
    report_count: int = 1
    latitude: float
    longitude: float
    address: Optional[str] = None
    status: IncidentStatus
    assigned_at: datetime
    created_at: datetime
    updated_at: datetime
    sla_minutes_left: int
    sequence: int
    vehicle_plate: Optional[str] = None
    vehicle_capacity_kg: Optional[float] = None
    vehicle_current_load_kg: Optional[float] = None
    primary_image_urls: List[str] = Field(default_factory=list)
    cluster_image_urls: List[str] = Field(default_factory=list)
    citizen_image_urls: List[str] = Field(default_factory=list)
    proof_image_urls: List[str] = Field(default_factory=list)
    citizen_name: Optional[str] = None
    citizen_phone: Optional[str] = None

    @field_serializer("assigned_at", "created_at", "updated_at", check_fields=False)
    def serialize_assignment_dt(self, dt: datetime) -> str:
        return _serialize_utc_iso(dt) or ""


class IncidentCompleteRequest(BaseModel):
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    notes: Optional[str] = None


class DriverExecutionDriverInfo(BaseModel):
    id: uuid.UUID
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    vehicle_id: Optional[uuid.UUID] = None
    vehicle_plate: Optional[str] = None
    vehicle_type: Optional[str] = None


class DriverExecutionAssignmentInfo(BaseModel):
    status: str
    priority: str
    assigned_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    elapsed_minutes: Optional[int] = None

    @field_serializer("assigned_at", "started_at", "completed_at", check_fields=False)
    def serialize_dates(self, dt: Optional[datetime]) -> Optional[str]:
        return _serialize_utc_iso(dt)


class DriverExecutionProofInfo(BaseModel):
    id: uuid.UUID
    image_url: str
    storage_path: str
    captured_at: Optional[datetime] = None
    uploaded_at: datetime
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    distance_meters: Optional[float] = None
    location_verified: bool = True
    verification_status: str
    notes: Optional[str] = None

    @field_serializer("captured_at", "uploaded_at", check_fields=False)
    def serialize_dates(self, dt: Optional[datetime]) -> Optional[str]:
        return _serialize_utc_iso(dt)


class ExecutionTimelineMilestone(BaseModel):
    event: str
    timestamp: datetime
    actor: str
    notes: Optional[str] = None

    @field_serializer("timestamp", check_fields=False)
    def serialize_dates(self, dt: datetime) -> str:
        return _serialize_utc_iso(dt) or ""


class DriverExecutionResponse(BaseModel):
    incident_id: uuid.UUID
    incident_code: str
    title: str
    status: str
    priority: str
    category: str
    latitude: float
    longitude: float
    address: Optional[str] = None
    driver: Optional[DriverExecutionDriverInfo] = None
    assignment: DriverExecutionAssignmentInfo
    citizen_evidence_urls: List[str] = Field(default_factory=list)
    proof: Optional[DriverExecutionProofInfo] = None
    timeline: List[ExecutionTimelineMilestone] = Field(default_factory=list)


class OfficerVerifyProofRequest(BaseModel):
    notes: Optional[str] = None


class OfficerRejectProofRequest(BaseModel):
    reason: str
    notes: Optional[str] = None
