"""
Comprehensive Backend Test Suite
Verifies all functional, concurrency, priority queue, conflict, and audit trail requirements.
"""

import concurrent.futures
import datetime
import pytest
from backend.database.connection import init_db, get_db, transaction
from backend.services.booking_service import (
    submit_booking,
    submit_recurring_booking,
    suggest_alternatives,
    cancel_booking,
)
from backend.services.approval_service import (
    approve_booking,
    deny_booking,
    get_pending_approvals,
    preempt_booking,
)
from backend.services.audit_service import log_audit_event
from backend.services.report_service import (
    export_lab_utilisation_csv,
    get_booking_counts_report,
    get_detailed_lab_utilisation_report,
    get_peak_load_report,
    get_utilisation_report,
)


@pytest.fixture(autouse=True)
def setup_fresh_db():
    """Initializes a fresh database before each test run."""
    init_db(force=True)


def test_schema_and_seed_data():
    """Verifies that all 11 rooms, 3 roles, and 10 time slots are seeded."""
    with get_db() as conn:
        cur = conn.cursor()

        # Check Roles
        cur.execute("SELECT COUNT(*) AS c FROM roles")
        assert cur.fetchone()["c"] == 3

        # Check Resources (Fixed 11 rooms: 8 Labs, 3 Classrooms)
        cur.execute("SELECT COUNT(*) AS c FROM resources")
        assert cur.fetchone()["c"] == 11

        cur.execute("SELECT COUNT(*) AS c FROM resources WHERE resource_type = 'Lab'")
        assert cur.fetchone()["c"] == 8

        cur.execute("SELECT COUNT(*) AS c FROM resources WHERE resource_type = 'Classroom'")
        assert cur.fetchone()["c"] == 3

        # Check Time Slots (10 slots)
        cur.execute("SELECT COUNT(*) AS c FROM time_slots")
        assert cur.fetchone()["c"] == 10


def test_faculty_auto_approval_and_assistant_pending():
    """
    SRS FR-5.2:
    Faculty requests auto-approved when conflict-free;
    Lab Assistant requests require approval (placed in PENDING).
    """
    future_date = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()

    # Faculty (user_id = 1, Dr. Anjali Deshmukh)
    res_fac = submit_booking(
        user_id=1,
        resource_id=1,
        booking_date=future_date,
        start_slot_id=1,
        end_slot_id=2,
        purpose="Data Structures Practical",
    )
    assert res_fac["success"] is True
    assert res_fac["status"] == "APPROVED"

    # Lab Assistant (user_id = 3, Amit Patil) on different resource
    res_ast = submit_booking(
        user_id=3,
        resource_id=2,
        booking_date=future_date,
        start_slot_id=1,
        end_slot_id=2,
        purpose="Hardware testing",
    )
    assert res_ast["success"] is True
    assert res_ast["status"] == "PENDING"


