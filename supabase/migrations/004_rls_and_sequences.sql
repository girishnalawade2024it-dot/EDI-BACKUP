-- =========================================
-- EDI Project - Sequence Sync + Row Level Security
-- =========================================

-- =========================================
-- 1. SEQUENCE SYNC
-- Where the seed data in 003 inserts explicit primary keys, the SERIAL
-- sequence is left behind the data and the first row the app inserts
-- collides with a seeded id. GREATEST is used so a sequence that is
-- already ahead of MAX(id) is never rewound, which would reintroduce
-- exactly the collision this is meant to prevent.
-- =========================================

SELECT setval(
    pg_get_serial_sequence('roles', 'role_id'),
    GREATEST(
        COALESCE((SELECT MAX(role_id) FROM roles), 1),
        COALESCE(pg_sequence_last_value(pg_get_serial_sequence('roles', 'role_id')::regclass), 1)
    )
);

SELECT setval(
    pg_get_serial_sequence('users', 'user_id'),
    GREATEST(
        COALESCE((SELECT MAX(user_id) FROM users), 1),
        COALESCE(pg_sequence_last_value(pg_get_serial_sequence('users', 'user_id')::regclass), 1)
    )
);

SELECT setval(
    pg_get_serial_sequence('resources', 'resource_id'),
    GREATEST(
        COALESCE((SELECT MAX(resource_id) FROM resources), 1),
        COALESCE(pg_sequence_last_value(pg_get_serial_sequence('resources', 'resource_id')::regclass), 1)
    )
);

SELECT setval(
    pg_get_serial_sequence('bookings', 'booking_id'),
    GREATEST(
        COALESCE((SELECT MAX(booking_id) FROM bookings), 1),
        COALESCE(pg_sequence_last_value(pg_get_serial_sequence('bookings', 'booking_id')::regclass), 1)
    )
);

SELECT setval(
    pg_get_serial_sequence('audit_logs', 'audit_id'),
    GREATEST(
        COALESCE((SELECT MAX(audit_id) FROM audit_logs), 1),
        COALESCE(pg_sequence_last_value(pg_get_serial_sequence('audit_logs', 'audit_id')::regclass), 1)
    )
);

SELECT setval(
    pg_get_serial_sequence('notifications', 'notification_id'),
    GREATEST(
        COALESCE((SELECT MAX(notification_id) FROM notifications), 1),
        COALESCE(pg_sequence_last_value(pg_get_serial_sequence('notifications', 'notification_id')::regclass), 1)
    )
);


-- =========================================
-- 2. ROW LEVEL SECURITY
--
-- The portal is a static site: it holds its own session in localStorage and
-- talks to PostgREST with the anon key only. It does NOT use Supabase Auth,
-- so the database cannot tell one user from another and per-user policies
-- are not expressible here. These policies therefore grant the anon role
-- broad access, which is what the current client needs to function.
--
-- The one thing they do enforce is that password_hash never leaves the
-- database, via the column-level GRANT in section 3.
--
-- Before this is exposed to real users, move logins to Supabase Auth and
-- replace the `true` predicates below with auth.uid()-based rules.
-- =========================================

ALTER TABLE roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Reference data: readable by the portal, never written by it.
CREATE POLICY roles_read     ON roles     FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY resources_read ON resources FOR SELECT TO anon, authenticated USING (true);

-- Admin screens manage resources.
CREATE POLICY resources_write  ON resources FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY resources_update ON resources FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Users: readable, but only the columns granted in section 3.
-- The login flow stamps last_login_at, and the admin screen edits users.
CREATE POLICY users_read   ON users FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY users_insert ON users FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY users_update ON users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Bookings, audit trail and notifications are the app's working tables.
CREATE POLICY bookings_read   ON bookings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY bookings_insert ON bookings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY bookings_update ON bookings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY audit_read   ON audit_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY audit_insert ON audit_logs FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY notif_read   ON notifications FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY notif_insert ON notifications FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY notif_update ON notifications FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);


-- =========================================
-- 3. COLUMN-LEVEL GRANT ON USERS
-- Revoke the table-wide SELECT and re-grant every column except
-- password_hash, so no query through the Data API can return it.
-- The roles(...) embeds used across the portal keep working.
-- =========================================

REVOKE SELECT ON users FROM anon, authenticated;
GRANT SELECT (user_id, role_id, name, email, last_login_at, created_at, updated_at)
    ON users TO anon, authenticated;
