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
    { user_id: 6, name: 'Rahul Verma', email: 'rahul.verma@college.edu', role: 'Lab Assistant', role_id: 2, can_override: false },
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

// // Valid passwords for authorized accounts
// Accepts production password, standard casing, and easy demo variations
const VALID_PASSWORDS = {
    'admin@college.edu':           ['Admin@123', 'admin@123', 'admin123', 'admin', 'Admin', 'password'],
    'anjali.deshmukh@college.edu': ['Faculty@123', 'faculty@123', 'faculty123', 'faculty', 'Faculty', 'anjali', 'password'],
    'rahul.kulkarni@college.edu':  ['Faculty@123', 'faculty@123', 'faculty123', 'faculty', 'Faculty', 'rahul', 'password'],
    'amit.patil@college.edu':      ['Assistant@123', 'assistant@123', 'assistant123', 'assistant', 'Assistant', 'amit', 'password'],
    'sneha.joshi@college.edu':     ['Assistant@123', 'assistant@123', 'assistant123', 'assistant', 'Assistant', 'sneha', 'password'],
    'rahul.verma@college.edu':     ['Assistant@123', 'assistant@123', 'assistant123', 'assistant', 'Assistant', 'rahul', 'password'],
};

function isValidPassword(email, password) {
    if (!password || password.trim().length === 0) return false;
    const allowed = VALID_PASSWORDS[email.toLowerCase()];
    if (!allowed) return false;
    return allowed.includes(password) || allowed.includes(password.trim());
}

// ── Login ───────────────────────────────────────────────────
// Authenticates credentials using password verification and Supabase user profiles.
export async function login(email, password) {
    if (!email || !email.trim()) {
        return { success: false, message: 'Please enter your email address.' };
    }
    if (!password) {
        return { success: false, message: 'Please enter your password.' };
    }

    const normEmail = email.trim().toLowerCase();

    // Verify password against authorized credentials
    if (!isValidPassword(normEmail, password)) {
        return { success: false, message: 'Invalid email or password.' };
    }

    // 1. Try real Supabase lookup if configured
    if (isConfigured) {
        try {
            // Attempt GoTrue signIn if available (non-blocking)
            if (supabase.auth) {
                try {
                    await supabase.auth.signInWithPassword({ email: normEmail, password });
                } catch { /* ignore */ }
            }

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

    // 2. Fallback to seed test users (offline mode)
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

    return { success: false, message: 'Invalid email or password.' };
}

// ── Google OAuth Sign-In ────────────────────────────────────
export async function signInWithGoogle() {
    if (!isConfigured || !supabase.auth) {
        return { success: false, message: 'Supabase client is not configured for OAuth.' };
    }

    try {
        const redirectUrl = window.location.origin + window.location.pathname;
        console.log('[Auth] Initiating OAuth with redirectTo:', redirectUrl);
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectUrl,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'select_account',
                }
            }
        });

        console.log('[Auth] signInWithOAuth response:', { data, error });

        if (error) {
            return { success: false, message: error.message };
        }

        if (data?.url) {
            window.location.assign(data.url);
            console.log('[Auth] Redirecting to Google URL:', data.url);
            window.location.href = data.url;
        }

        return { success: true, data };
    } catch (err) {
        console.error('[Auth] Google OAuth error:', err);
        return { success: false, message: 'Failed to initiate Google sign-in: ' + (err.message || err) };
    }
}

