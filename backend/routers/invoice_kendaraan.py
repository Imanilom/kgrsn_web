from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional
from datetime import date, datetime
from decimal import Decimal
import os
import models, schemas, auth
from database import get_db
from services.invoice_generator import generate_invoice_kendaraan_pdf

router = APIRouter()


def generate_nomor_invoice_kendaraan(db: Session) -> str:
    today = date.today()
    count = db.query(func.count(models.InvoiceKendaraan.id)).scalar() + 1
    return f"INV-KND/{today.year}/{today.month:02d}/{count:04d}"


@router.get("/", response_model=schemas.PaginatedResponse[schemas.InvoiceKendaraanOut])
def list_invoice_kendaraan(
    dapur_id: Optional[int] = None,
    status: Optional[models.InvoiceStatus] = None,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    q = db.query(models.InvoiceKendaraan).options(joinedload(models.InvoiceKendaraan.dapur))

    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        q = q.filter(models.InvoiceKendaraan.dapur_id == current_user.dapur_id)
    elif dapur_id:
        q = q.filter(models.InvoiceKendaraan.dapur_id == dapur_id)

    if status:
        q = q.filter(models.InvoiceKendaraan.status == status)

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
    # Hitung total harga
    total_harga = payload.harga_satuan * payload.kuantitas

    invoice = models.InvoiceKendaraan(
        nomor_invoice=generate_nomor_invoice_kendaraan(db),
        dapur_id=payload.dapur_id,
        tanggal_invoice=payload.tanggal_invoice,
        kendaraan=payload.kendaraan,
        harga_satuan=payload.harga_satuan,
        satuan_waktu=payload.satuan_waktu,
        kuantitas=payload.kuantitas,
        total_harga=total_harga,
        status=models.InvoiceStatus.unpaid,
        catatan=payload.catatan,
        created_by=current_user.id
    )

    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    # Generate PDF in background or directly
    dapur = db.query(models.Dapur).filter(models.Dapur.id == invoice.dapur_id).first()
    
    invoice_data = {
        "nomor_invoice": invoice.nomor_invoice,
        "tanggal_invoice": invoice.tanggal_invoice,
        "dapur_nama": dapur.nama if dapur else "",
        "dapur_alamat": dapur.alamat or "" if dapur else "",
        "dapur_kontak": dapur.kontak or "" if dapur else "",
        "kendaraan": invoice.kendaraan,
        "harga_satuan": float(invoice.harga_satuan),
        "satuan_waktu": invoice.satuan_waktu.value,
        "kuantitas": float(invoice.kuantitas),
        "total_harga": float(invoice.total_harga),
        "catatan": invoice.catatan or "",
        "status": invoice.status.value,
    }

    pdf_path = generate_invoice_kendaraan_pdf(invoice_data)
    invoice.pdf_path = pdf_path
    db.commit()
    db.refresh(invoice)

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

    if not invoice.pdf_path or not os.path.exists(invoice.pdf_path):
        raise HTTPException(status_code=404, detail="File PDF belum tersedia")

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
    db.commit()
    db.refresh(invoice)
    return invoice
