"""Module: Booking Logic (backend/services/booking_logic.py, backend/api/logic.py)"""

import datetime

from backend.database.connection import get_db
from backend.services.booking_logic import ApprovalPriorityQueue, intervals_overlap
from helpers import ASSISTANT_1, FACULTY_1, FACULTY_2, book, future


# --- Half-open intervals --------------------------------------------------

def test_back_to_back_intervals_do_not_overlap():
    assert not intervals_overlap("09:00", "10:00", "10:00", "11:00")


def test_overlapping_intervals():
    assert intervals_overlap("09:00", "10:30", "10:00", "11:00")
    assert intervals_overlap("09:00", "12:00", "10:00", "11:00")  # containment


def test_buffer_extends_occupied_interval():
    assert intervals_overlap("09:00", "10:00", "10:00", "11:00", buffer_minutes=15)
    assert not intervals_overlap("09:00", "10:00", "10:30", "11:00", buffer_minutes=15)


# --- Priority queue -------------------------------------------------------

def test_priority_queue_orders_by_rank_then_time():
    pq = ApprovalPriorityQueue()
    pq.push({"booking_id": 1, "priority_rank": 2, "requested_at": "2026-01-01 09:00"})
    pq.push({"booking_id": 2, "priority_rank": 1, "requested_at": "2026-01-01 10:00"})
    pq.push({"booking_id": 3, "priority_rank": 2, "requested_at": "2026-01-01 08:00"})
    assert [b["booking_id"] for b in pq.ordered()] == [2, 3, 1]
    assert [pq.pop()["booking_id"] for _ in range(3)] == [2, 3, 1]
    assert pq.pop() is None


def test_approval_queue_endpoint(client):
    book(client, user_id=ASSISTANT_1)
    res = client.get("/api/logic/approval-queue").json()
    assert res["count"] == 1


# --- Notification queue ---------------------------------------------------

def test_notification_queue_delivers_pending_and_failed(client):
    with get_db() as conn:
        conn.execute(
            "INSERT INTO notifications (recipient_user_id, notification_type, title, message, delivery_status) "
            "VALUES (1, 'TEST', 't', 'm', 'PENDING'), (1, 'TEST', 't', 'm', 'FAILED')"
        )
    res = client.post("/api/logic/notifications/process").json()
    assert res == {"sent": 2, "failed": 0}
    assert client.post("/api/logic/notifications/process").json() == {"sent": 0, "failed": 0}


# --- Modification ---------------------------------------------------------

def test_modify_moves_booking(client):
    date = future()
    booking_id = book(client, user_id=FACULTY_1, date=date, start=1, end=1).json()["booking_id"]

    res = client.post(
        f"/api/logic/bookings/{booking_id}/modify",
        json={"user_id": FACULTY_1, "resource_id": 1, "booking_date": date, "start_slot_id": 2, "end_slot_id": 2},
    ).json()
    assert res["success"] is True

    slots = {s["slot_id"]: s["status"] for s in client.get(f"/api/logic/availability/1?date={date}").json()["slots"]}
    assert slots[1] == "Available"
    assert slots[2] == "Booked"


def test_failed_modify_keeps_original(client):
    date = future()
    mine = book(client, user_id=FACULTY_1, date=date, start=1, end=1).json()["booking_id"]
    book(client, user_id=FACULTY_2, date=date, start=3, end=3)

    res = client.post(
        f"/api/logic/bookings/{mine}/modify",
        json={"user_id": FACULTY_1, "resource_id": 1, "booking_date": date, "start_slot_id": 3, "end_slot_id": 3},
    ).json()
    assert res["code"] == "SLOT_TAKEN"

    slots = {s["slot_id"]: s["status"] for s in client.get(f"/api/logic/availability/1?date={date}").json()["slots"]}
    assert slots[1] == "Booked", "original booking must stay in place"


def test_modify_requires_owner(client):
    booking_id = book(client, user_id=FACULTY_1).json()["booking_id"]
    res = client.post(
        f"/api/logic/bookings/{booking_id}/modify",
        json={"user_id": FACULTY_2, "resource_id": 2, "booking_date": future(), "start_slot_id": 1, "end_slot_id": 1},
    ).json()
    assert res["code"] == "UNAUTHORIZED"


# --- Auto-release ---------------------------------------------------------

def test_expire_releases_stale_bookings(client):
    past = (datetime.date.today() - datetime.timedelta(days=2)).isoformat()
    with get_db() as conn:
        for ref, status, slot in (("BK-OLD-PENDING", "PENDING", 1), ("BK-OLD-APPROVED", "APPROVED", 2)):
            cur = conn.execute(
                "INSERT INTO bookings (booking_reference, resource_id, requested_by_user_id, booking_date, "
                "start_slot_id, end_slot_id, purpose, booking_type, status, priority_rank) "
                "VALUES (?, 1, 1, ?, ?, ?, 'old', 'ACADEMIC', ?, 1)",
                (ref, past, slot, slot, status),
            )
            conn.execute(
                "INSERT INTO booking_schedule (booking_id, resource_id, schedule_date, slot_id) VALUES (?, 1, ?, ?)",
                (cur.lastrowid, past, slot),
            )

    assert client.post("/api/logic/expire").json() == {"expired": 1, "completed": 1}

    with get_db() as conn:
        statuses = dict(conn.execute("SELECT booking_reference, status FROM bookings").fetchall())
        active = conn.execute("SELECT COUNT(*) FROM booking_schedule WHERE occupancy_state = 'ACTIVE'").fetchone()[0]
    assert statuses == {"BK-OLD-PENDING": "EXPIRED", "BK-OLD-APPROVED": "COMPLETED"}
    assert active == 0


def test_expire_leaves_future_bookings_alone(client):
    book(client, user_id=FACULTY_1)
    assert client.post("/api/logic/expire").json() == {"expired": 0, "completed": 0}


# --- Availability ---------------------------------------------------------

def test_availability_marks_break(client):
    slots = client.get(f"/api/logic/availability/1?date={future()}").json()["slots"]
    assert [s["status"] for s in slots if s["is_break"]] == ["Break"]
