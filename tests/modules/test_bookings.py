"""Module: Bookings (backend/api/bookings.py, backend/services/booking_service.py)"""

import concurrent.futures
import datetime

from helpers import ADMIN, FACULTY_1, FACULTY_2, book, future


def test_faculty_booking_is_auto_approved(client):
    res = book(client)
    assert res.status_code == 200
    assert res.json()["status"] == "APPROVED"


def test_rejects_past_date(client):
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    res = book(client, date=yesterday)
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "PAST_DATE"


def test_rejects_invalid_ranges(client):
    assert book(client, start=3, end=2).json()["detail"]["code"] == "INVALID_RANGE"
    assert book(client, start=6, end=10).json()["detail"]["code"] == "TOO_LONG"


def test_rejects_break_slot(client):
    res = book(client, start=4, end=6)  # slot 5 is the lunch break
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "INVALID_SLOT"


def test_rejects_headcount_over_capacity(client):
    res = book(client, resource_id=5, expected_headcount=50)  # MB 407 A seats 30
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "CAPACITY_EXCEEDED"


def test_conflict_returns_409_with_alternatives(client):
    date = future()
    assert book(client, user_id=FACULTY_1, date=date, start=2, end=3).status_code == 200

    res = book(client, user_id=FACULTY_2, date=date, start=3, end=3, expected_headcount=35)
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert detail["code"] == "SLOT_TAKEN"
    assert detail["alternatives"], "expected at least one alternative room"
    for alt in detail["alternatives"]:
        assert alt["resource_type"] == "Lab"
        assert alt["capacity"] >= 35
        assert alt["resource_id"] != 1


def test_back_to_back_slots_do_not_conflict(client):
    date = future()
    assert book(client, user_id=FACULTY_1, date=date, start=1, end=1).status_code == 200
    assert book(client, user_id=FACULTY_2, date=date, start=2, end=2).status_code == 200


def test_ten_concurrent_requests_only_one_wins(client):
    date = future(4)

    def attempt(i):
        return book(client, user_id=FACULTY_1 if i % 2 else FACULTY_2, date=date, start=2, end=2).status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        codes = list(pool.map(attempt, range(10)))

    assert codes.count(200) == 1
    assert codes.count(409) == 9


def test_recurring_series_reports_each_occurrence(client):
    start = datetime.date.today() + datetime.timedelta(days=1)
    end = start + datetime.timedelta(days=13)
    # Occupy one date in the middle of the series first
    blocked = start + datetime.timedelta(days=7)
    book(client, user_id=FACULTY_2, date=blocked.isoformat(), start=1, end=1)

    day = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][start.weekday()]
    res = client.post(
        "/api/bookings/recurring",
        json={
            "user_id": FACULTY_1,
            "resource_id": 1,
            "pattern": "WEEKLY",
            "series_start_date": start.isoformat(),
            "series_end_date": end.isoformat(),
            "start_slot_id": 1,
            "end_slot_id": 1,
            "purpose": "Weekly lab",
            "days_of_week": [day],
        },
    ).json()
    assert res["total_requested"] == 2
    assert res["successful_count"] == 1
    assert res["conflict_count"] == 1
    statuses = {o["date"]: o["status"] for o in res["occurrences"]}
    assert statuses[blocked.isoformat()] == "CONFLICT"


def test_history_and_calendar(client):
    date = future()
    book(client, date=date, start=1, end=2)
    history = client.get(f"/api/bookings/history?user_id={FACULTY_1}").json()
    assert len(history) == 1
    calendar = client.get(f"/api/bookings/calendar?start_date={date}").json()
    assert len(calendar) == 2


def test_cancel_rules(client):
    booking_id = book(client, user_id=FACULTY_1, date=future(5)).json()["booking_id"]

    other = client.post(f"/api/bookings/{booking_id}/cancel", json={"user_id": FACULTY_2})
    assert other.status_code == 400

    own = client.post(f"/api/bookings/{booking_id}/cancel", json={"user_id": FACULTY_1, "reason": "Moved"})
    assert own.status_code == 200

    again = client.post(f"/api/bookings/{booking_id}/cancel", json={"user_id": ADMIN})
    assert again.status_code == 400


def test_cancel_releases_slot_for_rebooking(client):
    date = future(5)
    booking_id = book(client, user_id=FACULTY_1, date=date).json()["booking_id"]
    client.post(f"/api/bookings/{booking_id}/cancel", json={"user_id": FACULTY_1})
    assert book(client, user_id=FACULTY_2, date=date).status_code == 200
