"""
WasteWise AI — Notifications Router
Production-grade notification API strictly isolated per authenticated user session.
Provides unread counters, notification feeds, and read-state management.
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import TokenPayload, get_current_user
from app.models.entities import Notification
from app.schemas.all_schemas import (
    NotificationListResponse,
    NotificationRead,
    NotificationUnreadCountResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    unread_only: bool = Query(
        default=False, description="Filter only unread notifications"
    ),
    limit: int = Query(
        default=50, ge=1, le=100, description="Max number of items to return"
    ),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Retrieve notification history for the authenticated user.
    Strictly filters by authenticated user_id extracted from JWT token.
    """
    user_uuid = uuid.UUID(current_user.sub)

    # 1. Unread count query
    unread_stmt = select(func.count(Notification.id)).where(
        Notification.user_id == user_uuid, Notification.is_read.is_(False)
    )
    unread_res = await db.execute(unread_stmt)
    unread_count = unread_res.scalar() or 0

    # 2. Main query
    base_stmt = select(Notification).where(Notification.user_id == user_uuid)
    if unread_only:
        base_stmt = base_stmt.where(Notification.is_read.is_(False))

    # Total matching count
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    count_res = await db.execute(count_stmt)
    total_count = count_res.scalar() or 0

    # Fetch items sorted newest first
    items_stmt = (
        base_stmt.order_by(desc(Notification.created_at)).offset(offset).limit(limit)
    )
    items_res = await db.execute(items_stmt)
    notifications = items_res.scalars().all()

    # Enrich with incident_code
    items: list[NotificationRead] = []
    for n in notifications:
        inc_code = f"WW-{str(n.incident_id)[:8].upper()}" if n.incident_id else None
        item_dict = {
            "id": n.id,
            "user_id": n.user_id,
            "title": n.title,
            "message": n.message,
            "notification_type": n.notification_type,
            "priority": n.priority,
            "incident_id": n.incident_id,
            "vehicle_id": n.vehicle_id,
            "recipient_role": n.recipient_role,
            "action_url": n.action_url,
            "is_read": n.is_read,
            "read_at": n.read_at,
            "metadata_json": n.metadata_json or {},
            "created_at": n.created_at,
            "incident_code": inc_code,
        }
        items.append(NotificationRead(**item_dict))

    return NotificationListResponse(
        unread_count=unread_count,
        total_count=total_count,
        items=items,
    )


@router.get("/unread-count", response_model=NotificationUnreadCountResponse)
async def get_unread_notification_count(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Quick count of unread notifications for badge rendering.
    """
    user_uuid = uuid.UUID(current_user.sub)
    stmt = select(func.count(Notification.id)).where(
        Notification.user_id == user_uuid, Notification.is_read.is_(False)
    )
    res = await db.execute(stmt)
    count = res.scalar() or 0
    return NotificationUnreadCountResponse(count=count)


@router.patch("/{notification_id}/read", response_model=NotificationRead)
async def mark_notification_as_read(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Mark an individual notification as read.
    Validates ownership to ensure Driver A cannot alter Driver B's notification state.
    """
    user_uuid = uuid.UUID(current_user.sub)

    stmt = select(Notification).where(
        Notification.id == notification_id,
        Notification.user_id == user_uuid,
    )
    res = await db.execute(stmt)
    notif = res.scalar_one_or_none()

    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found or access unauthorized",
        )

    if not notif.is_read:
        notif.is_read = True
        notif.read_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(notif)

    inc_code = f"WW-{str(notif.incident_id)[:8].upper()}" if notif.incident_id else None
    return NotificationRead(
        id=notif.id,
        user_id=notif.user_id,
        title=notif.title,
        message=notif.message,
        notification_type=notif.notification_type,
        priority=notif.priority,
        incident_id=notif.incident_id,
        vehicle_id=notif.vehicle_id,
        recipient_role=notif.recipient_role,
        action_url=notif.action_url,
        is_read=notif.is_read,
        read_at=notif.read_at,
        metadata_json=notif.metadata_json or {},
        created_at=notif.created_at,
        incident_code=inc_code,
    )


@router.post("/read-all")
@router.patch("/read-all")
async def mark_all_notifications_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Mark all unread notifications for the authenticated user as read.
    """
    user_uuid = uuid.UUID(current_user.sub)
    now = datetime.now(timezone.utc)

    stmt = (
        update(Notification)
        .where(Notification.user_id == user_uuid, Notification.is_read.is_(False))
        .values(is_read=True, read_at=now)
    )
    res = await db.execute(stmt)
    await db.commit()

    return {
        "status": "success",
        "marked_count": res.rowcount,
        "read_at": now.isoformat(),
    }
