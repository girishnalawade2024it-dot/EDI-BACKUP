from rest_framework import serializers
from .models import Role, User, Resource, Booking, AuditLog, Notification

class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = '__all__'

class UserSerializer(serializers.ModelSerializer):
    role = RoleSerializer(read_only=True)
    role_id = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(), source='role', write_only=True
    )
    
    class Meta:
        model = User
        fields = ['user_id', 'email', 'name', 'role', 'role_id', 'last_login', 'created_at']

class ResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resource
        fields = '__all__'

class BookingSerializer(serializers.ModelSerializer):
    resource = ResourceSerializer(read_only=True)
    requested_by = UserSerializer(read_only=True)
    approved_by = UserSerializer(read_only=True)
    
    class Meta:
        model = Booking
        fields = '__all__'

class AuditLogSerializer(serializers.ModelSerializer):
    actor_user = UserSerializer(read_only=True)
    
    class Meta:
        model = AuditLog
        fields = '__all__'

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = '__all__'

from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        
        user = self.user
        data['user'] = {
            'userId': user.user_id,
            'email': user.email,
            'name': user.name,
            'role': user.role.role_name,
            'role_id': user.role.role_id,
            'can_override': user.role.can_override,
        }
        return data
