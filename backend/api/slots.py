"""
Time Slots API Endpoints
SRS §1.3, OI-2, DB Schema §10.3
"""

from fastapi import APIRouter
from backend.database.connection import get_db

router = APIRouter(prefix="/api/slots", tags=["Time Slots"])


@router.get("")
def list_time_slots():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT slot_id, slot_code, slot_name, start_time, end_time, slot_order,
                   duration_minutes, is_break, is_active
            FROM time_slots
            ORDER BY slot_order ASC
            """
        )
        return [dict(r) for r in cur.fetchall()]
