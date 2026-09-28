"""
Router Analitik dan Studi Banding Antar Dapur.
Menyediakan analisis penggunaan bahan baku dari PO yang dinormalisasi per PM (Penerima Manfaat)
sehingga dapur dengan jumlah PM berbeda dapat diperbandingkan secara adil (fair benchmark).

CATATAN KONSISTENSI (v2):
- Semua kalkulasi 'terpakai / belanja' menggunakan harga_jual (bukan harga_satuan/total_nilai),
  sama persis seperti jadwal_pm._terpakai_harian(), sehingga perbandingan vs pagu valid dan
  tidak akan memunculkan 'over-budget palsu' yang sering dikeluhkan pihak dapur.
- Pagu tetap dihitung dari JadwalPM.pagu_harian (= jumlah_pm x tarif).
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
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


def _harga_jual_po(po_detail: models.PODetail) -> Decimal:
    """
    Ambil harga efektif (harga_jual) dari satu PODetail.
    Logika identik dengan jadwal_pm._terpakai_harian() agar angka konsisten di seluruh sistem:
      1. Gunakan harga_jual jika > 0
      2. Fallback ke harga_satuan
    """
    hj = po_detail.harga_jual
    if hj and Decimal(str(hj)) > 0:
        return Decimal(str(hj))
    return Decimal(str(po_detail.harga_satuan or 0))


def _total_nilai_jual_po(po_details: list) -> Decimal:
    """Hitung total nilai berdasarkan harga_jual (bukan harga_satuan/total_nilai PO)."""
    total = Decimal(0)
    for det in po_details:
        total += Decimal(str(det.qty or 0)) * _harga_jual_po(det)
    return total


def _get_kitchen_pm_and_pagu(db: Session, dapur_id: int, start_date: date, end_date: date, pos: list):
    """
    Ambil total PM dan total pagu untuk dapur pada rentang tanggal tertentu.
    Prioritas:
    1. Dari tabel JadwalPM (per hari)
    2. Untuk hari PO tanpa JadwalPM → estimasi dari data PM di PO (jumlah_pm_kecil/besar)
       sehingga hari-hari tersebut tidak menghasilkan pagu=0 yang membuat over-budget palsu.
    3. Fallback dari target_pm di Master Dapur jika semua 0

    PENTING: Jika JadwalPM hanya ada untuk sebagian hari dalam periode, sementara
    PO ada di hari-hari lain tanpa jadwal, tanpa fix ini pagu menjadi under-count
    dan memunculkan over-budget palsu yang dikeluhkan pihak dapur.
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
        jadwal_dates = set()
        for j in jadwals:
            if j.jenis_porsi == models.JenisPorsi.kecil:
                pm_kecil += j.jumlah_pm or 0
            elif j.jenis_porsi == models.JenisPorsi.besar:
                pm_besar += j.jumlah_pm or 0
            pagu_total += Decimal(str(j.pagu_harian or 0))
            jadwal_dates.add(j.tanggal)

        # Suplemen: untuk hari dengan PO tapi TIDAK ada JadwalPM,
        # estimasi pagu dari data PM di PO agar tidak terjadi over-budget palsu.
        # Kelompokkan per tanggal (max per hari) agar tidak double-count.
        ungrouped: dict = {}
        for p in pos:
            tgl = p.tanggal_po
            if tgl not in jadwal_dates:
                if tgl not in ungrouped:
                    ungrouped[tgl] = {"kecil": 0, "besar": 0}
                # Ambil nilai terbesar dari PO di hari yang sama
                # (PO berbeda di hari sama biasanya punya jumlah PM yang sama)
                ungrouped[tgl]["kecil"] = max(ungrouped[tgl]["kecil"], p.jumlah_pm_kecil or 0)
                ungrouped[tgl]["besar"] = max(ungrouped[tgl]["besar"], p.jumlah_pm_besar or 0)

        for tgl, pm_day in ungrouped.items():
            pm_kecil += pm_day["kecil"]
            pm_besar += pm_day["besar"]
            pagu_total += (
                Decimal(pm_day["kecil"]) * TARIF_KECIL
                + Decimal(pm_day["besar"]) * TARIF_BESAR
            )

    elif pos:
        # Fallback: tidak ada JadwalPM sama sekali, estimasi dari semua PO
        # Kelompokkan per hari agar tidak double-count
        per_hari: dict = {}
        for p in pos:
            tgl = p.tanggal_po
            if tgl not in per_hari:
                per_hari[tgl] = {"kecil": 0, "besar": 0}
            per_hari[tgl]["kecil"] = max(per_hari[tgl]["kecil"], p.jumlah_pm_kecil or 0)
            per_hari[tgl]["besar"] = max(per_hari[tgl]["besar"], p.jumlah_pm_besar or 0)
        for pm_day in per_hari.values():
            pm_kecil += pm_day["kecil"]
            pm_besar += pm_day["besar"]
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
    jenis_po: Optional[models.JenisPO] = Query(None),
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

    # Query Invoice dalam periode
    all_pos = (
        db.query(models.Invoice)
        .options(joinedload(models.Invoice.po))
        .filter(
            models.Invoice.tanggal_invoice >= start_date,
            models.Invoice.tanggal_invoice <= end_date,
            models.Invoice.status != models.InvoiceStatus.cancelled,
            models.Invoice.is_draft == False
        )
    )

    if jenis_po:
        all_pos = all_pos.join(models.Invoice.po).filter(models.PurchaseOrder.jenis_po == jenis_po)

    all_pos = all_pos.all()

    # Preload details no longer needed since Invoice has total
    details_by_po: dict = {}

    dapur_pos_map = {}
    for p in all_pos:
        dapur_pos_map.setdefault(p.dapur_id, []).append(p)

    dapur_metrics = []
    total_all_pm = 0
    total_all_belanja = Decimal("0.0")
    total_all_pagu = Decimal("0.0")

    for d in dapurs:
        pos = dapur_pos_map.get(d.id, [])
        # Ekstrak PO unik dari Invoice untuk kalkulasi PM
        unique_pos = list({inv.po.id: inv.po for inv in pos if inv.po}.values())
        pm_kecil, pm_besar, total_pm, pagu_total = _get_kitchen_pm_and_pagu(db, d.id, start_date, end_date, unique_pos)

        # Hitung total_belanja dari Invoice.total
        total_belanja = Decimal(0)
        for inv in pos:
            total_belanja += Decimal(inv.total or 0)
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

        # Statistik frekuensi Invoice
        tanggal_set = set(p.tanggal_invoice for p in pos)
        total_hari = max((end_date - start_date).days + 1, 1)
        avg_po_per_hari = round(len(pos) / total_hari, 2)

        dapur_metrics.append({
            "dapur_id": d.id,
            "kode_dapur": d.kode,
            "nama_dapur": d.nama,
            "po_count": len(pos),
            "po_hari_unik": len(tanggal_set),
            "avg_po_per_hari": avg_po_per_hari,
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


@router.get("/detail-overbudget/{dapur_id}")
def get_detail_overbudget(
    dapur_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    jenis_po: Optional[models.JenisPO] = Query(None),
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance, models.UserRole.akuntan
    )),
):
    """
    Detail item pembelanjaan dan analisis per-hari untuk satu dapur.
    Menunjukkan: item apa yang berkontribusi terbesar, hari mana yang over,
    frekuensi PO, dan distribusi multi-PO dalam satu hari.
    Menggunakan harga_jual (konsisten dengan pagu).
    """
    if not end_date:
        end_date = date.today()
    if not start_date:
        start_date = end_date - timedelta(days=30)

    dapur = db.query(models.Dapur).filter(models.Dapur.id == dapur_id).first()
    if not dapur:
        return {"error": "Dapur tidak ditemukan"}

    # Query Invoice (with joined PO for PM estimation)
    invoices = (
        db.query(models.Invoice)
        .options(joinedload(models.Invoice.po))
        .filter(
            models.Invoice.dapur_id == dapur_id,
            models.Invoice.tanggal_invoice >= start_date,
            models.Invoice.tanggal_invoice <= end_date,
            models.Invoice.status != models.InvoiceStatus.cancelled,
            models.Invoice.is_draft == False
        )
    )
    
    if jenis_po:
        invoices = invoices.filter(models.PurchaseOrder.jenis_po == jenis_po).join(models.Invoice.po, isouter=True)
    
    invoices = invoices.order_by(models.Invoice.tanggal_invoice).all()

    inv_ids = [inv.id for inv in invoices]
    all_details = []
    if inv_ids:
        all_details = db.query(models.InvoiceDetail).options(joinedload(models.InvoiceDetail.po_detail).joinedload(models.PODetail.item)).filter(
            models.InvoiceDetail.invoice_id.in_(inv_ids)
        ).all()

    pos = [inv for inv in invoices] # Alias invoices as pos for minimal downstream changes
    details_by_po: dict = {}
    for det in all_details:
        details_by_po.setdefault(det.invoice_id, []).append(det)

    # Map tanggal -> pagu harian
    jadwals = (
        db.query(models.JadwalPM)
        .filter(
            models.JadwalPM.dapur_id == dapur_id,
            models.JadwalPM.tanggal >= start_date,
            models.JadwalPM.tanggal <= end_date,
        )
        .all()
    )
    jadwal_by_date: dict = {}
    for j in jadwals:
        tgl = str(j.tanggal)
        if tgl not in jadwal_by_date:
            jadwal_by_date[tgl] = {"pagu": Decimal(0), "pm_kecil": 0, "pm_besar": 0}
        jadwal_by_date[tgl]["pagu"] += Decimal(str(j.pagu_harian or 0))
        if j.jenis_porsi == models.JenisPorsi.kecil:
            jadwal_by_date[tgl]["pm_kecil"] += j.jumlah_pm or 0
        else:
            jadwal_by_date[tgl]["pm_besar"] += j.jumlah_pm or 0

    # --- Analisis per hari ---
    # Bangun map tanggal → Invoice pertama untuk estimasi pagu jika tidak ada jadwal
    po_first_by_date: dict = {}
    for p in pos:
        tgl = str(p.tanggal_invoice)
        if tgl not in po_first_by_date:
            po_first_by_date[tgl] = p

    harian: dict = {}
    for p in pos:
        tgl = str(p.tanggal_invoice)
        if tgl not in harian:
            jd = jadwal_by_date.get(tgl)
            if jd:
                # Ada jadwal → gunakan pagu dari jadwal
                pagu_h = float(jd["pagu"])
                pm_k = jd["pm_kecil"]
                pm_b = jd["pm_besar"]
                from_estimasi = False
            else:
                # Tidak ada jadwal → estimasi dari data PM di PO terkait Invoice ini
                ref_inv = po_first_by_date[tgl]
                pm_k = ref_inv.po.jumlah_pm_kecil if (ref_inv and ref_inv.po and ref_inv.po.jumlah_pm_kecil) else 0
                pm_b = ref_inv.po.jumlah_pm_besar if (ref_inv and ref_inv.po and ref_inv.po.jumlah_pm_besar) else 0
                pagu_h = float(Decimal(pm_k) * TARIF_KECIL + Decimal(pm_b) * TARIF_BESAR)
                from_estimasi = True

            harian[tgl] = {
                "tanggal": tgl,
                "po_count": 0,
                "po_ids": [],
                "pos": [],
                "pagu_harian": pagu_h,
                "pm_kecil": pm_k,
                "pm_besar": pm_b,
                "total_pm": pm_k + pm_b,
                "terpakai": 0.0,
                "over": False,
                "selisih": 0.0,
                "pagu_dari_estimasi": from_estimasi,  # flag: tidak ada jadwal PM di hari ini
            }
        nilai_jual = float(p.total or 0)
        harian[tgl]["po_count"] += 1
        harian[tgl]["po_ids"].append(p.id)
        harian[tgl]["pos"].append({
            "id": p.id,
            "nomor_po": p.nomor_invoice,
            "total": float(nilai_jual)
        })
        harian[tgl]["terpakai"] += nilai_jual

    for tgl, h in harian.items():
        h["over"] = h["pagu_harian"] > 0 and h["terpakai"] > h["pagu_harian"]
        h["selisih"] = round(h["terpakai"] - h["pagu_harian"], 0)

    harian_list = sorted(harian.values(), key=lambda x: x["tanggal"])
    over_days = [h for h in harian_list if h["over"]]
    estimasi_days = [h for h in harian_list if h.get("pagu_dari_estimasi")]

    # --- Analisis per item ---
    item_map: dict = {}
    for det in all_details:
        nama = (det.nama_item or (det.po_detail.item.nama_item if (det.po_detail and det.po_detail.item) else "Tanpa Nama")).strip()
        kat = det.po_detail.item.kategori if (det.po_detail and det.po_detail.item and det.po_detail.item.kategori) else "Lainnya"
        satuan = det.satuan or (det.po_detail.item.satuan if (det.po_detail and det.po_detail.item) else "kg")
        harga_jual_eff = Decimal(str(det.harga_jual or 0))
        harga_beli = Decimal(str(det.harga_beli or 0))
        qty = Decimal(str(det.qty or 0))
        nilai_jual = qty * harga_jual_eff
        nilai_beli = qty * harga_beli

        key = nama.lower()
        if key not in item_map:
            item_map[key] = {
                "nama_item": nama,
                "kategori": kat,
                "satuan": satuan,
                "total_qty": Decimal(0),
                "total_nilai_jual": Decimal(0),
                "total_nilai_beli": Decimal(0),
                "frekuensi_order": 0,
                "harga_satuan_min": None,
                "harga_satuan_max": None,
            }
        row = item_map[key]
        row["total_qty"] += qty
        row["total_nilai_jual"] += nilai_jual
        row["total_nilai_beli"] += nilai_beli
        row["frekuensi_order"] += 1
        hs = float(harga_beli)
        if hs > 0:
            row["harga_satuan_min"] = min(row["harga_satuan_min"] or hs, hs)
            row["harga_satuan_max"] = max(row["harga_satuan_max"] or hs, hs)

    unique_pos = list({inv.po.id: inv.po for inv in pos if inv.po}.values())
    pm_kecil, pm_besar, total_pm, pagu_total = _get_kitchen_pm_and_pagu(db, dapur_id, start_date, end_date, unique_pos)
    total_belanja = sum(h["terpakai"] for h in harian.values())
    rasio_pagu = round((total_belanja / float(pagu_total) * 100), 1) if pagu_total > 0 else 0

    items_formatted = []
    for k, v in item_map.items():
        harga_min = v["harga_satuan_min"] or 0
        harga_max = v["harga_satuan_max"] or 0
        fluktuasi_pct = round(((harga_max - harga_min) / harga_min * 100), 1) if harga_min > 0 else 0
        items_formatted.append({
            "nama_item": v["nama_item"],
            "kategori": v["kategori"],
            "satuan": v["satuan"],
            "total_qty": float(v["total_qty"]),
            "total_nilai_jual": float(v["total_nilai_jual"]),
            "total_nilai_beli": float(v["total_nilai_beli"]),
            "frekuensi_order": v["frekuensi_order"],
            "pct_dari_total": round(float(v["total_nilai_jual"]) / total_belanja * 100, 1) if total_belanja > 0 else 0,
            "harga_satuan_min": harga_min,
            "harga_satuan_max": harga_max,
            "fluktuasi_harga_pct": fluktuasi_pct,
        })
    items_formatted.sort(key=lambda x: x["total_nilai_jual"], reverse=True)

    # Breakdown per kategori
    kategori_map: dict = {}
    for item in items_formatted:
        kat = item["kategori"]
        if kat not in kategori_map:
            kategori_map[kat] = {"kategori": kat, "total_nilai": 0.0, "item_count": 0}
        kategori_map[kat]["total_nilai"] += item["total_nilai_jual"]
        kategori_map[kat]["item_count"] += 1
    for kv in kategori_map.values():
        kv["pct"] = round(kv["total_nilai"] / total_belanja * 100, 1) if total_belanja > 0 else 0
    kategori_list = sorted(kategori_map.values(), key=lambda x: x["total_nilai"], reverse=True)

    # Distribusi frekuensi PO per hari
    po_per_hari_dist: dict = {}
    for h in harian_list:
        n = h["po_count"]
        po_per_hari_dist[n] = po_per_hari_dist.get(n, 0) + 1

    multi_po_days = [h for h in harian_list if h["po_count"] > 1]

    return {
        "start_date": str(start_date),
        "end_date": str(end_date),
        "dapur": {"id": dapur.id, "kode": dapur.kode, "nama": dapur.nama},
        "summary": {
            "total_po": len(pos),
            "total_hari_ada_po": len(harian),
            "total_pm": total_pm,
            "pm_kecil": pm_kecil,
            "pm_besar": pm_besar,
            "pagu_total": float(pagu_total),
            "total_belanja": float(total_belanja),
            "sisa_pagu": float(float(pagu_total) - total_belanja),
            "rasio_pagu": rasio_pagu,
            "is_over": total_belanja > float(pagu_total) and float(pagu_total) > 0,
            "jumlah_hari_over": len(over_days),
            "total_hari_multi_po": len(multi_po_days),
            "avg_po_per_hari_aktif": round(len(pos) / max(len(harian), 1), 2),
            "jumlah_hari_tanpa_jadwal": len(estimasi_days),
        },
        "harian": harian_list,
        "over_days": over_days,
        "hari_tanpa_jadwal": estimasi_days,
        "items": items_formatted,
        "kategori_breakdown": kategori_list,
        "po_per_hari_distribusi": [
            {"jumlah_po": k, "frekuensi_hari": v}
            for k, v in sorted(po_per_hari_dist.items())
        ],
        "multi_po_days": multi_po_days,
    }


