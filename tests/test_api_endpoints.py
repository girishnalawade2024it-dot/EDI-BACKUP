"""
FastAPI REST API End-to-End Integration Tests
"""

import datetime
import pytest
from starlette.testclient import TestClient
from backend.main import app
from backend.database.connection import init_db

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    init_db(force=True)


def test_api_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"


def test_api_auth_login():
    res = client.post("/api/auth/login", json={"email": "anjali.deshmukh@college.edu"})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["role"] == "Faculty"
    assert "session_id" in data


def test_api_list_resources():
    res = client.get("/api/resources")
    assert res.status_code == 200
    rooms = res.json()
    assert len(rooms) == 11


def test_api_list_slots():
    res = client.get("/api/slots")
    assert res.status_code == 200
    slots = res.json()
    assert len(slots) == 10


def test_api_booking_flow():
    future_date = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()

    # 1. Create booking (Faculty auto-approved)
    book_res = client.post(
        "/api/bookings",
        json={
            "user_id": 1,
            "resource_id": 1,
            "booking_date": future_date,
            "start_slot_id": 1,
            "end_slot_id": 2,
            "purpose": "Algorithms Lab",
        },
    )
    assert book_res.status_code == 200
    b_data = book_res.json()
    assert b_data["success"] is True
    assert b_data["status"] == "APPROVED"
    booking_id = b_data["booking_id"]

    # 2. Check calendar reflects booking
    cal_res = client.get(f"/api/bookings/calendar?start_date={future_date}")
    assert cal_res.status_code == 200
    items = cal_res.json()
    assert len(items) >= 2  # slot 1 and slot 2 occupied

    # 3. Cancel booking
    cancel_res = client.post(f"/api/bookings/{booking_id}/cancel", json={"user_id": 1, "reason": "Rescheduled"})
    assert cancel_res.status_code == 200


def test_api_admin_stats():
    res = client.get("/api/admin/stats")
    assert res.status_code == 200
    stats = res.json()
    assert stats["total_users"] >= 6
    assert stats["total_labs"] == 8
    assert stats["total_classrooms"] == 3


def test_api_lab_utilisation_report():
    res = client.get("/api/reports/lab-utilisation")
    assert res.status_code == 200
    data = res.json()
    assert "summary" in data
    assert "labs" in data
    assert data["summary"]["total_rooms_tracked"] == 11
    assert data["summary"]["total_labs"] == 8
    assert data["summary"]["total_classrooms"] == 3
    assert len(data["labs"]) == 11

    # Test export CSV with insightful metadata
    csv_res = client.get("/api/reports/export-csv?report_type=lab_utilisation")
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    csv_text = csv_res.text
    assert "CAMPUS RESOURCE" in csv_text
    assert "Reporting Period" in csv_text
    assert "Utilisation Rate (%)" in csv_text

