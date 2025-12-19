import urllib.request
import urllib.error
import json

url = "http://localhost:8000/api/register/"
payload = {
    "email": "debug@test.com",
    "password": "TestPass123!",
    "firstName": "Debug",
    "lastName": "User",
    "phone": ""
}

data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})

print(f"Testing: {url}")
print(f"Payload: {json.dumps(payload, indent=2)}")
print("\n" + "="*50)

try:
    with urllib.request.urlopen(req) as response:
        print(f"✅ STATUS: {response.getcode()}")
        body = response.read().decode('utf-8')
        print("\nRESPONSE:")
        print(json.dumps(json.loads(body), indent=2))
except urllib.error.HTTPError as e:
    print(f"❌ HTTP ERROR: {e.code}")
    error_body = e.read().decode('utf-8')
    try:
        error_json = json.loads(error_body)
        print("\nERROR JSON:")
        print(json.dumps(error_json, indent=2))
    except:
        print("\nERROR HTML:")
        print(error_body[:1000])
except Exception as e:
    print(f"❌ EXCEPTION: {e}")
