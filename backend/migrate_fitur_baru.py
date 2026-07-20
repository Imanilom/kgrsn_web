"""
Migrasi database untuk fitur baru KGRSN:
1. Tambah kolom jenis_po ke tabel purchase_order
2. Tambah kolom bukti_bayar_path ke tabel pembayaran_hutang
3. Buat tabel reimbursement baru
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine, Base
import models  # noqa

def column_exists(conn, table_name, column_name):
    result = conn.execute(text(
        f"SELECT column_name FROM information_schema.columns "
        f"WHERE table_name='{table_name}' AND column_name='{column_name}'"
    ))
    return result.fetchone() is not None


def run_migration():
    with engine.connect() as conn:
        # 1. purchase_order: tambah jenis_po
        if not column_exists(conn, "purchase_order", "jenis_po"):
            print("  Tambah kolom purchase_order.jenis_po ...")
            conn.execute(text(
                "ALTER TABLE purchase_order "
                "ADD COLUMN jenis_po VARCHAR(20) NOT NULL DEFAULT 'bahan_baku'"
            ))
            print("    OK purchase_order.jenis_po ditambahkan")
        else:
            print("    SKIP purchase_order.jenis_po sudah ada")

        # 2. pembayaran_hutang: tambah bukti_bayar_path
        if not column_exists(conn, "pembayaran_hutang", "bukti_bayar_path"):
            print("  Tambah kolom pembayaran_hutang.bukti_bayar_path ...")
            conn.execute(text(
                "ALTER TABLE pembayaran_hutang "
                "ADD COLUMN bukti_bayar_path VARCHAR(500)"
            ))
            print("    OK pembayaran_hutang.bukti_bayar_path ditambahkan")
        else:
            print("    SKIP pembayaran_hutang.bukti_bayar_path sudah ada")

        conn.commit()

    # 3. Buat tabel baru via SQLAlchemy
    print("  Sinkronisasi tabel baru via SQLAlchemy ...")
    Base.metadata.create_all(engine, checkfirst=True)
    print("    OK tabel reimbursement dibuat")
    print("\nMigrasi selesai!")


if __name__ == "__main__":
    print("Menjalankan migrasi database KGRSN ...")
    run_migration()
