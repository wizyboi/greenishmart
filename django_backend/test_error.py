import urllib.request
import urllib.error
import json

url = "http://localhost:8000/api/register/"
payload = {
    "email": "test@example.com",
    "password": "TestPass123",
    "first_name": "Test",
    "last_name": "User"
}
data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})

print(f"Testing: {url}")
try:
    with urllib.request.urlopen(req) as response:
        print(f"✅ Success: {response.getcode()}")
        print(response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"❌ HTTP Error: {e.code}")
    error_body = e.read().decode('utf-8')
    print("Error Response:")
    print(error_body[:500])  # First 500 chars
except Exception as e:
    print(f"❌ Exception: {e}")
