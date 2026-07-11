"""
Router: Tren Harga & Analitik Otomatis
Prefix: /api/tren-harga
"""
import os
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session

import models, auth
from database import get_db
from services.excel_importer import (
    import_excel_to_db, get_histori_harga, normalize_nama
)
from services.tren_harga_service import analisis_item_penuh, analisis_mini
from services.kepokmas_scraper import get_het

router = APIRouter()
logger = logging.getLogger(__name__)

EXCEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "Rekap Mei-Juni 2026.xlsx")


# ── Helper ───────────────────────────────────────────────────────────────────

def _get_analisis(nama_item: str, db: Session, mini: bool = False) -> dict:
    nama_norm = normalize_nama(nama_item)
    histori   = get_histori_harga(nama_norm, db, limit=90)
    het_data  = get_het(nama_norm, db)

    if mini:
        result = analisis_mini(histori, het_data)
    else:
        result = analisis_item_penuh(histori, het_data)

    result["nama_item"]  = nama_norm
    result["nama_asli"]  = nama_item
    result["het_info"]   = het_data
    return result


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/item/{nama_item}/mini")
def get_tren_mini(
    nama_item: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    """
    Ringkasan tren cepat untuk tooltip di halaman Buat PO.
    Response kecil dan cepat (< 100ms).
    """
    try:
        return _get_analisis(nama_item, db, mini=True)
    except Exception as e:
        logger.error(f"Error analisis mini {nama_item}: {e}")
        raise HTTPException(500, detail=str(e))


@router.get("/item/{nama_item}")
def get_tren_detail(
    nama_item: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    """
    Analisis lengkap satu item: statistik, tren, moving average, forecast, HET, margin, skor.
    Digunakan di panel detail slide-in halaman Buat PO dan halaman /harga-analitik.
    """
    try:
        return _get_analisis(nama_item, db, mini=False)
    except Exception as e:
        logger.error(f"Error analisis detail {nama_item}: {e}")
        raise HTTPException(500, detail=str(e))


@router.post("/batch")
def get_tren_batch(
    payload: dict,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    """
    Analisis mini untuk banyak item sekaligus (untuk load saat katalog PO tampil).
    Payload: { "items": ["Beras", "Cabai merah", ...] }
    """
    items = payload.get("items", [])
    if not items or not isinstance(items, list):
        raise HTTPException(400, detail="'items' harus berupa list nama barang")
    if len(items) > 100:
        raise HTTPException(400, detail="Maksimal 100 item per batch")

    results = {}
    for nama in items:
        try:
            results[nama] = _get_analisis(nama, db, mini=True)
        except Exception as e:
            logger.warning(f"Skip item {nama}: {e}")
            results[nama] = {"status": "error", "pesan": str(e)}

    return {"results": results, "total": len(results)}


@router.get("/het/{nama_item}")
def get_het_item(
    nama_item: str,
    refresh: bool = False,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    """
    Ambil data HET dari Kepokmas untuk satu item.
    Cache 6 jam. Gunakan ?refresh=true untuk paksa scrape ulang.
    """
    try:
        return get_het(normalize_nama(nama_item), db, force_refresh=refresh)
    except Exception as e:
        raise HTTPException(500, detail=f"Gagal ambil HET: {str(e)}")


@router.get("/dashboard")
def get_dashboard(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    """
    Data ringkasan untuk halaman /harga-analitik.
    Menganalisis semua item yang ada di price_history.
    """
    # Ambil semua nama item unik dari DB
    rows = (
        db.query(models.PriceHistory.nama_item)
        .distinct()
        .order_by(models.PriceHistory.nama_item)
        .all()
    )
    all_items = [r[0] for r in rows]

    if not all_items:
        return {
            "items": [],
            "total_items": 0,
            "summary": {"naik": 0, "turun": 0, "stabil": 0, "melebihi_het": 0},
            "pesan": "Belum ada data. Import Excel terlebih dahulu.",
        }

    results = []
    summary = {"naik": 0, "turun": 0, "stabil": 0, "melebihi_het": 0}

    for nama in all_items:
        try:
            hist = get_histori_harga(nama, db, limit=30)
            het_data = get_het(nama, db)
            mini = analisis_mini(hist, het_data)
            mini["nama_item"] = nama

            tren = mini.get("trend", "stabil")
            summary[tren] = summary.get(tren, 0) + 1
            if mini.get("status_het") == "melebihi":
                summary["melebihi_het"] += 1

            results.append(mini)
        except Exception as e:
            logger.warning(f"Skip {nama} in dashboard: {e}")

    # Sort by skor descending
    results.sort(key=lambda x: x.get("skor", 0), reverse=True)

    return {
        "items": results,
        "total_items": len(results),
        "summary": summary,
    }


@router.post("/import-excel")
def import_excel(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin
    )),
):
    """
    Import histori harga dari file Excel default (Rekap Mei-Juni 2026.xlsx).
    """
    if not os.path.exists(EXCEL_PATH):
        raise HTTPException(
            404,
            detail=f"File Excel tidak ditemukan: {os.path.basename(EXCEL_PATH)}. "
                   "Pastikan file ada di direktori backend."
        )
    try:
        stats = import_excel_to_db(EXCEL_PATH, db)
        return {
            "status": "berhasil",
            "pesan": "Import selesai",
            "statistik": stats,
        }
    except Exception as e:
        logger.error(f"Import Excel error: {e}")
        raise HTTPException(500, detail=f"Gagal import: {str(e)}")


@router.post("/import-excel-upload")
async def import_excel_upload(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin
    )),
):
    """Import dari file Excel yang di-upload langsung."""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, detail="Hanya file Excel (.xlsx/.xls) yang diterima")

    import tempfile, aiofiles
    content = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        stats = import_excel_to_db(tmp_path, db)
        return {"status": "berhasil", "statistik": stats}
    except Exception as e:
        raise HTTPException(500, detail=str(e))
    finally:
        os.unlink(tmp_path)


