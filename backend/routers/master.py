"""Master Item & Master Harga router."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import date
from decimal import Decimal
import pandas as pd
import math
import models, schemas, auth
from database import get_db
from services.price_service import hitung_harga_jual
from routers.config import get_margin_persen

router = APIRouter()


# ─── Master Item ──────────────────────────────────────────────────────────────

@router.get("/items", response_model=list[schemas.MasterItemOut])
def list_items(
    kategori: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    q = db.query(models.MasterItem)
    if kategori:
        q = q.filter(models.MasterItem.kategori == kategori)
    if search:
        q = q.filter(models.MasterItem.nama_item.ilike(f"%{search}%"))
    return q.order_by(models.MasterItem.nama_item).all()


@router.get("/items/{item_id}", response_model=schemas.MasterItemOut)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    item = db.query(models.MasterItem).filter(models.MasterItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item tidak ditemukan")
    return item


@router.post("/items", response_model=schemas.MasterItemOut)
def create_item(
    payload: schemas.MasterItemCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(models.UserRole.admin, models.UserRole.super_admin)),
):
    if db.query(models.MasterItem).filter(models.MasterItem.kode_item == payload.kode_item).first():
        raise HTTPException(status_code=400, detail="Kode item sudah dipakai")
    item = models.MasterItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/items/{item_id}", response_model=schemas.MasterItemOut)
def update_item(
    item_id: int,
    payload: schemas.MasterItemUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(models.UserRole.admin, models.UserRole.super_admin)),
):
    item = db.query(models.MasterItem).filter(models.MasterItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item tidak ditemukan")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}")
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(models.UserRole.super_admin)),
):
    item = db.query(models.MasterItem).filter(models.MasterItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item tidak ditemukan")
    item.is_active = False
    db.commit()
    return {"message": "Item dinonaktifkan"}


@router.post("/items/batch")
async def batch_upload_items(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(models.UserRole.admin, models.UserRole.super_admin)),
):
    if not file.filename.endswith('.xlsx'):
        raise HTTPException(status_code=400, detail="File harus berformat Excel (.xlsx)")

    try:
        df = pd.read_excel(file.file)
        
        # Kolom yang diharapkan
        expected_cols = ["Kode Item", "Nama Item", "Kategori", "Satuan", "Harga Beli"]
        for col in expected_cols:
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Kolom '{col}' tidak ditemukan di Excel.")
        
        updated_count = 0
        new_count = 0
        
        # Proses baris demi baris
        for index, row in df.iterrows():
            kode = str(row["Kode Item"]).strip()
            nama = str(row["Nama Item"]).strip()
            kategori = str(row["Kategori"]).strip() if pd.notna(row["Kategori"]) else "lainnya"
            satuan = str(row["Satuan"]).strip() if pd.notna(row["Satuan"]) else "pcs"
            
            # Parsing harga beli
            raw_harga = row["Harga Beli"]
            if pd.isna(raw_harga):
                continue
            try:
                harga_beli = Decimal(str(raw_harga))
            except:
                continue

            # 1. Cari atau buat Master Item
            item = db.query(models.MasterItem).filter(models.MasterItem.kode_item == kode).first()
            if not item:
                item = models.MasterItem(
                    kode_item=kode,
                    nama_item=nama,
                    satuan=satuan,
                    kategori=kategori,
                    is_active=True
                )
                db.add(item)
                db.flush() # untuk mendapatkan item.id
                new_count += 1
            else:
                # Update data master item
                item.nama_item = nama
                item.satuan = satuan
                item.kategori = kategori
                updated_count += 1

            # 2. Cek apakah harga beli berbeda dengan harga terkini
            current_harga = db.query(models.MasterHarga).filter(
                models.MasterHarga.item_id == item.id,
                models.MasterHarga.berlaku_sampai.is_(None)
            ).first()

            if not current_harga or current_harga.harga_beli != harga_beli:
                # Tutup harga lama
                if current_harga:
                    current_harga.berlaku_sampai = date.today()
                
                # Buat harga baru
                margin = get_margin_persen(db)
                harga_jual = hitung_harga_jual(harga_beli, margin=margin)
                new_harga = models.MasterHarga(
                    item_id=item.id,
                    harga_beli=harga_beli,
                    harga_jual=harga_jual,
                    margin_persen=(margin * 100).quantize(Decimal("0.01")),
                    berlaku_dari=date.today(),
                    updated_by=current_user.id
                )
                db.add(new_harga)

        db.commit()
        return {
            "message": "Upload batch berhasil",
            "new_items": new_count,
            "updated_items": updated_count
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Gagal memproses file: {str(e)}")

# ─── Master Harga ─────────────────────────────────────────────────────────────

@router.get("/harga", response_model=list[schemas.MasterHargaOut])
def list_harga(
    item_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    q = db.query(models.MasterHarga).options(joinedload(models.MasterHarga.item))
    if item_id:
        q = q.filter(models.MasterHarga.item_id == item_id)
    return q.order_by(models.MasterHarga.berlaku_dari.desc()).all()


@router.get("/harga/current", response_model=list[schemas.MasterHargaOut])
def get_current_harga(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    """Ambil harga terkini (berlaku_sampai IS NULL) untuk semua item."""
    return (
        db.query(models.MasterHarga)
        .options(joinedload(models.MasterHarga.item))
        .filter(models.MasterHarga.berlaku_sampai.is_(None))
        .order_by(models.MasterHarga.item_id)
        .all()
    )


@router.get("/harga/item/{item_id}/current", response_model=schemas.MasterHargaOut)
def get_current_harga_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    harga = (
        db.query(models.MasterHarga)
        .filter(
            models.MasterHarga.item_id == item_id,
            models.MasterHarga.berlaku_sampai.is_(None),
        )
        .order_by(models.MasterHarga.berlaku_dari.desc())
        .first()
    )
    if not harga:
        raise HTTPException(status_code=404, detail="Harga tidak ditemukan")
    return harga


@router.post("/harga", response_model=schemas.MasterHargaOut)
def create_harga(
    payload: schemas.MasterHargaCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """
    Tambah harga baru. Otomatis:
    1. Tutup harga lama (set berlaku_sampai = hari ini)
    2. Hitung harga_jual = harga_beli × 1.15
    """
    # Tutup harga lama
    old_harga = (
        db.query(models.MasterHarga)
        .filter(
            models.MasterHarga.item_id == payload.item_id,
            models.MasterHarga.berlaku_sampai.is_(None),
        )
        .first()
    )
    if old_harga:
        old_harga.berlaku_sampai = payload.berlaku_dari

    # Hitung harga jual otomatis dengan margin dari konfigurasi
    harga_beli = Decimal(str(payload.harga_beli))
    margin = get_margin_persen(db)
    harga_jual = hitung_harga_jual(harga_beli, margin=margin)

    new_harga = models.MasterHarga(
        item_id=payload.item_id,
        harga_beli=harga_beli,
        harga_jual=harga_jual,
        margin_persen=(margin * 100).quantize(Decimal("0.01")),
        supplier=payload.supplier,
        berlaku_dari=payload.berlaku_dari,
        updated_by=current_user.id,
    )
    db.add(new_harga)
    db.commit()
    db.refresh(new_harga)
    return new_harga


@router.delete("/harga/{harga_id}")
def delete_harga(
    harga_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(models.UserRole.super_admin)),
):
    harga = db.query(models.MasterHarga).filter(models.MasterHarga.id == harga_id).first()
    if not harga:
        raise HTTPException(status_code=404, detail="Data harga tidak ditemukan")
    db.delete(harga)
    db.commit()
    return {"message": "Data harga dihapus"}
