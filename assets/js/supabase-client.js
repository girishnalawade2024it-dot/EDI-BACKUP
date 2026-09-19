// ============================================================
// Supabase Client + Intelligent Local Fallback Engine
// Connects to live Supabase when credentials are provided,
// otherwise transparently powers all tables, joins, and state
// in localStorage with seed data from migrations.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL      = 'YOUR_SUPABASE_URL';       // Set your real Supabase URL here
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';  // Set your real Supabase anon key here

export const isConfigured = Boolean(
    SUPABASE_URL &&
    SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
    !SUPABASE_URL.includes('YOUR_')
);

// ── Initial Seed Data (from 003_insert_test_data.sql) ────────
const SEED_DATA = {
    roles: [
        { role_id: 1, role_name: 'Faculty', can_override: false },
        { role_id: 2, role_name: 'Lab Assistant', can_override: false },
        { role_id: 3, role_name: 'Admin', can_override: true },
    ],
    users: [
        { user_id: 1, role_id: 1, name: 'Dr. Anjali Deshmukh', email: 'anjali.deshmukh@college.edu', last_login_at: '2026-09-19T10:00:00Z', created_at: '2026-08-01T09:00:00Z' },
        { user_id: 2, role_id: 1, name: 'Prof. Rahul Kulkarni', email: 'rahul.kulkarni@college.edu', last_login_at: '2026-09-18T14:30:00Z', created_at: '2026-08-01T09:00:00Z' },
        { user_id: 3, role_id: 2, name: 'Amit Patil', email: 'amit.patil@college.edu', last_login_at: '2026-09-19T08:15:00Z', created_at: '2026-08-01T09:00:00Z' },
        { user_id: 4, role_id: 2, name: 'Sneha Joshi', email: 'sneha.joshi@college.edu', last_login_at: null, created_at: '2026-08-01T09:00:00Z' },
        { user_id: 5, role_id: 3, name: 'Admin User', email: 'admin@college.edu', last_login_at: '2026-09-19T11:00:00Z', created_at: '2026-08-01T09:00:00Z' },
        { user_id: 6, role_id: 2, name: 'Rahul Verma', email: 'rahul.verma@college.edu', last_login_at: '2026-09-19T09:00:00Z', created_at: '2026-08-01T09:00:00Z' }
    ],
    resources: [
        { resource_id: 1, room_code: 'MB 409', resource_type: 'Lab', block: 'MB', has_machines: true, capacity: 40, notes: 'Advanced Computing Lab with machines', status: 'ACTIVE' },
        { resource_id: 2, room_code: 'MB 412', resource_type: 'Lab', block: 'MB', has_machines: false, capacity: 35, notes: 'Hardware & Systems Lab (without machines)', status: 'ACTIVE' },
        { resource_id: 3, room_code: 'MB 413', resource_type: 'Lab', block: 'MB', has_machines: true, capacity: 40, notes: 'Network Programming Lab with machines', status: 'ACTIVE' },
        { resource_id: 4, room_code: 'MB 414', resource_type: 'Lab', block: 'MB', has_machines: true, capacity: 40, notes: 'Database Systems Lab with machines', status: 'ACTIVE' },
        { resource_id: 5, room_code: 'MB 407 A', resource_type: 'Lab', block: 'MB', has_machines: true, capacity: 30, notes: 'AI & Data Science Lab A with machines', status: 'ACTIVE' },
        { resource_id: 6, room_code: 'MB 407 B', resource_type: 'Lab', block: 'MB', has_machines: true, capacity: 30, notes: 'AI & Data Science Lab B with machines', status: 'ACTIVE' },
        { resource_id: 7, room_code: 'MB 408 A', resource_type: 'Lab', block: 'MB', has_machines: true, capacity: 30, notes: 'Cybersecurity Lab A with machines', status: 'ACTIVE' },
        { resource_id: 8, room_code: 'MB 408 B', resource_type: 'Lab', block: 'MB', has_machines: true, capacity: 30, notes: 'Cybersecurity Lab B with machines', status: 'ACTIVE' },
        { resource_id: 9, room_code: 'AC 301', resource_type: 'Classroom', block: 'AC', has_machines: false, capacity: 60, notes: 'Tiered Lecture Hall with AV projector', status: 'ACTIVE' },
        { resource_id: 10, room_code: 'AC 304', resource_type: 'Classroom', block: 'AC', has_machines: false, capacity: 60, notes: 'Standard Classroom with smart podium', status: 'ACTIVE' },
        { resource_id: 11, room_code: 'AC 401', resource_type: 'Classroom', block: 'AC', has_machines: false, capacity: 75, notes: 'Large Seminar Hall with dual screens', status: 'ACTIVE' }
    ],
    bookings: [
        {
            booking_id: 1,
            resource_id: 1,
            requested_by: 1,
            booking_type: 'ACADEMIC',
            start_at: new Date(Date.now() + 86400000).toISOString().slice(0, 10) + 'T09:00:00',
            end_at:   new Date(Date.now() + 86400000).toISOString().slice(0, 10) + 'T11:00:00',
            purpose: 'Data Structures Practical Session',
            headcount: 40,
            status: 'APPROVED',
            approved_by: 5,
            decision_reason: null,
            decision_note: 'Approved for academic lab curriculum',
            decided_at: new Date().toISOString(),
            cancelled_at: null,
            created_at: new Date(Date.now() - 3600000).toISOString()
        },
        {
            booking_id: 2,
            resource_id: 2,
            requested_by: 3,
            booking_type: 'MAINTENANCE',
            start_at: new Date(Date.now() + 172800000).toISOString().slice(0, 10) + 'T10:00:00',
            end_at:   new Date(Date.now() + 172800000).toISOString().slice(0, 10) + 'T12:00:00',
            purpose: 'Laboratory system maintenance and switch servicing',
            headcount: 0,
            status: 'PENDING',
            approved_by: null,
            decision_reason: null,
            decision_note: null,
            decided_at: null,
            cancelled_at: null,
            created_at: new Date().toISOString()
        },
        {
            booking_id: 3,
            resource_id: 1,
            requested_by: 2,
            booking_type: 'ACADEMIC',
            start_at: new Date(Date.now() + 86400000).toISOString().slice(0, 10) + 'T10:00:00',
            end_at:   new Date(Date.now() + 86400000).toISOString().slice(0, 10) + 'T12:00:00',
            purpose: 'Operating Systems Practical',
            headcount: 35,
            status: 'DENIED',
            approved_by: 5,
            decision_reason: 'SLOT_TAKEN',
            decision_note: 'Requested slot overlaps an approved booking',
            decided_at: new Date().toISOString(),
            cancelled_at: null,
            created_at: new Date(Date.now() - 7200000).toISOString()
        },
        {
            booking_id: 4,
            resource_id: 9,
            requested_by: 1,
            booking_type: 'ACADEMIC',
            start_at: '2026-09-04T13:00:00',
            end_at:   '2026-09-04T15:00:00',
            purpose: 'Software Engineering Lecture',
            headcount: 45,
            status: 'CANCELLED',
            approved_by: 5,
            decision_reason: null,
            decision_note: 'Booking cancelled by faculty requester',
            decided_at: '2026-09-03T10:00:00Z',
            cancelled_at: '2026-09-03T12:00:00Z',
            created_at: '2026-09-02T08:00:00Z'
        },
        {
            booking_id: 5,
            resource_id: 10,
            requested_by: 2,
            booking_type: 'EVENT',
            start_at: '2026-09-03T10:00:00',
            end_at:   '2026-09-03T12:00:00',
            purpose: 'Computer Networks Department Workshop',
            headcount: 40,
            status: 'PREEMPTED',
            approved_by: 5,
            decision_reason: 'Administrative requirement',
            decision_note: 'Room reassigned for accreditation visit',
            decided_at: '2026-09-02T15:00:00Z',
            cancelled_at: null,
            created_at: '2026-09-01T09:00:00Z'
        }
    ],
    audit_logs: [
        { audit_id: 1, event_type: 'BOOKING_CREATED', actor_user_id: 1, target_entity_type: 'BOOKING', target_entity_id: 1, booking_id: 1, resource_id: 1, previous_state: null, new_state: 'PENDING', reason: 'New booking request created', transaction_id: 'TXN-001', created_at: new Date(Date.now() - 86400000).toISOString() },
        { audit_id: 2, event_type: 'BOOKING_APPROVED', actor_user_id: 5, target_entity_type: 'BOOKING', target_entity_id: 1, booking_id: 1, resource_id: 1, previous_state: 'PENDING', new_state: 'APPROVED', reason: 'Academic session approved', transaction_id: 'TXN-002', created_at: new Date(Date.now() - 82800000).toISOString() },
        { audit_id: 3, event_type: 'BOOKING_CREATED', actor_user_id: 3, target_entity_type: 'BOOKING', target_entity_id: 2, booking_id: 2, resource_id: 2, previous_state: null, new_state: 'PENDING', reason: 'Maintenance request created', transaction_id: 'TXN-003', created_at: new Date(Date.now() - 72000000).toISOString() },
        { audit_id: 4, event_type: 'BOOKING_DENIED', actor_user_id: 5, target_entity_type: 'BOOKING', target_entity_id: 3, booking_id: 3, resource_id: 1, previous_state: 'PENDING', new_state: 'DENIED', reason: 'SLOT_TAKEN', transaction_id: 'TXN-004', created_at: new Date(Date.now() - 50000000).toISOString() },
        { audit_id: 5, event_type: 'BOOKING_CANCELLED', actor_user_id: 1, target_entity_type: 'BOOKING', target_entity_id: 4, booking_id: 4, resource_id: 9, previous_state: 'APPROVED', new_state: 'CANCELLED', reason: 'Cancelled by requester', transaction_id: 'TXN-005', created_at: new Date(Date.now() - 30000000).toISOString() }
    ],
    notifications: [
        { notification_id: 1, user_id: 1, booking_id: 1, type: 'BOOKING_APPROVED', title: 'Booking Approved', message: 'Your booking for MB 409 has been approved.', is_read: false, read_at: null, created_at: new Date(Date.now() - 82800000).toISOString() },
        { notification_id: 2, user_id: 3, booking_id: 2, type: 'BOOKING_PENDING', title: 'Maintenance Pending', message: 'Your maintenance booking request is pending admin approval.', is_read: false, read_at: null, created_at: new Date(Date.now() - 72000000).toISOString() },
        { notification_id: 3, user_id: 2, booking_id: 3, type: 'BOOKING_DENIED', title: 'Booking Denied', message: 'Your booking request was denied: slot already taken.', is_read: false, read_at: null, created_at: new Date(Date.now() - 50000000).toISOString() },
        { notification_id: 4, user_id: 5, booking_id: 2, type: 'BOOKING_PENDING', title: 'New Pending Approval', message: 'A maintenance booking requires your administrative review.', is_read: false, read_at: null, created_at: new Date().toISOString() }
    ]
};

