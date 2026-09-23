-- ============================================================
-- CAMPUS RESOURCE BOOKING PORTAL - ALL-IN-ONE DATABASE SETUP
-- PostgreSQL / Supabase
-- Run this in Supabase SQL Editor as 'postgres'
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Drop existing tables if needed (clean slate)
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS resources CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- 1. ROLES
CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL,
    can_override BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (role_id, role_name, can_override) VALUES
    (1, 'Faculty', FALSE),
    (2, 'Lab Assistant', FALSE),
    (3, 'Admin', TRUE);

-- 2. USERS
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL REFERENCES roles(role_id),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (user_id, role_id, name, email, password_hash, last_login_at) VALUES
    (1, 1, 'Dr. Anjali Deshmukh', 'anjali.deshmukh@college.edu', 'Faculty@123', CURRENT_TIMESTAMP),
    (2, 1, 'Prof. Rahul Kulkarni', 'rahul.kulkarni@college.edu', 'Faculty@123', CURRENT_TIMESTAMP),
    (3, 2, 'Amit Patil', 'amit.patil@college.edu', 'Assistant@123', CURRENT_TIMESTAMP),
    (4, 2, 'Sneha Joshi', 'sneha.joshi@college.edu', 'Assistant@123', NULL),
    (5, 3, 'Admin User', 'admin@college.edu', 'Admin@123', CURRENT_TIMESTAMP),
    (6, 2, 'Rahul Verma', 'rahul.verma@college.edu', 'Assistant@123', CURRENT_TIMESTAMP),
    (7, 1, 'Shrinath Gore', 'shrinath.gore@mmcoe.edu.in', 'Faculty@123', CURRENT_TIMESTAMP);

