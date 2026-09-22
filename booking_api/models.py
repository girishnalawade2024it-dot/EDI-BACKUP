from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone

class Role(models.Model):
    role_id = models.AutoField(primary_key=True)
    role_name = models.CharField(max_length=50)
    can_override = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'roles'

    def __str__(self):
        return self.role_name

class CustomUserManager(BaseUserManager):
    def create_user(self, email, name, role, password=None, **extra_fields):
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, name=name, role=role, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, name, password=None, **extra_fields):
        # We need a fallback role for superusers if it doesn't exist
        role, _ = Role.objects.get_or_create(role_name='SuperAdmin', defaults={'can_override': True})
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, name, role, password, **extra_fields)

class User(AbstractBaseUser, PermissionsMixin):
    user_id = models.AutoField(primary_key=True)
    role = models.ForeignKey(Role, on_delete=models.RESTRICT, db_column='role_id')
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True, max_length=150)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    objects = CustomUserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']

    class Meta:
        db_table = 'users'

    def __str__(self):
        return self.name

class Resource(models.Model):
    resource_id = models.AutoField(primary_key=True)
    room_code = models.CharField(max_length=50)
    resource_type = models.CharField(max_length=50)
    block = models.CharField(max_length=50, null=True, blank=True)
    has_machines = models.BooleanField(default=False)
    capacity = models.IntegerField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=30)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'resources'

    def __str__(self):
        return self.room_code

class Booking(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('DENIED', 'Denied'),
        ('CANCELLED', 'Cancelled'),
        ('PREEMPTED', 'Preempted'),
        ('COMPLETED', 'Completed'),
    ]

    booking_id = models.AutoField(primary_key=True)
    resource = models.ForeignKey(Resource, on_delete=models.RESTRICT, db_column='resource_id', related_name='bookings')
    requested_by = models.ForeignKey(User, on_delete=models.RESTRICT, db_column='requested_by', related_name='requested_bookings')
    approved_by = models.ForeignKey(User, on_delete=models.RESTRICT, db_column='approved_by', null=True, blank=True, related_name='approved_bookings')
    booking_type = models.CharField(max_length=50)
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    purpose = models.TextField(null=True, blank=True)
    headcount = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='PENDING')
    decision_reason = models.TextField(null=True, blank=True)
    decision_note = models.TextField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    series_id = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bookings'
        
    def __str__(self):
        return f"Booking {self.booking_id} - {self.resource.room_code}"

class AuditLog(models.Model):
    audit_id = models.AutoField(primary_key=True)
    event_type = models.CharField(max_length=50)
    actor_user = models.ForeignKey(User, on_delete=models.RESTRICT, db_column='actor_user_id')
    target_entity_type = models.CharField(max_length=50, null=True, blank=True)
    target_entity_id = models.IntegerField(null=True, blank=True)
    booking = models.ForeignKey(Booking, on_delete=models.SET_NULL, null=True, blank=True, db_column='booking_id')
    resource = models.ForeignKey(Resource, on_delete=models.SET_NULL, null=True, blank=True, db_column='resource_id')
    previous_state = models.TextField(null=True, blank=True)
    new_state = models.TextField(null=True, blank=True)
    reason = models.TextField(null=True, blank=True)
    transaction_id = models.CharField(max_length=100, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'audit_logs'

class Notification(models.Model):
    notification_id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id', related_name='notifications')
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, null=True, blank=True, db_column='booking_id')
    type = models.CharField(max_length=50)
    title = models.CharField(max_length=150)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'notifications'
