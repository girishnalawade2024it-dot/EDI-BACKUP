// ============================================================
// Team 3 — Reports Page (Live Supabase + Lab-Wise Utilisation & CSV Export)
// Owner: Girish (Team 3)
// Reads from: bookings, resources, audit_logs, users (SELECT only)
// ============================================================

import { supabase, LocalDB } from './supabase-client.js';
import { deleteMaintenance } from './maintenance-api.js';

// ── Master Cache ─────────────────────────────────────────────
let cachedResources = [];
let allFacilitiesPopulated = false;

// ── CSV Export Utilities ─────────────────────────────────────
function downloadCSVBlob(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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

function exportStandardCSV(rows, filename) {
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
    downloadCSVBlob(lines.join('\n'), filename);
}

// ── Badge HTML ───────────────────────────────────────────────
function statusBadge(status) {
    const cls = {
        APPROVED:  't3-badge-approved',
        PENDING:   't3-badge-pending',
        DENIED:    't3-badge-denied',
        CANCELLED:   't3-badge-cancelled',
        PREEMPTED:   't3-badge-preempted',
        COMPLETED:   't3-badge-completed',
        MAINTENANCE: 't3-badge-maintenance',
    }[status] || 't3-badge-default';
    return `<span class="t3-badge ${cls}">${status}</span>`;
}

function fmtDateDMY(date) {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Get filter values ────────────────────────────────────────
function getFilters() {
    return {
        dateFrom:     document.getElementById('t3-filter-from')?.value || null,
        dateTo:       document.getElementById('t3-filter-to')?.value   || null,
        facilityId:   document.getElementById('t3-filter-facility')?.value || '',
        resourceType: document.getElementById('t3-filter-type')?.value || '',
        status:       document.getElementById('t3-filter-status')?.value || '',
    };
}

// ── Resource Master Loader & Facility Selector Population ────
async function ensureResourcesLoaded() {
    if (cachedResources.length > 0) return cachedResources;
    try {
        const { data, error } = await supabase
            .from('resources')
            .select('*')
            .order('room_code', { ascending: true });
        if (!error && data && data.length > 0) {
            cachedResources = data;
        }
    } catch (e) {
        console.warn('[T3 Reports] Resource fetch fallback:', e);
    }

    // Populate Facility dropdown
    const select = document.getElementById('t3-filter-facility');
    if (select && !allFacilitiesPopulated && cachedResources.length > 0) {
        select.innerHTML = `<option value="">All Facilities (${cachedResources.length})</option>`;
        cachedResources.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.resource_id;
            const extra = r.has_machines ? ' (Computers)' : '';
            opt.textContent = `${r.room_code} — ${r.notes || r.resource_type}${extra}`;
            select.appendChild(opt);
        });
        allFacilitiesPopulated = true;
    }
    return cachedResources;
}

// ── Apply date + type + status filters to a Supabase query ──
function applyBookingFilters(query, filters) {
    if (filters.dateFrom) query = query.gte('start_at', filters.dateFrom);
    if (filters.dateTo)   query = query.lte('start_at', filters.dateTo + 'T23:59:59');
    if (filters.status)   query = query.eq('status', filters.status);
    return query;
}

// ── REPORT 1: Booking Count by Status ───────────────────────
let report1Data = [];

