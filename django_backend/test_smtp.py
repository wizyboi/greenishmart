import os
import django
from django.core.mail import send_mail

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

try:
    print("Attempting to send a test email...")
    send_mail(
        'GreenishMart SMTP Test',
        'If you are reading this, your SMTP configuration is working correctly!',
        'wizyomeka@gmail.com',
        ['wizyomeka@gmail.com'],
        fail_silently=False,
    )
    print("✅ Test email sent successfully!")
except Exception as e:
    print(f"❌ Failed to send email: {e}")
