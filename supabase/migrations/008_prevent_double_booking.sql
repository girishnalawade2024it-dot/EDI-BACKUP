-- =========================================
-- EDI Project - Prevent Double-Booking at the Database Level
--
-- checkOverlap() in assets/js/booking-engine.js runs application-side, and
-- approveBooking() re-checks before deciding. Neither is atomic: two admins
-- approving conflicting requests at the same moment both pass their check
-- and both write, leaving the same room approved twice.
--
-- This constraint makes that physically impossible. It applies only to
-- APPROVED rows -- PENDING requests are expected to compete for a slot,
-- and DENIED/CANCELLED/PREEMPTED rows are history.
--
-- The range is half-open, '[)', matching the overlap rule the engine uses:
--   A.start < B.end AND A.end > B.start
-- so a booking ending at 11:00 and one starting at 11:00 do not conflict.
-- =========================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
    ADD CONSTRAINT bookings_no_approved_overlap
    EXCLUDE USING gist (
        resource_id WITH =,
        tsrange(start_at, end_at, '[)') WITH &&
    )
    WHERE (status = 'APPROVED');
