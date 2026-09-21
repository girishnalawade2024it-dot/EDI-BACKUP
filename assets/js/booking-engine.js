// ============================================================
// Booking Engine — Core Business Logic
// SRS FR-3, FR-4, FR-5, FR-7, FR-8
// All booking state transitions + audit logging + notifications.
// ============================================================

import { supabase } from './supabase-client.js';
import { CONFIG, nowLocalISO } from './config.js';

// ── Audit log writer (SRS FR-8.1 – append-only) ─────────────
export async function insertAuditLog({
    eventType, actorUserId, targetEntityType = null,
    targetEntityId = null, bookingId = null, resourceId = null,
    previousState = null, newState = null,
    reason = null, transactionId = null,
}) {
    const { error } = await supabase.from('audit_logs').insert({
        event_type:         eventType,
        actor_user_id:      actorUserId,
        target_entity_type: targetEntityType,
        target_entity_id:   targetEntityId,
        booking_id:         bookingId,
        resource_id:        resourceId,
        previous_state:     previousState,
        new_state:          newState,
        reason,
        transaction_id:     transactionId || `TXN-${Date.now()}`,
    });
    if (error) console.warn('[BookingEngine] audit log error:', error.message);
}

// ── Notification writer ──────────────────────────────────────
export async function insertNotification(userId, bookingId, type, title, message) {
    const { error } = await supabase.from('notifications').insert({
        user_id: userId, booking_id: bookingId,
        type, title, message, is_read: false,
    });
    if (error) console.warn('[BookingEngine] notification error:', error.message);
}

// ── Overlap checker (SRS FR-3.5, FR-4.x) ────────────────────
// Returns { approved: [...], pending: [...] }
// Interval overlap: A.start < B.end AND A.end > B.start  (half-open per SRS §1.3)
export async function checkOverlap(resourceId, startAt, endAt) {
    const { data, error } = await supabase
        .from('bookings')
        .select('booking_id, status, start_at, end_at, requested_by, purpose, users!bookings_requested_by_fkey(name)')
        .eq('resource_id', resourceId)
        .in('status', [CONFIG.STATUS.APPROVED, CONFIG.STATUS.PENDING])
        .lt('start_at', endAt)
        .gt('end_at', startAt);

    if (error) throw new Error('Overlap check failed: ' + error.message);

    const rows     = data || [];
    const approved = rows.filter(r => r.status === CONFIG.STATUS.APPROVED);
    const pending  = rows.filter(r => r.status === CONFIG.STATUS.PENDING);
    return { approved, pending };
}

// ── Alternative resource suggestions (SRS NFR-U2) ────────────
export async function suggestAlternatives(resourceType, startAt, endAt, excludeResourceId) {
    // Fetch all active resources of the same type
    const { data: resources } = await supabase
        .from('resources')
        .select('resource_id, room_code, resource_type, block, capacity, notes')
        .eq('resource_type', resourceType)
        .eq('status', 'ACTIVE')
        .neq('resource_id', excludeResourceId);

    if (!resources || resources.length === 0) return [];

    // Check each for overlaps
    const available = [];
    for (const res of resources) {
        const { approved } = await checkOverlap(res.resource_id, startAt, endAt);
        if (approved.length === 0) available.push(res);
    }
    return available;
}

