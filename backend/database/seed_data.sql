-- ============================================================
-- Seed Data for Lab & Classroom Resource Booking Portal
-- Conforms to SRS §3.6, DB Schema §10, and existing project users
-- ============================================================

-- 1. Roles (§10.1: 3-role model)
INSERT OR IGNORE INTO roles (role_id, role_code, role_name, priority_rank, can_approve, is_auto_approved, can_preempt, max_advance_days, is_active)
VALUES
(1, 'ADMIN',          'Admin',          0, 1, 1, 1, 90, 1),
(2, 'FACULTY',        'Faculty',        1, 1, 1, 0, 30, 1),
(3, 'LAB_ASSISTANT',  'Lab Assistant',  2, 0, 0, 0, 14, 1);

-- 2. Departments
INSERT OR IGNORE INTO departments (department_id, department_code, department_name, is_active)
VALUES
(1, 'CSE', 'Computer Science & Engineering', 1),
(2, 'IT',  'Information Technology', 1),
(3, 'AI',  'Artificial Intelligence & Data Science', 1);

-- 3. Users (Seeded test accounts)
-- Passwords set to standard demo hash or demo verification
INSERT OR IGNORE INTO users (user_id, username, email, password_hash, full_name, phone, role_id, department_id, employee_code, is_active)
VALUES
(1, 'anjali.deshmukh', 'anjali.deshmukh@college.edu', 'demo_hash_1', 'Dr. Anjali Deshmukh', '9876543210', 2, 1, 'FAC001', 1),
(2, 'rahul.kulkarni',  'rahul.kulkarni@college.edu',  'demo_hash_2', 'Prof. Rahul Kulkarni', '9876543211', 2, 2, 'FAC002', 1),
(3, 'amit.patil',      'amit.patil@college.edu',      'demo_hash_3', 'Amit Patil',           '9876543212', 3, 1, 'AST001', 1),
(4, 'sneha.joshi',     'sneha.joshi@college.edu',     'demo_hash_4', 'Sneha Joshi',          '9876543213', 3, 2, 'AST002', 1),
(5, 'admin',           'admin@college.edu',           'demo_hash_5', 'Admin User',           '9876543214', 1, 1, 'ADM001', 1),
(6, 'rahul.verma',     'rahul.verma@college.edu',     'demo_hash_6', 'Rahul Verma',          '9876543215', 3, 1, 'AST003', 1);

-- 4. Blocks (§5.1)
INSERT OR IGNORE INTO blocks (block_id, block_code, block_name, is_active)
VALUES
(1, 'MB', 'Main Building', 1),
(2, 'AC', 'Academic Complex', 1);

-- 5. Time Slots (§10.3: 9 bookable periods + 1 break)
INSERT OR IGNORE INTO time_slots (slot_id, slot_code, slot_name, start_time, end_time, slot_order, duration_minutes, is_break, is_active)
VALUES
(1,  'P1',   'Period 1',  '08:00', '09:00', 1,  60, 0, 1),
(2,  'P2',   'Period 2',  '09:00', '10:00', 2,  60, 0, 1),
(3,  'P3',   'Period 3',  '10:00', '11:00', 3,  60, 0, 1),
(4,  'P4',   'Period 4',  '11:00', '12:00', 4,  60, 0, 1),
(5,  'BRK1', 'Lunch Break','12:00', '12:45', 5,  45, 1, 1),
(6,  'P5',   'Period 5',  '12:45', '13:45', 6,  60, 0, 1),
(7,  'P6',   'Period 6',  '13:45', '14:45', 7,  60, 0, 1),
(8,  'P7',   'Period 7',  '14:45', '15:45', 8,  60, 0, 1),
(9,  'P8',   'Period 8',  '15:45', '16:45', 9,  60, 0, 1),
(10, 'P9',   'Period 9',  '16:45', '17:45', 10, 60, 0, 1);

-- 6. Resources & Subtypes (The fixed 11 rooms: 8 Labs, 3 Classrooms) (§10.2)
-- Supertype resources
INSERT OR IGNORE INTO resources (resource_id, room_code, resource_type, block_id, floor_number, capacity, status, min_role_priority, requires_approval, description)
VALUES
(1,  'MB 409',   'Lab',       1, 4, 40, 'ACTIVE', 3, 1, 'Advanced Computing Lab with machines'),
(2,  'MB 412',   'Lab',       1, 4, 35, 'ACTIVE', 3, 1, 'Hardware & Systems Lab (without machines)'),
(3,  'MB 413',   'Lab',       1, 4, 40, 'ACTIVE', 3, 1, 'Network Programming Lab with machines'),
(4,  'MB 414',   'Lab',       1, 4, 40, 'ACTIVE', 3, 1, 'Database Systems Lab with machines'),
(5,  'MB 407 A', 'Lab',       1, 4, 30, 'ACTIVE', 3, 1, 'AI & Data Science Lab A with machines'),
(6,  'MB 407 B', 'Lab',       1, 4, 30, 'ACTIVE', 3, 1, 'AI & Data Science Lab B with machines'),
(7,  'MB 408 A', 'Lab',       1, 4, 30, 'ACTIVE', 3, 1, 'Cybersecurity Lab A with machines'),
(8,  'MB 408 B', 'Lab',       1, 4, 30, 'ACTIVE', 3, 1, 'Cybersecurity Lab B with machines'),
(9,  'AC 301',   'Classroom', 2, 3, 60, 'ACTIVE', 3, 1, 'Tiered Lecture Hall with AV projector'),
(10, 'AC 304',   'Classroom', 2, 3, 60, 'ACTIVE', 3, 1, 'Standard Classroom with smart podium'),
(11, 'AC 401',   'Classroom', 2, 4, 75, 'ACTIVE', 3, 1, 'Large Seminar Hall with dual screens');

