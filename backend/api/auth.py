"""
Authentication & Session API Endpoints
SRS FR-1.1 - FR-1.6
"""

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel

from backend.database.connection import get_db, transaction
from backend.services.audit_service import log_audit_event

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    email: str
    password: Optional[str] = None


class LoginResponse(BaseModel):
    success: bool
    session_id: str
    user_id: int
    name: str
    email: str
    role: str
    role_id: int
    can_override: bool
    redirect_url: str


ROLE_DASHBOARDS = {
    "Faculty": "/faculty/dashboard.html",
    "Lab Assistant": "/assistant/dashboard.html",
    "Admin": "/admin/dashboard.html",
}


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, request: Request):
    client_ip = request.client.host if request.client else None
    email_clean = str(req.email).strip().lower()

    with transaction() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT u.user_id, u.username, u.email, u.full_name, u.is_active, u.is_locked,
                   r.role_id, r.role_code, r.role_name, r.can_preempt
            FROM users u
            JOIN roles r ON r.role_id = u.role_id
            WHERE LOWER(u.email) = ?
            """,
            (email_clean,),
        )
        user = cur.fetchone()

        if not user:
            cur.execute(
                """
                INSERT INTO login_attempts (username_attempted, ip_address, is_successful, failure_reason)
                VALUES (?, ?, 0, 'NO_SUCH_USER')
                """,
                (email_clean, client_ip),
            )
            raise HTTPException(status_code=401, detail="Invalid email address.")

        if not user["is_active"] or user["is_locked"]:
            cur.execute(
                """
                INSERT INTO login_attempts (username_attempted, user_id, ip_address, is_successful, failure_reason)
                VALUES (?, ?, ?, 0, 'ACCOUNT_LOCKED')
                """,
                (email_clean, user["user_id"], client_ip),
            )
            raise HTTPException(status_code=403, detail="Account is disabled or locked.")

        # In production, check bcrypt(password). Per project spec & existing demo, email login succeeds.
        session_id = uuid.uuid4().hex

        # Create session record (expires in 30 days or default session duration)
        cur.execute(
            """
            INSERT INTO user_sessions (session_id, user_id, ip_address, user_agent, expires_at, last_activity_at, is_valid)
            VALUES (?, ?, ?, ?, datetime('now', '+30 days'), datetime('now', 'localtime'), 1)
            """,
            (session_id, user["user_id"], client_ip, request.headers.get("user-agent")),
        )

        cur.execute(
            "UPDATE users SET last_login_at = datetime('now', 'localtime') WHERE user_id = ?",
            (user["user_id"],),
        )

        cur.execute(
            """
            INSERT INTO login_attempts (username_attempted, user_id, ip_address, is_successful)
            VALUES (?, ?, ?, 1)
            """,
            (email_clean, user["user_id"], client_ip),
        )

        log_audit_event(
            conn,
            event_type="AUTH_LOGIN",
            event_category="AUTH",
            actor_user_id=user["user_id"],
            entity_type="USER_SESSION",
            entity_id=session_id,
            reason="User logged in",
            ip_address=client_ip,
            is_successful=True,
        )

        role_name = user["role_name"]
        return LoginResponse(
            success=True,
            session_id=session_id,
            user_id=user["user_id"],
            name=user["full_name"],
            email=user["email"],
            role=role_name,
            role_id=user["role_id"],
            can_override=bool(user["can_preempt"]),
            redirect_url=ROLE_DASHBOARDS.get(role_name, "/login.html"),
        )


@router.get("/me")
def get_current_user_info(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Session token required")

    token = authorization.replace("Bearer ", "").strip()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.session_id, s.is_valid, s.expires_at,
                   u.user_id, u.username, u.email, u.full_name,
                   r.role_id, r.role_code, r.role_name, r.can_preempt, r.priority_rank
            FROM user_sessions s
            JOIN users u ON u.user_id = s.user_id
            JOIN roles r ON r.role_id = u.role_id
            WHERE s.session_id = ? AND s.is_valid = 1
            """,
            (token,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Invalid or expired session")

        return {
            "user_id": row["user_id"],
            "username": row["username"],
            "email": row["email"],
            "full_name": row["full_name"],
            "role": row["role_name"],
            "role_code": row["role_code"],
            "role_id": row["role_id"],
            "priority_rank": row["priority_rank"],
            "can_override": bool(row["can_preempt"]),
        }


@router.post("/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        with transaction() as conn:
            conn.execute("UPDATE user_sessions SET is_valid = 0 WHERE session_id = ?", (token,))
    return {"success": True, "message": "Logged out successfully"}
