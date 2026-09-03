-- =========================================
-- EDI Project - Seed / Test Data
-- Based on SRS v1.0
-- =========================================

-- =========================================
-- 1. ROLES
-- =========================================

INSERT INTO roles (role_name, can_override)
VALUES
    ('Faculty', FALSE),
    ('Lab Assistant', FALSE),
    ('Admin', TRUE);


-- =========================================
-- 2. USERS
-- =========================================

INSERT INTO users
    (role_id, name, email, password_hash, last_login_at)
VALUES
    (1, 'Dr. Anjali Deshmukh',
     'anjali.deshmukh@college.edu',
     'test_hash_faculty_1',
     CURRENT_TIMESTAMP),

    (1, 'Prof. Rahul Kulkarni',
     'rahul.kulkarni@college.edu',
     'test_hash_faculty_2',
     CURRENT_TIMESTAMP),

    (2, 'Amit Patil',
     'amit.patil@college.edu',
     'test_hash_labassistant_1',
     CURRENT_TIMESTAMP),

    (2, 'Sneha Joshi',
     'sneha.joshi@college.edu',
     'test_hash_labassistant_2',
     NULL),

    (3, 'Admin User',
     'admin@college.edu',
     'test_hash_admin',
     CURRENT_TIMESTAMP);


-- =========================================
-- 3. RESOURCES
-- EXACTLY 11 RESOURCES FROM SRS §3.6
-- =========================================

INSERT INTO resources
    (room_code, resource_type, block, has_machines, capacity, notes, status)
VALUES

    -- Labs
    ('MB 409', 'Lab', 'MB', TRUE, NULL,
     'Machines available', 'ACTIVE'),

    ('MB 412', 'Lab', 'MB', FALSE, NULL,
     'Without machines', 'ACTIVE'),

    ('MB 413', 'Lab', 'MB', TRUE, NULL,
     'Machines available', 'ACTIVE'),

    ('MB 414', 'Lab', 'MB', TRUE, NULL,
     'Machines available', 'ACTIVE'),

    ('MB 407 A', 'Lab', 'MB', TRUE, NULL,
     'Machines available', 'ACTIVE'),

    ('MB 407 B', 'Lab', 'MB', TRUE, NULL,
     'Machines available', 'ACTIVE'),

    ('MB 408 A', 'Lab', 'MB', TRUE, NULL,
     'Machines available', 'ACTIVE'),

    ('MB 408 B', 'Lab', 'MB', TRUE, NULL,
     'Machines available', 'ACTIVE'),

    -- Classrooms
    ('AC 301', 'Classroom', 'AC', FALSE, NULL,
     NULL, 'ACTIVE'),

    ('AC 304', 'Classroom', 'AC', FALSE, NULL,
     NULL, 'ACTIVE'),

    ('AC 401', 'Classroom', 'AC', FALSE, NULL,
     NULL, 'ACTIVE');


-- =========================================
-- 4. BOOKINGS
-- Covers different states from SRS §6
-- =========================================

-- APPROVED
INSERT INTO bookings
    (resource_id, requested_by, booking_type,
     start_at, end_at, purpose, headcount,
     status, approved_by,
     decision_reason, decision_note,
     decided_at, cancelled_at, series_id)
VALUES
    (
        1, 1, 'Academic Session',
        '2026-09-07 09:00:00',
        '2026-09-07 11:00:00',
        'Data Structures Lecture',
        40,
        'APPROVED',
        5,
        NULL,
        'Approved for academic session',
        CURRENT_TIMESTAMP,
        NULL,
        NULL
    );

-- PENDING
INSERT INTO bookings
    (resource_id, requested_by, booking_type,
     start_at, end_at, purpose, headcount,
     status, approved_by,
     decision_reason, decision_note,
     decided_at, cancelled_at, series_id)
VALUES
    (
        2, 3, 'Maintenance',
        '2026-09-08 10:00:00',
        '2026-09-08 12:00:00',
        'Laboratory maintenance and servicing',
        NULL,
        'PENDING',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL
    );

-- DENIED
INSERT INTO bookings
    (resource_id, requested_by, booking_type,
     start_at, end_at, purpose, headcount,
     status, approved_by,
     decision_reason, decision_note,
     decided_at, cancelled_at, series_id)
VALUES
    (
        1, 2, 'Academic Session',
        '2026-09-07 10:00:00',
        '2026-09-07 12:00:00',
        'Operating Systems Lecture',
        35,
        'DENIED',
        5,
        'SLOT_TAKEN',
        'Requested slot overlaps an approved booking',
        CURRENT_TIMESTAMP,
        NULL,
        NULL
    );

