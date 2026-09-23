// ============================================================
// Concern Engine — Logic for Concurrency Conflicts
// ============================================================

import { supabase } from './supabase-client.js';
import { CONFIG, nowLocalISO } from './config.js';
import { insertAuditLog, insertNotification } from './booking-engine.js';

/**
 * Submit a new concern regarding a booking conflict.
 */
export async function submitConcern({
    userId,
    resourceId,
    requestedDate,
    requestedStartTime,
    requestedEndTime,
    concernType,
    description
}) {
    if (!description || description.trim() === '') {
        return { success: false, message: 'Description is required.' };
    }

    const { data: concern, error: insertErr } = await supabase
        .from('concerns')
        .insert({
            user_id: userId,
            resource_id: resourceId,
            requested_date: requestedDate,
            requested_start_time: requestedStartTime,
            requested_end_time: requestedEndTime,
            concern_type: concernType,
            description: description,
            status: CONFIG.CONCERN_STATUS.OPEN,
        })
        .select('concern_id')
        .single();

    if (insertErr) {
        return { success: false, message: 'Could not submit concern: ' + insertErr.message };
    }

    const concernId = concern.concern_id;

    // Write audit log
    await insertAuditLog({
        eventType: CONFIG.AUDIT.CONCERN_CREATED,
        actorUserId: userId,
        targetEntityType: 'CONCERN',
        targetEntityId: concernId,
        resourceId: resourceId,
        newState: CONFIG.CONCERN_STATUS.OPEN,
        reason: 'New concern raised',
    });

    // Notify all admins
    const { data: admins } = await supabase
        .from('users')
        .select('user_id')
        .eq('role_id', 3); // 3 = Admin

    if (admins && admins.length > 0) {
        const promises = admins.map(admin => 
            insertNotification(
                admin.user_id, 
                null, 
                'CONCERN_CREATED', 
                'New Concern Raised', 
                `A new concern (CON-${concernId.toString().padStart(6, '0')}) has been raised and requires review.`
            )
        );
        await Promise.all(promises);
    }

    return {
        success: true,
        concernId,
        message: 'Concern submitted successfully.',
    };
}

/**
 * Admin updates the status and adds a response to a concern.
 */
export async function updateConcernStatus(concernId, adminUserId, newStatus, responseText = '') {
    const { data: existing } = await supabase
        .from('concerns')
        .select('status')
        .eq('concern_id', concernId)
        .single();

    if (!existing) {
        return { success: false, message: 'Concern not found.' };
    }

    const payload = {
        status: newStatus,
        admin_response: responseText,
        updated_at: nowLocalISO(),
    };

    if (newStatus === CONFIG.CONCERN_STATUS.RESOLVED || newStatus === CONFIG.CONCERN_STATUS.REJECTED) {
        payload.resolved_at = nowLocalISO();
    }

    const { error } = await supabase
        .from('concerns')
        .update(payload)
        .eq('concern_id', concernId);

    if (error) {
        return { success: false, message: 'Failed to update concern: ' + error.message };
    }

    // Determine audit event based on status
    let eventType = CONFIG.AUDIT.CONCERN_STATUS_CHANGED;
    if (newStatus === CONFIG.CONCERN_STATUS.RESOLVED) eventType = CONFIG.AUDIT.CONCERN_RESOLVED;
    if (newStatus === CONFIG.CONCERN_STATUS.REJECTED) eventType = CONFIG.AUDIT.CONCERN_REJECTED;

    await insertAuditLog({
        eventType,
        actorUserId: adminUserId,
        targetEntityType: 'CONCERN',
        targetEntityId: concernId,
        previousState: existing.status,
        newState: newStatus,
        reason: responseText || `Status changed to ${newStatus}`,
    });

    return { success: true };
}

/**
 * Fetch all concerns for a specific user (Faculty view).
 */
export async function getConcernsForUser(userId) {
    const { data, error } = await supabase
        .from('concerns')
        .select('*, resources(room_code)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching user concerns:', error);
        return [];
    }
    return data || [];
}

/**
 * Fetch all concerns (Admin view).
 */
export async function getAllConcerns() {
    const { data, error } = await supabase
        .from('concerns')
        .select('*, users(name), resources(room_code)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching all concerns:', error);
        return [];
    }
    return data || [];
}
