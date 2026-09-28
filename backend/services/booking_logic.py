"""
Booking Logic Module
Fills the gaps from "Functional Design & Business Logic" that booking_service.py
does not cover:
  1. Half-open interval overlap check (with optional cleanup buffer)
  2. Priority Queue (heapq) for Admin approvals
  3. FIFO Notification Queue (deque) with retry for FAILED notifications
  4. Booking modification that keeps the original booking if the new slot fails
  5. Auto-release (EXPIRE) of stale bookings with an explicit rule
  6. Per-resource daily slot availability (Available / Booked)

See LOGIC.md at the project root for an explanation of every concept used here.
"""

import datetime
import heapq
import sqlite3
from collections import deque
from typing import Any, Dict, List, Optional

from backend.database.connection import get_db, transaction
from backend.services.audit_service import log_audit_event
from backend.services.booking_service import check_slot_contiguity_and_breaks
from backend.services.concurrency import AdvisoryMutex
from backend.services.notification_service import create_notification

MAX_NOTIFICATION_RETRIES = 3


# ------------------------------------------------------------
# 1. Half-open interval overlap  [start, end)
# ------------------------------------------------------------

def _to_minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")[:2]
    return int(h) * 60 + int(m)


def intervals_overlap(a_start: str, a_end: str, b_start: str, b_end: str, buffer_minutes: int = 0) -> bool:
    """
    Two half-open intervals [a_start, a_end) and [b_start, b_end) overlap
    when a_start < b_end AND b_start < a_end.
    9:00-10:00 and 10:00-11:00 do NOT overlap.
    buffer_minutes extends each booking's end (cleanup/turnaround time).
    """
    a_s, a_e = _to_minutes(a_start), _to_minutes(a_end) + buffer_minutes
    b_s, b_e = _to_minutes(b_start), _to_minutes(b_end) + buffer_minutes
    return a_s < b_e and b_s < a_e


# ------------------------------------------------------------
# 2. Priority Queue for Admin approvals
# ------------------------------------------------------------

class ApprovalPriorityQueue:
    """
    Min-heap ordered by (priority_rank, requested_at, booking_id).
    Lower rank = higher priority; request time is the tie-breaker.
    """

    def __init__(self):
        self._heap: List[tuple] = []

    def push(self, booking: Dict[str, Any]):
        key = (booking["priority_rank"], booking["requested_at"], booking["booking_id"])
        heapq.heappush(self._heap, (key, booking))

    def pop(self) -> Optional[Dict[str, Any]]:
        return heapq.heappop(self._heap)[1] if self._heap else None

    def __len__(self):
        return len(self._heap)

    def ordered(self) -> List[Dict[str, Any]]:
        return [item[1] for item in sorted(self._heap, key=lambda x: x[0])]


def build_approval_queue(conn: sqlite3.Connection) -> ApprovalPriorityQueue:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT b.booking_id, b.booking_reference, b.priority_rank, b.requested_at,
               b.booking_date, b.start_slot_id, b.end_slot_id, b.purpose,
               b.expected_headcount, u.full_name AS requester_name,
               res.room_code, res.resource_type, res.capacity
        FROM bookings b
        JOIN users u ON u.user_id = b.requested_by_user_id
        JOIN resources res ON res.resource_id = b.resource_id
        WHERE b.status = 'PENDING'
        """
    )
    pq = ApprovalPriorityQueue()
    for row in cur.fetchall():
        pq.push(dict(row))
    return pq


# ------------------------------------------------------------
# 3. FIFO Notification Queue with retry
# ------------------------------------------------------------

def _deliver(notification: Dict[str, Any]) -> bool:
    """
    Delivery hook. In-app notifications are "delivered" once stored, so this
    always succeeds. Replace with an email/SMS call to add a real channel.
    """
    return True


def process_notification_queue() -> Dict[str, int]:
    """
    Loads PENDING and FAILED notifications into a FIFO queue (oldest first)
    and tries to deliver each one. Failures increment retry_count; after
    MAX_NOTIFICATION_RETRIES they stay FAILED and are no longer picked up.
    """
    sent = failed = 0
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT notification_id, recipient_user_id, title, message, retry_count
            FROM notifications
            WHERE delivery_status IN ('PENDING', 'FAILED') AND retry_count < ?
            ORDER BY created_at ASC, notification_id ASC
            """,
            (MAX_NOTIFICATION_RETRIES,),
        )
        queue = deque(dict(r) for r in cur.fetchall())

        while queue:
            n = queue.popleft()
            if _deliver(n):
                cur.execute(
                    "UPDATE notifications SET delivery_status = 'SENT', sent_at = datetime('now', 'localtime') WHERE notification_id = ?",
                    (n["notification_id"],),
                )
                sent += 1
            else:
                cur.execute(
                    "UPDATE notifications SET delivery_status = 'FAILED', retry_count = retry_count + 1 WHERE notification_id = ?",
                    (n["notification_id"],),
                )
                failed += 1
    return {"sent": sent, "failed": failed}


