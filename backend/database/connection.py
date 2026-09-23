"""
Database Connection and Initialization Manager
Configures SQLite in Write-Ahead-Logging (WAL) mode with foreign keys and immediate transactions.
"""

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

DB_DIR = Path(__file__).resolve().parent
DB_FILE = DB_DIR / "rbs.db"
SCHEMA_FILE = DB_DIR / "schema.sql"
SEED_FILE = DB_DIR / "seed_data.sql"


def get_db_path() -> Path:
    return DB_FILE


def init_db(force: bool = False):
    """
    Creates tables and seeds initial data if database does not exist or if forced.
    """
    db_exists = DB_FILE.exists()
    if force and db_exists:
        try:
            DB_FILE.unlink()
        except Exception:
            pass
        db_exists = False

    conn = sqlite3.connect(DB_FILE, timeout=10.0)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")

    # Check if tables already exist
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='roles';")
    roles_table = cursor.fetchone()

    if not roles_table:
        # Load and execute schema
        with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
            schema_sql = f.read()
        conn.executescript(schema_sql)

        # Load and execute seed data
        with open(SEED_FILE, "r", encoding="utf-8") as f:
            seed_sql = f.read()
        conn.executescript(seed_sql)
        conn.commit()

    conn.close()


def get_raw_connection() -> sqlite3.Connection:
    """Returns a raw connection with row factory enabled."""
    conn = sqlite3.connect(DB_FILE, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    return conn


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """Context manager for normal database read/write queries."""
    conn = get_raw_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@contextmanager
def transaction() -> Generator[sqlite3.Connection, None, None]:
    """
    Immediate transaction context manager.
    Begins an immediate write transaction so lock acquisition happens upfront,
    preventing deadlocks and race conditions.
    """
    conn = get_raw_connection()
    conn.isolation_level = None  # Autocommit mode off for explicit manual transactions
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()
