"""
FastAPI - KGRSN PO Management System
Entry point aplikasi backend.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from datetime import date
import os

from database import init_db, get_db, check_connection
from config import settings
import models, auth
from auth import hash_password
from routers.auth import router as auth_router
from routers.dapur import router as dapur_router
from routers.master import router as master_router
from routers.po import router as po_router
from routers.invoice import router as invoice_router
from routers.other import sj_router, rab_router, dashboard_router
from routers.jadwal_pm import router as jadwal_pm_router
from routers.realisasi import router as realisasi_router
from routers.rekap import router as rekap_router
from routers.supplier import router as supplier_router
from routers.hutang_piutang import hutang_router, piutang_router, operasional_router
from routers.rekap_pembelanjaan import router as rekap_pembelanjaan_router
from routers.laporan import router as laporan_router
from routers.tren_harga import router as tren_harga_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inisialisasi database dan buat user super_admin default jika belum ada."""
    init_db()

    db: Session = next(get_db())
    try:
        # Buat super_admin default jika belum ada
        if not db.query(models.User).filter(models.User.username == "admin").first():
            admin = models.User(
                username="admin",
                full_name="Super Administrator",
                hashed_password=hash_password("admin123"),
                role=models.UserRole.super_admin,
            )
            db.add(admin)
            db.commit()
            print("✅ Default super_admin created: admin / admin123")
            print("   ⚠️  HARAP GANTI PASSWORD setelah login pertama!")
    finally:
        db.close()
    yield

app = FastAPI(
    title="KGRSN PO Management System",
    version="1.0.0",
    description="Sistem manajemen Purchase Order multi-dapur",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static Files ──────────────────────────────────────────────────────────────
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.GENERATED_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
app.mount("/generated", StaticFiles(directory=settings.GENERATED_DIR), name="generated")

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router,                prefix="/api/auth",                tags=["Auth & Users"])
app.include_router(dapur_router,               prefix="/api/dapur",               tags=["Dapur"])
app.include_router(master_router,              prefix="/api/master",              tags=["Master Item & Harga"])
app.include_router(po_router,                  prefix="/api/po",                  tags=["Purchase Order"])
app.include_router(realisasi_router,           prefix="/api/realisasi",           tags=["PO Realisasi"])
app.include_router(invoice_router,             prefix="/api/invoice",             tags=["Invoice"])
app.include_router(sj_router,                  prefix="/api/surat-jalan",         tags=["Surat Jalan"])
app.include_router(rab_router,                 prefix="/api/rab",                 tags=["RAB"])
app.include_router(dashboard_router,           prefix="/api/dashboard",           tags=["Dashboard"])
app.include_router(jadwal_pm_router,           prefix="/api/jadwal-pm",           tags=["Jadwal PM & Pagu"])
app.include_router(rekap_router,               prefix="/api/rekap",               tags=["Rekap Mingguan"])
# Fitur Baru
app.include_router(supplier_router,            prefix="/api/supplier",            tags=["Supplier"])
app.include_router(hutang_router,              prefix="/api/hutang",              tags=["Hutang Supplier"])
app.include_router(piutang_router,             prefix="/api/piutang",             tags=["Piutang Dapur"])
app.include_router(operasional_router,         prefix="/api/operasional",         tags=["Operasional Cost"])
app.include_router(rekap_pembelanjaan_router,  prefix="/api/rekap-pembelanjaan",  tags=["Rekap Pembelanjaan"])
app.include_router(laporan_router,             prefix="/api/laporan",             tags=["Laporan Keuangan"])
app.include_router(tren_harga_router,          prefix="/api/tren-harga",          tags=["Tren Harga & Analitik"])


# ── Startup/Lifespan ──────────────────────────────────────────────────────────
# (Dipindah ke lifespan event handler di atas)



@app.get("/")
def root():
    return {
        "name": "KGRSN PO Management System",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    db_ok = check_connection()
    return {
        "status": "healthy" if db_ok else "degraded",
        "database": "connected" if db_ok else "disconnected",
    }

if __name__ == "__main__":
    import uvicorn
    # Jalankan server uvicorn pada port 8000
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
