// ============================================================
// Booking Engine — API Wrappers
// Business logic is now safely enforced on the Django Backend.
// ============================================================

import { apiClient } from './api-client.js';

// ── SUBMIT BOOKING ──────────────────────────────────────────
export async function submitBooking({
    userId, resourceId, bookingType, startAt, endAt,
    purpose, headcount, seriesId = null,
}) {
    const payload = {
        resource_id: resourceId,
        booking_type: bookingType,
        start_at: startAt,
        end_at: endAt,
        purpose: purpose,
        headcount: headcount || null,
        series_id: seriesId
    };

    const { data, error } = await apiClient.post('/bookings/', payload);
    
    if (error) {
        return { 
            success: false, 
            message: error.message || 'Submission failed.' 
        };
    }
    
    return {
        success: true,
        bookingId: data.booking_id,
        hasPendingConflict: data.has_pending_conflict,
        message: 'Booking request submitted successfully.',
    };
}

// ── CANCEL BOOKING ──────────────────────────────────────────
export async function cancelBooking(bookingId, userId) {
    const { data, error } = await apiClient.post(`/bookings/${bookingId}/cancel/`, {});
    
    if (error) {
        return { success: false, message: error.message || 'Cancellation failed.' };
    }
    return { success: true, message: 'Booking cancelled successfully.' };
}

// ── APPROVE BOOKING ─────────────────────────────────────────
export async function approveBooking(bookingId, adminUserId, note = '') {
    const { data, error } = await apiClient.post(`/bookings/${bookingId}/approve/`, { note });
    
    if (error) {
        return { success: false, message: error.message || 'Approval failed.' };
    }
    return { success: true };
}

// ── DENY BOOKING ────────────────────────────────────────────
export async function denyBooking(bookingId, adminUserId, reason, note = '') {
    const { data, error } = await apiClient.post(`/bookings/${bookingId}/deny/`, { reason, note });
    
    if (error) {
        return { success: false, message: error.message || 'Denial failed.' };
    }
    return { success: true };
}

// ── PREEMPT BOOKING ─────────────────────────────────────────
export async function preemptBooking(bookingId, adminUserId, reason) {
    const { data, error } = await apiClient.post(`/bookings/${bookingId}/preempt/`, { reason });
    
    if (error) {
        return { success: false, message: error.message || 'Preemption failed.' };
    }
    return { success: true };
}

// ── SUGGEST ALTERNATIVES ────────────────────────────────────
export async function suggestAlternatives(resourceType, startAt, endAt, excludeResId) {
    // Requires a dedicated backend endpoint for global availability checking,
    // which is not exposed to non-admin users for privacy reasons.
    return [];
}

