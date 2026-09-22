// ============================================================
// Team 3 — Audit Log Viewer (Django API)
// ============================================================

import { apiClient } from './api-client.js';

// ── State ────────────────────────────────────────────────────
let currentPage  = 0;
const PAGE_SIZE  = 25;
let fullData     = [];
let filteredData = [];

// ── CSV Export ───────────────────────────────────────────────
function exportCSV(rows, filename) {
    if (!rows || rows.length === 0) { alert('No data to export.'); return; }
    const headers = Object.keys(rows[0]);
    const lines   = [
        headers.join(','),
        ...rows.map(row =>
            headers.map(h => {
                const str = String(row[h] ?? '').replace(/"/g, '""');
                return /[",\n]/.test(str) ? `"${str}"` : str;
            }).join(',')
        ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
        href: url, download: filename,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ── Status badge ─────────────────────────────────────────────
function stateBadge(state) {
    if (!state) return '—';
    const cls = {
        APPROVED:  't3-badge-approved',
        PENDING:   't3-badge-pending',
        DENIED:    't3-badge-denied',
        CANCELLED: 't3-badge-cancelled',
        PREEMPTED: 't3-badge-preempted',
        COMPLETED: 't3-badge-completed',
    }[state] || 't3-badge-default';
    return `<span class="t3-badge ${cls}">${state}</span>`;
}

// ── Render rows into table ────────────────────────────────────
function renderRows(rows, tbody, append = false) {
    if (!append) tbody.innerHTML = '';

    if (!rows || rows.length === 0) {
        if (!append) {
            tbody.innerHTML = '<tr><td colspan="6" class="t3-empty">No audit events match the current filters.</td></tr>';
        }
        return;
    }

    rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-size:12px;color:#6b7280;">${new Date(r.created_at).toLocaleString('en-IN')}</td>
            <td>${r.actor_user?.name ?? '—'}</td>
            <td>${r.event_type.replace(/_/g, ' ')}</td>
            <td>${r.target_entity_type ?? '—'} ${r.target_entity_id ? `#${r.target_entity_id}` : ''}</td>
            <td>
                ${r.previous_state ? stateBadge(r.previous_state) : '—'}
                ${r.previous_state && r.new_state ? ' → ' : ''}
                ${r.new_state ? stateBadge(r.new_state) : ''}
            </td>
            <td style="font-size:12px;color:#374151;">${r.reason ?? '—'}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ── Populate user dropdown ────────────────────────────────────
function populateUserDropdown(data) {
    const select = document.getElementById('t3-al-user');
    if (!select) return;
    
    // Extract unique users from audit logs
    const users = new Map();
    data.forEach(r => {
        if (r.actor_user) {
            users.set(r.actor_user.user_id, r.actor_user.name);
        }
    });

    Array.from(users.entries()).sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, name]) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = name;
        select.appendChild(opt);
    });
}

// ── Populate event type dropdown from seed data ───────────────
const KNOWN_EVENTS = [
    'BOOKING_CREATED',
    'BOOKING_APPROVED',
    'BOOKING_DENIED',
    'BOOKING_CANCELLED',
    'BOOKING_PREEMPTED',
    'BOOKING_COMPLETED',
];

function populateEventDropdown() {
    const select = document.getElementById('t3-al-event');
    if (!select) return;

    KNOWN_EVENTS.forEach(ev => {
        const opt = document.createElement('option');
        opt.value = ev;
        opt.textContent = ev.replace(/_/g, ' ');
        select.appendChild(opt);
    });
}

// ── Get current filter values ─────────────────────────────────
function getFilters() {
    return {
        dateFrom:  document.getElementById('t3-al-from')?.value  || null,
        dateTo:    document.getElementById('t3-al-to')?.value    || null,
        userId:    document.getElementById('t3-al-user')?.value  || null,
        eventType: document.getElementById('t3-al-event')?.value || null,
    };
}

// ── Full CSV export ───────────────────────────────────────────
async function exportFiltered() {
    if (filteredData.length === 0) { alert('No data to export.'); return; }

    const rows = filteredData.slice(0, 1000).map(r => ({
        'Audit ID':        r.audit_id,
        'Timestamp':       r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '',
        'Actor':           r.actor_user?.name ?? '',
        'Event Type':      r.event_type,
        'Entity Type':     r.target_entity_type ?? '',
        'Entity ID':       r.target_entity_id ?? '',
        'Previous State':  r.previous_state ?? '',
        'New State':       r.new_state ?? '',
        'Reason':          r.reason ?? '',
        'Transaction ID':  r.transaction_id ?? '',
    }));

    exportCSV(rows, 'audit_log_export.csv');
}

// ── Load / reload table ───────────────────────────────────────
async function fetchAllData() {
    const { data, error } = await apiClient.get('/audit-logs/');
    if (error) {
        alert('Error loading audit logs: ' + error.message);
        return [];
    }
    // Sort descending by created_at
    return data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function applyFilters() {
    const filters = getFilters();
    filteredData = fullData.filter(r => {
        if (filters.dateFrom && r.created_at < filters.dateFrom) return false;
        if (filters.dateTo && r.created_at > filters.dateTo + 'T23:59:59') return false;
        if (filters.userId && r.actor_user?.user_id != filters.userId) return false;
        if (filters.eventType && r.event_type !== filters.eventType) return false;
        return true;
    });
}

async function loadTable(reset = true) {
    const tbody   = document.getElementById('t3-al-tbody');
    const loadBtn = document.getElementById('t3-al-more');
    if (!tbody) return;

    if (reset) {
        if (fullData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6"><span class="t3-stat-loading" style="margin:12px auto;display:block;"></span></td></tr>';
            fullData = await fetchAllData();
            populateUserDropdown(fullData);
        }
        currentPage = 0;
        applyFilters();
    }

    const start = currentPage * PAGE_SIZE;
    const end   = start + PAGE_SIZE;
    const pageRows = filteredData.slice(start, end);

    renderRows(pageRows, tbody, !reset);

    if (loadBtn) {
        loadBtn.style.display = (end < filteredData.length) ? 'block' : 'none';
    }

    currentPage++;
}

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    populateEventDropdown();

    // Apply filter
    document.getElementById('t3-al-apply')
        ?.addEventListener('click', () => loadTable(true));

    // Reset filters
    document.getElementById('t3-al-reset')
        ?.addEventListener('click', () => {
            ['t3-al-from','t3-al-to','t3-al-user','t3-al-event']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
            loadTable(true);
        });

    // Load more (pagination)
    document.getElementById('t3-al-more')
        ?.addEventListener('click', () => loadTable(false));

    // Export CSV
    document.getElementById('t3-al-export')
        ?.addEventListener('click', exportFiltered);

    // Initial load
    loadTable(true);
});
