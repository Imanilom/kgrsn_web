"""
Script untuk membuat atau mereset password akun admin:
Username: admin
Password: admin123
Role: super_admin
"""
import sys
from database import SessionLocal
import models
from auth import hash_password

def setup_admin():
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.username == "admin").first()
        if user:
            user.hashed_password = hash_password("admin123")
            user.role = models.UserRole.super_admin
            user.is_active = True
            print(" Berhasil mengupdate akun 'admin' yang sudah ada:")
        else:
            user = models.User(
                username="admin",
                full_name="Super Administrator",
                hashed_password=hash_password("admin123"),
                role=models.UserRole.super_admin,
                is_active=True,
            )
            db.add(user)
            print(" Berhasil membuat akun baru 'admin':")

        db.commit()
        db.refresh(user)
        print(f"   - ID       : {user.id}")
        print(f"   - Username : {user.username}")
        print(f"   - Full Name: {user.full_name}")
        print(f"   - Role     : {user.role.value if hasattr(user.role, 'value') else user.role}")
        print(f"   - Active   : {user.is_active}")
        print(f"   - Password : admin123")
        print("\n Akun admin siap digunakan untuk login.")
    except Exception as e:
        db.rollback()
        print(f" Gagal setup admin: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    setup_admin()
