"""
Booking Logic API Endpoints
Exposes backend/services/booking_logic.py under /api/logic.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel

from backend.database.connection import get_db
from backend.services.booking_logic import (
    build_approval_queue,
    expire_stale_bookings,
    get_day_availability,
    modify_booking,
    process_notification_queue,
)

router = APIRouter(prefix="/api/logic", tags=["Booking Logic"])


class ModifyRequest(BaseModel):
    user_id: int
    resource_id: int
    booking_date: str
    start_slot_id: int
    end_slot_id: int


@router.get("/availability/{resource_id}")
def availability(resource_id: int, date: str):
    with get_db() as conn:
        return {"resource_id": resource_id, "date": date, "slots": get_day_availability(conn, resource_id, date)}


@router.get("/approval-queue")
def approval_queue():
    with get_db() as conn:
        pq = build_approval_queue(conn)
        return {"count": len(pq), "queue": pq.ordered()}


@router.post("/bookings/{booking_id}/modify")
def modify(booking_id: int, req: ModifyRequest, request: Request):
    client_ip = request.client.host if request.client else None
    return modify_booking(
        booking_id, req.user_id, req.resource_id, req.booking_date,
        req.start_slot_id, req.end_slot_id, client_ip,
    )


@router.post("/expire")
def expire():
    return expire_stale_bookings()


@router.post("/notifications/process")
def process_notifications():
    return process_notification_queue()
