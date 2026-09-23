"""
Notifications API Endpoints
SRS FR-5.7, §9.4
"""

from fastapi import APIRouter, HTTPException, Query
from backend.database.connection import get_db, transaction
from backend.services.notification_service import (
    get_user_notifications,
    mark_notification_read,
)

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("")
def list_notifications(user_id: int = Query(..., description="ID of recipient user")):
    with get_db() as conn:
        return get_user_notifications(conn, user_id=user_id)


@router.patch("/{notification_id}/read")
def mark_read(notification_id: int, user_id: int = Query(...)):
    with transaction() as conn:
        success = mark_notification_read(conn, notification_id=notification_id, user_id=user_id)
        if not success:
            raise HTTPException(status_code=404, detail="Notification not found")
        return {"success": True, "message": "Marked as read"}
