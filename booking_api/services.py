from django.db import transaction
from django.utils import timezone
from .models import Booking, AuditLog, Notification, Resource

class BookingServiceError(Exception):
    pass

def check_overlap(resource_id, start_at, end_at):
    """
    Checks for overlapping APPROVED or PENDING bookings.
    Interval overlap rule (half-open): A.start_at < B.end_at AND A.end_at > B.start_at
    """
    overlapping = Booking.objects.filter(
        resource_id=resource_id,
        status__in=['APPROVED', 'PENDING'],
        start_at__lt=end_at,
        end_at__gt=start_at
    )
    approved = overlapping.filter(status='APPROVED')
    pending = overlapping.filter(status='PENDING')
    return approved, pending

@transaction.atomic
def submit_booking(user, resource_id, booking_type, start_at, end_at, purpose, headcount=None):
    if end_at <= start_at:
        raise BookingServiceError("End time must be after start time.")
    if start_at <= timezone.now():
        raise BookingServiceError("Booking must be in the future.")
        
    duration_hrs = (end_at - start_at).total_seconds() / 3600
    if duration_hrs > 4:
        raise BookingServiceError("Maximum booking duration is 4 hours.")
        
    # Check operating hours (08:00 - 18:00) using local time component
    # Ignoring for simplicity in this port, or we can enforce it.
    
    # Overlap Check
    approved, pending = check_overlap(resource_id, start_at, end_at)
    if approved.exists():
        raise BookingServiceError("This slot is already booked.")
        
    has_pending_conflict = pending.exists()
        
    booking = Booking.objects.create(
        resource_id=resource_id,
        requested_by=user,
        booking_type=booking_type,
        start_at=start_at,
        end_at=end_at,
        purpose=purpose,
        headcount=headcount,
        status='PENDING'
    )
    
    AuditLog.objects.create(
        event_type='BOOKING_CREATED',
        actor_user=user,
        target_entity_type='BOOKING',
        target_entity_id=booking.booking_id,
        booking=booking,
        resource_id=resource_id,
        new_state='PENDING',
        reason='New booking request created'
    )
    
    # Normally we would notify admins here
    return booking, has_pending_conflict

@transaction.atomic
def approve_booking(booking_id, admin_user, note=''):
    try:
        # Use select_for_update to strictly prevent concurrent double approvals
        booking = Booking.objects.select_for_update().get(booking_id=booking_id)
    except Booking.DoesNotExist:
        raise BookingServiceError("Booking not found.")
        
    if booking.status != 'PENDING':
        raise BookingServiceError("Booking is not PENDING.")
        
    # Re-check overlap inside the transaction lock
    approved, _ = check_overlap(booking.resource_id, booking.start_at, booking.end_at)
    # Exclude current booking just in case
    if approved.exclude(booking_id=booking_id).exists():
        raise BookingServiceError("Cannot approve: slot is now taken by another approved booking.")
        
    booking.status = 'APPROVED'
    booking.approved_by = admin_user
    booking.decision_note = note
    booking.decided_at = timezone.now()
    booking.save()
    
    AuditLog.objects.create(
        event_type='BOOKING_APPROVED',
        actor_user=admin_user,
        target_entity_type='BOOKING',
        target_entity_id=booking_id,
        booking=booking,
        resource_id=booking.resource_id,
        previous_state='PENDING',
        new_state='APPROVED',
        reason=note or 'Approved by admin'
    )
    
    Notification.objects.create(
        user=booking.requested_by,
        booking=booking,
        type='BOOKING_APPROVED',
        title='Booking Approved',
        message=f'Your booking #{booking_id} has been approved!'
    )
    
    return booking

@transaction.atomic
def deny_booking(booking_id, admin_user, reason, note=''):
    booking = Booking.objects.get(booking_id=booking_id)
    if booking.status != 'PENDING':
        raise BookingServiceError("Booking is not PENDING.")
        
    booking.status = 'DENIED'
    booking.approved_by = admin_user
    booking.decision_reason = reason
    booking.decision_note = note
    booking.decided_at = timezone.now()
    booking.save()
    
    AuditLog.objects.create(
        event_type='BOOKING_DENIED',
        actor_user=admin_user,
        target_entity_type='BOOKING',
        target_entity_id=booking_id,
        booking=booking,
        resource_id=booking.resource_id,
        previous_state='PENDING',
        new_state='DENIED',
        reason=reason
    )
    
    Notification.objects.create(
        user=booking.requested_by,
        booking=booking,
        type='BOOKING_DENIED',
        title='Booking Denied',
        message=f'Your booking #{booking_id} was denied. Reason: {reason}'
    )
    
    return booking

@transaction.atomic
def cancel_booking(booking_id, user):
    booking = Booking.objects.get(booking_id=booking_id)
    if booking.requested_by != user:
        raise BookingServiceError("You can only cancel your own bookings.")
        
    if booking.status not in ['PENDING', 'APPROVED']:
        raise BookingServiceError(f"Cannot cancel a {booking.status} booking.")
        
    if booking.status == 'APPROVED':
        hours_until_start = (booking.start_at - timezone.now()).total_seconds() / 3600
        if hours_until_start < 2:
            raise BookingServiceError("Approved bookings can only be cancelled at least 2 hours before start.")
            
    previous_state = booking.status
    booking.status = 'CANCELLED'
    booking.cancelled_at = timezone.now()
    booking.save()
    
    AuditLog.objects.create(
        event_type='BOOKING_CANCELLED',
        actor_user=user,
        target_entity_type='BOOKING',
        target_entity_id=booking_id,
        booking=booking,
        resource_id=booking.resource_id,
        previous_state=previous_state,
        new_state='CANCELLED',
        reason='Cancelled by requester'
    )
    
    Notification.objects.create(
        user=user,
        booking=booking,
        type='BOOKING_CANCELLED',
        title='Booking Cancelled',
        message=f'Your booking #{booking_id} has been cancelled.'
    )
    
    return booking

@transaction.atomic
def preempt_booking(booking_id, admin_user, reason):
    booking = Booking.objects.get(booking_id=booking_id)
    if booking.status != 'APPROVED':
        raise BookingServiceError("Only APPROVED bookings can be preempted.")
        
    booking.status = 'PREEMPTED'
    booking.approved_by = admin_user
    booking.decision_reason = reason
    booking.decided_at = timezone.now()
    booking.save()
    
    AuditLog.objects.create(
        event_type='BOOKING_PREEMPTED',
        actor_user=admin_user,
        target_entity_type='BOOKING',
        target_entity_id=booking_id,
        booking=booking,
        resource_id=booking.resource_id,
        previous_state='APPROVED',
        new_state='PREEMPTED',
        reason=reason
    )
    
    Notification.objects.create(
        user=booking.requested_by,
        booking=booking,
        type='BOOKING_PREEMPTED',
        title='Booking Preempted',
        message=f'Your booking #{booking_id} was preempted by admin. Reason: {reason}'
    )
    
    return booking
