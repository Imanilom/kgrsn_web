"""
Rekap Mingguan router.
Admin membuat rekap konsolidasi semua PO Realisasi dari semua dapur dalam satu minggu,
lalu generate draft invoice / penawaran harga dari rekap tersebut.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional
from datetime import date, timedelta
from decimal import Decimal
import os
import models, schemas, auth
from database import get_db
from services.price_service import hitung_harga_jual
from services.invoice_generator import generate_invoice_pdf
from config import settings

router = APIRouter()


def generate_nomor_rekap(db: Session) -> str:
    today = date.today()
    count = db.query(func.count(models.RekapMinggu.id)).scalar() + 1
    return f"RKP/{today.year}/{today.month:02d}/{count:04d}"


def generate_nomor_invoice_rekap(db: Session) -> str:
    today = date.today()
    count = db.query(func.count(models.Invoice.id)).scalar() + 1
    return f"INV-D/{today.year}/{today.month:02d}/{count:04d}"


def _get_week_bounds(tgl: date):
    """Kembalikan (minggu, sabtu) dari tanggal manapun dalam minggu itu."""
    days_to_subtract = (tgl.weekday() + 1) % 7
    start_date = tgl - timedelta(days=days_to_subtract)
    end_date = start_date + timedelta(days=6)
    return start_date, end_date


@router.get("/", response_model=list[schemas.RekapMingguOut])
def list_rekap(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    return (
        db.query(models.RekapMinggu)
        .options(
            joinedload(models.RekapMinggu.details).joinedload(models.RekapMingguDetail.dapur),
            joinedload(models.RekapMinggu.details).joinedload(models.RekapMingguDetail.item),
        )
        .order_by(models.RekapMinggu.tanggal_mulai.desc())
        .all()
    )


@router.get("/{rekap_id}", response_model=schemas.RekapMingguOut)
def get_rekap(
    rekap_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    rekap = (
        db.query(models.RekapMinggu)
        .options(
            joinedload(models.RekapMinggu.details).joinedload(models.RekapMingguDetail.dapur),
            joinedload(models.RekapMinggu.details).joinedload(models.RekapMingguDetail.item),
        )
        .filter(models.RekapMinggu.id == rekap_id)
        .first()
    )
    if not rekap:
        raise HTTPException(status_code=404, detail="Rekap tidak ditemukan")
    return rekap


@router.get("/preview/minggu")
def preview_rekap_minggu(
    tanggal: date,  # Tanggal manapun dalam minggu yang ingin direkap
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """
    Preview rekap minggu: tampilkan semua PO Realisasi yang sudah approved
    dalam rentang minggu tertentu, dikelompokkan per tanggal dan per dapur.
    """
    start_date, end_date = _get_week_bounds(tanggal)

    realisasi_list = (
        db.query(models.PORealisasi)
        .options(
            joinedload(models.PORealisasi.dapur),
            joinedload(models.PORealisasi.details).joinedload(models.PORealisasiDetail.item),
        )
        .filter(
            models.PORealisasi.tanggal_realisasi >= start_date,
            models.PORealisasi.tanggal_realisasi <= end_date,
            models.PORealisasi.status == models.RealisasiStatus.approved,
        )
        .order_by(models.PORealisasi.tanggal_realisasi, models.PORealisasi.dapur_id)
        .all()
    )

    # Agregasi per (tanggal, dapur, item)
    agg = {}   # key: (tanggal, dapur_id, item_key) → data
    for rel in realisasi_list:
        for d in rel.details:
            item_key = d.item_id or d.nama_item_raw or "unknown"
            key = (str(rel.tanggal_realisasi), rel.dapur_id, item_key)
            if key not in agg:
                # Ambil harga terkini dari master_harga
                harga_beli = Decimal(str(d.harga_satuan))
                harga_j = Decimal(str(d.harga_jual))
                if d.item_id:
                    h_rec = db.query(models.MasterHarga).filter(
                        models.MasterHarga.item_id == d.item_id,
                        models.MasterHarga.berlaku_sampai.is_(None),
                    ).first()
                    if h_rec:
                        harga_beli = h_rec.harga_beli
                        harga_j = h_rec.harga_jual

                agg[key] = {
                    "tanggal": str(rel.tanggal_realisasi),
                    "dapur_id": rel.dapur_id,
                    "dapur_nama": rel.dapur.nama if rel.dapur else "",
                    "item_id": d.item_id,
                    "nama_item": d.nama_item_raw or (d.item.nama_item if d.item else ""),
                    "satuan": d.satuan,
                    "qty_total": Decimal(0),
                    "harga_beli": harga_beli,
                    "harga_jual": harga_j,
                    "subtotal_beli": Decimal(0),
                    "subtotal_jual": Decimal(0),
                    "realisasi_ids": [],
                }
            agg[key]["qty_total"] += Decimal(str(d.qty_realisasi))
            agg[key]["realisasi_ids"].append(rel.id)

    # Hitung subtotal
    rows = []
    total_beli = Decimal(0)
    total_jual = Decimal(0)
    for v in agg.values():
        v["subtotal_beli"] = float(v["qty_total"] * v["harga_beli"])
        v["subtotal_jual"] = float(v["qty_total"] * v["harga_jual"])
        v["qty_total"] = float(v["qty_total"])
        v["harga_beli"] = float(v["harga_beli"])
        v["harga_jual"] = float(v["harga_jual"])
        total_beli += Decimal(str(v["subtotal_beli"]))
        total_jual += Decimal(str(v["subtotal_jual"]))
        rows.append(v)

    # Sort by tanggal, dapur, item
    rows.sort(key=lambda r: (r["tanggal"], r["dapur_nama"], r["nama_item"]))

    return {
        # pyrefly: ignore [unknown-name]
        "tanggal_mulai": str(monday),
        # pyrefly: ignore [unknown-name]
        "tanggal_selesai": str(sunday),
        "total_realisasi": len(realisasi_list),
        "total_nilai_beli": float(total_beli),
        "total_nilai_jual": float(total_jual),
        "rows": rows,
    }


@router.post("/", response_model=schemas.RekapMingguOut)
def create_rekap(
    payload: schemas.RekapMingguCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """
    Buat rekap mingguan dari semua PO Realisasi approved dalam rentang tanggal.
    Detail rekap diisi per (tanggal, dapur, item) dengan harga terkini dari master_harga.
    """
    # Cek tidak ada rekap yang overlap
    existing = db.query(models.RekapMinggu).filter(
        models.RekapMinggu.tanggal_mulai == payload.tanggal_mulai,
        models.RekapMinggu.tanggal_selesai == payload.tanggal_selesai,
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Rekap untuk minggu ini sudah ada: {existing.nomor_rekap}"
        )

    # Ambil semua PO Realisasi approved dalam periode
    realisasi_list = (
        db.query(models.PORealisasi)
        .options(
            joinedload(models.PORealisasi.dapur),
            joinedload(models.PORealisasi.details).joinedload(models.PORealisasiDetail.item),
        )
        .filter(
            models.PORealisasi.tanggal_realisasi >= payload.tanggal_mulai,
            models.PORealisasi.tanggal_realisasi <= payload.tanggal_selesai,
            models.PORealisasi.status == models.RealisasiStatus.approved,
        )
        .all()
    )

    if not realisasi_list:
        raise HTTPException(
            status_code=400,
            detail="Tidak ada PO Realisasi approved dalam periode ini"
        )

    nomor = generate_nomor_rekap(db)
    rekap = models.RekapMinggu(
        nomor_rekap=nomor,
        tanggal_mulai=payload.tanggal_mulai,
        tanggal_selesai=payload.tanggal_selesai,
        catatan=payload.catatan,
        created_by=current_user.id,
    )
    db.add(rekap)
    db.flush()

    # Agregasi per (tanggal, dapur_id, item_id/nama)
    agg = {}
    for rel in realisasi_list:
        for d in rel.details:
            item_key = d.item_id or d.nama_item_raw or "unknown"
            key = (rel.tanggal_realisasi, rel.dapur_id, item_key)

            # Harga terkini dari master_harga
            harga_beli = Decimal(str(d.harga_satuan))
            harga_j = Decimal(str(d.harga_jual))
            if d.item_id:
                h_rec = db.query(models.MasterHarga).filter(
                    models.MasterHarga.item_id == d.item_id,
                    models.MasterHarga.berlaku_sampai.is_(None),
                ).first()
                if h_rec:
                    harga_beli = h_rec.harga_beli
                    harga_j = h_rec.harga_jual

            if key not in agg:
                agg[key] = {
                    "tanggal": rel.tanggal_realisasi,
                    "dapur_id": rel.dapur_id,
                    "item_id": d.item_id,
                    "nama_item": d.nama_item_raw or (d.item.nama_item if d.item else ""),
                    "satuan": d.satuan,
                    "qty_total": Decimal(0),
                    "harga_beli": harga_beli,
                    "harga_jual": harga_j,
                }
            agg[key]["qty_total"] += Decimal(str(d.qty_realisasi))

    total_beli = Decimal(0)
    total_jual = Decimal(0)

    for v in agg.values():
        qty = v["qty_total"]
        sb = qty * v["harga_beli"]
        sj = qty * v["harga_jual"]
        detail = models.RekapMingguDetail(
            rekap_id=rekap.id,
            tanggal=v["tanggal"],
            dapur_id=v["dapur_id"],
            item_id=v["item_id"],
            nama_item=v["nama_item"],
            satuan=v["satuan"],
            qty_total=qty,
            harga_beli=v["harga_beli"],
            harga_jual=v["harga_jual"],
            subtotal_beli=sb,
            subtotal_jual=sj,
        )
        db.add(detail)
        total_beli += sb
        total_jual += sj

    rekap.total_nilai_beli = total_beli
    rekap.total_nilai_jual = total_jual
    db.commit()
    db.refresh(rekap)
    return rekap


@router.post("/{rekap_id}/generate-invoice", response_model=schemas.InvoiceOut)
def generate_draft_invoice(
    rekap_id: int,
    payload: schemas.InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """
    Generate draft invoice / penawaran harga dari rekap mingguan.
    Invoice ini bersifat draft (is_draft=True), tanpa terikat ke satu dapur spesifik.
    """
    rekap = (
        db.query(models.RekapMinggu)
        .options(
            joinedload(models.RekapMinggu.details).joinedload(models.RekapMingguDetail.dapur),
            joinedload(models.RekapMinggu.details).joinedload(models.RekapMingguDetail.item),
        )
        .filter(models.RekapMinggu.id == rekap_id)
        .first()
    )
    if not rekap:
        raise HTTPException(status_code=404, detail="Rekap tidak ditemukan")

    # Cek sudah ada invoice draft untuk rekap ini
    if rekap.invoice_path and os.path.exists(rekap.invoice_path):
        # Boleh re-generate, lanjutkan saja
        pass

    from routers.invoice import generate_nomor_invoice
    nomor = generate_nomor_invoice(db)
    jatuh_tempo = payload.jatuh_tempo or (payload.tanggal_invoice + timedelta(days=3))

    invoice = models.Invoice(
        nomor_invoice=nomor,
        po_id=None,
        realisasi_id=None,
        dapur_id=None,
        tanggal_invoice=payload.tanggal_invoice,
        jatuh_tempo=jatuh_tempo,
        catatan=payload.catatan or f"Draft invoice rekap minggu {rekap.tanggal_mulai} s/d {rekap.tanggal_selesai}",
        is_draft=True,
        created_by=current_user.id,
    )
    db.add(invoice)
    db.flush()

    total = Decimal(0)
    for d in rekap.details:
        subtotal = d.subtotal_jual
        inv_detail = models.InvoiceDetail(
            invoice_id=invoice.id,
            po_detail_id=None,
            nama_item=f"[{d.tanggal} | {d.dapur.nama if d.dapur else ''}] {d.nama_item}",
            qty=d.qty_total,
            satuan=d.satuan,
            harga_beli=d.harga_beli,
            harga_jual=d.harga_jual,
            subtotal=subtotal,
        )
        db.add(inv_detail)
        total += subtotal

    invoice.subtotal = total
    invoice.total = total

    rekap.status = models.RekapStatus.final
    db.commit()
    db.refresh(invoice)

    # Generate PDF
    details_data = [
        {
            "nama_item": d.nama_item,
            "qty": float(d.qty),
            "satuan": d.satuan or "",
            "harga_beli": float(d.harga_beli),
            "harga_jual": float(d.harga_jual),
            "subtotal": float(d.subtotal),
        }
        for d in invoice.details
    ]
    invoice_data = {
        "nomor_invoice": invoice.nomor_invoice,
        "tanggal_invoice": invoice.tanggal_invoice,
        "jatuh_tempo": invoice.jatuh_tempo,
        "dapur_nama": f"Rekap Minggu {rekap.tanggal_mulai} s/d {rekap.tanggal_selesai}",
        "dapur_alamat": "Semua Dapur",
        "dapur_kontak": "",
        "status": "DRAFT",
        "is_draft": True,
        "details": details_data,
        "subtotal": float(invoice.subtotal or 0),
        "total": float(invoice.total or 0),
        "catatan": invoice.catatan or "",
    }
    output_dir = os.path.join(settings.GENERATED_DIR, "rekap")
    os.makedirs(output_dir, exist_ok=True)
    pdf_path = generate_invoice_pdf(invoice_data, output_dir=output_dir)
    invoice.pdf_path = pdf_path
    rekap.invoice_path = pdf_path
    db.commit()

    return invoice


@router.get("/{rekap_id}/download-invoice")
def download_rekap_invoice(
    rekap_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    rekap = db.query(models.RekapMinggu).filter(models.RekapMinggu.id == rekap_id).first()
    if not rekap:
        raise HTTPException(status_code=404, detail="Rekap tidak ditemukan")
    if not rekap.invoice_path or not os.path.exists(rekap.invoice_path):
        raise HTTPException(status_code=404, detail="Invoice belum di-generate. Generate terlebih dahulu.")
    return FileResponse(
        path=rekap.invoice_path,
        media_type="application/pdf",
        filename=f"DraftInvoice_Rekap_{rekap.nomor_rekap.replace('/', '-')}.pdf",
    )


@router.delete("/{rekap_id}")
def delete_rekap(
    rekap_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin
    )),
):
    rekap = db.query(models.RekapMinggu).filter(models.RekapMinggu.id == rekap_id).first()
    if not rekap:
        raise HTTPException(status_code=404, detail="Rekap tidak ditemukan")
    if rekap.status == models.RekapStatus.final:
        raise HTTPException(status_code=400, detail="Rekap yang sudah final tidak bisa dihapus")
    db.delete(rekap)
    db.commit()
    return {"message": "Rekap dihapus"}
