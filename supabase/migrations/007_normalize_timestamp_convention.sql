-- =========================================
-- EDI Project - One Timestamp Convention
--
-- Every timestamp column here is `timestamp without time zone`, but two
-- different conventions were being written into them:
--
--   start_at / end_at        local wall-clock, built by the booking form
--   created_at / updated_at  UTC, from DEFAULT CURRENT_TIMESTAMP
--   decided_at / cancelled_at / last_login_at / read_at
--                            UTC, from JS new Date().toISOString()
--
-- fmtDateTime() in assets/js/config.js parses a naive string as local time,
-- so the UTC-sourced values rendered 5h30m early in IST. The client now
-- writes local wall-clock everywhere (nowLocalISO()); this migration brings
-- the stored data and the column defaults to the same convention.
--
-- start_at and end_at are deliberately NOT touched: they are already local.
--
-- Guarded by app_meta so a re-run cannot shift the data a second time.
-- =========================================

CREATE TABLE IF NOT EXISTS app_meta (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    applied_at TIMESTAMP DEFAULT timezone('Asia/Kolkata', now())
);

DO $$
DECLARE
    tz_offset INTERVAL := INTERVAL '5 hours 30 minutes';  -- Asia/Kolkata
BEGIN
    IF EXISTS (SELECT 1 FROM app_meta WHERE key = '007_timestamp_shift') THEN
        RAISE NOTICE '007 already applied; skipping data shift.';
        RETURN;
    END IF;

    UPDATE roles         SET created_at    = created_at    + tz_offset;

    UPDATE users         SET created_at    = created_at    + tz_offset,
                             updated_at    = updated_at    + tz_offset,
                             last_login_at = last_login_at + tz_offset;

    UPDATE resources     SET created_at    = created_at    + tz_offset,
                             updated_at    = updated_at    + tz_offset;

    -- start_at / end_at intentionally excluded.
    UPDATE bookings      SET created_at    = created_at    + tz_offset,
                             updated_at    = updated_at    + tz_offset,
                             decided_at    = decided_at    + tz_offset,
                             cancelled_at  = cancelled_at  + tz_offset;

    UPDATE audit_logs    SET created_at    = created_at    + tz_offset;

    UPDATE notifications SET created_at    = created_at    + tz_offset,
                             read_at       = read_at       + tz_offset;

    INSERT INTO app_meta (key, value)
    VALUES ('007_timestamp_shift', 'Asia/Kolkata (+05:30) applied to UTC-sourced columns');
END $$;


-- Defaults must produce local wall-clock too, or every new row reintroduces
-- the skew this migration just removed.
ALTER TABLE roles         ALTER COLUMN created_at SET DEFAULT timezone('Asia/Kolkata', now());
ALTER TABLE users         ALTER COLUMN created_at SET DEFAULT timezone('Asia/Kolkata', now());
ALTER TABLE users         ALTER COLUMN updated_at SET DEFAULT timezone('Asia/Kolkata', now());
ALTER TABLE resources     ALTER COLUMN created_at SET DEFAULT timezone('Asia/Kolkata', now());
ALTER TABLE resources     ALTER COLUMN updated_at SET DEFAULT timezone('Asia/Kolkata', now());
ALTER TABLE bookings      ALTER COLUMN created_at SET DEFAULT timezone('Asia/Kolkata', now());
ALTER TABLE bookings      ALTER COLUMN updated_at SET DEFAULT timezone('Asia/Kolkata', now());
ALTER TABLE audit_logs    ALTER COLUMN created_at SET DEFAULT timezone('Asia/Kolkata', now());
ALTER TABLE notifications ALTER COLUMN created_at SET DEFAULT timezone('Asia/Kolkata', now());

-- app_meta holds no user data and is not exposed to the portal: RLS on,
-- no policies, and the Data API roles cannot reach it at all.
ALTER TABLE app_meta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_meta FROM anon, authenticated;
