"""
Booking API Endpoints
SRS FR-2.4 – FR-2.5, FR-3.1 – FR-3.10, FR-7.1 – FR-7.5
"""

import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from backend.database.connection import get_db
from backend.services.booking_service import (
    cancel_booking,
    submit_booking,
    submit_recurring_booking,
    suggest_alternatives,
)

router = APIRouter(prefix="/api/bookings", tags=["Bookings"])


class BookingSubmitRequest(BaseModel):
    user_id: int
    resource_id: int
    booking_date: str
    start_slot_id: int
    end_slot_id: int
    purpose: str
    booking_type: str = "ACADEMIC"
    expected_headcount: Optional[int] = None


class RecurringBookingRequest(BaseModel):
    user_id: int
    resource_id: int
    pattern: str  # 'DAILY', 'WEEKLY'
    series_start_date: str
    series_end_date: str
    start_slot_id: int
    end_slot_id: int
    purpose: str
    booking_type: str = "ACADEMIC"
    expected_headcount: Optional[int] = None
    days_of_week: Optional[List[str]] = None


class BookingCancelRequest(BaseModel):
    user_id: int
    reason: Optional[str] = None


@router.post("")
def create_booking(req: BookingSubmitRequest, request: Request):
    client_ip = request.client.host if request.client else None
    res = submit_booking(
        user_id=req.user_id,
        resource_id=req.resource_id,
        booking_date=req.booking_date,
        start_slot_id=req.start_slot_id,
        end_slot_id=req.end_slot_id,
        purpose=req.purpose,
        booking_type=req.booking_type,
        expected_headcount=req.expected_headcount,
        client_ip=client_ip,
    )
    if not res.get("success"):
        # Return 409 Conflict if slot is taken, or 400 Bad Request
        status_code = 409 if res.get("code") == "SLOT_TAKEN" else 400
        raise HTTPException(status_code=status_code, detail=res)
    return res


@router.post("/recurring")
def create_recurring_booking(req: RecurringBookingRequest, request: Request):
    client_ip = request.client.host if request.client else None
    res = submit_recurring_booking(
        user_id=req.user_id,
        resource_id=req.resource_id,
        pattern=req.pattern,
        series_start_date=req.series_start_date,
        series_end_date=req.series_end_date,
        start_slot_id=req.start_slot_id,
        end_slot_id=req.end_slot_id,
        purpose=req.purpose,
        booking_type=req.booking_type,
        expected_headcount=req.expected_headcount,
        days_of_week=req.days_of_week,
        client_ip=client_ip,
    )
    return res


@router.get("/alternatives")
def get_alternatives(
    resource_type: str,
    booking_date: str,
    start_slot_id: int,
    end_slot_id: int,
    exclude_resource_id: int,
    headcount: Optional[int] = None,
):
    with get_db() as conn:
        return suggest_alternatives(
            conn,
            resource_type=resource_type,
            booking_date=booking_date,
            start_slot_id=start_slot_id,
            end_slot_id=end_slot_id,
            exclude_resource_id=exclude_resource_id,
            required_capacity=headcount,
        )


@router.get("/calendar")
def get_calendar_occupancy(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    resource_id: Optional[int] = Query(None),
):
    """
    SRS FR-2.4 & FR-2.5:
    Returns occupancy grid blocks for calendar display with status, booked_by, and purpose.
    """
    if not end_date:
        end_date = start_date

    with get_db() as conn:
        cur = conn.cursor()
        query = """
            SELECT bs.schedule_id, bs.schedule_date, bs.slot_id, bs.occupancy_state,
                   b.booking_id, b.booking_reference, b.status, b.purpose, b.booking_type,
                   u.full_name AS booked_by,
                   r.resource_id, r.room_code, r.resource_type,
                   ts.slot_code, ts.slot_name, ts.start_time, ts.end_time
            FROM booking_schedule bs
            JOIN bookings b ON b.booking_id = bs.booking_id
            JOIN users u ON u.user_id = b.requested_by_user_id
            JOIN resources r ON r.resource_id = bs.resource_id
            JOIN time_slots ts ON ts.slot_id = bs.slot_id
            WHERE bs.schedule_date BETWEEN ? AND ?
              AND bs.occupancy_state = 'ACTIVE'
        """
        params = [start_date, end_date]
        if resource_id:
            query += " AND bs.resource_id = ?"
            params.append(resource_id)

        query += " ORDER BY bs.schedule_date ASC, ts.slot_order ASC"
        cur.execute(query, tuple(params))
        return [dict(r) for r in cur.fetchall()]


@router.get("/history")
def get_booking_history(
    user_id: Optional[int] = Query(None),
    role: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    resource_id: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """
    SRS FR-7.1 – FR-7.4:
    Returns booking history. Admins can view all; Faculty and Assistants view their own.
    """
    with get_db() as conn:
        cur = conn.cursor()
        query = """
            SELECT b.booking_id, b.booking_reference, b.resource_id, b.requested_by_user_id,
                   b.booking_date, b.start_slot_id, b.end_slot_id, b.purpose, b.booking_type,
                   b.expected_headcount, b.status, b.priority_rank, b.requested_at, b.decided_at,
                   b.decision_reason, b.decision_note, b.cancelled_at, b.cancellation_reason,
                   u.full_name AS requester_name, u.email AS requester_email,
                   ro.role_name AS requester_role,
                   r.room_code, r.resource_type,
                   ts_s.slot_code AS start_slot_code, ts_s.start_time,
                   ts_e.slot_code AS end_slot_code, ts_e.end_time,
                   appr.full_name AS approver_name
            FROM bookings b
            JOIN users u ON u.user_id = b.requested_by_user_id
            JOIN roles ro ON ro.role_id = u.role_id
            JOIN resources r ON r.resource_id = b.resource_id
            JOIN time_slots ts_s ON ts_s.slot_id = b.start_slot_id
            JOIN time_slots ts_e ON ts_e.slot_id = b.end_slot_id
            LEFT JOIN users appr ON appr.user_id = b.approved_by_user_id
            WHERE 1=1
        """
        params = []
        if user_id and role != "Admin":
            query += " AND b.requested_by_user_id = ?"
            params.append(user_id)
        if status:
            query += " AND b.status = ?"
            params.append(status)
        if resource_id:
            query += " AND b.resource_id = ?"
            params.append(resource_id)
        if start_date:
            query += " AND b.booking_date >= ?"
            params.append(start_date)
        if end_date:
            query += " AND b.booking_date <= ?"
            params.append(end_date)

        query += " ORDER BY b.requested_at DESC LIMIT 100"
        cur.execute(query, tuple(params))
        return [dict(row) for row in cur.fetchall()]


@router.post("/{booking_id}/cancel")
def cancel(booking_id: int, req: BookingCancelRequest, request: Request):
    client_ip = request.client.host if request.client else None
    res = cancel_booking(booking_id=booking_id, user_id=req.user_id, reason=req.reason, client_ip=client_ip)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res
