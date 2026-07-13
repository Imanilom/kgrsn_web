"""
Router untuk Konfigurasi System (margin, tarif, dll).
Hanya admin/super_admin yang bisa mengubah.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from decimal import Decimal
import models, auth
from database import get_db
from config import settings

router = APIRouter()

# Default values jika belum diisi di DB
DEFAULTS = {
    "margin_persen": {"nilai": str(settings.MARGIN_PERSEN * 100), "deskripsi": "Margin keuntungan penjualan (%)"},
    "tarif_porsi_kecil": {"nilai": str(settings.TARIF_PORSI_KECIL), "deskripsi": "Tarif per penerima manfaat porsi kecil (Rp)"},
    "tarif_porsi_besar": {"nilai": str(settings.TARIF_PORSI_BESAR), "deskripsi": "Tarif per penerima manfaat porsi besar (Rp)"},
}


def get_config(db: Session, kunci: str) -> str:
    """Ambil nilai konfigurasi dari DB. Fallback ke default jika belum diisi."""
    row = db.query(models.KonfigurasiSystem).filter(
        models.KonfigurasiSystem.kunci == kunci
    ).first()
    if row:
        return row.nilai
    return DEFAULTS.get(kunci, {}).get("nilai", "")


def get_margin_persen(db: Session) -> Decimal:
    """Ambil margin persen sebagai Decimal (contoh: 0.15 untuk 15%)."""
    val = get_config(db, "margin_persen")
    try:
        return Decimal(str(float(val) / 100))
    except Exception:
        return Decimal(str(settings.MARGIN_PERSEN))


@router.get("/")
def list_config(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Ambil semua konfigurasi sistem."""
    result = []
    for kunci, default in DEFAULTS.items():
        row = db.query(models.KonfigurasiSystem).filter(
            models.KonfigurasiSystem.kunci == kunci
        ).first()
        result.append({
            "kunci": kunci,
            "nilai": row.nilai if row else default["nilai"],
            "deskripsi": default["deskripsi"],
            "updated_at": row.updated_at if row else None,
        })
    return result


@router.put("/{kunci}")
def update_config(
    kunci: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin
    )),
):
    """Update nilai konfigurasi. Hanya admin."""
    if kunci not in DEFAULTS:
        raise HTTPException(status_code=404, detail=f"Konfigurasi '{kunci}' tidak dikenal")

    nilai = str(payload.get("nilai", "")).strip()
    if not nilai:
        raise HTTPException(status_code=400, detail="Nilai tidak boleh kosong")

    # Validasi tipe data
    try:
        float(nilai)
    except ValueError:
        raise HTTPException(status_code=400, detail="Nilai harus berupa angka")

    row = db.query(models.KonfigurasiSystem).filter(
        models.KonfigurasiSystem.kunci == kunci
    ).first()
    if row:
        row.nilai = nilai
    else:
        row = models.KonfigurasiSystem(
            kunci=kunci,
            nilai=nilai,
            deskripsi=DEFAULTS[kunci]["deskripsi"]
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return {"kunci": kunci, "nilai": row.nilai, "message": "Konfigurasi berhasil diperbarui"}
