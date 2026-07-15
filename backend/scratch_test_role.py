import os
import sys
from database import SessionLocal
from models import User, UserRole

db = SessionLocal()

admin_user = db.query(User).filter(User.username == "admin").first()
print(f"Current role: {admin_user.role}")

admin_user.role = UserRole.finance
db.commit()
db.refresh(admin_user)
print(f"Updated role: {admin_user.role}")

admin_user.role = UserRole.super_admin
db.commit()
db.refresh(admin_user)
print(f"Reverted role: {admin_user.role}")

db.close()
