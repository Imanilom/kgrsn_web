"""
Migration script untuk menambahkan kolom budget (kecil/besar) ke tabel purchase_order.
Script ini menambahkan:
- jumlah_pm_kecil
- jumlah_pm_besar
- budget_kecil
- budget_besar
"""
from sqlalchemy import create_engine, text
from config import settings
import sys

engine = create_engine(settings.DATABASE_URL)

with engine.connect() as conn:
    # Check if columns already exist
    result = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.COLUMNS "
        "WHERE TABLE_NAME = 'purchase_order' AND COLUMN_NAME = 'jumlah_pm_kecil' "
        "AND TABLE_SCHEMA = :db",
    ), {"db": settings.DB_NAME})
    
    column_exists = result.scalar() > 0

    if column_exists:
        print("Column jumlah_pm_kecil already exists, skipping migration.")
        sys.exit(0)

    print("Adding budget columns to purchase_order table...")
    
    try:
        conn.execute(text("""
            ALTER TABLE purchase_order
            ADD COLUMN jumlah_pm_kecil INT NOT NULL DEFAULT 0,
            ADD COLUMN jumlah_pm_besar INT NOT NULL DEFAULT 0,
            ADD COLUMN budget_kecil DECIMAL(15,2) NOT NULL DEFAULT 0,
            ADD COLUMN budget_besar DECIMAL(15,2) NOT NULL DEFAULT 0
        """))
        conn.commit()
        print("Migration successful: columns added to purchase_order table.")
    except Exception as e:
        print(f"Migration error: {e}")
        conn.rollback()
        sys.exit(1)
