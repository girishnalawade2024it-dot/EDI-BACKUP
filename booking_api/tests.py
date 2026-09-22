from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from booking_api.models import Role, User, Resource, Booking, AuditLog
from booking_api.services import submit_booking, approve_booking, BookingServiceError
import threading

class BookingLogicTests(TestCase):
    def setUp(self):
        # Create Roles
        self.faculty_role = Role.objects.create(role_name='Faculty')
        self.admin_role = Role.objects.create(role_name='Admin', can_override=True)
        
        # Create Users
        self.user1 = User.objects.create_user(email='user1@test.com', name='User 1', role=self.faculty_role, password='password')
        self.user2 = User.objects.create_user(email='user2@test.com', name='User 2', role=self.faculty_role, password='password')
        self.admin = User.objects.create_user(email='admin@test.com', name='Admin', role=self.admin_role, password='password')
        
        # Create Resource
        self.lab = Resource.objects.create(room_code='MB 409', resource_type='Lab', status='ACTIVE')
        
        # Base Times (Future)
        self.start = timezone.now() + timedelta(days=1)
        self.start = self.start.replace(hour=10, minute=0, second=0, microsecond=0)
        self.end = self.start + timedelta(hours=2)
        self.end_overlap = self.start + timedelta(hours=1)

    def test_submit_valid_booking(self):
        booking, conflict = submit_booking(self.user1, self.lab.resource_id, 'ACADEMIC', self.start, self.end, 'Test')
        self.assertEqual(booking.status, 'PENDING')
        self.assertFalse(conflict)
        self.assertEqual(AuditLog.objects.count(), 1)

    def test_submit_overlapping_approved_fails(self):
        # Create an approved booking
        booking1, _ = submit_booking(self.user1, self.lab.resource_id, 'ACADEMIC', self.start, self.end, 'Test 1')
        approve_booking(booking1.booking_id, self.admin)
        
        # Try to submit overlapping
        with self.assertRaisesMessage(BookingServiceError, "This slot is already booked."):
            submit_booking(self.user2, self.lab.resource_id, 'ACADEMIC', self.start, self.end_overlap, 'Test 2')

    def test_prevent_double_booking_approval(self):
        # Create two overlapping PENDING bookings
        b1, _ = submit_booking(self.user1, self.lab.resource_id, 'ACADEMIC', self.start, self.end, 'Test 1')
        b2, _ = submit_booking(self.user2, self.lab.resource_id, 'ACADEMIC', self.start, self.end_overlap, 'Test 2')
        
        # Approve first
        approve_booking(b1.booking_id, self.admin)
        
        # Attempt to approve second
        with self.assertRaisesMessage(BookingServiceError, "Cannot approve: slot is now taken by another approved booking."):
            approve_booking(b2.booking_id, self.admin)
            
    def test_cancel_cutoff(self):
        booking, _ = submit_booking(self.user1, self.lab.resource_id, 'ACADEMIC', self.start, self.end, 'Test 1')
        approve_booking(booking.booking_id, self.admin)
        
        # Fast forward time to < 2 hours before start
        # To test this we'd need to mock timezone.now() or create a booking that starts soon
        start_soon = timezone.now() + timedelta(hours=1)
        end_soon = start_soon + timedelta(hours=1)
        booking2 = Booking.objects.create(
            resource=self.lab, requested_by=self.user1, booking_type='ACADEMIC',
            start_at=start_soon, end_at=end_soon, status='APPROVED'
        )
        
        from booking_api.services import cancel_booking
        with self.assertRaisesMessage(BookingServiceError, "Approved bookings can only be cancelled at least 2 hours before start."):
            cancel_booking(booking2.booking_id, self.user1)
