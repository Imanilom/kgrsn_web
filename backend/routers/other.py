"""Surat Jalan, RAB, dan Dashboard router."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract, and_
from typing import Optional
from datetime import date
from decimal import Decimal
import os
import models, schemas, auth
from database import get_db
from services.sj_generator import generate_surat_jalan_pdf
from services.price_service import hitung_harga_jual

# ─── Surat Jalan Router ───────────────────────────────────────────────────────
sj_router = APIRouter()


def generate_nomor_sj(db: Session) -> str:
    today = date.today()
    count = db.query(func.count(models.SuratJalan.id)).scalar() + 1
    return f"SJ/{today.year}/{today.month:02d}/{count:04d}"


@sj_router.get("/", response_model=list[schemas.SuratJalanOut])
def list_sj(
    dapur_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    q = (
        db.query(models.SuratJalan)
        .options(joinedload(models.SuratJalan.dapur))
        .options(joinedload(models.SuratJalan.details))
    )
    
    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        q = q.filter(models.SuratJalan.dapur_id == current_user.dapur_id)
    elif dapur_id:
        q = q.filter(models.SuratJalan.dapur_id == dapur_id)
        
    return q.order_by(models.SuratJalan.created_at.desc()).all()


@sj_router.get("/{sj_id}", response_model=schemas.SuratJalanOut)
def get_sj(
    sj_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    sj = (
        db.query(models.SuratJalan)
        .options(joinedload(models.SuratJalan.dapur))
        .options(joinedload(models.SuratJalan.po))
        .options(joinedload(models.SuratJalan.details))
        .filter(models.SuratJalan.id == sj_id)
        .first()
    )
    if not sj:
        raise HTTPException(status_code=404, detail="Surat jalan tidak ditemukan")
        
    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        if sj.dapur_id != current_user.dapur_id:
            raise HTTPException(status_code=403, detail="Akses ditolak: Surat Jalan ini bukan untuk dapur Anda")
            
    return sj

@sj_router.post("/generate/{po_id}", response_model=schemas.SuratJalanOut)
def generate_sj(
    po_id: int,
    payload: schemas.SuratJalanCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    po = (
        db.query(models.PurchaseOrder)
        .options(joinedload(models.PurchaseOrder.dapur))
        .options(joinedload(models.PurchaseOrder.details))
        .filter(models.PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="PO tidak ditemukan")
    if po.status not in (models.POStatus.approved, models.POStatus.delivered, models.POStatus.invoiced):
        raise HTTPException(status_code=400, detail="PO belum approved")

    nomor = generate_nomor_sj(db)
    sj = models.SuratJalan(
        nomor_sj=nomor,
        po_id=po_id,
        dapur_id=po.dapur_id,
        tanggal_kirim=payload.tanggal_kirim,
        pengirim=payload.pengirim,
        penerima=payload.penerima,
        catatan=payload.catatan,
        created_by=current_user.id,
    )
    db.add(sj)
    db.flush()

    for po_detail in po.details:
        sj_detail = models.SuratJalanDetail(
            sj_id=sj.id,
            po_detail_id=po_detail.id,
            nama_item=po_detail.nama_item_raw or "",
            qty=po_detail.qty,
            satuan=po_detail.satuan,
        )
        db.add(sj_detail)

    if po.status == models.POStatus.approved:
        po.status = models.POStatus.delivered

    db.commit()
    db.refresh(sj)

    # Generate PDF
    sj_data = {
        "nomor_sj": sj.nomor_sj,
        "tanggal_kirim": sj.tanggal_kirim,
        "pengirim": sj.pengirim or "",
        "penerima": sj.penerima or "",
        "dapur_nama": po.dapur.nama if po.dapur else "",
        "dapur_alamat": po.dapur.alamat or "" if po.dapur else "",
        "nomor_po": po.nomor_po,
        "catatan": sj.catatan or "",
        "details": [
            {"nama_item": d.nama_item, "qty": float(d.qty), "satuan": d.satuan or "", "keterangan": ""}
            for d in sj.details
        ],
    }
    pdf_path = generate_surat_jalan_pdf(sj_data)
    sj.pdf_path = pdf_path
    db.commit()

    return sj


@sj_router.get("/{sj_id}/download")
def download_sj(
    sj_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    sj = db.query(models.SuratJalan).options(
        joinedload(models.SuratJalan.dapur),
        joinedload(models.SuratJalan.details),
        joinedload(models.SuratJalan.po),
    ).filter(models.SuratJalan.id == sj_id).first()
    if not sj:
        raise HTTPException(status_code=404, detail="Surat jalan tidak ditemukan")
    # Selalu regenerate agar perubahan template langsung terlihat
    sj_data = {
        "nomor_sj": sj.nomor_sj,
        "tanggal_kirim": sj.tanggal_kirim,
        "pengirim": sj.pengirim or "",
        "penerima": sj.penerima or "",
        "dapur_nama": sj.dapur.nama if sj.dapur else "",
        "dapur_alamat": sj.dapur.alamat or "" if sj.dapur else "",
        "nomor_po": sj.po.nomor_po if sj.po else "",
        "catatan": sj.catatan or "",
        "details": [
            {"nama_item": d.nama_item, "qty": float(d.qty), "satuan": d.satuan or "", "keterangan": ""}
            for d in sj.details
        ],
    }
    pdf_path = generate_surat_jalan_pdf(sj_data)
    sj.pdf_path = pdf_path
    db.commit()
    return FileResponse(
        path=sj.pdf_path,
        media_type="application/pdf",
        filename=f"SuratJalan_{sj.nomor_sj.replace('/', '-')}.pdf",
    )


@sj_router.put("/{sj_id}/received", response_model=schemas.SuratJalanOut)
def mark_received(
    sj_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    sj = db.query(models.SuratJalan).filter(models.SuratJalan.id == sj_id).first()
    if not sj:
        raise HTTPException(status_code=404, detail="Surat jalan tidak ditemukan")
    sj.status = models.SJStatus.received
    db.commit()
    db.refresh(sj)
    return sj


# ─── RAB Router ───────────────────────────────────────────────────────────────
rab_router = APIRouter()


@rab_router.get("/", response_model=list[schemas.RABOut])
def list_rab(
    dapur_id: Optional[int] = None,
    tahun: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    q = db.query(models.RAB).options(
        joinedload(models.RAB.dapur),
        joinedload(models.RAB.details).joinedload(models.RABDetail.item),
    )
    if dapur_id:
        q = q.filter(models.RAB.dapur_id == dapur_id)
    if tahun:
        q = q.filter(models.RAB.periode_tahun == tahun)
    return q.order_by(models.RAB.periode_tahun.desc(), models.RAB.periode_bulan.desc()).all()


@rab_router.post("/", response_model=schemas.RABOut)
def create_rab(
    payload: schemas.RABCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.finance, models.UserRole.admin, models.UserRole.super_admin
    )),
):
    rab = models.RAB(
        dapur_id=payload.dapur_id,
        periode_bulan=payload.periode_bulan,
        periode_tahun=payload.periode_tahun,
        catatan=payload.catatan,
        created_by=current_user.id,
    )
    db.add(rab)
    db.flush()

    total_anggaran = Decimal(0)
    for d in payload.details:
        subtotal = Decimal(str(d.qty_anggaran)) * Decimal(str(d.harga_anggaran))
        detail = models.RABDetail(
            rab_id=rab.id,
            item_id=d.item_id,
            nama_item=d.nama_item,
            qty_anggaran=d.qty_anggaran,
            harga_anggaran=d.harga_anggaran,
            subtotal_anggaran=subtotal,
        )
        db.add(detail)
        total_anggaran += subtotal

    rab.total_anggaran = total_anggaran
    db.commit()
    db.refresh(rab)
    return rab


@rab_router.get("/{rab_id}", response_model=schemas.RABOut)
def get_rab(
    rab_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    rab = db.query(models.RAB).options(
        joinedload(models.RAB.dapur),
        joinedload(models.RAB.details).joinedload(models.RABDetail.item),
    ).filter(models.RAB.id == rab_id).first()
    if not rab:
        raise HTTPException(status_code=404, detail="RAB tidak ditemukan")
    return rab


# ─── Dashboard Router ─────────────────────────────────────────────────────────
dashboard_router = APIRouter()


@dashboard_router.get("/summary", response_model=schemas.DashboardSummary)
def get_summary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    po_q = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.status != models.POStatus.cancelled)
    inv_q = db.query(models.Invoice).filter(models.Invoice.status != models.InvoiceStatus.cancelled)
    
    total_inv_val_q = db.query(func.coalesce(func.sum(models.Invoice.total), 0)).filter(models.Invoice.status != models.InvoiceStatus.cancelled)
    total_po_val_q = db.query(func.coalesce(func.sum(models.PurchaseOrder.total_nilai), 0)).filter(models.PurchaseOrder.status != models.POStatus.cancelled)
    
    dapur_count = db.query(models.Dapur).filter(models.Dapur.is_active == True).count()

    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        po_q = po_q.filter(models.PurchaseOrder.dapur_id == current_user.dapur_id)
        inv_q = inv_q.filter(models.Invoice.dapur_id == current_user.dapur_id)
        total_inv_val_q = total_inv_val_q.filter(models.Invoice.dapur_id == current_user.dapur_id)
        total_po_val_q = total_po_val_q.filter(models.PurchaseOrder.dapur_id == current_user.dapur_id)
        dapur_count = 1 if current_user.dapur_id else 0

    return schemas.DashboardSummary(
        total_po=po_q.count(),
        po_draft=po_q.filter(models.PurchaseOrder.status == models.POStatus.draft).count(),
        po_approved=po_q.filter(models.PurchaseOrder.status == models.POStatus.approved).count(),
        total_invoice=inv_q.count(),
        invoice_unpaid=inv_q.filter(models.Invoice.status == models.InvoiceStatus.unpaid).count(),
        total_invoice_value=total_inv_val_q.scalar() or 0,
        total_po_value=total_po_val_q.scalar() or 0,
        total_dapur=dapur_count,
    )


@dashboard_router.get("/po-per-dapur")
def po_per_dapur(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    q = (
        db.query(models.Dapur.nama, func.count(models.PurchaseOrder.id).label("total_po"),
                 func.coalesce(func.sum(models.PurchaseOrder.total_nilai), 0).label("total_nilai"))
        .outerjoin(models.PurchaseOrder, and_(
            models.Dapur.id == models.PurchaseOrder.dapur_id,
            models.PurchaseOrder.status != models.POStatus.cancelled
        ))
        .filter(models.Dapur.is_active == True)
    )
    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        q = q.filter(models.Dapur.id == current_user.dapur_id)
        
    results = q.group_by(models.Dapur.id, models.Dapur.nama).all()
    return [{"nama": r.nama, "total_po": r.total_po, "total_nilai": float(r.total_nilai)} for r in results]


@dashboard_router.get("/monthly-trend")
def monthly_trend(
    tahun: int = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if not tahun:
        tahun = date.today().year
        
    q = db.query(
        extract("month", models.PurchaseOrder.tanggal_po).label("bulan"),
        func.count(models.PurchaseOrder.id).label("total_po"),
        func.coalesce(func.sum(models.PurchaseOrder.total_nilai), 0).label("total_nilai"),
    ).filter(
        extract("year", models.PurchaseOrder.tanggal_po) == tahun,
        models.PurchaseOrder.status != models.POStatus.cancelled
    )
    
    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        q = q.filter(models.PurchaseOrder.dapur_id == current_user.dapur_id)
        
    results = q.group_by("bulan").order_by("bulan").all()
    BULAN = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
    return [
        {"bulan": BULAN[int(r.bulan)], "total_po": r.total_po, "total_nilai": float(r.total_nilai)}
        for r in results
    ]
