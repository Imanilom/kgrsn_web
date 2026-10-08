from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional
from datetime import date, datetime
from decimal import Decimal
import logging
import os
import models, schemas, auth
from database import get_db
from services.invoice_generator import generate_invoice_kendaraan_pdf

router = APIRouter()
logger = logging.getLogger(__name__)


def generate_nomor_invoice_kendaraan(db: Session) -> str:
    today = date.today()
    count = db.query(func.count(models.InvoiceKendaraan.id)).scalar() + 1
    return f"INV-KND/{today.year}/{today.month:02d}/{count:04d}"


def _invoice_pdf_data(db: Session, invoice: models.InvoiceKendaraan) -> dict:
    dapur = db.query(models.Dapur).filter(models.Dapur.id == invoice.dapur_id).first()
    return {
        "nomor_invoice": invoice.nomor_invoice,
        "tanggal_invoice": invoice.tanggal_invoice,
        "dapur_nama": dapur.nama if dapur else "",
        "dapur_alamat": dapur.alamat or "" if dapur else "",
        "dapur_kontak": dapur.kontak or "" if dapur else "",
        "total_harga": float(invoice.total_harga),
        "catatan": invoice.catatan or "",
        "status": invoice.status.value,
        "details": [
            {
                "kendaraan": detail.kendaraan,
                "harga_satuan": float(detail.harga_satuan),
                "satuan_waktu": detail.satuan_waktu.value,
                "kuantitas": float(detail.kuantitas),
                "subtotal": float(detail.subtotal),
            }
            for detail in invoice.details
        ],
    }


def _generate_and_save_pdf(db: Session, invoice: models.InvoiceKendaraan) -> str:
    pdf_path = generate_invoice_kendaraan_pdf(_invoice_pdf_data(db, invoice))
    invoice.pdf_path = pdf_path
    db.commit()
    db.refresh(invoice)
    return pdf_path


def _set_legacy_invoice_fields(invoice: models.InvoiceKendaraan, details: list) -> None:
    first_detail = details[0] if details else None
    invoice.kendaraan = first_detail.kendaraan if first_detail else ""
    invoice.harga_satuan = first_detail.harga_satuan if first_detail else 0
    invoice.satuan_waktu = first_detail.satuan_waktu if first_detail else models.SatuanWaktuKendaraan.hari
    invoice.kuantitas = first_detail.kuantitas if first_detail else 1


