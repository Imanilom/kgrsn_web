from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
import models
import auth

db = SessionLocal()
admin = db.query(models.User).filter(models.User.username == "admin").first()
token = auth.create_access_token({"sub": str(admin.id), "role": admin.role.value})

client = TestClient(app)

print(f"Before update: Role = {admin.role}")

# Try to update admin's role to finance
res = client.put(
    f"/api/auth/users/{admin.id}",
    json={
        "username": "admin",
        "role": "finance",
        "full_name": "Admin Test"
    },
    headers={"Authorization": f"Bearer {token}"}
)
print("Status Code:", res.status_code)
print("Response:", res.json())

db.refresh(admin)
print(f"After update: Role = {admin.role}")

# Revert back
admin.role = models.UserRole.super_admin
db.commit()
db.close()
