from django.db import models
from django.contrib.auth.models import User
from PIL import Image
import os
from django.conf import settings

# Create your models here.

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    phone = models.CharField(max_length=20, blank=True, null=True)
    newsletter_subscribed = models.BooleanField(default=False)
    reset_token = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username}'s Profile"

class VerificationCode(models.Model):
    CODE_TYPES = [
        ('REGISTRATION', 'Registration'),
        ('PASSWORD_RESET', 'Password Reset'),
    ]
    email = models.EmailField()
    code = models.CharField(max_length=6)
    code_type = models.CharField(max_length=20, choices=CODE_TYPES, default='REGISTRATION')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    @classmethod
    def create_code(cls, email, code_type='REGISTRATION'):
        import random
        from datetime import timedelta
        from django.utils import timezone
        
        code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
        expires_at = timezone.now() + timedelta(minutes=10)
        
        verification_code = cls.objects.create(
            email=email,
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
