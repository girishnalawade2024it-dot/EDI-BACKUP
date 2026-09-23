-- Function to validate booking constraints (like capacity and time ranges)
CREATE OR REPLACE FUNCTION validate_booking_rules()
RETURNS TRIGGER AS $$
DECLARE
    v_capacity INT;
BEGIN
    -- Enforce that end_at is strictly after start_at
    IF NEW.end_at <= NEW.start_at THEN
        RAISE EXCEPTION 'invalid_time_range: Booking end time must be after start time.';
    END IF;

    -- Only check capacity if headcount is provided
    IF NEW.headcount IS NOT NULL THEN
        -- Get the capacity of the requested resource
        SELECT capacity INTO v_capacity
        FROM resources
        WHERE resource_id = NEW.resource_id;

        -- Check if the requested headcount exceeds resource capacity
        IF v_capacity IS NOT NULL AND NEW.headcount > v_capacity THEN
            RAISE EXCEPTION 'headcount_exceeds_capacity: Requested headcount (%) exceeds the maximum capacity (%) of the resource.', NEW.headcount, v_capacity;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to execute the validation before inserting or updating a booking
CREATE TRIGGER trg_validate_booking_rules
BEFORE INSERT OR UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION validate_booking_rules();
