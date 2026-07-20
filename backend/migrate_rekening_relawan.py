import sys
from sqlalchemy import create_engine, text
from config import settings

def run_migration():
    print("Menjalankan migrasi rekening relawan ...")
    engine = create_engine(settings.DATABASE_URL)
    
    with engine.begin() as conn:
        # Tambah kolom di tabel users
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN rekening VARCHAR(100)"))
            print("  Kolom users.rekening ditambahkan")
        except Exception as e:
            print(f"  users.rekening mungkin sudah ada: {e}")

        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN nama_bank VARCHAR(100)"))
            print("  Kolom users.nama_bank ditambahkan")
        except Exception as e:
            print(f"  users.nama_bank mungkin sudah ada: {e}")

        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN nama_rekening VARCHAR(100)"))
            print("  Kolom users.nama_rekening ditambahkan")
        except Exception as e:
            print(f"  users.nama_rekening mungkin sudah ada: {e}")

        # Tambah kolom di tabel reimbursement
        try:
            conn.execute(text("ALTER TABLE reimbursement ADD COLUMN rekening_relawan VARCHAR(100)"))
            print("  Kolom reimbursement.rekening_relawan ditambahkan")
        except Exception as e:
            print(f"  reimbursement.rekening_relawan mungkin sudah ada: {e}")

        try:
            conn.execute(text("ALTER TABLE reimbursement ADD COLUMN nama_bank_relawan VARCHAR(100)"))
            print("  Kolom reimbursement.nama_bank_relawan ditambahkan")
        except Exception as e:
            print(f"  reimbursement.nama_bank_relawan mungkin sudah ada: {e}")

        try:
            conn.execute(text("ALTER TABLE reimbursement ADD COLUMN nama_relawan VARCHAR(100)"))
            print("  Kolom reimbursement.nama_relawan ditambahkan")
        except Exception as e:
            print(f"  reimbursement.nama_relawan mungkin sudah ada: {e}")

    print("Migrasi selesai!")

if __name__ == "__main__":
    run_migration()
