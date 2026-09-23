"""
Laporan Keuangan router.
Menyediakan berbagai laporan: pembelanjaan, margin, operasional, laba-rugi.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
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


def _hitung_pembelanjaan(db: Session, tgl_mulai, tgl_selesai, dapur_ids=None):
    """
    Helper bersama untuk menghitung laporan pembelanjaan.
    dapur_ids: list int | None (None = semua dapur)
    """
    po_q = db.query(models.PurchaseOrder).filter(
        models.PurchaseOrder.tanggal_po >= tgl_mulai,
        models.PurchaseOrder.tanggal_po <= tgl_selesai,
        models.PurchaseOrder.status.in_([
            models.POStatus.approved, models.POStatus.delivered, models.POStatus.invoiced
        ]),
    )
    if dapur_ids:
        po_q = po_q.filter(models.PurchaseOrder.dapur_id.in_(dapur_ids))

    po_list = po_q.all()
    total_po = len(po_list)
    total_nilai = sum(float(po.total_nilai or 0) for po in po_list)

    # Per dapur (di dalam grup ini)
    per_dapur_map = {}
    for po in po_list:
        dk = po.dapur_id
        if dk not in per_dapur_map:
            per_dapur_map[dk] = {"dapur_id": dk, "nama": "", "jumlah_po": 0, "total": 0}
        per_dapur_map[dk]["jumlah_po"] += 1
        per_dapur_map[dk]["total"] += float(po.total_nilai or 0)

    # Isi nama dapur
    if per_dapur_map:
        d_list = db.query(models.Dapur).filter(models.Dapur.id.in_(list(per_dapur_map.keys()))).all()
        d_map = {d.id: d.nama for d in d_list}
        for v in per_dapur_map.values():
            v["nama"] = d_map.get(v["dapur_id"], "")

    return {
        "total_po": total_po,
        "total_nilai_pembelanjaan": total_nilai,
        "per_dapur": sorted(per_dapur_map.values(), key=lambda x: x["total"], reverse=True),
    }


@router.get("/pembelanjaan")
def laporan_pembelanjaan(
    start_date: date,
    end_date: date,
    dapur_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """Laporan pembelanjaan bahan baku per periode."""
    tgl_mulai = start_date
    tgl_selesai = end_date

    dapur_ids = [dapur_id] if dapur_id else None
    hasil = _hitung_pembelanjaan(db, tgl_mulai, tgl_selesai, dapur_ids)

    # Rekap pembelanjaan (hanya untuk laporan gabungan)
    if dapur_id:
        rekap_list = []
    else:
        rekap_list = db.query(models.RekapPembelanjaan).filter(
            models.RekapPembelanjaan.tanggal_mulai >= tgl_mulai,
            models.RekapPembelanjaan.tanggal_selesai <= tgl_selesai,
        ).all()

    return {
        "periode": f"{tgl_mulai.strftime('%d %b %Y')} - {tgl_selesai.strftime('%d %b %Y')}",
        "start_date": tgl_mulai.isoformat(),
        "end_date": tgl_selesai.isoformat(),
        **hasil,
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


@router.get("/pembelanjaan/per-grup")
def laporan_pembelanjaan_per_grup(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """
    Laporan pembelanjaan dipisah berdasarkan konfigurasi dapur (laporan_terpisah).
    Mengembalikan struktur yang sama dengan /laba-rugi/per-grup:
    - 1 entri 'gabungan' untuk dapur-dapur yang tidak terpisah
    - N entri per dapur yang laporan_terpisah = True
    """
    tgl_mulai = start_date
    tgl_selesai = end_date

    semua_dapur = db.query(models.Dapur).filter(models.Dapur.is_active == True).all()
    dapur_terpisah = [d for d in semua_dapur if d.laporan_terpisah]
    dapur_gabungan = [d for d in semua_dapur if not d.laporan_terpisah]

    grups = []

    # ── Grup Gabungan ─────────────────────────────────────────────────────────
    if dapur_gabungan:
        ids_gabungan = [d.id for d in dapur_gabungan]
        lap = _hitung_pembelanjaan(db, tgl_mulai, tgl_selesai, ids_gabungan)
        lap["grup_label"] = "Gabungan"
        lap["grup_type"] = "gabungan"
        lap["dapur_list"] = [{"id": d.id, "nama": d.nama, "kode": d.kode} for d in dapur_gabungan]
        grups.append(lap)

    # ── Dapur Terpisah ────────────────────────────────────────────────────────
    for dapur in dapur_terpisah:
        lap = _hitung_pembelanjaan(db, tgl_mulai, tgl_selesai, [dapur.id])
        lap["grup_label"] = dapur.nama
        lap["grup_type"] = "terpisah"
        lap["dapur_list"] = [{"id": dapur.id, "nama": dapur.nama, "kode": dapur.kode}]
        grups.append(lap)

    return {
        "periode": f"{tgl_mulai.strftime('%d %b %Y')} - {tgl_selesai.strftime('%d %b %Y')}",
        "start_date": tgl_mulai.isoformat(),
        "end_date": tgl_selesai.isoformat(),
        "grups": grups,
    }




@router.get("/margin")
def laporan_margin(
    start_date: date,
    end_date: date,
    dapur_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """Laporan margin keuntungan berdasarkan nilai yang tersimpan di InvoiceDetail."""
    tgl_mulai = start_date
    tgl_selesai = end_date

    po_query = db.query(models.PurchaseOrder.id).filter(
        models.PurchaseOrder.tanggal_po >= tgl_mulai,
        models.PurchaseOrder.tanggal_po <= tgl_selesai,
        models.PurchaseOrder.status != models.POStatus.cancelled,
    )
    if dapur_id:
        po_query = po_query.filter(models.PurchaseOrder.dapur_id == dapur_id)
        
    po_ids = [row[0] for row in po_query.all()]
    invoices = db.query(models.Invoice).options(
        joinedload(models.Invoice.details)
    ).filter(
        models.Invoice.po_id.in_(po_ids),
        models.Invoice.is_draft == False,
        models.Invoice.status != models.InvoiceStatus.cancelled,
    ).all()

    if not po_ids or not invoices:
        return {
            "periode": f"{tgl_mulai.strftime('%d %b %Y')} - {tgl_selesai.strftime('%d %b %Y')}",
            "total_margin": 0,
            "total_pendapatan": 0,
            "total_harga_beli": 0,
            "margin_persen": 0,
            "per_item": [],
        }

    item_agg = {}
    for invoice in invoices:
        for detail in invoice.details:
            nama = (detail.nama_item or "").strip() or "Tanpa Nama"
            qty = Decimal(str(detail.qty or 0))
            total_beli = qty * Decimal(str(detail.harga_beli or 0))
            total_jual = Decimal(str(detail.subtotal or 0))

            if nama not in item_agg:
                item_agg[nama] = {"nama_item": nama, "qty_total": Decimal(0), "total_harga_beli": Decimal(0), "total_harga_jual": Decimal(0)}
            item_agg[nama]["qty_total"] += qty
            item_agg[nama]["total_harga_beli"] += total_beli
            item_agg[nama]["total_harga_jual"] += total_jual

    per_item = []
    for v in item_agg.values():
        beli = float(v["total_harga_beli"])
        jual = float(v["total_harga_jual"])
        margin = jual - beli
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
        "periode": f"{tgl_mulai.strftime('%d %b %Y')} - {tgl_selesai.strftime('%d %b %Y')}",
        "total_pendapatan": total_jual,
        "total_harga_beli": total_beli,
        "total_margin": total_margin,
        "margin_persen": round((total_margin / total_beli * 100) if total_beli > 0 else 0, 2),
        "per_item": per_item,
    }



@router.get("/operasional")
def laporan_operasional(
    start_date: date,
    end_date: date,
    dapur_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """Laporan pengeluaran operasional per periode dan per kategori."""
    if dapur_id:
        costs = []
    else:
        costs = db.query(models.OperasionalCost).filter(
            models.OperasionalCost.tanggal >= start_date,
            models.OperasionalCost.tanggal <= end_date,
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
        "periode": f"{start_date.strftime('%d %b %Y')} - {end_date.strftime('%d %b %Y')}",
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
    dapur_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """Ringkasan posisi hutang ke supplier dan piutang dari dapur."""
    # Hutang
    hutang_query = db.query(models.HutangSupplier)
    if dapur_id:
        hutang_query = hutang_query.join(models.PurchaseOrder, models.HutangSupplier.po_id == models.PurchaseOrder.id).filter(models.PurchaseOrder.dapur_id == dapur_id)
        
    total_hutang = hutang_query.with_entities(func.sum(models.HutangSupplier.jumlah)).scalar() or Decimal(0)
    total_hutang_terbayar = hutang_query.with_entities(func.sum(models.HutangSupplier.jumlah_terbayar)).scalar() or Decimal(0)
    sisa_hutang = hutang_query.with_entities(func.sum(models.HutangSupplier.sisa)).scalar() or Decimal(0)

    # Per supplier
    hutang_per_supplier_query = db.query(
        models.HutangSupplier.supplier_id,
        func.sum(models.HutangSupplier.sisa).label("sisa")
    ).filter(
        models.HutangSupplier.status != models.HutangStatus.lunas
    )
    if dapur_id:
        hutang_per_supplier_query = hutang_per_supplier_query.join(models.PurchaseOrder, models.HutangSupplier.po_id == models.PurchaseOrder.id).filter(models.PurchaseOrder.dapur_id == dapur_id)
    hutang_per_supplier = hutang_per_supplier_query.group_by(models.HutangSupplier.supplier_id).all()

    supplier_ids = [r.supplier_id for r in hutang_per_supplier]
    supplier_map = {
        s.id: s.nama
        for s in db.query(models.Supplier).filter(models.Supplier.id.in_(supplier_ids)).all()
    }

    # Piutang
    piutang_query = db.query(models.PiutangDapur)
    if dapur_id:
        piutang_query = piutang_query.filter(models.PiutangDapur.dapur_id == dapur_id)
        
    total_piutang = piutang_query.with_entities(func.sum(models.PiutangDapur.jumlah)).scalar() or Decimal(0)
    total_piutang_terbayar = piutang_query.with_entities(func.sum(models.PiutangDapur.jumlah_terbayar)).scalar() or Decimal(0)
    sisa_piutang = piutang_query.with_entities(func.sum(models.PiutangDapur.sisa)).scalar() or Decimal(0)

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


def _hitung_laba_rugi(
    db: Session,
    tgl_mulai,
    tgl_selesai,
    dapur_ids=None,               # list int | None (None = semua dapur)
    overhead_mode: str = "aktual", # "aktual" | "persen"
    overhead_persen_val: float = 0.0,
    dapur_id_single: int = None,  # untuk filter satu dapur (backward-compat)
):
    """
    Helper bersama untuk menghitung Laporan Laba Rugi.

    Args:
        dapur_ids: Jika diisi, filter invoice hanya untuk dapur-dapur tersebut.
        overhead_mode: "aktual" = pakai OperasionalCost, "persen" = X% × laba_kotor.
        overhead_persen_val: Nilai persen (4.0 → 4%).
        dapur_id_single: Backward compat — filter satu dapur (deprecated, pakai dapur_ids).
    """
    # Resolve filter dapur
    filter_dapur_ids = None
    if dapur_ids:
        filter_dapur_ids = dapur_ids
    elif dapur_id_single:
        filter_dapur_ids = [dapur_id_single]

    def _apply_dapur(q, model_col):
        if filter_dapur_ids:
            return q.filter(model_col.in_(filter_dapur_ids))
        return q

    # ── Pendapatan: Invoice paid ──────────────────────────────────────────────
    pendapatan_q = _apply_dapur(
        db.query(func.sum(models.Invoice.total)).filter(
            models.Invoice.tanggal_invoice >= tgl_mulai,
            models.Invoice.tanggal_invoice <= tgl_selesai,
            models.Invoice.status == models.InvoiceStatus.paid,
            models.Invoice.is_draft == False,
        ),
        models.Invoice.dapur_id,
    )
    pendapatan = float(pendapatan_q.scalar() or 0)

    # Pendapatan semua (termasuk unpaid, kecuali cancelled) untuk referensi
    pendapatan_semua_q = _apply_dapur(
        db.query(func.sum(models.Invoice.total)).filter(
            models.Invoice.tanggal_invoice >= tgl_mulai,
            models.Invoice.tanggal_invoice <= tgl_selesai,
            models.Invoice.status != models.InvoiceStatus.cancelled,
            models.Invoice.is_draft == False,
        ),
        models.Invoice.dapur_id,
    )
    pendapatan_semua = float(pendapatan_semua_q.scalar() or 0)

    # ── HPP ───────────────────────────────────────────────────────────────────
    hpp_base = db.query(
        func.sum(models.InvoiceDetail.qty * models.InvoiceDetail.harga_beli)
    ).join(
        models.Invoice, models.Invoice.id == models.InvoiceDetail.invoice_id
    ).filter(
        models.Invoice.tanggal_invoice >= tgl_mulai,
        models.Invoice.tanggal_invoice <= tgl_selesai,
        models.Invoice.status == models.InvoiceStatus.paid,
        models.Invoice.is_draft == False,
    )
    if filter_dapur_ids:
        hpp_base = hpp_base.filter(models.Invoice.dapur_id.in_(filter_dapur_ids))
    hpp = float(hpp_base.scalar() or 0)

    # ── Saldo Tertahan ────────────────────────────────────────────────────────
    saldo_q = _apply_dapur(
        db.query(func.sum(models.Invoice.total)).filter(
            models.Invoice.tanggal_invoice >= tgl_mulai,
            models.Invoice.tanggal_invoice <= tgl_selesai,
            models.Invoice.status == models.InvoiceStatus.unpaid,
            models.Invoice.is_draft == False,
        ),
        models.Invoice.dapur_id,
    )
    saldo_tertahan = float(saldo_q.scalar() or 0)

    # ── Laba Kotor ────────────────────────────────────────────────────────────
    laba_kotor = pendapatan - hpp

    # ── Overhead & Laba Bersih ────────────────────────────────────────────────
    overhead_per_kategori = {}
    if overhead_mode == "persen":
        # Dapur terpisah: operasional nol, laba bersih 1/3 dari laba kotor
        operasional = 0.0
        catatan_overhead = "Biaya operasional untuk dapur terpisah diset 0"
        
        margin_kotor_persen_temp = (laba_kotor / pendapatan * 100) if pendapatan > 0 else 0
        if margin_kotor_persen_temp <= 12:
            laba_bersih = round(pendapatan * 0.04, 2)
        else:
            laba_bersih = round(laba_kotor / 3, 2)
            
        sisa_margin_pusat = laba_kotor - laba_bersih
    else:
        # Overhead = biaya operasional aktual (tidak difilter per dapur)
        overhead_costs = db.query(models.OperasionalCost).filter(
            models.OperasionalCost.tanggal >= tgl_mulai,
            models.OperasionalCost.tanggal <= tgl_selesai,
        ).all()
        for c in overhead_costs:
            kat = c.kategori.value
            overhead_per_kategori[kat] = overhead_per_kategori.get(kat, 0) + float(c.jumlah)
        operasional = sum(overhead_per_kategori.values())
        catatan_overhead = "Gaji, utilitas, transport, dll (OperasionalCost aktual)"
        laba_bersih = laba_kotor - operasional
        sisa_margin_pusat = 0.0

    margin_kotor = round((laba_kotor / pendapatan * 100) if pendapatan > 0 else 0, 2)
    margin_bersih = round((laba_bersih / pendapatan * 100) if pendapatan > 0 else 0, 2)

    return {
        "periode": f"{tgl_mulai.strftime('%d %b %Y')} - {tgl_selesai.strftime('%d %b %Y')}",
        "start_date": tgl_mulai.isoformat(),
        "end_date": tgl_selesai.isoformat(),
        "overhead_mode": overhead_mode,
        "overhead_persen": overhead_persen_val if overhead_mode == "persen" else None,
        "pendapatan": {
            "invoice_terbayar": pendapatan,
            "invoice_semua": pendapatan_semua,
            "catatan": "Pendapatan dari invoice dengan status PAID",
        },
        "harga_pokok_pembelian": {
            "total": hpp,
            "total_belanja": hpp,
            "total_po": hpp,
            "sumber": "InvoiceDetail",
            "catatan": "Qty x harga beli dari invoice berstatus PAID",
        },
        "biaya_operasional": {
            "total": operasional,
            "per_kategori": overhead_per_kategori,
            "catatan": catatan_overhead,
        },
        "saldo_tertahan": {
            "total": saldo_tertahan,
            "catatan": "Invoice unpaid — barang sudah dikirim tapi belum dibayar dapur",
        },
        "hutang_yang_harus_dibayar": {
            "total": saldo_tertahan,
            "catatan": "Representasi dari saldo tertahan/unpaid yang belum dibayar",
        },
        "sisa_margin_pusat": sisa_margin_pusat,
        "laba_kotor": laba_kotor,
        "laba_bersih": laba_bersih,
        "margin_kotor_persen": margin_kotor,
        "margin_bersih_persen": margin_bersih,
    }


@router.get("/laba-rugi")
def laporan_laba_rugi(
    start_date: date,
    end_date: date,
    dapur_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """
    Laporan Laba Rugi untuk suatu rentang waktu.

    - Tanpa dapur_id: laporan gabungan semua dapur (overhead aktual).
    - Dengan dapur_id: laporan satu dapur, overhead mengikuti config dapur
      (laporan_terpisah + overhead_persen).
    """
    tgl_mulai = start_date
    tgl_selesai = end_date

    if dapur_id:
        # Cek konfigurasi dapur
        dapur = db.query(models.Dapur).filter(models.Dapur.id == dapur_id).first()
        if not dapur:
            raise HTTPException(status_code=404, detail="Dapur tidak ditemukan")

        if dapur.laporan_terpisah and dapur.overhead_persen is not None:
            mode = "persen"
            pct = float(dapur.overhead_persen)
        else:
            mode = "aktual"
            pct = 0.0

        hasil = _hitung_laba_rugi(
            db, tgl_mulai, tgl_selesai,
            dapur_ids=[dapur_id],
            overhead_mode=mode,
            overhead_persen_val=pct,
        )
        hasil["dapur"] = {"id": dapur.id, "nama": dapur.nama, "kode": dapur.kode,
                          "laporan_terpisah": dapur.laporan_terpisah,
                          "overhead_persen": float(dapur.overhead_persen) if dapur.overhead_persen else None}
    else:
        hasil = _hitung_laba_rugi(
            db, tgl_mulai, tgl_selesai,
            overhead_mode="aktual",
        )
        hasil["dapur"] = None

    return hasil


@router.get("/laba-rugi/per-grup")
def laporan_laba_rugi_per_grup(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """
    Mengembalikan laporan L/R untuk semua 'grup' sekaligus:
    - 1 laporan gabungan untuk semua dapur yang TIDAK laporan_terpisah
    - N laporan individual untuk setiap dapur yang laporan_terpisah = True
      (overhead dihitung overhead_persen% × laba_kotor)

    Digunakan oleh dropdown di dashboard untuk memilih grup mana yang ditampilkan.
    """
    tgl_mulai = start_date
    tgl_selesai = end_date

    semua_dapur = db.query(models.Dapur).filter(models.Dapur.is_active == True).all()

    dapur_terpisah = [d for d in semua_dapur if d.laporan_terpisah]
    dapur_gabungan = [d for d in semua_dapur if not d.laporan_terpisah]

    grups = []

    # ── Grup Gabungan ─────────────────────────────────────────────────────────
    if dapur_gabungan:
        ids_gabungan = [d.id for d in dapur_gabungan]
        lap_gabungan = _hitung_laba_rugi(
            db, tgl_mulai, tgl_selesai,
            dapur_ids=ids_gabungan,
            overhead_mode="aktual",
        )
        lap_gabungan["grup_label"] = "Gabungan"
        lap_gabungan["grup_type"] = "gabungan"
        lap_gabungan["dapur_list"] = [{"id": d.id, "nama": d.nama, "kode": d.kode} for d in dapur_gabungan]
        grups.append(lap_gabungan)

    # ── Dapur Terpisah ────────────────────────────────────────────────────────
    for dapur in dapur_terpisah:
        pct = float(dapur.overhead_persen) if dapur.overhead_persen is not None else 0.0
        mode = "persen" if dapur.overhead_persen is not None else "aktual"
        lap = _hitung_laba_rugi(
            db, tgl_mulai, tgl_selesai,
            dapur_ids=[dapur.id],
            overhead_mode=mode,
            overhead_persen_val=pct,
        )
        lap["grup_label"] = dapur.nama
        lap["grup_type"] = "terpisah"
        lap["dapur_list"] = [{"id": dapur.id, "nama": dapur.nama, "kode": dapur.kode}]
        lap["overhead_persen_config"] = pct
        grups.append(lap)

    return {
        "periode": f"{tgl_mulai.strftime('%d %b %Y')} - {tgl_selesai.strftime('%d %b %Y')}",
        "start_date": tgl_mulai.isoformat(),
        "end_date": tgl_selesai.isoformat(),
        "grups": grups,
    }



@router.get("/ringkasan")
def laporan_ringkasan(
    tahun: int,
    dapur_id: Optional[int] = None,
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

        pendapatan_q = db.query(func.sum(models.Invoice.total)).filter(
            models.Invoice.tanggal_invoice >= tgl_mulai,
            models.Invoice.tanggal_invoice <= tgl_selesai,
            models.Invoice.status == models.InvoiceStatus.paid,
            models.Invoice.is_draft == False,
        )
        if dapur_id:
            pendapatan_q = pendapatan_q.filter(models.Invoice.dapur_id == dapur_id)
        pendapatan = float(pendapatan_q.scalar() or 0)
        
        hpp_q = db.query(
            func.sum(models.InvoiceDetail.qty * models.InvoiceDetail.harga_beli)
        ).join(
            models.Invoice, models.Invoice.id == models.InvoiceDetail.invoice_id
        ).filter(
            models.Invoice.tanggal_invoice >= tgl_mulai,
            models.Invoice.tanggal_invoice <= tgl_selesai,
            models.Invoice.status == models.InvoiceStatus.paid,
            models.Invoice.is_draft == False,
        )
        if dapur_id:
            hpp_q = hpp_q.filter(models.Invoice.dapur_id == dapur_id)
        hpp = float(hpp_q.scalar() or 0)
        
        if dapur_id:
            operasional = float(0)
        else:
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
