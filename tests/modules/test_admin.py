"""Module: Admin Operations (backend/api/admin.py)"""

from helpers import ADMIN, FACULTY_1, book


def test_dashboard_stats(client):
    book(client)
    stats = client.get("/api/admin/stats").json()
    assert stats["total_users"] == 6
    assert stats["total_labs"] == 8
    assert stats["total_classrooms"] == 3
    assert stats["active_bookings"] == 1
    assert stats["total_bookings"] == 1


def test_list_users(client):
    users = client.get("/api/admin/users").json()
    assert len(users) == 6
    assert {u["role_code"] for u in users} == {"FACULTY", "LAB_ASSISTANT", "ADMIN"}


def test_only_admin_can_create_user(client):
    payload = {"username": "new.fac", "email": "new.fac@college.edu", "full_name": "New Faculty", "role_id": 1}

    denied = client.post("/api/admin/users", json={**payload, "admin_user_id": FACULTY_1})
    assert denied.status_code == 403

    ok = client.post("/api/admin/users", json={**payload, "admin_user_id": ADMIN})
    assert ok.status_code == 200
    assert len(client.get("/api/admin/users").json()) == 7

    duplicate = client.post("/api/admin/users", json={**payload, "admin_user_id": ADMIN})
    assert duplicate.status_code == 400


def test_toggle_user_active(client):
    denied = client.patch("/api/admin/users/2/status", json={"admin_user_id": FACULTY_1, "is_active": False})
    assert denied.status_code == 403

    ok = client.patch("/api/admin/users/2/status", json={"admin_user_id": ADMIN, "is_active": False})
    assert ok.status_code == 200
    assert client.get("/api/admin/stats").json()["total_users"] == 5
