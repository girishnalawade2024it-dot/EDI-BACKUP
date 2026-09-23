// ============================================================
// Team 3 — Audit Log Viewer
// Owner: Girish (Team 3)
// Reads from: audit_logs JOIN users (SELECT only)
// ============================================================

import { supabase } from './supabase-client.js';

// ── State ────────────────────────────────────────────────────
let currentPage  = 0;
const PAGE_SIZE  = 25;
let currentData  = [];   // full filtered data for CSV export
let hasMore      = true;

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
            <td>${r.users?.name ?? '—'}</td>
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
async function populateUserDropdown() {
    const select = document.getElementById('t3-al-user');
    if (!select) return;

    const { data, error } = await supabase
        .from('users')
        .select('user_id, name')
        .order('name');

    if (error || !data) return;

    data.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.user_id;
        opt.textContent = u.name;
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

// ── Fetch a page of audit logs ────────────────────────────────
async function fetchPage(page, filters) {
    let q = supabase
        .from('audit_logs')
        .select(`
            audit_id,
            event_type,
            target_entity_type,
            target_entity_id,
            previous_state,
            new_state,
            reason,
            created_at,
            users!audit_logs_actor_user_id_fkey ( name )
        `)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (filters.dateFrom)  q = q.gte('created_at', filters.dateFrom);
    if (filters.dateTo)    q = q.lte('created_at', filters.dateTo + 'T23:59:59');
    if (filters.userId)    q = q.eq('actor_user_id', filters.userId);
    if (filters.eventType) q = q.eq('event_type', filters.eventType);

    return q;
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

// ── Full CSV export (fetch up to 1000 rows with filters) ──────
async function exportFiltered() {
    const filters = getFilters();

    let q = supabase
        .from('audit_logs')
        .select(`
            audit_id,
            event_type,
            target_entity_type,
            target_entity_id,
            previous_state,
            new_state,
            reason,
            transaction_id,
            created_at,
            users!audit_logs_actor_user_id_fkey ( name )
        `)
        .order('created_at', { ascending: false })
        .limit(1000);

    if (filters.dateFrom)  q = q.gte('created_at', filters.dateFrom);
    if (filters.dateTo)    q = q.lte('created_at', filters.dateTo + 'T23:59:59');
    if (filters.userId)    q = q.eq('actor_user_id', filters.userId);
    if (filters.eventType) q = q.eq('event_type', filters.eventType);

    const { data, error } = await q;
    if (error) { alert('Export failed: ' + error.message); return; }

    const rows = (data || []).map(r => ({
        'Audit ID':        r.audit_id,
        'Timestamp':       r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '',
        'Actor':           r.users?.name ?? '',
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
async function loadTable(reset = true) {
    const tbody   = document.getElementById('t3-al-tbody');
    const loadBtn = document.getElementById('t3-al-more');
    if (!tbody) return;

    if (reset) {
        currentPage = 0;
        hasMore     = true;
        tbody.innerHTML = '<tr><td colspan="6"><span class="t3-stat-loading" style="margin:12px auto;display:block;"></span></td></tr>';
    }

    const filters = getFilters();
    const { data, error } = await fetchPage(currentPage, filters);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="t3-error">Error: ${error.message}</div></td></tr>`;
        return;
    }

    const rows = data || [];
    hasMore = rows.length === PAGE_SIZE;

    renderRows(rows, tbody, !reset);

    if (loadBtn) {
        loadBtn.style.display = hasMore ? 'block' : 'none';
    }

    currentPage++;
}

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        populateUserDropdown(),
        populateEventDropdown(),
    ]);

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
