"""
Audit Logs API Endpoints
SRS FR-8.1 – FR-8.6, DD-7 (Append-only)
"""

import io
import csv
from typing import Optional
from fastapi import APIRouter, Query, Response
from backend.database.connection import get_db

router = APIRouter(prefix="/api/audit-logs", tags=["Audit Logs"])


@router.get("")
def list_audit_logs(
    actor_user_id: Optional[int] = Query(None),
    event_type: Optional[str] = Query(None),
    event_category: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = 100,
):
    with get_db() as conn:
        cur = conn.cursor()
        query = """
            SELECT a.audit_id, a.event_type, a.event_category, a.actor_user_id,
                   a.actor_username, a.actor_role_code, a.entity_type, a.entity_id,
                   a.previous_value, a.new_value, a.reason, a.ip_address, a.is_successful,
                   a.created_at
            FROM audit_logs a
            WHERE 1=1
        """
        params = []
        if actor_user_id:
            query += " AND a.actor_user_id = ?"
            params.append(actor_user_id)
        if event_type:
            query += " AND a.event_type = ?"
            params.append(event_type)
        if event_category:
            query += " AND a.event_category = ?"
            params.append(event_category)
        if start_date:
            query += " AND a.created_at >= ?"
            params.append(start_date)
        if end_date:
            query += " AND a.created_at <= ?"
            params.append(end_date)

        query += " ORDER BY a.audit_id DESC LIMIT ?"
        params.append(limit)

        cur.execute(query, tuple(params))
        return [dict(r) for r in cur.fetchall()]


@router.get("/resource/{resource_id}")
def resource_audit_trail(resource_id: int):
    """SRS FR-8.3: Per-resource audit trail across all users."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT a.audit_id, a.event_type, a.actor_username, a.actor_role_code,
                   a.entity_type, a.entity_id, a.reason, a.created_at
            FROM audit_logs a
            WHERE (a.entity_type = 'RESOURCE' AND a.entity_id = ?)
               OR (a.entity_type = 'BOOKING' AND a.entity_id IN (
                   SELECT CAST(booking_id AS TEXT) FROM bookings WHERE resource_id = ?
               ))
            ORDER BY a.audit_id DESC
            """,
            (str(resource_id), resource_id),
        )
        return [dict(r) for r in cur.fetchall()]


@router.get("/export-csv")
def export_audit_csv():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT audit_id, event_type, event_category, actor_username, actor_role_code,
                   entity_type, entity_id, reason, is_successful, created_at
            FROM audit_logs
            ORDER BY audit_id DESC
            """
        )
        rows = [dict(r) for r in cur.fetchall()]
        if not rows:
            return Response(content="", media_type="text/csv")

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
        )
