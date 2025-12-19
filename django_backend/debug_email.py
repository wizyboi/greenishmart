
import os
import django
from django.conf import settings
from django.core.mail import send_mail, get_connection

# Setup Django standalone
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def test_email_verbose():
    print("--- Starting Verbose Email Test ---")
    
    # Get the connection and enable debug output
    connection = get_connection()
    # This works for the standard SMTP backend to print protocol details
    connection.open()
    # Note: implementation of debuglevel might vary by backend, but for smtplib:
    connection.connection.set_debuglevel(1) 
    
    print(f"Sending from: {settings.DEFAULT_FROM_EMAIL}")
    print(f"Sending to: {settings.EMAIL_HOST_USER}")
    
    try:
        send_mail(
            'DEBUG TEST: GreenishMart',
            'This is a test with detailed logging.',
            settings.DEFAULT_FROM_EMAIL,
            [settings.EMAIL_HOST_USER],
            fail_silently=False,
            connection=connection
        )
        print("\n✅ Python says: SUCEESS.")
    except Exception as e:
        print(f"\n❌ Python says: FAILED - {e}")

if __name__ == "__main__":
    test_email_verbose()
