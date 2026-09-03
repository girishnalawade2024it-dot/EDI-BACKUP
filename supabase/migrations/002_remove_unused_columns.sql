-- =========================================
-- EDI Project - Remove Unused Columns
-- =========================================

-- Remove priority_rank from roles
ALTER TABLE roles
DROP COLUMN priority_rank;

-- Remove is_active from users
ALTER TABLE users
DROP COLUMN is_active;

-- Remove requires_machines from bookings
ALTER TABLE bookings
DROP COLUMN requires_machines;

-- Remove actor_role from audit_logs
ALTER TABLE audit_logs
DROP COLUMN actor_role;