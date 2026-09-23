-- Migration 006: Admin Priority Queue

-- 1. Add priority to bookings
ALTER TABLE bookings ADD COLUMN priority INTEGER DEFAULT 1;

-- 2. Add requires_approval to resources
ALTER TABLE resources ADD COLUMN requires_approval BOOLEAN DEFAULT false;

-- 3. Set a few resources to require approval so we have some test data (e.g. Labs)
UPDATE resources SET requires_approval = true WHERE room_code LIKE 'Lab %';

-- 4. RPC to get pending approvals ordered by priority (DESC) then created_at (ASC)
CREATE OR REPLACE FUNCTION get_priority_approvals()
RETURNS TABLE (
    booking_id INT,
    faculty_name VARCHAR,
    purpose TEXT,
    room_code VARCHAR,
    resource_type VARCHAR,
    start_at TIMESTAMP,
    end_at TIMESTAMP,
    capacity INT,
    notes TEXT,
    priority INT,
    requested_at TIMESTAMP
) AS $$
BEGIN
    -- DSA Concept: Priority Queue 
    -- We order by priority DESC to ensure Critical (3) and High (2) come before Normal (1),
    -- then use created_at ASC as a tie-breaker for FIFO within the same priority level.
    RETURN QUERY
    SELECT 
        b.booking_id,
        u.name::VARCHAR AS faculty_name,
        b.purpose,
        r.room_code::VARCHAR,
        r.resource_type::VARCHAR,
        b.start_at,
        b.end_at,
        b.headcount AS capacity,
        r.notes,
        b.priority,
        b.created_at AS requested_at
    FROM bookings b
    JOIN users u ON b.requested_by = u.user_id
    JOIN resources r ON b.resource_id = r.resource_id
    WHERE b.status = 'PENDING'
    ORDER BY b.priority DESC, b.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- 5. RPC to atomically process an admin decision
CREATE OR REPLACE FUNCTION admin_process_request(
    p_booking_id INT, 
    p_new_status VARCHAR, 
    p_admin_user_id INT, 
    p_reason TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_updated_rows INT;
BEGIN
    -- DBMS Concept: Atomic conditional UPDATE
    -- We enforce that the booking must still be 'PENDING' in the WHERE clause.
    -- If another admin already processed it, no rows will be updated.
    UPDATE bookings 
    SET 
        status = p_new_status,
        approved_by = p_admin_user_id,
        decision_reason = p_reason,
        decided_at = CURRENT_TIMESTAMP
    WHERE booking_id = p_booking_id AND status = 'PENDING';
    
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    
    IF v_updated_rows > 0 THEN
        -- Insert into audit logs
        INSERT INTO audit_logs (
            event_type, 
            actor_user_id, 
            target_entity_type, 
            target_entity_id, 
            booking_id, 
            new_state, 
            reason
        ) VALUES (
            'ADMIN_DECISION',
            p_admin_user_id,
            'BOOKING',
            p_booking_id,
            p_booking_id,
            p_new_status,
            p_reason
        );
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;