// ── Handle OAuth Callback on Page Load ──────────────────────
export async function handleOAuthCallback() {
    if (!isConfigured || !supabase.auth) return null;

    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const hash = window.location.hash;
    const errorDesc = url.searchParams.get('error_description') || url.searchParams.get('error');

    if (errorDesc) {
        console.error('[Auth] OAuth redirect error:', errorDesc);
        return { success: false, message: errorDesc };
    }

    const hasOAuthParams = Boolean(code || (hash && (hash.includes('access_token') || hash.includes('error'))));
    if (!hasOAuthParams) {
        return null;
    }

    try {
        let authSession = null;

        // 1. If PKCE code is present in URL, exchange it explicitly
        if (code && typeof supabase.auth.exchangeCodeForSession === 'function') {
            console.log('[Auth] Exchanging PKCE code for Supabase session...');
            const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (!exchangeError && exchangeData?.session) {
                authSession = exchangeData.session;
            } else if (exchangeError) {
                console.warn('[Auth] exchangeCodeForSession failed, falling back to getSession:', exchangeError.message);
            }
        }

        // 2. If not obtained yet, query getSession()
        if (!authSession) {
            const { data, error } = await supabase.auth.getSession();
            if (!error && data?.session?.user) {
                authSession = data.session;
            }
        }

        // 3. If still not available and we had OAuth params, wait briefly for authStateChange
        if (!authSession && hasOAuthParams) {
            authSession = await new Promise(resolve => {
                const timeout = setTimeout(() => resolve(null), 2000);
                const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
                    if (session?.user) {
                        clearTimeout(timeout);
                        if (authListener?.subscription) authListener.subscription.unsubscribe();
                        resolve(session);
                    }
                });
            });
        }

        if (!authSession?.user) {
            return null;
        }

        // Clean up URL so refresh doesn't re-trigger code exchange
        window.history.replaceState({}, document.title, window.location.pathname);

        const authUser = authSession.user;
        const email = authUser.email?.trim().toLowerCase();
        if (!email) return null;

        const displayName = authUser.user_metadata?.full_name ||
                            authUser.user_metadata?.name ||
                            email.split('@')[0];

        console.log('[Auth] Google OAuth user verified:', email);

        // 4. Check if user already exists in public.users
        try {
            const { data: existingUser } = await supabase
                .from('users')
                .select('user_id, name, email, role_id, roles ( role_name, can_override )')
                .eq('email', email)
                .maybeSingle();

            if (existingUser) {
                const session = {
                    userId:       existingUser.user_id,
                    authId:       authUser.id,
                    email:        existingUser.email,
                    name:         existingUser.name || displayName,
                    role:         existingUser.roles?.role_name || 'Faculty',
                    role_id:      existingUser.role_id,
                    can_override: existingUser.roles?.can_override || false,
                    avatarUrl:    authUser.user_metadata?.avatar_url || null,
                    provider:     'google',
                };

                setSession(session);

                supabase
                    .from('users')
                    .update({ last_login_at: nowLocalISO() })
                    .eq('user_id', existingUser.user_id)
                    .then(() => {});

                return { success: true, session };
            }

            // 5. New Google user: Auto-provision in public.users with Faculty role
            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert({
                    name:          displayName,
                    email:         email,
                    role_id:       1, // Default to Faculty
                    password_hash: 'oauth_google',
                    last_login_at: nowLocalISO(),
                })
                .select('user_id, name, email, role_id, roles ( role_name, can_override )')
                .maybeSingle();

            if (!insertError && newUser) {
                const session = {
                    userId:       newUser.user_id,
                    authId:       authUser.id,
                    email:        email,
                    name:         displayName,
                    role:         newUser.roles?.role_name || 'Faculty',
                    role_id:      newUser.role_id || 1,
                    can_override: false,
                    avatarUrl:    authUser.user_metadata?.avatar_url || null,
                    provider:     'google',
                };

                setSession(session);
                return { success: true, session };
            }
            if (insertError) {
                console.warn('[Auth] Could not insert into public.users, using resilient session:', insertError);
            }
        } catch (dbErr) {
            console.warn('[Auth] Database error during user provisioning:', dbErr);
        }

        // 6. Resilient session fallback if database insert was blocked
        const fallbackSession = {
            userId:       Date.now() % 100000,
            authId:       authUser.id,
            email:        email,
            name:         displayName,
            role:         'Faculty',
            role_id:      1,
            can_override: false,
            avatarUrl:    authUser.user_metadata?.avatar_url || null,
            provider:     'google',
        };
        setSession(fallbackSession);
        return { success: true, session: fallbackSession };
    } catch (e) {
        console.warn('[Auth] handleOAuthCallback error:', e);
        return null;
    }
}

// ── Interactive Google Account Login ────────────────────────
export async function loginWithGoogleAccount({ name, email, role = 'Faculty' }) {
    if (!email) return { success: false, message: 'Google email is required.' };
    const normEmail = email.trim().toLowerCase();

    // 1. Try real Supabase lookup if configured
    if (isConfigured) {
        try {
            const { data: existingUser } = await supabase
                .from('users')
                .select('user_id, name, email, role_id, roles ( role_name, can_override )')
                .eq('email', normEmail)
                .single();

            if (existingUser) {
                const session = {
                    userId:       existingUser.user_id,
                    email:        existingUser.email,
                    name:         existingUser.name,
                    role:         existingUser.roles?.role_name || role,
                    role_id:      existingUser.role_id,
                    can_override: existingUser.roles?.can_override || (role === 'Admin'),
                    provider:     'google',
                };
                setSession(session);
                supabase.from('users').update({ last_login_at: nowLocalISO() }).eq('user_id', existingUser.user_id).then(() => {});
                return { success: true, session };
            }

            // If not found in database, insert new user with Faculty role
            const { data: newUser } = await supabase
                .from('users')
                .insert({
                    name: name,
                    email: normEmail,
                    role_id: role === 'Admin' ? 3 : 1,
                    password_hash: 'oauth_google',
                    last_login_at: nowLocalISO(),
                })
                .select('user_id, name, email, role_id, roles ( role_name, can_override )')
                .single();

            const session = {
                userId:       newUser?.user_id || 99,
                email:        normEmail,
                name:         name,
                role:         newUser?.roles?.role_name || role,
                role_id:      role === 'Admin' ? 3 : 1,
                can_override: role === 'Admin',
                provider:     'google',
            };
            setSession(session);
            return { success: true, session };
        } catch (e) {
            console.warn('[Auth] Google sign in database sync error:', e);
        }
    }

    // 2. Offline / Local fallback
    const session = {
        userId:       Date.now(),
        email:        normEmail,
        name:         name,
        role:         role,
        role_id:      role === 'Admin' ? 3 : 1,
        can_override: role === 'Admin',
        provider:     'google',
    };
    setSession(session);
    return { success: true, session };
}

// ── Logout ──────────────────────────────────────────────────
export async function logout() {
    clearSession();
    try {
        if (isConfigured && supabase?.auth) {
            await supabase.auth.signOut();
        }
    } catch (e) {
        console.warn('Sign out error:', e);
    }
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
