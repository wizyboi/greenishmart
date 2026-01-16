from rest_framework import status, generics, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth.models import User
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from django_filters.rest_framework import DjangoFilterBackend
import logging

from .models import UserProfile, VerificationCode, Product, Newsletter, Review
from .serializers import (
    UserRegistrationSerializer,
    LoginSerializer,
    VerificationSerializer,
    ProductSerializer,
    NewsletterSerializer,
    ForgotPasswordSerializer,
    ResetCodeVerificationSerializer,
    ResetPasswordSerializer
)
from .utils import api_response, log_error

logger = logging.getLogger('api')

class HealthCheckView(APIView):
    permission_classes = [AllowAny]
    
    def get(self, request):
        return api_response(
            message='GreenishMart API is running',
            data={
                'status': 'healthy',
                'timestamp': timezone.now().isoformat()
            }
        )


class RegisterView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        try:
            logger.info(f"Registration request received for {request.data.get('email')}")
            serializer = UserRegistrationSerializer(data=request.data)
            
            if serializer.is_valid():
                user = serializer.save()
                
                
                return api_response(
                    ok=True,
                    message='Verification code sent. Please check your email to complete registration.',
                    data={'email': user.email, 'status': 'unverified'},
                    status_code=status.HTTP_201_CREATED
                )
            
            return api_response(
                ok=False,
                message='Registration failed',
                errors=serializer.errors,
                status_code=status.HTTP_400_BAD_REQUEST
            )
            
        except Exception as e:
            log_error('RegisterView', e)
            return api_response(
                ok=False,
                message=f'Server error: {str(e)}',
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class LoginView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        
        if serializer.is_valid():
            user = serializer.validated_data['user']
            refresh = RefreshToken.for_user(user)
            
            email_verified = user.profile.email_verified if hasattr(user, 'profile') else False
            
            if not email_verified:
                return api_response(
                    ok=False,
                    message='Email not verified',
                    status_code=status.HTTP_401_UNAUTHORIZED
                )

            return api_response(
                message='Login successful',
                data={
                    'user': {
                        'firstName': user.first_name,
                        'lastName': user.last_name,
                        'email': user.email,
                        'email_verified': email_verified
                    },
                    'token': str(refresh.access_token),
                    'refresh': str(refresh)
                }
            )
        
        return api_response(
            ok=False,
            message='Invalid credentials',
            errors=serializer.errors,
            status_code=status.HTTP_401_UNAUTHORIZED
        )


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = VerificationSerializer(data=request.data)
        
        if serializer.is_valid():
            user = serializer.validated_data['user']
            verification_code = serializer.validated_data['verification_code']
            
            if hasattr(user, 'profile'):
                user.profile.email_verified = True
                user.profile.save()
            
            verification_code.mark_as_used()
            refresh = RefreshToken.for_user(user)
            
            return api_response(
                message='Email verified successfully',
                data={
                    'user': {
                        'firstName': user.first_name,
                        'lastName': user.last_name,
                        'email': user.email,
                    },
                    'token': str(refresh.access_token)
                }
            )
        
        return api_response(
            ok=False,
            message='Verification failed',
            errors=serializer.errors,
            status_code=status.HTTP_400_BAD_REQUEST
        )


class ResendVerificationView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        email = request.data.get('email')
        
        if not email:
            return api_response(ok=False, message='Email is required', status_code=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return api_response(ok=False, message='User not found', status_code=status.HTTP_404_NOT_FOUND)
        
        if hasattr(user, 'profile') and user.profile.email_verified:
            return api_response(ok=False, message='Email already verified', status_code=status.HTTP_400_BAD_REQUEST)
        
        code, _ = VerificationCode.generate_code(user, code_type='email')
        
        try:
            subject = f'GreenishMart Verification Code - {timezone.now().strftime("%H:%M:%S")}'
            message = f'Hello {user.first_name},\n\nYour verification code is: {code}\n\nThis code expires in 10 minutes.'
            send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)
            
            
            return api_response(message='Verification code resent')
        except Exception as e:
            log_error('ResendVerificationView', e)
            return api_response(ok=False, message='Failed to send email', status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            user = User.objects.get(email=email)
            
            code, _ = VerificationCode.generate_code(user, code_type='password')
            
            # Send SMS or Email. Here we use Email as it's easier to set up but frontend says SMS.
            # We'll send email but return success as "smsSent" if needed by frontend
            try:
                from django.template.loader import render_to_string
                from django.core.mail import EmailMultiAlternatives
                
                subject = f'Password Reset Code - GreenishMart'
                text_message = f'Hello {user.first_name},\n\nYour password reset code is: {code}\n\nThis code expires in 10 minutes.'
                
                # HTML version
                try:
                    html_message = render_to_string('emails/password_reset_email.html', {
                        'code': code,
                        'first_name': user.first_name,
                        'expiry_minutes': 10
                    })
                    
                    email_msg = EmailMultiAlternatives(
                        subject=subject,
                        body=text_message,
                        from_email=settings.DEFAULT_FROM_EMAIL,
                        to=[user.email]
                    )
                    email_msg.attach_alternative(html_message, "text/html")
                    email_msg.send(fail_silently=False)
                    print(f"✉️ HTML Reset Email sent successfully to {user.email}")
                except Exception as e:
                    print(f"⚠️ HTML Reset Email failed, falling back to plain text: {e}")
                    send_mail(subject, text_message, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)
                    print(f"✉️ Plain-text Reset Email sent successfully to {user.email}")

                return api_response(
                    message='Reset code sent successfully',
                    data={'smsSent': False}  # Changed to False since it's email now, but keeps the key for compatibility
                )
            except Exception as e:
                log_error('ForgotPasswordView', e)
                return api_response(ok=False, message='Failed to send reset code', status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        return api_response(ok=False, message='Invalid data', errors=serializer.errors, status_code=status.HTTP_400_BAD_REQUEST)


class VerifyResetCodeView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = ResetCodeVerificationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            verification_code = serializer.validated_data['verification_code']
            
            # Mark code as used
            verification_code.mark_as_used()
            
            # Generate a reset token
            import secrets
            token = secrets.token_urlsafe(32)
            
            # Save token to profile
            if hasattr(user, 'profile'):
                user.profile.reset_token = token
                user.profile.save()
            
            return api_response(
                message='Code verified successfully',
                data={'resetToken': token}
            )
            
        return api_response(ok=False, message='Invalid code', errors=serializer.errors, status_code=status.HTTP_400_BAD_REQUEST)


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            new_password = serializer.validated_data['newPassword']
            
            # Set new password
            user.set_password(new_password)
            user.save()
            
            # Clear reset token
            if hasattr(user, 'profile'):
                user.profile.reset_token = None
                user.profile.save()
                
            return api_response(message='Password reset successfully')
            
        return api_response(ok=False, message='Failed to reset password', errors=serializer.errors, status_code=status.HTTP_400_BAD_REQUEST)


class ProductListView(generics.ListCreateAPIView):
    """
    Advanced Product List view with filtering, searching and ordering
    """
    queryset = Product.objects.all().order_by('-created_at')
    serializer_class = ProductSerializer
    
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated()]
        return [AllowAny()]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'location']
    search_fields = ['name', 'description']
    ordering_fields = ['price', 'created_at']

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            paginated_data = self.get_paginated_response(serializer.data).data
            return api_response(
                message="Products retrieved successfully",
                data=paginated_data
            )

        serializer = self.get_serializer(queryset, many=True)
        return api_response(
            message="Products retrieved successfully",
            data={'results': serializer.data}
        )

    def create(self, request, *args, **kwargs):
        try:
            serializer = self.get_serializer(data=request.data)
            if serializer.is_valid():
                self.perform_create(serializer)
                return api_response(
                    message="Product posted successfully",
                    data=serializer.data,
                    status_code=status.HTTP_201_CREATED
                )
            return api_response(
                ok=False,
                message="Failed to post product",
                errors=serializer.errors,
                status_code=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            log_error("ProductListView.create", e)
            return api_response(
                ok=False,
                message=f"Server error during upload: {str(e)}",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def perform_create(self, serializer):
        if self.request.user.is_authenticated:
            serializer.save(seller=self.request.user)
        else:
            serializer.save()


class LikeProductView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request, pk):
        try:
            product = Product.objects.get(pk=pk)
            product.likes += 1
            product.save()
            return api_response(message='Product liked', data={'likes': product.likes})
        except Product.DoesNotExist:
            return api_response(ok=False, message='Product not found', status_code=status.HTTP_404_NOT_FOUND)


class AddReviewView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, pk):
        try:
            product = Product.objects.get(pk=pk)
            rating = request.data.get('rating')
            comment = request.data.get('comment', '')
            
            if not rating or not (1 <= int(rating) <= 5):
                return api_response(ok=False, message='Valid rating (1-5) is required')
            
            # Use get_or_create to update if already exists or create new
            review, created = Review.objects.update_or_create(
                product=product,
                user=request.user,
                defaults={'rating': int(rating), 'comment': comment}
            )
            
            return api_response(
                message='Review submitted successfully',
                data={
                    'averageRating': product.average_rating,
                    'reviewCount': product.review_count
                }
            )
        except Product.DoesNotExist:
            return api_response(ok=False, message='Product not found', status_code=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return api_response(ok=False, message=str(e), status_code=status.HTTP_400_BAD_REQUEST)


class NewsletterView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = NewsletterSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return api_response(message='Subscribed successfully')
        
        # If already exists, we silent fail as "Already subscribed"
        if Newsletter.objects.filter(email=request.data.get('email')).exists():
             return api_response(message='Already subscribed')
             
        return api_response(ok=False, message='Subscription failed', errors=serializer.errors, status_code=status.HTTP_400_BAD_REQUEST)
