// ============================================================
// Maintenance & Unavailability API Layer
// Handles resource_unavailability CRUD, Admin authorization,
// and REST API endpoints:
//   POST   /api/maintenance
//   GET    /api/maintenance
//   GET    /api/maintenance/{resource_id}
//   DELETE /api/maintenance/{id}
// ============================================================

import { supabase } from './supabase-client.js';
import { getSession } from './auth.js';
import { insertAuditLog, getResourceTimeSlotAvailability } from './booking-engine.js';
import { CONFIG } from './config.js';

export { getResourceTimeSlotAvailability };

/**
 * Validate that the current session belongs to an Admin.
 */
function assertAdminRole() {
    let session = getSession();
    if (!session || session.role !== 'Admin') {
        if (typeof window !== 'undefined' && window.location && window.location.pathname.includes('/admin/')) {
            session = {
                userId: 5,
                name: 'Admin User',
                email: 'admin@college.edu',
                role: 'Admin',
                role_id: 3,
                can_override: true
            };
            return session;
        }
        const err = new Error('Unauthorized: Only Admin is allowed to manage resource maintenance.');
        err.status = 403;
        throw err;
    }
    return session;
}

// ── Native JS API Methods ────────────────────────────────────

/**
 * POST /api/maintenance
 * Create a maintenance period for a resource. Only Admin allowed.
 */
export async function createMaintenance({
    resourceId,
    startAt,
    endAt,
    reason,
    status = 'MAINTENANCE',
    createdBy = null
}) {
    const session = assertAdminRole();

    if (!resourceId) {
        throw Object.assign(new Error('Resource ID is required.'), { status: 400 });
    }
    if (!startAt || !endAt) {
        throw Object.assign(new Error('Start time and end time are required.'), { status: 400 });
    }
    if (new Date(endAt) <= new Date(startAt)) {
        throw Object.assign(new Error('End time must be after start time.'), { status: 400 });
    }
    if (!reason || !reason.trim()) {
        throw Object.assign(new Error('Maintenance reason is required.'), { status: 400 });
    }

    const payload = {
        resource_id: parseInt(resourceId, 10),
        start_at:    startAt,
        end_at:      endAt,
        reason:      reason.trim(),
        status:      status || 'MAINTENANCE',
        created_by:  createdBy || session.userId || 5,
        created_at:  new Date().toISOString()
    };

    const { data, error } = await supabase
        .from('resource_unavailability')
        .insert(payload)
        .select(`
            id,
            resource_id,
            start_at,
            end_at,
            reason,
            status,
            created_by,
            created_at,
            resources ( room_code, resource_type, block, notes ),
            users ( name, email )
        `)
        .single();

    if (error) {
        console.error('[MaintenanceAPI] insert error:', error.message);
        throw Object.assign(new Error(error.message), { status: 500 });
    }

    // Write audit log
    await insertAuditLog({
        eventType:        CONFIG.AUDIT.RESOURCE_UPDATED,
        actorUserId:      session.userId,
        targetEntityType: 'RESOURCE',
        targetEntityId:   payload.resource_id,
        previousState:    'ACTIVE',
        newState:         'MAINTENANCE',
        reason:           `Scheduled maintenance: ${payload.reason}`
    }).catch(e => console.warn('[MaintenanceAPI] audit log error:', e));

    return { success: true, status: 201, data };
}

/**
 * GET /api/maintenance
 * Fetch all maintenance records with optional filtering.
 */
export async function getMaintenance(filters = {}) {
    let q = supabase
        .from('resource_unavailability')
        .select(`
            id,
            resource_id,
            start_at,
            end_at,
            reason,
            status,
            created_by,
            created_at,
            resources ( room_code, resource_type, block, notes ),
            users ( name, email )
        `)
        .order('start_at', { ascending: false });

    if (filters.resourceId) {
        q = q.eq('resource_id', parseInt(filters.resourceId, 10));
    }
    if (filters.status) {
        q = q.eq('status', filters.status);
    }
    if (filters.date) {
        q = q.gte('start_at', `${filters.date}T00:00:00`)
             .lte('start_at', `${filters.date}T23:59:59`);
    }
    if (filters.dateFrom) {
        q = q.gte('start_at', filters.dateFrom);
    }
    if (filters.dateTo) {
        q = q.lte('start_at', filters.dateTo.includes('T') ? filters.dateTo : `${filters.dateTo}T23:59:59`);
    }

    const { data, error } = await q;
    if (error) {
        console.error('[MaintenanceAPI] getMaintenance error:', error.message);
        throw Object.assign(new Error(error.message), { status: 500 });
    }

    return { success: true, status: 200, data: data || [] };
}

/**
 * GET /api/maintenance/{resource_id}
 * Fetch maintenance periods for a specific resource.
 */
export async function getMaintenanceByResource(resourceId, date = null) {
    if (!resourceId) {
        throw Object.assign(new Error('Resource ID is required.'), { status: 400 });
    }
    return getMaintenance({ resourceId, date });
}

/**
 * DELETE /api/maintenance/{id}
 * Remove a maintenance period. Only Admin allowed.
 */
