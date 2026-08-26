"""
WasteWise AI — Notification Service
Centralized service for creating, persisting, and broadcasting real-time notifications
for Drivers, Officers, Admins, and Citizens.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import (
    Incident,
    Notification,
    User,
    UserRole,
)
from app.ws.live_ws import ws_manager

logger = logging.getLogger(__name__)


class NotificationService:
    @staticmethod
    async def create_notification(
        db: AsyncSession,
        user_id: uuid.UUID,
        title: str,
        message: str,
        notification_type: str = "info",
        priority: Optional[str] = None,
        incident_id: Optional[uuid.UUID] = None,
        vehicle_id: Optional[uuid.UUID] = None,
        recipient_role: Optional[str] = None,
        action_url: Optional[str] = None,
        metadata_json: Optional[Dict[str, Any]] = None,
        broadcast: bool = True,
    ) -> Notification:
        """
        Create and persist a new notification in PostgreSQL, then broadcast via WebSockets.
        """
        now = datetime.now(timezone.utc)
        notif = Notification(
            user_id=user_id,
            title=title,
            message=message,
            notification_type=notification_type,
            priority=priority,
            incident_id=incident_id,
            vehicle_id=vehicle_id,
            recipient_role=recipient_role,
            action_url=action_url,
            is_read=False,
            created_at=now,
            metadata_json=metadata_json or {},
        )
        db.add(notif)
        await db.commit()
        await db.refresh(notif)

        if broadcast:
            incident_code = (
                f"WW-{str(incident_id)[:8].upper()}" if incident_id else None
            )
            event_payload = {
                "id": str(notif.id),
                "user_id": str(notif.user_id),
                "recipient_role": notif.recipient_role,
                "title": notif.title,
                "message": notif.message,
                "notification_type": notif.notification_type,
                "priority": notif.priority,
                "incident_id": str(notif.incident_id) if notif.incident_id else None,
                "incident_code": incident_code,
                "vehicle_id": str(notif.vehicle_id) if notif.vehicle_id else None,
                "action_url": notif.action_url,
                "is_read": notif.is_read,
                "created_at": notif.created_at.isoformat(),
                "metadata_json": notif.metadata_json,
            }
            try:
                await ws_manager.broadcast_event("NOTIFICATION_CREATED", event_payload)
            except Exception as e:
                logger.warning(f"Failed to broadcast notification WebSocket event: {e}")

        return notif

    @staticmethod
    async def get_active_officer_ids(db: AsyncSession) -> List[uuid.UUID]:
        """Retrieve user IDs for all active Officers and Admins."""
        stmt = select(User.id).where(
            User.role.in_(
                [
                    UserRole.OFFICER,
                    UserRole.ADMIN,
                    "officer",
                    "admin",
                    "OFFICER",
                    "ADMIN",
                ]
            ),
        )
        res = await db.execute(stmt)
        ids = list(res.scalars().all())
        if not ids:
            stmt2 = select(User.id).where(User.email.ilike("%officer%"))
            res2 = await db.execute(stmt2)
            ids = list(res2.scalars().all())
        return ids

    # ---------------------------------------------------------------------------
    # Driver Workflow Events
    # ---------------------------------------------------------------------------

    @staticmethod
    def _extract_priority_str(priority: Any) -> str:
        if priority is None:
            return "P2"
        return priority.value if hasattr(priority, "value") else str(priority)

    @staticmethod
    def _extract_category_str(category: Any) -> str:
        if category is None:
            return "mixed"
        return category.value if hasattr(category, "value") else str(category)

    @staticmethod
    async def notify_incident_assignment(
        db: AsyncSession,
        incident: Incident,
        driver_id: uuid.UUID,
        vehicle_plate: Optional[str] = None,
    ) -> Optional[Notification]:
        """
        Triggered when an incident is assigned to a driver.
        Handles P0/P1 emergency formatting vs normal priority assignment.
        """
        prio_str = NotificationService._extract_priority_str(incident.priority)
        cat_str = NotificationService._extract_category_str(incident.category)
        is_critical = prio_str in ("P0", "P1")
        inc_code = f"WW-{str(incident.id)[:8].upper()}"

        if is_critical:
            notif_type = "CRITICAL_INCIDENT"
            title = f"🚨 {prio_str} Critical Incident Assigned"
            message = (
                f"Immediate collection required for {inc_code} at {incident.address_text or 'Municipal Sector'}. "
                f"Volume: {incident.estimated_volume_m3 or 1.5:.1f} m³."
            )
        else:
            notif_type = "NEW_INCIDENT_ASSIGNED"
            title = "New Waste Incident Assigned"
            message = f"A new {prio_str} waste incident ({inc_code}) has been assigned to your route at {incident.address_text or 'Municipal Sector'}."

        meta = {
            "incident_code": inc_code,
            "priority": prio_str,
            "category": cat_str,
            "volume_m3": incident.estimated_volume_m3,
            "address": incident.address_text,
            "vehicle_plate": vehicle_plate,
        }

        return await NotificationService.create_notification(
            db=db,
            user_id=driver_id,
            title=title,
            message=message,
            notification_type=notif_type,
            priority=prio_str,
            incident_id=incident.id,
            vehicle_id=incident.assigned_vehicle_id,
            recipient_role=(
                UserRole.DRIVER.value
                if hasattr(UserRole.DRIVER, "value")
                else str(UserRole.DRIVER)
            ),
            action_url=f"/driver?incident={incident.id}",
            metadata_json=meta,
        )

    @staticmethod
    async def notify_route_updated(
        db: AsyncSession,
        driver_id: uuid.UUID,
        vehicle_id: Optional[uuid.UUID],
        stop_count: int,
        total_distance_km: float,
        total_eta_minutes: int,
        reason: Optional[str] = None,
    ) -> Notification:
        """
        Triggered when an optimized route recalculates or is reordered.
        """
        title = "Route Updated"
        msg = f"Your collection route has been optimized with {stop_count} stops (~{total_distance_km:.1f} km, ETA: {total_eta_minutes} min)."
        if reason:
            msg += f" Reason: {reason}"

        return await NotificationService.create_notification(
            db=db,
            user_id=driver_id,
            title=title,
            message=msg,
            notification_type="ROUTE_UPDATED",
            priority="P2",
            vehicle_id=vehicle_id,
            recipient_role=(
                UserRole.DRIVER.value
                if hasattr(UserRole.DRIVER, "value")
                else str(UserRole.DRIVER)
            ),
            action_url="/driver",
            metadata_json={
                "stop_count": stop_count,
                "total_distance_km": total_distance_km,
                "total_eta_minutes": total_eta_minutes,
                "reason": reason,
            },
        )

    @staticmethod
    async def notify_proof_verified(
        db: AsyncSession,
        driver_id: uuid.UUID,
        incident: Incident,
        notes: Optional[str] = None,
    ) -> Notification:
        """
        Triggered when Officer approves and marks collection proof verified.
        """
        inc_code = f"WW-{str(incident.id)[:8].upper()}"
        prio_str = NotificationService._extract_priority_str(incident.priority)
        title = "Collection Proof Verified"
        msg = f"Your collection proof for {inc_code} at {incident.address_text or 'site'} has been verified by the Municipal Officer."
        if notes:
            msg += f" Note: {notes}"

        return await NotificationService.create_notification(
            db=db,
            user_id=driver_id,
            title=title,
            message=msg,
            notification_type="PROOF_VERIFIED",
            priority=prio_str,
            incident_id=incident.id,
            vehicle_id=incident.assigned_vehicle_id,
            recipient_role=(
                UserRole.DRIVER.value
                if hasattr(UserRole.DRIVER, "value")
                else str(UserRole.DRIVER)
            ),
            action_url=f"/driver?incident={incident.id}",
            metadata_json={
                "incident_code": inc_code,
                "verification_status": "VERIFIED",
                "notes": notes,
            },
        )

    @staticmethod
    async def notify_proof_rejected(
        db: AsyncSession,
        driver_id: uuid.UUID,
        incident: Incident,
        reason: str,
        notes: Optional[str] = None,
    ) -> Notification:
        """
        Triggered when Officer rejects proof of work and requires re-collection or new photo.
        """
        inc_code = f"WW-{str(incident.id)[:8].upper()}"
        title = "Collection Proof Rejected"
        msg = f"Your collection proof for {inc_code} requires action: {reason}."
        if notes:
            msg += f" Details: {notes}"

        return await NotificationService.create_notification(
            db=db,
            user_id=driver_id,
            title=title,
            message=msg,
            notification_type="PROOF_REJECTED",
            priority="P1",
            incident_id=incident.id,
            vehicle_id=incident.assigned_vehicle_id,
            recipient_role=(
                UserRole.DRIVER.value
                if hasattr(UserRole.DRIVER, "value")
                else str(UserRole.DRIVER)
            ),
            action_url=f"/driver?incident={incident.id}&proof_action=retake",
            metadata_json={
                "incident_code": inc_code,
                "verification_status": "REJECTED",
                "reason": reason,
                "notes": notes,
            },
        )

    # ---------------------------------------------------------------------------
    # Officer & Admin Workflow Events
    # ---------------------------------------------------------------------------

    @staticmethod
    async def notify_collection_started(
        db: AsyncSession,
        incident: Incident,
        driver_name: str,
    ) -> None:
        """
        Triggered when Driver taps 'Start Collection'. Notifies Officers/Admins.
        """
        officer_ids = await NotificationService.get_active_officer_ids(db)
        inc_code = f"WW-{str(incident.id)[:8].upper()}"
        prio_str = NotificationService._extract_priority_str(incident.priority)
        title = "Driver Started Collection"
        msg = f"{driver_name} arrived and started collection at {incident.address_text or inc_code}."

        for officer_id in officer_ids:
            await NotificationService.create_notification(
                db=db,
                user_id=officer_id,
                title=title,
                message=msg,
                notification_type="COLLECTION_STARTED",
                priority=prio_str,
                incident_id=incident.id,
                vehicle_id=incident.assigned_vehicle_id,
                recipient_role=(
                    UserRole.OFFICER.value
                    if hasattr(UserRole.OFFICER, "value")
                    else str(UserRole.OFFICER)
                ),
                action_url=f"/officer?incident={incident.id}",
                metadata_json={
                    "incident_code": inc_code,
                    "driver_name": driver_name,
                },
            )

    @staticmethod
    async def notify_proof_submitted(
        db: AsyncSession,
        incident: Incident,
        driver_name: str,
        proof_url: str,
        distance_meters: Optional[float] = None,
    ) -> None:
        """
        Triggered when Driver uploads proof of work. Notifies Officers/Admins to verify.
        """
        officer_ids = await NotificationService.get_active_officer_ids(db)
        inc_code = f"WW-{str(incident.id)[:8].upper()}"
        prio_str = NotificationService._extract_priority_str(incident.priority)
        title = "Collection Proof Submitted"
        dist_str = (
            f" ({distance_meters:.0f}m from site)"
            if distance_meters is not None
            else ""
        )
        msg = f"New after-cleaning proof submitted by {driver_name} for {inc_code}{dist_str}. Review required."

        for officer_id in officer_ids:
            await NotificationService.create_notification(
                db=db,
                user_id=officer_id,
                title=title,
                message=msg,
                notification_type="PROOF_SUBMITTED",
                priority=prio_str,
                incident_id=incident.id,
                vehicle_id=incident.assigned_vehicle_id,
                recipient_role=(
                    UserRole.OFFICER.value
                    if hasattr(UserRole.OFFICER, "value")
                    else str(UserRole.OFFICER)
                ),
                action_url=f"/officer?incident={incident.id}&tab=verification",
                metadata_json={
                    "incident_code": inc_code,
                    "driver_name": driver_name,
                    "proof_url": proof_url,
                    "distance_meters": distance_meters,
                },
            )

    @staticmethod
    async def notify_collection_completed(
        db: AsyncSession,
        incident: Incident,
        driver_name: str,
    ) -> None:
        """
        Triggered when Driver finishes and marks collection complete.
        """
        officer_ids = await NotificationService.get_active_officer_ids(db)
        inc_code = f"WW-{str(incident.id)[:8].upper()}"
        prio_str = NotificationService._extract_priority_str(incident.priority)
        title = "Collection Completed"
        msg = (
            f"Waste collected at {incident.address_text or inc_code} by {driver_name}."
        )

        for officer_id in officer_ids:
            await NotificationService.create_notification(
                db=db,
                user_id=officer_id,
                title=title,
                message=msg,
                notification_type="COLLECTION_COMPLETED",
                priority=prio_str,
                incident_id=incident.id,
                vehicle_id=incident.assigned_vehicle_id,
                recipient_role=(
                    UserRole.OFFICER.value
                    if hasattr(UserRole.OFFICER, "value")
                    else str(UserRole.OFFICER)
                ),
                action_url=f"/officer?incident={incident.id}",
                metadata_json={
                    "incident_code": inc_code,
                    "driver_name": driver_name,
                },
            )
