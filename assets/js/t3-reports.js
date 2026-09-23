// ============================================================
// Team 3 — Reports Page (Live Supabase + CSV Export)
// Owner: Girish (Team 3)
// Reads from: bookings, resources, audit_logs, users (SELECT only)
// ============================================================

import { supabase, LocalDB } from './supabase-client.js';
import { deleteMaintenance, createMaintenance, getMaintenance } from './maintenance-api.js';

// ── CSV Export Utility ───────────────────────────────────────
function exportCSV(rows, filename, tbodyId = null) {
    let exportRows = (rows && Array.isArray(rows) && rows.length > 0) ? [...rows] : null;

    // DOM fallback: if data array is empty, scrape rendered HTML table rows
    if ((!exportRows || exportRows.length === 0) && tbodyId) {
        const tbody = document.getElementById(tbodyId);
        const table = tbody?.closest('table');
        if (table) {
            const thElements = Array.from(table.querySelectorAll('thead th'));
            const headers = thElements
                .map(th => th.innerText.replace(/[\r\n]+/g, ' ').trim())
                .filter(h => h && h.toLowerCase() !== 'actions');

            const trElements = Array.from(tbody.querySelectorAll('tr')).filter(tr => 
                !tr.querySelector('.t3-stat-loading, .t3-empty, .t3-error')
            );

            if (trElements.length > 0) {
                exportRows = trElements.map(tr => {
                    const cells = Array.from(tr.querySelectorAll('td'));
                    const rowObj = {};
                    headers.forEach((h, i) => {
                        rowObj[h] = cells[i] ? cells[i].innerText.replace(/[\r\n]+/g, ' ').trim() : '';
                    });
                    return rowObj;
                });
            }
        }
    }

    if (!exportRows || exportRows.length === 0) {
        alert('No data to export. Please ensure records are loaded.');
        return;
    }

    const headers = Object.keys(exportRows[0]);
    const lines   = [
        headers.join(','),
        ...exportRows.map(row =>
            headers.map(h => {
                const val = row[h] ?? '';
                const str = String(val).replace(/"/g, '""');
                return /[",\n\r]/.test(str) ? `"${str}"` : str;
            }).join(',')
        ),
    ];

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
    }, 1000);
}

// ── Badge HTML ───────────────────────────────────────────────
function statusBadge(status) {
    const cls = {
        APPROVED:    't3-badge-approved',
        PENDING:     't3-badge-pending',
        DENIED:      't3-badge-denied',
        CANCELLED:   't3-badge-cancelled',
        PREEMPTED:   't3-badge-preempted',
        COMPLETED:   't3-badge-completed',
        MAINTENANCE: 't3-badge-maintenance',
        SCHEDULED:   't3-badge-maintenance',
        IN_PROGRESS: 't3-badge-maintenance',
    }[status] || 't3-badge-default';
    return `<span class="t3-badge ${cls}">${status}</span>`;
}

// ── Get filter values ────────────────────────────────────────
function getFilters() {
    return {
        dateFrom:     document.getElementById('t3-filter-from')?.value || null,
        dateTo:       document.getElementById('t3-filter-to')?.value   || null,
        resourceType: document.getElementById('t3-filter-type')?.value || '',
        bookingType:  document.getElementById('t3-filter-booking-type')?.value || '',
        status:       document.getElementById('t3-filter-status')?.value || '',
    };
}

// ── Apply date + type + status filters to a Supabase query ──
function applyBookingFilters(query, filters) {
    if (filters.dateFrom)    query = query.gte('start_at', filters.dateFrom);
    if (filters.dateTo)      query = query.lte('start_at', filters.dateTo + 'T23:59:59');
    if (filters.bookingType) query = query.eq('booking_type', filters.bookingType);
    if (filters.status)      query = query.eq('status', filters.status);
    return query;
}

// ── REPORT 1: Booking Count by Status ───────────────────────
let report1Data = [];