-- 3. RESOURCES
CREATE TABLE resources (
    resource_id SERIAL PRIMARY KEY,
    room_code VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    block VARCHAR(50),
    has_machines BOOLEAN NOT NULL DEFAULT FALSE,
    capacity INTEGER NOT NULL DEFAULT 30,
    notes TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


INSERT INTO resources (resource_id, room_code, resource_type, block, has_machines, capacity, notes, status) VALUES
    (1, 'MB 409', 'Lab', 'MB', TRUE, 40, 'Advanced Computing Lab with machines', 'ACTIVE'),
    (2, 'MB 412', 'Lab', 'MB', FALSE, 35, 'Hardware & Systems Lab (without machines)', 'ACTIVE'),
    (3, 'MB 413', 'Lab', 'MB', TRUE, 40, 'Network Programming Lab with machines', 'ACTIVE'),
    (4, 'MB 414', 'Lab', 'MB', TRUE, 40, 'Database Systems Lab with machines', 'ACTIVE'),
    (5, 'MB 407 A', 'Lab', 'MB', TRUE, 30, 'AI & Data Science Lab A with machines', 'ACTIVE'),
    (6, 'MB 407 B', 'Lab', 'MB', TRUE, 30, 'AI & Data Science Lab B with machines', 'ACTIVE'),
    (7, 'MB 408 A', 'Lab', 'MB', TRUE, 30, 'Cybersecurity Lab A with machines', 'ACTIVE'),
    (8, 'MB 408 B', 'Lab', 'MB', TRUE, 30, 'Cybersecurity Lab B with machines', 'ACTIVE'),
    (9, 'AC 301', 'Classroom', 'AC', FALSE, 60, 'Tiered Lecture Hall with AV projector', 'ACTIVE'),
    (10, 'AC 304', 'Classroom', 'AC', FALSE, 60, 'Standard Classroom with smart podium', 'ACTIVE'),
    (11, 'AC 401', 'Classroom', 'AC', FALSE, 75, 'Large Seminar Hall with dual screens', 'ACTIVE');

-- 4. BOOKINGS
CREATE TABLE bookings (
    booking_id SERIAL PRIMARY KEY,
    resource_id INTEGER NOT NULL REFERENCES resources(resource_id),
    requested_by INTEGER NOT NULL REFERENCES users(user_id),
    booking_type VARCHAR(50) NOT NULL CHECK (booking_type IN ('ACADEMIC', 'EVENT', 'MAINTENANCE')),
    start_at TIMESTAMP NOT NULL,
    end_at TIMESTAMP NOT NULL,
    purpose TEXT,
    headcount INTEGER,
    status VARCHAR(30) NOT NULL,
    approved_by INTEGER REFERENCES users(user_id),
    decision_reason TEXT,
    decision_note TEXT,
    decided_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    series_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Overlap prevention constraint
ALTER TABLE bookings
    ADD CONSTRAINT bookings_no_approved_overlap
    EXCLUDE USING gist (
        resource_id WITH =,
        tsrange(start_at, end_at, '[)') WITH &&
    )
    WHERE (status = 'APPROVED');

-- 5. AUDIT LOGS
CREATE TABLE audit_logs (
    audit_id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    actor_user_id INTEGER NOT NULL REFERENCES users(user_id),
    target_entity_type VARCHAR(50),
    target_entity_id INTEGER,
    booking_id INTEGER REFERENCES bookings(booking_id),
    resource_id INTEGER REFERENCES resources(resource_id),
    previous_state TEXT,
    new_state TEXT,
    reason TEXT,
    transaction_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. NOTIFICATIONS
CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    booking_id INTEGER REFERENCES bookings(booking_id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. SYNC SEQUENCES
SELECT setval(pg_get_serial_sequence('roles', 'role_id'), GREATEST((SELECT MAX(role_id) FROM roles), 1));
SELECT setval(pg_get_serial_sequence('users', 'user_id'), GREATEST((SELECT MAX(user_id) FROM users), 1));
SELECT setval(pg_get_serial_sequence('resources', 'resource_id'), GREATEST((SELECT MAX(resource_id) FROM resources), 1));
SELECT setval(pg_get_serial_sequence('bookings', 'booking_id'), GREATEST(COALESCE((SELECT MAX(booking_id) FROM bookings), 1), 1));
SELECT setval(pg_get_serial_sequence('audit_logs', 'audit_id'), GREATEST(COALESCE((SELECT MAX(audit_id) FROM audit_logs), 1), 1));
SELECT setval(pg_get_serial_sequence('notifications', 'notification_id'), GREATEST(COALESCE((SELECT MAX(notification_id) FROM notifications), 1), 1));

-- 8. ROW LEVEL SECURITY (RLS) - Permissive public access for client-side queries
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read roles" ON roles FOR SELECT USING (true);
CREATE POLICY "Allow anon all users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all resources" ON resources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all bookings" ON bookings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all audit_logs" ON audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all notifications" ON notifications FOR ALL USING (true) WITH CHECK (true);

-- 9. REGISTER USERS IN AUTH.USERS (For Supabase Password & OAuth sync)
DO $$
DECLARE
    r RECORD;
    v_auth_id UUID;
BEGIN
    FOR r IN SELECT user_id, email, name, password_hash, (SELECT role_name FROM roles WHERE role_id = users.role_id) as role_name FROM users LOOP
        SELECT id INTO v_auth_id FROM auth.users WHERE email = r.email;
        IF v_auth_id IS NULL THEN
            v_auth_id := gen_random_uuid();
            INSERT INTO auth.users (
                instance_id, id, aud, role, email, encrypted_password,
                email_confirmed_at, recovery_sent_at, last_sign_in_at,
                raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                confirmation_token, email_change, email_change_token_new, recovery_token, is_super_admin
            ) VALUES (
                '00000000-0000-0000-0000-000000000000', v_auth_id, 'authenticated', 'authenticated',
                r.email, crypt(r.password_hash, gen_salt('bf')),
                NOW(), NOW(), NOW(),
                '{"provider":"email","providers":["email"]}',
                json_build_object('name', r.name, 'role', r.role_name),
                NOW(), NOW(), '', '', '', '', FALSE
            );

            INSERT INTO auth.identities (
                id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
            ) VALUES (
                v_auth_id, v_auth_id, json_build_object('sub', v_auth_id::text, 'email', r.email),
                'email', r.email, NOW(), NOW(), NOW()
            );
        END IF;

        UPDATE public.users SET auth_id = v_auth_id WHERE user_id = r.user_id;
    END LOOP;
END $$;

