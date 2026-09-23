"""
Approval & Priority Queue Service
Implements SRS FR-4.8, FR-4.9, FR-5.1 - FR-5.6, Functional Design & DB Schema v1.1.
Features:
- Materialized Priority Queue ordered by priority_rank ASC, requested_at ASC
- Atomic Admin approval with automatic denial of competing pending requests (SLOT_TAKEN)
- Atomic protection against concurrent admin decisions (preventing double decisions)
- Admin Preemption workflow for approved bookings
"""

import sqlite3
from typing import Any, Dict, List, Optional

from backend.database.connection import transaction
from backend.services.concurrency import AdvisoryMutex
from backend.services.audit_service import log_audit_event
from backend.services.notification_service import create_notification


def get_pending_approvals(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """
    Returns pending requests ordered by the institutional Priority Queue:
    priority_rank ASC (Faculty 1 > Lab Assistant 2), requested_at ASC.
    """
    cur = conn.cursor()
    cur.execute(
        """
        SELECT b.booking_id, b.booking_reference, b.resource_id, b.requested_by_user_id,
               b.booking_date, b.start_slot_id, b.end_slot_id, b.purpose, b.booking_type,
               b.expected_headcount, b.status, b.priority_rank, b.requested_at,
               u.full_name AS requester_name, u.email AS requester_email,
               r.role_code, r.role_name,
               res.room_code, res.resource_type, res.capacity,
               ts_s.slot_code AS start_slot_code, ts_s.start_time,
               ts_e.slot_code AS end_slot_code, ts_e.end_time
        FROM bookings b
        JOIN users u ON u.user_id = b.requested_by_user_id
        JOIN roles r ON r.role_id = u.role_id
        JOIN resources res ON res.resource_id = b.resource_id
        JOIN time_slots ts_s ON ts_s.slot_id = b.start_slot_id
        JOIN time_slots ts_e ON ts_e.slot_id = b.end_slot_id
        WHERE b.status = 'PENDING'
        ORDER BY b.priority_rank ASC, b.requested_at ASC
        """
    )
    return [dict(row) for row in cur.fetchall()]


def approve_booking(
    booking_id: int,
    admin_user_id: int,
    note: Optional[str] = None,
    client_ip: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Approves a PENDING booking.
    Crucial guarantee (SRS FR-4.9):
    Approving one request automatically transitions all other competing PENDING requests
    for that slot to DENIED with reason 'SLOT_TAKEN' within the SAME atomic transaction.
    """
    with transaction() as conn:
        cur = conn.cursor()

        # 1. Fetch booking & verify admin
        cur.execute(
            """
            SELECT b.booking_id, b.booking_reference, b.resource_id, b.requested_by_user_id,
                   b.booking_date, b.start_slot_id, b.end_slot_id, b.status,
                   res.room_code,
                   admin_u.role_id, admin_r.role_code AS admin_role
            FROM bookings b
            JOIN resources res ON res.resource_id = b.resource_id
            JOIN users admin_u ON admin_u.user_id = ?
            JOIN roles admin_r ON admin_r.role_id = admin_u.role_id
            WHERE b.booking_id = ?
            """,
            (admin_user_id, booking_id),
        )
        row = cur.fetchone()
        if not row:
            return {"success": False, "message": "Booking or Admin not found."}

        if row["admin_role"] != "ADMIN":
            return {"success": False, "message": "Only Admins may approve requests in the queue."}

        # Prevent concurrent admin double-decision race (Functional Design p.12)
        if row["status"] != "PENDING":
            return {
                "success": False,
                "message": f"This request has already been processed (status is {row['status']}).",
            }

        # 2. Re-check overlap against any APPROVED booking
        cur.execute(
            """
            SELECT bs.booking_id, b.booking_reference
            FROM booking_schedule bs
            JOIN bookings b ON b.booking_id = bs.booking_id
            WHERE bs.resource_id = ?
              AND bs.schedule_date = ?
              AND bs.slot_id BETWEEN ? AND ?
              AND bs.occupancy_state = 'ACTIVE'
              AND b.status = 'APPROVED'
              AND b.booking_id != ?
            """,
            (row["resource_id"], row["booking_date"], row["start_slot_id"], row["end_slot_id"], booking_id),
        )
        existing_approved = cur.fetchone()
        if existing_approved:
            return {
                "success": False,
                "message": f"Cannot approve: slot already occupied by approved booking {existing_approved['booking_reference']}.",
            }

        # 3. Transition this booking to APPROVED
        cur.execute(
            """
            UPDATE bookings
            SET status = 'APPROVED',
                approved_by_user_id = ?,
                decision_note = ?,
                decided_at = datetime('now', 'localtime'),
                updated_at = datetime('now', 'localtime')
            WHERE booking_id = ?
            """,
            (admin_user_id, note or "Approved by Admin", booking_id),
        )

        cur.execute(
            """
            INSERT INTO booking_approvals (
                booking_id, approver_user_id, decision, decision_reason, decided_at
            ) VALUES (?, ?, 'APPROVED', ?, datetime('now', 'localtime'))
            """,
            (booking_id, admin_user_id, note or "Approved by Admin"),
        )

        cur.execute(
            """
            INSERT INTO booking_status_history (
                booking_id, previous_status, new_status, changed_by_user_id, change_reason
            ) VALUES (?, 'PENDING', 'APPROVED', ?, ?)
            """,
            (booking_id, admin_user_id, note or "Approved by Admin"),
        )

        log_audit_event(
            conn,
            event_type="BOOKING_APPROVED",
            event_category="BOOKING",
            actor_user_id=admin_user_id,
            entity_type="BOOKING",
            entity_id=str(booking_id),
            previous_value={"status": "PENDING"},
            new_value={"status": "APPROVED"},
            reason=note or "Approved by Admin",
            ip_address=client_ip,
            is_successful=True,
        )

        create_notification(
            conn,
            recipient_user_id=row["requested_by_user_id"],
            notification_type="BOOKING_APPROVED",
            title="Booking Approved",
            message=f"Your booking {row['booking_reference']} for {row['room_code']} has been approved!",
            booking_id=booking_id,
        )

        # 4. Auto-deny competing PENDING requests (SRS FR-4.9)
        # Ensure the approved booking has active occupancy in schedule
        cur.execute("UPDATE booking_schedule SET occupancy_state = 'ACTIVE' WHERE booking_id = ?", (booking_id,))

        cur.execute(
            """
            SELECT DISTINCT b.booking_id, b.booking_reference, b.requested_by_user_id
            FROM bookings b
            WHERE b.resource_id = ?
              AND b.booking_date = ?
              AND b.status = 'PENDING'
              AND b.booking_id != ?
              AND b.start_slot_id <= ?
              AND b.end_slot_id >= ?
            """,
            (row["resource_id"], row["booking_date"], booking_id, row["end_slot_id"], row["start_slot_id"]),
        )
        competing_requests = cur.fetchall()

        denied_competing_refs = []
        for comp in competing_requests:
            c_id = comp["booking_id"]
            denied_competing_refs.append(comp["booking_reference"])

            # Transition competing to DENIED with reason SLOT_TAKEN
            cur.execute(
                """
                UPDATE bookings
                SET status = 'DENIED',
                    approved_by_user_id = ?,
                    decision_reason = 'SLOT_TAKEN',
                    decision_note = 'Auto-denied: slot allocated to approved request',
                    decided_at = datetime('now', 'localtime'),
                    updated_at = datetime('now', 'localtime')
                WHERE booking_id = ?
                """,
                (admin_user_id, c_id),
            )

            cur.execute(
                """
                UPDATE booking_schedule
                SET occupancy_state = 'RELEASED'
                WHERE booking_id = ?
                """,
                (c_id,),
            )

            cur.execute(
                """
                INSERT INTO booking_status_history (
                    booking_id, previous_status, new_status, changed_by_user_id, change_reason
                ) VALUES (?, 'PENDING', 'DENIED', ?, 'Auto-denied: competing request approved (SLOT_TAKEN)')
                """,
                (c_id, admin_user_id),
            )

            cur.execute(
                """
                INSERT INTO booking_conflicts (
                    resource_id, conflict_date, slot_id, requesting_booking_id, existing_booking_id,
                    conflict_type, resolution, resolved_by_user_id, detected_at, resolved_at
                ) VALUES (?, ?, ?, ?, ?, 'SOFT_COMPETING', 'PRIORITY_RESOLVED', ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
                """,
                (row["resource_id"], row["booking_date"], row["start_slot_id"], c_id, booking_id, admin_user_id),
            )

            log_audit_event(
                conn,
                event_type="BOOKING_DENIED",
                event_category="BOOKING",
                actor_user_id=admin_user_id,
                entity_type="BOOKING",
                entity_id=str(c_id),
                previous_value={"status": "PENDING"},
                new_value={"status": "DENIED", "reason": "SLOT_TAKEN"},
                reason="Auto-denied competing request (SLOT_TAKEN)",
                ip_address=client_ip,
                is_successful=True,
            )

            create_notification(
                conn,
                recipient_user_id=comp["requested_by_user_id"],
                notification_type="BOOKING_REJECTED",
                title="Booking Request Denied",
                message=f"Your booking request {comp['booking_reference']} was denied because the slot was awarded to another request.",
                booking_id=c_id,
            )

        return {
            "success": True,
            "message": f"Booking {row['booking_reference']} approved.",
            "auto_denied_competing_count": len(competing_requests),
            "auto_denied_references": denied_competing_refs,
        }


def deny_booking(
    booking_id: int,
    admin_user_id: int,
    reason: str,
    note: Optional[str] = None,
    client_ip: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Denies a PENDING booking with an enumerated reason (SRS §6, FR-5.3).
    """
    valid_reasons = {
        "SLOT_TAKEN",
        "REJECTED_BY_APPROVER",
        "INSUFFICIENT_PRIORITY",
        "CAPACITY_EXCEEDED",
        "MAINTENANCE",
        "EXPIRED",
    }
    if reason not in valid_reasons:
        reason = "REJECTED_BY_APPROVER"

    with transaction() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT b.booking_id, b.booking_reference, b.requested_by_user_id, b.status,
                   res.room_code
            FROM bookings b
            JOIN resources res ON res.resource_id = b.resource_id
            WHERE b.booking_id = ?
            """,
            (booking_id,),
        )
        row = cur.fetchone()
        if not row:
            return {"success": False, "message": "Booking not found."}

        if row["status"] != "PENDING":
            return {"success": False, "message": f"Booking is not pending (status: {row['status']})."}

        cur.execute(
            """
            UPDATE bookings
            SET status = 'DENIED',
                approved_by_user_id = ?,
                decision_reason = ?,
                decision_note = ?,
                decided_at = datetime('now', 'localtime'),
                updated_at = datetime('now', 'localtime')
            WHERE booking_id = ?
            """,
            (admin_user_id, reason, note, booking_id),
        )

        cur.execute(
            """
            UPDATE booking_schedule
            SET occupancy_state = 'RELEASED'
            WHERE booking_id = ?
            """,
            (booking_id,),
        )

        cur.execute(
            """
            INSERT INTO booking_approvals (
                booking_id, approver_user_id, decision, decision_reason, decided_at
            ) VALUES (?, ?, 'REJECTED', ?, datetime('now', 'localtime'))
            """,
            (booking_id, admin_user_id, f"{reason}: {note or ''}"),
        )

        cur.execute(
            """
            INSERT INTO booking_status_history (
                booking_id, previous_status, new_status, changed_by_user_id, change_reason
            ) VALUES (?, 'PENDING', 'DENIED', ?, ?)
            """,
            (booking_id, admin_user_id, f"Denied: {reason}"),
        )

        log_audit_event(
            conn,
            event_type="BOOKING_DENIED",
            event_category="BOOKING",
            actor_user_id=admin_user_id,
            entity_type="BOOKING",
            entity_id=str(booking_id),
            previous_value={"status": "PENDING"},
            new_value={"status": "DENIED", "reason": reason},
            reason=note or reason,
            ip_address=client_ip,
            is_successful=True,
        )

        create_notification(
            conn,
            recipient_user_id=row["requested_by_user_id"],
            notification_type="BOOKING_REJECTED",
            title="Booking Denied",
            message=f"Your booking request {row['booking_reference']} was denied. Reason: {reason}.",
            booking_id=booking_id,
        )

        return {"success": True, "message": f"Booking {row['booking_reference']} denied."}


def preempt_booking(
    booking_id: int,
    admin_user_id: int,
    reason: str,
    client_ip: Optional[str] = None,
) -> Dict[str, Any]:
    """
    SRS FR-5.4 & FR-5.5:
    Admin preemption of an APPROVED booking. Releases the slot and notifies the displaced user.
    """
    if not reason or not reason.strip():
        return {"success": False, "message": "Preemption requires a mandatory justification reason."}

    with transaction() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT b.booking_id, b.booking_reference, b.requested_by_user_id, b.status,
                   res.room_code,
                   admin_u.role_id, admin_r.role_code AS admin_role
            FROM bookings b
            JOIN resources res ON res.resource_id = b.resource_id
            JOIN users admin_u ON admin_u.user_id = ?
            JOIN roles admin_r ON admin_r.role_id = admin_u.role_id
            WHERE b.booking_id = ?
            """,
            (admin_user_id, booking_id),
        )
        row = cur.fetchone()
        if not row:
            return {"success": False, "message": "Booking or Admin not found."}

        if row["admin_role"] != "ADMIN":
            return {"success": False, "message": "Preemption is restricted to Admin authority only."}

        if row["status"] != "APPROVED":
            return {"success": False, "message": "Only APPROVED bookings may be preempted."}

        # 1. Update status to PREEMPTED
        cur.execute(
            """
            UPDATE bookings
            SET status = 'PREEMPTED',
                approved_by_user_id = ?,
                decision_reason = 'PREEMPTED',
                decision_note = ?,
                decided_at = datetime('now', 'localtime'),
                updated_at = datetime('now', 'localtime')
            WHERE booking_id = ?
            """,
            (admin_user_id, reason, booking_id),
        )

        # 2. Release slots in schedule
        cur.execute(
            """
            UPDATE booking_schedule
            SET occupancy_state = 'RELEASED'
            WHERE booking_id = ?
            """,
            (booking_id,),
        )

        # 3. Record history & audit
        cur.execute(
            """
            INSERT INTO booking_status_history (
                booking_id, previous_status, new_status, changed_by_user_id, change_reason
            ) VALUES (?, 'APPROVED', 'PREEMPTED', ?, ?)
            """,
            (booking_id, admin_user_id, f"Preempted: {reason}"),
        )

        log_audit_event(
            conn,
            event_type="BOOKING_PREEMPTED",
            event_category="BOOKING",
            actor_user_id=admin_user_id,
            entity_type="BOOKING",
            entity_id=str(booking_id),
            previous_value={"status": "APPROVED"},
            new_value={"status": "PREEMPTED"},
            reason=reason,
            ip_address=client_ip,
            is_successful=True,
        )

        # 4. Notify displaced user
        create_notification(
            conn,
            recipient_user_id=row["requested_by_user_id"],
            notification_type="BOOKING_PREEMPTED",
            title="Urgent: Booking Preempted",
            message=f"Your confirmed booking {row['booking_reference']} for {row['room_code']} was preempted by administration. Reason: {reason}.",
            booking_id=booking_id,
            priority="URGENT",
        )

        return {"success": True, "message": f"Booking {row['booking_reference']} successfully preempted."}
