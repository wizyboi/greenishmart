# Email Configuration Guide

## Overview

The GreenishMart project is configured to send real emails via Gmail SMTP. Emails are sent during user registration for email verification.

## Setup Instructions

### 1. Gmail Configuration

To enable real email sending, you need a Gmail account and an App Password:

1. Go to [Google Account Settings](https://myaccount.google.com/)
2. Enable 2-Step Verification (if not already enabled)
3. Go to **Security** > **App passwords**
4. Select "Mail" and "Windows Computer" (or your device)
5. Google will generate a 16-character app password
6. Copy this password

### 2. Environment Variables

Create or update your `.env` file in `django_backend/` with:

```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-16-char-app-password
DEFAULT_FROM_EMAIL=GreenishMart <your-email@gmail.com>
```

**IMPORTANT:**

- Never commit `.env` to version control
- Never hardcode credentials in `settings.py`
- Only use environment variables for credentials
- Use your 16-character app password, NOT your Gmail password

### 3. Verify Configuration

Run the email test script to verify everything is working:

```bash
cd django_backend
python test_email_real.py
```

This will:

- ✅ Check email configuration
- ✅ Test SMTP connection
- ✅ Send a plain text test email
- ✅ Send an HTML test email

## How It Works

### Registration Flow

1. User registers with email and password
2. System generates a 6-digit verification code
3. **Real email is sent** to user with the code
4. User enters code to verify email
5. Account is activated

### Email Sending Code

The email sending logic is in `api/serializers.py` in the `UserRegistrationSerializer.send_verification_email()` method:

- Attempts to send HTML email with template
- Falls back to plain text if template is unavailable
- Logs all email activity for debugging
- Raises errors on SMTP failures (no silent failures)

### Email Templates

- **HTML Template:** `templates/emails/verification_email.html`
- **Plain Text:** Generated automatically in the code

## Troubleshooting

### ❌ "Email not configured" error

**Solution:** Add `EMAIL_HOST_USER` and `EMAIL_HOST_PASSWORD` to your `.env` file

### ❌ SMTP connection refused

**Solution:**

- Check you're using a 16-character **app password**, not your Gmail password
- Verify 2-Step Verification is enabled on your Google account
- Check EMAIL_PORT is 587 (for TLS) not 465

### ❌ "Temporary server error" when logging in

**Solution:** Your email credentials in `.env` may be incorrect. Run `test_email_real.py` to diagnose.

### ❌ Emails going to spam

**Solution:**

- Add your sender email to Gmail contacts
- Check SPF/DKIM records if using custom domain
- Gmail typically trusts gmail.com addresses more

## Production Considerations

### For Deployment (Vercel/Heroku)

1. Set environment variables in your hosting platform's dashboard:

   - EMAIL_HOST_USER
   - EMAIL_HOST_PASSWORD
   - DEFAULT_FROM_EMAIL

2. Never store `.env` in your repository

3. Test email sending after deployment:
   - Try registering a test account
   - Check if verification email arrives

### Alternative Email Providers

If you prefer not to use Gmail, you can configure other SMTP servers:

- SendGrid
- Mailgun
- AWS SES
- Any SMTP provider

Update `settings.py` to use their SMTP credentials.

## Email Configuration in settings.py

The configuration is now secure and environment-variable based:

```python
EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', 'django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', 587))
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True').lower() == 'true'
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER')  # Must be set in environment
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD')  # Must be set in environment
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL')  # Must be set in environment
```

**Key points:**

- Default backend is SMTP (not console)
- Credentials are required (no defaults)
- Settings are read-only from environment
- Validation happens at serializer level

## Testing

### Test with test_email_real.py

```bash
python test_email_real.py
```

### Test with Django shell

```bash
python manage.py shell
from django.core.mail import send_mail
from django.conf import settings

send_mail(
    'Test',
    'This is a test',
    settings.DEFAULT_FROM_EMAIL,
    ['your-email@gmail.com'],
    fail_silently=False
)
```

## Monitoring

Check logs for email activity:

```bash
tail -f error.log  # Email errors
```

The system logs:

- ✉️ Successful email sends
- ⚠️ Template rendering issues
- 🔥 SMTP failures
- 📧 Verification codes (debug only)

## Next Steps

1. Update your `.env` file with Gmail credentials
2. Run `test_email_real.py` to verify setup
3. Deploy to production with environment variables set
4. Test registration on live system
5. Monitor logs for any issues

---

**Need help?** Check the test output from `test_email_real.py` for specific error messages.
