"""Hutang Piutang router - Hutang ke Supplier dan Piutang dari Dapur + Operasional."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional
from datetime import date
from decimal import Decimal
import models, schemas, auth
from database import get_db
import os, shutil

router = APIRouter()

# ─── Hutang Supplier ──────────────────────────────────────────────────────────

hutang_router = APIRouter()


def generate_nomor_hutang(db: Session) -> str:
    today = date.today()
    count = db.query(func.count(models.HutangSupplier.id)).scalar() + 1
    return f"HT/{today.year}/{today.month:02d}/{count:04d}"


@hutang_router.get("/", response_model=list[schemas.HutangOut])
def list_hutang(
    supplier_id: Optional[int] = None,
    status: Optional[models.HutangStatus] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    q = (
        db.query(models.HutangSupplier)
        .options(
            joinedload(models.HutangSupplier.supplier),
            joinedload(models.HutangSupplier.pembayaran_list),
        )
    )
    if supplier_id:
        q = q.filter(models.HutangSupplier.supplier_id == supplier_id)
    if status:
        q = q.filter(models.HutangSupplier.status == status)
    return q.order_by(models.HutangSupplier.tanggal.desc()).all()


@hutang_router.get("/summary")
def hutang_summary(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """Ringkasan hutang: total hutang, terbayar, sisa."""
    total = db.query(func.sum(models.HutangSupplier.jumlah)).scalar() or Decimal(0)
    terbayar = db.query(func.sum(models.HutangSupplier.jumlah_terbayar)).scalar() or Decimal(0)
    sisa = db.query(func.sum(models.HutangSupplier.sisa)).scalar() or Decimal(0)
    jatuh_tempo = db.query(func.count(models.HutangSupplier.id)).filter(
        models.HutangSupplier.jatuh_tempo < date.today(),
        models.HutangSupplier.status != models.HutangStatus.lunas,
    ).scalar()
    return {
        "total_hutang": float(total),
        "total_terbayar": float(terbayar),
        "total_sisa": float(sisa),
        "jumlah_lewat_jatuh_tempo": jatuh_tempo,
    }


@hutang_router.get("/{hutang_id}", response_model=schemas.HutangOut)
def get_hutang(
    hutang_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    hutang = (
        db.query(models.HutangSupplier)
        .options(
            joinedload(models.HutangSupplier.supplier),
            joinedload(models.HutangSupplier.pembayaran_list),
        )
        .filter(models.HutangSupplier.id == hutang_id)
        .first()
    )
    if not hutang:
        raise HTTPException(status_code=404, detail="Hutang tidak ditemukan")
    return hutang


@hutang_router.post("/", response_model=schemas.HutangOut)
def create_hutang(
    payload: schemas.HutangCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    supplier = db.query(models.Supplier).filter(models.Supplier.id == payload.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier tidak ditemukan")

    nomor = generate_nomor_hutang(db)
    # Hitung jatuh tempo dari terms pembayaran supplier jika tidak diisi
    jatuh_tempo = payload.jatuh_tempo
    if not jatuh_tempo and supplier.terms_pembayaran > 0:
        from datetime import timedelta
        jatuh_tempo = payload.tanggal + timedelta(days=supplier.terms_pembayaran)

    hutang = models.HutangSupplier(
        nomor_hutang=nomor,
        supplier_id=payload.supplier_id,
        po_id=payload.po_id,
        tanggal=payload.tanggal,
        jatuh_tempo=jatuh_tempo,
        jumlah=payload.jumlah,
        jumlah_terbayar=Decimal(0),
        sisa=payload.jumlah,
        deskripsi=payload.deskripsi,
        created_by=current_user.id,
    )
    db.add(hutang)
    db.commit()
    db.refresh(hutang)
    return hutang


@hutang_router.post("/{hutang_id}/bayar", response_model=schemas.HutangOut)
def bayar_hutang(
    hutang_id: int,
    payload: schemas.PembayaranHutangCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """Catat pembayaran hutang ke supplier."""
    hutang = db.query(models.HutangSupplier).filter(models.HutangSupplier.id == hutang_id).first()
    if not hutang:
        raise HTTPException(status_code=404, detail="Hutang tidak ditemukan")
    if hutang.status == models.HutangStatus.lunas:
        raise HTTPException(status_code=400, detail="Hutang sudah lunas")

    if payload.jumlah_bayar > hutang.sisa:
        raise HTTPException(
            status_code=400,
            detail=f"Jumlah bayar (Rp {float(payload.jumlah_bayar):,.0f}) melebihi sisa hutang (Rp {float(hutang.sisa):,.0f})"
        )

    pembayaran = models.PembayaranHutang(
        hutang_id=hutang_id,
        tanggal_bayar=payload.tanggal_bayar,
        jumlah_bayar=payload.jumlah_bayar,
        metode=payload.metode,
        referensi=payload.referensi,
        catatan=payload.catatan,
        created_by=current_user.id,
    )
    db.add(pembayaran)

    # Update hutang
    hutang.jumlah_terbayar = Decimal(str(hutang.jumlah_terbayar)) + payload.jumlah_bayar
    hutang.sisa = hutang.jumlah - hutang.jumlah_terbayar

    if hutang.sisa <= 0:
        hutang.status = models.HutangStatus.lunas
        hutang.sisa = Decimal(0)
        # Sinkronisasi status transaksi belanja jika terhubung
        transaksis = db.query(models.TransaksiBelanja).filter(models.TransaksiBelanja.hutang_id == hutang.id).all()
        for tb in transaksis:
            tb.status = models.BelanjaStatus.lunas
    elif hutang.jumlah_terbayar > 0:
        hutang.status = models.HutangStatus.sebagian

    db.commit()
    db.refresh(hutang)
    return hutang


@hutang_router.delete("/{hutang_id}")
def delete_hutang(
    hutang_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(models.UserRole.admin, models.UserRole.super_admin)),
):
    hutang = db.query(models.HutangSupplier).filter(models.HutangSupplier.id == hutang_id).first()
    if not hutang:
        raise HTTPException(status_code=404, detail="Hutang tidak ditemukan")
    if hutang.status != models.HutangStatus.belum_lunas or hutang.jumlah_terbayar > 0:
        raise HTTPException(status_code=400, detail="Hutang yang sudah ada pembayaran tidak bisa dihapus")
    db.delete(hutang)
    db.commit()
    return {"message": "Hutang dihapus"}


@hutang_router.post("/pembayaran/{pembayaran_id}/bukti")
async def upload_bukti_pembayaran(
    pembayaran_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance,
    )),
):
    """Upload bukti transfer/pembayaran untuk record PembayaranHutang."""
    pembayaran = db.query(models.PembayaranHutang).filter(
        models.PembayaranHutang.id == pembayaran_id
    ).first()
    if not pembayaran:
        raise HTTPException(404, detail="Record pembayaran tidak ditemukan")

    from config import settings
    upload_dir = os.path.join(settings.UPLOAD_DIR, "bukti_bayar")
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".jpg"
    filename = f"bayar_{pembayaran_id}{ext}"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    pembayaran.bukti_bayar_path = filepath
    db.commit()
    return {"message": "Bukti berhasil diupload", "path": filepath}


# ─── Piutang Dapur ────────────────────────────────────────────────────────────

piutang_router = APIRouter()


@piutang_router.get("/", response_model=list[schemas.PiutangOut])
def list_piutang(
    dapur_id: Optional[int] = None,
    status: Optional[models.PiutangStatus] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    q = (
        db.query(models.PiutangDapur)
        .options(joinedload(models.PiutangDapur.dapur))
    )
    if dapur_id:
        q = q.filter(models.PiutangDapur.dapur_id == dapur_id)
    if status:
        q = q.filter(models.PiutangDapur.status == status)
    return q.order_by(models.PiutangDapur.created_at.desc()).all()


@piutang_router.get("/summary")
def piutang_summary(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    total = db.query(func.sum(models.PiutangDapur.jumlah)).scalar() or Decimal(0)
    terbayar = db.query(func.sum(models.PiutangDapur.jumlah_terbayar)).scalar() or Decimal(0)
    sisa = db.query(func.sum(models.PiutangDapur.sisa)).scalar() or Decimal(0)
    jatuh_tempo = db.query(func.count(models.PiutangDapur.id)).filter(
        models.PiutangDapur.jatuh_tempo < date.today(),
        models.PiutangDapur.status != models.PiutangStatus.lunas,
    ).scalar()
    return {
        "total_piutang": float(total),
        "total_terbayar": float(terbayar),
        "total_sisa": float(sisa),
        "jumlah_lewat_jatuh_tempo": jatuh_tempo,
    }


@piutang_router.post("/", response_model=schemas.PiutangOut)
def create_piutang(
    payload: schemas.PiutangCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """Buat piutang dari invoice yang belum dibayar."""
    # Cek sudah ada piutang untuk invoice ini
    existing = db.query(models.PiutangDapur).filter(
        models.PiutangDapur.invoice_id == payload.invoice_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Piutang untuk invoice ini sudah ada")

    piutang = models.PiutangDapur(
        invoice_id=payload.invoice_id,
        dapur_id=payload.dapur_id,
        jumlah=payload.jumlah,
        jumlah_terbayar=Decimal(0),
        sisa=payload.jumlah,
        jatuh_tempo=payload.jatuh_tempo,
    )
    db.add(piutang)
    db.commit()
    db.refresh(piutang)
    return piutang


@piutang_router.post("/{piutang_id}/bayar", response_model=schemas.PiutangOut)
def bayar_piutang(
    piutang_id: int,
    payload: schemas.PiutangBayarCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """Catat pembayaran dari dapur."""
    piutang = db.query(models.PiutangDapur).filter(models.PiutangDapur.id == piutang_id).first()
    if not piutang:
        raise HTTPException(status_code=404, detail="Piutang tidak ditemukan")
    if piutang.status == models.PiutangStatus.lunas:
        raise HTTPException(status_code=400, detail="Piutang sudah lunas")

    piutang.jumlah_terbayar = Decimal(str(piutang.jumlah_terbayar)) + payload.jumlah_bayar
    piutang.sisa = piutang.jumlah - piutang.jumlah_terbayar

    if piutang.sisa <= 0:
        piutang.status = models.PiutangStatus.lunas
        piutang.sisa = Decimal(0)
        # Update invoice status
        invoice = db.query(models.Invoice).filter(models.Invoice.id == piutang.invoice_id).first()
        if invoice:
            invoice.status = models.InvoiceStatus.paid
    elif piutang.jumlah_terbayar > 0:
        piutang.status = models.PiutangStatus.sebagian

    db.commit()
    db.refresh(piutang)
    return piutang


# ─── Operasional Cost ─────────────────────────────────────────────────────────

operasional_router = APIRouter()


@operasional_router.get("/", response_model=list[schemas.OperasionalOut])
def list_operasional(
    periode_bulan: Optional[int] = None,
    periode_tahun: Optional[int] = None,
    kategori: Optional[models.KategoriOperasional] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    q = db.query(models.OperasionalCost)
    if periode_bulan:
        q = q.filter(models.OperasionalCost.periode_bulan == periode_bulan)
    if periode_tahun:
        q = q.filter(models.OperasionalCost.periode_tahun == periode_tahun)
    if kategori:
        q = q.filter(models.OperasionalCost.kategori == kategori)
    return q.order_by(models.OperasionalCost.tanggal.desc()).all()


@operasional_router.post("/", response_model=schemas.OperasionalOut)
def create_operasional(
    payload: schemas.OperasionalCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    cost = models.OperasionalCost(**payload.model_dump(), created_by=current_user.id)
    db.add(cost)
    db.commit()
    db.refresh(cost)
    return cost


@operasional_router.put("/{cost_id}", response_model=schemas.OperasionalOut)
def update_operasional(
    cost_id: int,
    payload: schemas.OperasionalUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    cost = db.query(models.OperasionalCost).filter(models.OperasionalCost.id == cost_id).first()
    if not cost:
        raise HTTPException(status_code=404, detail="Data tidak ditemukan")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(cost, field, value)
    db.commit()
    db.refresh(cost)
    return cost


@operasional_router.delete("/{cost_id}")
def delete_operasional(
    cost_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin
    )),
):
    cost = db.query(models.OperasionalCost).filter(models.OperasionalCost.id == cost_id).first()
    if not cost:
        raise HTTPException(status_code=404, detail="Data tidak ditemukan")
    db.delete(cost)
    db.commit()
    return {"message": "Data dihapus"}
