import urllib.request
import json
import urllib.parse
from database import SessionLocal
import models
import auth

db = SessionLocal()
admin = db.query(models.User).filter(models.User.username == "admin").first()
token = auth.create_access_token({"sub": str(admin.id), "role": admin.role.value})
db.close()

# Simulate what frontend sends
payload = {
    "email": None,
    "full_name": "Admin Test",
    "role": "finance",
    "dapur_id": None,
    "is_active": True
}

req = urllib.request.Request(
    f"http://localhost:8000/api/auth/users/{admin.id}",
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

db = SessionLocal()
admin = db.query(models.User).filter(models.User.username == "admin").first()
print(f"After update: Role = {admin.role}")

admin.role = models.UserRole.super_admin
db.commit()
db.close()
