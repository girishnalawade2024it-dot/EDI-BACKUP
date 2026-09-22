// ============================================================
// Team 3 — Admin Dashboard Stat Cards (Django API)
// ============================================================

import { apiClient } from './api-client.js';

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

// ── Individual stat loaders ──────────────────────────────────
async function loadTotalUsers() {
    setStatEl('stat-users', 6); // Mocked since no user endpoint is exposed
}

async function loadTotalLabs() {
    try {
        const { data, error } = await apiClient.get('/resources/');
        if (error) throw error;
        const count = data.filter(r => r.resource_type === 'Lab' && r.status === 'ACTIVE').length;
        setStatEl('stat-labs', count);
    } catch (e) {
        console.warn('[T3 Dashboard] labs count error:', e.message);
        setStatError('stat-labs');
    }
}

async function loadTotalClassrooms() {
    try {
        const { data, error } = await apiClient.get('/resources/');
        if (error) throw error;
        const count = data.filter(r => r.resource_type === 'Classroom' && r.status === 'ACTIVE').length;
        setStatEl('stat-classrooms', count);
    } catch (e) {
        console.warn('[T3 Dashboard] classrooms count error:', e.message);
        setStatError('stat-classrooms');
    }
}

async function loadActiveBookings() {
    try {
        const { data, error } = await apiClient.get('/bookings/');
        if (error) throw error;
        const count = data.filter(b => b.status === 'APPROVED').length;
        setStatEl('stat-bookings', count);
    } catch (e) {
        console.warn('[T3 Dashboard] bookings count error:', e.message);
        setStatError('stat-bookings');
    }
}

async function loadPendingRequests() {
    try {
        const { data, error } = await apiClient.get('/bookings/');
        if (error) throw error;
        const count = data.filter(b => b.status === 'PENDING').length;
        setStatEl('stat-pending', count);
    } catch (e) {
        console.warn('[T3 Dashboard] pending count error:', e.message);
        setStatError('stat-pending');
    }
}

async function loadTotalBookings() {
    try {
        const { data, error } = await apiClient.get('/bookings/');
        if (error) throw error;
        setStatEl('stat-total-bookings', data.length);
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
        const { data, error } = await apiClient.get('/audit-logs/');
        if (error) throw error;

        // Sort descending by created_at and take top 5
        const logs = data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

        tbody.innerHTML = '';
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="t3-empty">No recent activity.</td></tr>';
            return;
        }

        logs.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.actor_user?.name ?? '—'}</td>
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
