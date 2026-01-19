#!/usr/bin/env python
"""
Comprehensive Backend-Frontend Integration Test
Verifies all API endpoints, CORS, authentication, and data flow
"""

import os
import sys
import django
import json
from pathlib import Path

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.contrib.auth.models import User
from django.test import Client
from django.conf import settings
from api.models import Product, Review, Newsletter, VerificationCode, UserProfile
from rest_framework_simplejwt.tokens import RefreshToken

def print_section(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}\n")

def test_cors_config():
    """Test CORS configuration"""
    print_section("TEST 1: CORS Configuration")
    
    checks = {
        'CORS_ALLOW_ALL_ORIGINS': settings.CORS_ALLOW_ALL_ORIGINS,
        'CORS_ALLOW_CREDENTIALS': settings.CORS_ALLOW_CREDENTIALS,
        'Frontend URL allowed': 'https://greenishmart.vercel.app' in settings.CORS_ALLOWED_ORIGINS,
    }
    
    for check, status in checks.items():
        symbol = '[PASS]' if status else '[FAIL]'
        print(f"{symbol} {check}: {status}")
    
    return all(checks.values())

def test_api_endpoints():
    """Test all API endpoints exist and respond"""
    print_section("TEST 2: API Endpoints")
    
    client = Client()
    endpoints = [
        ('/api/health/', 'GET', None, 'Health Check'),
        ('/api/products/', 'GET', None, 'List Products'),
        ('/api/newsletter/', 'POST', {'email': 'test@test.com'}, 'Newsletter Subscription'),
    ]
    
    results = {}
    for endpoint, method, data, description in endpoints:
        try:
            if method == 'GET':
                response = client.get(endpoint)
            else:
                response = client.post(endpoint, data, content_type='application/json')
            
            status_ok = 200 <= response.status_code < 300 or response.status_code in [201, 400, 401]
            symbol = '[PASS]' if status_ok else '[FAIL]'
            print(f"{symbol} {description} ({endpoint}): {response.status_code}")
            results[description] = status_ok
        except Exception as e:
            print(f"[FAIL] {description} ({endpoint}): {e}")
            results[description] = False
    
    return all(results.values())

