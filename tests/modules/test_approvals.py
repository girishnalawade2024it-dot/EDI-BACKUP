"""Module: Admin Approvals & Priority Queue (backend/api/approvals.py, backend/services/approval_service.py)"""

from helpers import ADMIN, ASSISTANT_1, ASSISTANT_2, FACULTY_1, book, future


def _pending(client, user_id=ASSISTANT_1, **kw):
    res = book(client, user_id=user_id, **kw).json()
    assert res["status"] == "PENDING"
    return res["booking_id"]


def test_assistant_request_enters_queue(client):
    booking_id = _pending(client)
    queue = client.get("/api/approvals/queue").json()
    assert [q["booking_id"] for q in queue] == [booking_id]


def test_admin_approves_request(client):
    booking_id = _pending(client)
    res = client.post(f"/api/approvals/{booking_id}/approve", json={"admin_user_id": ADMIN})
    assert res.status_code == 200
    assert client.get("/api/approvals/queue").json() == []


def test_non_admin_cannot_approve(client):
    booking_id = _pending(client)
    res = client.post(f"/api/approvals/{booking_id}/approve", json={"admin_user_id": FACULTY_1})
    assert res.status_code == 400


def test_second_admin_decision_is_blocked(client):
    booking_id = _pending(client)
    client.post(f"/api/approvals/{booking_id}/approve", json={"admin_user_id": ADMIN})

    again = client.post(f"/api/approvals/{booking_id}/approve", json={"admin_user_id": ADMIN})
    assert again.status_code == 400
    assert "already been processed" in again.json()["detail"]

    deny = client.post(f"/api/approvals/{booking_id}/deny", json={"admin_user_id": ADMIN, "reason": "REJECTED_BY_APPROVER"})
    assert deny.status_code == 400
    assert "not pending" in deny.json()["detail"]


def test_deny_request(client):
    booking_id = _pending(client)
    res = client.post(f"/api/approvals/{booking_id}/deny", json={"admin_user_id": ADMIN, "reason": "MAINTENANCE"})
    assert res.status_code == 200
    history = client.get("/api/bookings/history?role=Admin&status=DENIED").json()
    assert any(b["booking_id"] == booking_id for b in history)


def test_approving_one_competitor_denies_the_other(client):
    date = future()
    first = _pending(client, user_id=ASSISTANT_1, date=date, start=2, end=2)
    second = _pending(client, user_id=ASSISTANT_2, date=date, start=2, end=2)

    client.post(f"/api/approvals/{first}/approve", json={"admin_user_id": ADMIN})

    statuses = {b["booking_id"]: b["status"] for b in client.get("/api/bookings/history?role=Admin").json()}
    assert statuses[first] == "APPROVED"
    assert statuses[second] in ("DENIED", "REJECTED")


def test_preempt_requires_reason_and_admin(client):
    booking_id = book(client, user_id=FACULTY_1).json()["booking_id"]

    no_reason = client.post(f"/api/approvals/{booking_id}/preempt", json={"admin_user_id": ADMIN, "reason": " "})
    assert no_reason.status_code == 400

    not_admin = client.post(f"/api/approvals/{booking_id}/preempt", json={"admin_user_id": FACULTY_1, "reason": "Exam"})
    assert not_admin.status_code == 400

    ok = client.post(f"/api/approvals/{booking_id}/preempt", json={"admin_user_id": ADMIN, "reason": "University exam"})
    assert ok.status_code == 200
