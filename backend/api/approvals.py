"""
Approval & Priority Queue API Endpoints
SRS FR-4.8, FR-4.9, FR-5.1 – FR-5.6
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.database.connection import get_db
from backend.services.approval_service import (
    approve_booking,
    deny_booking,
    get_pending_approvals,
    preempt_booking,
)

router = APIRouter(prefix="/api/approvals", tags=["Approvals & Priority Queue"])


class ApprovalActionRequest(BaseModel):
    admin_user_id: int
    note: Optional[str] = None


class DenialActionRequest(BaseModel):
    admin_user_id: int
    reason: str
    note: Optional[str] = None


class PreemptionActionRequest(BaseModel):
    admin_user_id: int
    reason: str


@router.get("/queue")
def list_approval_queue():
    """Returns the pending bookings ordered by the Priority Queue."""
    with get_db() as conn:
        return get_pending_approvals(conn)


@router.post("/{booking_id}/approve")
def approve(booking_id: int, req: ApprovalActionRequest, request: Request):
    client_ip = request.client.host if request.client else None
    res = approve_booking(
        booking_id=booking_id,
        admin_user_id=req.admin_user_id,
        note=req.note,
        client_ip=client_ip,
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res


@router.post("/{booking_id}/deny")
def deny(booking_id: int, req: DenialActionRequest, request: Request):
    client_ip = request.client.host if request.client else None
    res = deny_booking(
        booking_id=booking_id,
        admin_user_id=req.admin_user_id,
        reason=req.reason,
        note=req.note,
        client_ip=client_ip,
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res


@router.post("/{booking_id}/preempt")
def preempt(booking_id: int, req: PreemptionActionRequest, request: Request):
    client_ip = request.client.host if request.client else None
    res = preempt_booking(
        booking_id=booking_id,
        admin_user_id=req.admin_user_id,
        reason=req.reason,
        client_ip=client_ip,
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res
