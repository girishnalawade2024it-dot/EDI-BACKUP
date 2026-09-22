// ============================================================
// Authentication & Session Management
// SRS FR-1.1 – FR-1.6
// ============================================================

// Removed supabase import
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

import { apiClient } from './api-client.js';

export async function login(email, password) {
    if (!email || !email.trim()) {
        return { success: false, message: 'Please enter your email address.' };
    }
    if (!password) {
        return { success: false, message: 'Please enter your password.' };
    }

    const { data, error } = await apiClient.post('/auth/login/', { email, password });
    
    if (error) {
        return { success: false, message: error.message || 'Login failed.' };
    }
    
    if (data && data.access && data.user) {
        localStorage.setItem('access_token', data.access);
        localStorage.setItem('refresh_token', data.refresh);
        setSession(data.user);
        return { success: true, session: data.user };
    }
    
    return { success: false, message: 'Invalid response from server.' };
}

export function logout() {
    clearSession();
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    const base = loginRedirectBase();
    window.location.replace(base + 'login.html');
}

// ── Wire logout buttons automatically ───────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a[href*="login.html"]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            if (confirm("Are you sure you want to log out?")) {
                logout();
            }
        });
    });

    populateTopbar();
});
