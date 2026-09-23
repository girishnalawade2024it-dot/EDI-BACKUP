// ============================================================
// Authentication & Session Management
// SRS FR-1.1 – FR-1.6
// ============================================================

import { supabase, isConfigured } from './supabase-client.js';
import { CONFIG, nowLocalISO }        from './config.js';

const SEED_USERS = [
    { user_id: 1, name: 'Dr. Anjali Deshmukh', email: 'anjali.deshmukh@college.edu', role: 'Faculty', role_id: 1, can_override: false },
    { user_id: 2, name: 'Prof. Rahul Kulkarni', email: 'rahul.kulkarni@college.edu', role: 'Faculty', role_id: 1, can_override: false },
    { user_id: 3, name: 'Amit Patil', email: 'amit.patil@college.edu', role: 'Lab Assistant', role_id: 2, can_override: false },
    { user_id: 4, name: 'Sneha Joshi', email: 'sneha.joshi@college.edu', role: 'Lab Assistant', role_id: 2, can_override: false },
    { user_id: 4, name: 'Rahul Verma', email: 'rahul.verma@college.edu', role: 'Lab Assistant', role_id: 2, can_override: false },
    { user_id: 5, name: 'Admin User', email: 'admin@college.edu', role: 'Admin', role_id: 3, can_override: true },
];

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
export const ROLE_DASHBOARDS = {
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

    const normEmail = email.trim().toLowerCase();

    // 1. Try Python FastAPI Backend API if reachable
    try {
        const apiBase = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
            ? `${window.location.origin}/api`
            : 'http://localhost:8000/api';
        const res = await fetch(`${apiBase}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normEmail })
        });
        if (res.ok) {
            const data = await res.json();
            const session = {
                userId:       data.user_id,
                email:        data.email,
                name:         data.name,
                role:         data.role,
                role_id:      data.role_id,
                can_override: data.can_override,
                sessionId:    data.session_id,
            };
            setSession(session);
            if (data.session_id) {
                localStorage.setItem('edi_token', data.session_id);
            }
            return { success: true, session };
        }
    } catch (e) {
        console.warn('[Auth] Python backend lookup skipped or failed, trying Supabase/LocalDB:', e);
    }

    // 2. Try real Supabase lookup if configured
    if (isConfigured) {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('user_id, name, email, role_id, roles ( role_name, can_override )')
                .eq('email', normEmail)
                .single();

            if (!error && data) {
                const session = {
                    userId:       data.user_id,
                    email:        data.email,
                    name:         data.name,
                    role:         data.roles?.role_name || 'Faculty',
                    role_id:      data.role_id,
                    can_override: data.roles?.can_override || false,
                };

                setSession(session);

                supabase
                    .from('users')
                    .update({ last_login_at: nowLocalISO() })
                    .eq('user_id', data.user_id)
                    .then(() => {});

                return { success: true, session };
            }
        } catch (e) {
            console.warn('[Auth] Supabase lookup error, falling back to seed user:', e);
        }
    }

    // 2. Fallback to seed test users (demo mode or offline)
    const seedUser = SEED_USERS.find(u => u.email.toLowerCase() === normEmail);
    if (seedUser) {
        const session = {
            userId:       seedUser.user_id,
            email:        seedUser.email,
            name:         seedUser.name,
            role:         seedUser.role,
            role_id:      seedUser.role_id,
            can_override: seedUser.can_override,
        };
        setSession(session);
        return { success: true, session };
    }

    return { success: false, message: 'Email address not found in the system. Use one of the demo credentials below.' };
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
