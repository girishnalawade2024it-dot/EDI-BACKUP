// ============================================================
// Admin Approval Queue + Approval Actions
// SRS FR-5.2, FR-5.3, FR-5.4
// ============================================================

import { supabase }                               from './supabase-client.js';
import { requireAuth, getSession }                  from './auth.js';
import { approveBooking, denyBooking, preemptBooking } from './booking-engine.js';
import { CONFIG, fmtDateTime }                     from './config.js';

const session = requireAuth('Admin');

export async function loadApprovalQueue(containerId = 't3-approval-list', countId = 't3-pending-count') {
    const container = document.getElementById(containerId);
    const countEl   = document.getElementById(countId);
    if (!container) return;

    container.innerHTML = '<span class="t3-stat-loading" style="display:block;margin:16px auto;"></span>';

    const { data, error } = await supabase
        .from('bookings')
        .select(`
            booking_id, booking_type, start_at, end_at, purpose, headcount, status, created_at,
            resources ( room_code, resource_type, block ),
            users!bookings_requested_by_fkey ( name, email )
        `)
        .eq('status', CONFIG.STATUS.PENDING)
        .order('created_at', { ascending: true });

    if (error) {
        container.innerHTML = `<div class="t3-error">Error loading queue: ${error.message}</div>`;
        return;
    }

    const rows = data || [];
    if (countEl) countEl.textContent = `${rows.length} pending`;

    if (rows.length === 0) {
        container.innerHTML = '<div class="t3-empty" style="padding:18px;text-align:center;color:#6b7280;font-size:13px;">✅ <strong>No pending bookings:</strong> Available slots are booked and allocated automatically. Only contention concerns and disputes require Admin review.</div>';
        return;
    }

    container.innerHTML = rows.map(bk => `
        <div class="approval-item" id="appr-${bk.booking_id}" style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px;background:#fff;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
                <div>
                    <strong>#${bk.booking_id}</strong> &nbsp;
                    <span class="t3-badge t3-badge-pending">PENDING</span> &nbsp;
                    <span style="font-size:12px;color:#6b7280;">${bk.booking_type}</span>
                </div>
                <span style="font-size:11px;color:#9ca3af;">Submitted: ${fmtDateTime(bk.created_at)}</span>
            </div>
            <div style="margin:10px 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;font-size:13px;">
                <div><strong>By:</strong> ${bk.users?.name ?? '—'}</div>
                <div><strong>Resource:</strong> ${bk.resources?.room_code ?? '—'} (${bk.resources?.resource_type ?? ''})</div>
                <div><strong>Date:</strong> ${bk.start_at?.slice(0,10) ?? '—'}</div>
                <div><strong>Time:</strong> ${bk.start_at ? new Date(bk.start_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '—'} – ${bk.end_at ? new Date(bk.end_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '—'}</div>
                <div><strong>Purpose:</strong> ${bk.purpose ?? '—'}</div>
                ${bk.headcount ? `<div><strong>Headcount:</strong> ${bk.headcount}</div>` : ''}
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;">
                <button class="btn" style="padding:8px 16px;font-size:13px;" onclick="handleApprove(${bk.booking_id})">✓ Approve</button>
                <select id="deny-reason-${bk.booking_id}" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:13px;">
                    ${CONFIG.DENIAL_REASONS.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
                </select>
                <button class="btn btn-secondary" style="padding:8px 16px;font-size:13px;background:#fee2e2;color:#991b1b;" onclick="handleDeny(${bk.booking_id})">✗ Deny</button>
                ${bk.status === CONFIG.STATUS.APPROVED ? `<button class="btn btn-secondary" style="font-size:13px;" onclick="handlePreempt(${bk.booking_id})">⚡ Preempt</button>` : ''}
            </div>
            <div id="appr-msg-${bk.booking_id}" style="display:none;margin-top:8px;font-size:13px;"></div>
        </div>
    `).join('');

    // Expose handlers globally for inline onclick
    window.handleApprove = async (id) => {
        const adminId = getSession()?.userId || 5;
        const msg = document.getElementById(`appr-msg-${id}`);
        msg.style.display = 'block';
        msg.textContent   = 'Processing…';
        const res = await approveBooking(id, adminId, 'Approved by admin');
        if (res.success) {
            document.getElementById(`appr-${id}`)?.remove();
            if (countEl) {
                const c = Math.max(0, (parseInt(countEl.textContent) || 1) - 1);
                countEl.textContent = `${c} pending`;
            }
        } else {
            msg.textContent = '❌ ' + res.message;
            msg.style.color = '#dc2626';
        }
    };

    window.handleDeny = async (id) => {
        const adminId = getSession()?.userId || 5;
        const reason = document.getElementById(`deny-reason-${id}`)?.value;
        const msg    = document.getElementById(`appr-msg-${id}`);
        msg.style.display = 'block';
        msg.textContent   = 'Processing…';
        const res = await denyBooking(id, adminId, reason, '');
        if (res.success) {
            document.getElementById(`appr-${id}`)?.remove();
            if (countEl) {
                const c = Math.max(0, (parseInt(countEl.textContent) || 1) - 1);
                countEl.textContent = `${c} pending`;
            }
        } else {
            msg.textContent = '❌ ' + res.message;
            msg.style.color = '#dc2626';
        }
    };

    window.handlePreempt = async (id) => {
        const reason = prompt('Enter reason for preemption:');
        if (!reason) return;
        const res = await preemptBooking(id, session.userId, reason);
        if (res.success) {
            loadApprovalQueue(containerId, countId);
        } else {
            alert('Preemption failed: ' + res.message);
        }
    };
}