// ── Local Database Storage Engine ─────────────────────────────
class LocalDB {
    static get(table) {
        const key = 'edi_db_' + table;
        const stored = localStorage.getItem(key);
        if (stored) {
            try { return JSON.parse(stored); } catch { /* ignore */ }
        }
        const initial = SEED_DATA[table] || [];
        localStorage.setItem(key, JSON.stringify(initial));
        return initial;
    }

    static set(table, items) {
        localStorage.setItem('edi_db_' + table, JSON.stringify(items));
    }
}

// Ensure database tables exist in localStorage
['roles', 'users', 'resources', 'bookings', 'audit_logs', 'notifications'].forEach(t => LocalDB.get(t));

// ── Query Builder that mirrors Supabase PostgREST Client ─────
class MockQueryBuilder {
    constructor(tableName) {
        this.tableName   = tableName;
        this.filters     = [];
        this.orderRules  = [];
        this.limitCount  = null;
        this.isSingle    = false;
        this.selectSpec  = '*';
        this.countOption = null;
        this.isHead      = false;
        this.operation   = 'SELECT';
        this.payload     = null;
    }

    select(spec = '*', options = {}) {
        this.selectSpec = spec;
        if (options.count) this.countOption = options.count;
        if (options.head)  this.isHead = options.head;
        return this;
    }

