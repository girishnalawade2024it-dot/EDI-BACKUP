// ============================================================
// Team 3 — Notifications System
// Owner: Girish (Team 3)
// Reads from: notifications, (users via booking context)
// Writes:     notifications (is_read, read_at) — mark as read only
// ============================================================

import { supabase } from './supabase-client.js';

// ── Config ──────────────────────────────────────────────────
// This is the seeded admin user_id. Once Team 1 wires real
// auth, replace with: supabase.auth.getUser() → user.id
// mapped against the users table.
const ADMIN_USER_ID = 5;

// ── Helpers ─────────────────────────────────────────────────
function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins  < 1)  return 'Just now';
    if (mins  < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

function getBadgeClass(type) {
    const map = {
        BOOKING_APPROVED: 't3-badge-approved',
        BOOKING_PENDING:  't3-badge-pending',
        BOOKING_DENIED:   't3-badge-denied',
        BOOKING_CANCELLED:'t3-badge-cancelled',
        BOOKING_PREEMPTED:'t3-badge-preempted',
    };
    return map[type] || 't3-badge-default';
}

// ── Render notification items ────────────────────────────────
function renderNotifList(notifications, listEl, badgeEl) {
    listEl.innerHTML = '';

    if (!notifications || notifications.length === 0) {
        listEl.innerHTML = '<div class="t3-notif-empty">No notifications</div>';
        return;
    }

    notifications.forEach(n => {
        const item = document.createElement('div');
        item.className = `t3-notif-item ${!n.is_read ? 't3-notif-unread' : ''}`;
        item.dataset.id = n.notification_id;

        item.innerHTML = `
            <div class="t3-notif-title">${n.title}</div>
            <div class="t3-notif-msg">${n.message}</div>
            <div class="t3-notif-time">${timeAgo(n.created_at)}</div>
        `;

        // Mark as read on click
        item.addEventListener('click', async () => {
            if (!n.is_read) {
                await markRead(n.notification_id, item, badgeEl);
            }
        });

        listEl.appendChild(item);
    });
}

// ── Update badge count ───────────────────────────────────────
function updateBadge(badgeEl, count) {
    if (count > 0) {
        badgeEl.textContent = count > 99 ? '99+' : count;
        badgeEl.classList.remove('t3-hidden');
    } else {
        badgeEl.classList.add('t3-hidden');
    }
}

// ── Mark single notification as read ────────────────────────
async function markRead(notifId, itemEl, badgeEl) {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('notification_id', notifId);

    if (error) {
        console.warn('[T3 Notifications] markRead error:', error.message);
        return;
    }

    itemEl.classList.remove('t3-notif-unread');

    // Decrement badge
    const current = parseInt(badgeEl.textContent, 10) || 0;
    updateBadge(badgeEl, Math.max(0, current - 1));
}

// ── Mark all as read ─────────────────────────────────────────
async function markAllRead(badgeEl, listEl) {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', ADMIN_USER_ID)
        .eq('is_read', false);

    if (error) {
        console.warn('[T3 Notifications] markAllRead error:', error.message);
        return;
    }

    // Update all items visually
    listEl.querySelectorAll('.t3-notif-unread')
          .forEach(el => el.classList.remove('t3-notif-unread'));
    updateBadge(badgeEl, 0);
}

// ── Main initialiser ─────────────────────────────────────────
async function initNotifications() {
    // Find topbar — must exist on the page
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;

    // Build notification bell HTML
    const wrapper = document.createElement('div');
    wrapper.className = 't3-notif-wrapper';
    wrapper.innerHTML = `
        <button class="t3-notif-bell" id="t3-notif-btn" aria-label="Notifications" title="Notifications">
            🔔
            <span class="t3-notif-badge t3-hidden" id="t3-notif-badge"></span>
        </button>
        <div class="t3-notif-panel" id="t3-notif-panel">
            <div class="t3-notif-header">
                <h4>Notifications</h4>
                <button class="t3-notif-mark-all" id="t3-mark-all">Mark all read</button>
            </div>
            <div class="t3-notif-list" id="t3-notif-list">
                <div class="t3-notif-empty">Loading…</div>
            </div>
        </div>
    `;

    // Inject into topbar — wrap existing right-side content
    const existingRight = topbar.lastElementChild;
    const rightWrap = document.createElement('div');
    rightWrap.className = 't3-topbar-right';
    if (existingRight && existingRight !== topbar.firstElementChild) {
        topbar.removeChild(existingRight);
        rightWrap.appendChild(existingRight);
    }
    rightWrap.appendChild(wrapper);
    topbar.appendChild(rightWrap);

    const bellBtn  = document.getElementById('t3-notif-btn');
    const panel    = document.getElementById('t3-notif-panel');
    const badge    = document.getElementById('t3-notif-badge');
    const listEl   = document.getElementById('t3-notif-list');
    const markAllBtn = document.getElementById('t3-mark-all');

    // Toggle panel open/close
    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('t3-open');
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            panel.classList.remove('t3-open');
        }
    });

    // Mark all read
    markAllBtn.addEventListener('click', () => markAllRead(badge, listEl));

    // Fetch notifications
    const { data, error } = await supabase
        .from('notifications')
        .select('notification_id, user_id, booking_id, type, title, message, is_read, read_at, created_at')
        .eq('user_id', ADMIN_USER_ID)
        .order('created_at', { ascending: false })
        .limit(30);

    if (error) {
        console.error('[T3 Notifications] fetch error:', error.message);
        listEl.innerHTML = '<div class="t3-empty">Could not load notifications.</div>';
        return;
    }

    // Unread count
    const unreadCount = (data || []).filter(n => !n.is_read).length;
    updateBadge(badge, unreadCount);
    renderNotifList(data, listEl, badge);
}

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initNotifications);
