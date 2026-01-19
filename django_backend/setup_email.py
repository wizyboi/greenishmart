#!/usr/bin/env python3
"""
Quick setup script for GreenishMart email configuration
Run this to set up your email credentials interactively
"""

import os
import sys
import subprocess
from pathlib import Path

def print_header(text):
    print(f"\n{'='*70}")
    print(f"  {text}")
    print(f"{'='*70}\n")

def print_step(number, text):
    print(f"  [{number}] {text}")

def main():
    print_header("GreenishMart Email Configuration Setup")
    
    django_backend = Path(__file__).parent
    env_file = django_backend / '.env'
    
    print("This script will help you configure real email sending.\n")
    
    # Check if .env exists
    if env_file.exists():
        print(f"✅ Found existing .env file at {env_file}")
        overwrite = input("\nDo you want to update it? (y/n): ").lower().strip()
        if overwrite != 'y':
            print("Skipping configuration.")
            return
    else:
        print(f"📝 .env file not found. Creating new one at {env_file}\n")
    
    print_header("Step 1: Get Gmail App Password")
    print("""
To send emails, you need a Gmail account with an App Password:

  1. Go to https://myaccount.google.com/security
  2. Enable "2-Step Verification" (if not already enabled)
  3. Go to "App passwords" (at the bottom of Security page)
  4. Select "Mail" and "Windows Computer" (or your OS)
  5. Google will generate a 16-character password
  6. Copy this password (you'll need it next)

⚠️  Use this app password, NOT your Gmail password!
    """)
    
    input("Press Enter when you're ready...")
    
    print_header("Step 2: Enter Your Credentials")
    
    email = input("  📧 Gmail address: ").strip()
    if not email:
        print("❌ Email is required!")
        return
    
    password = input("  🔐 App password (16 characters): ").strip()
    if len(password) < 10:
        print("❌ App password seems too short!")
        return
    
    from_name = input("  📬 Sender name [GreenishMart]: ").strip() or "GreenishMart"
    
    # Create .env content
    env_content = f"""EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER={email}
EMAIL_HOST_PASSWORD={password}
DEFAULT_FROM_EMAIL={from_name} <{email}>
"""
    
    # Write .env file
    try:
        with open(env_file, 'w') as f:
            f.write(env_content)
        print(f"\n✅ Configuration saved to {env_file}")
    except Exception as e:
        print(f"\n❌ Error writing .env file: {e}")
        return
    
    print_header("Step 3: Test Configuration")
    print("\nTesting SMTP connection and sending test emails...\n")
    
    try:
        result = subprocess.run(
            [sys.executable, str(django_backend / 'test_email_real.py')],
            cwd=str(django_backend),
            capture_output=False
        )
        
        if result.returncode == 0:
            print_header("✅ Configuration Successful!")
            print("""
Your email system is now ready! 

Next steps:
  1. Test registration on your application
  2. You should receive a verification email
  3. Check spam/promotions folder if not in inbox
  4. Check error.log for any issues

For production deployment:
  - Set the same environment variables on your hosting platform
  - Vercel: Project Settings > Environment Variables
  - Heroku: Config Vars
  - Other platforms: Refer to their documentation
            """)
        else:
            print_header("⚠️  Test Failed")
            print("""
Please check:
  1. Your .env file has correct credentials
  2. 2-Step Verification is enabled on Gmail
  3. App password is correct (16 characters)
  4. Your Gmail account allows app passwords

Read EMAIL_SETUP.md for detailed troubleshooting.
            """)
            
    except Exception as e:
        print(f"\n❌ Error running tests: {e}")
        print("You can run tests manually with: python test_email_real.py")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Setup cancelled by user.")
        sys.exit(1)
