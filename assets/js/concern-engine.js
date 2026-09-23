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

    // Check if an existing approved booking occupies this slot (Contention detection)
    let conflictingBooking = null;
    try {
        const startAt = `${requestedDate}T${requestedStartTime.slice(0,5)}:00`;
        const endAt = `${requestedDate}T${requestedEndTime.slice(0,5)}:00`;
        const { data: overlaps } = await supabase
            .from('bookings')
            .select(`
                booking_id, requested_by, start_at, end_at, purpose,
                users!bookings_requested_by_fkey ( user_id, name, email )
            `)
            .eq('resource_id', resourceId)
            .eq('status', CONFIG.STATUS.APPROVED)
            .lt('start_at', endAt)
            .gt('end_at', startAt);

        if (overlaps && overlaps.length > 0) {
            conflictingBooking = overlaps[0];
        }
    } catch (_) {}

    // Fetch challenger details & resource name
    const { data: challenger } = await supabase.from('users').select('name').eq('user_id', userId).single();
    const { data: resData } = await supabase.from('resources').select('room_code').eq('resource_id', resourceId).single();
    const roomCode = resData?.room_code || `Resource #${resourceId}`;
    const challengerName = challenger?.name || 'Faculty';

    // Notify all admins of the contention concern requiring allocation decision
    const { data: admins } = await supabase
        .from('users')
        .select('user_id')
        .eq('role_id', 3); // 3 = Admin

    if (admins && admins.length > 0) {
        const adminMsg = conflictingBooking
            ? `⚠️ Slot Contention: Prof. ${challengerName} raised a concern competing for ${roomCode} on ${requestedDate} (${requestedStartTime.slice(0,5)}–${requestedEndTime.slice(0,5)}), currently allocated to ${conflictingBooking.users?.name || 'another faculty'}. Admin decision required.`
            : `A new concern (CON-${concernId.toString().padStart(6, '0')}) for ${roomCode} on ${requestedDate} has been raised and requires review.`;

        const promises = admins.map(admin => 
            insertNotification(
                admin.user_id, 
                conflictingBooking?.booking_id || null, 
                'CONCERN_CREATED', 
                'Slot Contention — Admin Decision Required', 
                adminMsg
            )
        );
        await Promise.all(promises);
    }

    // If there is an existing booking holder, inform them of the contention review
    if (conflictingBooking && conflictingBooking.requested_by) {
        await insertNotification(
            conflictingBooking.requested_by,
            conflictingBooking.booking_id,
            'CONCERN_RAISED_AGAINST',
            'Contention Concern Under Review',
            `Prof. ${challengerName} has raised a contention concern regarding your booking (#BK-${conflictingBooking.booking_id}) for ${roomCode} on ${requestedDate}. The administrator will review and decide allocation.`
        );
    }

    return {
        success: true,
        concernId,
        conflictingBooking,
        message: 'Concern submitted successfully. Administrator will review the contention and decide resource allocation.',
    };
}

/**
 * Fetch conflicting approved booking details for a given resource and slot.
 */
export async function getContendingBookingDetails(resourceId, dateStr, startTime, endTime) {
    if (!resourceId || !dateStr || !startTime || !endTime) return null;
    const startAt = `${dateStr}T${startTime.slice(0,5)}:00`;
    const endAt = `${dateStr}T${endTime.slice(0,5)}:00`;

    const { data: bookings } = await supabase
        .from('bookings')
        .select(`
            booking_id, requested_by, start_at, end_at, purpose, headcount, status,
            users!bookings_requested_by_fkey ( user_id, name, email )
        `)
        .eq('resource_id', resourceId)
        .eq('status', CONFIG.STATUS.APPROVED)
        .lt('start_at', endAt)
        .gt('end_at', startAt);

    return (bookings && bookings.length > 0) ? bookings[0] : null;
}

/**
 * Admin executes allocation decision for a contended resource slot:
 * - 'REALLOCATE_TO_CHALLENGER': Transfers the slot to the faculty who raised the concern.
 * - 'KEEP_WITH_CURRENT': Reaffirms original booking and dismisses the concern.
 */
