from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,      # Cek koneksi sebelum dipakai (reconnect otomatis jika terputus)
    pool_recycle=300,        # Recycle koneksi tiap 5 menit agar koneksi stale tidak dipakai
    pool_size=10,
    max_overflow=20,
    echo=False,              # Set True untuk debug SQL queries
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency untuk FastAPI - inject database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Buat semua tabel jika belum ada. Retry sampai DB siap."""
    import time
    max_retries = 30
    for attempt in range(max_retries):
        try:
            Base.metadata.create_all(bind=engine)
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
