from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.utils import timezone
from datetime import timedelta
from booking_api.models import Role, User, Resource, Booking

class BookingAPITests(APITestCase):
    def setUp(self):
        # Create Roles
        self.faculty_role = Role.objects.create(role_name='Faculty')
        self.admin_role = Role.objects.create(role_name='Admin', can_override=True)
        
        # Create Users
        self.faculty_user = User.objects.create_user(email='faculty@test.com', name='Faculty User', role=self.faculty_role, password='password123')
        self.admin_user = User.objects.create_user(email='admin@test.com', name='Admin User', role=self.admin_role, password='password123')
        
        # Create Resource
        self.lab = Resource.objects.create(room_code='MB 409', resource_type='Lab', status='ACTIVE')
        
        # Base Times
        self.start = timezone.now() + timedelta(days=2)
        self.start = self.start.replace(hour=10, minute=0, second=0, microsecond=0)
        self.end = self.start + timedelta(hours=2)

    def test_authentication_required(self):
        url = reverse('booking-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_submit_booking_api(self):
        # Obtain JWT
        login_url = reverse('token_obtain_pair')
        resp = self.client.post(login_url, {'email': 'faculty@test.com', 'password': 'password123'})
        token = resp.data['access']
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + token)
        
        url = reverse('booking-list')
        data = {
            'resource_id': self.lab.resource_id,
            'booking_type': 'ACADEMIC',
            'start_at': self.start.isoformat(),
            'end_at': self.end.isoformat(),
            'purpose': 'Test API Booking'
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'PENDING')
        self.assertEqual(Booking.objects.count(), 1)

    def test_admin_approval_permissions(self):
        # Create a pending booking
        booking = Booking.objects.create(
            resource=self.lab, requested_by=self.faculty_user, booking_type='ACADEMIC',
            start_at=self.start, end_at=self.end, status='PENDING'
        )
        
        # Faculty tries to approve
        login_url = reverse('token_obtain_pair')
        resp = self.client.post(login_url, {'email': 'faculty@test.com', 'password': 'password123'})
        faculty_token = resp.data['access']
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + faculty_token)
        
        url = reverse('booking-approve', args=[booking.booking_id])
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        # Admin tries to approve
        resp = self.client.post(login_url, {'email': 'admin@test.com', 'password': 'password123'})
        admin_token = resp.data['access']
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + admin_token)
        
        response = self.client.post(url, {'note': 'Looks good'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.status, 'APPROVED')
        self.assertEqual(booking.approved_by, self.admin_user)
