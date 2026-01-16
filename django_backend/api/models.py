from django.db import models
from django.contrib.auth.models import User
from PIL import Image
from django.utils import timezone
import os
from django.conf import settings

# Create your models here.

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    phone = models.CharField(max_length=20, blank=True, null=True)
    email_verified = models.BooleanField(default=False)
    newsletter_subscribed = models.BooleanField(default=False)
    reset_token = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)

    def __str__(self):
        return f"{self.user.username}'s Profile"

class VerificationCode(models.Model):
    CODE_TYPES = [
        ('REGISTRATION', 'Registration'),
        ('PASSWORD_RESET', 'Password Reset'),
    ]
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='verification_codes', null=True)
    code = models.CharField(max_length=6)
    code_type = models.CharField(max_length=20, choices=CODE_TYPES, default='REGISTRATION')
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_used = models.BooleanField(default=False)

    def mark_as_used(self):
        self.is_used = True
        self.save()

    def is_expired(self):
        if not self.expires_at:
            return True
        return timezone.now() > self.expires_at

    @classmethod
    def generate_code(cls, user, code_type='REGISTRATION'):
        import random
        from datetime import timedelta
        
        code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
        expires_at = timezone.now() + timedelta(minutes=10)
        
        verification_code = cls.objects.create(
            user=user,
            code=code,
            code_type=code_type,
            expires_at=expires_at
        )
        
        return code, verification_code

    @classmethod
    def create_code(cls, email, code_type='REGISTRATION'):
        # Legacy support if needed, but we should use generate_code with user
        import random
        from datetime import timedelta
        
        code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
        expires_at = timezone.now() + timedelta(minutes=10)
        
        verification_code = cls.objects.create(
            code=code,
            code_type=code_type,
            expires_at=expires_at
        )
        
        return code, verification_code

class ExchangeRate(models.Model):
    """Stores the conversion rate from USD to NGN"""
    usd_to_naira = models.DecimalField(max_digits=10, decimal_places=2, default=1500.00)
    last_updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"1 USD = {self.usd_to_naira} NGN"

class Product(models.Model):
    CURRENCY_CHOICES = [
        ('USD', 'Dollar ($)'),
        ('NGN', 'Naira (₦)'),
    ]
    seller = models.ForeignKey(User, on_delete=models.CASCADE, related_name='products', null=True)
    name = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='USD')
    location = models.CharField(max_length=255)
    category = models.CharField(max_length=100, default='General')
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to='products/', null=True, blank=True)
    likes = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        
        if self.image:
            img = Image.open(self.image.path)
            if img.height > 800 or img.width > 800:
                output_size = (800, 800)
                img.thumbnail(output_size)
                img.save(self.image.path)

    @property
    def average_rating(self):
        reviews = self.reviews.all()
        if not reviews:
            return 0
        return sum(r.rating for r in reviews) / len(reviews)

    @property
    def review_count(self):
        return self.reviews.count()

    def __str__(self):
        return self.name

class Review(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='reviews')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    rating = models.IntegerField(default=5)
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Review for {self.product.name} by {self.user.username}"

class Newsletter(models.Model):
    email = models.EmailField(unique=True)
    subscribed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.email