    insert(data) {
        this.operation = 'INSERT';
        this.payload   = Array.isArray(data) ? data : [data];
        return this;
    }

    update(data) {
        this.operation = 'UPDATE';
        this.payload   = data;
        return this;
    }

    delete() {
        this.operation = 'DELETE';
        return this;
    }

    eq(col, val) {
        this.filters.push(item => {
            const itemVal = item[col];
            return String(itemVal).toLowerCase() === String(val).toLowerCase();
        });
        return this;
    }

    neq(col, val) {
        this.filters.push(item => String(item[col]).toLowerCase() !== String(val).toLowerCase());
        return this;
    }

    in(col, vals) {
        const set = new Set((vals || []).map(v => String(v).toLowerCase()));
        this.filters.push(item => set.has(String(item[col]).toLowerCase()));
        return this;
    }

    gte(col, val) {
        this.filters.push(item => item[col] !== null && item[col] !== undefined && item[col] >= val);
        return this;
    }

    lte(col, val) {
        this.filters.push(item => item[col] !== null && item[col] !== undefined && item[col] <= val);
        return this;
    }

    gt(col, val) {
        this.filters.push(item => item[col] !== null && item[col] !== undefined && item[col] > val);
        return this;
    }

    lt(col, val) {
        this.filters.push(item => item[col] !== null && item[col] !== undefined && item[col] < val);
        return this;
    }

    order(col, { ascending = true } = {}) {
        this.orderRules.push({ col, ascending });
        return this;
    }

    limit(n) {
        this.limitCount = n;
        return this;
    }