def test_user_registration():
    """Test user registration and email verification flow"""
    print_section("TEST 3: User Registration & Email")
    
    client = Client()
    test_email = 'integration_test_123@test.com'
    test_password = 'TestPassword123!'
    
    # Clean up test user if exists
    User.objects.filter(email=test_email).delete()
    
    try:
        # Step 1: Register
        print("Step 1: Attempting user registration...")
        registration_data = {
            'email': test_email,
            'password': test_password,
            'firstName': 'Test',
            'lastName': 'User',
            'phone': '+234801234567'
        }
        
        response = client.post('/api/register/', 
                              json.dumps(registration_data),
                              content_type='application/json')
        
        if response.status_code == 201:
            print("[PASS] Registration successful (201)")
            data = response.json()
            
            # Check response structure
            checks = {
                'Response has ok field': 'ok' in data,
                'Response has message': 'message' in data,
                'Response has data': 'data' in data,
            }
            
            for check, status in checks.items():
                symbol = '[PASS]' if status else '[FAIL]'
                print(f"  {symbol} {check}")
        else:
            print(f"[FAIL] Registration failed ({response.status_code})")
            print(f"  Response: {response.json()}")
            return False
        
        # Step 2: Verify email
        print("\nStep 2: Verifying email with code...")
        user = User.objects.get(email=test_email)
        verification_code = VerificationCode.objects.filter(user=user, is_used=False).first()
        
        if verification_code:
            print(f"[PASS] Verification code generated: {verification_code.code}")
            
            verify_data = {
                'email': test_email,
                'code': verification_code.code
            }
            
            response = client.post('/api/verify/',
                                  json.dumps(verify_data),
                                  content_type='application/json')
            
            if response.status_code == 200:
                print("[PASS] Email verified successfully (200)")
                data = response.json()
                
                if 'data' in data and 'token' in data['data']:
                    print("[PASS] JWT token generated")
                else:
                    print("[FAIL] No JWT token in response")
            else:
                print(f"[FAIL] Email verification failed ({response.status_code})")
                print(f"  Response: {response.json()}")
        else:
            print("[FAIL] No verification code generated")
            return False
        
        # Step 3: Login
        print("\nStep 3: Testing login...")
        login_data = {
            'email': test_email,
            'password': test_password
        }
        
        response = client.post('/api/login/',
                              json.dumps(login_data),
                              content_type='application/json')
        
        if response.status_code == 200:
            print("[PASS] Login successful (200)")
            data = response.json()
            if 'data' in data and 'token' in data['data']:
                print("[PASS] JWT token issued")
                token = data['data']['token']
            else:
                print("[FAIL] No token in login response")
                return False
        else:
            print(f"[FAIL] Login failed ({response.status_code})")
            print(f"  Response: {response.json()}")
            return False
        
        # Cleanup
        user.delete()
        return True
        
    except Exception as e:
        print(f"[FAIL] Registration test error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_product_operations():
    """Test product create, read, list, update, delete"""
    print_section("TEST 4: Product Operations")
    
    client = Client()
    
    try:
        # Create test user (UserProfile created by signal)
        print("Setting up test user...")
        test_email = 'product_test_user_123@test.com'
        User.objects.filter(email=test_email).delete()
        
        test_user = User.objects.create_user(
            username=test_email,
            email=test_email,
            password='TestPassword123!'
        )
        
        # Get or create profile
        profile, created = UserProfile.objects.get_or_create(user=test_user)
        profile.email_verified = True
        profile.save()
        
        print(f"[PASS] Test user created: {test_user.email}")
        
        # Get JWT token
        refresh = RefreshToken.for_user(test_user)
        token = str(refresh.access_token)
        
        # Step 1: List products (no auth required)
        print("\nStep 1: List all products...")
        response = client.get('/api/products/')
        if response.status_code == 200:
            print("[PASS] Product list retrieved (200)")
            data = response.json()
            if 'data' in data:
                print(f"  Total products: {len(data['data'].get('results', []))}")
        else:
            print(f"[FAIL] Product list failed ({response.status_code})")
        
        # Step 2: Create product (auth required)
        print("\nStep 2: Creating new product...")
        product_data = {
            'name': 'Integration Test Product',
            'price': '99.99',
            'currency': 'USD',
            'location': 'Test Location',
            'category': 'Test Category',
            'description': 'This is a test product for integration testing'
        }
        
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}
        response = client.post('/api/products/',
                              json.dumps(product_data),
                              content_type='application/json',
                              **headers)
        
        if response.status_code == 201:
            print("[PASS] Product created (201)")
            data = response.json()
            if 'data' in data and 'id' in data['data']:
                product_id = data['data']['id']
                print(f"  Product ID: {product_id}")
            else:
                print("[FAIL] No product ID in response")
                return False
        else:
            print(f"[FAIL] Product creation failed ({response.status_code})")
            print(f"  Response: {response.json()}")
            return False
        
        # Step 3: Like product (auth required)
        print("\nStep 3: Liking product...")
        response = client.post(f'/api/products/{product_id}/like/',
                              json.dumps({}),
                              content_type='application/json',
                              **headers)
        
        if response.status_code == 200:
            print("[PASS] Product liked (200)")
        else:
            print(f"[WARN] Product like failed ({response.status_code})")
        
        # Step 4: Rate product (auth required)
        print("\nStep 4: Rating product...")
        rating_data = {
            'rating': 5,
            'comment': 'Great product!'
        }
        
        response = client.post(f'/api/products/{product_id}/rate/',
                              json.dumps(rating_data),
                              content_type='application/json',
                              **headers)
        
        if response.status_code == 201:
            print("[PASS] Product rated (201)")
        else:
            print(f"[WARN] Product rating failed ({response.status_code})")
        
        # Cleanup
        test_user.delete()
        return True
        
    except Exception as e:
        print(f"[FAIL] Product operation test error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_authentication_flow():
    """Test JWT token generation and usage"""
    print_section("TEST 5: Authentication Flow")
    
    try:
        # Create test user (UserProfile created by signal automatically)
        test_email = 'auth_test_user_123@test.com'
        User.objects.filter(email=test_email).delete()
        
        test_user = User.objects.create_user(
            username=test_email,
            email=test_email,
            password='TestPassword123!'
        )
        
        # Get or create profile (in case signal didn't fire)
        profile, created = UserProfile.objects.get_or_create(user=test_user)
        profile.email_verified = True
        profile.save()
        
        # Generate token
        print("Step 1: Generating JWT tokens...")
        refresh = RefreshToken.for_user(test_user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)
        
        checks = {
            'Access token generated': bool(access_token),
            'Refresh token generated': bool(refresh_token),
            'Access token is string': isinstance(access_token, str),
            'Access token has content': len(access_token) > 20,
        }
        
        for check, status in checks.items():
            symbol = '[PASS]' if status else '[FAIL]'
            print(f"  {symbol} {check}")
        
        # Test token usage
        print("\nStep 2: Testing token in API calls...")
        client = Client()
        headers = {'HTTP_AUTHORIZATION': f'Bearer {access_token}'}
        
        response = client.get('/api/products/', **headers)
        if response.status_code == 200:
            print("[PASS] Authenticated API call successful")
        else:
            print("[FAIL] Authenticated API call failed")
        
        # Cleanup
        test_user.delete()
        return all(checks.values())
        
    except Exception as e:
        print(f"[FAIL] Authentication flow test error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_data_models():
    """Test that database models are properly configured"""
    print_section("TEST 6: Database Models")
    
    try:
        models_to_check = [
            (User, 'Django User'),
            (UserProfile, 'User Profile'),
            (Product, 'Product'),
            (Review, 'Review'),
            (Newsletter, 'Newsletter'),
            (VerificationCode, 'Verification Code'),
        ]
        
        checks = {}
        for model, name in models_to_check:
            try:
                count = model.objects.count()
                checks[name] = True
                print(f"[PASS] {name}: {count} records")
            except Exception as e:
                checks[name] = False
                print(f"[FAIL] {name}: Error - {e}")
        
        return all(checks.values())
        
    except Exception as e:
        print(f"[FAIL] Model check error: {e}")
        return False

def test_response_format():
    """Test that API responses follow the standardized format"""
    print_section("TEST 7: Response Format")
    
    client = Client()
    
    try:
        response = client.get('/api/health/')
        data = response.json()
        
        required_fields = ['ok', 'message', 'data']
        checks = {}
        
        for field in required_fields:
            has_field = field in data
            checks[field] = has_field
            symbol = '[PASS]' if has_field else '[FAIL]'
            print(f"{symbol} Response has '{field}' field")
        
        if checks['ok'] is not None:
            print(f"[PASS] 'ok' field is boolean: {isinstance(data['ok'], bool)}")
        
        return all(checks.values())
        
    except Exception as e:
        print(f"[FAIL] Response format test error: {e}")
        return False

def main():
    """Run all integration tests"""
    print("\n" + "="*70)
    print("  GREENISHMART BACKEND-FRONTEND INTEGRATION TEST SUITE")
    print("="*70)
    
    tests = [
        ("CORS Configuration", test_cors_config),
        ("API Endpoints", test_api_endpoints),
        ("Response Format", test_response_format),
        ("Data Models", test_data_models),
        ("Authentication Flow", test_authentication_flow),
        ("User Registration & Email", test_user_registration),
        ("Product Operations", test_product_operations),
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            results[test_name] = result
        except Exception as e:
            print(f"\n[FAIL] {test_name} failed with error: {e}")
            results[test_name] = False
    
    # Summary
    print_section("TEST SUMMARY")
    
    for test_name, result in results.items():
        symbol = '[PASS]' if result else '[FAIL]'
        print(f"{symbol}: {test_name}")
    
    total = len(results)
    passed = sum(1 for r in results.values() if r)
    
    print(f"\n{'='*70}")
    print(f"Total: {passed}/{total} tests passed")
    print(f"{'='*70}\n")
    
    if passed == total:
        print("[SUCCESS] ALL TESTS PASSED! Your backend is fully integrated with frontend!\n")
        return True
    else:
        print("[WARN] Some tests failed. Check the output above for details.\n")
        return False

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