-- CANCELLED
INSERT INTO bookings
    (resource_id, requested_by, booking_type,
     start_at, end_at, purpose, headcount,
     status, approved_by,
     decision_reason, decision_note,
     decided_at, cancelled_at, series_id)
VALUES
    (
        9, 1, 'Academic Session',
        '2026-09-04 13:00:00',
        '2026-09-04 15:00:00',
        'Software Engineering Lecture',
        45,
        'CANCELLED',
        5,
        NULL,
        'Booking cancelled by requester',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        NULL
    );

-- PREEMPTED
INSERT INTO bookings
    (resource_id, requested_by, booking_type,
     start_at, end_at, purpose, headcount,
     status, approved_by,
     decision_reason, decision_note,
     decided_at, cancelled_at, series_id)
VALUES
    (
        10, 2, 'Academic Session',
        '2026-09-03 10:00:00',
        '2026-09-03 12:00:00',
        'Computer Networks Lecture',
        40,
        'PREEMPTED',
        5,
        'Administrative requirement',
        'Booking reassigned by Admin',
        CURRENT_TIMESTAMP,
        NULL,
        NULL
    );

-- COMPLETED
INSERT INTO bookings
    (resource_id, requested_by, booking_type,
     start_at, end_at, purpose, headcount,
     status, approved_by,
     decision_reason, decision_note,
     decided_at, cancelled_at, series_id)
VALUES
    (
        3, 1, 'Academic Session',
        '2026-08-25 09:00:00',
        '2026-08-25 11:00:00',
        'Database Management Systems Practical',
        30,
        'COMPLETED',
        5,
        NULL,
        'Completed booking',
        '2026-08-24 10:00:00',
        NULL,
        NULL
    );


-- =========================================
-- 5. AUDIT LOGS
-- State-changing events from SRS §8
-- =========================================

INSERT INTO audit_logs
    (event_type, actor_user_id,
     target_entity_type, target_entity_id,
     booking_id, resource_id,
     previous_state, new_state,
     reason, transaction_id)
VALUES

    (
        'BOOKING_CREATED',
        1,
        'BOOKING',
        1,
        1,
        1,
        NULL,
        'PENDING',
        'New booking request created',
        'TXN-001'
    ),

    (
        'BOOKING_APPROVED',
        5,
        'BOOKING',
        1,
        1,
        1,
        'PENDING',
        'APPROVED',
        'Academic session approved',
        'TXN-002'
    ),

    (
        'BOOKING_CREATED',
        3,
        'BOOKING',
        2,
        2,
        2,
        NULL,
        'PENDING',
        'Maintenance request created',
        'TXN-003'
    ),

    (
        'BOOKING_DENIED',
        5,
        'BOOKING',
        3,
        3,
        1,
        'PENDING',
        'DENIED',
        'SLOT_TAKEN',
        'TXN-004'
    ),

    (
        'BOOKING_CANCELLED',
        1,
        'BOOKING',
        4,
        4,
        9,
        'APPROVED',
        'CANCELLED',
        'Cancelled by requester',
        'TXN-005'
    ),

    (
        'BOOKING_PREEMPTED',
        5,
        'BOOKING',
        5,
        5,
        10,
        'APPROVED',
        'PREEMPTED',
        'Administrative requirement',
        'TXN-006'
    );


-- =========================================
-- 6. NOTIFICATIONS
-- =========================================

INSERT INTO notifications
    (user_id, booking_id,
     type, title, message,
     is_read, read_at)
VALUES

    (
        1, 1,
        'BOOKING_APPROVED',
        'Booking Approved',
        'Your booking for MB 409 has been approved.',
        TRUE,
        CURRENT_TIMESTAMP
    ),

    (
        3, 2,
        'BOOKING_PENDING',
        'Booking Pending',
        'Your maintenance booking request is pending approval.',
        FALSE,
        NULL
    ),

    (
        2, 3,
        'BOOKING_DENIED',
        'Booking Denied',
        'Your booking request was denied because the requested slot is already taken.',
        FALSE,
        NULL
    ),

    (
        1, 4,
        'BOOKING_CANCELLED',
        'Booking Cancelled',
        'Your booking has been cancelled.',
        TRUE,
        CURRENT_TIMESTAMP
    ),

    (
        2, 5,
        'BOOKING_PREEMPTED',
        'Booking Preempted',
        'Your booking was preempted by an administrative action.',
        FALSE,
        NULL
    );