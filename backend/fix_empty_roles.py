import sqlalchemy
from database import engine

with engine.connect() as conn:
    print("Fixing empty user roles...")
    conn.execute(sqlalchemy.text("UPDATE users SET role = 'operator' WHERE role = '';"))
    conn.commit()
    print("Done!")
