#!/usr/bin/env python
"""
Comprehensive Email Configuration Test
Tests real SMTP configuration and sends test emails
"""

import os
import sys
import django
import logging
from pathlib import Path

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.core.mail import send_mail, EmailMultiAlternatives, get_connection
from django.conf import settings
from django.template.loader import render_to_string

# Setup logging
logging.basicConfig(level=logging.DEBUG, format='%(levelname)s - %(message)s')
logger = logging.getLogger('email_test')

def print_config():
    """Print current email configuration"""
    print("\n" + "="*70)
    print("EMAIL CONFIGURATION")
    print("="*70)
    print(f"EMAIL_BACKEND:       {settings.EMAIL_BACKEND}")
    print(f"EMAIL_HOST:          {settings.EMAIL_HOST}")
    print(f"EMAIL_PORT:          {settings.EMAIL_PORT}")
    print(f"EMAIL_USE_TLS:       {settings.EMAIL_USE_TLS}")
    print(f"EMAIL_USE_SSL:       {settings.EMAIL_USE_SSL}")
    print(f"EMAIL_HOST_USER:     {settings.EMAIL_HOST_USER or '❌ NOT SET'}")
    print(f"EMAIL_HOST_PASSWORD: {('*' * 10) if settings.EMAIL_HOST_PASSWORD else '❌ NOT SET'}")
    print(f"DEFAULT_FROM_EMAIL:  {settings.DEFAULT_FROM_EMAIL or '❌ NOT SET'}")
    print(f"SERVER_EMAIL:        {settings.SERVER_EMAIL or '❌ NOT SET'}")
    print("="*70)
    
    # Validate configuration
    errors = []
    if not settings.EMAIL_HOST_USER:
        errors.append("❌ EMAIL_HOST_USER not set")
    if not settings.EMAIL_HOST_PASSWORD:
        errors.append("❌ EMAIL_HOST_PASSWORD not set")
    if not settings.DEFAULT_FROM_EMAIL:
        errors.append("❌ DEFAULT_FROM_EMAIL not set")
    if settings.EMAIL_BACKEND != 'django.core.mail.backends.smtp.EmailBackend':
        errors.append(f"⚠️  EMAIL_BACKEND is not SMTP: {settings.EMAIL_BACKEND}")
    
    if errors:
        print("\n🚨 CONFIGURATION ERRORS:")
        for error in errors:
            print(f"  {error}")
        return False
    else:
        print("\n✅ EMAIL CONFIGURATION IS VALID")
        return True

def test_smtp_connection():
    """Test SMTP connection without sending email"""
    print("\n" + "="*70)
    print("TESTING SMTP CONNECTION")
    print("="*70)
    
    try:
        connection = get_connection()
        connection.open()
        print("✅ SMTP Connection successful!")
        connection.close()
        return True
    except Exception as e:
        print(f"❌ SMTP Connection failed: {e}")
        logger.error(f"SMTP Connection Error: {e}", exc_info=True)
        return False

def test_plain_text_email(recipient_email):
    """Send a plain text test email"""
    print("\n" + "="*70)
    print(f"SENDING PLAIN TEXT EMAIL to {recipient_email}")
    print("="*70)
    
    try:
        result = send_mail(
            subject='GreenishMart - Plain Text Test Email',
            message='This is a plain text test email to verify SMTP is working correctly.',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
        )
        print(f"✅ Plain text email sent successfully! (return value: {result})")
        return True
    except Exception as e:
        print(f"❌ Plain text email failed: {e}")
        logger.error(f"Plain Text Email Error: {e}", exc_info=True)
        return False

def test_html_email(recipient_email):
    """Send an HTML test email with template"""
    print("\n" + "="*70)
    print(f"SENDING HTML EMAIL to {recipient_email}")
    print("="*70)
    
    try:
        # Plain text fallback
        text_message = """
Welcome to GreenishMart!

This is an HTML test email to verify template rendering works.

Best regards,
The GreenishMart Team
"""
        
        # Try to render HTML template
        html_message = None
        try:
            html_message = render_to_string('emails/verification_email.html', {
                'code': '123456',
                'first_name': 'Test User',
                'expiry_minutes': 10
            })
            print("✅ HTML template rendered successfully")
        except Exception as e:
            print(f"⚠️  HTML template not available: {e}")
            # Create a simple HTML message instead
            html_message = """
<html>
  <body style="font-family: Arial, sans-serif;">
    <h1>Welcome to GreenishMart!</h1>
    <p>This is an HTML test email to verify email sending works.</p>
    <p><strong>Verification Code:</strong> 123456</p>
    <p>Best regards,<br>The GreenishMart Team</p>
  </body>
</html>
"""
        
        # Create multipart email
        email_msg = EmailMultiAlternatives(
            subject='GreenishMart - HTML Test Email',
            body=text_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[recipient_email]
        )
        email_msg.attach_alternative(html_message, "text/html")
        result = email_msg.send(fail_silently=False)
        
        print(f"✅ HTML email sent successfully! (return value: {result})")
        return True
    except Exception as e:
        print(f"❌ HTML email failed: {e}")
        logger.error(f"HTML Email Error: {e}", exc_info=True)
        return False

def main():
    """Run all tests"""
    print("\n" + "="*70)
    print("GREENISHMART EMAIL SYSTEM TEST SUITE")
    print("="*70)
    
    # Step 1: Check configuration
    if not print_config():
        print("\n🚨 CONFIGURATION ERROR: Email credentials must be set in environment variables")
        print("   Set the following in your .env file or environment:")
        print("   - EMAIL_HOST_USER (your Gmail address)")
        print("   - EMAIL_HOST_PASSWORD (your Gmail app password)")
        print("   - DEFAULT_FROM_EMAIL (sender email)")
        return False
    
    # Step 2: Test SMTP connection
    if not test_smtp_connection():
        print("\n🚨 SMTP CONNECTION ERROR: Cannot connect to email server")
        return False
    
    # Step 3: Send test emails
    recipient = settings.EMAIL_HOST_USER or input("Enter test recipient email: ")
    
    plain_text_ok = test_plain_text_email(recipient)
    html_ok = test_html_email(recipient)
    
    # Summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    print(f"Configuration:    ✅ PASS")
    print(f"SMTP Connection:  ✅ PASS")
    print(f"Plain Text Email: {'✅ PASS' if plain_text_ok else '❌ FAIL'}")
    print(f"HTML Email:       {'✅ PASS' if html_ok else '❌ FAIL'}")
    print("="*70)
    
    if plain_text_ok and html_ok:
        print("\n🎉 ALL TESTS PASSED! Your email system is ready to send real emails!")
        print(f"\n📧 Check {recipient} for test emails (may be in spam folder)")
        return True
    else:
        print("\n❌ Some tests failed. Check the error messages above.")
        return False

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
