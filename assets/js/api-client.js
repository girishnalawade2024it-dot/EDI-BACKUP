// ============================================================
// API Client wrapper for Django Backend
// ============================================================

const API_BASE = 'http://localhost:8000/api';

export const apiClient = {
    async request(endpoint, method = 'GET', body = null) {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        const token = localStorage.getItem('access_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const config = {
            method,
            headers
        };
        
        if (body) {
            config.body = JSON.stringify(body);
        }
        
        try {
            const response = await fetch(`${API_BASE}${endpoint}`, config);
            
            // Check for unauthorized (token expired)
            if (response.status === 401 && endpoint !== '/auth/login/') {
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                localStorage.removeItem('edi_portal_session');
                window.location.href = '../login.html';
                throw new Error('Session expired. Please log in again.');
            }
            
            const isJson = response.headers.get('content-type')?.includes('application/json');
            const data = isJson ? await response.json() : null;
            
            if (!response.ok) {
                const errorMsg = data && data.error ? data.error : (data && data.detail ? data.detail : response.statusText);
                throw new Error(errorMsg);
            }
            
            return { data, error: null };
            
        } catch (error) {
            console.error(`[API Client] ${method} ${endpoint} failed:`, error);
            return { data: null, error };
        }
    },
    
    get(endpoint) {
        return this.request(endpoint, 'GET');
    },
    
    post(endpoint, body) {
        return this.request(endpoint, 'POST', body);
    },
    
    put(endpoint, body) {
        return this.request(endpoint, 'PUT', body);
    },
    
    delete(endpoint) {
        return this.request(endpoint, 'DELETE');
    }
};
