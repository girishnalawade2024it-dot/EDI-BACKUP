"""
Audit Logging Service
Enforces append-only audit trail capturing every state change (DD-7, FR-8.1 - FR-8.6).
Triggers in the database reject any UPDATE or DELETE on audit_logs.
"""

import json
import sqlite3
from typing import Any, Optional


def log_audit_event(
    conn: sqlite3.Connection,
    event_type: str,
    event_category: str,
    actor_user_id: Optional[int],
    entity_type: str,
    entity_id: Optional[str] = None,
    previous_value: Optional[Any] = None,
    new_value: Optional[Any] = None,
    reason: Optional[str] = None,
    ip_address: Optional[str] = None,
    session_id: Optional[str] = None,
    is_successful: bool = True,
):
    """
    Inserts an append-only audit record into audit_logs.
    Captures snapshot of actor username and role code at write time.
    """
    actor_username = None
    actor_role_code = None

    if actor_user_id:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT u.username, r.role_code 
            FROM users u
            JOIN roles r ON r.role_id = u.role_id
            WHERE u.user_id = ?
            """,
            (actor_user_id,),
        )
        row = cur.fetchone()
        if row:
            actor_username = row["username"]
            actor_role_code = row["role_code"]

    prev_json = json.dumps(previous_value) if previous_value is not None else None
    new_json = json.dumps(new_value) if new_value is not None else None

    conn.execute(
        """
        INSERT INTO audit_logs (
            event_type, event_category, actor_user_id, actor_username, actor_role_code,
            entity_type, entity_id, previous_value, new_value, reason,
            ip_address, session_id, is_successful
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event_type,
            event_category,
            actor_user_id,
            actor_username,
            actor_role_code,
            entity_type,
            str(entity_id) if entity_id is not None else None,
            prev_json,
            new_json,
            reason,
            ip_address,
            session_id,
            1 if is_successful else 0,
        ),
    )
