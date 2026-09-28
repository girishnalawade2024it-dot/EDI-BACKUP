"""Constants and helpers shared by the per-module test suites."""

import datetime

# Seeded accounts (backend/database/seed_data.sql)
FACULTY_1 = 1
FACULTY_2 = 2
ASSISTANT_1 = 3
ASSISTANT_2 = 4
ADMIN = 5


def future(days: int = 3) -> str:
    return (datetime.date.today() + datetime.timedelta(days=days)).isoformat()


def book(client, user_id=FACULTY_1, resource_id=1, date=None, start=1, end=1, **extra):
    payload = {
        "user_id": user_id,
        "resource_id": resource_id,
        "booking_date": date or future(),
        "start_slot_id": start,
        "end_slot_id": end,
        "purpose": "Module test",
        **extra,
    }
    return client.post("/api/bookings", json=payload)