def test_concurrency_and_mutual_exclusion():
    """
    SRS NFR-C2 & DD-5:
    Acceptance criterion under 10 simultaneous requests for the exact same slot:
    Exactly ONE request succeeds, and N-1 receive clean conflict responses without double-booking.
    """
    future_date = (datetime.date.today() + datetime.timedelta(days=3)).isoformat()
    resource_id = 1
    start_slot = 3
    end_slot = 4

    results = []

    def attempt_booking(user_id):
        return submit_booking(
            user_id=user_id,
            resource_id=resource_id,
            booking_date=future_date,
            start_slot_id=start_slot,
            end_slot_id=end_slot,
            purpose=f"Concurrent booking test from user {user_id}",
        )

    # Launch 10 simultaneous threads for the same resource, date, and slot
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(attempt_booking, (i % 2) + 1) for i in range(10)]
        for f in concurrent.futures.as_completed(futures):
            results.append(f.result())

    # Count successes and conflicts
    successful = [r for r in results if r.get("success") is True]
    conflicts = [r for r in results if r.get("success") is False]

    # Acceptance test: Exactly 1 succeeds, 9 fail with clean conflict
    assert len(successful) == 1, f"Expected exactly 1 successful booking, got {len(successful)}"
    assert len(conflicts) == 9

    for c in conflicts:
        assert c.get("code") == "SLOT_TAKEN"
        assert "already occupied" in c.get("message")
        # Ensure alternative resources were provided
        assert isinstance(c.get("alternatives"), list)

    # Verification query from DB Schema §27 (must return 0 rows)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT resource_id, schedule_date, slot_id, COUNT(*) AS active_rows
            FROM booking_schedule
            WHERE occupancy_state = 'ACTIVE'
            GROUP BY resource_id, schedule_date, slot_id
            HAVING COUNT(*) > 1
            """
        )
        double_bookings = cur.fetchall()
        assert len(double_bookings) == 0, "Double booking detected in database!"


def test_priority_queue_ordering():
    """
    SRS FR-4.8, FR-5.1 & DB Schema DD-6:
    Pending requests in the approval queue are strictly ranked by
    Faculty (priority 1) > Lab Assistant (priority 2), then submission timestamp.
    """
    future_date = (datetime.date.today() + datetime.timedelta(days=5)).isoformat()

    # User 3 (Lab Assistant, rank 2) submits first
    submit_booking(
        user_id=3,
        resource_id=3,
        booking_date=future_date,
        start_slot_id=1,
        end_slot_id=1,
        purpose="Assistant maintenance",
    )

    # Manually insert a Faculty pending request (to test queue sorting)
    with transaction() as conn:
        conn.execute(
            """
            INSERT INTO bookings (
                booking_reference, resource_id, requested_by_user_id, booking_date,
                start_slot_id, end_slot_id, purpose, booking_type, status, priority_rank, requested_at
            ) VALUES ('BK-FAC-TEST', 3, 2, ?, 1, 1, 'Faculty exam prep', 'ACADEMIC', 'PENDING', 1, datetime('now', '+1 minute'))
            """,
            (future_date,),
        )

    with get_db() as conn:
        queue = get_pending_approvals(conn)
        assert len(queue) >= 2
        # Faculty (priority_rank 1) must be ranked ahead of Lab Assistant (priority_rank 2)
        assert queue[0]["priority_rank"] == 1
        assert queue[1]["priority_rank"] == 2


def test_competing_requests_auto_denial():
    """
    SRS FR-4.9:
    Approving one request in a competing group automatically transitions
    the remaining competing requests to DENIED with reason SLOT_TAKEN within the same transaction.
    """
    future_date = (datetime.date.today() + datetime.timedelta(days=6)).isoformat()

    # Submit request A (Lab Assistant 3)
    res_a = submit_booking(
        user_id=3,
        resource_id=4,
        booking_date=future_date,
        start_slot_id=2,
        end_slot_id=3,
        purpose="Maintenance A",
    )
    b_id_a = res_a["booking_id"]

    # Submit competing request B on the same resource and slots (Lab Assistant 4)
    res_b = submit_booking(
        user_id=4,
        resource_id=4,
        booking_date=future_date,
        start_slot_id=2,
        end_slot_id=3,
        purpose="Maintenance B",
    )
    assert res_b["success"] is True
    assert res_b["status"] == "PENDING"
    b_id_b = res_b["booking_id"]

    # Admin (user_id = 5) approves request A
    appr_res = approve_booking(booking_id=b_id_a, admin_user_id=5, note="Approved winner")
    assert appr_res["success"] is True

    # Check request B was automatically denied with reason SLOT_TAKEN
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT status, decision_reason FROM bookings WHERE booking_id = ?", (b_id_b,))
        b_row = cur.fetchone()
        assert b_row["status"] == "DENIED"
        assert b_row["decision_reason"] == "SLOT_TAKEN"


def test_recurring_bookings():
    """
    SRS FR-3.10:
    Recurring bookings validate each occurrence independently and report successes and conflicts.
    """
    start_d = (datetime.date.today() + datetime.timedelta(days=7)).isoformat()
    end_d = (datetime.date.today() + datetime.timedelta(days=14)).isoformat()

    rec_res = submit_recurring_booking(
        user_id=1,
        resource_id=5,
        pattern="DAILY",
        series_start_date=start_d,
        series_end_date=end_d,
        start_slot_id=1,
        end_slot_id=2,
        purpose="Semester Lab Session",
    )

    assert rec_res["success"] is True
    assert rec_res["total_requested"] > 0
    assert rec_res["successful_count"] > 0
    assert len(rec_res["occurrences"]) == rec_res["total_requested"]


def test_admin_preemption():
    """
    SRS FR-5.4 & FR-5.5:
    Admin can preempt an APPROVED booking. The displaced booking transitions to PREEMPTED
    and slot is released.
    """
    future_date = (datetime.date.today() + datetime.timedelta(days=8)).isoformat()

    # Faculty creates approved booking
    res = submit_booking(
        user_id=1,
        resource_id=6,
        booking_date=future_date,
        start_slot_id=1,
        end_slot_id=2,
        purpose="Regular session",
    )
    b_id = res["booking_id"]
    assert res["status"] == "APPROVED"

    # Admin preempts with justification
    preempt_res = preempt_booking(
        booking_id=b_id,
        admin_user_id=5,
        reason="Accreditation team campus inspection",
    )
    assert preempt_res["success"] is True

    # Verify status in database
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT status FROM bookings WHERE booking_id = ?", (b_id,))
        assert cur.fetchone()["status"] == "PREEMPTED"

        # Check schedule was released
        cur.execute("SELECT COUNT(*) AS c FROM booking_schedule WHERE booking_id = ? AND occupancy_state = 'ACTIVE'", (b_id,))
        assert cur.fetchone()["c"] == 0


def test_append_only_audit_log_triggers():
    """
    SRS FR-8.4 & DD-7:
    audit_logs is strictly append-only.
    Triggers must prevent UPDATE and DELETE statements.
    """
    with transaction() as conn:
        log_audit_event(
            conn,
            event_type="TEST_EVENT",
            event_category="SYSTEM",
            actor_user_id=1,
            entity_type="SYSTEM",
            reason="Trigger test",
        )

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT audit_id FROM audit_logs ORDER BY audit_id DESC LIMIT 1")
        row = cur.fetchone()
        assert row is not None
        audit_id = row["audit_id"]

        # Attempting UPDATE must fail due to trigger trg_audit_no_update
        with pytest.raises(Exception) as exc_update:
            conn.execute("UPDATE audit_logs SET reason = 'tampered' WHERE audit_id = ?", (audit_id,))
        assert "append-only" in str(exc_update.value)

        # Attempting DELETE must fail due to trigger trg_audit_no_delete
        with pytest.raises(Exception) as exc_delete:
            conn.execute("DELETE FROM audit_logs WHERE audit_id = ?", (audit_id,))
        assert "append-only" in str(exc_delete.value)


def test_descriptive_reports():
    """
    SRS §7:
    Verifies generation of Utilisation, Booking Counts, and Peak-Load reports.
    """
    with get_db() as conn:
        util = get_utilisation_report(conn)
        assert isinstance(util, list)
        assert len(util) == 11  # All 11 rooms reported

        counts = get_booking_counts_report(conn)
        assert "by_status" in counts
        assert "by_role" in counts

        peak = get_peak_load_report(conn)
        assert isinstance(peak, list)
        assert len(peak) == 9  # 9 bookable periods

        detailed = get_detailed_lab_utilisation_report(conn)
        assert "summary" in detailed
        assert "labs" in detailed
        assert len(detailed["labs"]) == 11
        assert detailed["summary"]["total_rooms_tracked"] == 11
        assert detailed["summary"]["total_labs"] == 8

        csv_text = export_lab_utilisation_csv(detailed)
        assert "CAMPUS RESOURCE" in csv_text
        assert "Reporting Period" in csv_text
        assert "Utilisation Rate (%)" in csv_text

