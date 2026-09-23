"""
Resource Master API Endpoints
SRS FR-2.1 – FR-2.3, FR-6.1 – FR-6.4
"""

import sqlite3
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.database.connection import get_db, transaction
from backend.services.audit_service import log_audit_event

router = APIRouter(prefix="/api/resources", tags=["Resources"])


class ResourceStatusUpdate(BaseModel):
    status: str  # 'ACTIVE', 'INACTIVE', 'UNDER_MAINTENANCE'
    admin_user_id: int


@router.get("")
def list_resources(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD to evaluate live availability"),
    slot_id: Optional[int] = Query(None, description="Time slot ID to evaluate availability"),
    resource_type: Optional[str] = Query(None, description="Lab or Classroom"),
    block: Optional[str] = Query(None, description="MB or AC"),
    has_machines: Optional[bool] = Query(None),
):
    with get_db() as conn:
        cur = conn.cursor()
        query = """
            SELECT r.resource_id, r.room_code, r.resource_type, r.capacity, r.status, r.description,
                   b.block_code, b.block_name,
                   l.has_machines, l.machine_count, l.os_installed, l.has_projector AS lab_projector, l.has_ac AS lab_ac,
                   c.seating_type, c.has_projector AS room_projector, c.has_smart_board, c.has_ac AS room_ac, c.board_type, c.is_exam_approved
            FROM resources r
            JOIN blocks b ON b.block_id = r.block_id
            LEFT JOIN laboratories l ON l.resource_id = r.resource_id
            LEFT JOIN classrooms c ON c.resource_id = r.resource_id
            WHERE 1=1
        """
        params = []
        if resource_type:
            query += " AND r.resource_type = ?"
            params.append(resource_type)
        if block:
            query += " AND b.block_code = ?"
            params.append(block)
        if has_machines is not None:
            query += " AND (l.has_machines = ? OR l.has_machines IS NULL)"
            params.append(1 if has_machines else 0)

        query += " ORDER BY r.resource_id ASC"
        cur.execute(query, tuple(params))
        rows = cur.fetchall()

        results = []
        for row in rows:
            res = {
                "resource_id": row["resource_id"],
                "room_code": row["room_code"],
                "resource_type": row["resource_type"],
                "block": row["block_code"],
                "block_name": row["block_name"],
                "capacity": row["capacity"],
                "status": row["status"],
                "description": row["description"],
                "has_machines": bool(row["has_machines"]) if row["has_machines"] is not None else False,
                "machine_count": row["machine_count"] or 0,
                "os_installed": row["os_installed"],
                "has_projector": bool(row["lab_projector"] or row["room_projector"]),
                "has_ac": bool(row["lab_ac"] or row["room_ac"]),
                "seating_type": row["seating_type"],
                "has_smart_board": bool(row["has_smart_board"]),
                "board_type": row["board_type"],
                "is_exam_approved": bool(row["is_exam_approved"]),
            }

            # Live availability determination (FR-2.2)
            if date:
                # Check occupancy on date
                slot_filter = "AND bs.slot_id = ?" if slot_id else ""
                check_params = [row["resource_id"], date]
                if slot_id:
                    check_params.append(slot_id)

                cur.execute(
                    f"""
                    SELECT b.status, b.purpose, b.booking_reference, u.full_name AS booked_by
                    FROM booking_schedule bs
                    JOIN bookings b ON b.booking_id = bs.booking_id
                    JOIN users u ON u.user_id = b.requested_by_user_id
                    WHERE bs.resource_id = ?
                      AND bs.schedule_date = ?
                      AND bs.occupancy_state = 'ACTIVE'
                      {slot_filter}
                    LIMIT 1
                    """,
                    tuple(check_params),
                )
                occ = cur.fetchone()
                if occ:
                    res["live_status"] = "BOOKED" if occ["status"] == "APPROVED" else "PENDING-REQUEST"
                    res["current_booking"] = {
                        "reference": occ["booking_reference"],
                        "purpose": occ["purpose"],
                        "booked_by": occ["booked_by"],
                    }
                else:
                    res["live_status"] = "AVAILABLE" if row["status"] == "ACTIVE" else "UNAVAILABLE"
            else:
                res["live_status"] = "AVAILABLE" if row["status"] == "ACTIVE" else "UNAVAILABLE"

            results.append(res)

        return results


@router.get("/{resource_id}")
def get_resource(resource_id: int):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT r.*, b.block_code, b.block_name,
                   l.has_machines, l.machine_count, l.os_installed, l.has_projector AS lab_proj, l.has_ac AS lab_ac,
                   c.seating_type, c.has_projector AS rm_proj, c.has_smart_board, c.has_ac AS rm_ac, c.board_type, c.is_exam_approved
            FROM resources r
            JOIN blocks b ON b.block_id = r.block_id
            LEFT JOIN laboratories l ON l.resource_id = r.resource_id
            LEFT JOIN classrooms c ON c.resource_id = r.resource_id
            WHERE r.resource_id = ?
            """,
            (resource_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Resource not found")

        # Get equipment
        cur.execute("SELECT * FROM resource_equipment WHERE resource_id = ?", (resource_id,))
        equipment = [dict(e) for e in cur.fetchall()]

        data = dict(row)
        data["equipment"] = equipment
        return data


@router.patch("/{resource_id}/status")
def update_resource_status(resource_id: int, payload: ResourceStatusUpdate):
    """Admin toggle of resource status (FR-6.2). Soft-status, no physical deletion."""
    with transaction() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT r.resource_id, r.room_code, r.status, u.role_id, ro.role_code
            FROM resources r
            JOIN users u ON u.user_id = ?
            JOIN roles ro ON ro.role_id = u.role_id
            WHERE r.resource_id = ?
            """,
            (payload.admin_user_id, resource_id),
        )
        row = cur.fetchone()
        if not row or row["role_code"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Only Admins may modify resource status")

        cur.execute(
            "UPDATE resources SET status = ?, updated_at = datetime('now', 'localtime') WHERE resource_id = ?",
            (payload.status, resource_id),
        )

        log_audit_event(
            conn,
            event_type="RESOURCE_UPDATED",
            event_category="RESOURCE",
            actor_user_id=payload.admin_user_id,
            entity_type="RESOURCE",
            entity_id=str(resource_id),
            previous_value={"status": row["status"]},
            new_value={"status": payload.status},
            reason=f"Status changed to {payload.status}",
        )

        return {"success": True, "message": f"Resource {row['room_code']} status set to {payload.status}"}
