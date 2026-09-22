-- =========================================
-- EDI Project - Database Schema
-- PostgreSQL / Supabase
-- =========================================


-- =========================================
-- 1. ROLES
-- =========================================

CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL,
    can_override BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================
-- 2. USERS
-- =========================================

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (role_id)
        REFERENCES roles(role_id)
);


-- =========================================
-- 3. RESOURCES
-- =========================================

CREATE TABLE resources (
    resource_id SERIAL PRIMARY KEY,
    room_code VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    block VARCHAR(50),
    capacity INTEGER,
    notes TEXT,
    status VARCHAR(30) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================
-- 4. BOOKINGS
-- =========================================

CREATE TABLE bookings (
    booking_id SERIAL PRIMARY KEY,
    resource_id INTEGER NOT NULL,
    requested_by INTEGER NOT NULL,
    booking_type VARCHAR(50) NOT NULL,
    start_at TIMESTAMP NOT NULL,
    end_at TIMESTAMP NOT NULL,
    purpose TEXT,
    headcount INTEGER,
    status VARCHAR(30) NOT NULL,
    approved_by INTEGER,
    decision_reason TEXT,
    decision_note TEXT,
    decided_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    series_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (resource_id)
        REFERENCES resources(resource_id),

    FOREIGN KEY (requested_by)
        REFERENCES users(user_id),

    FOREIGN KEY (approved_by)
        REFERENCES users(user_id)
);


-- =========================================
-- 5. AUDIT_LOGS
-- =========================================

CREATE TABLE audit_logs (
    audit_id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    actor_user_id INTEGER NOT NULL,
    target_entity_type VARCHAR(50),
    target_entity_id INTEGER,
    booking_id INTEGER,
    resource_id INTEGER,
    previous_state TEXT,
    new_state TEXT,
    reason TEXT,
    transaction_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (actor_user_id)
        REFERENCES users(user_id),

    FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id),

    FOREIGN KEY (resource_id)
        REFERENCES resources(resource_id)
);


-- =========================================
-- 6. NOTIFICATIONS
-- =========================================

CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    booking_id INTEGER,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id),

    FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id)
);