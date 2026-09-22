-- =========================================
-- EDI Project - Seed / Test Data
-- Based on SRS v1.0
-- =========================================


-- =========================================
-- 1. ROLES
-- Fixed roles from SRS
-- =========================================

INSERT INTO roles
    (role_id, role_name, can_override)
VALUES
    (1, 'Faculty', FALSE),
    (2, 'Lab Assistant', FALSE),
    (3, 'Admin', TRUE);


-- =========================================
-- 2. USERS
-- =========================================

INSERT INTO users
    (user_id, role_id, name, email, password_hash, last_login_at)
VALUES
    (
        1,
        1,
        'Dr. Anjali Deshmukh',
        'anjali.deshmukh@college.edu',
        'test_hash_faculty_1',
        CURRENT_TIMESTAMP
    ),

    (
        2,
        1,
        'Prof. Rahul Kulkarni',
        'rahul.kulkarni@college.edu',
        'test_hash_faculty_2',
        CURRENT_TIMESTAMP
    ),

    (
        3,
        2,
        'Amit Patil',
        'amit.patil@college.edu',
        'test_hash_labassistant_1',
        CURRENT_TIMESTAMP
    ),

    (
        4,
        2,
        'Sneha Joshi',
        'sneha.joshi@college.edu',
        'test_hash_labassistant_2',
        NULL
    ),

    (
        5,
        3,
        'Admin User',
        'admin@college.edu',
        'test_hash_admin',
        CURRENT_TIMESTAMP
    );


-- =========================================
-- 3. RESOURCES
-- EXACTLY 11 RESOURCES FROM SRS §3.6
-- =========================================

INSERT INTO resources
    (
        resource_id,
        room_code,
        resource_type,
        block,
        has_machines,
        capacity,
        notes,
        status
    )
VALUES

    -- Labs

    (
        1,
        'MB 409',
        'Lab',
        'MB',
        TRUE,
        NULL,
        'Machines available',
        'ACTIVE'
    ),

    (
        2,
        'MB 412',
        'Lab',
        'MB',
        FALSE,
        NULL,
        'Without machines',
        'ACTIVE'
    ),

    (
        3,
        'MB 413',
        'Lab',
        'MB',
        TRUE,
        NULL,
        'Machines available',
        'ACTIVE'
    ),

    (
        4,
        'MB 414',
        'Lab',
        'MB',
        TRUE,
        NULL,
        'Machines available',
        'ACTIVE'
    ),

    (
        5,
        'MB 407 A',
        'Lab',
        'MB',
        TRUE,
        NULL,
        'Machines available',
        'ACTIVE'
    ),

    (
        6,
        'MB 407 B',
        'Lab',
        'MB',
        TRUE,
        NULL,
        'Machines available',
        'ACTIVE'
    ),

    (
        7,
        'MB 408 A',
        'Lab',
        'MB',
        TRUE,
        NULL,
        'Machines available',
        'ACTIVE'
    ),

    (
        8,
        'MB 408 B',
        'Lab',
        'MB',
        TRUE,
        NULL,
        'Machines available',
        'ACTIVE'
    ),

    -- Classrooms

    (
        9,
        'AC 301',
        'Classroom',
        'AC',
        FALSE,
        NULL,
        NULL,
        'ACTIVE'
    ),

    (
        10,
        'AC 304',
        'Classroom',
        'AC',
        FALSE,
        NULL,
        NULL,
        'ACTIVE'
    ),

    (
        11,
        'AC 401',
        'Classroom',
        'AC',
        FALSE,
        NULL,
        NULL,
        'ACTIVE'
    );


-- =========================================
-- 4. BOOKINGS
-- Covers different states from SRS §6
-- =========================================

-- -----------------------------------------
-- BOOKING 1 - APPROVED
-- -----------------------------------------

INSERT INTO bookings
    (
        booking_id,
        resource_id,
        requested_by,
        booking_type,
        start_at,
        end_at,
        purpose,
        headcount,
        status,
        approved_by,
        decision_reason,
        decision_note,
        decided_at,
        cancelled_at,
        series_id
    )
