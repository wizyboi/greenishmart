from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
import datetime
import logging

from .models import UserProfile, VerificationCode, Product, Newsletter, Review, ExchangeRate
from decimal import Decimal

logger = logging.getLogger('api')


class UserRegistrationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, validators=[validate_password])
    first_name = serializers.CharField(max_length=30, required=False)
    last_name = serializers.CharField(max_length=30, required=False)
    firstName = serializers.CharField(max_length=30, write_only=True, required=False)  # Accept camelCase
    lastName = serializers.CharField(max_length=30, write_only=True, required=False)   # Accept camelCase
    phone = serializers.CharField(required=False, allow_blank=True)
    newsletter_subscribed = serializers.BooleanField(default=False)
    
    def validate(self, attrs):
        # Map camelCase to snake_case
        if 'firstName' in attrs and 'first_name' not in attrs:
            attrs['first_name'] = attrs.pop('firstName')
        if 'lastName' in attrs and 'last_name' not in attrs:
            attrs['last_name'] = attrs.pop('lastName')
        
        # Validate required fields
        if not attrs.get('first_name'):
            raise serializers.ValidationError({'first_name': 'This field is required.'})
        if not attrs.get('last_name'):
            raise serializers.ValidationError({'last_name': 'This field is required.'})
        
        return attrs
    
    def validate_email(self, value):
        # Check if email already exists and is verified
        if User.objects.filter(email=value).exists():
            user = User.objects.get(email=value)
            if hasattr(user, 'profile') and user.profile.email_verified:
                raise serializers.ValidationError("Email already registered.")
        return value
    
    def create(self, validated_data):
        email = validated_data['email']
        
        # Check if user exists but is not verified
        try:
            user = User.objects.get(email=email)
            if hasattr(user, 'profile') and not user.profile.email_verified:
                # Update existing unverified user
                user.first_name = validated_data.get('first_name', user.first_name)
                user.last_name = validated_data.get('last_name', user.last_name)
                user.set_password(validated_data['password'])
                user.save()
                
                # Update profile
                user.profile.phone = validated_data.get('phone', '')
                user.profile.newsletter_subscribed = validated_data.get('newsletter_subscribed', False)
                user.profile.save()
            else:
                raise serializers.ValidationError({"email": "Email already registered."})
        except User.DoesNotExist:
            # Create new user
            user = User.objects.create_user(
                username=email,  # Use email as username
                email=email,
                password=validated_data['password'],
                first_name=validated_data['first_name'],
                last_name=validated_data['last_name']
            )
            
            # Update profile (created by signals)
            user.profile.phone = validated_data.get('phone', '')
            user.profile.newsletter_subscribed = validated_data.get('newsletter_subscribed', False)
            user.profile.save()
        
        # Generate verification code
        code, _ = VerificationCode.generate_code(user)
        
        # Send email
        self.send_verification_email(user.email, user.first_name, code)
        
        return user
    
    def send_verification_email(self, email, first_name, code):
        from django.template.loader import render_to_string
        from django.core.mail import EmailMultiAlternatives
        
        # Validate SMTP configuration
        if not settings.EMAIL_HOST_USER or not settings.EMAIL_HOST_PASSWORD:
            logger.error(f"❌ EMAIL SMTP Credentials Not Configured: EMAIL_HOST_USER={settings.EMAIL_HOST_USER}, EMAIL_HOST_PASSWORD={bool(settings.EMAIL_HOST_PASSWORD)}")
            raise ValueError("Email SMTP credentials not configured in environment variables")
        
        subject = f'Verify Your Email - GreenishMart - {timezone.now().strftime("%H:%M:%S")}'
        
        # Plain text version (fallback)
        text_message = f"""
Welcome to GreenishMart!

Your verification code is: {code}

This code will expire in 10 minutes.

If you didn't create an account with GreenishMart, please ignore this email.

Best regards,
The GreenishMart Team
"""
        
        logger.info(f"📧 Preparing to send verification email to {email} from {settings.DEFAULT_FROM_EMAIL}")
        logger.debug(f"EMAIL_BACKEND={settings.EMAIL_BACKEND}")
        logger.debug(f"EMAIL_HOST={settings.EMAIL_HOST}")
        logger.debug(f"EMAIL_PORT={settings.EMAIL_PORT}")
        logger.debug(f"EMAIL_USE_TLS={settings.EMAIL_USE_TLS}")
        
        # HTML version (with template)
        try:
            # Try multiple locations for the template just in case
            template_name = 'emails/verification_email.html'
            html_message = render_to_string(template_name, {
                'code': code,
                'first_name': first_name,
                'expiry_minutes': 10
            })
            
            # Create email with both plain text and HTML
            email_msg = EmailMultiAlternatives(
                subject=subject,
                body=text_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[email]
            )
            email_msg.attach_alternative(html_message, "text/html")
            result = email_msg.send(fail_silently=False)
            
            logger.info(f"✉️ HTML Email sent successfully to {email} using {template_name} (result={result})")
            logger.debug(f"📧 Verification code: {code}")
            return True
        except Exception as e:
            logger.warning(f"⚠️ Template loading or HTML email failed: {e}", exc_info=True)
            # Fallback to plain text if HTML fails
            try:
                result = send_mail(
                    subject,
                    text_message,
                    settings.DEFAULT_FROM_EMAIL,
                    [email],
                    fail_silently=False
                )
                logger.info(f"✉️ Plain-text Fallback Email sent successfully to {email} (result={result})")
                return True
            except Exception as e2:
                logger.error(f"🔥 TOTAL EMAIL FAILURE to {email}: {e2}", exc_info=True)
                raise


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    
    def validate(self, attrs):
        from django.contrib.auth import authenticate
        
        email = attrs.get('email')
        password = attrs.get('password')
        
        try:
            user = User.objects.get(email=email)
            # Authenticate using username (which is email)
            authenticated_user = authenticate(username=user.username, password=password)
            
            if not authenticated_user:
                raise serializers.ValidationError('Invalid email or password.')
            
            attrs['user'] = authenticated_user
            return attrs
        except User.DoesNotExist:
            raise serializers.ValidationError('Invalid email or password.')


class VerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)
    
    def validate(self, attrs):
        email = attrs.get('email')
        code = attrs.get('code')
        
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError({'email': 'User with this email does not exist.'})
        
        try:
            verification_code = VerificationCode.objects.get(
                user=user,
                code=code,
                is_used=False
            )
        except VerificationCode.DoesNotExist:
            raise serializers.ValidationError({'code': 'Invalid verification code.'})
        
        if verification_code.is_expired():
            raise serializers.ValidationError({'code': 'Verification code has expired.'})
        
        attrs['user'] = user
        attrs['verification_code'] = verification_code
        return attrs


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    
    def validate_email(self, value):
        if not User.objects.filter(email=value).exists():
            raise serializers.ValidationError("User with this email does not exist.")
        return value


class ResetCodeVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)
    
    def validate(self, attrs):
        email = attrs.get('email')
        code = attrs.get('code')
        
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError({'email': 'User not found.'})
            
        try:
            verification_code = VerificationCode.objects.get(
                user=user,
                code=code,
                code_type='password',
                is_used=False
            )
        except VerificationCode.DoesNotExist:
            raise serializers.ValidationError({'code': 'Invalid or used code.'})
            
        if verification_code.is_expired():
            raise serializers.ValidationError({'code': 'Code has expired.'})
            
        attrs['user'] = user
        attrs['verification_code'] = verification_code
        return attrs


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    resetToken = serializers.CharField()
    newPassword = serializers.CharField(min_length=8, write_only=True)
    
    def validate(self, attrs):
        email = attrs.get('email')
        token = attrs.get('resetToken')
        
        try:
            user = User.objects.get(email=email)
            if not hasattr(user, 'profile') or user.profile.reset_token != token:
                raise serializers.ValidationError({'resetToken': 'Invalid reset token.'})
            attrs['user'] = user
        except User.DoesNotExist:
            raise serializers.ValidationError({'email': 'User not found.'})
            
        return attrs


class ReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.ReadOnlyField(source='user.first_name')

    class Meta:
        model = Review
        fields = ('id', 'user_name', 'rating', 'comment', 'created_at')


class ProductSerializer(serializers.ModelSerializer):
    seller_email = serializers.SerializerMethodField()
    imageUrl = serializers.SerializerMethodField()
    image = serializers.ImageField(write_only=True, required=False)
    averageRating = serializers.ReadOnlyField(source='average_rating')
    reviewCount = serializers.ReadOnlyField(source='review_count')
    price_usd = serializers.SerializerMethodField()
    price_ngn = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            'id', 'name', 'price', 'currency', 'location', 'category', 'description', 
            'image', 'imageUrl', 'likes', 'averageRating', 'reviewCount', 
            'seller_email', 'price_usd', 'price_ngn', 'created_at'
        )

    def get_price_usd(self, obj):
        if obj.currency == 'USD':
            return obj.price
        # Convert NGN to USD
        rate_obj = ExchangeRate.objects.first()
        rate = rate_obj.usd_to_naira if rate_obj else Decimal('1500.00')
        return round(obj.price / rate, 2)

    def get_price_ngn(self, obj):
        if obj.currency == 'NGN':
            return obj.price
        # Convert USD to NGN
        rate_obj = ExchangeRate.objects.first()
        rate = rate_obj.usd_to_naira if rate_obj else Decimal('1500.00')
        return round(obj.price * rate, 2)

    def get_seller_email(self, obj):
        return obj.seller.email if obj.seller else 'guest@example.com'

    def get_imageUrl(self, obj):
        if obj.image:
            return obj.image.url
        return None


class NewsletterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Newsletter
        fields = ('email',)
