// ============================================================
// Project Config — SRS NFR-M3
// All configurable parameters live here, NOT hardcoded in logic.
// ============================================================

export const CONFIG = {
    // Operating hours (SRS OI-2 resolution: 08:00–18:00)
    OPERATING_START:   '08:00',
    OPERATING_END:     '18:00',

    // Slot granularity in minutes (SRS OI-2: 30-min)
    SLOT_MINUTES:      30,

    // Maximum booking duration in hours (SRS FR-3.4)
    MAX_BOOKING_HOURS: 4,

    // Minimum notice before a cancellation is allowed, in hours (SRS FR-3.7)
    CANCEL_CUTOFF_HRS: 2,

    // localStorage key for session
    SESSION_KEY: 'edi_portal_session',

    // Enumerated denial reasons (SRS §6)
    DENIAL_REASONS: [
        { value: 'SLOT_TAKEN',            label: 'Slot Already Taken' },
        { value: 'REJECTED_BY_APPROVER',  label: 'Rejected by Approver' },
        { value: 'INSUFFICIENT_PRIORITY', label: 'Insufficient Priority' },
        { value: 'CAPACITY_EXCEEDED',     label: 'Capacity Exceeded' },
        { value: 'MAINTENANCE',           label: 'Under Maintenance' },
        { value: 'EXPIRED',               label: 'Request Expired' },
    ],

    // Booking status values (SRS §6 state model)
    STATUS: {
        PENDING:   'PENDING',
        APPROVED:  'APPROVED',
        DENIED:    'DENIED',
        CANCELLED: 'CANCELLED',
        PREEMPTED: 'PREEMPTED',
        COMPLETED: 'COMPLETED',
    },

    // Audit event types (SRS FR-8.2)
    AUDIT: {
        BOOKING_CREATED:    'BOOKING_CREATED',
        BOOKING_APPROVED:   'BOOKING_APPROVED',
        BOOKING_DENIED:     'BOOKING_DENIED',
        BOOKING_CANCELLED:  'BOOKING_CANCELLED',
        BOOKING_PREEMPTED:  'BOOKING_PREEMPTED',
        BOOKING_COMPLETED:  'BOOKING_COMPLETED',
        RESOURCE_UPDATED:   'RESOURCE_UPDATED',
        USER_ROLE_CHANGED:  'USER_ROLE_CHANGED',
        PERMISSION_DENIED:  'PERMISSION_DENIED',
    },
};

/**
 * Generate all 30-min time slots between OPERATING_START and OPERATING_END.
 * Returns array of 'HH:MM' strings.
 */
export function generateSlots() {
    const slots = [];
    const [sh, sm] = CONFIG.OPERATING_START.split(':').map(Number);
    const [eh, em] = CONFIG.OPERATING_END.split(':').map(Number);
    let mins = sh * 60 + sm;
    const end  = eh * 60 + em;
    while (mins < end) {
        const h = String(Math.floor(mins / 60)).padStart(2, '0');
        const m = String(mins % 60).padStart(2, '0');
        slots.push(`${h}:${m}`);
        mins += CONFIG.SLOT_MINUTES;
    }
    return slots;
}

/**
 * Format datetime string for display in IST locale.
 */
export function fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

export function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

export function fmtTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}
