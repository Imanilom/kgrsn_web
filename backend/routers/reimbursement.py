"""Reimbursement router - item ekstra dari realisasi yang perlu dibayar ke supplier."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import date
from decimal import Decimal
import os, shutil
import models, schemas, auth
from database import get_db
from config import settings

router = APIRouter()


@router.get("/", response_model=list[schemas.ReimbursementOut])
def list_reimbursement(
    status: Optional[str] = None,
    dapur_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_admin),
):
    """List semua reimbursement. Akuntan hanya melihat dapur mereka."""
    q = (
        db.query(models.Reimbursement)
        .options(
            joinedload(models.Reimbursement.dapur),
            joinedload(models.Reimbursement.supplier),
        )
    )
    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        q = q.filter(models.Reimbursement.dapur_id == current_user.dapur_id)
    elif dapur_id:
        q = q.filter(models.Reimbursement.dapur_id == dapur_id)
    if status:
        q = q.filter(models.Reimbursement.status == status)
    return q.order_by(models.Reimbursement.created_at.desc()).all()


@router.get("/{reimburse_id}", response_model=schemas.ReimbursementOut)
def get_reimbursement(
    reimburse_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_admin),
):
    r = db.query(models.Reimbursement).options(
        joinedload(models.Reimbursement.dapur),
        joinedload(models.Reimbursement.supplier),
    ).filter(models.Reimbursement.id == reimburse_id).first()
    if not r:
        raise HTTPException(404, detail="Reimbursement tidak ditemukan")
    return r


@router.post("/", response_model=schemas.ReimbursementOut)
def create_reimbursement(
    payload: schemas.ReimbursementCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin,
        models.UserRole.finance, models.UserRole.akuntan,
    )),
):
    r = models.Reimbursement(
        realisasi_id=payload.realisasi_id,
        dapur_id=payload.dapur_id,
        supplier_id=payload.supplier_id,
        nama_item=payload.nama_item,
        satuan=payload.satuan,
        qty=payload.qty,
        harga_satuan=payload.harga_satuan,
        total=Decimal(str(payload.qty)) * Decimal(str(payload.harga_satuan)),
        catatan=payload.catatan,
        created_by=current_user.id,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.put("/{reimburse_id}", response_model=schemas.ReimbursementOut)
def update_reimbursement(
    reimburse_id: int,
    payload: schemas.ReimbursementUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance,
    )),
):
    r = db.query(models.Reimbursement).filter(models.Reimbursement.id == reimburse_id).first()
    if not r:
        raise HTTPException(404, detail="Reimbursement tidak ditemukan")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(r, field, value)
    db.commit()
    db.refresh(r)
    return r


@router.post("/{reimburse_id}/bukti")
async def upload_bukti_reimbursement(
    reimburse_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance,
    )),
):
    """Upload bukti pembayaran reimbursement."""
    r = db.query(models.Reimbursement).filter(models.Reimbursement.id == reimburse_id).first()
    if not r:
        raise HTTPException(404, detail="Reimbursement tidak ditemukan")

    upload_dir = os.path.join(settings.UPLOAD_DIR, "reimbursement")
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".jpg"
    filename = f"reimburse_{reimburse_id}{ext}"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    r.bukti_path = filepath
    r.status = models.ReimbursementStatus.paid
    db.commit()
    return {"message": "Bukti berhasil diupload", "path": filepath}