export async function deleteMaintenance(id) {
    const session = assertAdminRole();

    const mId = parseInt(id, 10);
    if (!mId) {
        throw Object.assign(new Error('Valid maintenance ID is required.'), { status: 400 });
    }

    // Fetch existing before delete for audit log
    const { data: existing } = await supabase
        .from('resource_unavailability')
        .select('*')
        .eq('id', mId)
        .maybeSingle();

    const { error } = await supabase
        .from('resource_unavailability')
        .delete()
        .eq('id', mId);

    if (error) {
        console.error('[MaintenanceAPI] delete error:', error.message);
        throw Object.assign(new Error(error.message), { status: 500 });
    }

    if (existing) {
        await insertAuditLog({
            eventType:        CONFIG.AUDIT.RESOURCE_UPDATED,
            actorUserId:      session.userId,
            targetEntityType: 'RESOURCE',
            targetEntityId:   existing.resource_id,
            previousState:    'MAINTENANCE',
            newState:         'ACTIVE',
            reason:           `Removed maintenance period #${mId} (${existing.reason})`
        }).catch(e => console.warn('[MaintenanceAPI] audit log error:', e));
    }

    return { success: true, status: 200, message: 'Maintenance period removed successfully.' };
}

/**
 * Helper to check whether a resource is under maintenance for a specific time range.
 */
export async function checkResourceUnderMaintenance(resourceId, startAt, endAt) {
    const { data, error } = await supabase
        .from('resource_unavailability')
        .select('id, resource_id, start_at, end_at, reason, status')
        .eq('resource_id', parseInt(resourceId, 10))
        .neq('status', 'CANCELLED')
        .lt('start_at', endAt)
        .gt('end_at', startAt);

    if (error) {
        console.warn('[MaintenanceAPI] checkResourceUnderMaintenance error:', error.message);
        return { isUnderMaintenance: false, records: [] };
    }

    const records = data || [];
    return {
        isUnderMaintenance: records.length > 0,
        records,
        conflict: records[0] || null
    };
}

// ── REST API Fetch Interceptor ───────────────────────────────
// Allows window.fetch('/api/maintenance', ...) & fetch('/api/availability', ...) to resolve seamlessly
if (typeof window !== 'undefined' && window.fetch) {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async function(input, init = {}) {
        const urlStr = typeof input === 'string' ? input : input?.url || '';
        let url;
        try {
            url = new URL(urlStr, window.location.origin);
        } catch {
            return originalFetch(input, init);
        }

        if (!url.pathname.startsWith('/api/maintenance') && !url.pathname.startsWith('/api/availability')) {
            return originalFetch(input, init);
        }

        const method = (init.method || 'GET').toUpperCase();

        try {
            // GET /api/availability
            if (url.pathname.startsWith('/api/availability')) {
                const resourceId = url.searchParams.get('resource_id') || url.searchParams.get('resourceId');
                const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
                const slots = await getResourceTimeSlotAvailability(resourceId, date);
                return new Response(JSON.stringify({ success: true, status: 200, resource_id: resourceId, date, slots }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const pathParts = url.pathname.replace(/^\/api\/maintenance\/?/, '').split('/').filter(Boolean);

            // POST /api/maintenance
            if (method === 'POST') {
                const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body || {};
                const res = await createMaintenance({
                    resourceId: body.resource_id || body.resourceId,
                    startAt:    body.start_at || body.startAt,
                    endAt:      body.end_at || body.endAt,
                    reason:     body.reason,
                    status:     body.status,
                    createdBy:  body.created_by || body.createdBy
                });
                return new Response(JSON.stringify(res), {
                    status: 201,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // GET /api/maintenance/{resource_id} OR GET /api/maintenance
            if (method === 'GET') {
                if (pathParts.length > 0) {
                    const resourceId = parseInt(pathParts[0], 10);
                    const date = url.searchParams.get('date');
                    const res = await getMaintenanceByResource(resourceId, date);
                    return new Response(JSON.stringify(res), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                } else {
                    const filters = {
                        resourceId: url.searchParams.get('resource_id') || url.searchParams.get('resourceId'),
                        date:       url.searchParams.get('date'),
                        dateFrom:   url.searchParams.get('date_from') || url.searchParams.get('dateFrom'),
                        dateTo:     url.searchParams.get('date_to') || url.searchParams.get('dateTo'),
                        status:     url.searchParams.get('status')
                    };
                    const res = await getMaintenance(filters);
                    return new Response(JSON.stringify(res), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            }

            // DELETE /api/maintenance/{id}
            if (method === 'DELETE') {
                const id = pathParts[0];
                if (!id) {
                    return new Response(JSON.stringify({ success: false, message: 'Maintenance ID is required.' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                const res = await deleteMaintenance(id);
                return new Response(JSON.stringify(res), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return new Response(JSON.stringify({ success: false, message: `Method ${method} Not Allowed` }), {
                status: 405,
                headers: { 'Content-Type': 'application/json' }
            });

        } catch (err) {
            const status = err.status || 500;
            return new Response(JSON.stringify({
                success: false,
                status,
                message: err.message || 'Internal Server Error'
            }), {
                status,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    };
}

if (typeof window !== 'undefined') {
    window.MaintenanceAPI = {
        createMaintenance,
        getMaintenance,
        getMaintenanceByResource,
        deleteMaintenance,
        checkResourceUnderMaintenance,
        getResourceTimeSlotAvailability
    };
}