export async function decideResourceAllocation({
    concernId,
    adminUserId,
    decision,
    reason,
    challengerUserId,
    originalBookingId,
    resourceId,
    dateStr,
    startTime,
    endTime,
}) {
    if (!reason || reason.trim() === '') {
        return { success: false, message: 'Please provide an administrative reason for this allocation decision.' };
    }

    const { data: resData } = await supabase.from('resources').select('room_code').eq('resource_id', resourceId).single();
    const roomCode = resData?.room_code || 'Resource';

    if (decision === 'REALLOCATE_TO_CHALLENGER') {
        // 1. Release / Cancel original booking
        if (originalBookingId) {
            const { data: origBooking } = await supabase
                .from('bookings')
                .select('requested_by, booking_id')
                .eq('booking_id', originalBookingId)
                .single();

            await supabase
                .from('bookings')
                .update({
                    status: CONFIG.STATUS.DENIED,
                })
                .eq('booking_id', originalBookingId);

            // Audit log the deallocation
            await insertAuditLog({
                eventType: 'BOOKING_REALLOCATED',
                actorUserId: adminUserId,
                targetEntityType: 'BOOKING',
                targetEntityId: originalBookingId,
                bookingId: originalBookingId,
                resourceId: resourceId,
                previousState: CONFIG.STATUS.APPROVED,
                newState: CONFIG.STATUS.DENIED,
                reason: `Reallocated to challenger faculty by Administrator. Decision Note: ${reason}`,
            });

            // Notify original holder
            if (origBooking?.requested_by) {
                await insertNotification(
                    origBooking.requested_by,
                    originalBookingId,
                    'BOOKING_DENIED',
                    'Booking Reallocated by Administrator',
                    `Your booking (#BK-${originalBookingId}) for ${roomCode} on ${dateStr} was reallocated by Administrator. Reason: ${reason}`
                );
            }
        }

        // 2. Create new approved booking for Challenger Faculty
        const startAt = `${dateStr}T${startTime.slice(0,5)}:00`;
        const endAt = `${dateStr}T${endTime.slice(0,5)}:00`;

        const { data: newBooking, error: newBkErr } = await supabase
            .from('bookings')
            .insert({
                resource_id: resourceId,
                requested_by: challengerUserId,
                booking_type: 'ACADEMIC',
                start_at: startAt,
                end_at: endAt,
                purpose: `Allocated via Administrative Concern Resolution (CON-${concernId.toString().padStart(6, '0')})`,
                status: CONFIG.STATUS.APPROVED,
            })
            .select('booking_id')
            .single();

        if (newBkErr) {
            return { success: false, message: 'Could not create reallocated booking: ' + newBkErr.message };
        }

        const newBookingId = newBooking.booking_id;

        // Audit log for challenger's new booking
        await insertAuditLog({
            eventType: CONFIG.AUDIT.BOOKING_APPROVED,
            actorUserId: adminUserId,
            targetEntityType: 'BOOKING',
            targetEntityId: newBookingId,
            bookingId: newBookingId,
            resourceId: resourceId,
            previousState: null,
            newState: CONFIG.STATUS.APPROVED,
            reason: `Resource allocated to challenger faculty following concern resolution. Note: ${reason}`,
        });

        // Notify challenger of successful allocation
        await insertNotification(
            challengerUserId,
            newBookingId,
            'BOOKING_APPROVED',
            'Resource Allocated to You!',
            `Administrator resolved your concern and successfully allocated ${roomCode} to you for ${dateStr} (${startTime.slice(0,5)}–${endTime.slice(0,5)}). Reference: #BK-${newBookingId}.`
        );

        // 3. Mark concern as RESOLVED
        await updateConcernStatus(
            concernId,
            adminUserId,
            CONFIG.CONCERN_STATUS.RESOLVED,
            `Administrator reallocated ${roomCode} to challenger faculty (#BK-${newBookingId}). Note: ${reason}`
        );

        return {
            success: true,
            newBookingId,
            message: `Resource successfully reallocated to challenger faculty. New Booking #BK-${newBookingId} is now APPROVED.`,
        };
    } else {
        // KEEP_WITH_CURRENT: Reaffirm original booking, reject concern
        await updateConcernStatus(
            concernId,
            adminUserId,
            CONFIG.CONCERN_STATUS.REJECTED,
            `Resource allocation retained with original faculty holder. Note: ${reason}`
        );

        // Notify challenger that request was not granted
        await insertNotification(
            challengerUserId,
            null,
            'CONCERN_REJECTED',
            'Contention Concern Decision',
            `Administrator reviewed concern CON-${concernId.toString().padStart(6, '0')}. Allocation for ${roomCode} remains with the current booking holder. Admin note: ${reason}`
        );

        // Notify current holder that their booking was reaffirmed
        if (originalBookingId) {
            const { data: origBooking } = await supabase
                .from('bookings')
                .select('requested_by')
                .eq('booking_id', originalBookingId)
                .single();

            if (origBooking?.requested_by) {
                await insertNotification(
                    origBooking.requested_by,
                    originalBookingId,
                    'BOOKING_APPROVED',
                    'Booking Reaffirmed by Administrator',
                    `Administrator reviewed a contention concern for ${roomCode} on ${dateStr} and reaffirmed your allocation.`
                );
            }
        }

        return {
            success: true,
            message: 'Allocation decision saved: Resource remains allocated to the original booking holder.',
        };
    }
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
        .select('*, users(name, email), resources(room_code, resource_type, block)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching all concerns:', error);
        return [];
    }
    return data || [];
}
