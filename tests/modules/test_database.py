"""Module: Database schema & constraints (backend/database/)"""

import sqlite3

import pytest

from backend.database.connection import get_db
from helpers import future


def test_seed_counts():
    with get_db() as conn:
        count = lambda t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        assert count("roles") == 3
        assert count("users") == 6
        assert count("resources") == 11
        assert count("time_slots") == 10


def test_foreign_keys_enforced():
    with pytest.raises(sqlite3.IntegrityError):
        with get_db() as conn:
            conn.execute(
                "INSERT INTO bookings (booking_reference, resource_id, requested_by_user_id, booking_date, "
                "start_slot_id, end_slot_id, purpose, booking_type, priority_rank) "
                "VALUES ('BK-X', 999, 1, '2030-01-01', 1, 1, 'x', 'ACADEMIC', 1)"
            )


def test_unique_index_blocks_double_active_occupancy():
    date = future()
    with pytest.raises(sqlite3.IntegrityError):
        with get_db() as conn:
            for _ in range(2):
                conn.execute(
                    "INSERT INTO booking_schedule (resource_id, schedule_date, slot_id, occupancy_state) "
                    "VALUES (1, ?, 1, 'ACTIVE')",
                    (date,),
                )


def test_released_rows_do_not_block_rebooking():
    date = future()
    with get_db() as conn:
        for state in ("RELEASED", "RELEASED", "ACTIVE"):
            conn.execute(
                "INSERT INTO booking_schedule (resource_id, schedule_date, slot_id, occupancy_state) VALUES (1, ?, 1, ?)",
                (date, state),
            )
        assert conn.execute("SELECT COUNT(*) FROM booking_schedule").fetchone()[0] == 3


def test_expected_indexes_exist():
    with get_db() as conn:
        names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'index'")}
    for idx in ("uq_schedule_slot_lock", "idx_bookings_resource_date", "idx_bookings_status_pending", "idx_schedule_lookup"):
        assert idx in names


def test_wal_mode_enabled():
    with get_db() as conn:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
