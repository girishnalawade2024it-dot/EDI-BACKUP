import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'edi_backend.settings')
django.setup()

from booking_api.models import Role, User, Resource

def seed():
    # Roles
    faculty_role, _ = Role.objects.get_or_create(role_id=1, defaults={'role_name': 'Faculty'})
    lab_asst_role, _ = Role.objects.get_or_create(role_id=2, defaults={'role_name': 'Lab Assistant'})
    admin_role, _ = Role.objects.get_or_create(role_id=3, defaults={'role_name': 'Admin'})

    # Users
    faculty, _ = User.objects.get_or_create(
        email='anjali.deshmukh@college.edu',
        defaults={'name': 'Dr. Anjali Deshmukh', 'role': faculty_role}
    )
    faculty.set_password('demo123')
    faculty.save()

    lab_asst, _ = User.objects.get_or_create(
        email='amit.patil@college.edu',
        defaults={'name': 'Amit Patil', 'role': lab_asst_role}
    )
    lab_asst.set_password('demo123')
    lab_asst.save()

    admin, _ = User.objects.get_or_create(
        email='admin@college.edu',
        defaults={'name': 'Admin User', 'role': admin_role}
    )
    admin.set_password('demo123')
    admin.save()

    # Resources
    Resource.objects.get_or_create(
        room_code='MB 409',
        defaults={'resource_type': 'Lab', 'block': 'MB', 'capacity': 60, 'status': 'ACTIVE'}
    )
    Resource.objects.get_or_create(
        room_code='MB 402',
        defaults={'resource_type': 'Classroom', 'block': 'MB', 'capacity': 80, 'status': 'ACTIVE'}
    )

    print("Database seeded with demo users successfully. Passwords are set to 'demo123'.")

if __name__ == '__main__':
    seed()
