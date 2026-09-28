"""Module: Resources & Time Slots (backend/api/resources.py, backend/api/slots.py)"""

from helpers import ADMIN, FACULTY_1, book, future


def test_lists_all_eleven_rooms(client):
    rooms = client.get("/api/resources").json()
    assert len(rooms) == 11


def test_filters_by_type(client):
    assert len(client.get("/api/resources?resource_type=Lab").json()) == 8
    assert len(client.get("/api/resources?resource_type=Classroom").json()) == 3


def test_get_single_resource_and_404(client):
    res = client.get("/api/resources/1")
    assert res.status_code == 200
    assert res.json()["room_code"] == "MB 409"
    assert "equipment" in res.json()
    assert client.get("/api/resources/999").status_code == 404


def test_live_status_reflects_bookings(client):
    date = future()
    assert book(client, resource_id=1, date=date, start=2, end=2).status_code == 200
    rooms = client.get(f"/api/resources?date={date}&slot_id=2").json()
    by_id = {r["resource_id"]: r for r in rooms}
    assert by_id[1]["live_status"] == "BOOKED"
    assert by_id[2]["live_status"] == "AVAILABLE"


def test_only_admin_can_change_resource_status(client):
    denied = client.patch("/api/resources/1/status", json={"status": "INACTIVE", "admin_user_id": FACULTY_1})
    assert denied.status_code == 403

    ok = client.patch("/api/resources/1/status", json={"status": "UNDER_MAINTENANCE", "admin_user_id": ADMIN})
    assert ok.status_code == 200
    assert client.get("/api/resources/1").json()["status"] == "UNDER_MAINTENANCE"


def test_inactive_resource_cannot_be_booked(client):
    client.patch("/api/resources/1/status", json={"status": "INACTIVE", "admin_user_id": ADMIN})
    res = book(client, resource_id=1)
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "RESOURCE_UNAVAILABLE"


def test_time_slots_are_ordered_and_include_break(client):
    slots = client.get("/api/slots").json()
    assert len(slots) == 10
    assert [s["slot_order"] for s in slots] == sorted(s["slot_order"] for s in slots)
    assert any(s["is_break"] for s in slots)
