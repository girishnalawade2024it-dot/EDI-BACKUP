// ============================================================
// Calendar Widget — Reusable Month-View Calendar
// SRS FR-2.4, FR-2.5
// ============================================================

const DAYS    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS  = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];

/**
 * Renders a month-view calendar into `containerId`.
 *
 * @param {string}   containerId   - DOM id of host element
 * @param {object[]} bookings      - array of { start_at, end_at, status }
 * @param {Function} onDateClick   - called with (dateStr 'YYYY-MM-DD') on cell click
 * @param {number}   initYear
 * @param {number}   initMonth     - 0-indexed (0=Jan)
 */
export function renderCalendar(containerId, bookings = [], onDateClick = null, initYear = null, initMonth = null) {
    const host = document.getElementById(containerId);
    if (!host) return;

    const today = new Date();
    let year  = initYear  ?? today.getFullYear();
    let month = initMonth ?? today.getMonth();

    // Build a quick lookup: dateStr → [statuses]
    function buildLookup(bks) {
        const map = {};
        bks.forEach(b => {
            if (!b.start_at) return;
            const d = b.start_at.slice(0, 10); // YYYY-MM-DD
            if (!map[d]) map[d] = [];
            map[d].push(b.status);
        });
        return map;
    }

    function render() {
        const lookup    = buildLookup(bookings);
        const firstDay  = new Date(year, month, 1).getDay();
        const daysInMon = new Date(year, month + 1, 0).getDate();
        const todayStr  = today.toISOString().slice(0, 10);

        host.innerHTML = `
        <div class="cal-widget">
            <div class="cal-header">
                <button class="cal-nav" id="cal-prev">&#8249;</button>
                <span class="cal-title">${MONTHS[month]} ${year}</span>
                <button class="cal-nav" id="cal-next">&#8250;</button>
                <button class="cal-today-btn" id="cal-today">Today</button>
            </div>
            <div class="cal-grid">
                ${DAYS.map(d => `<div class="cal-day-hdr">${d}</div>`).join('')}
                ${Array.from({ length: firstDay }, () => '<div class="cal-cell cal-empty"></div>').join('')}
                ${Array.from({ length: daysInMon }, (_, i) => {
                    const day = i + 1;
                    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                    const statuses = lookup[dateStr] || [];
                    const isToday  = dateStr === todayStr;
                    const isPast   = dateStr < todayStr;

                    const dots = [...new Set(statuses)].map(s => {
                        const cls = {
                            APPROVED: 'dot-approved', PENDING: 'dot-pending',
                            DENIED: 'dot-denied', CANCELLED: 'dot-cancelled',
                        }[s] || 'dot-default';
                        return `<span class="cal-dot ${cls}" title="${s}"></span>`;
                    }).join('');

                    const classes = [
                        'cal-cell',
                        isToday  ? 'cal-today'    : '',
                        isPast   ? 'cal-past'     : '',
                        statuses.length ? 'cal-has-events' : '',
                    ].filter(Boolean).join(' ');

                    return `<div class="${classes}" data-date="${dateStr}">
                        <span class="cal-day-num">${day}</span>
                        <div class="cal-dots">${dots}</div>
                    </div>`;
                }).join('')}
            </div>
            <div class="cal-legend">
                <span class="cal-dot dot-approved"></span> Approved &nbsp;
                <span class="cal-dot dot-pending"></span> Pending &nbsp;
                <span class="cal-dot dot-denied"></span> Denied
            </div>
        </div>`;

        // Navigation
        host.querySelector('#cal-prev').addEventListener('click', () => {
            month--; if (month < 0) { month = 11; year--; }
            render();
        });
        host.querySelector('#cal-next').addEventListener('click', () => {
            month++; if (month > 11) { month = 0; year++; }
            render();
        });
        host.querySelector('#cal-today').addEventListener('click', () => {
            year  = today.getFullYear();
            month = today.getMonth();
            render();
        });

        // Date click
        if (onDateClick) {
            host.querySelectorAll('.cal-cell:not(.cal-empty):not(.cal-past)').forEach(cell => {
                cell.style.cursor = 'pointer';
                cell.addEventListener('click', () => onDateClick(cell.dataset.date));
            });
        }
    }

    // Inject widget styles (scoped, won't conflict with style.css)
    if (!document.getElementById('cal-widget-styles')) {
        const style = document.createElement('style');
        style.id = 'cal-widget-styles';
        style.textContent = `
        .cal-widget { font-family: inherit; }
        .cal-header {
            display: flex; align-items: center; gap: 12px;
            margin-bottom: 14px; flex-wrap: wrap;
        }
        .cal-title { font-weight: 700; font-size: 16px; flex: 1; text-align:center; }
        .cal-nav {
            background: #f3f4f6; border: none; border-radius: 8px;
            width: 32px; height: 32px; cursor: pointer; font-size: 20px;
            display: flex; align-items: center; justify-content: center;
            transition: background 0.2s;
        }
        .cal-nav:hover { background: #e5e7eb; }
        .cal-today-btn {
            background: #2563eb; color: #fff; border: none;
            border-radius: 8px; padding: 6px 14px; cursor: pointer;
            font-size: 13px; font-weight: 600;
        }
        .cal-grid {
            display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;
        }
        .cal-day-hdr {
            text-align: center; font-size: 11px; font-weight: 700;
            color: #6b7280; padding: 6px 0; text-transform: uppercase;
        }
        .cal-cell {
            min-height: 60px; padding: 6px; border-radius: 10px;
            background: #f8fafc; position: relative;
            transition: background 0.15s;
        }
        .cal-cell:not(.cal-empty):not(.cal-past) { cursor: pointer; }
        .cal-cell:not(.cal-empty):not(.cal-past):hover { background: #dbeafe; }
        .cal-today { background: #2563eb !important; color: #fff; }
        .cal-today .cal-day-num { color: #fff; font-weight: 700; }
        .cal-past { background: #f9fafb; opacity: 0.5; }
        .cal-empty { background: transparent; }
        .cal-day-num { font-size: 13px; font-weight: 600; display: block; }
        .cal-dots { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
        .cal-dot {
            width: 7px; height: 7px; border-radius: 50%; display: inline-block;
        }
        .dot-approved { background: #16a34a; }
        .dot-pending  { background: #d97706; }
        .dot-denied   { background: #dc2626; }
        .dot-cancelled{ background: #9ca3af; }
        .dot-default  { background: #6b7280; }
        .cal-has-events { border: 1px solid #e5e7eb; }
        .cal-legend {
            margin-top: 12px; font-size: 12px; color: #6b7280;
            display: flex; align-items: center; gap: 4px;
        }
        .cal-legend .cal-dot { width: 9px; height: 9px; }
        `;
        document.head.appendChild(style);
    }

    render();
}

/**
 * Update the bookings dataset and re-render.
 */
export function updateCalendarBookings(containerId, newBookings, onDateClick) {
    const host = document.getElementById(containerId);
    if (!host) return;
    // Re-render with new data — extract current year/month from title
    const title = host.querySelector('.cal-title')?.textContent || '';
    const parts = title.split(' ');
    const month = MONTHS.indexOf(parts[0]);
    const year  = parseInt(parts[1], 10);
    renderCalendar(containerId, newBookings, onDateClick,
        isNaN(year) ? null : year,
        month === -1  ? null : month
    );
}
