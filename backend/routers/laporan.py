"""
Laporan Keuangan router.
Menyediakan berbagai laporan: pembelanjaan, margin, operasional, laba-rugi.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from typing import Optional
from datetime import date
from decimal import Decimal
import models, auth
from database import get_db

router = APIRouter()

BULAN_NAMA = [
    "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
]


def _require_finance(user):
    return auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )


@router.get("/pembelanjaan")
def laporan_pembelanjaan(
    periode_bulan: int,
    periode_tahun: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """
    Laporan pembelanjaan bahan baku per periode.
    Sumber: PO approved/delivered dalam periode tsb.
    """
    from calendar import monthrange
    _, last_day = monthrange(periode_tahun, periode_bulan)
    tgl_mulai = date(periode_tahun, periode_bulan, 1)
    tgl_selesai = date(periode_tahun, periode_bulan, last_day)

    # Ambil PO dalam periode
    po_list = (
        db.query(models.PurchaseOrder)
        .filter(
            models.PurchaseOrder.tanggal_po >= tgl_mulai,
            models.PurchaseOrder.tanggal_po <= tgl_selesai,
            models.PurchaseOrder.status.in_([
                models.POStatus.approved, models.POStatus.delivered, models.POStatus.invoiced
            ]),
        )
        .all()
    )

    total_po = len(po_list)
    total_nilai = sum(float(po.total_nilai or 0) for po in po_list)

    # Per dapur
    per_dapur = {}
    for po in po_list:
        dapur_key = po.dapur_id
        if dapur_key not in per_dapur:
            per_dapur[dapur_key] = {"dapur_id": dapur_key, "nama": "", "jumlah_po": 0, "total": 0}
        per_dapur[dapur_key]["jumlah_po"] += 1
        per_dapur[dapur_key]["total"] += float(po.total_nilai or 0)

    # Isi nama dapur
    dapur_ids = list(per_dapur.keys())
    dapur_list = db.query(models.Dapur).filter(models.Dapur.id.in_(dapur_ids)).all()
    dapur_map = {d.id: d.nama for d in dapur_list}
    for v in per_dapur.values():
        v["nama"] = dapur_map.get(v["dapur_id"], "")

    # Rekap pembelanjaan jika ada
    rekap_list = db.query(models.RekapPembelanjaan).filter(
        models.RekapPembelanjaan.periode_bulan == periode_bulan,
        models.RekapPembelanjaan.periode_tahun == periode_tahun,
    ).all()

    return {
        "periode": f"{BULAN_NAMA[periode_bulan]} {periode_tahun}",
        "periode_bulan": periode_bulan,
        "periode_tahun": periode_tahun,
        "total_po": total_po,
        "total_nilai_pembelanjaan": total_nilai,
        "per_dapur": list(per_dapur.values()),
        "rekap_pembelanjaan": [
            {
                "id": r.id,
                "nomor_rekap": r.nomor_rekap,
                "jenis": r.jenis,
                "total_pembelian": float(r.total_pembelian),
                "status": r.status.value,
            }
            for r in rekap_list
        ],
    }


@router.get("/margin")
def laporan_margin(
    periode_bulan: int,
    periode_tahun: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """
    Laporan margin keuntungan per item.
    Sumber: InvoiceDetail yang dibuat pada periode ini.
    Margin = harga_jual - harga_beli, margin% = (jual-beli)/beli × 100.
    """
    from calendar import monthrange
    _, last_day = monthrange(periode_tahun, periode_bulan)
    tgl_mulai = date(periode_tahun, periode_bulan, 1)
    tgl_selesai = date(periode_tahun, periode_bulan, last_day)

    # Invoice dalam periode (bukan draft)
    invoice_ids = [
        inv.id for inv in db.query(models.Invoice.id).filter(
            models.Invoice.tanggal_invoice >= tgl_mulai,
            models.Invoice.tanggal_invoice <= tgl_selesai,
            models.Invoice.is_draft == False,
        ).all()
    ]

    if not invoice_ids:
        return {
            "periode": f"{BULAN_NAMA[periode_bulan]} {periode_tahun}",
            "total_margin": 0,
            "total_pendapatan": 0,
            "total_harga_beli": 0,
            "margin_persen": 0,
            "per_item": [],
        }

    details = db.query(models.InvoiceDetail).filter(
        models.InvoiceDetail.invoice_id.in_(invoice_ids)
    ).all()

    # Agregasi per nama item
    item_agg = {}
    for d in details:
        key = d.nama_item
        if key not in item_agg:
            item_agg[key] = {
                "nama_item": key,
                "qty_total": Decimal(0),
                "total_harga_beli": Decimal(0),
                "total_harga_jual": Decimal(0),
                "total_margin": Decimal(0),
            }
        qty = Decimal(str(d.qty))
        beli = Decimal(str(d.harga_beli)) * qty
        jual = Decimal(str(d.harga_jual)) * qty
        item_agg[key]["qty_total"] += qty
        item_agg[key]["total_harga_beli"] += beli
        item_agg[key]["total_harga_jual"] += jual
        item_agg[key]["total_margin"] += (jual - beli)

    per_item = []
    for v in item_agg.values():
        beli = float(v["total_harga_beli"])
        jual = float(v["total_harga_jual"])
        margin = float(v["total_margin"])
        per_item.append({
            "nama_item": v["nama_item"],
            "qty_total": float(v["qty_total"]),
            "total_harga_beli": beli,
            "total_harga_jual": jual,
            "total_margin": margin,
            "margin_persen": round((margin / beli * 100) if beli > 0 else 0, 2),
        })

    per_item.sort(key=lambda x: x["total_margin"], reverse=True)

    total_beli = sum(x["total_harga_beli"] for x in per_item)
    total_jual = sum(x["total_harga_jual"] for x in per_item)
    total_margin = sum(x["total_margin"] for x in per_item)

    return {
        "periode": f"{BULAN_NAMA[periode_bulan]} {periode_tahun}",
        "total_pendapatan": total_jual,
        "total_harga_beli": total_beli,
        "total_margin": total_margin,
        "margin_persen": round((total_margin / total_beli * 100) if total_beli > 0 else 0, 2),
        "per_item": per_item,
    }


@router.get("/operasional")
def laporan_operasional(
    periode_bulan: int,
    periode_tahun: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """Laporan pengeluaran operasional per periode dan per kategori."""
    costs = db.query(models.OperasionalCost).filter(
        models.OperasionalCost.periode_bulan == periode_bulan,
        models.OperasionalCost.periode_tahun == periode_tahun,
    ).order_by(models.OperasionalCost.tanggal).all()

    per_kategori = {}
    total = Decimal(0)
    for c in costs:
        kat = c.kategori.value
        if kat not in per_kategori:
            per_kategori[kat] = {"kategori": kat, "total": Decimal(0), "items": []}
        per_kategori[kat]["total"] += c.jumlah
        per_kategori[kat]["items"].append({
            "id": c.id,
            "tanggal": str(c.tanggal),
            "deskripsi": c.deskripsi,
            "jumlah": float(c.jumlah),
        })
        total += c.jumlah

    for v in per_kategori.values():
        v["total"] = float(v["total"])

    return {
        "periode": f"{BULAN_NAMA[periode_bulan]} {periode_tahun}",
        "total_operasional": float(total),
        "per_kategori": list(per_kategori.values()),
        "detail": [
            {
                "id": c.id,
                "tanggal": str(c.tanggal),
                "kategori": c.kategori.value,
                "deskripsi": c.deskripsi,
                "jumlah": float(c.jumlah),
                "catatan": c.catatan,
            }
            for c in costs
        ],
    }


@router.get("/hutang-piutang")
def laporan_hutang_piutang(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """Ringkasan posisi hutang ke supplier dan piutang dari dapur."""
    # Hutang
    total_hutang = db.query(func.sum(models.HutangSupplier.jumlah)).scalar() or Decimal(0)
    total_hutang_terbayar = db.query(func.sum(models.HutangSupplier.jumlah_terbayar)).scalar() or Decimal(0)
    sisa_hutang = db.query(func.sum(models.HutangSupplier.sisa)).scalar() or Decimal(0)

    # Per supplier
    hutang_per_supplier = db.query(
        models.HutangSupplier.supplier_id,
        func.sum(models.HutangSupplier.sisa).label("sisa")
    ).filter(
        models.HutangSupplier.status != models.HutangStatus.lunas
    ).group_by(models.HutangSupplier.supplier_id).all()

    supplier_ids = [r.supplier_id for r in hutang_per_supplier]
    supplier_map = {
        s.id: s.nama
        for s in db.query(models.Supplier).filter(models.Supplier.id.in_(supplier_ids)).all()
    }

    # Piutang
    total_piutang = db.query(func.sum(models.PiutangDapur.jumlah)).scalar() or Decimal(0)
    total_piutang_terbayar = db.query(func.sum(models.PiutangDapur.jumlah_terbayar)).scalar() or Decimal(0)
    sisa_piutang = db.query(func.sum(models.PiutangDapur.sisa)).scalar() or Decimal(0)

    return {
        "hutang": {
            "total": float(total_hutang),
            "terbayar": float(total_hutang_terbayar),
            "sisa": float(sisa_hutang),
            "per_supplier": [
                {"supplier_id": r.supplier_id, "nama": supplier_map.get(r.supplier_id, ""), "sisa": float(r.sisa)}
                for r in hutang_per_supplier
            ],
        },
        "piutang": {
            "total": float(total_piutang),
            "terbayar": float(total_piutang_terbayar),
            "sisa": float(sisa_piutang),
        },
        "net_position": float(sisa_piutang - sisa_hutang),
    }


@router.get("/laba-rugi")
def laporan_laba_rugi(
    periode_bulan: int,
    periode_tahun: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """
    Laporan Laba Rugi sederhana untuk satu periode (bulan).
    
    Laba Kotor = Pendapatan (invoice terbayar) - HPP (pembelanjaan bahan baku)
    Laba Bersih = Laba Kotor - Total Operasional
    """
    from calendar import monthrange
    _, last_day = monthrange(periode_tahun, periode_bulan)
    tgl_mulai = date(periode_tahun, periode_bulan, 1)
    tgl_selesai = date(periode_tahun, periode_bulan, last_day)

    # ── Pendapatan: Invoice paid dalam periode ────────────────────────────────
    pendapatan_query = db.query(func.sum(models.Invoice.total)).filter(
        models.Invoice.tanggal_invoice >= tgl_mulai,
        models.Invoice.tanggal_invoice <= tgl_selesai,
        models.Invoice.status == models.InvoiceStatus.paid,
        models.Invoice.is_draft == False,
    ).scalar() or Decimal(0)

    # Pendapatan semua (termasuk unpaid) untuk referensi
    pendapatan_semua = db.query(func.sum(models.Invoice.total)).filter(
        models.Invoice.tanggal_invoice >= tgl_mulai,
        models.Invoice.tanggal_invoice <= tgl_selesai,
        models.Invoice.is_draft == False,
    ).scalar() or Decimal(0)

    # ── HPP: Total nilai pembelian PO dalam periode ───────────────────────────
    hpp_query = db.query(func.sum(models.PurchaseOrder.total_nilai)).filter(
        models.PurchaseOrder.tanggal_po >= tgl_mulai,
        models.PurchaseOrder.tanggal_po <= tgl_selesai,
        models.PurchaseOrder.status.in_([
            models.POStatus.approved, models.POStatus.delivered, models.POStatus.invoiced
        ]),
    ).scalar() or Decimal(0)

    # ── Operasional ───────────────────────────────────────────────────────────
    operasional_query = db.query(func.sum(models.OperasionalCost.jumlah)).filter(
        models.OperasionalCost.periode_bulan == periode_bulan,
        models.OperasionalCost.periode_tahun == periode_tahun,
    ).scalar() or Decimal(0)

    # ── Kalkulasi ─────────────────────────────────────────────────────────────
    pendapatan = float(pendapatan_query)
    hpp = float(hpp_query)
    operasional = float(operasional_query)

    laba_kotor = pendapatan - hpp
    laba_bersih = laba_kotor - operasional
    margin_kotor = round((laba_kotor / pendapatan * 100) if pendapatan > 0 else 0, 2)
    margin_bersih = round((laba_bersih / pendapatan * 100) if pendapatan > 0 else 0, 2)

    return {
        "periode": f"{BULAN_NAMA[periode_bulan]} {periode_tahun}",
        "periode_bulan": periode_bulan,
        "periode_tahun": periode_tahun,
        "pendapatan": {
            "invoice_terbayar": pendapatan,
            "invoice_semua": float(pendapatan_semua),
            "catatan": "Pendapatan dari invoice dengan status PAID",
        },
        "harga_pokok_pembelian": {
            "total": hpp,
            "catatan": "Total nilai beli dari PO approved/delivered",
        },
        "biaya_operasional": {
            "total": operasional,
            "catatan": "Gaji, utilitas, transport, dll",
        },
        "laba_kotor": laba_kotor,
        "laba_bersih": laba_bersih,
        "margin_kotor_persen": margin_kotor,
        "margin_bersih_persen": margin_bersih,
    }


@router.get("/ringkasan")
def laporan_ringkasan(
    tahun: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """Ringkasan laporan keuangan per bulan dalam satu tahun."""
    hasil = []
    for bulan in range(1, 13):
        from calendar import monthrange
        _, last_day = monthrange(tahun, bulan)
        tgl_mulai = date(tahun, bulan, 1)
        tgl_selesai = date(tahun, bulan, last_day)

        pendapatan = float(
            db.query(func.sum(models.Invoice.total)).filter(
                models.Invoice.tanggal_invoice >= tgl_mulai,
                models.Invoice.tanggal_invoice <= tgl_selesai,
                models.Invoice.status == models.InvoiceStatus.paid,
                models.Invoice.is_draft == False,
            ).scalar() or 0
        )
        hpp = float(
            db.query(func.sum(models.PurchaseOrder.total_nilai)).filter(
                models.PurchaseOrder.tanggal_po >= tgl_mulai,
                models.PurchaseOrder.tanggal_po <= tgl_selesai,
                models.PurchaseOrder.status.in_([
                    models.POStatus.approved, models.POStatus.delivered, models.POStatus.invoiced
                ]),
            ).scalar() or 0
        )
        operasional = float(
            db.query(func.sum(models.OperasionalCost.jumlah)).filter(
                models.OperasionalCost.periode_bulan == bulan,
                models.OperasionalCost.periode_tahun == tahun,
            ).scalar() or 0
        )
        laba_kotor = pendapatan - hpp
        laba_bersih = laba_kotor - operasional

        hasil.append({
            "bulan": bulan,
            "nama_bulan": BULAN_NAMA[bulan],
            "pendapatan": pendapatan,
            "hpp": hpp,
            "operasional": operasional,
            "laba_kotor": laba_kotor,
            "laba_bersih": laba_bersih,
        })

    return {
        "tahun": tahun,
        "per_bulan": hasil,
        "total_tahun": {
            "pendapatan": sum(x["pendapatan"] for x in hasil),
            "hpp": sum(x["hpp"] for x in hasil),
            "operasional": sum(x["operasional"] for x in hasil),
            "laba_kotor": sum(x["laba_kotor"] for x in hasil),
            "laba_bersih": sum(x["laba_bersih"] for x in hasil),
        },
    }
