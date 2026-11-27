from sqlalchemy import create_engine, inspect, text, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError, DisconnectionError
from config import settings
import time
import logging

logger = logging.getLogger(__name__)

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,      # Cek koneksi sebelum dipakai (reconnect otomatis jika terputus)
    pool_recycle=1800,       # Recycle koneksi tiap 30 menit
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,         # Timeout 30s saat menunggu koneksi dari pool
    echo=False,              # Set True untuk debug SQL queries
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def migrate_invoice_kendaraan_legacy_column(connection):
    """Make obsolete single-vehicle fields nullable on upgraded databases."""
    if connection.dialect.name != "mysql":
        return

    columns = inspect(connection).get_columns("invoice_kendaraan")
    legacy_column_names = {"kendaraan", "harga_satuan", "satuan_waktu", "kuantitas"}
    for legacy_column in columns:
        if legacy_column["name"] not in legacy_column_names or legacy_column["nullable"]:
            continue

        column_type = legacy_column["type"].compile(dialect=connection.dialect)
        connection.execute(text(
            "ALTER TABLE invoice_kendaraan "
            f"MODIFY COLUMN `{legacy_column['name']}` "
            f"{column_type} NULL"
        ))
        print(
            f"✅ Legacy invoice_kendaraan.{legacy_column['name']} "
            "column is now nullable"
        )


def migrate_mutasi_kas_kind(connection):
    """Add transaction direction to existing bank statement imports."""
    tables = inspect(connection).get_table_names()
    if "mutasi_kas" not in tables:
        return
    columns = {column["name"] for column in inspect(connection).get_columns("mutasi_kas")}
    if "jenis" not in columns:
        connection.execute(text(
            "ALTER TABLE mutasi_kas "
            "ADD COLUMN jenis VARCHAR(10) NOT NULL DEFAULT 'debit'"
        ))


def migrate_mutasi_kas_links(connection):
    """Preserve existing one-to-one matches in the many-to-many link table."""
    tables = inspect(connection).get_table_names()
    if "mutasi_kas" not in tables or "mutasi_kas_transaksi" not in tables:
        return
    columns = {column["name"] for column in inspect(connection).get_columns("mutasi_kas")}
    if "transaksi_belanja_id" not in columns:
        return

    connection.execute(text(
        "INSERT INTO mutasi_kas_transaksi (mutasi_kas_id, transaksi_belanja_id) "
        "SELECT legacy.id, legacy.transaksi_belanja_id "
        "FROM mutasi_kas AS legacy "
        "WHERE legacy.transaksi_belanja_id IS NOT NULL "
        "AND NOT EXISTS ("
        "SELECT 1 FROM mutasi_kas_transaksi AS link "
        "WHERE link.mutasi_kas_id = legacy.id "
        "AND link.transaksi_belanja_id = legacy.transaksi_belanja_id"
        ")"
    ))


def migrate_invoice_po_item_order(connection):
    """Persist the display order for PO and invoice line items."""
    tables = inspect(connection).get_table_names()
    for table_name in ("po_detail", "invoice_detail"):
        if table_name not in tables:
            continue
        columns = {column["name"] for column in inspect(connection).get_columns(table_name)}
        if "urutan" in columns:
            continue
        connection.execute(text(
            f"ALTER TABLE {table_name} ADD COLUMN urutan INTEGER NOT NULL DEFAULT 0"
        ))
        connection.execute(text(
            f"UPDATE {table_name} SET urutan = id"
        ))


def get_db():
    """Dependency untuk FastAPI - inject database session dengan retry singkat."""
    db = SessionLocal()
    try:
        yield db
    except (OperationalError, DisconnectionError) as e:
        # Jika DB sempat mati lalu restart, invalidate pool agar koneksi berikutnya fresh
        logger.warning(f"DB connection error in request, invalidating pool: {e}")
        engine.dispose()
        raise
    finally:
        db.close()


def init_db():
    """Buat semua tabel jika belum ada. Retry sampai DB siap."""
    import time
    max_retries = 30
    for attempt in range(max_retries):
        try:
            Base.metadata.create_all(bind=engine)
            with engine.begin() as conn:
                migrate_invoice_kendaraan_legacy_column(conn)
                migrate_mutasi_kas_kind(conn)
                migrate_mutasi_kas_links(conn)
                migrate_invoice_po_item_order(conn)
            try:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE master_harga MODIFY COLUMN margin_persen DECIMAL(10, 2) DEFAULT 0.00;"))
                    conn.commit()
            except Exception:
                pass
            print(f"✅ Database connected (attempt {attempt + 1})")
            return
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"⏳ DB not ready yet (attempt {attempt + 1}/{max_retries}), retrying in 3s... ({e})")
                time.sleep(3)
            else:
                raise RuntimeError(f"❌ Cannot connect to database after {max_retries} attempts: {e}")


def check_connection():
    """Cek koneksi ke database."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        print(f"Database connection error: {e}")
        return False
