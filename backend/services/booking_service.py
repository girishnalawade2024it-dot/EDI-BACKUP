"""
Booking Service — Core Domain Logic
Implements SRS FR-3, FR-4, FR-5, FR-6, FR-7, Functional Design & DB Schema v1.1.
Features:
- Atomic booking creation inside immediate transaction
- Layer 1 Advisory Mutex + Layer 2 Transactional check + Layer 3 Database unique constraint
- Automatic FCFS resolution without artificial millisecond thresholds
- Priority-driven auto-approval (Faculty auto-approved; Lab Assistant routed to Admin queue)
- Conflict logging with classification (HARD_OVERLAP, RACE_CONDITION, etc.)
- Alternative resource suggestions on contention (NFR-U2)
- Recurring booking generation with independent occurrence validation
- Cancellation with cut-off enforcement and slot release
"""

import datetime
import random
import sqlite3
from typing import Any, Dict, List, Optional

from backend.database.connection import get_db, transaction
from backend.services.concurrency import AdvisoryMutex
from backend.services.audit_service import log_audit_event
from backend.services.notification_service import create_notification, notify_admins


def generate_booking_reference() -> str:
    year = datetime.date.today().year
    suffix = random.randint(100000, 999999)
    return f"BK{year}-{suffix}"


def get_slot_times(conn: sqlite3.Connection, start_slot_id: int, end_slot_id: int) -> Dict[int, Any]:
    cur = conn.cursor()
    cur.execute("SELECT slot_id, slot_code, start_time, end_time, is_break FROM time_slots WHERE slot_id IN (?, ?)", (start_slot_id, end_slot_id))
    rows = {r["slot_id"]: r for r in cur.fetchall()}
    return rows


def check_slot_contiguity_and_breaks(conn: sqlite3.Connection, start_slot_id: int, end_slot_id: int) -> tuple[bool, Any]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT slot_id, slot_code, start_time, end_time, is_break, is_active
        FROM time_slots
        WHERE slot_id BETWEEN ? AND ?
        ORDER BY slot_order ASC
        """,
        (start_slot_id, end_slot_id),
    )
    slots = cur.fetchall()
    if not slots:
        return False, "Invalid slot selection"

    for s in slots:
        if not s["is_active"]:
            return False, f"Slot {s['slot_code']} is currently inactive"
        if s["is_break"]:
            return False, f"Slot {s['slot_code']} is a break period and cannot be booked"

    return True, slots


def suggest_alternatives(
    conn: sqlite3.Connection,
    resource_type: str,
    booking_date: str,
    start_slot_id: int,
    end_slot_id: int,
    exclude_resource_id: int,
    required_capacity: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    SRS NFR-U2 & Functional Design p.7:
    Finds available alternative rooms on the same date and slot matching resource type,
    adequate capacity, and equipment.
    """
    cur = conn.cursor()
    query = """
        SELECT r.resource_id, r.room_code, r.resource_type, r.capacity, r.description,
               b.block_code, b.block_name,
               l.has_machines, l.machine_count,
               c.seating_type
        FROM resources r
        JOIN blocks b ON b.block_id = r.block_id
        LEFT JOIN laboratories l ON l.resource_id = r.resource_id
        LEFT JOIN classrooms c ON c.resource_id = r.resource_id
        WHERE r.resource_type = ?
          AND r.status = 'ACTIVE'
          AND r.resource_id != ?
    """
    params = [resource_type, exclude_resource_id]
    if required_capacity is not None:
        query += " AND (r.capacity IS NULL OR r.capacity >= ?)"
        params.append(required_capacity)

    cur.execute(query, tuple(params))
    candidates = cur.fetchall()

    alternatives = []
    for cand in candidates:
        r_id = cand["resource_id"]
        # Check if this candidate has any active occupancy in booking_schedule
        cur.execute(
            """
            SELECT COUNT(*) AS active_count
            FROM booking_schedule
            WHERE resource_id = ?
              AND schedule_date = ?
              AND slot_id BETWEEN ? AND ?
              AND occupancy_state = 'ACTIVE'
            """,
            (r_id, booking_date, start_slot_id, end_slot_id),
        )
        occupied = cur.fetchone()["active_count"]
        if occupied == 0:
            alternatives.append(
                {
                    "resource_id": r_id,
                    "room_code": cand["room_code"],
                    "resource_type": cand["resource_type"],
                    "block": cand["block_code"],
                    "capacity": cand["capacity"],
                    "has_machines": bool(cand["has_machines"]) if cand["has_machines"] is not None else None,
                    "description": cand["description"],
                }
            )

    return alternatives