async function loadReport1(filters) {
    const tbody = document.getElementById('t3-r1-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5"><span class="t3-stat-loading"></span></td></tr>';

    try {
        let q = supabase
            .from('bookings')
            .select(`
                booking_id,
                status,
                booking_type,
                start_at,
                end_at,
                purpose,
                headcount,
                resource_id,
                resources ( room_code, resource_type, notes )
            `)
            .order('created_at', { ascending: false });

        q = applyBookingFilters(q, filters);

        const { data, error } = await q.limit(300);
        if (error) throw error;

        let rows = data || [];
        if (filters.facilityId) {
            rows = rows.filter(r => String(r.resource_id) === String(filters.facilityId));
        }
        if (filters.resourceType) {
            rows = rows.filter(r => r.resources?.resource_type === filters.resourceType);
        }

        report1Data = rows.map(r => ({
            'Booking ID':    r.booking_id,
            'Resource':      r.resources?.room_code ?? '—',
            'Facility Name': r.resources?.notes ?? r.resources?.room_code ?? '—',
            'Type':          r.resources?.resource_type ?? '—',
            'Booking Type':  r.booking_type,
            'Start Time':    r.start_at ? new Date(r.start_at).toLocaleString('en-IN') : '—',
            'End Time':      r.end_at   ? new Date(r.end_at).toLocaleString('en-IN')   : '—',
            'Headcount':     r.headcount || 0,
            'Purpose':       r.purpose || '—',
            'Status':        r.status,
        }));

        tbody.innerHTML = '';

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="t3-empty">No bookings match the current filters.</td></tr>';
            return;
        }

        rows.forEach(r => {
            const tr = document.createElement('tr');
            const startStr = r.start_at ? new Date(r.start_at).toLocaleDateString('en-IN', { month:'short', day:'numeric' }) + ' ' + new Date(r.start_at).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }) : '—';
            tr.innerHTML = `
                <td>#${r.booking_id}</td>
                <td>
                    <strong>${r.resources?.room_code ?? '—'}</strong>
                    <div style="font-size:11px;color:#64748b;">${r.resources?.notes || r.resources?.resource_type || ''}</div>
                </td>
                <td><span class="t3-specs-tag">${r.booking_type}</span></td>
                <td style="font-size:12px;color:#334155;">${startStr}</td>
                <td>${statusBadge(r.status)}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('[T3 Reports] Report 1 error:', e.message);
        tbody.innerHTML = `<tr><td colspan="5"><div class="t3-error">Error loading data: ${e.message}</div></td></tr>`;
    }
}

// ── REPORT 2: Lab-Wise Resource Utilisation ──────────────────
let detailedLabReportData = [];
let executiveSummaryData = {};

async function loadReport2(filters) {
    const tbody = document.getElementById('t3-r2-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6"><span class="t3-stat-loading"></span></td></tr>';

    try {
        const allResources = await ensureResourcesLoaded();

        // 1. Determine date span and available operational hours
        let numDays = 5; // Default standard 5-day academic week
        if (filters.dateFrom && filters.dateTo) {
            const d1 = new Date(filters.dateFrom);
            const d2 = new Date(filters.dateTo);
            const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
            numDays = Math.max(1, diffDays);
        } else if (filters.dateFrom) {
            numDays = 7;
        }
        // Campus standard: 9 bookable academic periods/day (8:00 to 17:00)
        const AVAIL_HRS_PER_ROOM = numDays * 9.0;

        // 2. Fetch approved bookings with resource joins
        let q = supabase
            .from('bookings')
            .select(`
                booking_id,
                resource_id,
                start_at,
                end_at,
                booking_type,
                purpose,
                headcount,
                status,
                users ( name, email )
            `)
            .eq('status', 'APPROVED');

        if (filters.dateFrom) q = q.gte('start_at', filters.dateFrom);
        if (filters.dateTo)   q = q.lte('start_at', filters.dateTo + 'T23:59:59');

        const { data: approvedBookings, error } = await q.limit(500);
        if (error) throw error;

        const bookingsList = approvedBookings || [];

        // 3. Group bookings by resource_id
        const bookingsByResource = {};
        bookingsList.forEach(b => {
            const rid = b.resource_id;
            if (!bookingsByResource[rid]) bookingsByResource[rid] = [];
            bookingsByResource[rid].push(b);
        });

        // 4. Build comprehensive facility-wise metrics for EVERY resource
        const facilities = allResources.map(res => {
            const rid = res.resource_id;
            const resBookings = bookingsByResource[rid] || [];

            let bookedHours = 0.0;
            let academicHours = 0.0;
            let maintenanceHours = 0.0;
            let examHours = 0.0;
            let headcountTotal = 0;

            resBookings.forEach(b => {
                const hrs = (b.start_at && b.end_at)
                    ? Math.max(0.5, (new Date(b.end_at) - new Date(b.start_at)) / 3600000)
                    : 1.0;
                bookedHours += hrs;
                headcountTotal += (b.headcount || 0);

                const type = (b.booking_type || '').toUpperCase();
                if (type.includes('MAINT')) {
                    maintenanceHours += hrs;
                } else if (type.includes('EXAM') || type.includes('EVENT')) {
                    examHours += hrs;
                } else {
                    academicHours += hrs;
                }
            });

            const idleHours = Math.max(0.0, AVAIL_HRS_PER_ROOM - bookedHours);
            const utilPct = AVAIL_HRS_PER_ROOM > 0
                ? Math.min(100.0, (bookedHours / AVAIL_HRS_PER_ROOM) * 100.0)
                : 0.0;

            // Status Classification
            let statusTag = 'OPTIMAL';
            let statusLabel = 'Optimal Utilisation';
            let fillClass = 't3-fill-optimal';

            if (bookedHours === 0) {
                statusTag = 'ZERO_USAGE';
                statusLabel = '100% Idle / Available';
                fillClass = 't3-fill-zero';
            } else if (utilPct >= 65.0) {
                statusTag = 'HIGH_DEMAND';
                statusLabel = 'High Demand / Contended';
                fillClass = 't3-fill-high-demand';
            } else if (utilPct < 25.0) {
                statusTag = 'UNDERUTILISED';
                statusLabel = 'Underutilised';
                fillClass = 't3-fill-underutilised';
            }

            return {
                resource_id: res.resource_id,
                room_code: res.room_code,
                facility_name: res.notes || (res.resource_type === 'Lab' ? 'Practical Laboratory' : 'Lecture Hall'),
                resource_type: res.resource_type,
                block: res.block || 'Main Block',
                capacity: res.capacity || 40,
                has_machines: Boolean(res.has_machines),
                machine_count: res.has_machines ? (res.capacity || 30) : 0,
                os_installed: res.has_machines ? 'Linux / Windows Dual Boot' : 'N/A',
                booked_hours: bookedHours,
                available_hours: AVAIL_HRS_PER_ROOM,
                idle_hours: idleHours,
                utilisation_pct: utilPct,
                approved_bookings_count: resBookings.length,
                academic_hours: academicHours,
                maintenance_hours: maintenanceHours,
                exam_hours: examHours,
                headcount_served: headcountTotal,
                status_tag: statusTag,
                status_label: statusLabel,
                fill_class: fillClass,
                bookings_list: resBookings,
            };
        });

        // 5. Apply filters for table rendering
        let filteredFacilities = facilities;
        if (filters.facilityId) {
            filteredFacilities = filteredFacilities.filter(f => String(f.resource_id) === String(filters.facilityId));
        }
        if (filters.resourceType) {
            filteredFacilities = filteredFacilities.filter(f => f.resource_type === filters.resourceType);
        }

        // Sort: highest utilisation first
        filteredFacilities.sort((a, b) => b.utilisation_pct - a.utilisation_pct);

        detailedLabReportData = filteredFacilities;

        // 6. Compute Campus Executive Summary KPIs for CSV export
        let totalCampusBooked = 0;
        let totalCampusAvail = 0;
        let totalCampusHeadcount = 0;

        facilities.forEach(f => {
            totalCampusBooked += f.booked_hours;
            totalCampusAvail += f.available_hours;
            totalCampusHeadcount += f.headcount_served;
        });

        const campusUtilPct = totalCampusAvail > 0
            ? ((totalCampusBooked / totalCampusAvail) * 100).toFixed(1)
            : '0.0';

        const highestFacility = [...facilities].sort((a, b) => b.utilisation_pct - a.utilisation_pct)[0];
        const lowestLab = [...facilities]
            .filter(f => f.resource_type === 'Lab')
            .sort((a, b) => a.utilisation_pct - b.utilisation_pct)[0];

        executiveSummaryData = {
            reportingDays: numDays,
            dateRange: `${filters.dateFrom || 'All Time'} to ${filters.dateTo || 'Current Date'}`,
            totalFacilities: facilities.length,
            totalLabs: facilities.filter(f => f.resource_type === 'Lab').length,
            totalClassrooms: facilities.filter(f => f.resource_type === 'Classroom').length,
            campusUtilPct: campusUtilPct,
            totalBookedHours: totalCampusBooked.toFixed(1),
            totalAvailableHours: totalCampusAvail.toFixed(1),
            totalIdleHours: Math.max(0, totalCampusAvail - totalCampusBooked).toFixed(1),
            totalHeadcount: totalCampusHeadcount,
            highestFacility: highestFacility ? `${highestFacility.room_code} (${highestFacility.utilisation_pct.toFixed(1)}%)` : '—',
            lowestLab: lowestLab ? `${lowestLab.room_code} (${lowestLab.utilisation_pct.toFixed(1)}%)` : '—',
        };

        tbody.innerHTML = '';

        if (filteredFacilities.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="t3-empty">No facilities match the selected filters.</td></tr>';
            return;
        }

        filteredFacilities.forEach(f => {
            const tr = document.createElement('tr');
            const machineBadge = f.has_machines
                ? `<span class="t3-specs-tag" style="background:#e0f2fe;color:#0369a1;">💻 ${f.capacity} PCs</span>`
                : `<span class="t3-specs-tag" style="background:#f1f5f9;color:#64748b;">No PCs</span>`;

            tr.innerHTML = `
                <td>
                    <div style="font-weight:700;font-size:14px;color:#0f172a;">${f.room_code}</div>
                    <div style="font-size:12px;color:#64748b;">${f.facility_name}</div>
                </td>
                <td>
                    <strong>${f.resource_type}</strong>
                    <div style="font-size:11px;color:#64748b;">Block ${f.block}</div>
                </td>
                <td>
                    <div><strong>${f.capacity}</strong> Seats</div>
                    <div style="margin-top:3px;">${machineBadge}</div>
                </td>
                <td>
                    <div style="font-weight:700;color:#0f172a;">${f.booked_hours.toFixed(1)} hrs</div>
                    <div class="t3-progress-cell" style="margin-top:4px;">
                        <div class="t3-progress-track">
                            <div class="t3-progress-fill ${f.fill_class}" style="width:${Math.max(4, Math.min(100, f.utilisation_pct))}%;"></div>
                        </div>
                    </div>
                </td>
                <td>
                    <div style="font-size:12px;color:#334155;">Avail: <strong>${f.available_hours.toFixed(1)}h</strong></div>
                    <div style="font-size:12px;color:#dc2626;font-weight:600;">Idle: ${f.idle_hours.toFixed(1)}h</div>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error('[T3 Reports] Report 2 error:', e);
        tbody.innerHTML = `<tr><td colspan="5"><div class="t3-error">Error loading lab utilisation: ${e.message}</div></td></tr>`;
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
                users ( name )
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
                <td><strong>${r.users?.name ?? '—'}</strong></td>
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
        let q = supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true });
        q = applyBookingFilters(q, filters);
        if (filters.facilityId) q = q.eq('resource_id', filters.facilityId);
        const { count: totalBookings } = await q;

        let qa = supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'APPROVED');
        if (filters.dateFrom) qa = qa.gte('start_at', filters.dateFrom);
        if (filters.dateTo)   qa = qa.lte('start_at', filters.dateTo + 'T23:59:59');
        if (filters.facilityId) qa = qa.eq('resource_id', filters.facilityId);
        const { count: approved } = await qa;

        let qd = supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .in('status', ['DENIED', 'CANCELLED']);
        if (filters.dateFrom) qd = qd.gte('start_at', filters.dateFrom);
        if (filters.dateTo)   qd = qd.lte('start_at', filters.dateTo + 'T23:59:59');
        if (filters.facilityId) qd = qd.eq('resource_id', filters.facilityId);
        const { count: denied } = await qd;

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