    range(from, to) {
        this.rangeFrom = from;
        this.rangeTo   = to;
        return this;
    }

    single() {
        this.isSingle = true;
        return this;
    }

    async _execute() {
        let items = LocalDB.get(this.tableName);

        if (this.operation === 'INSERT') {
            const pkField = {
                users: 'user_id',
                resources: 'resource_id',
                bookings: 'booking_id',
                audit_logs: 'audit_id',
                notifications: 'notification_id'
            }[this.tableName] || 'id';

            let maxId = items.reduce((m, r) => Math.max(m, r[pkField] || 0), 0);
            const inserted = this.payload.map(row => {
                maxId++;
                return {
                    [pkField]: row[pkField] || maxId,
                    created_at: row.created_at || new Date().toISOString(),
                    ...row
                };
            });

            items.push(...inserted);
            LocalDB.set(this.tableName, items);

            const resultData = this.isSingle ? inserted[0] : inserted;
            return { data: resultData, error: null, count: inserted.length };
        }

        if (this.operation === 'UPDATE') {
            const updated = [];
            items = items.map(item => {
                const matches = this.filters.every(f => f(item));
                if (matches) {
                    const newItem = { ...item, ...this.payload };
                    updated.push(newItem);
                    return newItem;
                }
                return item;
            });
            LocalDB.set(this.tableName, items);
            return { data: this.isSingle ? (updated[0] || null) : updated, error: null, count: updated.length };
        }

        if (this.operation === 'DELETE') {
            const remaining = [];
            const deleted = [];
            items.forEach(item => {
                if (this.filters.every(f => f(item))) deleted.push(item);
                else remaining.push(item);
            });
            LocalDB.set(this.tableName, remaining);
            return { data: deleted, error: null, count: deleted.length };
        }

        // SELECT OPERATION
        let filtered = items.filter(item => this.filters.every(f => f(item)));
        const totalCount = filtered.length;

        if (this.isHead) {
            return { data: null, error: null, count: totalCount };
        }

        // Sorting
        if (this.orderRules.length > 0) {
            filtered.sort((a, b) => {
                for (const { col, ascending } of this.orderRules) {
                    const va = a[col] ?? '';
                    const vb = b[col] ?? '';
                    if (va < vb) return ascending ? -1 : 1;
                    if (va > vb) return ascending ? 1 : -1;
                }
                return 0;
            });
        }

        if (this.rangeFrom !== undefined && this.rangeTo !== undefined) {
            filtered = filtered.slice(this.rangeFrom, this.rangeTo + 1);
        } else if (this.limitCount !== null) {
            filtered = filtered.slice(0, this.limitCount);
        }

        // Resolve relational foreign keys (JOIN emulation)
        filtered = filtered.map(row => {
            const copy = { ...row };

            // Join users
            if (this.selectSpec.includes('users')) {
                const users = LocalDB.get('users');
                const uId = copy.requested_by || copy.actor_user_id || copy.user_id;
                const userObj = users.find(u => u.user_id === uId);
                copy.users = userObj ? { name: userObj.name, email: userObj.email } : null;
            }

            // Join resources
            if (this.selectSpec.includes('resources')) {
                const resources = LocalDB.get('resources');
                const rId = copy.resource_id;
                const resObj = resources.find(r => r.resource_id === rId);
                copy.resources = resObj ? {
                    room_code: resObj.room_code,
                    resource_type: resObj.resource_type,
                    block: resObj.block,
                    capacity: resObj.capacity,
                    notes: resObj.notes
                } : null;
            }

            // Join roles
            if (this.selectSpec.includes('roles')) {
                const roles = LocalDB.get('roles');
                const roleObj = roles.find(r => r.role_id === copy.role_id);
                copy.roles = roleObj ? { role_name: roleObj.role_name, can_override: roleObj.can_override } : null;
            }

            return copy;
        });

        if (this.isSingle) {
            return { data: filtered[0] || null, error: null, count: filtered.length ? 1 : 0 };
        }

        return { data: filtered, error: null, count: totalCount };
    }

    then(onfulfilled, onrejected) {
        return this._execute().then(onfulfilled, onrejected);
    }

    catch(onrejected) {
        return this._execute().catch(onrejected);
    }
}

// ── Exported Supabase Bridge ──────────────────────────────────
let realClient = null;
if (isConfigured) {
    try {
        realClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
        console.warn('Real Supabase init failed, falling back to LocalDB:', e);
    }
}

export const supabase = {
    from(tableName) {
        if (isConfigured && realClient) {
            return realClient.from(tableName);
        }
        return new MockQueryBuilder(tableName);
    }
};