// ── SUBMIT BOOKING (SRS FR-3.1 – FR-3.6) ────────────────────
export async function submitBooking({
    userId, resourceId, bookingType, startAt, endAt,
    purpose, headcount, seriesId = null,
}) {
    const now = new Date();

    // FR-3.3: Not in the past
    if (new Date(startAt) <= now) {
        return { success: false, code: 'PAST', message: 'Booking date/time must be in the future.' };
    }

    // FR-3.2: end > start
    if (new Date(endAt) <= new Date(startAt)) {
        return { success: false, code: 'INVALID_RANGE', message: 'End time must be after start time.' };
    }

    // FR-3.4: Max 4 hours
    const durationHrs = (new Date(endAt) - new Date(startAt)) / 3600000;
    if (durationHrs > CONFIG.MAX_BOOKING_HOURS) {
        return { success: false, code: 'TOO_LONG', message: `Maximum booking duration is ${CONFIG.MAX_BOOKING_HOURS} hours.` };
    }

    // FR-3.4: Within operating hours (08:00 - 18:00)
    const [sH, sM] = (startAt.includes('T') ? startAt.split('T')[1] : startAt).slice(0, 5).split(':').map(Number);
    const [eH, eM] = (endAt.includes('T') ? endAt.split('T')[1] : endAt).slice(0, 5).split(':').map(Number);
    const startMins = sH * 60 + sM;
    const endMins   = eH * 60 + eM;
    const opS = CONFIG.OPERATING_HOURS.START_HOUR * 60;
    const opE = CONFIG.OPERATING_HOURS.END_HOUR * 60;
    if (startMins < opS || endMins > opE) {
        return { success: false, code: 'OUTSIDE_HOURS', message: `Bookings must be within ${CONFIG.OPERATING_START}–${CONFIG.OPERATING_END}.` };
    }

    // FR-3.5: Check for APPROVED overlaps (hard block)
    let overlap;
    try {
        overlap = await checkOverlap(resourceId, startAt, endAt);
    } catch (e) {
        return { success: false, code: 'CHECK_FAILED', message: e.message };
    }

    if (overlap.approved.length > 0) {
        // Suggest alternatives (SRS NFR-U2)
        const { data: res } = await supabase
            .from('resources')
            .select('resource_type')
            .eq('resource_id', resourceId)
            .single();

        const alternatives = res
            ? await suggestAlternatives(res.resource_type, startAt, endAt, resourceId)
            : [];

        return {
            success:      false,
            code:         'SLOT_TAKEN',
            message:      'This slot is already booked. Please choose a different time.',
            conflicting:  overlap.approved,
            alternatives,
        };
    }

    // FR-3.6: Insert booking as PENDING
    const { data: booking, error: insertErr } = await supabase
        .from('bookings')
        .insert({
            resource_id:  resourceId,
            requested_by: userId,
            booking_type: bookingType,
            start_at:     startAt,
            end_at:       endAt,
            purpose,
            headcount:    headcount || null,
            status:       CONFIG.STATUS.PENDING,
            series_id:    seriesId,
        })
        .select('booking_id')
        .single();

    if (insertErr) {
        return { success: false, code: 'INSERT_FAILED', message: 'Could not save booking: ' + insertErr.message };
    }

    const bookingId = booking.booking_id;

    // FR-8.1: Write audit log
    await insertAuditLog({
        eventType:        CONFIG.AUDIT.BOOKING_CREATED,
        actorUserId:      userId,
        targetEntityType: 'BOOKING',
        targetEntityId:   bookingId,
        bookingId,
        resourceId,
        previousState:    null,
        newState:         CONFIG.STATUS.PENDING,
        reason:           'New booking request created',
    });

    // Notify admin users
    const { data: admins } = await supabase
        .from('users')
        .select('user_id')
        .eq('role_id', 3); // role_id 3 = Admin

    if (admins) {
        for (const admin of admins) {
            await insertNotification(
                admin.user_id, bookingId,
                'BOOKING_PENDING',
                'New Booking Request',
                `A new booking request (#${bookingId}) is awaiting your approval.`
            );
        }
    }

    return {
        success: true,
        bookingId,
        hasPendingConflict: overlap.pending.length > 0,
        message: 'Booking request submitted successfully.',
    };
}

// ── CANCEL BOOKING (SRS FR-3.7) ──────────────────────────────
export async function cancelBooking(bookingId, userId) {
    // Fetch the booking
    const { data: bk, error } = await supabase
        .from('bookings')
        .select('booking_id, resource_id, requested_by, status, start_at')
        .eq('booking_id', bookingId)
        .single();

    if (error || !bk) return { success: false, message: 'Booking not found.' };

    // Ownership check (SRS NFR-S4)
    if (bk.requested_by !== userId) {
        return { success: false, message: 'You can only cancel your own bookings.' };
    }

    const allowedStatuses = [CONFIG.STATUS.PENDING, CONFIG.STATUS.APPROVED];
    if (!allowedStatuses.includes(bk.status)) {
        return { success: false, message: `Cannot cancel a ${bk.status} booking.` };
    }

    // Cut-off check for APPROVED bookings (SRS FR-3.7)
    if (bk.status === CONFIG.STATUS.APPROVED) {
        const hoursUntilStart = (new Date(bk.start_at) - Date.now()) / 3600000;
        if (hoursUntilStart < CONFIG.CANCEL_CUTOFF_HRS) {
            return {
                success: false,
                message: `Approved bookings can only be cancelled at least ${CONFIG.CANCEL_CUTOFF_HRS} hours before start time.`,
            };
        }
    }

    const { error: updateErr } = await supabase
        .from('bookings')
        .update({
            status:       CONFIG.STATUS.CANCELLED,
            cancelled_at: nowLocalISO(),
        })
        .eq('booking_id', bookingId);

    if (updateErr) return { success: false, message: 'Cancellation failed: ' + updateErr.message };

    await insertAuditLog({
        eventType:        CONFIG.AUDIT.BOOKING_CANCELLED,
        actorUserId:      userId,
        targetEntityType: 'BOOKING',
        targetEntityId:   bookingId,
        bookingId,
        resourceId:       bk.resource_id,
        previousState:    bk.status,
        newState:         CONFIG.STATUS.CANCELLED,
        reason:           'Cancelled by requester',
    });

    await insertNotification(userId, bookingId, 'BOOKING_CANCELLED',
        'Booking Cancelled', `Your booking #${bookingId} has been cancelled.`);

    return { success: true, message: 'Booking cancelled successfully.' };
}

