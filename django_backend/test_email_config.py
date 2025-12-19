import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.core.mail import send_mail
from django.conf import settings

print("\n" + "="*60)
print("EMAIL CONFIGURATION TEST")
print("="*60)
print(f"EMAIL_BACKEND: {settings.EMAIL_BACKEND}")
print(f"EMAIL_HOST: {settings.EMAIL_HOST}")
print(f"EMAIL_PORT: {settings.EMAIL_PORT}")
print(f"EMAIL_USE_TLS: {settings.EMAIL_USE_TLS}")
print(f"EMAIL_HOST_USER: {settings.EMAIL_HOST_USER}")
print(f"EMAIL_HOST_PASSWORD: {'*' * len(settings.EMAIL_HOST_PASSWORD) if settings.EMAIL_HOST_PASSWORD else '(empty)'}")
print(f"DEFAULT_FROM_EMAIL: {settings.DEFAULT_FROM_EMAIL}")
print("="*60)

# Test email sending
test_email = settings.EMAIL_HOST_USER or "test@example.com"

print(f"\nAttempting to send test email to: {test_email}")

try:
    result = send_mail(
        'Test Email from GreenishMart',
        'This is a test email to verify SMTP configuration is working.',
        settings.DEFAULT_FROM_EMAIL,
        [test_email],
        fail_silently=False,
    )
    print(f"\n✅ SUCCESS! Email sent. Return value: {result}")
    print("\nCheck your inbox (and spam folder) for the test email.")
except Exception as e:
    print(f"\n❌ FAILED! Error: {e}")
    import traceback
    print("\nFull error:")
    traceback.print_exc()