VALUES
    (
        1,
        1,
        1,
        'Academic Session',
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


-- -----------------------------------------
-- BOOKING 2 - PENDING
-- -----------------------------------------

INSERT INTO bookings
    (
        booking_id,
        resource_id,
        requested_by,
        booking_type,
        start_at,
        end_at,
        purpose,
        headcount,
        status,
        approved_by,
        decision_reason,
        decision_note,
        decided_at,
        cancelled_at,
        series_id
    )
VALUES
    (
        2,
        2,
        3,
        'Maintenance',
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


-- -----------------------------------------
-- BOOKING 3 - DENIED
-- -----------------------------------------

INSERT INTO bookings
    (
        booking_id,
        resource_id,
        requested_by,
        booking_type,
        start_at,
        end_at,
        purpose,
        headcount,
        status,
        approved_by,
        decision_reason,
        decision_note,
        decided_at,
        cancelled_at,
        series_id
    )
VALUES
    (
        3,
        1,
        2,
        'Academic Session',
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


-- -----------------------------------------
-- BOOKING 4 - CANCELLED
-- -----------------------------------------

INSERT INTO bookings
    (
        booking_id,
        resource_id,
        requested_by,
        booking_type,
        start_at,
        end_at,
        purpose,
        headcount,
        status,
        approved_by,
        decision_reason,
        decision_note,
        decided_at,
        cancelled_at,
        series_id
    )
VALUES
    (
        4,
        9,
        1,
        'Academic Session',
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


-- -----------------------------------------
-- BOOKING 5 - PREEMPTED
-- -----------------------------------------

INSERT INTO bookings
    (
        booking_id,
        resource_id,
        requested_by,
        booking_type,
        start_at,
        end_at,
        purpose,
        headcount,
        status,
        approved_by,
        decision_reason,
        decision_note,
        decided_at,
        cancelled_at,
        series_id
    )
VALUES
    (
        5,
        10,
        2,
        'Academic Session',
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


-- -----------------------------------------
-- BOOKING 6 - COMPLETED
-- -----------------------------------------

INSERT INTO bookings
    (
        booking_id,
        resource_id,
        requested_by,
        booking_type,
        start_at,
        end_at,
        purpose,
        headcount,
        status,
        approved_by,
        decision_reason,
        decision_note,
        decided_at,
        cancelled_at,
        series_id
    )
VALUES
    (
        6,
        3,
        1,
        'Academic Session',
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
    (
        event_type,
        actor_user_id,
        target_entity_type,
        target_entity_id,
        booking_id,
        resource_id,
        previous_state,
        new_state,
        reason,
        transaction_id
    )
VALUES

    -- Booking 1 created
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

    -- Booking 1 approved
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

    -- Booking 2 created
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

    -- Booking 3 denied
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

    -- Booking 4 cancelled
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

    -- Booking 5 preempted
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
    ),

    -- Booking 6 completed
    (
        'BOOKING_COMPLETED',
        1,
        'BOOKING',
        6,
        6,
        3,
        'APPROVED',
        'COMPLETED',
        'Booking completed successfully',
        'TXN-007'
    );


-- =========================================
-- 6. NOTIFICATIONS
-- =========================================

INSERT INTO notifications
    (
        notification_id,
        user_id,
        booking_id,
        type,
        title,
        message,
        is_read,
        read_at
    )
VALUES

    (
        1,
        1,
        1,
        'BOOKING_APPROVED',
        'Booking Approved',
        'Your booking for MB 409 has been approved.',
        TRUE,
        CURRENT_TIMESTAMP
    ),

    (
        2,
        3,
        2,
        'BOOKING_PENDING',
        'Booking Pending',
        'Your maintenance booking request is pending approval.',
        FALSE,
        NULL
    ),

    (
        3,
        2,
        3,
        'BOOKING_DENIED',
        'Booking Denied',
        'Your booking request was denied because the requested slot is already taken.',
        FALSE,
        NULL
    ),

    (
        4,
        1,
        4,
        'BOOKING_CANCELLED',
        'Booking Cancelled',
        'Your booking has been cancelled.',
        TRUE,
        CURRENT_TIMESTAMP
    ),

    (
        5,
        2,
        5,
        'BOOKING_PREEMPTED',
        'Booking Preempted',
        'Your booking was preempted by an administrative action.',
        FALSE,
        NULL
    );


-- =========================================
-- 7. RESET SERIAL SEQUENCES
-- Ensures future inserts continue correctly
-- =========================================

SELECT setval(
    pg_get_serial_sequence('roles', 'role_id'),
    (SELECT MAX(role_id) FROM roles)
);

SELECT setval(
    pg_get_serial_sequence('users', 'user_id'),
    (SELECT MAX(user_id) FROM users)
);

SELECT setval(
    pg_get_serial_sequence('resources', 'resource_id'),
    (SELECT MAX(resource_id) FROM resources)
);

SELECT setval(
    pg_get_serial_sequence('bookings', 'booking_id'),
    (SELECT MAX(booking_id) FROM bookings)
);

SELECT setval(
    pg_get_serial_sequence('audit_logs', 'audit_id'),
    (SELECT MAX(audit_id) FROM audit_logs)
);

SELECT setval(
    pg_get_serial_sequence('notifications', 'notification_id'),
    (SELECT MAX(notification_id) FROM notifications)
);