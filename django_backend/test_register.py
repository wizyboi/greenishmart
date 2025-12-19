
import urllib.request
import urllib.error
import json

url = "http://localhost:8000/api/register/"
payload = {
    "username": "testuser_debug_v2",
    "email": "wizyomeka@gmail.com",
    "password": "TestPassword123!",
    "first_name": "Test",
    "last_name": "User"
}
data = json.dumps(payload).encode('utf-8')

req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})

print(f"Sending POST to {url}...")
try:
    with urllib.request.urlopen(req) as response:
        print(f"Status Code: {response.getcode()}")
        body = response.read().decode('utf-8')
        print("Response JSON:")
        print(json.dumps(json.loads(body), indent=2))
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    body = e.read().decode('utf-8')
    print("Error Body:")
    print(body)
except Exception as e:
    print(f"General Error: {e}")