# ------------------------------------------------------------
# 4. Booking modification (original stays intact on failure)
# ------------------------------------------------------------

def modify_booking(
    booking_id: int,
    user_id: int,
    new_resource_id: int,
    new_date: str,
    new_start_slot_id: int,
    new_end_slot_id: int,
    client_ip: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Moves an existing PENDING/APPROVED booking to a new resource/date/slot.
    Runs every check again inside one transaction. Any failure rolls back,
    so the original booking is never lost.
    """
    if new_end_slot_id < new_start_slot_id:
        return {"success": False, "code": "INVALID_RANGE", "message": "End slot must be at or after start slot."}
    try:
        req_date = datetime.date.fromisoformat(new_date)
    except ValueError:
        return {"success": False, "code": "INVALID_DATE", "message": "Invalid date format. Use YYYY-MM-DD."}
    if req_date < datetime.date.today():
        return {"success": False, "code": "PAST_DATE", "message": "Cannot move a booking into the past."}

    try:
        with AdvisoryMutex(new_resource_id, new_date):
            with transaction() as conn:
                cur = conn.cursor()

                # Authorization
                cur.execute(
                    """
                    SELECT b.*, r.role_code
                    FROM bookings b
                    JOIN users u ON u.user_id = ?
                    JOIN roles r ON r.role_id = u.role_id
                    WHERE b.booking_id = ?
                    """,
                    (user_id, booking_id),
                )
                bk = cur.fetchone()
                if not bk:
                    return {"success": False, "code": "NOT_FOUND", "message": "Booking not found."}
                if bk["requested_by_user_id"] != user_id and bk["role_code"] != "ADMIN":
                    return {"success": False, "code": "UNAUTHORIZED", "message": "You can only modify your own bookings."}
                if bk["status"] not in ("PENDING", "APPROVED"):
                    return {"success": False, "code": "INVALID_STATUS", "message": f"Cannot modify a {bk['status']} booking."}

                # Resource eligibility + capacity
                cur.execute("SELECT room_code, capacity, status FROM resources WHERE resource_id = ?", (new_resource_id,))
                res = cur.fetchone()
                if not res or res["status"] != "ACTIVE":
                    return {"success": False, "code": "RESOURCE_UNAVAILABLE", "message": "Resource is not active."}
                if bk["expected_headcount"] and res["capacity"] and bk["expected_headcount"] > res["capacity"]:
                    return {"success": False, "code": "CAPACITY_EXCEEDED", "message": "Headcount exceeds room capacity."}

                valid, err = check_slot_contiguity_and_breaks(conn, new_start_slot_id, new_end_slot_id)
                if not valid:
                    return {"success": False, "code": "INVALID_SLOT", "message": err}

                # Conflict check, ignoring this booking's own slots
                cur.execute(
                    """
                    SELECT COUNT(*) AS n FROM booking_schedule
                    WHERE resource_id = ? AND schedule_date = ?
                      AND slot_id BETWEEN ? AND ?
                      AND occupancy_state = 'ACTIVE'
                      AND (booking_id IS NULL OR booking_id != ?)
                    """,
                    (new_resource_id, new_date, new_start_slot_id, new_end_slot_id, booking_id),
                )
                if cur.fetchone()["n"] > 0:
                    return {"success": False, "code": "SLOT_TAKEN",
                            "message": "This resource is no longer available for the selected time."}

                # Swap occupancy: drop old rows, insert new (unique index guards races)
                cur.execute("DELETE FROM booking_schedule WHERE booking_id = ?", (booking_id,))
                for slot_id in range(new_start_slot_id, new_end_slot_id + 1):
                    cur.execute(
                        "INSERT INTO booking_schedule (booking_id, resource_id, schedule_date, slot_id, occupancy_state) VALUES (?, ?, ?, ?, 'ACTIVE')",
                        (booking_id, new_resource_id, new_date, slot_id),
                    )

                cur.execute(
                    """
                    UPDATE bookings
                    SET resource_id = ?, booking_date = ?, start_slot_id = ?, end_slot_id = ?,
                        updated_at = datetime('now', 'localtime')
                    WHERE booking_id = ?
                    """,
                    (new_resource_id, new_date, new_start_slot_id, new_end_slot_id, booking_id),
                )

                old = {"resource_id": bk["resource_id"], "date": bk["booking_date"],
                       "start_slot_id": bk["start_slot_id"], "end_slot_id": bk["end_slot_id"]}
                new = {"resource_id": new_resource_id, "date": new_date,
                       "start_slot_id": new_start_slot_id, "end_slot_id": new_end_slot_id}
                log_audit_event(
                    conn, event_type="BOOKING_MODIFIED", event_category="BOOKING",
                    actor_user_id=user_id, entity_type="BOOKING", entity_id=str(booking_id),
                    previous_value=old, new_value=new, reason="Booking modified",
                    ip_address=client_ip,
                )
                create_notification(
                    conn, recipient_user_id=bk["requested_by_user_id"],
                    notification_type="BOOKING_MODIFIED", title="Booking Updated",
                    message=f"Booking {bk['booking_reference']} moved to {res['room_code']} on {new_date}.",
                    booking_id=booking_id,
                )
                return {"success": True, "message": f"Booking {bk['booking_reference']} updated."}
    except sqlite3.IntegrityError:
        return {"success": False, "code": "SLOT_TAKEN",
                "message": "This resource is no longer available for the selected time."}
    except TimeoutError as e:
        return {"success": False, "code": "LOCK_TIMEOUT", "message": str(e)}


# ------------------------------------------------------------
# 5. Auto-release of stale bookings
# ------------------------------------------------------------

def expire_stale_bookings() -> Dict[str, int]:
    """
    Explicit rule (no attendance data exists, so no physical no-show detection):
      - PENDING bookings whose start time has passed -> EXPIRED (never decided in time)
      - APPROVED bookings whose end time has passed  -> COMPLETED
    Both release their slots in booking_schedule.
    """
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    with transaction() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT b.booking_id FROM bookings b
            JOIN time_slots ts ON ts.slot_id = b.start_slot_id
            WHERE b.status = 'PENDING' AND (b.booking_date || ' ' || substr(ts.start_time, 1, 5)) < ?
            """,
            (now,),
        )
        expired = [r["booking_id"] for r in cur.fetchall()]

        cur.execute(
            """
            SELECT b.booking_id FROM bookings b
            JOIN time_slots ts ON ts.slot_id = b.end_slot_id
            WHERE b.status = 'APPROVED' AND (b.booking_date || ' ' || substr(ts.end_time, 1, 5)) < ?
            """,
            (now,),
        )
        completed = [r["booking_id"] for r in cur.fetchall()]

        for ids, new_status in ((expired, "EXPIRED"), (completed, "COMPLETED")):
            for bid in ids:
                cur.execute(
                    "UPDATE bookings SET status = ?, updated_at = datetime('now', 'localtime') WHERE booking_id = ?",
                    (new_status, bid),
                )
                cur.execute("UPDATE booking_schedule SET occupancy_state = 'RELEASED' WHERE booking_id = ?", (bid,))
                log_audit_event(
                    conn, event_type=f"BOOKING_{new_status}", event_category="BOOKING",
                    actor_user_id=None, entity_type="BOOKING", entity_id=str(bid),
                    new_value={"status": new_status}, reason="Auto-release by system rule",
                )
    return {"expired": len(expired), "completed": len(completed)}


# ------------------------------------------------------------
# 6. Daily availability for one resource
# ------------------------------------------------------------

def get_day_availability(conn: sqlite3.Connection, resource_id: int, date: str) -> List[Dict[str, Any]]:
    """Returns every active slot of the day marked Available / Booked / Break."""
    cur = conn.cursor()
    cur.execute(
        "SELECT slot_id, slot_code, start_time, end_time, is_break FROM time_slots WHERE is_active = 1 ORDER BY slot_order"
    )
    slots = cur.fetchall()
    cur.execute(
        "SELECT slot_id FROM booking_schedule WHERE resource_id = ? AND schedule_date = ? AND occupancy_state = 'ACTIVE'",
        (resource_id, date),
    )
    taken = {r["slot_id"] for r in cur.fetchall()}  # set -> O(1) lookup

    result = []
    for s in slots:
        status = "Break" if s["is_break"] else ("Booked" if s["slot_id"] in taken else "Available")
        result.append({**dict(s), "status": status})
    return result
