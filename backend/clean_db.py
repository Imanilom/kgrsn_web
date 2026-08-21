from database import engine, Base
import models
from sqlalchemy import text

def clean_and_init_db():
    with engine.connect() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
        conn.commit()
    print("Dropping all tables...")
    Base.metadata.drop_all(bind=engine)
    with engine.connect() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
        conn.commit()
    print("Creating all tables...")
    Base.metadata.create_all(bind=engine)
    print("Database cleaned and initialized successfully!")

if __name__ == "__main__":
    clean_and_init_db()
