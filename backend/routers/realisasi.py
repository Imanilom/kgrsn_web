"""PO Realisasi router — Akuntan membuat realisasi dari PO asli (qty bisa berubah)."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional
from datetime import date, timedelta
from decimal import Decimal
import os
import logging
import models, schemas, auth
from database import get_db

logger = logging.getLogger(__name__)
from services.price_service import hitung_harga_jual
from services.invoice_generator import generate_invoice_pdf

router = APIRouter()


def generate_nomor_realisasi(db: Session) -> str:
    today = date.today()
    count = db.query(func.count(models.PORealisasi.id)).scalar() + 1
    return f"REL/{today.year}/{today.month:02d}/{count:04d}"


def _is_akuntan_or_above(user: models.User) -> bool:
    return user.role in (
        models.UserRole.akuntan, models.UserRole.operator,
        models.UserRole.finance, models.UserRole.admin, models.UserRole.super_admin
    )


@router.get("/", response_model=list[schemas.PORealisasiOut])
def list_realisasi(
    dapur_id: Optional[int] = None,
    status: Optional[models.RealisasiStatus] = None,
    po_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """List semua PO Realisasi. Akuntan hanya melihat realisasi dapur mereka."""
    q = (
        db.query(models.PORealisasi)
        .options(
            joinedload(models.PORealisasi.dapur),
            joinedload(models.PORealisasi.po),
            joinedload(models.PORealisasi.details).joinedload(models.PORealisasiDetail.item),
        )
    )
    # Akuntan/operator hanya lihat dapur sendiri
    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        if not current_user.dapur_id:
            return []
        q = q.filter(models.PORealisasi.dapur_id == current_user.dapur_id)
    elif dapur_id:
        q = q.filter(models.PORealisasi.dapur_id == dapur_id)

    if status:
        q = q.filter(models.PORealisasi.status == status)
    if po_id:
        q = q.filter(models.PORealisasi.po_id == po_id)

    return q.order_by(models.PORealisasi.created_at.desc()).all()


@router.get("/{realisasi_id}", response_model=schemas.PORealisasiOut)
def get_realisasi(
    realisasi_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    rel = (
        db.query(models.PORealisasi)
        .options(
            joinedload(models.PORealisasi.dapur),
            joinedload(models.PORealisasi.po).joinedload(models.PurchaseOrder.details),
            joinedload(models.PORealisasi.details).joinedload(models.PORealisasiDetail.item),
        )
        .filter(models.PORealisasi.id == realisasi_id)
        .first()
    )
    if not rel:
        raise HTTPException(status_code=404, detail="Realisasi tidak ditemukan")
    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        if rel.dapur_id != current_user.dapur_id:
            raise HTTPException(status_code=403, detail="Akses ditolak")
    return rel


@router.post("/", response_model=schemas.PORealisasiOut)
def create_realisasi(
    payload: schemas.PORealisasiCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_akuntan),
):
    """
    Buat PO Realisasi dari PO yang sudah approved.
    Jika details tidak dikirim, semua item dari PO asli akan di-copy dengan qty sama.
    """
    po = (
        db.query(models.PurchaseOrder)
        .options(
            joinedload(models.PurchaseOrder.dapur),
            joinedload(models.PurchaseOrder.details).joinedload(models.PODetail.item),
        )
        .filter(models.PurchaseOrder.id == payload.po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="PO tidak ditemukan")
    if po.status not in (models.POStatus.approved, models.POStatus.delivered):
        raise HTTPException(status_code=400, detail="PO harus sudah approved sebelum dibuat realisasi")

    # Akuntan hanya bisa realisasi PO milik dapurnya
    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        if po.dapur_id != current_user.dapur_id:
            raise HTTPException(status_code=403, detail="Akses ditolak: PO bukan milik dapur Anda")

    # Cek apakah sudah ada realisasi untuk PO ini
    existing = db.query(models.PORealisasi).filter(
        models.PORealisasi.po_id == payload.po_id,
        models.PORealisasi.status.notin_([models.RealisasiStatus.rejected]),
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Realisasi sudah ada untuk PO ini: {existing.nomor_realisasi}"
        )

    nomor = generate_nomor_realisasi(db)
    realisasi = models.PORealisasi(
        nomor_realisasi=nomor,
        po_id=po.id,
        dapur_id=po.dapur_id,
        tanggal_realisasi=payload.tanggal_realisasi,
        catatan=payload.catatan,
        created_by=current_user.id,
    )
    db.add(realisasi)
    db.flush()

    total_beli = Decimal(0)
    total_jual = Decimal(0)

    # Jika details dikirim: pakai detail kustom
    if payload.details:
        for d in payload.details:
            # Cari harga dari master jika ada item_id
            harga_beli = Decimal(str(d.harga_satuan))
            harga_j = hitung_harga_jual(harga_beli)
            if d.item_id:
                h_rec = db.query(models.MasterHarga).filter(
                    models.MasterHarga.item_id == d.item_id,
                    models.MasterHarga.berlaku_sampai.is_(None),
                ).first()
                if h_rec:
                    harga_beli = h_rec.harga_beli
                    harga_j = h_rec.harga_jual

            qty = Decimal(str(d.qty_realisasi))
            subtotal = qty * harga_beli
            subtotal_j = qty * harga_j

            # Ambil qty_po dari po_detail jika ada referensi
            qty_po = Decimal(0)
            if d.po_detail_id:
                pod = db.query(models.PODetail).filter(models.PODetail.id == d.po_detail_id).first()
                if pod:
                    qty_po = Decimal(str(pod.qty))

            detail = models.PORealisasiDetail(
                realisasi_id=realisasi.id,
                po_detail_id=d.po_detail_id,
                item_id=d.item_id,
                nama_item_raw=d.nama_item_raw,
                qty_po=qty_po,
                qty_realisasi=qty,
                satuan=d.satuan,
                harga_satuan=harga_beli,
                harga_jual=harga_j,
                subtotal=subtotal,
                subtotal_jual=subtotal_j,
                catatan=d.catatan,
            )
            db.add(detail)
            total_beli += subtotal
            total_jual += subtotal_j

    else:
        # Copy semua item dari PO asli
        for pod in po.details:
            harga_beli = Decimal(str(pod.harga_satuan))
            harga_j = hitung_harga_jual(harga_beli)

            # Override dengan harga master jika ada
            if pod.item_id:
                h_rec = db.query(models.MasterHarga).filter(
                    models.MasterHarga.item_id == pod.item_id,
                    models.MasterHarga.berlaku_sampai.is_(None),
                ).first()
                if h_rec:
                    harga_beli = h_rec.harga_beli
                    harga_j = h_rec.harga_jual

            qty = Decimal(str(pod.qty))
            subtotal = qty * harga_beli
            subtotal_j = qty * harga_j

            detail = models.PORealisasiDetail(
                realisasi_id=realisasi.id,
                po_detail_id=pod.id,
                item_id=pod.item_id,
                nama_item_raw=pod.nama_item_raw,
                qty_po=qty,
                qty_realisasi=qty,   # Default: sama dengan PO
                satuan=pod.satuan,
                harga_satuan=harga_beli,
                harga_jual=harga_j,
                subtotal=subtotal,
                subtotal_jual=subtotal_j,
            )
            db.add(detail)
            total_beli += subtotal
            total_jual += subtotal_j

    realisasi.total_nilai = total_beli
    realisasi.total_nilai_jual = total_jual
    db.commit()
    db.refresh(realisasi)
    return realisasi


@router.put("/{realisasi_id}", response_model=schemas.PORealisasiOut)
def update_realisasi(
    realisasi_id: int,
    payload: schemas.PORealisasiUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_akuntan),
):
    rel = db.query(models.PORealisasi).filter(models.PORealisasi.id == realisasi_id).first()
    if not rel:
        raise HTTPException(status_code=404, detail="Realisasi tidak ditemukan")
    if rel.status not in (models.RealisasiStatus.draft,):
        raise HTTPException(status_code=400, detail="Hanya realisasi draft yang bisa diedit")
    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        if rel.dapur_id != current_user.dapur_id:
            raise HTTPException(status_code=403, detail="Akses ditolak")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(rel, field, value)
    db.commit()
    db.refresh(rel)
    return rel


@router.put("/{realisasi_id}/detail/{detail_id}", response_model=schemas.PORealisasiDetailOut)
def update_realisasi_detail(
    realisasi_id: int,
    detail_id: int,
    payload: schemas.PORealisasiDetailUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_akuntan),
):
    """Update qty/harga satu item di realisasi."""
    rel = db.query(models.PORealisasi).filter(models.PORealisasi.id == realisasi_id).first()
    if not rel or rel.status not in (models.RealisasiStatus.draft,):
        raise HTTPException(status_code=400, detail="Realisasi tidak ditemukan atau sudah dikunci")
    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        if rel.dapur_id != current_user.dapur_id:
            raise HTTPException(status_code=403, detail="Akses ditolak")

    detail = db.query(models.PORealisasiDetail).filter(
        models.PORealisasiDetail.id == detail_id,
        models.PORealisasiDetail.realisasi_id == realisasi_id,
    ).first()
    if not detail:
        raise HTTPException(status_code=404, detail="Detail tidak ditemukan")

    old_subtotal = detail.subtotal or Decimal(0)
    old_subtotal_j = detail.subtotal_jual or Decimal(0)

    if payload.qty_realisasi is not None:
        detail.qty_realisasi = payload.qty_realisasi
    if payload.harga_satuan is not None:
        detail.harga_satuan = payload.harga_satuan
        detail.harga_jual = hitung_harga_jual(Decimal(str(payload.harga_satuan)))
    if payload.catatan is not None:
        detail.catatan = payload.catatan

    qty = Decimal(str(detail.qty_realisasi))
    detail.subtotal = qty * Decimal(str(detail.harga_satuan))
    detail.subtotal_jual = qty * Decimal(str(detail.harga_jual))

    # Update total realisasi
    rel.total_nilai = (rel.total_nilai or 0) - old_subtotal + detail.subtotal
    rel.total_nilai_jual = (rel.total_nilai_jual or 0) - old_subtotal_j + detail.subtotal_jual

    db.commit()
    db.refresh(detail)
    return detail


@router.post("/{realisasi_id}/submit", response_model=schemas.PORealisasiOut)
def submit_realisasi(
    realisasi_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_akuntan),
):
    """Akuntan mengajukan realisasi ke admin untuk diapprove."""
    rel = db.query(models.PORealisasi).filter(models.PORealisasi.id == realisasi_id).first()
    if not rel:
        raise HTTPException(status_code=404, detail="Realisasi tidak ditemukan")
    if rel.status != models.RealisasiStatus.draft:
        raise HTTPException(status_code=400, detail="Hanya realisasi draft yang bisa diajukan")
    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        if rel.dapur_id != current_user.dapur_id:
            raise HTTPException(status_code=403, detail="Akses ditolak")
    rel.status = models.RealisasiStatus.submitted
    db.commit()
    db.refresh(rel)
    return rel


@router.post("/{realisasi_id}/approve", response_model=schemas.PORealisasiOut)
def approve_realisasi(
    realisasi_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """Admin/Finance mengapprove realisasi."""
    rel = db.query(models.PORealisasi).filter(models.PORealisasi.id == realisasi_id).first()
    if not rel:
        raise HTTPException(status_code=404, detail="Realisasi tidak ditemukan")
    if rel.status not in (models.RealisasiStatus.draft, models.RealisasiStatus.submitted):
        raise HTTPException(status_code=400, detail="Realisasi tidak dalam status yang bisa diapprove")
    rel.status = models.RealisasiStatus.approved
    rel.approved_by = current_user.id
    rel.approved_at = func.now()

    # Simpan ke price_history untuk analisis tren harga otomatis
    try:
        from services.excel_importer import normalize_nama
        from models import PriceHistory, PriceSumber
        from datetime import date

        dapur_nama = rel.dapur.nama if rel.dapur else "Dapur"
        tgl = rel.tanggal_realisasi or (rel.po.tanggal_po if rel.po else date.today())

        for det in rel.details:
            nama = normalize_nama(det.nama_item_raw or (det.item.nama_item if det.item else ""))
            if not nama:
                continue

            ph = PriceHistory(
                item_id=det.item_id,
                nama_item=nama,
                tanggal=tgl,
                harga_beli=det.harga_satuan,
                harga_jual=det.harga_jual,
                qty=det.qty_realisasi,
                satuan=det.satuan,
                dapur=dapur_nama,
                sumber=PriceSumber.po_realisasi
            )
            db.add(ph)
    except Exception as e:
        logger.error(f"Gagal mencatat price_history dari realisasi approve: {e}")

    db.commit()
    db.refresh(rel)
    return rel



@router.post("/{realisasi_id}/reject", response_model=schemas.PORealisasiOut)
def reject_realisasi(
    realisasi_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    rel = db.query(models.PORealisasi).filter(models.PORealisasi.id == realisasi_id).first()
    if not rel:
        raise HTTPException(status_code=404, detail="Realisasi tidak ditemukan")
    rel.status = models.RealisasiStatus.rejected
    db.commit()
    db.refresh(rel)
    return rel


@router.post("/{realisasi_id}/generate-invoice", response_model=schemas.InvoiceOut)
def generate_invoice_from_realisasi(
    realisasi_id: int,
    payload: schemas.InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.finance, models.UserRole.admin, models.UserRole.super_admin
    )),
):
    """Generate invoice resmi dari PO Realisasi yang sudah approved."""
    rel = (
        db.query(models.PORealisasi)
        .options(
            joinedload(models.PORealisasi.dapur),
            joinedload(models.PORealisasi.details).joinedload(models.PORealisasiDetail.item),
        )
        .filter(models.PORealisasi.id == realisasi_id)
        .first()
    )
    if not rel:
        raise HTTPException(status_code=404, detail="Realisasi tidak ditemukan")
    if rel.status != models.RealisasiStatus.approved:
        raise HTTPException(status_code=400, detail="Realisasi harus sudah approved sebelum generate invoice")

    # Cek sudah ada invoice
    existing = db.query(models.Invoice).filter(
        models.Invoice.realisasi_id == realisasi_id,
        models.Invoice.status != models.InvoiceStatus.cancelled,
        models.Invoice.is_draft == False,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Invoice sudah ada: {existing.nomor_invoice}")

    from routers.invoice import generate_nomor_invoice, _generate_and_save_pdf_realisasi
    nomor = generate_nomor_invoice(db)
    jatuh_tempo = payload.jatuh_tempo or (payload.tanggal_invoice + timedelta(days=14))

    invoice = models.Invoice(
        nomor_invoice=nomor,
        po_id=rel.po_id,
        realisasi_id=rel.id,
        dapur_id=rel.dapur_id,
        tanggal_invoice=payload.tanggal_invoice,
        jatuh_tempo=jatuh_tempo,
        catatan=payload.catatan,
        is_draft=False,
        created_by=current_user.id,
    )
    db.add(invoice)
    db.flush()

    total = Decimal(0)
    for d in rel.details:
        # Ambil harga terkini dari master_harga
        harga_beli = d.harga_satuan
        harga_j = d.harga_jual
        if d.item_id:
            h_rec = db.query(models.MasterHarga).filter(
                models.MasterHarga.item_id == d.item_id,
                models.MasterHarga.berlaku_sampai.is_(None),
            ).first()
            if h_rec:
                harga_beli = h_rec.harga_beli
                harga_j = h_rec.harga_jual

        qty = Decimal(str(d.qty_realisasi))
        subtotal = qty * harga_j

        inv_detail = models.InvoiceDetail(
            invoice_id=invoice.id,
            po_detail_id=d.po_detail_id,
            nama_item=d.nama_item_raw or (d.item.nama_item if d.item else ""),
            qty=qty,
            qty_po=Decimal(str(d.qty_po)) if d.qty_po is not None else None,
            qty_realisasi=qty,   # qty_realisasi = qty aktual realisasi
            satuan=d.satuan,
            harga_beli=harga_beli,
            harga_jual=harga_j,
            subtotal=subtotal,
        )
        db.add(inv_detail)
        total += subtotal

    invoice.subtotal = total
    invoice.total = total

    # Update status PO
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == rel.po_id).first()
    if po:
        po.status = models.POStatus.invoiced

    db.commit()
    db.refresh(invoice)

    # Generate PDF
    _generate_and_save_pdf_realisasi(invoice, rel, db)
    db.commit()
    return invoice
