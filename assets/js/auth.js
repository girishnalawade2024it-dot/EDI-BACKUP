// ============================================================
// Authentication & Session Management
// SRS FR-1.1 – FR-1.6
// ============================================================

import { supabase }   from './supabase-client.js';
import { CONFIG }     from './config.js';

// ── Session helpers ──────────────────────────────────────────
export function getSession() {
    try {
        return JSON.parse(localStorage.getItem(CONFIG.SESSION_KEY));
    } catch { return null; }
}

export function setSession(data) {
    localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(data));
}

export function clearSession() {
    localStorage.removeItem(CONFIG.SESSION_KEY);
}

// ── Role → default dashboard path (from root) ────────────────
const ROLE_DASHBOARDS = {
    'Faculty':       'faculty/dashboard.html',
    'Lab Assistant': 'assistant/dashboard.html',
    'Admin':         'admin/dashboard.html',
};

function loginRedirectBase() {
    // If we're inside a subfolder, go up one level
    const parts = window.location.pathname.split('/').filter(Boolean);
    const sub = ['admin', 'faculty', 'assistant'].find(s => parts.includes(s));
    return sub ? '../' : '';
}

export function redirectToDashboard(role) {
    const base = loginRedirectBase();
    window.location.replace(base + (ROLE_DASHBOARDS[role] || 'login.html'));
}

// ── Auth guard — call at the top of every protected page ─────
// allowedRoles: e.g. ['Admin'] or ['Faculty','Lab Assistant']
// Returns session if authorised, otherwise redirects and returns null.
export function requireAuth(...allowedRoles) {
    const session = getSession();
    const base    = loginRedirectBase();

    if (!session) {
        window.location.replace(base + 'login.html');
        return null;
    }
    if (allowedRoles.length && !allowedRoles.includes(session.role)) {
        redirectToDashboard(session.role);
        return null;
    }
    return session;
}

// ── Populate topbar user name ────────────────────────────────
export function populateTopbar() {
    const session = getSession();
    if (!session) return;
    const el = document.querySelector('.topbar > div:last-child, #topbar-user');
    if (el) el.textContent = `${session.name} (${session.role})`;
}

// ── Login ───────────────────────────────────────────────────
// NOTE: This implementation checks the email against the users table.
// Password check is intentionally skipped for the demo (seed data has
// placeholder hashes). Add bcrypt comparison here when production auth is needed.
export async function login(email /*, password */) {
    if (!email || !email.trim()) {
        return { success: false, message: 'Please enter your email address.' };
    }

    const { data, error } = await supabase
        .from('users')
        .select('user_id, name, email, role_id, roles ( role_name, can_override )')
        .eq('email', email.trim().toLowerCase())
        .single();

    if (error || !data) {
        return { success: false, message: 'Email address not found in the system.' };
    }

    const session = {
        userId:       data.user_id,
        email:        data.email,
        name:         data.name,
        role:         data.roles.role_name,
        role_id:      data.role_id,
        can_override: data.roles.can_override,
    };

    setSession(session);

    // Update last_login_at (best-effort, ignore errors)
    supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('user_id', data.user_id)
        .then(() => {});

    return { success: true, session };
}

// ── Logout ──────────────────────────────────────────────────
export function logout() {
    clearSession();
    const base = loginRedirectBase();
    window.location.replace(base + 'login.html');
}

// ── Wire logout buttons automatically ───────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a[href*="login.html"]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            logout();
        });
    });

    populateTopbar();
});