-- Subtype laboratories
INSERT OR IGNORE INTO laboratories (resource_id, lab_name, has_machines, machine_count, os_installed, has_projector, has_ac, lab_incharge_user_id)
VALUES
(1, 'Advanced Computing Lab',       1, 40, 'Ubuntu 24.04 LTS', 1, 1, 3),
(2, 'Hardware & Systems Lab',       0,  0, NULL,               1, 0, 4),
(3, 'Network Programming Lab',      1, 40, 'Ubuntu 24.04 LTS', 1, 1, 3),
(4, 'Database Systems Lab',         1, 40, 'Windows 11 Pro',   1, 1, 3),
(5, 'AI & Data Science Lab A',      1, 30, 'Ubuntu / CUDA',    1, 1, 6),
(6, 'AI & Data Science Lab B',      1, 30, 'Ubuntu / CUDA',    1, 1, 6),
(7, 'Cybersecurity Lab A',          1, 30, 'Kali / Debian',    1, 1, 4),
(8, 'Cybersecurity Lab B',          1, 30, 'Kali / Debian',    1, 1, 4);

-- Subtype classrooms
INSERT OR IGNORE INTO classrooms (resource_id, seating_type, has_projector, has_smart_board, has_ac, board_type, is_exam_approved)
VALUES
(9,  'TIERED', 1, 0, 1, 'WHITE', 1),
(10, 'BENCH',  1, 1, 1, 'SMART', 1),
(11, 'TIERED', 1, 1, 1, 'WHITE', 1);

-- 7. System Config (§9.7)
INSERT OR IGNORE INTO system_config (config_key, config_value, data_type, description)
VALUES
('SESSION_TIMEOUT_MINUTES', '30', 'INT', 'Inactivity timeout for user sessions'),
('MAX_BOOKING_SLOTS',       '4',  'INT', 'Maximum consecutive periods permitted per booking (4 hours)'),
('CANCEL_CUTOFF_HOURS',     '2',  'INT', 'Minimum notice in hours required to cancel an approved booking'),
('MAX_ADVANCE_DAYS',        '30', 'INT', 'Maximum days in advance a regular booking can be submitted'),
('LOCK_TIMEOUT_SECONDS',    '5',  'INT', 'Bounded wait for advisory room-day mutex lock'),
('MAX_FAILED_LOGINS',       '5',  'INT', 'Failed attempts before account lockout'),
('AUTO_EXPIRE_HOURS',       '24', 'INT', 'Pending requests unresolved 24h before slot are auto-denied'),
('BACKUP_RETENTION_DAYS',   '90', 'INT', 'Retention period for automated database snapshots');

-- 8. Report Definitions (§9.1)
INSERT OR IGNORE INTO report_definitions (report_id, report_code, report_name, report_category, description, min_role_priority, default_format)
VALUES
(1, 'UTILISATION_DAILY', 'Daily Resource Utilisation Report', 'UTILISATION', 'Percentage of bookable slots occupied per resource per period', 1, 'HTML'),
(2, 'BOOKING_COUNT',     'Booking Volume & Status Summary',   'BOOKING',     'Counts of bookings grouped by status, user role, and resource', 1, 'HTML'),
(3, 'PEAK_LOAD',         'Peak-Load & Contention Analysis',   'SYSTEM',      'Historical booking counts by hour-of-day and day-of-week', 0, 'HTML'),
(4, 'CONFLICT_RATE',     'Conflict & Rejection Log Summary',  'CONFLICT',    'Summary of rejected submissions and auto-denied competing requests', 0, 'HTML'),
(5, 'APPROVAL_TAT',      'Approval Turnaround Time Metrics',  'AUDIT',       'Mean and median hours taken from submission to approver decision', 0, 'HTML'),
(6, 'CANCELLATIONS',     'Cancellations & Lead-Time Analysis','BOOKING',     'Analysis of booking cancellations by requester and lead hours', 1, 'HTML');

-- 9. Notification Templates (§9.3)
INSERT OR IGNORE INTO notification_templates (template_id, template_code, channel, subject_template, body_template)
VALUES
(1, 'BOOKING_SUBMITTED', 'IN_APP', 'Booking Request Submitted', 'Your booking request #{booking_id} has been submitted.'),
(2, 'BOOKING_APPROVED',  'IN_APP', 'Booking Approved',          'Great news! Your booking #{booking_id} for {room_code} has been approved.'),
(3, 'BOOKING_REJECTED',  'IN_APP', 'Booking Denied',            'Your booking request #{booking_id} was denied. Reason: {reason}.'),
(4, 'BOOKING_CANCELLED', 'IN_APP', 'Booking Cancelled',         'Booking #{booking_id} has been cancelled.'),
(5, 'BOOKING_PREEMPTED', 'IN_APP', 'Booking Preempted',         'Urgent: Your booking #{booking_id} was preempted by administration. Reason: {reason}.'),
(6, 'CONFLICT_ALERT',    'IN_APP', 'Slot Conflict Detected',    'Another request was already confirmed for {room_code} at the selected slot.');
