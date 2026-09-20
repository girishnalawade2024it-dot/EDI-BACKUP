// ============================================================
// Project Config — SRS NFR-M3
// All configurable parameters live here, NOT hardcoded in logic.
// ============================================================

export const CONFIG = {
    // Operating hours (SRS OI-2 resolution: 08:00–18:00)
    OPERATING_START:   '08:00',
    OPERATING_END:     '18:00',

    // Same window as whole hours. Derived below from the strings above so
    // the two representations can never drift apart.
    OPERATING_HOURS:   { START_HOUR: 8, END_HOUR: 18 },

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

// Keep the numeric operating hours in step with the 'HH:MM' strings above.
CONFIG.OPERATING_HOURS.START_HOUR = Number(CONFIG.OPERATING_START.split(':')[0]);
CONFIG.OPERATING_HOURS.END_HOUR   = Number(CONFIG.OPERATING_END.split(':')[0]);

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

/**
 * Current local time as 'YYYY-MM-DDTHH:MM:SS'.
 *
 * Every timestamp column in this schema is `timestamp without time zone`,
 * and the booking times written by the forms are local wall-clock
 * ('2026-09-21T09:00:00'). Date#toISOString() returns UTC, so using it to
 * stamp decided_at / cancelled_at / last_login_at stored a second, silently
 * different convention in the same columns -- in IST those values read back
 * 5h30m early. These helpers keep every write on local wall-clock.
 */
export function nowLocalISO() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
           `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Today's local date as 'YYYY-MM-DD'.
 * toISOString().slice(0, 10) returns the UTC date, which is still yesterday
 * for any local time before the UTC offset (before 05:30 in IST).
 */
export function todayLocalISO() {
    return nowLocalISO().slice(0, 10);
}
