import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.contrib.auth.models import User
from api.models import UserProfile

try:
    if not User.objects.filter(email='admin@example.com').exists():
        print("Creating superuser 'admin@example.com'...")
        user = User.objects.create_superuser(
            username='admin@example.com',
            email='admin@example.com',
            password='admin',
            first_name='Super',
            last_name='Admin'
        )
        # Create profile
        UserProfile.objects.create(
            user=user,
            email_verified=True
        )
        print("✅ Superuser created successfully.")
    else:
        print("ℹ️  Superuser already exists.")
except Exception as e:
    print(f"❌ Error creating superuser: {e}")
