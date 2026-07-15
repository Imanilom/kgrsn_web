import sqlalchemy
from database import engine

with engine.connect() as conn:
    print("Modifying users.role column...")
    conn.execute(sqlalchemy.text("ALTER TABLE users MODIFY COLUMN role ENUM('super_admin', 'admin', 'finance', 'akuntan', 'operator') NOT NULL DEFAULT 'operator';"))
    conn.commit()
    print("Done!")