def submit_booking(
    user_id: int,
    resource_id: int,
    booking_date: str,
    start_slot_id: int,
    end_slot_id: int,
    purpose: str,
    booking_type: str = "ACADEMIC",
    expected_headcount: Optional[int] = None,
    recurrence_id: Optional[int] = None,
    client_ip: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Atomically creates a booking request enforcing full business rules,
    concurrency mutex, and conflict prevention.
    """
    if end_slot_id < start_slot_id:
        return {"success": False, "code": "INVALID_RANGE", "message": "End slot must be at or after start slot."}

    slots_count = end_slot_id - start_slot_id + 1
    if slots_count > 4:
        return {"success": False, "code": "TOO_LONG", "message": "Maximum booking duration is 4 hours (4 slots)."}

    # Validate date is not in the past
    try:
        req_date = datetime.date.fromisoformat(booking_date)
        if req_date < datetime.date.today():
            return {"success": False, "code": "PAST_DATE", "message": "Cannot book slots in the past."}
    except ValueError:
        return {"success": False, "code": "INVALID_DATE", "message": "Invalid date format. Use YYYY-MM-DD."}

    # Acquire Advisory Mutex for (resource_id, booking_date)
    with AdvisoryMutex(resource_id, booking_date):
        with transaction() as conn:
            cur = conn.cursor()

            # 1. Fetch user & role permissions
            cur.execute(
                """
                SELECT u.user_id, u.full_name, u.email, u.is_active,
                       r.role_id, r.role_code, r.priority_rank, r.is_auto_approved, r.max_advance_days
                FROM users u
                JOIN roles r ON r.role_id = u.role_id
                WHERE u.user_id = ?
                """,
                (user_id,),
            )
            user = cur.fetchone()
            if not user or not user["is_active"]:
                return {"success": False, "code": "UNAUTHORIZED", "message": "User not active or found."}

            # Check advance booking window
            days_ahead = (req_date - datetime.date.today()).days
            if days_ahead > user["max_advance_days"]:
                return {
                    "success": False,
                    "code": "ADVANCE_LIMIT",
                    "message": f"This role may only book up to {user['max_advance_days']} days in advance.",
                }

            # 2. Fetch resource details
            cur.execute(
                """
                SELECT r.resource_id, r.room_code, r.resource_type, r.capacity, r.status,
                       l.has_machines, l.machine_count
                FROM resources r
                LEFT JOIN laboratories l ON l.resource_id = r.resource_id
                WHERE r.resource_id = ?
                """,
                (resource_id,),
            )
            res = cur.fetchone()
            if not res or res["status"] != "ACTIVE":
                return {"success": False, "code": "RESOURCE_UNAVAILABLE", "message": "Resource is not active."}

            # Check capacity if specified
            if expected_headcount and res["capacity"] and expected_headcount > res["capacity"]:
                return {
                    "success": False,
                    "code": "CAPACITY_EXCEEDED",
                    "message": f"Requested headcount ({expected_headcount}) exceeds room capacity ({res['capacity']}).",
                }

            # Check slots validity & breaks
            valid, slots_or_err = check_slot_contiguity_and_breaks(conn, start_slot_id, end_slot_id)
            if not valid:
                return {"success": False, "code": "INVALID_SLOT", "message": slots_or_err}

            # 3. Layer 2: Transactional Overlap Check on booking_schedule
            cur.execute(
                """
                SELECT bs.schedule_id, bs.booking_id, bs.slot_id, b.booking_reference, b.status, b.purpose,
                       u.full_name AS booked_by
                FROM booking_schedule bs
                JOIN bookings b ON b.booking_id = bs.booking_id
                JOIN users u ON u.user_id = b.requested_by_user_id
                WHERE bs.resource_id = ?
                  AND bs.schedule_date = ?
                  AND bs.slot_id BETWEEN ? AND ?
                  AND bs.occupancy_state = 'ACTIVE'
                """,
                (resource_id, booking_date, start_slot_id, end_slot_id),
            )
            conflicts = cur.fetchall()

            has_approved_conflict = any(c["status"] == "APPROVED" for c in conflicts)
            has_pending_conflict = any(c["status"] == "PENDING" for c in conflicts)

            if has_approved_conflict:
                # Hard conflict with confirmed booking (SRS FR-3.5)
                first_conflict = next(c for c in conflicts if c["status"] == "APPROVED")
                conflicting_booking_id = first_conflict["booking_id"]
                conflicting_slot = first_conflict["slot_id"]

                # Log conflict event (requesting_booking_id is None since request was rejected at submission)
                cur.execute(
                    """
                    INSERT INTO booking_conflicts (
                        resource_id, conflict_date, slot_id, requesting_booking_id, existing_booking_id,
                        conflict_type, resolution, resolved_by_user_id, detected_at
                    ) VALUES (?, ?, ?, NULL, ?, 'HARD_OVERLAP', 'AUTO_REJECTED', ?, datetime('now', 'localtime'))
                    """,
                    (resource_id, booking_date, conflicting_slot, conflicting_booking_id, user_id),
                )

                # Fetch alternative resources (SRS NFR-U2)
                alternatives = suggest_alternatives(
                    conn,
                    resource_type=res["resource_type"],
                    booking_date=booking_date,
                    start_slot_id=start_slot_id,
                    end_slot_id=end_slot_id,
                    exclude_resource_id=resource_id,
                    required_capacity=expected_headcount,
                )

                log_audit_event(
                    conn,
                    event_type="BOOKING_CONFLICT",
                    event_category="BOOKING",
                    actor_user_id=user_id,
                    entity_type="BOOKING",
                    reason=f"Slot overlap with confirmed booking {first_conflict['booking_reference']}",
                    ip_address=client_ip,
                    is_successful=False,
                )

                return {
                    "success": False,
                    "code": "SLOT_TAKEN",
                    "message": f"Resource {res['room_code']} is already occupied for the requested slot(s).",
                    "conflicting_booking": {
                        "reference": first_conflict["booking_reference"],
                        "status": first_conflict["status"],
                        "purpose": first_conflict["purpose"],
                    },
                    "alternatives": alternatives,
                }

            # 4. Determine initial status based on role priority & auto-approval rules
            # If there is a pending conflict, this request enters the approval queue as PENDING (FR-4.8)
            # Otherwise: Faculty (rank 1) auto-approved; Lab Assistant (rank 2) queued as PENDING
            if has_pending_conflict:
                initial_status = "PENDING"
            else:
                initial_status = "APPROVED" if user["is_auto_approved"] else "PENDING"

            booking_ref = generate_booking_reference()

            cur.execute(
                """
                INSERT INTO bookings (
                    booking_reference, resource_id, requested_by_user_id, booking_date,
                    start_slot_id, end_slot_id, purpose, booking_type, expected_headcount,
                    status, priority_rank, recurrence_id, requested_at, decided_at, approved_by_user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'),
                          CASE WHEN ? = 'APPROVED' THEN datetime('now', 'localtime') ELSE NULL END,
                          CASE WHEN ? = 'APPROVED' THEN ? ELSE NULL END)
                """,
                (
                    booking_ref,
                    resource_id,
                    user_id,
                    booking_date,
                    start_slot_id,
                    end_slot_id,
                    purpose,
                    booking_type,
                    expected_headcount,
                    initial_status,
                    user["priority_rank"],
                    recurrence_id,
                    initial_status,
                    initial_status,
                    user_id if initial_status == "APPROVED" else None,
                ),
            )
            booking_id = cur.lastrowid

            # 5. Populate booking_schedule for all requested slots (Layer 3 Constraint Protected)
            # If competing with an existing pending request, set occupancy_state to 'RELEASED'
            # until the approver decides the priority queue winner (FR-4.8, FR-4.9)
            sched_state = "RELEASED" if has_pending_conflict else "ACTIVE"
            try:
                for slot_id in range(start_slot_id, end_slot_id + 1):
                    cur.execute(
                        """
                        INSERT INTO booking_schedule (
                            booking_id, resource_id, schedule_date, slot_id, occupancy_state
                        ) VALUES (?, ?, ?, ?, ?)
                        """,
                        (booking_id, resource_id, booking_date, slot_id, sched_state),
                    )
            except sqlite3.IntegrityError as ie:
                cur.execute(
                    """
                    INSERT INTO booking_conflicts (
                        resource_id, conflict_date, slot_id, requesting_booking_id,
                        conflict_type, resolution, detected_at
                    ) VALUES (?, ?, ?, ?, 'RACE_CONDITION', 'AUTO_REJECTED', datetime('now', 'localtime'))
                    """,
                    (resource_id, booking_date, start_slot_id, booking_id),
                )
                raise RuntimeError("Race condition detected: another transaction committed this slot simultaneously.") from ie

            if has_pending_conflict:
                for comp in conflicts:
                    cur.execute(
                        """
                        INSERT INTO booking_conflicts (
                            resource_id, conflict_date, slot_id, requesting_booking_id, existing_booking_id,
                            conflict_type, resolution, detected_at
                        ) VALUES (?, ?, ?, ?, ?, 'SOFT_COMPETING', 'UNRESOLVED', datetime('now', 'localtime'))
                        """,
                        (resource_id, booking_date, comp["slot_id"], booking_id, comp["booking_id"]),
                    )

            # 6. Record history & append-only audit log
            cur.execute(
                """
                INSERT INTO booking_status_history (
                    booking_id, previous_status, new_status, changed_by_user_id, change_reason
                ) VALUES (?, NULL, ?, ?, 'Initial booking submission')
                """,
                (booking_id, initial_status, user_id),
            )

            log_audit_event(
                conn,
                event_type="BOOKING_CREATED",
                event_category="BOOKING",
                actor_user_id=user_id,
                entity_type="BOOKING",
                entity_id=str(booking_id),
                new_value={"status": initial_status, "reference": booking_ref, "resource_id": resource_id},
                reason=f"Booking submitted as {initial_status}",
                ip_address=client_ip,
                is_successful=True,
            )

            # 7. Notifications
            if initial_status == "APPROVED":
                create_notification(
                    conn,
                    recipient_user_id=user_id,
                    notification_type="BOOKING_APPROVED",
                    title="Booking Confirmed",
                    message=f"Your booking {booking_ref} for {res['room_code']} on {booking_date} is confirmed.",
                    booking_id=booking_id,
                )
            else:
                create_notification(
                    conn,
                    recipient_user_id=user_id,
                    notification_type="BOOKING_SUBMITTED",
                    title="Booking Request Submitted",
                    message=f"Your booking request {booking_ref} for {res['room_code']} is awaiting Admin approval.",
                    booking_id=booking_id,
                )
                notify_admins(
                    conn,
                    notification_type="BOOKING_PENDING",
                    title="New Booking Awaiting Approval",
                    message=f"Request {booking_ref} from {user['full_name']} for {res['room_code']} requires approval.",
                    booking_id=booking_id,
                )

            return {
                "success": True,
                "booking_id": booking_id,
                "booking_reference": booking_ref,
                "status": initial_status,
                "message": f"Booking {booking_ref} created with status {initial_status}.",
            }


def submit_recurring_booking(
    user_id: int,
    resource_id: int,
    pattern: str,  # 'DAILY', 'WEEKLY'
    series_start_date: str,
    series_end_date: str,
    start_slot_id: int,
    end_slot_id: int,
    purpose: str,
    booking_type: str = "ACADEMIC",
    expected_headcount: Optional[int] = None,
    days_of_week: Optional[List[str]] = None,
    client_ip: Optional[str] = None,
) -> Dict[str, Any]:
    """
    SRS FR-3.10 & Functional Design p.10-11:
    Generates individual occurrences across the date range, validating each independently.
    Reports which instances succeeded and which conflicted.
    """
    start_d = datetime.date.fromisoformat(series_start_date)
    end_d = datetime.date.fromisoformat(series_end_date)
    if end_d < start_d:
        return {"success": False, "message": "End date must be after start date."}

    # Generate dates
    target_dates = []
    curr = start_d
    day_names = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

    while curr <= end_d:
        if pattern == "DAILY":
            if curr.weekday() < 6:  # Exclude Sundays by default
                target_dates.append(curr.isoformat())
            curr += datetime.timedelta(days=1)
        elif pattern == "WEEKLY":
            cur_day_abbr = day_names[curr.weekday()]
            if not days_of_week or cur_day_abbr in days_of_week:
                target_dates.append(curr.isoformat())
            curr += datetime.timedelta(days=1)
        else:
            curr += datetime.timedelta(days=1)

    if not target_dates:
        return {"success": False, "message": "No matching dates found for recurrence pattern."}

    # Create recurrence parent record
    with transaction() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO booking_recurrence (
                pattern, series_start_date, series_end_date, occurrence_count,
                days_of_week, created_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                pattern,
                series_start_date,
                series_end_date,
                len(target_dates),
                ",".join(days_of_week) if days_of_week else None,
                user_id,
            ),
        )
        recurrence_id = cur.lastrowid

    results = []
    success_count = 0
    conflict_count = 0

    for d in target_dates:
        res = submit_booking(
            user_id=user_id,
            resource_id=resource_id,
            booking_date=d,
            start_slot_id=start_slot_id,
            end_slot_id=end_slot_id,
            purpose=purpose,
            booking_type=booking_type,
            expected_headcount=expected_headcount,
            recurrence_id=recurrence_id,
            client_ip=client_ip,
        )
        if res.get("success"):
            success_count += 1
            results.append({"date": d, "status": "BOOKED", "booking_reference": res.get("booking_reference")})
        else:
            conflict_count += 1
            results.append({"date": d, "status": "CONFLICT", "reason": res.get("message")})

    return {
        "success": success_count > 0,
        "recurrence_id": recurrence_id,
        "total_requested": len(target_dates),
        "successful_count": success_count,
        "conflict_count": conflict_count,
        "occurrences": results,
    }


def cancel_booking(
    booking_id: int,
    user_id: int,
    reason: Optional[str] = None,
    client_ip: Optional[str] = None,
) -> Dict[str, Any]:
    """
    SRS FR-3.7 & FR-3.8:
    Cancels an active or pending booking and immediately releases the slot.
    Enforces 2-hour cut-off before start time for APPROVED bookings.
    """
    with transaction() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT b.booking_id, b.booking_reference, b.resource_id, b.requested_by_user_id,
                   b.booking_date, b.start_slot_id, b.status,
                   u.role_id, r.role_code,
                   ts.start_time
            FROM bookings b
            JOIN users u ON u.user_id = ?
            JOIN roles r ON r.role_id = u.role_id
            JOIN time_slots ts ON ts.slot_id = b.start_slot_id
            WHERE b.booking_id = ?
            """,
            (user_id, booking_id),
        )
        row = cur.fetchone()
        if not row:
            return {"success": False, "message": "Booking not found."}

        is_owner = row["requested_by_user_id"] == user_id
        is_admin = row["role_code"] == "ADMIN"

        if not (is_owner or is_admin):
            return {"success": False, "message": "You can only cancel your own bookings."}

        if row["status"] not in ("PENDING", "APPROVED"):
            return {"success": False, "message": f"Cannot cancel a booking in status {row['status']}."}

        # Check cut-off time for APPROVED bookings (default 2 hours)
        if row["status"] == "APPROVED" and not is_admin:
            slot_start_dt = datetime.datetime.fromisoformat(f"{row['booking_date']}T{row['start_time']}")
            time_until_start = (slot_start_dt - datetime.datetime.now()).total_seconds() / 3600.0
            if time_until_start < 2.0:
                return {
                    "success": False,
                    "message": "Approved bookings can only be cancelled at least 2 hours before the start time.",
                }

        # 1. Update booking status
        cur.execute(
            """
            UPDATE bookings
            SET status = 'CANCELLED',
                cancelled_at = datetime('now', 'localtime'),
                cancellation_reason = ?,
                updated_at = datetime('now', 'localtime')
            WHERE booking_id = ?
            """,
            (reason or "Cancelled by user", booking_id),
        )

        # 2. Release occupied slots in booking_schedule (DD-4)
        cur.execute(
            """
            UPDATE booking_schedule
            SET occupancy_state = 'RELEASED'
            WHERE booking_id = ?
            """,
            (booking_id,),
        )

        # 3. Record history
        cur.execute(
            """
            INSERT INTO booking_status_history (
                booking_id, previous_status, new_status, changed_by_user_id, change_reason
            ) VALUES (?, ?, 'CANCELLED', ?, ?)
            """,
            (booking_id, row["status"], user_id, reason or "Cancelled by user"),
        )

        # 4. Append-only audit log
        log_audit_event(
            conn,
            event_type="BOOKING_CANCELLED",
            event_category="BOOKING",
            actor_user_id=user_id,
            entity_type="BOOKING",
            entity_id=str(booking_id),
            previous_value={"status": row["status"]},
            new_value={"status": "CANCELLED"},
            reason=reason or "Booking cancelled",
            ip_address=client_ip,
            is_successful=True,
        )

        # 5. Notify user
        create_notification(
            conn,
            recipient_user_id=row["requested_by_user_id"],
            notification_type="BOOKING_CANCELLED",
            title="Booking Cancelled",
            message=f"Booking {row['booking_reference']} has been cancelled.",
            booking_id=booking_id,
        )

        return {"success": True, "message": f"Booking {row['booking_reference']} successfully cancelled."}
