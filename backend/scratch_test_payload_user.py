import urllib.request
import json
from database import SessionLocal
import models
import auth

db = SessionLocal()
# Fetch a real user, skip admin
user = db.query(models.User).filter(models.User.username != "admin").first()
admin = db.query(models.User).filter(models.User.username == "admin").first()

if not user:
    print("No other users found")
    exit()

token = auth.create_access_token({"sub": str(admin.id), "role": admin.role.value})
print(f"Testing on User ID: {user.id}, Current Role: {user.role}")

# Frontend payload does NOT include username!
payload = {
    "email": user.email,
    "full_name": user.full_name,
    "role": "finance" if user.role.value != "finance" else "admin",
    "dapur_id": user.dapur_id,
    "is_active": user.is_active
}

req = urllib.request.Request(
    f"http://localhost:8000/api/auth/users/{user.id}",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    },
    method="PUT"
)

try:
    with urllib.request.urlopen(req) as res:
        print("Status Code:", res.getcode())
        print("Response:", res.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.read().decode())

db.refresh(user)
print(f"After update: Role = {user.role}")

db.close()