// ── INSIGHTFUL EXECUTIVE CSV EXPORT ───────────────────────────
function exportInsightfulLabCSV() {
    if (!detailedLabReportData || detailedLabReportData.length === 0) {
        alert('No lab utilisation data available to export.');
        return;
    }

    const s = executiveSummaryData;
    const now = new Date().toLocaleString('en-IN');

    // 1. Executive Summary Comments Header
    const headerLines = [
        `# ==============================================================================`,
        `# CAMPUS RESOURCE MANAGEMENT — LAB & FACILITY UTILISATION AUDIT REPORT`,
        `# ==============================================================================`,
        `# Reporting Period                  : ${s.dateRange || 'All Time'}`,
        `# Total Evaluated Days              : ${s.reportingDays || 0} days`,
        `# Campus Facilities Tracked         : ${s.totalFacilities || 0} (${s.totalLabs || 0} Labs, ${s.totalClassrooms || 0} Classrooms)`,
        `# Campus Average Utilisation Rate   : ${s.campusUtilPct || '0.0'}%`,
        `# Total Booked Operational Hours    : ${s.totalBookedHours || '0.0'} hrs`,
        `# Total Campus Capacity Available   : ${s.totalAvailableHours || '0.0'} hrs`,
        `# Total Idle / Unbooked Capacity    : ${s.totalIdleHours || '0.0'} hrs`,
        `# Total Students / Headcount Served : ${s.totalHeadcount || 0}`,
        `# Peak Demand Contended Facility    : ${s.highestFacility || '—'}`,
        `# Facility Recommended for Rebalance: ${s.lowestLab || '—'}`,
        `# Audit Generated At                : ${now}`,
        `# Generated By                      : Administrator (Role: Admin)`,
        `# ==============================================================================`,
        `` // Blank separator line before tabular data
    ];

    // 2. Structured Tabular Columns
    const columns = [
        "Room Code",
        "Facility Name",
        "Resource Type",
        "Block",
        "Seating Capacity",
        "Has Computers",
        "Workstation Count",
        "OS / Platform",
        "Booked Hours",
        "Available Hours",
        "Idle Hours",
        "Utilisation Rate (%)",
        "Approved Bookings Count",
        "Academic Hours",
        "Maintenance Hours",
        "Exam / Event Hours",
        "Total Headcount Accommodated",
        "Capacity Health Status",
        "Administrative Action / Recommendation"
    ];

    const dataRows = detailedLabReportData.map(f => {
        let recommendation = "Operating at healthy optimal capacity.";
        if (f.booked_hours === 0) {
            recommendation = "100% idle. Available for surplus lab practicals or scheduled maintenance.";
        } else if (f.utilisation_pct >= 65.0) {
            recommendation = "High contention detected. Consider shifting parallel practical batches or adding slots.";
        } else if (f.utilisation_pct < 25.0) {
            recommendation = "Underutilised. Shift load from contended labs to balance facility wear.";
        }

        return [
            f.room_code,
            `"${(f.facility_name || '').replace(/"/g, '""')}"`,
            f.resource_type,
            f.block,
            f.capacity,
            f.has_machines ? "YES" : "NO",
            f.machine_count,
            `"${f.os_installed}"`,
            f.booked_hours.toFixed(1),
            f.available_hours.toFixed(1),
            f.idle_hours.toFixed(1),
            `${f.utilisation_pct.toFixed(1)}%`,
            f.approved_bookings_count,
            f.academic_hours.toFixed(1),
            f.maintenance_hours.toFixed(1),
            f.exam_hours.toFixed(1),
            f.headcount_served,
            `"${f.status_label}"`,
            `"${recommendation}"`
        ].join(',');
    });

    const fullCsv = [...headerLines, columns.join(','), ...dataRows].join('\n');
    downloadCSVBlob(fullCsv, `executive_lab_utilisation_report_${new Date().toISOString().slice(0, 10)}.csv`);
}

