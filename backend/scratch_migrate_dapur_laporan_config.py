"""
Migration: Tambah kolom konfigurasi laporan L/R ke tabel dapur.

Jalankan sekali:
    cd backend
    python scratch_migrate_dapur_laporan_config.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from database import engine
from sqlalchemy import text

SQL = """
ALTER TABLE dapur
    ADD COLUMN laporan_terpisah TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'True = dapur ini punya laporan L/R mandiri (terpisah dari gabungan)',
    ADD COLUMN overhead_persen  DECIMAL(5,2)     NULL
        COMMENT 'Persen overhead dari laba kotor (diisi jika laporan_terpisah = 1)';
"""

def run():
    with engine.connect() as conn:
        conn.execute(text(SQL))
        conn.commit()
    print("✅ Migration berhasil: kolom laporan_terpisah & overhead_persen ditambahkan ke tabel dapur.")

if __name__ == "__main__":
    run()
