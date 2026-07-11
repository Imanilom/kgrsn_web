from sqlalchemy import create_engine, text
from config import settings
import sys

engine = create_engine(settings.DATABASE_URL)

with engine.connect() as conn:
    # Check if table already exists
    result = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = :db AND table_name = 'jadwal_pm'",
    ), {"db": settings.DB_NAME})
    exists = result.scalar() > 0

    if exists:
        print("Table jadwal_pm already exists, skipping.")
        sys.exit(0)

    print("Creating jadwal_pm table...")
    conn.execute(text("""
        CREATE TABLE jadwal_pm (
            id INT NOT NULL AUTO_INCREMENT,
            dapur_id INT NOT NULL,
            tanggal DATE NOT NULL,
            jumlah_pm INT NOT NULL DEFAULT 0,
            jenis_porsi ENUM('kecil','besar') NOT NULL DEFAULT 'kecil',
            pagu_harian DECIMAL(15,2) NOT NULL DEFAULT 0,
            catatan TEXT NULL,
            created_by INT NULL,
            created_at DATETIME DEFAULT NOW(),
            PRIMARY KEY (id),
            UNIQUE KEY uq_dapur_tanggal (dapur_id, tanggal),
            CONSTRAINT fk_jadwal_dapur FOREIGN KEY (dapur_id) REFERENCES dapur(id) ON DELETE CASCADE,
            CONSTRAINT fk_jadwal_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """))
    conn.commit()
    print("Migration successful: table jadwal_pm created.")
