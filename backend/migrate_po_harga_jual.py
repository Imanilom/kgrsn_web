import sys
from sqlalchemy import text
from database import SessionLocal

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
        print("Gagal melakukan migrasi: {0}".format(e))
    finally:
        db.close()
        print("Selesai.")

if __name__ == "__main__":
    run_migration()

