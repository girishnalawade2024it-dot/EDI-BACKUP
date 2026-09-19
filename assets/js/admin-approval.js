// ============================================================
// Admin Approval Queue + Approval Actions
// SRS FR-5.2, FR-5.3, FR-5.4
// ============================================================

import { supabase }                               from './supabase-client.js';
import { requireAuth }                             from './auth.js';
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
        container.innerHTML = '<div class="t3-empty" style="padding:24px;text-align:center;color:#9ca3af;">✅ No pending requests</div>';
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
        const msg = document.getElementById(`appr-msg-${id}`);
        msg.style.display = 'block';
        msg.textContent   = 'Processing…';
        const res = await approveBooking(id, session.userId, 'Approved by admin');
        if (res.success) {
            document.getElementById(`appr-${id}`)?.remove();
            if (countEl) {
                const c = parseInt(countEl.textContent) - 1;
                countEl.textContent = `${c} pending`;
            }
        } else {
            msg.textContent = '❌ ' + res.message;
            msg.style.color = '#dc2626';
        }
    };

    window.handleDeny = async (id) => {
        const reason = document.getElementById(`deny-reason-${id}`)?.value;
        const msg    = document.getElementById(`appr-msg-${id}`);
        msg.style.display = 'block';
        msg.textContent   = 'Processing…';
        const res = await denyBooking(id, session.userId, reason, '');
        if (res.success) {
            document.getElementById(`appr-${id}`)?.remove();
            if (countEl) {
                const c = parseInt(countEl.textContent) - 1;
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

document.addEventListener('DOMContentLoaded', () => {
    loadApprovalQueue();
});
