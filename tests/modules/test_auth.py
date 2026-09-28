"""Module: Authentication & Sessions (backend/api/auth.py)"""

import pytest


@pytest.mark.parametrize(
    "email, role, dashboard",
    [
        ("anjali.deshmukh@college.edu", "Faculty", "/faculty/dashboard.html"),
        ("amit.patil@college.edu", "Lab Assistant", "/assistant/dashboard.html"),
        ("admin@college.edu", "Admin", "/admin/dashboard.html"),
    ],
)
def test_login_routes_each_role_to_its_dashboard(client, email, role, dashboard):
    res = client.post("/api/auth/login", json={"email": email})
    assert res.status_code == 200
    data = res.json()
    assert data["role"] == role
    assert data["redirect_url"] == dashboard
    assert data["session_id"]


def test_login_is_case_insensitive(client):
    res = client.post("/api/auth/login", json={"email": "  ADMIN@College.edu "})
    assert res.status_code == 200
    assert res.json()["role"] == "Admin"


def test_unknown_email_is_rejected(client):
    res = client.post("/api/auth/login", json={"email": "nobody@college.edu"})
    assert res.status_code == 401


def test_me_requires_a_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer bogus"}).status_code == 401


def test_session_lifecycle_login_me_logout(client):
    token = client.post("/api/auth/login", json={"email": "anjali.deshmukh@college.edu"}).json()["session_id"]
    headers = {"Authorization": f"Bearer {token}"}

    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["role_code"] == "FACULTY"

    assert client.post("/api/auth/logout", headers=headers).json()["success"] is True
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_disabled_account_cannot_log_in(client):
    client.patch("/api/admin/users/2/status", json={"admin_user_id": 5, "is_active": False})
    res = client.post("/api/auth/login", json={"email": "rahul.kulkarni@college.edu"})
    assert res.status_code == 403