async function loadReport1(filters) {
    const tbody = document.getElementById('t3-r1-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4"><span class="t3-stat-loading"></span></td></tr>';

    try {
        let q = supabase
            .from('bookings')
            .select(`
                booking_id,
                status,
                booking_type,
                start_at,
                end_at,
                resources ( room_code, resource_type )
            `)
            .order('created_at', { ascending: false });

        q = applyBookingFilters(q, filters);

        // Resource type filter (on joined table — post-filter in JS)
        const { data, error } = await q.limit(200);
        if (error) throw error;

        let rows = data || [];
        if (filters.resourceType) {
            rows = rows.filter(r => r.resources?.resource_type === filters.resourceType);
        }

        report1Data = rows.map(r => ({
            'Booking ID':    r.booking_id,
            'Resource':      r.resources?.room_code ?? '—',
            'Type':          r.resources?.resource_type ?? '—',
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
                <td>${r.resources?.room_code ?? '—'} <small style="color:#6b7280;">(${r.resources?.resource_type ?? ''})</small></td>
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
        // Fetch all APPROVED bookings with resource info
        let q = supabase
            .from('bookings')
            .select(`
                resource_id,
                start_at,
                end_at,
                status,
                resources ( room_code, resource_type, block )
            `)
            .eq('status', 'APPROVED');

        if (filters.dateFrom) q = q.gte('start_at', filters.dateFrom);
        if (filters.dateTo)   q = q.lte('start_at', filters.dateTo + 'T23:59:59');

        const { data, error } = await q.limit(500);
        if (error) throw error;

        let rows = data || [];
        if (filters.resourceType) {
            rows = rows.filter(r => r.resources?.resource_type === filters.resourceType);
        }

        // Aggregate by resource
        const map = {};
        rows.forEach(r => {
            const key  = r.resource_id;
            const hrs  = r.start_at && r.end_at
                ? (new Date(r.end_at) - new Date(r.start_at)) / 3600000
                : 0;
            if (!map[key]) {
                map[key] = {
                    room_code:     r.resources?.room_code ?? '—',
                    resource_type: r.resources?.resource_type ?? '—',
                    block:         r.resources?.block ?? '—',
                    bookings:      0,
                    booked_hrs:    0,
                };
            }
            map[key].bookings++;
            map[key].booked_hrs += hrs;
        });

        const agg = Object.values(map);
        // Operating hours available: 10h/day × 5 days. Simplified for seed data period.
        const AVAIL_HRS = 50; // arbitrary reference for utilisation %

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
        let q = supabase
            .from('audit_logs')
            .select(`
                audit_id,
                event_type,
                previous_state,
                new_state,
                reason,
                created_at,
                users!audit_logs_actor_user_id_fkey ( name )
            `)
            .order('created_at', { ascending: false });

        if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom);
        if (filters.dateTo)   q = q.lte('created_at', filters.dateTo + 'T23:59:59');

        const { data, error } = await q.limit(200);
        if (error) throw error;

        const rows = data || [];

        report3Data = rows.map(r => ({
            'Audit ID':    r.audit_id,
            'Actor':       r.users?.name ?? '—',
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
                <td>${r.users?.name ?? '—'}</td>
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

// ── REPORT 4: Resource Maintenance & Unavailable Time Slots ───
let maintenanceReportData = [];

// Format date as DD-MM-YYYY
function fmtDateDMY(dateObj) {
    if (!dateObj) return '—';
    const d = String(dateObj.getDate()).padStart(2, '0');
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const y = dateObj.getFullYear();
    return `${d}-${m}-${y}`;
}

// Expand maintenance period into discrete time slot rows (e.g. 10:00-11:00, 11:00-12:00)
function expandMaintenanceSlots(record) {
    const start = new Date(record.start_at);
    const end   = new Date(record.end_at);
    const slots = [];

    let cur = new Date(start);
    while (cur < end) {
        let next = new Date(cur);
        // Step in 1-hour increments or to end, whichever is smaller
        if (cur.getMinutes() === 0 && (end - cur) >= 60 * 60 * 1000) {
            next.setHours(cur.getHours() + 1, 0, 0, 0);
        } else if (cur.getMinutes() !== 0) {
            next.setHours(cur.getHours() + 1, 0, 0, 0);
            if (next > end) next = new Date(end);
        } else {
            next = new Date(end);
        }

        const sH = String(cur.getHours()).padStart(2, '0');
        const sM = String(cur.getMinutes()).padStart(2, '0');
        const eH = String(next.getHours()).padStart(2, '0');
        const eM = String(next.getMinutes()).padStart(2, '0');

        const startTimeStr = `${sH}:${sM}`;
        const endTimeStr   = `${eH}:${eM}`;
        const slotStr      = `${startTimeStr}-${endTimeStr}`;

        slots.push({
            maintId: record.id,
            startTimeStr,
            endTimeStr,
            slotStr
        });

        cur = next;
    }

    if (slots.length === 0) {
        const sH = String(start.getHours()).padStart(2, '0');
        const sM = String(start.getMinutes()).padStart(2, '0');
        const eH = String(end.getHours()).padStart(2, '0');
        const eM = String(end.getMinutes()).padStart(2, '0');
        slots.push({
            maintId: record.id,
            startTimeStr: `${sH}:${sM}`,
            endTimeStr: `${eH}:${eM}`,
            slotStr: `${sH}:${sM}-${eH}:${eM}`
        });
    }

    return slots;
}

async function loadMaintenanceReport() {
    const tbody = document.getElementById('t3-maint-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9"><span class="t3-stat-loading"></span></td></tr>';

    const filterDate = document.getElementById('maint-filter-date')?.value || null;
    const filterRes  = document.getElementById('maint-filter-resource')?.value || null;
    const filterStat = document.getElementById('maint-filter-status')?.value || null;

    try {
        let q = supabase
            .from('resource_unavailability')
            .select(`
                id,
                resource_id,
                start_at,
                end_at,
                reason,
                status,
                created_by,
                created_at,
                resources ( room_code, resource_type, block, notes ),
                users ( name, email )
            `)
            .order('start_at', { ascending: false });

        if (filterDate) {
            q = q.gte('start_at', `${filterDate}T00:00:00`)
                 .lte('start_at', `${filterDate}T23:59:59`);
        }
        if (filterRes) {
            q = q.eq('resource_id', parseInt(filterRes, 10));
        }
        if (filterStat) {
            q = q.eq('status', filterStat);
        }

        const { data, error } = await q.limit(200);
        if (error) throw error;

        const records = data || [];
        maintenanceReportData = [];

        // Expand each maintenance period into individual time slots
        const allSlotRows = [];
        records.forEach(r => {
            const slots = expandMaintenanceSlots(r);
            const start = new Date(r.start_at);
            const dateStr = fmtDateDMY(start);
            const roomName = r.resources?.room_code || `Resource #${r.resource_id}`;
            const resType  = r.resources?.resource_type || 'Laboratory';

            slots.forEach(s => {
                maintenanceReportData.push({
                    'Resource':           roomName,
                    'Resource Type':      resType,
                    'Date':               dateStr,
                    'Start Time':         s.startTimeStr,
                    'End Time':           s.endTimeStr,
                    'Time Slot':          s.slotStr,
                    'Status':             r.status || 'MAINTENANCE',
                    'Maintenance Reason': r.reason || 'Computer Servicing'
                });

                allSlotRows.push({
                    maintId:      r.id,
                    roomName,
                    resType,
                    block:        r.resources?.block || '',
                    dateStr,
                    startTimeStr: s.startTimeStr,
                    endTimeStr:   s.endTimeStr,
                    slotStr:      s.slotStr,
                    status:       r.status || 'MAINTENANCE',
                    reason:       r.reason || 'Computer Servicing'
                });
            });
        });

        tbody.innerHTML = '';

        if (allSlotRows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="t3-empty">No maintenance periods or unavailable time slots match the selected filters.</td></tr>';
            return;
        }

        allSlotRows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <strong>${row.roomName}</strong>
                    ${row.block ? `<div style="font-size:11px;color:#6b7280;">Block ${row.block}</div>` : ''}
                </td>
                <td><span style="font-size:12px;font-weight:500;">${row.resType}</span></td>
                <td style="white-space:nowrap;font-weight:500;">📅 ${row.dateStr}</td>
                <td style="font-weight:600;white-space:nowrap;">${row.startTimeStr}</td>
                <td style="font-weight:600;white-space:nowrap;">${row.endTimeStr}</td>
                <td style="font-weight:600;color:#1e40af;white-space:nowrap;">⏰ ${row.slotStr}</td>
                <td>${statusBadge(row.status)}</td>
                <td>
                    <div style="font-size:13px;font-weight:500;">${row.reason}</div>
                </td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-delete-maint" data-id="${row.maintId}" style="background:#dc2626;color:#fff;padding:3px 10px;font-size:12px;border:none;border-radius:4px;cursor:pointer;">Remove</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Wire delete buttons
        tbody.querySelectorAll('.btn-delete-maint').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                if (!id) return;
                if (!confirm(`Are you sure you want to remove this maintenance period (#${id})?`)) return;

                btn.disabled = true;
                btn.textContent = 'Removing...';

                try {
                    const res = await deleteMaintenance(id);
                    if (res.success) {
                        await loadMaintenanceReport();
                        await loadSummaryStats(getFilters());
                    } else {
                        alert(res.message || 'Could not remove maintenance.');
                        btn.disabled = false;
                        btn.textContent = 'Remove';
                    }
                } catch (err) {
                    alert('Error removing maintenance: ' + err.message);
                    btn.disabled = false;
                    btn.textContent = 'Remove';
                }
            });
        });

    } catch (e) {
        console.error('[T3 Reports] Maintenance Report error:', e.message);
        tbody.innerHTML = `<tr><td colspan="9"><div class="t3-error">Error loading maintenance data: ${e.message}</div></td></tr>`;
    }
}

// ── Summary stat cards ────────────────────────────────────────
async function loadSummaryStats(filters) {
    try {
        // Total bookings in range
        let q = supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true });
        q = applyBookingFilters(q, filters);
        const { count: totalBookings } = await q;

        // Approved bookings
        let qa = supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'APPROVED');
        if (filters.dateFrom) qa = qa.gte('start_at', filters.dateFrom);
        if (filters.dateTo)   qa = qa.lte('start_at', filters.dateTo + 'T23:59:59');
        if (filters.bookingType) qa = qa.eq('booking_type', filters.bookingType);
        const { count: approved } = await qa;

        // Denied bookings
        let qd = supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'DENIED');
        if (filters.dateFrom) qd = qd.gte('start_at', filters.dateFrom);
        if (filters.dateTo)   qd = qd.lte('start_at', filters.dateTo + 'T23:59:59');
        if (filters.bookingType) qd = qd.eq('booking_type', filters.bookingType);
        const { count: denied } = await qd;

        // Maintenance statistics from resource_unavailability
        let qm = supabase
            .from('resource_unavailability')
            .select('start_at, end_at, status')
            .neq('status', 'CANCELLED');
        if (filters.dateFrom) qm = qm.gte('start_at', filters.dateFrom);
        if (filters.dateTo)   qm = qm.lte('start_at', filters.dateTo + 'T23:59:59');
        const { data: unavailList } = await qm;

        let totalMaintHours = 0;
        let maintSlotCount = 0;
        (unavailList || []).forEach(b => {
            if (b.start_at && b.end_at) {
                const diff = (new Date(b.end_at) - new Date(b.start_at)) / (1000 * 60 * 60);
                if (diff > 0) {
                    totalMaintHours += diff;
                    maintSlotCount += Math.max(1, Math.round(diff));
                }
            }
        });

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
        setEl('t3-stat-maint', totalMaintHours.toFixed(1) + ' hrs');
        const maintSubEl = document.getElementById('t3-stat-maint-sub');
        if (maintSubEl) {
            maintSubEl.textContent = `${maintSlotCount} maintenance slot${maintSlotCount === 1 ? '' : 's'} scheduled`;
        }
    } catch (e) {
        console.warn('[T3 Reports] summary stats error:', e.message);
    }
}

// ── Admin Maintenance UI Init ────────────────────────────────
async function initMaintenanceResources() {
    let resources = [];
    try {
        const { data, error } = await supabase
            .from('resources')
            .select('resource_id, room_code, resource_type, block')
            .eq('status', 'ACTIVE')
            .order('room_code');

        if (!error && data && data.length > 0) {
            resources = data;
        }
    } catch (e) {
        console.warn('[T3 Reports] remote resources fetch failed, using fallback:', e);
    }

    if (!resources || resources.length === 0) {
        const local = LocalDB.get('resources') || [];
        resources = local.filter(r => r.status === 'ACTIVE').sort((a, b) => a.room_code.localeCompare(b.room_code));
    }

    const inputSelect  = document.getElementById('maint-input-resource');
    const filterSelect = document.getElementById('maint-filter-resource');

    if (resources && resources.length > 0) {
        const options = resources.map(r => 
            `<option value="${r.resource_id}">${r.room_code} (${r.resource_type}${r.block ? ' - Block ' + r.block : ''})</option>`
        ).join('');

        if (inputSelect) {
            inputSelect.innerHTML = '<option value="">Select Resource...</option>' + options;
        }
        if (filterSelect) {
            filterSelect.innerHTML = '<option value="">All Resources</option>' + options;
        }
    }
}

function initMaintenanceForm() {
    const form = document.getElementById('maint-schedule-form');
    if (!form) return;

    const dateInput = document.getElementById('maint-input-date');
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().slice(0, 10);
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const alertEl = document.getElementById('maint-form-alert');
        if (alertEl) alertEl.style.display = 'none';

        const resourceId = document.getElementById('maint-input-resource').value;
        const dateStr    = document.getElementById('maint-input-date').value;
        const startTime  = document.getElementById('maint-input-start').value;
        const endTime    = document.getElementById('maint-input-end').value;
        const reason     = document.getElementById('maint-input-reason').value.trim();

        if (!resourceId || !dateStr || !startTime || !endTime || !reason) {
            if (alertEl) {
                alertEl.style.display = 'block';
                alertEl.style.background = '#fef2f2';
                alertEl.style.color = '#b91c1c';
                alertEl.textContent = 'Please fill all required fields.';
            }
            return;
        }

        const startAt = `${dateStr}T${startTime}:00`;
        const endAt   = `${dateStr}T${endTime}:00`;

        if (new Date(endAt) <= new Date(startAt)) {
            if (alertEl) {
                alertEl.style.display = 'block';
                alertEl.style.background = '#fef2f2';
                alertEl.style.color = '#b91c1c';
                alertEl.textContent = 'End time must be after start time.';
            }
            return;
        }

        const saveBtn = document.getElementById('btn-save-maintenance');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }

        try {
            const response = await fetch('/api/maintenance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resource_id: parseInt(resourceId, 10),
                    start_at:    startAt,
                    end_at:      endAt,
                    reason,
                    status:      'MAINTENANCE'
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                if (alertEl) {
                    alertEl.style.display = 'block';
                    alertEl.style.background = '#dcfce7';
                    alertEl.style.color = '#15803d';
                    alertEl.textContent = '✓ Maintenance scheduled successfully!';
                }
                form.reset();
                if (dateInput) dateInput.value = dateStr;
                await loadMaintenanceReport();
                await loadSummaryStats(getFilters());
            } else {
                if (alertEl) {
                    alertEl.style.display = 'block';
                    alertEl.style.background = '#fef2f2';
                    alertEl.style.color = '#b91c1c';
                    alertEl.textContent = result.message || 'Failed to schedule maintenance.';
                }
            }
        } catch (err) {
            if (alertEl) {
                alertEl.style.display = 'block';
                alertEl.style.background = '#fef2f2';
                alertEl.style.color = '#b91c1c';
                alertEl.textContent = err.message || 'Error scheduling maintenance.';
            }
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = '➕ Schedule Maintenance';
            }
        }
    });

    document.getElementById('btn-maint-filter-apply')?.addEventListener('click', () => loadMaintenanceReport());
    document.getElementById('btn-maint-filter-reset')?.addEventListener('click', () => {
        const dateEl = document.getElementById('maint-filter-date');
        const resEl  = document.getElementById('maint-filter-resource');
        const statEl = document.getElementById('maint-filter-status');
        if (dateEl) dateEl.value = '';
        if (resEl)  resEl.value = '';
        if (statEl) statEl.value = '';
        loadMaintenanceReport();
    });
}

