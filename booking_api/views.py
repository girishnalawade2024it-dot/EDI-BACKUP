from rest_framework import viewsets, permissions, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import Role, User, Resource, Booking, AuditLog, Notification
from .serializers import (
    RoleSerializer, UserSerializer, ResourceSerializer, 
    BookingSerializer, AuditLogSerializer, NotificationSerializer
)
from . import services
from .services import BookingServiceError

# Custom Permissions
class IsAdminRole(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role.role_name in ['Admin', 'SuperAdmin'])

class ResourceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Resource.objects.filter(status='ACTIVE')
    serializer_class = ResourceSerializer
    permission_classes = [permissions.IsAuthenticated]

class BookingViewSet(mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    queryset = Booking.objects.all()
    serializer_class = BookingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Filtering based on role
        user = self.request.user
        if user.role.role_name == 'Admin':
            return Booking.objects.all()
        return Booking.objects.filter(requested_by=user)

    def create(self, request, *args, **kwargs):
        from django.utils.dateparse import parse_datetime
        from django.utils.timezone import make_aware, is_naive
        try:
            start_at = parse_datetime(request.data.get('start_at'))
            end_at = parse_datetime(request.data.get('end_at'))
            
            if not start_at or not end_at:
                return Response({"error": "Please provide valid start and end times."}, status=status.HTTP_400_BAD_REQUEST)
                
            if is_naive(start_at):
                start_at = make_aware(start_at)
            if is_naive(end_at):
                end_at = make_aware(end_at)
                
            booking, has_conflict = services.submit_booking(
                user=request.user,
                resource_id=request.data.get('resource_id'),
                booking_type=request.data.get('booking_type'),
                start_at=start_at,
                end_at=end_at,
                purpose=request.data.get('purpose'),
                headcount=request.data.get('headcount')
            )
            serializer = self.get_serializer(booking)
            data = serializer.data
            data['has_pending_conflict'] = has_conflict
            return Response(data, status=status.HTTP_201_CREATED)
        except BookingServiceError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({"error": "Oops! We encountered an unexpected problem while saving your booking. Please check your inputs and try again."}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminRole])
    def approve(self, request, pk=None):
        try:
            booking = services.approve_booking(
                booking_id=pk, 
                admin_user=request.user, 
                note=request.data.get('note', '')
            )
            return Response(self.get_serializer(booking).data)
        except BookingServiceError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({"error": "We couldn't approve this booking right now. Please try again."}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminRole])
    def deny(self, request, pk=None):
        try:
            booking = services.deny_booking(
                booking_id=pk, 
                admin_user=request.user, 
                reason=request.data.get('reason', ''),
                note=request.data.get('note', '')
            )
            return Response(self.get_serializer(booking).data)
        except BookingServiceError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({"error": "We couldn't deny this booking right now. Please try again."}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        try:
            booking = services.cancel_booking(booking_id=pk, user=request.user)
            return Response(self.get_serializer(booking).data)
        except BookingServiceError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({"error": "We couldn't cancel this booking. It might already be processed."}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminRole])
    def preempt(self, request, pk=None):
        try:
            booking = services.preempt_booking(
                booking_id=pk, 
                admin_user=request.user, 
                reason=request.data.get('reason', '')
            )
            return Response(self.get_serializer(booking).data)
        except BookingServiceError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({"error": "We couldn't preempt this booking. Please ensure it is still active and try again."}, status=status.HTTP_400_BAD_REQUEST)

class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notif = self.get_object()
        notif.is_read = True
        notif.read_at = timezone.now()
        notif.save()
        return Response({'success': True})

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        Notification.objects.filter(user=request.user, is_read=False).update(
            is_read=True, read_at=timezone.now()
        )
        return Response({'success': True})

class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminRole]