// ── APPROVE BOOKING (SRS FR-5.2) ─────────────────────────────
export async function approveBooking(bookingId, adminUserId, note = '') {
    const { data: bk } = await supabase
        .from('bookings')
        .select('booking_id, resource_id, requested_by, status, start_at, end_at')
        .eq('booking_id', bookingId)
        .single();

    if (!bk || bk.status !== CONFIG.STATUS.PENDING) {
        return { success: false, message: 'Booking is not in PENDING state.' };
    }

    // Re-check overlap at approval time
    const { approved } = await checkOverlap(bk.resource_id, bk.start_at, bk.end_at);
    const conflicts = approved.filter(a => a.booking_id !== bookingId);
    if (conflicts.length > 0) {
        return { success: false, message: 'Cannot approve: slot is now taken by another approved booking.' };
    }

    const { error } = await supabase
        .from('bookings')
        .update({
            status:          CONFIG.STATUS.APPROVED,
            approved_by:     adminUserId,
            decision_note:   note,
            decided_at:      nowLocalISO(),
        })
        .eq('booking_id', bookingId);

    if (error) return { success: false, message: 'Approval failed: ' + error.message };

    await insertAuditLog({
        eventType: CONFIG.AUDIT.BOOKING_APPROVED, actorUserId: adminUserId,
        targetEntityType: 'BOOKING', targetEntityId: bookingId,
        bookingId, resourceId: bk.resource_id,
        previousState: CONFIG.STATUS.PENDING, newState: CONFIG.STATUS.APPROVED,
        reason: note || 'Approved by admin',
    });

    await insertNotification(bk.requested_by, bookingId, 'BOOKING_APPROVED',
        'Booking Approved', `Your booking #${bookingId} has been approved!`);

    return { success: true };
}

// ── DENY BOOKING (SRS FR-5.3) ────────────────────────────────
export async function denyBooking(bookingId, adminUserId, reason, note = '') {
    const { data: bk } = await supabase
        .from('bookings')
        .select('booking_id, resource_id, requested_by, status')
        .eq('booking_id', bookingId)
        .single();

    if (!bk || bk.status !== CONFIG.STATUS.PENDING) {
        return { success: false, message: 'Booking is not in PENDING state.' };
    }

    const { error } = await supabase
        .from('bookings')
        .update({
            status:          CONFIG.STATUS.DENIED,
            approved_by:     adminUserId,
            decision_reason: reason,
            decision_note:   note,
            decided_at:      nowLocalISO(),
        })
        .eq('booking_id', bookingId);

    if (error) return { success: false, message: 'Denial failed: ' + error.message };

    await insertAuditLog({
        eventType: CONFIG.AUDIT.BOOKING_DENIED, actorUserId: adminUserId,
        targetEntityType: 'BOOKING', targetEntityId: bookingId,
        bookingId, resourceId: bk.resource_id,
        previousState: CONFIG.STATUS.PENDING, newState: CONFIG.STATUS.DENIED,
        reason,
    });

    await insertNotification(bk.requested_by, bookingId, 'BOOKING_DENIED',
        'Booking Denied',
        `Your booking #${bookingId} was denied. Reason: ${reason}.`);

    return { success: true };
}

// ── PREEMPT BOOKING — Admin only (SRS FR-5.4) ────────────────
export async function preemptBooking(bookingId, adminUserId, reason) {
    const { data: bk } = await supabase
        .from('bookings')
        .select('booking_id, resource_id, requested_by, status')
        .eq('booking_id', bookingId)
        .single();

    if (!bk || bk.status !== CONFIG.STATUS.APPROVED) {
        return { success: false, message: 'Only APPROVED bookings can be preempted.' };
    }

    const { error } = await supabase
        .from('bookings')
        .update({
            status:          CONFIG.STATUS.PREEMPTED,
            approved_by:     adminUserId,
            decision_reason: reason,
            decided_at:      nowLocalISO(),
        })
        .eq('booking_id', bookingId);

    if (error) return { success: false, message: 'Preemption failed: ' + error.message };

    await insertAuditLog({
        eventType: CONFIG.AUDIT.BOOKING_PREEMPTED, actorUserId: adminUserId,
        targetEntityType: 'BOOKING', targetEntityId: bookingId,
        bookingId, resourceId: bk.resource_id,
        previousState: CONFIG.STATUS.APPROVED, newState: CONFIG.STATUS.PREEMPTED,
        reason,
    });

    await insertNotification(bk.requested_by, bookingId, 'BOOKING_PREEMPTED',
        'Booking Preempted',
        `Your booking #${bookingId} was preempted by an administrative action. Reason: ${reason}.`);

    return { success: true };
}
