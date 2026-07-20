import os
import sys
from sqlalchemy import create_engine, text
from config import settings

def run_migration():
    engine = create_engine(settings.DATABASE_URL)
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE po_detail ADD COLUMN harga_jual DECIMAL(15,2) DEFAULT 0 AFTER harga_satuan;"))
            conn.commit()
            print("Successfully added harga_jual to po_detail")
        except Exception as e:
            if "Duplicate column name" in str(e):
                print("Column harga_jual already exists in po_detail")
            else:
                print(f"Error: {e}")

if __name__ == "__main__":
    run_migration()
