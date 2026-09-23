-- =========================================
-- EDI Project - Migration 009
-- Create concerns table and apply RLS
-- =========================================

CREATE TABLE concerns (
    concern_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    requested_date DATE NOT NULL,
    requested_start_time TIME NOT NULL,
    requested_end_time TIME NOT NULL,
    concern_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    admin_response TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (resource_id) REFERENCES resources(resource_id)
);

-- Apply RLS
ALTER TABLE concerns ENABLE ROW LEVEL SECURITY;

-- Allow read/write for anon and authenticated (aligned with current security model)
CREATE POLICY concerns_read ON concerns FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY concerns_insert ON concerns FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY concerns_update ON concerns FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Sequence Sync (just in case we ever seed data, though empty initially)
SELECT setval(
    pg_get_serial_sequence('concerns', 'concern_id'),
    GREATEST(
        COALESCE((SELECT MAX(concern_id) FROM concerns), 1),
        COALESCE(pg_sequence_last_value(pg_get_serial_sequence('concerns', 'concern_id')::regclass), 1)
    )
);