@router.get("/items")
def list_items_tersedia(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    """Daftar item yang memiliki histori harga di database."""
    from sqlalchemy import func as sqlfunc
    items_q = (
        db.query(
            models.PriceHistory.nama_item,
            sqlfunc.count(models.PriceHistory.id).label("jumlah"),
            sqlfunc.max(models.PriceHistory.tanggal).label("tanggal_terakhir"),
        )
        .group_by(models.PriceHistory.nama_item)
        .order_by(models.PriceHistory.nama_item)
        .all()
    )
    return [
        {
            "nama_item":      r.nama_item,
            "jumlah_data":    r.jumlah,
            "tanggal_terakhir": str(r.tanggal_terakhir) if r.tanggal_terakhir else None,
        }
        for r in items_q
    ]


@router.get("/forecast")
def get_forecast_per_kategori(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    """
    Harga forecast semua item, dikelompokkan berdasarkan kategori item (groceries / perishable).
    Untuk setiap item: harga terakhir, forecast 7 hari, forecast 30 hari, tren, margin rekomendasi.
    """
    from sqlalchemy import func as sqlfunc

    # Ambil semua item dengan kategori dari master_item yang juga punya histori harga
    items_with_kategori = (
        db.query(
            models.MasterItem.nama_item,
            models.MasterItem.kategori,
            models.MasterItem.satuan,
        )
        .filter(models.MasterItem.is_active == True)
        .all()
    )

    # Juga tambahkan item dari price_history yang belum ada di master_item
    existing_names = {i.nama_item.lower() for i in items_with_kategori}
    ph_items = (
        db.query(
            models.PriceHistory.nama_item,
            sqlfunc.max(models.PriceHistory.tanggal).label("tanggal_terakhir"),
        )
        .group_by(models.PriceHistory.nama_item)
        .all()
    )

    results = {"groceries": [], "perishable": [], "lainnya": []}

    processed = set()
    for mi in items_with_kategori:
        nama_norm = mi.nama_item.lower().strip()
        if nama_norm in processed:
            continue
        processed.add(nama_norm)

        try:
            hist = get_histori_harga(mi.nama_item, db, limit=60)
            if not hist:
                continue
            het_data = get_het(mi.nama_item, db)
            mini = analisis_mini(hist, het_data)
            mini["nama_item"] = mi.nama_item
            mini["satuan"] = mi.satuan
            mini["kategori"] = mi.kategori or "lainnya"

            kategori_key = (mi.kategori or "lainnya").lower()
            if "grocer" in kategori_key or "sembako" in kategori_key or "kering" in kategori_key:
                results["groceries"].append(mini)
            elif "perish" in kategori_key or "segar" in kategori_key or "sayur" in kategori_key or "daging" in kategori_key:
                results["perishable"].append(mini)
            else:
                results["lainnya"].append(mini)
        except Exception as e:
            logger.warning(f"Skip {mi.nama_item} in forecast: {e}")

    # Tambahkan item dari price_history yang tidak ada di master_item
    for ph in ph_items:
        nama_norm = ph.nama_item.lower().strip()
        if nama_norm in processed:
            continue
        processed.add(nama_norm)
        try:
            hist = get_histori_harga(ph.nama_item, db, limit=60)
            if not hist:
                continue
            het_data = get_het(ph.nama_item, db)
            mini = analisis_mini(hist, het_data)
            mini["nama_item"] = ph.nama_item
            mini["satuan"] = None
            mini["kategori"] = "lainnya"
            results["lainnya"].append(mini)
        except Exception as e:
            logger.warning(f"Skip PH {ph.nama_item} in forecast: {e}")

    # Sort each category by nama_item
    for k in results:
        results[k].sort(key=lambda x: x.get("nama_item", ""))

    summary = {
        "total_groceries": len(results["groceries"]),
        "total_perishable": len(results["perishable"]),
        "total_lainnya": len(results["lainnya"]),
    }

    return {
        "groceries": results["groceries"],
        "perishable": results["perishable"],
        "lainnya": results["lainnya"],
        "summary": summary,
    }