@router.get("/", response_model=schemas.PaginatedResponse[schemas.InvoiceKendaraanOut])
def list_invoice_kendaraan(
    dapur_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    q = db.query(models.InvoiceKendaraan).options(joinedload(models.InvoiceKendaraan.dapur))

    actual_dapur_id = int(dapur_id) if dapur_id and dapur_id.strip() else None
    actual_status = status if status and status.strip() else None

    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        q = q.filter(models.InvoiceKendaraan.dapur_id == current_user.dapur_id)
    elif actual_dapur_id:
        q = q.filter(models.InvoiceKendaraan.dapur_id == actual_dapur_id)

    if actual_status:
        q = q.filter(models.InvoiceKendaraan.status == actual_status)

    total = q.count()
    skip = (page - 1) * limit
    items = q.order_by(models.InvoiceKendaraan.created_at.desc()).offset(skip).limit(limit).all()
    import math
    return {
        "data": items,
        "total": total,
        "page": page,
        "size": limit,
        "total_pages": math.ceil(total / limit) if limit > 0 else 1,
    }


@router.post("/", response_model=schemas.InvoiceKendaraanOut)
def create_invoice_kendaraan(
    payload: schemas.InvoiceKendaraanCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    total_harga = sum(d.harga_satuan * d.kuantitas for d in payload.details)

    invoice = models.InvoiceKendaraan(
        nomor_invoice=generate_nomor_invoice_kendaraan(db),
        dapur_id=payload.dapur_id,
        tanggal_invoice=payload.tanggal_invoice,
        total_harga=total_harga,
        status=models.InvoiceStatus.unpaid,
        catatan=payload.catatan,
        created_by=current_user.id
    )
    _set_legacy_invoice_fields(invoice, payload.details)
    db.add(invoice)
    try:
        db.flush()

        for detail in payload.details:
            subtotal = detail.harga_satuan * detail.kuantitas
            db.add(models.InvoiceKendaraanDetail(
                invoice_id=invoice.id,
                kendaraan=detail.kendaraan,
                harga_satuan=detail.harga_satuan,
                satuan_waktu=detail.satuan_waktu,
                kuantitas=detail.kuantitas,
                subtotal=subtotal,
            ))

        db.flush()
        _generate_and_save_pdf(db, invoice)
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to create vehicle invoice and its PDF")
        raise HTTPException(
            status_code=500,
            detail="Gagal membuat invoice kendaraan atau PDF. Silakan coba lagi.",
        ) from exc

    return invoice


@router.put("/{invoice_id}", response_model=schemas.InvoiceKendaraanOut)
def update_invoice_kendaraan(
    invoice_id: int,
    payload: schemas.InvoiceKendaraanUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    invoice = db.query(models.InvoiceKendaraan).filter(
        models.InvoiceKendaraan.id == invoice_id
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice tidak ditemukan")
    if invoice.status == models.InvoiceStatus.paid:
        raise HTTPException(status_code=400, detail="Invoice lunas tidak dapat diubah")

    invoice.dapur_id = payload.dapur_id
    invoice.tanggal_invoice = payload.tanggal_invoice
    invoice.catatan = payload.catatan
    invoice.total_harga = sum(
        detail.harga_satuan * detail.kuantitas for detail in payload.details
    )
    _set_legacy_invoice_fields(invoice, payload.details)
    invoice.details = [
        models.InvoiceKendaraanDetail(
            kendaraan=detail.kendaraan,
            harga_satuan=detail.harga_satuan,
            satuan_waktu=detail.satuan_waktu,
            kuantitas=detail.kuantitas,
            subtotal=detail.harga_satuan * detail.kuantitas,
        )
        for detail in payload.details
    ]

    try:
        _generate_and_save_pdf(db, invoice)
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to update vehicle invoice %s and its PDF", invoice_id)
        raise HTTPException(
            status_code=500,
            detail="Gagal memperbarui invoice kendaraan atau PDF. Silakan coba lagi.",
        ) from exc

    return invoice


@router.get("/{invoice_id}", response_model=schemas.InvoiceKendaraanOut)
def get_invoice_kendaraan(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    invoice = db.query(models.InvoiceKendaraan).options(
        joinedload(models.InvoiceKendaraan.dapur)
    ).filter(models.InvoiceKendaraan.id == invoice_id).first()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice tidak ditemukan")

    # Security: operator/akuntan hanya bisa lihat dapurnya sendiri
    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        if invoice.dapur_id != current_user.dapur_id:
            raise HTTPException(status_code=403, detail="Tidak ada akses ke invoice ini")

    return invoice


@router.delete("/{invoice_id}")
def delete_invoice_kendaraan(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    invoice = db.query(models.InvoiceKendaraan).filter(
        models.InvoiceKendaraan.id == invoice_id
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice tidak ditemukan")
    if invoice.status == models.InvoiceStatus.paid:
        raise HTTPException(status_code=400, detail="Invoice lunas tidak dapat dihapus")

    pdf_path = invoice.pdf_path
    db.delete(invoice)
    db.commit()

    if pdf_path and os.path.isfile(pdf_path):
        try:
            os.remove(pdf_path)
        except OSError:
            logger.exception("Failed to remove PDF for deleted vehicle invoice %s", invoice_id)

    return {"message": "Invoice kendaraan berhasil dihapus"}


@router.get("/{invoice_id}/download")
def download_invoice_kendaraan(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    invoice = db.query(models.InvoiceKendaraan).filter(models.InvoiceKendaraan.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice tidak ditemukan")

    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        if invoice.dapur_id != current_user.dapur_id:
            raise HTTPException(status_code=403, detail="Tidak ada akses ke invoice ini")

    try:
        _generate_and_save_pdf(db, invoice)
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to generate current PDF for vehicle invoice %s", invoice.id)
        raise HTTPException(
            status_code=500,
            detail="Gagal membuat PDF invoice kendaraan. Silakan coba lagi.",
        ) from exc

    return FileResponse(
        path=invoice.pdf_path,
        media_type="application/pdf",
        filename=f"Invoice_Kendaraan_{invoice.nomor_invoice.replace('/', '-')}.pdf",
    )


@router.put("/{invoice_id}/paid", response_model=schemas.InvoiceKendaraanOut)
def mark_paid_kendaraan(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    invoice = db.query(models.InvoiceKendaraan).filter(models.InvoiceKendaraan.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice tidak ditemukan")

    if invoice.status == models.InvoiceStatus.paid:
        raise HTTPException(status_code=400, detail="Invoice sudah lunas")

    invoice.status = models.InvoiceStatus.paid
    invoice.paid_at = func.now()
    try:
        _generate_and_save_pdf(db, invoice)
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to mark vehicle invoice %s paid and regenerate its PDF", invoice_id)
        raise HTTPException(
            status_code=500,
            detail="Gagal memperbarui status dan PDF invoice kendaraan. Silakan coba lagi.",
        ) from exc
    return invoice
