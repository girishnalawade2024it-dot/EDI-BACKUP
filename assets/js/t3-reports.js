// ============================================================
// Team 3 — Reports Page (Django API + CSV Export)
// ============================================================

import { apiClient } from './api-client.js';

// ── CSV Export Utility ───────────────────────────────────────
function exportCSV(rows, filename) {
    if (!rows || rows.length === 0) {
        alert('No data to export.');
        return;
    }
    const headers = Object.keys(rows[0]);
    const lines   = [
        headers.join(','),
        ...rows.map(row =>
            headers.map(h => {
                const val = row[h] ?? '';
                const str = String(val).replace(/"/g, '""');
                return /[",\n]/.test(str) ? `"${str}"` : str;
            }).join(',')
        ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
        href: url,
        download: filename,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ── Badge HTML ───────────────────────────────────────────────
function statusBadge(status) {
    const cls = {
        APPROVED:  't3-badge-approved',
        PENDING:   't3-badge-pending',
        DENIED:    't3-badge-denied',
        CANCELLED: 't3-badge-cancelled',
        PREEMPTED: 't3-badge-preempted',
        COMPLETED: 't3-badge-completed',
    }[status] || 't3-badge-default';
    return `<span class="t3-badge ${cls}">${status}</span>`;
}

// ── Get filter values ────────────────────────────────────────
function getFilters() {
    return {
        dateFrom:     document.getElementById('t3-filter-from')?.value || null,
        dateTo:       document.getElementById('t3-filter-to')?.value   || null,
        resourceType: document.getElementById('t3-filter-type')?.value || '',
        status:       document.getElementById('t3-filter-status')?.value || '',
    };
}

// ── Apply JS filters ─────────────────────────────────────────
function filterBookings(bookings, filters) {
    return bookings.filter(b => {
        if (filters.dateFrom && b.start_at < filters.dateFrom) return false;
        if (filters.dateTo && b.start_at > filters.dateTo + 'T23:59:59') return false;
        if (filters.status && b.status !== filters.status) return false;
        if (filters.resourceType && b.resource?.resource_type !== filters.resourceType) return false;
        return true;
    });
}

// ── REPORT 1: Booking Count by Status ───────────────────────
let report1Data = [];

async function loadReport1(filters) {
    const tbody = document.getElementById('t3-r1-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4"><span class="t3-stat-loading"></span></td></tr>';

    try {
        const { data, error } = await apiClient.get('/bookings/');
        if (error) throw error;

        let rows = filterBookings(data, filters).slice(0, 200);

        report1Data = rows.map(r => ({
            'Booking ID':    r.booking_id,
            'Resource':      r.resource?.room_code ?? '—',
            'Type':          r.resource?.resource_type ?? '—',
            'Booking Type':  r.booking_type,
            'Start':         r.start_at ? new Date(r.start_at).toLocaleString('en-IN') : '—',
            'End':           r.end_at   ? new Date(r.end_at).toLocaleString('en-IN')   : '—',
            'Status':        r.status,
        }));

        tbody.innerHTML = '';

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="t3-empty">No bookings match the current filters.</td></tr>';
            return;
        }

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${r.booking_id}</td>
                <td>${r.resource?.room_code ?? '—'} <small style="color:#6b7280;">(${r.resource?.resource_type ?? ''})</small></td>
                <td>${r.booking_type}</td>
                <td>${statusBadge(r.status)}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('[T3 Reports] Report 1 error:', e.message);
        tbody.innerHTML = `<tr><td colspan="4"><div class="t3-error">Error loading data: ${e.message}</div></td></tr>`;
    }
}

// ── REPORT 2: Resource Utilisation ──────────────────────────
let report2Data = [];

async function loadReport2(filters) {
    const tbody = document.getElementById('t3-r2-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5"><span class="t3-stat-loading"></span></td></tr>';

    try {
        const { data, error } = await apiClient.get('/bookings/');
        if (error) throw error;

        let rows = filterBookings(data, { ...filters, status: 'APPROVED' }).slice(0, 500);

        const map = {};
        rows.forEach(r => {
            const key  = r.resource.resource_id;
            const hrs  = r.start_at && r.end_at
                ? (new Date(r.end_at) - new Date(r.start_at)) / 3600000
                : 0;
            if (!map[key]) {
                map[key] = {
                    room_code:     r.resource?.room_code ?? '—',
                    resource_type: r.resource?.resource_type ?? '—',
                    block:         r.resource?.block ?? '—',
                    bookings:      0,
                    booked_hrs:    0,
                };
            }
            map[key].bookings++;
            map[key].booked_hrs += hrs;
        });

        const agg = Object.values(map);
        const AVAIL_HRS = 50; 

        report2Data = agg.map(r => ({
            'Room':          r.room_code,
            'Type':          r.resource_type,
            'Block':         r.block,
            'Bookings':      r.bookings,
            'Booked Hrs':    r.booked_hrs.toFixed(1),
            'Utilisation %': AVAIL_HRS > 0 ? ((r.booked_hrs / AVAIL_HRS) * 100).toFixed(1) + '%' : '—',
        }));

        tbody.innerHTML = '';

        if (agg.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="t3-empty">No approved bookings match the current filters.</td></tr>';
            return;
        }

        agg.forEach(r => {
            const util = AVAIL_HRS > 0
                ? ((r.booked_hrs / AVAIL_HRS) * 100).toFixed(1) + '%'
                : '—';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${r.room_code}</td>
                <td>${r.resource_type}</td>
                <td>${r.block}</td>
                <td style="text-align:center;">${r.bookings}</td>
                <td>${r.booked_hrs.toFixed(1)} hrs&nbsp;
                    <small style="color:#6b7280;">(${util})</small>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('[T3 Reports] Report 2 error:', e.message);
        tbody.innerHTML = `<tr><td colspan="5"><div class="t3-error">Error loading data: ${e.message}</div></td></tr>`;
    }
}

// ── REPORT 3: Audit Activity ─────────────────────────────────
let report3Data = [];

async function loadReport3(filters) {
    const tbody = document.getElementById('t3-r3-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5"><span class="t3-stat-loading"></span></td></tr>';

    try {
        const { data, error } = await apiClient.get('/audit-logs/');
        if (error) throw error;

        let rows = data;
        if (filters.dateFrom) rows = rows.filter(r => r.created_at >= filters.dateFrom);
        if (filters.dateTo) rows = rows.filter(r => r.created_at <= filters.dateTo + 'T23:59:59');
        
        rows = rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 200);

        report3Data = rows.map(r => ({
            'Audit ID':    r.audit_id,
            'Actor':       r.actor_user?.name ?? '—',
            'Event':       r.event_type,
            'Prev State':  r.previous_state ?? '—',
            'New State':   r.new_state ?? '—',
            'Reason':      r.reason ?? '—',
            'Timestamp':   r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '—',
        }));

        tbody.innerHTML = '';

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="t3-empty">No audit events match the current filters.</td></tr>';
            return;
        }

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-size:12px;color:#6b7280;">#${r.audit_id}</td>
                <td>${r.actor_user?.name ?? '—'}</td>
                <td>${r.event_type.replace(/_/g, ' ')}</td>
                <td>
                    ${r.previous_state ? `<span class="t3-badge t3-badge-default">${r.previous_state}</span>` : '—'}
                    ${r.previous_state && r.new_state ? '→' : ''}
                    ${r.new_state ? statusBadge(r.new_state) : ''}
                </td>
                <td style="font-size:12px;color:#6b7280;">${new Date(r.created_at).toLocaleString('en-IN')}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('[T3 Reports] Report 3 error:', e.message);
        tbody.innerHTML = `<tr><td colspan="5"><div class="t3-error">Error loading data: ${e.message}</div></td></tr>`;
    }
}

// ── Summary stat cards ────────────────────────────────────────
async function loadSummaryStats(filters) {
    try {
        const { data, error } = await apiClient.get('/bookings/');
        if (error) throw error;
        
        const filtered = filterBookings(data, filters);
        const totalBookings = filtered.length;
        const approved = filtered.filter(b => b.status === 'APPROVED').length;
        const denied = filtered.filter(b => b.status === 'DENIED').length;

        const setEl = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val ?? '—';
        };

        setEl('t3-stat-total',    totalBookings ?? 0);
        setEl('t3-stat-approved', approved ?? 0);
        setEl('t3-stat-denied',   denied ?? 0);
        setEl('t3-stat-success',
            totalBookings > 0
                ? ((approved / totalBookings) * 100).toFixed(0) + '%'
                : '—');
    } catch (e) {
        console.warn('[T3 Reports] summary stats error:', e.message);
    }
}

// ── Load all reports ─────────────────────────────────────────
function loadAllReports() {
    const filters = getFilters();
    loadSummaryStats(filters);
    loadReport1(filters);
    loadReport2(filters);
    loadReport3(filters);
}

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Apply filter button
    document.getElementById('t3-filter-apply')
        ?.addEventListener('click', loadAllReports);

    // Reset filters
    document.getElementById('t3-filter-reset')
        ?.addEventListener('click', () => {
            ['t3-filter-from','t3-filter-to','t3-filter-type','t3-filter-status']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
            loadAllReports();
        });

    // CSV Export buttons
    document.getElementById('t3-export-r1')
        ?.addEventListener('click', () => exportCSV(report1Data, 'booking_count_report.csv'));
    document.getElementById('t3-export-r2')
        ?.addEventListener('click', () => exportCSV(report2Data, 'resource_utilisation_report.csv'));
    document.getElementById('t3-export-r3')
        ?.addEventListener('click', () => exportCSV(report3Data, 'audit_activity_report.csv'));

    // Initial load
    loadAllReports();
});