export async function loadAdminConcerns(containerId = 't3-concerns-list') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<span class="t3-stat-loading" style="display:block;margin:16px auto;"></span>';

    try {
        const { data, error } = await supabase
            .from('concerns')
            .select(`
                concern_id, user_id, resource_id, requested_date, requested_start_time, requested_end_time,
                concern_type, description, status, created_at,
                resources ( room_code, resource_type ),
                users!concerns_user_id_fkey ( name, email )
            `)
            .in('status', ['OPEN', 'UNDER_REVIEW'])
            .order('created_at', { ascending: false });

        if (error) {
            container.innerHTML = `<div class="t3-error">Error loading concerns: ${error.message}</div>`;
            return;
        }

        const list = data || [];
        if (list.length === 0) {
            container.innerHTML = `
                <div class="t3-empty" style="padding:24px;text-align:center;color:#6b7280;background:#f0fdf4;border-radius:8px;">
                    <span style="font-size:20px;">🛡️</span> <strong>All clear:</strong> No active slot contentions or concerns.<br>
                    <span style="font-size:12px;color:#16a34a;">Empty slots are booked automatically. Only disputes/concerns appear here for Admin decision.</span>
                </div>
            `;
            return;
        }

        container.innerHTML = list.map(c => `
            <div style="border:1px solid #fecaca;border-left:4px solid #ef4444;border-radius:10px;padding:14px;margin-bottom:12px;background:#fff5f5;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div>
                        <strong style="color:#b91c1c;">CON-${c.concern_id.toString().padStart(6, '0')}</strong> &nbsp;
                        <span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:600;">${c.concern_type}</span>
                    </div>
                    <span style="font-size:12px;color:#6b7280;">Raised: ${fmtDateTime(c.created_at)}</span>
                </div>
                <div style="margin:8px 0;font-size:13px;color:#374151;">
                    <div><strong>Faculty:</strong> ${c.users?.name || 'Faculty Member'} (${c.users?.email || ''})</div>
                    <div><strong>Resource:</strong> ${c.resources?.room_code || 'Resource #' + c.resource_id} &nbsp;|&nbsp; <strong>Date:</strong> ${c.requested_date} (${c.requested_start_time?.slice(0,5)} – ${c.requested_end_time?.slice(0,5)})</div>
                    <div style="margin-top:6px;background:#fff;padding:8px 12px;border:1px solid #fed7aa;border-radius:6px;font-style:italic;">
                        "${c.description}"
                    </div>
                </div>
                <div style="margin-top:10px;display:flex;justify-content:flex-end;">
                    <a href="concerns.html?concern_id=${c.concern_id}" class="btn" style="background:#dc2626;color:#fff;font-size:13px;padding:6px 14px;text-decoration:none;border-radius:6px;">
                        ⚖️ Review & Resolve Dispute →
                    </a>
                </div>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = `<div class="t3-error">Exception loading concerns: ${err.message}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadApprovalQueue();
    loadAdminConcerns();
});
