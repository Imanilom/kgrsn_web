from database import get_db
from sqlalchemy import text

db = next(get_db())

# Fix semua user dengan role kosong atau null
result = db.execute(text("UPDATE users SET role='operator' WHERE role='' OR role IS NULL"))
print(f"Rows fixed: {result.rowcount}")

# Verifikasi
rows = db.execute(text("SELECT id, username, role FROM users")).fetchall()
for row in rows:
    print(f"  id={row[0]} username={row[1]} role='{row[2]}'")

db.commit()
db.close()
print("Done.")
