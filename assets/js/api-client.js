// ============================================================
// Python FastAPI Backend API Client
// Connects the frontend directly to the Python backend REST API
// ============================================================

export const API_BASE = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
    ? `${window.location.origin}/api`
    : 'http://localhost:8000/api';

async function request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const token = localStorage.getItem('edi_token');

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
    };

    try {
        const res = await fetch(url, { ...options, headers });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail?.message || data.detail || `HTTP ${res.status}`);
        }
        return data;
    } catch (err) {
        console.error(`[API Client Error] ${endpoint}:`, err);
        throw err;
    }
}

export const api = {
    auth: {
        async login(email, password = null) {
            const data = await request('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            });
            if (data.session_id) {
                localStorage.setItem('edi_token', data.session_id);
            }
            return data;
        },
        async me() {
            return request('/auth/me');
        },
        async logout() {
            try {
                await request('/auth/logout', { method: 'POST' });
            } finally {
                localStorage.removeItem('edi_token');
            }
        }
    },
    resources: {
        async list(params = {}) {
            const query = new URLSearchParams(params).toString();
            return request(`/resources${query ? '?' + query : ''}`);
        },
        async get(resourceId) {
            return request(`/resources/${resourceId}`);
        },
        async updateStatus(resourceId, adminUserId, status) {
            return request(`/resources/${resourceId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ admin_user_id: adminUserId, status })
            });
        }
    },
    slots: {
        async list() {
            return request('/slots');
        }
    },
    bookings: {
        async submit(bookingData) {
            return request('/bookings', {
                method: 'POST',
                body: JSON.stringify(bookingData)
            });
        },
        async recurring(recurringData) {
            return request('/bookings/recurring', {
                method: 'POST',
                body: JSON.stringify(recurringData)
            });
        },
        async alternatives(params) {
            const query = new URLSearchParams(params).toString();
            return request(`/bookings/alternatives?${query}`);
        },
        async calendar(startDate, endDate = null, resourceId = null) {
            const params = { start_date: startDate };
            if (endDate) params.end_date = endDate;
            if (resourceId) params.resource_id = resourceId;
            const query = new URLSearchParams(params).toString();
            return request(`/bookings/calendar?${query}`);
        },
        async history(params = {}) {
            const query = new URLSearchParams(params).toString();
            return request(`/bookings/history${query ? '?' + query : ''}`);
        },
        async cancel(bookingId, userId, reason = null) {
            return request(`/bookings/${bookingId}/cancel`, {
                method: 'POST',
                body: JSON.stringify({ user_id: userId, reason })
            });
        }
    },
    approvals: {
        async queue() {
            return request('/approvals/queue');
        },
        async approve(bookingId, adminUserId, note = null) {
            return request(`/approvals/${bookingId}/approve`, {
                method: 'POST',
                body: JSON.stringify({ admin_user_id: adminUserId, note })
            });
        },
        async deny(bookingId, adminUserId, reason, note = null) {
            return request(`/approvals/${bookingId}/deny`, {
                method: 'POST',
                body: JSON.stringify({ admin_user_id: adminUserId, reason, note })
            });
        },
        async preempt(bookingId, adminUserId, reason) {
            return request(`/approvals/${bookingId}/preempt`, {
                method: 'POST',
                body: JSON.stringify({ admin_user_id: adminUserId, reason })
            });
        }
    },
    reports: {
        async utilisation(params = {}) {
            const query = new URLSearchParams(params).toString();
            return request(`/reports/utilisation${query ? '?' + query : ''}`);
        },
        async labUtilisation(params = {}) {
            const query = new URLSearchParams(params).toString();
            return request(`/reports/lab-utilisation${query ? '?' + query : ''}`);
        },
        async counts() {
            return request('/reports/counts');
        },
        async peakLoad() {
            return request('/reports/peak-load');
        },
        async conflicts() {
            return request('/reports/conflicts');
        },
        async tat() {
            return request('/reports/tat');
        }
    },
    auditLogs: {
        async list(params = {}) {
            const query = new URLSearchParams(params).toString();
            return request(`/audit-logs${query ? '?' + query : ''}`);
        },
        async forResource(resourceId) {
            return request(`/audit-logs/resource/${resourceId}`);
        }
    },
    notifications: {
        async list(userId) {
            return request(`/notifications?user_id=${userId}`);
        },
        async markRead(notificationId, userId) {
            return request(`/notifications/${notificationId}/read?user_id=${userId}`, {
                method: 'PATCH'
            });
        }
    },
    admin: {
        async stats() {
            return request('/admin/stats');
        },
        async users() {
            return request('/admin/users');
        },
        async createUser(userData) {
            return request('/admin/users', {
                method: 'POST',
                body: JSON.stringify(userData)
            });
        }
    }
};
