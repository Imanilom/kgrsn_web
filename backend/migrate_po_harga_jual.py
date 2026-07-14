import sys
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Load env file
load_dotenv()

# Build database URL from environment
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "kgrsn_db")

SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def run_migration():
    print("Mulai proses migrasi: Menambah kolom harga_jual di po_detail...")
    db = SessionLocal()
    try:
        # Cek apakah kolom harga_jual sudah ada untuk mencegah error jika di-run dua kali
        result = db.execute(text("SHOW COLUMNS FROM po_detail LIKE 'harga_jual';")).fetchone()
        
        if result:
            print("Kolom 'harga_jual' sudah ada di tabel po_detail. Melewati migrasi.")
        else:
            print("Menjalankan ALTER TABLE...")
            db.execute(text("ALTER TABLE po_detail ADD COLUMN harga_jual DECIMAL(15, 2) DEFAULT 0.0 AFTER harga_satuan;"))
            db.commit()
            print("Migrasi sukses: Kolom 'harga_jual' berhasil ditambahkan.")
            
    except Exception as e:
        db.rollback()
        print(f"Gagal melakukan migrasi: {e}")
    finally:
        db.close()
        print("Selesai.")

if __name__ == "__main__":
    run_migration()
