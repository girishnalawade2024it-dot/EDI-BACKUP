-- ============================================================
-- Lab & Classroom Resource Booking Portal — SQLite Schema
-- Implements DB Schema Design Document v1.1 (30 Tables)
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- Module A: Identity & Access Control
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS roles (
    role_id INTEGER PRIMARY KEY,
    role_code TEXT NOT NULL UNIQUE,
    role_name TEXT NOT NULL,
    priority_rank INTEGER NOT NULL,
    can_approve INTEGER NOT NULL DEFAULT 0,
    is_auto_approved INTEGER NOT NULL DEFAULT 0,
    can_preempt INTEGER NOT NULL DEFAULT 0,
    max_advance_days INTEGER NOT NULL DEFAULT 30,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS permissions (
    permission_id INTEGER PRIMARY KEY AUTOINCREMENT,
    permission_code TEXT NOT NULL UNIQUE,
    module TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER NOT NULL,
    permission_id INTEGER NOT NULL,
    granted_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles (role_id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions (permission_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS departments (
    department_id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_code TEXT NOT NULL UNIQUE,
    department_name TEXT NOT NULL,
    hod_user_id INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT,
    full_name TEXT NOT NULL,
    phone TEXT,
    role_id INTEGER NOT NULL,
    department_id INTEGER,
    employee_code TEXT UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_locked INTEGER NOT NULL DEFAULT 0,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (role_id) REFERENCES roles (role_id) ON DELETE RESTRICT,
    FOREIGN KEY (department_id) REFERENCES departments (department_id)
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role_id, is_active);
CREATE INDEX IF NOT EXISTS idx_users_dept ON users (department_id);

CREATE TABLE IF NOT EXISTS user_sessions (
    session_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    issued_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    expires_at TEXT NOT NULL,
    last_activity_at TEXT NOT NULL,
    is_valid INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_valid ON user_sessions (user_id, is_valid, expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
    attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username_attempted TEXT NOT NULL,
    user_id INTEGER,
    ip_address TEXT,
    is_successful INTEGER NOT NULL,
    failure_reason TEXT,
    attempted_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_login_ip_time ON login_attempts (ip_address, attempted_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    is_used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Module B: Resource Master (Fixed Inventory of 11 Rooms)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blocks (
    block_id INTEGER PRIMARY KEY,
    block_code TEXT NOT NULL UNIQUE,
    block_name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS resources (
    resource_id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL UNIQUE,
    resource_type TEXT NOT NULL CHECK (resource_type IN ('Lab', 'Classroom')),
    block_id INTEGER NOT NULL,
    floor_number INTEGER,
    capacity INTEGER,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'UNDER_MAINTENANCE')),
    min_role_priority INTEGER NOT NULL DEFAULT 3,
    requires_approval INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (block_id) REFERENCES blocks (block_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_resources_type_status ON resources (resource_type, status);
CREATE INDEX IF NOT EXISTS idx_resources_block ON resources (block_id);

CREATE TABLE IF NOT EXISTS laboratories (
    resource_id INTEGER PRIMARY KEY,
    lab_name TEXT,
    has_machines INTEGER NOT NULL DEFAULT 1,
    machine_count INTEGER NOT NULL DEFAULT 0,
    os_installed TEXT,
    has_projector INTEGER NOT NULL DEFAULT 0,
    has_ac INTEGER NOT NULL DEFAULT 0,
    lab_incharge_user_id INTEGER,
    last_maintenance_date TEXT,
    FOREIGN KEY (resource_id) REFERENCES resources (resource_id) ON DELETE CASCADE,
    FOREIGN KEY (lab_incharge_user_id) REFERENCES users (user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS classrooms (
    resource_id INTEGER PRIMARY KEY,
    seating_type TEXT NOT NULL DEFAULT 'BENCH' CHECK (seating_type IN ('BENCH', 'CHAIR', 'TIERED')),
    has_projector INTEGER NOT NULL DEFAULT 0,
    has_smart_board INTEGER NOT NULL DEFAULT 0,
    has_ac INTEGER NOT NULL DEFAULT 0,
    board_type TEXT CHECK (board_type IN ('WHITE', 'BLACK', 'GREEN', 'SMART')),
    is_exam_approved INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (resource_id) REFERENCES resources (resource_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS resource_equipment (
    equipment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id INTEGER NOT NULL,
    equipment_name TEXT NOT NULL,
    equipment_type TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    working_condition TEXT NOT NULL DEFAULT 'WORKING' CHECK (working_condition IN ('WORKING', 'FAULTY', 'UNDER_REPAIR')),
    remarks TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (resource_id) REFERENCES resources (resource_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS resource_unavailability (
    unavailability_id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id INTEGER NOT NULL,
    reason_type TEXT NOT NULL CHECK (reason_type IN ('MAINTENANCE', 'REPAIR', 'EXAM', 'EVENT', 'ADMIN_BLOCK')),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    start_slot_id INTEGER,
    end_slot_id INTEGER,
    reason_text TEXT NOT NULL,
    raised_by_user_id INTEGER NOT NULL,
    approved_by_user_id INTEGER,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (resource_id) REFERENCES resources (resource_id) ON DELETE CASCADE,
    FOREIGN KEY (start_slot_id) REFERENCES time_slots (slot_id),
    FOREIGN KEY (end_slot_id) REFERENCES time_slots (slot_id),
    FOREIGN KEY (raised_by_user_id) REFERENCES users (user_id) ON DELETE RESTRICT,
    FOREIGN KEY (approved_by_user_id) REFERENCES users (user_id) ON DELETE RESTRICT
);

-- ------------------------------------------------------------
-- Module C: Booking Core & Scheduling
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS time_slots (
    slot_id INTEGER PRIMARY KEY,
    slot_code TEXT NOT NULL UNIQUE,
    slot_name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    slot_order INTEGER NOT NULL UNIQUE,
    duration_minutes INTEGER NOT NULL,
    is_break INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS academic_calendar (
    calendar_date TEXT PRIMARY KEY,
    day_type TEXT NOT NULL CHECK (day_type IN ('WORKING', 'HOLIDAY', 'WEEKEND', 'EXAM', 'VACATION')),
    description TEXT,
    is_bookable INTEGER NOT NULL DEFAULT 1,
    academic_term TEXT
);

CREATE TABLE IF NOT EXISTS booking_recurrence (
    recurrence_id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL CHECK (pattern IN ('DAILY', 'WEEKLY', 'MONTHLY')),
    interval_value INTEGER NOT NULL DEFAULT 1,
    days_of_week TEXT,
    series_start_date TEXT NOT NULL,
    series_end_date TEXT NOT NULL,
    occurrence_count INTEGER NOT NULL,
    created_by_user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (created_by_user_id) REFERENCES users (user_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS bookings (
    booking_id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_reference TEXT NOT NULL UNIQUE,
    resource_id INTEGER NOT NULL,
    requested_by_user_id INTEGER NOT NULL,
    booking_date TEXT NOT NULL,
    start_slot_id INTEGER NOT NULL,
    end_slot_id INTEGER NOT NULL,
    purpose TEXT NOT NULL,
    booking_type TEXT NOT NULL CHECK (booking_type IN ('LECTURE', 'LAB_SESSION', 'EXAM', 'EVENT', 'WORKSHOP', 'MAINTENANCE', 'OTHER', 'ACADEMIC')),
    expected_headcount INTEGER,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'DENIED', 'CANCELLED', 'PREEMPTED', 'COMPLETED', 'EXPIRED')),
    priority_rank INTEGER NOT NULL,
    recurrence_id INTEGER,
    requested_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    decided_at TEXT,
    approved_by_user_id INTEGER,
    decision_reason TEXT,
    decision_note TEXT,
    cancelled_at TEXT,
    cancellation_reason TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (resource_id) REFERENCES resources (resource_id) ON DELETE RESTRICT,
    FOREIGN KEY (requested_by_user_id) REFERENCES users (user_id) ON DELETE RESTRICT,
    FOREIGN KEY (approved_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL,
    FOREIGN KEY (start_slot_id) REFERENCES time_slots (slot_id),
    FOREIGN KEY (end_slot_id) REFERENCES time_slots (slot_id),
    FOREIGN KEY (recurrence_id) REFERENCES booking_recurrence (recurrence_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_resource_date ON bookings (resource_id, booking_date, status);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings (requested_by_user_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status_pending ON bookings (status, priority_rank, requested_at);

-- Booking schedule occupancy ledger (DD-3, DD-4, DD-5)
CREATE TABLE IF NOT EXISTS booking_schedule (
    schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER,
    unavailability_id INTEGER,
    resource_id INTEGER NOT NULL,
    schedule_date TEXT NOT NULL,
    slot_id INTEGER NOT NULL,
    occupancy_state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (occupancy_state IN ('ACTIVE', 'RELEASED')),
    lock_flag INTEGER GENERATED ALWAYS AS (CASE WHEN occupancy_state = 'ACTIVE' THEN 1 ELSE NULL END) STORED,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (booking_id) REFERENCES bookings (booking_id) ON DELETE CASCADE,
    FOREIGN KEY (unavailability_id) REFERENCES resource_unavailability (unavailability_id) ON DELETE CASCADE,
    FOREIGN KEY (resource_id) REFERENCES resources (resource_id) ON DELETE RESTRICT,
    FOREIGN KEY (slot_id) REFERENCES time_slots (slot_id) ON DELETE RESTRICT
);

-- Layer 3: Declarative uniqueness constraint on active occupancy
CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_slot_lock ON booking_schedule (resource_id, schedule_date, slot_id, lock_flag);
CREATE INDEX IF NOT EXISTS idx_schedule_lookup ON booking_schedule (resource_id, schedule_date, occupancy_state);
CREATE INDEX IF NOT EXISTS idx_schedule_booking ON booking_schedule (booking_id);

CREATE TABLE IF NOT EXISTS booking_approvals (
    approval_id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    approver_user_id INTEGER,
    approval_level INTEGER NOT NULL DEFAULT 1,
    decision TEXT NOT NULL DEFAULT 'PENDING' CHECK (decision IN ('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED', 'AUTO_APPROVED')),
    decision_reason TEXT,
    is_priority_override INTEGER NOT NULL DEFAULT 0,
    assigned_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    decided_at TEXT,
    turnaround_minutes INTEGER,
    FOREIGN KEY (booking_id) REFERENCES bookings (booking_id) ON DELETE CASCADE,
    FOREIGN KEY (approver_user_id) REFERENCES users (user_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_approvals_approver ON booking_approvals (approver_user_id, decision);
CREATE INDEX IF NOT EXISTS idx_approvals_booking ON booking_approvals (booking_id);

CREATE TABLE IF NOT EXISTS booking_conflicts (
    conflict_id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id INTEGER NOT NULL,
    conflict_date TEXT NOT NULL,
    slot_id INTEGER NOT NULL,
    requesting_booking_id INTEGER,
    existing_booking_id INTEGER,
    conflict_type TEXT NOT NULL CHECK (conflict_type IN ('HARD_OVERLAP', 'SOFT_COMPETING', 'RACE_CONDITION', 'MAINTENANCE_BLOCK', 'CAPACITY', 'CALENDAR_CLOSED')),
    resolution TEXT NOT NULL CHECK (resolution IN ('AUTO_REJECTED', 'PRIORITY_RESOLVED', 'MANUAL_RESOLVED', 'ALTERNATIVE_OFFERED', 'PREEMPTED', 'UNRESOLVED')),
    resolved_by_user_id INTEGER,
    detected_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    resolved_at TEXT,
    FOREIGN KEY (resource_id) REFERENCES resources (resource_id) ON DELETE RESTRICT,
    FOREIGN KEY (slot_id) REFERENCES time_slots (slot_id),
    FOREIGN KEY (requesting_booking_id) REFERENCES bookings (booking_id) ON DELETE CASCADE,
    FOREIGN KEY (existing_booking_id) REFERENCES bookings (booking_id) ON DELETE SET NULL,
    FOREIGN KEY (resolved_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS booking_locks (
    lock_id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id INTEGER NOT NULL,
    lock_date TEXT NOT NULL,
    held_by_session TEXT,
    acquired_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE (resource_id, lock_date),
    FOREIGN KEY (resource_id) REFERENCES resources (resource_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS booking_status_history (
    history_id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    changed_by_user_id INTEGER,
    change_reason TEXT,
    changed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (booking_id) REFERENCES bookings (booking_id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- Module D: Reports, Notifications & Administration
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS report_definitions (
    report_id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_code TEXT NOT NULL UNIQUE,
    report_name TEXT NOT NULL,
    report_category TEXT NOT NULL CHECK (report_category IN ('UTILISATION', 'BOOKING', 'CONFLICT', 'USER', 'AUDIT', 'SYSTEM')),
    description TEXT,
    min_role_priority INTEGER NOT NULL DEFAULT 1,
    default_format TEXT NOT NULL DEFAULT 'HTML' CHECK (default_format IN ('HTML', 'CSV', 'PDF', 'XLSX')),
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS report_executions (
    execution_id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    executed_by_user_id INTEGER NOT NULL,
    parameters_json TEXT,
    output_format TEXT NOT NULL CHECK (output_format IN ('HTML', 'CSV', 'PDF', 'XLSX')),
    file_path TEXT,
    file_size_bytes INTEGER,
    row_count INTEGER,
    execution_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
    error_message TEXT,
    executed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (report_id) REFERENCES report_definitions (report_id) ON DELETE RESTRICT,
    FOREIGN KEY (executed_by_user_id) REFERENCES users (user_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS notification_templates (
    template_id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_code TEXT NOT NULL UNIQUE,
    channel TEXT NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP', 'EMAIL', 'BOTH')),
    subject_template TEXT,
    body_template TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS notifications (
    notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_user_id INTEGER NOT NULL,
    template_id INTEGER,
    booking_id INTEGER,
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP', 'EMAIL', 'BOTH')),
    priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    delivery_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING', 'SENT', 'FAILED', 'READ')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    sent_at TEXT,
    read_at TEXT,
    FOREIGN KEY (recipient_user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES notification_templates (template_id) ON DELETE SET NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings (booking_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notif_queue ON notifications (delivery_status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications (recipient_user_id, is_read);

-- Append-only audit log (DD-7, FR-8.1 – FR-8.6)
CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    event_category TEXT NOT NULL CHECK (event_category IN ('AUTH', 'BOOKING', 'RESOURCE', 'USER', 'REPORT', 'SYSTEM', 'SECURITY')),
    actor_user_id INTEGER,
    actor_username TEXT,
    actor_role_code TEXT,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    previous_value TEXT,
    new_value TEXT,
    reason TEXT,
    ip_address TEXT,
    session_id TEXT,
    is_successful INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (actor_user_id) REFERENCES users (user_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor_time ON audit_logs (actor_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_category_time ON audit_logs (event_category, created_at);

-- Trigger: Enforce append-only on audit_logs (DD-7)
CREATE TRIGGER IF NOT EXISTS trg_audit_no_update
BEFORE UPDATE ON audit_logs
BEGIN
    SELECT RAISE(ABORT, 'audit_logs is append-only: updates are forbidden (DD-7).');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_no_delete
BEFORE DELETE ON audit_logs
BEGIN
    SELECT RAISE(ABORT, 'audit_logs is append-only: deletes are forbidden (DD-7).');
END;

CREATE TABLE IF NOT EXISTS backup_history (
    backup_id INTEGER PRIMARY KEY AUTOINCREMENT,
    backup_type TEXT NOT NULL CHECK (backup_type IN ('FULL', 'INCREMENTAL', 'SCHEMA_ONLY', 'TABLE_LEVEL')),
    trigger_mode TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (trigger_mode IN ('SCHEDULED', 'MANUAL')),
    initiated_by_user_id INTEGER,
    file_path TEXT NOT NULL,
    file_size_bytes INTEGER,
    checksum_sha256 TEXT,
    status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
    error_message TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    completed_at TEXT,
    restored_at TEXT,
    retention_until TEXT,
    FOREIGN KEY (initiated_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS system_config (
    config_key TEXT PRIMARY KEY,
    config_value TEXT NOT NULL,
    data_type TEXT NOT NULL CHECK (data_type IN ('INT', 'STRING', 'BOOLEAN', 'TIME', 'JSON')),
    description TEXT,
    updated_by_user_id INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (updated_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL
);
