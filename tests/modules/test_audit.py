"""Module: Audit Trail (backend/api/audit_logs.py, backend/services/audit_service.py)"""

import sqlite3

import pytest

from backend.database.connection import get_db
from helpers import FACULTY_1, book


def test_login_is_audited(client):
    client.post("/api/auth/login", json={"email": "anjali.deshmukh@college.edu"})
    logs = client.get("/api/audit-logs?event_type=AUTH_LOGIN").json()
    assert len(logs) == 1
    assert logs[0]["actor_user_id"] == FACULTY_1


def test_booking_creation_and_cancellation_are_audited(client):
    booking_id = book(client, date=None).json()["booking_id"]
    client.post(f"/api/bookings/{booking_id}/cancel", json={"user_id": FACULTY_1})

    events = {log["event_type"] for log in client.get("/api/audit-logs?event_category=BOOKING").json()}
    assert {"BOOKING_CREATED", "BOOKING_CANCELLED"} <= events

    trail = client.get("/api/audit-logs/resource/1").json()
    assert len(trail) >= 2


def test_audit_log_is_append_only(client):
    book(client)
    with pytest.raises(sqlite3.DatabaseError):
        with get_db() as conn:
            conn.execute("UPDATE audit_logs SET reason = 'tampered'")
    with pytest.raises(sqlite3.DatabaseError):
        with get_db() as conn:
            conn.execute("DELETE FROM audit_logs")


def test_csv_export(client):
    book(client)
    res = client.get("/api/audit-logs/export-csv")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "event_type" in res.text.splitlines()[0]
