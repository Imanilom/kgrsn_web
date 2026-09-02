"""
Router Analitik dan Studi Banding Antar Dapur.
Menyediakan analisis penggunaan bahan baku dari PO yang dinormalisasi per PM (Penerima Manfaat)
sehingga dapur dengan jumlah PM berbeda dapat diperbandingkan secara adil (fair benchmark).
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List
from datetime import date, timedelta
from decimal import Decimal
import models, auth
from database import get_db
from config import settings

router = APIRouter()

TARIF_KECIL = Decimal(str(settings.TARIF_PORSI_KECIL or 8000))
TARIF_BESAR = Decimal(str(settings.TARIF_PORSI_BESAR or 10000))


def _get_kitchen_pm_and_pagu(db: Session, dapur_id: int, start_date: date, end_date: date, pos: list):
    """
    Ambil total PM dan total pagu untuk dapur pada rentang tanggal tertentu.
    Prioritas:
    1. Dari tabel JadwalPM
    2. Fallback dari data PO (jumlah_pm_kecil & besar)
    3. Fallback dari target_pm di Master Dapur
    """
    jadwals = (
        db.query(models.JadwalPM)
        .filter(
            models.JadwalPM.dapur_id == dapur_id,
            models.JadwalPM.tanggal >= start_date,
            models.JadwalPM.tanggal <= end_date,
        )
        .all()
    )

    pm_kecil = 0
    pm_besar = 0
    pagu_total = Decimal("0.0")

    if jadwals:
        for j in jadwals:
            if j.jenis_porsi == models.JenisPorsi.kecil:
                pm_kecil += j.jumlah_pm or 0
            elif j.jenis_porsi == models.JenisPorsi.besar:
                pm_besar += j.jumlah_pm or 0
            pagu_total += Decimal(str(j.pagu_harian or 0))
    elif pos:
        for p in pos:
            pm_kecil += p.jumlah_pm_kecil or 0
            pm_besar += p.jumlah_pm_besar or 0
        pagu_total = (Decimal(pm_kecil) * TARIF_KECIL) + (Decimal(pm_besar) * TARIF_BESAR)

    # Fallback jika tetap 0
    if pm_kecil == 0 and pm_besar == 0:
        dapur = db.query(models.Dapur).filter(models.Dapur.id == dapur_id).first()
        days = max((end_date - start_date).days + 1, 1)
        target = getattr(dapur, "target_pm", 0) or 0
        pm_besar = int(target * days)
        pagu_total = Decimal(pm_besar) * TARIF_BESAR

    total_pm = pm_kecil + pm_besar
    if pagu_total <= 0 and total_pm > 0:
        pagu_total = (Decimal(pm_kecil) * TARIF_KECIL) + (Decimal(pm_besar) * TARIF_BESAR)

    return pm_kecil, pm_besar, total_pm, pagu_total


@router.get("/summary")
def get_analitik_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    dapur_ids: Optional[str] = Query(None, description="Comma separated dapur IDs"),
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance, models.UserRole.akuntan
    )),
):
    """
    Mendapatkan ringkasan KPI dan perbandingan performa efisiensi antar dapur.
    """
    if not end_date:
        end_date = date.today()
    if not start_date:
        start_date = end_date - timedelta(days=30)

    # Filter dapur
    q_dapur = db.query(models.Dapur).filter(models.Dapur.is_active == True)
    if dapur_ids:
        try:
            ids = [int(x.strip()) for x in dapur_ids.split(",") if x.strip()]
            if ids:
                q_dapur = q_dapur.filter(models.Dapur.id.in_(ids))
        except ValueError:
            pass
    dapurs = q_dapur.order_by(models.Dapur.nama).all()

    # Query PO dalam periode
    all_pos = (
        db.query(models.PurchaseOrder)
        .filter(
            models.PurchaseOrder.tanggal_po >= start_date,
            models.PurchaseOrder.tanggal_po <= end_date,
            models.PurchaseOrder.status != models.POStatus.cancelled,
        )
        .all()
    )

    dapur_pos_map = {}
    for p in all_pos:
        dapur_pos_map.setdefault(p.dapur_id, []).append(p)

    dapur_metrics = []
    total_all_pm = 0
    total_all_belanja = Decimal("0.0")
    total_all_pagu = Decimal("0.0")

    for d in dapurs:
        pos = dapur_pos_map.get(d.id, [])
        pm_kecil, pm_besar, total_pm, pagu_total = _get_kitchen_pm_and_pagu(db, d.id, start_date, end_date, pos)

        total_belanja = sum(Decimal(str(p.total_nilai or 0)) for p in pos)
        biaya_per_pm = (total_belanja / Decimal(total_pm)).quantize(Decimal("1")) if total_pm > 0 else Decimal(0)
        
        # Rasio realisasi belanja terhadap pagu (%)
        rasio_pagu = (total_belanja / pagu_total * 100).quantize(Decimal("0.1")) if pagu_total > 0 else Decimal(0)

        # Status efisiensi
        if total_belanja == 0:
            status_efisiensi = "Belum Ada PO"
            badge_color = "muted"
        elif pagu_total > 0 and rasio_pagu <= Decimal("85.0"):
            status_efisiensi = "Sangat Efisien"
            badge_color = "success"
        elif pagu_total > 0 and rasio_pagu <= Decimal("98.0"):
            status_efisiensi = "Optimal & Wajar"
            badge_color = "primary"
        elif pagu_total > 0 and rasio_pagu <= Decimal("100.0"):
            status_efisiensi = "Mendekati Pagu"
            badge_color = "warning"
        else:
            status_efisiensi = "Over-budget" if pagu_total > 0 else "Optimal"
            badge_color = "danger" if pagu_total > 0 else "primary"

        dapur_metrics.append({
            "dapur_id": d.id,
            "kode_dapur": d.kode,
            "nama_dapur": d.nama,
            "po_count": len(pos),
            "pm_kecil": pm_kecil,
            "pm_besar": pm_besar,
            "total_pm": total_pm,
            "total_pagu": float(pagu_total),
            "total_belanja": float(total_belanja),
            "biaya_per_pm": float(biaya_per_pm),
            "rasio_pagu": float(rasio_pagu),
            "sisa_pagu": float(pagu_total - total_belanja),
            "status_efisiensi": status_efisiensi,
            "badge_color": badge_color,
        })

        total_all_pm += total_pm
        total_all_belanja += total_belanja
        total_all_pagu += pagu_total

    # Ranking efisiensi berdasarkan biaya per PM (hanya dapur yang memiliki transaksi)
    active_dapurs = [dm for dm in dapur_metrics if dm["total_belanja"] > 0 and dm["total_pm"] > 0]
    active_dapurs.sort(key=lambda x: x["biaya_per_pm"])
    for rank, dm in enumerate(active_dapurs, 1):
        dm["rank_efisiensi"] = rank

    avg_biaya_per_pm = (total_all_belanja / Decimal(total_all_pm)).quantize(Decimal("1")) if total_all_pm > 0 else Decimal(0)
    avg_rasio_pagu = (total_all_belanja / total_all_pagu * 100).quantize(Decimal("0.1")) if total_all_pagu > 0 else Decimal(0)

    # Cari dapur paling efisien
    most_efficient = active_dapurs[0] if active_dapurs else None

    return {
        "start_date": str(start_date),
        "end_date": str(end_date),
        "overview": {
            "total_dapur": len(dapurs),
            "total_pm": total_all_pm,
            "total_belanja": float(total_all_belanja),
            "total_pagu": float(total_all_pagu),
            "avg_biaya_per_pm": float(avg_biaya_per_pm),
            "avg_rasio_pagu": float(avg_rasio_pagu),
            "most_efficient_dapur": most_efficient["nama_dapur"] if most_efficient else "-",
            "lowest_cost_per_pm": most_efficient["biaya_per_pm"] if most_efficient else 0,
        },
        "dapur_metrics": dapur_metrics,
    }


@router.get("/bahan-baku")
def get_analitik_bahan_baku(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    dapur_ids: Optional[str] = Query(None, description="Comma separated dapur IDs"),
    kategori: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance, models.UserRole.akuntan
    )),
):
    """
    Studi banding volume dan biaya penggunaan bahan baku per 100 PM antar dapur.
    """
    if not end_date:
        end_date = date.today()
    if not start_date:
        start_date = end_date - timedelta(days=30)

    q_dapur = db.query(models.Dapur).filter(models.Dapur.is_active == True)
    if dapur_ids:
        try:
            ids = [int(x.strip()) for x in dapur_ids.split(",") if x.strip()]
            if ids:
                q_dapur = q_dapur.filter(models.Dapur.id.in_(ids))
        except ValueError:
            pass
    dapurs = q_dapur.order_by(models.Dapur.nama).all()
    dapur_map = {d.id: d for d in dapurs}

    # Query PO dalam periode
    pos = (
        db.query(models.PurchaseOrder)
        .filter(
            models.PurchaseOrder.dapur_id.in_(list(dapur_map.keys())),
            models.PurchaseOrder.tanggal_po >= start_date,
            models.PurchaseOrder.tanggal_po <= end_date,
            models.PurchaseOrder.status != models.POStatus.cancelled,
        )
        .all()
    )

    dapur_pos_map = {}
    po_ids = []
    for p in pos:
        dapur_pos_map.setdefault(p.dapur_id, []).append(p)
        po_ids.append(p.id)

    # Hitung total PM per dapur
    dapur_pm_map = {}
    for d_id, d in dapur_map.items():
        d_pos = dapur_pos_map.get(d_id, [])
        _, _, total_pm, _ = _get_kitchen_pm_and_pagu(db, d_id, start_date, end_date, d_pos)
        dapur_pm_map[d_id] = total_pm

    # Query item details
    items_data = {}
    if po_ids:
        q_details = (
            db.query(models.PODetail, models.PurchaseOrder.dapur_id)
            .join(models.PurchaseOrder, models.PODetail.po_id == models.PurchaseOrder.id)
            .filter(models.PODetail.po_id.in_(po_ids))
        )

        details_rows = q_details.all()

        for det, d_id in details_rows:
            raw_nama = (det.nama_item_raw or (det.item.nama_item if det.item else "Tanpa Nama")).strip()
            item_cat = det.item.kategori if (det.item and det.item.kategori) else "Lainnya"
            satuan = det.satuan or (det.item.satuan if det.item else "kg")

            # Filter search
            if search and search.lower() not in raw_nama.lower():
                continue
            # Filter kategori
            if kategori and kategori.lower() != "semua" and kategori.lower() not in item_cat.lower():
                continue

            item_key = raw_nama.lower()
            if item_key not in items_data:
                items_data[item_key] = {
                    "nama_item": raw_nama,
                    "kategori": item_cat,
                    "satuan": satuan,
                    "total_qty_all": Decimal(0),
                    "total_nilai_all": Decimal(0),
                    "per_dapur": {},
                }

            row = items_data[item_key]
            d_entry = row["per_dapur"].setdefault(d_id, {
                "qty": Decimal(0),
                "nilai": Decimal(0),
            })

            qty = Decimal(str(det.qty or 0))
            subtotal = Decimal(str(det.subtotal or 0))

            d_entry["qty"] += qty
            d_entry["nilai"] += subtotal
            row["total_qty_all"] += qty
            row["total_nilai_all"] += subtotal

    # Format output & hitung normalisasi per 100 PM
    benchmarks = []
    for k, v in items_data.items():
        per_dapur_formatted = {}
        qtys_per_100_pm = []

        for d_id, d in dapur_map.items():
            entry = v["per_dapur"].get(d_id, {"qty": Decimal(0), "nilai": Decimal(0)})
            pm = dapur_pm_map.get(d_id, 0)

            qty = entry["qty"]
            nilai = entry["nilai"]

            # Konsumsi per 100 PM: (qty / total_pm) * 100
            qty_per_100_pm = ((qty / Decimal(pm)) * 100).quantize(Decimal("0.01")) if pm > 0 else Decimal(0)
            biaya_per_pm = (nilai / Decimal(pm)).quantize(Decimal("1")) if pm > 0 else Decimal(0)
            harga_avg = (nilai / qty).quantize(Decimal("1")) if qty > 0 else Decimal(0)

            if qty_per_100_pm > 0:
                qtys_per_100_pm.append(float(qty_per_100_pm))

            per_dapur_formatted[str(d_id)] = {
                "nama_dapur": d.nama,
                "kode_dapur": d.kode,
                "qty": float(qty),
                "nilai": float(nilai),
                "qty_per_100_pm": float(qty_per_100_pm),
                "biaya_per_pm": float(biaya_per_pm),
                "harga_avg": float(harga_avg),
            }

        # Rata-rata konsumsi per 100 PM untuk bahan ini di antara dapur yang menggunakan
        avg_usage_100_pm = sum(qtys_per_100_pm) / len(qtys_per_100_pm) if qtys_per_100_pm else 0
        min_usage = min(qtys_per_100_pm) if qtys_per_100_pm else 0
        max_usage = max(qtys_per_100_pm) if qtys_per_100_pm else 0
        variance_pct = round(((max_usage - min_usage) / min_usage * 100), 1) if (min_usage > 0 and len(qtys_per_100_pm) > 1) else 0

        benchmarks.append({
            "nama_item": v["nama_item"],
            "kategori": v["kategori"],
            "satuan": v["satuan"],
            "total_qty": float(v["total_qty_all"]),
            "total_nilai": float(v["total_nilai_all"]),
            "avg_usage_per_100_pm": round(avg_usage_100_pm, 2),
            "variance_pct": variance_pct,
            "per_dapur": per_dapur_formatted,
        })

    # Urutkan berdasarkan total nilai belanja terbanyak
    benchmarks.sort(key=lambda x: x["total_nilai"], reverse=True)

    return {
        "start_date": str(start_date),
        "end_date": str(end_date),
        "dapurs": [{"id": d.id, "kode": d.kode, "nama": d.nama, "total_pm": dapur_pm_map.get(d.id, 0)} for d in dapurs],
        "items": benchmarks,
    }


@router.get("/komparasi")
def get_komparasi_head_to_head(
    dapur_a_id: int,
    dapur_b_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance, models.UserRole.akuntan
    )),
):
    """
    Komparasi head-to-head langsung antara 2 dapur terpilih.
    Menganalisis selisih biaya per PM, breakdown biaya per kategori bahan,
    dan top item dengan disparitas pemakaian tertinggi per 100 PM.
    """
    if not end_date:
        end_date = date.today()
    if not start_date:
        start_date = end_date - timedelta(days=30)

    dapur_a = db.query(models.Dapur).filter(models.Dapur.id == dapur_a_id).first()
    dapur_b = db.query(models.Dapur).filter(models.Dapur.id == dapur_b_id).first()

    if not dapur_a or not dapur_b:
        return {"error": "Dapur tidak ditemukan"}

    def _get_dapur_stats(d_id):
        pos = (
            db.query(models.PurchaseOrder)
            .filter(
                models.PurchaseOrder.dapur_id == d_id,
                models.PurchaseOrder.tanggal_po >= start_date,
                models.PurchaseOrder.tanggal_po <= end_date,
                models.PurchaseOrder.status != models.POStatus.cancelled,
            )
            .all()
        )
        pm_kecil, pm_besar, total_pm, pagu_total = _get_kitchen_pm_and_pagu(db, d_id, start_date, end_date, pos)
        total_belanja = sum(Decimal(str(p.total_nilai or 0)) for p in pos)
        biaya_per_pm = (total_belanja / Decimal(total_pm)).quantize(Decimal("1")) if total_pm > 0 else Decimal(0)

        # Breakdown per kategori bahan & per item
        cat_map = {}
        item_map = {}
        po_ids = [p.id for p in pos]
        if po_ids:
            details = db.query(models.PODetail).filter(models.PODetail.po_id.in_(po_ids)).all()
            for det in details:
                kategori = det.item.kategori if (det.item and det.item.kategori) else "Lainnya"
                nama = (det.nama_item_raw or (det.item.nama_item if det.item else "Tanpa Nama")).strip()
                satuan = det.satuan or "kg"

                subtotal = Decimal(str(det.subtotal or 0))
                qty = Decimal(str(det.qty or 0))

                cat_map[kategori] = cat_map.get(kategori, Decimal(0)) + subtotal
                
                it = item_map.setdefault(nama.lower(), {
                    "nama": nama,
                    "kategori": kategori,
                    "satuan": satuan,
                    "qty": Decimal(0),
                    "nilai": Decimal(0),
                })
                it["qty"] += qty
                it["nilai"] += subtotal

        # Format kategori per PM
        cat_per_pm = {}
        for cat, val in cat_map.items():
            cat_per_pm[cat] = float((val / Decimal(total_pm)).quantize(Decimal("1"))) if total_pm > 0 else 0

        return {
            "pos": pos,
            "total_pm": total_pm,
            "pm_kecil": pm_kecil,
            "pm_besar": pm_besar,
            "total_belanja": float(total_belanja),
            "pagu_total": float(pagu_total),
            "biaya_per_pm": float(biaya_per_pm),
            "kategori_per_pm": cat_per_pm,
            "items": item_map,
        }

    stats_a = _get_dapur_stats(dapur_a_id)
    stats_b = _get_dapur_stats(dapur_b_id)

    # Cari selisih per kategori
    all_cats = set(stats_a["kategori_per_pm"].keys()) | set(stats_b["kategori_per_pm"].keys())
    kategori_comparison = []
    for c in sorted(all_cats):
        val_a = stats_a["kategori_per_pm"].get(c, 0)
        val_b = stats_b["kategori_per_pm"].get(c, 0)
        diff = val_a - val_b
        kategori_comparison.append({
            "kategori": c,
            "biaya_pm_a": val_a,
            "biaya_pm_b": val_b,
            "diff": diff,
            "more_expensive": dapur_a.nama if diff > 0 else (dapur_b.nama if diff < 0 else "Sama"),
        })

    # Item disparity analysis per 100 PM
    all_item_keys = set(stats_a["items"].keys()) | set(stats_b["items"].keys())
    item_disparities = []
    for k in all_item_keys:
        it_a = stats_a["items"].get(k)
        it_b = stats_b["items"].get(k)

        nama = (it_a or it_b)["nama"]
        satuan = (it_a or it_b)["satuan"]
        kategori = (it_a or it_b)["kategori"]

        qty_a = it_a["qty"] if it_a else Decimal(0)
        qty_b = it_b["qty"] if it_b else Decimal(0)

        pm_a = stats_a["total_pm"]
        pm_b = stats_b["total_pm"]

        per_100_pm_a = float(((qty_a / Decimal(pm_a)) * 100).quantize(Decimal("0.01"))) if pm_a > 0 else 0
        per_100_pm_b = float(((qty_b / Decimal(pm_b)) * 100).quantize(Decimal("0.01"))) if pm_b > 0 else 0

        diff_qty_100 = round(per_100_pm_a - per_100_pm_b, 2)
        diff_pct = round((abs(diff_qty_100) / max(min(per_100_pm_a, per_100_pm_b) or 1, 1)) * 100, 1) if (per_100_pm_a > 0 and per_100_pm_b > 0) else 100

        item_disparities.append({
            "nama": nama,
            "kategori": kategori,
            "satuan": satuan,
            "per_100_pm_a": per_100_pm_a,
            "per_100_pm_b": per_100_pm_b,
            "diff_100_pm": diff_qty_100,
            "diff_pct": diff_pct,
            "higher_consumer": dapur_a.nama if diff_qty_100 > 0 else (dapur_b.nama if diff_qty_100 < 0 else "Sama"),
        })

    # Urutkan berdasarkan selisih absolut tertinggi
    item_disparities.sort(key=lambda x: abs(x["diff_100_pm"]), reverse=True)

    diff_biaya_pm = stats_a["biaya_per_pm"] - stats_b["biaya_per_pm"]
    pct_diff_biaya = round((abs(diff_biaya_pm) / max(stats_b["biaya_per_pm"] or 1, 1)) * 100, 1)

    return {
        "start_date": str(start_date),
        "end_date": str(end_date),
        "dapur_a": {
            "id": dapur_a.id,
            "kode": dapur_a.kode,
            "nama": dapur_a.nama,
            "total_pm": stats_a["total_pm"],
            "pm_kecil": stats_a["pm_kecil"],
            "pm_besar": stats_a["pm_besar"],
            "total_belanja": stats_a["total_belanja"],
            "pagu_total": stats_a["pagu_total"],
            "biaya_per_pm": stats_a["biaya_per_pm"],
        },
        "dapur_b": {
            "id": dapur_b.id,
            "kode": dapur_b.kode,
            "nama": dapur_b.nama,
            "total_pm": stats_b["total_pm"],
            "pm_kecil": stats_b["pm_kecil"],
            "pm_besar": stats_b["pm_besar"],
            "total_belanja": stats_b["total_belanja"],
            "pagu_total": stats_b["pagu_total"],
            "biaya_per_pm": stats_b["biaya_per_pm"],
        },
        "head_to_head_summary": {
            "diff_biaya_per_pm": diff_biaya_pm,
            "diff_pct": pct_diff_biaya,
            "cheaper_dapur": dapur_b.nama if diff_biaya_pm > 0 else (dapur_a.nama if diff_biaya_pm < 0 else "Sama"),
            "hemat_per_pm": abs(diff_biaya_pm),
        },
        "kategori_comparison": kategori_comparison,
        "top_item_disparities": item_disparities[:25],
    }
