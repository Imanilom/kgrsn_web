from database import SessionLocal
import models

db = SessionLocal()
users = db.query(models.User).all()
for u in users:
    print(f"ID: {u.id}, Username: {u.username}, Role: {repr(u.role)}, Type: {type(u.role)}")
db.close()
