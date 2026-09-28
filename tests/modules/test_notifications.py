"""Module: Notifications (backend/api/notifications.py, backend/services/notification_service.py)"""

from helpers import ADMIN, ASSISTANT_1, FACULTY_1, FACULTY_2, book


def test_booking_notifies_requester(client):
    book(client, user_id=FACULTY_1)
    notes = client.get(f"/api/notifications?user_id={FACULTY_1}").json()
    assert any(n["notification_type"] == "BOOKING_APPROVED" for n in notes)


def test_pending_request_notifies_admins(client):
    book(client, user_id=ASSISTANT_1)
    notes = client.get(f"/api/notifications?user_id={ADMIN}").json()
    assert any(n["notification_type"] == "BOOKING_PENDING" for n in notes)


def test_mark_read(client):
    book(client, user_id=FACULTY_1)
    note_id = client.get(f"/api/notifications?user_id={FACULTY_1}").json()[0]["notification_id"]

    res = client.patch(f"/api/notifications/{note_id}/read?user_id={FACULTY_1}")
    assert res.status_code == 200
    note = client.get(f"/api/notifications?user_id={FACULTY_1}").json()[0]
    assert note["is_read"] == 1


def test_cannot_mark_someone_elses_notification(client):
    book(client, user_id=FACULTY_1)
    note_id = client.get(f"/api/notifications?user_id={FACULTY_1}").json()[0]["notification_id"]
    res = client.patch(f"/api/notifications/{note_id}/read?user_id={FACULTY_2}")
    assert res.status_code == 404
