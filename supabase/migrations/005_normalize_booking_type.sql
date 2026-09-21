-- =========================================
-- EDI Project - Normalize booking_type
--
-- The seeded rows use prose values ('Academic Session', 'Maintenance')
-- while the portal writes and filters on the uppercase enum defined in
-- faculty/booking.html ('ACADEMIC', 'EVENT', 'MAINTENANCE').
--
-- This never surfaced against the localStorage fallback because its
-- eq() compares case-insensitively. Real PostgREST does not, so
-- assistant/dashboard.html's .eq('booking_type', 'MAINTENANCE') filter
-- matches nothing against the seeded data.
-- =========================================

UPDATE bookings
SET booking_type = CASE UPPER(TRIM(booking_type))
    WHEN 'ACADEMIC SESSION' THEN 'ACADEMIC'
    WHEN 'ACADEMIC'         THEN 'ACADEMIC'
    WHEN 'MAINTENANCE'      THEN 'MAINTENANCE'
    WHEN 'EVENT'            THEN 'EVENT'
    WHEN 'DEPARTMENT EVENT' THEN 'EVENT'
    ELSE 'ACADEMIC'
END;

-- Keep the column and the UI in agreement from here on.
ALTER TABLE bookings
    ADD CONSTRAINT bookings_booking_type_check
    CHECK (booking_type IN ('ACADEMIC', 'EVENT', 'MAINTENANCE'));
