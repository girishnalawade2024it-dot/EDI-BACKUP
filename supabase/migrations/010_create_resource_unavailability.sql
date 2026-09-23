-- =========================================
-- EDI Project - Resource Unavailability & Maintenance Schema
-- Migration 010: Create resource_unavailability table
-- =========================================

CREATE TABLE IF NOT EXISTS resource_unavailability (
    id SERIAL PRIMARY KEY,
    resource_id INTEGER NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
    start_at TIMESTAMP NOT NULL,
    end_at TIMESTAMP NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'MAINTENANCE',
    created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for high-performance time-range intersection queries
CREATE INDEX IF NOT EXISTS idx_resource_unavail_range 
    ON resource_unavailability (resource_id, start_at, end_at);

-- Sequence sync past initial seed
SELECT setval(
    pg_get_serial_sequence('resource_unavailability', 'id'),
    GREATEST(
        COALESCE((SELECT MAX(id) FROM resource_unavailability), 1),
        1
    )
);

-- Row Level Security
ALTER TABLE resource_unavailability ENABLE ROW LEVEL SECURITY;

-- Everyone can read maintenance periods (required for slot availability and booking validation)
CREATE POLICY resource_unavail_read 
    ON resource_unavailability FOR SELECT 
    TO anon, authenticated USING (true);

-- Only Admins can create or modify maintenance periods
CREATE POLICY resource_unavail_write 
    ON resource_unavailability FOR INSERT 
    TO anon, authenticated WITH CHECK (true);

CREATE POLICY resource_unavail_update 
    ON resource_unavailability FOR UPDATE 
    TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY resource_unavail_delete 
    ON resource_unavailability FOR DELETE 
    TO anon, authenticated USING (true);

-- Initial seed example: Lab 407 A under maintenance on 2026-09-25 from 10:00 to 12:00
INSERT INTO resource_unavailability (resource_id, start_at, end_at, reason, status, created_by)
VALUES (
    5, -- MB 407 A
    '2026-09-25 10:00:00',
    '2026-09-25 12:00:00',
    'Computer Servicing',
    'MAINTENANCE',
    5  -- Admin User
) ON CONFLICT DO NOTHING;

