// ============================================================
// Team 3 — Admin Dashboard Stat Cards (Live Supabase)
// Owner: Girish (Team 3)
// Reads from: users, resources, bookings (SELECT only)
// ============================================================

import { supabase } from './supabase-client.js';

// ── Helpers ─────────────────────────────────────────────────
function setStatEl(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<span style="font-size:32px;font-weight:bold;">${value}</span>`;
}

function setStatError(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<span style="font-size:14px;color:#9ca3af;">—</span>';
}

async function countQuery(table, filters = []) {
    let q = supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

    filters.forEach(([col, val]) => { q = q.eq(col, val); });

    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
}

// ── Individual stat loaders ──────────────────────────────────
async function loadTotalUsers() {
    try {
        const count = await countQuery('users');
        setStatEl('stat-users', count);
    } catch (e) {
        console.warn('[T3 Dashboard] users count error:', e.message);
        setStatError('stat-users');
    }
}

async function loadTotalLabs() {
    try {
        const count = await countQuery('resources', [
            ['resource_type', 'Lab'],
            ['status', 'ACTIVE'],
        ]);
        setStatEl('stat-labs', count);
    } catch (e) {
        console.warn('[T3 Dashboard] labs count error:', e.message);
        setStatError('stat-labs');
    }
}

async function loadTotalClassrooms() {
    try {
        const count = await countQuery('resources', [
            ['resource_type', 'Classroom'],
            ['status', 'ACTIVE'],
        ]);
        setStatEl('stat-classrooms', count);
    } catch (e) {
        console.warn('[T3 Dashboard] classrooms count error:', e.message);
        setStatError('stat-classrooms');
    }
}

async function loadActiveBookings() {
    try {
        const count = await countQuery('bookings', [['status', 'APPROVED']]);
        setStatEl('stat-bookings', count);
    } catch (e) {
        console.warn('[T3 Dashboard] bookings count error:', e.message);
        setStatError('stat-bookings');
    }
}

async function loadPendingRequests() {
    try {
        const count = await countQuery('bookings', [['status', 'PENDING']]);
        setStatEl('stat-pending', count);
    } catch (e) {
        console.warn('[T3 Dashboard] pending count error:', e.message);
        setStatError('stat-pending');
    }
}

async function loadTotalBookings() {
    try {
        const count = await countQuery('bookings');
        setStatEl('stat-total-bookings', count);
    } catch (e) {
        console.warn('[T3 Dashboard] total bookings error:', e.message);
        setStatError('stat-total-bookings');
    }
}

// ── Recent activity table ────────────────────────────────────
async function loadRecentActivity() {
    const tbody = document.getElementById('t3-recent-tbody');
    if (!tbody) return;

    try {
        const { data, error } = await supabase
            .from('audit_logs')
            .select(`
                event_type,
                new_state,
                reason,
                created_at,
                users!audit_logs_actor_user_id_fkey ( name )
            `)
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) throw error;

        tbody.innerHTML = '';
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="t3-empty">No recent activity.</td></tr>';
            return;
        }

        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.users?.name ?? '—'}</td>
                <td>${row.event_type.replace(/_/g, ' ')}</td>
                <td>${row.new_state ?? '—'}</td>
                <td style="font-size:12px;color:#6b7280;">${new Date(row.created_at).toLocaleString('en-IN')}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.warn('[T3 Dashboard] recent activity error:', e.message);
        tbody.innerHTML = '<tr><td colspan="4" class="t3-empty">Could not load activity.</td></tr>';
    }
}

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Load all stats in parallel
    Promise.all([
        loadTotalUsers(),
        loadTotalLabs(),
        loadTotalClassrooms(),
        loadActiveBookings(),
        loadPendingRequests(),
        loadTotalBookings(),
        loadRecentActivity(),
    ]);
});
