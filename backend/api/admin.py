"""
Admin Module API Endpoints
Supplies metrics for Admin Dashboard cards, user management, and conflict logs.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.database.connection import get_db, transaction
from backend.services.audit_service import log_audit_event

router = APIRouter(prefix="/api/admin", tags=["Admin Operations"])


class CreateUserRequest(BaseModel):
    admin_user_id: int
    username: str
    email: str
    full_name: str
    role_id: int
    phone: Optional[str] = None
    department_id: Optional[int] = 1
    employee_code: Optional[str] = None


class UpdateUserStatusRequest(BaseModel):
    admin_user_id: int
    is_active: bool


@router.get("/stats")
def get_dashboard_stats():
    """Returns high-level statistics for Admin Dashboard cards."""
    with get_db() as conn:
        cur = conn.cursor()

        # Users
        cur.execute("SELECT COUNT(*) AS count FROM users WHERE is_active = 1")
        total_users = cur.fetchone()["count"]

        # Labs
        cur.execute("SELECT COUNT(*) AS count FROM resources WHERE resource_type = 'Lab' AND status = 'ACTIVE'")
        total_labs = cur.fetchone()["count"]

        # Classrooms
        cur.execute("SELECT COUNT(*) AS count FROM resources WHERE resource_type = 'Classroom' AND status = 'ACTIVE'")
        total_classrooms = cur.fetchone()["count"]

        # Active Bookings
        cur.execute("SELECT COUNT(*) AS count FROM bookings WHERE status = 'APPROVED'")
        active_bookings = cur.fetchone()["count"]

        # Pending Requests
        cur.execute("SELECT COUNT(*) AS count FROM bookings WHERE status = 'PENDING'")
        pending_requests = cur.fetchone()["count"]

        # Total Bookings
        cur.execute("SELECT COUNT(*) AS count FROM bookings")
        total_bookings = cur.fetchone()["count"]

        return {
            "total_users": total_users,
            "total_labs": total_labs,
            "total_classrooms": total_classrooms,
            "active_bookings": active_bookings,
            "pending_requests": pending_requests,
            "total_bookings": total_bookings,
        }


@router.get("/users")
def list_users():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT u.user_id, u.username, u.email, u.full_name, u.phone, u.employee_code,
                   u.is_active, u.is_locked, u.last_login_at, u.created_at,
                   r.role_id, r.role_code, r.role_name,
                   d.department_code, d.department_name
            FROM users u
            JOIN roles r ON r.role_id = u.role_id
            LEFT JOIN departments d ON d.department_id = u.department_id
            ORDER BY u.user_id ASC
            """
        )
        return [dict(row) for row in cur.fetchall()]


@router.post("/users")
def create_user(req: CreateUserRequest):
    with transaction() as conn:
        cur = conn.cursor()
        # Verify admin
        cur.execute("SELECT r.role_code FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ?", (req.admin_user_id,))
        caller = cur.fetchone()
        if not caller or caller["role_code"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Only Admins may create users")

        try:
            cur.execute(
                """
                INSERT INTO users (username, email, password_hash, full_name, phone, role_id, department_id, employee_code)
                VALUES (?, ?, 'default_hash', ?, ?, ?, ?, ?)
                """,
                (req.username, str(req.email).lower(), req.full_name, req.phone, req.role_id, req.department_id, req.employee_code),
            )
            new_id = cur.lastrowid
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"User creation failed: {e}")

        log_audit_event(
            conn,
            event_type="USER_CREATED",
            event_category="USER",
            actor_user_id=req.admin_user_id,
            entity_type="USER",
            entity_id=str(new_id),
            reason=f"Created user {req.username}",
        )

        return {"success": True, "user_id": new_id, "message": f"User {req.username} created."}


@router.patch("/users/{user_id}/status")
def toggle_user_active(user_id: int, req: UpdateUserStatusRequest):
    with transaction() as conn:
        cur = conn.cursor()
        cur.execute("SELECT r.role_code FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ?", (req.admin_user_id,))
        caller = cur.fetchone()
        if not caller or caller["role_code"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Only Admins may update user status")

        cur.execute("UPDATE users SET is_active = ? WHERE user_id = ?", (1 if req.is_active else 0, user_id))

        log_audit_event(
            conn,
            event_type="USER_STATUS_CHANGED",
            event_category="USER",
            actor_user_id=req.admin_user_id,
            entity_type="USER",
            entity_id=str(user_id),
            reason=f"Set is_active to {req.is_active}",
        )

        return {"success": True, "message": "User status updated."}