// ── Load all reports ─────────────────────────────────────────
function loadAllReports() {
    const filters = getFilters();
    loadSummaryStats(filters);
    loadReport1(filters);
    loadReport2(filters);
    loadReport3(filters);
    loadMaintenanceReport();
}

// ── Boot ─────────────────────────────────────────────────────
async function bootReports() {
    // Apply general filter button
    document.getElementById('t3-filter-apply')
        ?.addEventListener('click', loadAllReports);

    // Reset general filters
    document.getElementById('t3-filter-reset')
        ?.addEventListener('click', () => {
            ['t3-filter-from','t3-filter-to','t3-filter-type','t3-filter-booking-type','t3-filter-status']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
            loadAllReports();
        });

    // CSV Export buttons (with table DOM fallback)
    document.getElementById('t3-export-r1')
        ?.addEventListener('click', () => exportCSV(report1Data, 'booking_count_report.csv', 't3-r1-tbody'));
    document.getElementById('t3-export-r2')
        ?.addEventListener('click', () => exportCSV(report2Data, 'resource_utilisation_report.csv', 't3-r2-tbody'));
    document.getElementById('t3-export-r3')
        ?.addEventListener('click', () => exportCSV(report3Data, 'audit_activity_report.csv', 't3-r3-tbody'));
    document.getElementById('t3-export-maint')
        ?.addEventListener('click', () => exportCSV(maintenanceReportData, 'maintenance_report_' + new Date().toISOString().slice(0, 10) + '.csv', 't3-maint-tbody'));

    // Expose helpers globally
    window.exportCSV = exportCSV;
    window.loadAllReports = loadAllReports;
    window.loadMaintenanceReport = loadMaintenanceReport;

    // Init maintenance management form and resources
    await initMaintenanceResources();
    initMaintenanceForm();

    // Initial load
    loadAllReports();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootReports);
} else {
    bootReports();
}