// ── Report 4: Resource Maintenance & Unavailable Time Slots ──
let maintenanceReportData = [];

function expandMaintenanceSlots(record) {
    const start = new Date(record.start_at);
    const end   = new Date(record.end_at);
    const slots = [];

    let cur = new Date(start);
    while (cur < end) {
        let next = new Date(cur);
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
        const startTimeStr = `${sH}:${sM}`;
        const endTimeStr   = `${eH}:${eM}`;
        slots.push({
            maintId: record.id,
            startTimeStr,
            endTimeStr,
            slotStr: `${startTimeStr}-${endTimeStr}`
        });
    }

    return slots;
}

async function loadMaintenanceReport() {
    const tbody = document.getElementById('t3-maint-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9"><span class="t3-stat-loading" style="display:block;margin:12px auto;"></span></td></tr>';

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
            tbody.innerHTML = '<tr><td colspan="9" class="t3-empty" style="text-align:center;padding:24px;color:#6b7280;">No maintenance periods or unavailable time slots match the selected filters.</td></tr>';
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
export function loadAllReports() {
    const filters = getFilters();
    loadSummaryStats(filters);
    loadReport1(filters);
    loadReport2(filters);
    loadReport3(filters);
    loadMaintenanceReport();
}

// ── Boot & Event Listeners ───────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Apply filter button
    document.getElementById('t3-filter-apply')
        ?.addEventListener('click', loadAllReports);

    // Reset filters
    document.getElementById('t3-filter-reset')
        ?.addEventListener('click', () => {
            ['t3-filter-from','t3-filter-to','t3-filter-facility','t3-filter-type','t3-filter-status']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
            loadAllReports();
        });

    // CSV Export buttons
    document.getElementById('t3-export-r1')
        ?.addEventListener('click', () => exportStandardCSV(report1Data, 'booking_count_report.csv'));
    document.getElementById('t3-export-r2')
        ?.addEventListener('click', exportInsightfulLabCSV);
    document.getElementById('t3-export-r3')
        ?.addEventListener('click', () => exportStandardCSV(report3Data, 'audit_activity_report.csv'));
    document.getElementById('t3-export-maint')
        ?.addEventListener('click', () => exportStandardCSV(maintenanceReportData, 'maintenance_report_' + new Date().toISOString().slice(0, 10) + '.csv'));

    // Expose helpers globally
    window.loadAllReports = loadAllReports;
    window.loadMaintenanceReport = loadMaintenanceReport;

    // Init maintenance management form and resources
    await initMaintenanceResources();
    initMaintenanceForm();

    // Initial load
    ensureResourcesLoaded().then(() => {
        loadAllReports();
    });
});
