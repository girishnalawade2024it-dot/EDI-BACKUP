import os
import django
from datetime import timedelta
import random

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'edi_backend.settings')
django.setup()

from django.utils import timezone
from booking_api.models import Role, User, Resource, Booking, AuditLog, Notification
from booking_api import services

def generate_data():
    print("Generating dummy data...")
    
    faculty = User.objects.get(email='anjali.deshmukh@college.edu')
    admin = User.objects.get(email='admin@college.edu')
    lab_asst = User.objects.get(email='amit.patil@college.edu')
    
    # 1. Generate Resources
    rooms = [
        ('MB 403', 'Classroom', 60, 'MB'),
        ('MB 404', 'Classroom', 60, 'MB'),
        ('MB 405', 'Lab', 40, 'MB'),
        ('MB 406', 'Lab', 40, 'MB'),
        ('NB 101', 'Classroom', 120, 'NB'),
        ('NB 102', 'Seminar Hall', 200, 'NB'),
        ('NB 103', 'Auditorium', 500, 'NB'),
        ('LIB 201', 'Meeting Room', 20, 'LIB'),
        ('LIB 202', 'Meeting Room', 20, 'LIB'),
        ('CS 301', 'Lab', 80, 'CS'),
        ('CS 302', 'Lab', 80, 'CS'),
        ('CS 303', 'Classroom', 70, 'CS'),
    ]
    
    for code, rtype, cap, block in rooms:
        Resource.objects.get_or_create(
            room_code=code,
            defaults={'resource_type': rtype, 'capacity': cap, 'block': block, 'status': 'ACTIVE'}
        )
    
    resources = list(Resource.objects.filter(status='ACTIVE'))
    
    # 2. Generate Bookings (Past & Future)
    now = timezone.now()
    
    booking_scenarios = [
        # (days_offset, status, who)
        (-5, 'APPROVED', faculty),
        (-3, 'APPROVED', faculty),
        (-2, 'DENIED', faculty),
        (-1, 'CANCELLED', faculty),
        (0, 'APPROVED', faculty),
        (1, 'PENDING', faculty),
        (2, 'APPROVED', faculty),
        (3, 'PENDING', faculty),
        (5, 'APPROVED', faculty),
        (7, 'PENDING', faculty),
        
        # Lab asst bookings
        (-4, 'APPROVED', lab_asst),
        (1, 'APPROVED', lab_asst),
        (4, 'PENDING', lab_asst),
    ]
    
    types = ['Academic Lecture', 'Guest Lecture', 'Lab Session', 'Club Activity', 'Exam', 'Meeting']
    
    count = 0
    for days_offset, status, user in booking_scenarios:
        # Generate 2-3 bookings per scenario for volume
        for i in range(random.randint(2, 4)):
            res = random.choice(resources)
            start_hour = random.randint(9, 15)
            duration = random.randint(1, 3)
            
            start_time = now.replace(hour=start_hour, minute=0, second=0, microsecond=0) + timedelta(days=days_offset)
            end_time = start_time + timedelta(hours=duration)
            
            # Avoid direct overlap generation by simple try-catch and randomness
            try:
                booking = Booking.objects.create(
                    resource=res,
                    requested_by=user,
                    booking_type=random.choice(types),
                    start_at=start_time,
                    end_at=end_time,
                    purpose=f"Dummy purpose for {status} booking generated randomly.",
                    headcount=random.randint(10, res.capacity),
                    status='PENDING' # start as pending
                )
                
                AuditLog.objects.create(
                    event_type='BOOKING_CREATED',
                    actor_user=user,
                    target_entity_type='BOOKING',
                    target_entity_id=booking.booking_id,
                    booking=booking,
                    resource=res,
                    new_state='PENDING',
                    reason='Created'
                )
                
                if status == 'APPROVED':
                    booking.status = 'APPROVED'
                    booking.approved_by = admin
                    booking.decision_note = 'Looks good.'
                    booking.decided_at = start_time - timedelta(days=1)
                    booking.save()
                    AuditLog.objects.create(
                        event_type='BOOKING_APPROVED', actor_user=admin, target_entity_type='BOOKING', 
                        target_entity_id=booking.booking_id, booking=booking, resource=res, previous_state='PENDING', new_state='APPROVED', reason='Looks good.'
                    )
                elif status == 'DENIED':
                    booking.status = 'DENIED'
                    booking.approved_by = admin
                    booking.decision_reason = 'SLOT_TAKEN'
                    booking.decided_at = start_time - timedelta(days=1)
                    booking.save()
                    AuditLog.objects.create(
                        event_type='BOOKING_DENIED', actor_user=admin, target_entity_type='BOOKING', 
                        target_entity_id=booking.booking_id, booking=booking, resource=res, previous_state='PENDING', new_state='DENIED', reason='SLOT_TAKEN'
                    )
                elif status == 'CANCELLED':
                    booking.status = 'CANCELLED'
                    booking.cancelled_at = start_time - timedelta(days=1)
                    booking.save()
                
                count += 1
            except Exception as e:
                pass
                
    # Also generate some notifications
    for i in range(5):
        Notification.objects.create(
            user=faculty,
            type='SYSTEM_ALERT',
            title='System Maintenance',
            message='The booking portal will undergo maintenance this weekend.',
            is_read=(i % 2 == 0)
        )
        
    print(f"Successfully generated {len(rooms)} resources and {count} bookings with audit logs!")

if __name__ == '__main__':
    generate_data()
