-- Enable the btree_gist extension required for the EXCLUDE constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Add the EXCLUDE constraint to prevent overlapping time ranges for the same resource
-- This applies only to active bookings (ignores CANCELLED and DENIED)
ALTER TABLE bookings
ADD CONSTRAINT no_overlapping_bookings
EXCLUDE USING gist (
    resource_id WITH =,
    tsrange(start_at, end_at) WITH &&
) 
WHERE (status NOT IN ('CANCELLED', 'DENIED'));