@router.get("/bahan-baku")
def get_analitik_bahan_baku(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    dapur_ids: Optional[str] = Query(None, description="Comma separated dapur IDs"),
    kategori: Optional[str] = None,
    search: Optional[str] = None,
    jenis_po: Optional[models.JenisPO] = Query(None),
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

    # Query Invoice dalam periode
    pos = (
        db.query(models.Invoice)
        .options(joinedload(models.Invoice.po))
        .filter(
            models.Invoice.dapur_id.in_(list(dapur_map.keys())),
            models.Invoice.tanggal_invoice >= start_date,
            models.Invoice.tanggal_invoice <= end_date,
            models.Invoice.status != models.InvoiceStatus.cancelled,
            models.Invoice.is_draft == False
        )
    )
    if jenis_po:
        pos = pos.join(models.Invoice.po).filter(models.PurchaseOrder.jenis_po == jenis_po)
    pos = pos.all()

    dapur_pos_map = {}
    po_ids = []
    for p in pos:
        dapur_pos_map.setdefault(p.dapur_id, []).append(p)
        po_ids.append(p.id)

    # Hitung total PM per dapur
    dapur_pm_map = {}
    for d_id, d in dapur_map.items():
        d_pos = dapur_pos_map.get(d_id, [])
        unique_pos = list({inv.po.id: inv.po for inv in d_pos if inv.po}.values())
        _, _, total_pm, _ = _get_kitchen_pm_and_pagu(db, d_id, start_date, end_date, unique_pos)
        dapur_pm_map[d_id] = total_pm

    # Query item details
    items_data = {}
    if po_ids:
        q_details = (
            db.query(models.InvoiceDetail, models.Invoice.dapur_id)
            .join(models.Invoice, models.InvoiceDetail.invoice_id == models.Invoice.id)
            .filter(models.InvoiceDetail.invoice_id.in_(po_ids))
        )

        details_rows = q_details.all()

        for det, d_id in details_rows:
            raw_nama = (det.nama_item or (det.po_detail.item.nama_item if (det.po_detail and det.po_detail.item) else "Tanpa Nama")).strip()
            item_cat = det.po_detail.item.kategori if (det.po_detail and det.po_detail.item and det.po_detail.item.kategori) else "Lainnya"
            satuan = det.satuan or (det.po_detail.item.satuan if (det.po_detail and det.po_detail.item) else "kg")

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
            # Gunakan harga_jual untuk konsistensi dengan pagu
            subtotal = qty * Decimal(str(det.harga_jual or 0))

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
    jenis_po: Optional[models.JenisPO] = Query(None),
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
            db.query(models.Invoice)
            .options(joinedload(models.Invoice.po))
            .filter(
                models.Invoice.dapur_id == d_id,
                models.Invoice.tanggal_invoice >= start_date,
                models.Invoice.tanggal_invoice <= end_date,
                models.Invoice.status != models.InvoiceStatus.cancelled,
                models.Invoice.is_draft == False
            )
        )
        if jenis_po:
            pos = pos.join(models.Invoice.po).filter(models.PurchaseOrder.jenis_po == jenis_po)
        pos = pos.all()
        unique_pos = list({inv.po.id: inv.po for inv in pos if inv.po}.values())
        pm_kecil, pm_besar, total_pm, pagu_total = _get_kitchen_pm_and_pagu(db, d_id, start_date, end_date, unique_pos)

        # Breakdown per kategori bahan & per item
        cat_map = {}
        item_map = {}
        po_ids = [p.id for p in pos]
        details = []
        if po_ids:
            details = db.query(models.InvoiceDetail).options(joinedload(models.InvoiceDetail.po_detail).joinedload(models.PODetail.item)).filter(models.InvoiceDetail.invoice_id.in_(po_ids)).all()

        # Hitung total belanja berdasarkan harga_jual
        total_belanja = sum(Decimal(str(det.qty or 0)) * Decimal(str(det.harga_jual or 0)) for det in details)
        biaya_per_pm = (total_belanja / Decimal(total_pm)).quantize(Decimal("1")) if total_pm > 0 else Decimal(0)

        for det in details:
            kategori = det.po_detail.item.kategori if (det.po_detail and det.po_detail.item and det.po_detail.item.kategori) else "Lainnya"
            nama = (det.nama_item or (det.po_detail.item.nama_item if (det.po_detail and det.po_detail.item) else "Tanpa Nama")).strip()
            satuan = det.satuan or "kg"

            # Gunakan harga_jual untuk konsistensi
            subtotal = Decimal(str(det.qty or 0)) * Decimal(str(det.harga_jual or 0))
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
