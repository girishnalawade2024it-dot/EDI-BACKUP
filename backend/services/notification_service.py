"""
Notification Queue Service
Manages in-app notifications and queued messages (DD-10, FR-5.7, SRS §9.4).
"""

import sqlite3
from typing import List, Optional


def create_notification(
    conn: sqlite3.Connection,
    recipient_user_id: int,
    notification_type: str,
    title: str,
    message: str,
    booking_id: Optional[int] = None,
    priority: str = "NORMAL",
    channel: str = "IN_APP",
):
    conn.execute(
        """
        INSERT INTO notifications (
            recipient_user_id, booking_id, notification_type, title, message, channel, priority, delivery_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SENT')
        """,
        (recipient_user_id, booking_id, notification_type, title, message, channel, priority),
    )


def notify_admins(
    conn: sqlite3.Connection,
    notification_type: str,
    title: str,
    message: str,
    booking_id: Optional[int] = None,
):
    """Broadcasts a notification to all Admin accounts."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT user_id FROM users
        JOIN roles ON roles.role_id = users.role_id
        WHERE roles.role_code = 'ADMIN' AND users.is_active = 1
        """
    )
    admins = cur.fetchall()
    for admin in admins:
        create_notification(
            conn,
            recipient_user_id=admin["user_id"],
            notification_type=notification_type,
            title=title,
            message=message,
            booking_id=booking_id,
        )


def get_user_notifications(conn: sqlite3.Connection, user_id: int, limit: int = 50) -> List[dict]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT notification_id, recipient_user_id, booking_id, notification_type,
               title, message, channel, priority, delivery_status, is_read, created_at, read_at
        FROM notifications
        WHERE recipient_user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (user_id, limit),
    )
    return [dict(row) for row in cur.fetchall()]


def mark_notification_read(conn: sqlite3.Connection, notification_id: int, user_id: int) -> bool:
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE notifications
        SET is_read = 1, read_at = datetime('now', 'localtime')
        WHERE notification_id = ? AND recipient_user_id = ?
        """,
        (notification_id, user_id),
    )
    return cur.rowcount > 0
