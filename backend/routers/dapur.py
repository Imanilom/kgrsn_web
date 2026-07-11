"""Dapur (Kitchen) router - CRUD manajemen dapur."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
import models, schemas, auth
from database import get_db

router = APIRouter()


@router.get("/", response_model=list[schemas.DapurOut])
def list_dapur(
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    q = db.query(models.Dapur)
    if is_active is not None:
        q = q.filter(models.Dapur.is_active == is_active)
    return q.order_by(models.Dapur.kode).all()


@router.get("/{dapur_id}", response_model=schemas.DapurOut)
def get_dapur(
    dapur_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    dapur = db.query(models.Dapur).filter(models.Dapur.id == dapur_id).first()
    if not dapur:
        raise HTTPException(status_code=404, detail="Dapur tidak ditemukan")
    return dapur


@router.post("/", response_model=schemas.DapurOut)
def create_dapur(
    payload: schemas.DapurCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(models.UserRole.admin, models.UserRole.super_admin)),
):
    if db.query(models.Dapur).filter(models.Dapur.kode == payload.kode).first():
        raise HTTPException(status_code=400, detail="Kode dapur sudah dipakai")
    dapur = models.Dapur(**payload.model_dump())
    db.add(dapur)
    db.commit()
    db.refresh(dapur)
    return dapur


@router.put("/{dapur_id}", response_model=schemas.DapurOut)
def update_dapur(
    dapur_id: int,
    payload: schemas.DapurUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(models.UserRole.admin, models.UserRole.super_admin)),
):
    dapur = db.query(models.Dapur).filter(models.Dapur.id == dapur_id).first()
    if not dapur:
        raise HTTPException(status_code=404, detail="Dapur tidak ditemukan")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(dapur, field, value)
    db.commit()
    db.refresh(dapur)
    return dapur


@router.delete("/{dapur_id}")
def delete_dapur(
    dapur_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(models.UserRole.super_admin)),
):
    dapur = db.query(models.Dapur).filter(models.Dapur.id == dapur_id).first()
    if not dapur:
        raise HTTPException(status_code=404, detail="Dapur tidak ditemukan")
    dapur.is_active = False   # Soft delete
    db.commit()
    return {"message": "Dapur dinonaktifkan"}
