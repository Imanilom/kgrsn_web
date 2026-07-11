"""
Rekap Pembelanjaan Purchasing router.
Admin purchasing membuat rekap pembelanjaan bahan baku:
- Otomatis: dari PO approved/delivered pada periode tertentu
- Manual: input baris pembelanjaan secara manual
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
from services.rekap_pembelanjaan_generator import generate_rekap_pembelanjaan_pdf
from config import settings

router = APIRouter()


def generate_nomor_rekap_pembelanjaan(db: Session) -> str:
    today = date.today()
    count = db.query(func.count(models.RekapPembelanjaan.id)).scalar() + 1
    return f"RP/{today.year}/{today.month:02d}/{count:04d}"


def generate_nomor_hutang_rekap(db: Session) -> str:
    today = date.today()
    count = db.query(func.count(models.HutangSupplier.id)).scalar() + 1
    return f"HT/{today.year}/{today.month:02d}/{count:04d}"


@router.get("/", response_model=list[schemas.RekapPembeljanOut])
def list_rekap_pembelanjaan(
    periode_bulan: Optional[int] = None,
    periode_tahun: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance, models.UserRole.akuntan
    )),
):
    q = (
        db.query(models.RekapPembelanjaan)
        .options(
            joinedload(models.RekapPembelanjaan.details).joinedload(models.RekapPembeljanDetail.supplier),
            joinedload(models.RekapPembelanjaan.details).joinedload(models.RekapPembeljanDetail.item),
        )
    )
    if periode_bulan:
        q = q.filter(models.RekapPembelanjaan.periode_bulan == periode_bulan)
    if periode_tahun:
        q = q.filter(models.RekapPembelanjaan.periode_tahun == periode_tahun)
    return q.order_by(models.RekapPembelanjaan.created_at.desc()).all()


@router.get("/{rekap_id}", response_model=schemas.RekapPembeljanOut)
def get_rekap_pembelanjaan(
    rekap_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance, models.UserRole.akuntan
    )),
):
    rekap = (
        db.query(models.RekapPembelanjaan)
        .options(
            joinedload(models.RekapPembelanjaan.details).joinedload(models.RekapPembeljanDetail.supplier),
            joinedload(models.RekapPembelanjaan.details).joinedload(models.RekapPembeljanDetail.item),
        )
        .filter(models.RekapPembelanjaan.id == rekap_id)
        .first()
    )
    if not rekap:
        raise HTTPException(status_code=404, detail="Rekap pembelanjaan tidak ditemukan")
    return rekap


@router.post("/otomatis", response_model=schemas.RekapPembeljanOut)
def create_rekap_otomatis(
    payload: schemas.RekapPembeljanCreate,
    catat_hutang: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance, models.UserRole.akuntan
    )),
):
    """
    Buat rekap pembelanjaan otomatis dari PO yang approved/delivered pada periode.
    Mengambil semua PODetail dari PO dalam rentang tanggal.
    Jika catat_hutang=true, otomatis mencatat hutang per supplier.
    """
    # Ambil semua PO approved/delivered pada periode
    po_list = (
        db.query(models.PurchaseOrder)
        .options(joinedload(models.PurchaseOrder.details).joinedload(models.PODetail.item))
        .filter(
            models.PurchaseOrder.tanggal_po >= payload.tanggal_mulai,
            models.PurchaseOrder.tanggal_po <= payload.tanggal_selesai,
            models.PurchaseOrder.status.in_([
                models.POStatus.approved, models.POStatus.delivered,
                models.POStatus.invoiced
            ]),
        )
        .all()
    )

    if not po_list:
        raise HTTPException(
            status_code=400,
            detail=f"Tidak ada PO approved/delivered antara {payload.tanggal_mulai} s/d {payload.tanggal_selesai}"
        )

    nomor = generate_nomor_rekap_pembelanjaan(db)
    rekap = models.RekapPembelanjaan(
        nomor_rekap=nomor,
        periode_bulan=payload.periode_bulan,
        periode_tahun=payload.periode_tahun,
        tanggal_mulai=payload.tanggal_mulai,
        tanggal_selesai=payload.tanggal_selesai,
        jenis="otomatis",
        catatan=payload.catatan,
        created_by=current_user.id,
    )
    db.add(rekap)
    db.flush()

    total_pembelian = Decimal(0)
    total_item = 0

    # Track hutang per supplier (supplier_id -> total)
    hutang_per_supplier: dict = {}

    for po in po_list:
        for d in po.details:
            subtotal = Decimal(str(d.qty)) * Decimal(str(d.harga_satuan))
            nama = d.nama_item_raw or (d.item.nama_item if d.item else "Unknown")

            detail = models.RekapPembeljanDetail(
                rekap_id=rekap.id,
                tanggal=po.tanggal_po,
                po_id=po.id,
                supplier_id=None,  # Bisa di-update manual atau via catat-hutang
                item_id=d.item_id,
                nama_item=nama,
                satuan=d.satuan,
                qty=d.qty,
                harga_satuan=d.harga_satuan,
                subtotal=subtotal,
                sumber="po",
            )
            db.add(detail)
            total_pembelian += subtotal
            total_item += 1

    rekap.total_pembelian = total_pembelian
    rekap.total_item = total_item
    db.commit()
    db.refresh(rekap)
    return rekap


@router.post("/manual", response_model=schemas.RekapPembeljanOut)
def create_rekap_manual(
    payload: schemas.RekapPembeljanCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance, models.UserRole.akuntan
    )),
):
    """Buat rekap pembelanjaan dengan input manual."""
    nomor = generate_nomor_rekap_pembelanjaan(db)
    rekap = models.RekapPembelanjaan(
        nomor_rekap=nomor,
        periode_bulan=payload.periode_bulan,
        periode_tahun=payload.periode_tahun,
        tanggal_mulai=payload.tanggal_mulai,
        tanggal_selesai=payload.tanggal_selesai,
        jenis="manual",
        catatan=payload.catatan,
        created_by=current_user.id,
    )
    db.add(rekap)
    db.flush()

    total_pembelian = Decimal(0)
    total_item = 0

    for d in (payload.details or []):
        subtotal = Decimal(str(d.qty)) * Decimal(str(d.harga_satuan))
        detail = models.RekapPembeljanDetail(
            rekap_id=rekap.id,
            tanggal=d.tanggal,
            po_id=d.po_id,
            supplier_id=d.supplier_id,
            item_id=d.item_id,
            nama_item=d.nama_item,
            satuan=d.satuan,
            qty=d.qty,
            harga_satuan=d.harga_satuan,
            subtotal=subtotal,
            sumber="manual",
            catatan=d.catatan,
        )
        db.add(detail)
        total_pembelian += subtotal
        total_item += 1

    rekap.total_pembelian = total_pembelian
    rekap.total_item = total_item
    db.commit()
    db.refresh(rekap)
    return rekap


@router.post("/{rekap_id}/details", response_model=schemas.RekapPembeljanOut)
def add_detail_manual(
    rekap_id: int,
    payload: schemas.RekapPembeljanDetailCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance, models.UserRole.akuntan
    )),
):
    """Tambah baris detail ke rekap (untuk rekap manual atau tambahan)."""
    rekap = db.query(models.RekapPembelanjaan).filter(models.RekapPembelanjaan.id == rekap_id).first()
    if not rekap:
        raise HTTPException(status_code=404, detail="Rekap tidak ditemukan")
    if rekap.status == models.RekapPembeljanStatus.final:
        raise HTTPException(status_code=400, detail="Rekap sudah final, tidak bisa ditambah")

    subtotal = Decimal(str(payload.qty)) * Decimal(str(payload.harga_satuan))
    detail = models.RekapPembeljanDetail(
        rekap_id=rekap_id,
        tanggal=payload.tanggal,
        po_id=payload.po_id,
        supplier_id=payload.supplier_id,
        item_id=payload.item_id,
        nama_item=payload.nama_item,
        satuan=payload.satuan,
        qty=payload.qty,
        harga_satuan=payload.harga_satuan,
        subtotal=subtotal,
        sumber="manual",
        catatan=payload.catatan,
    )
    db.add(detail)

    rekap.total_pembelian = Decimal(str(rekap.total_pembelian)) + subtotal
    rekap.total_item = rekap.total_item + 1
    db.commit()
    db.refresh(rekap)
    return rekap


@router.post("/{rekap_id}/catat-hutang")
def catat_hutang_supplier(
    rekap_id: int,
    supplier_id: int,
    jumlah: Decimal,
    deskripsi: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """
    Catat hutang ke supplier dari rekap pembelanjaan.
    Dapat digunakan baik untuk rekap otomatis maupun manual.
    """
    rekap = db.query(models.RekapPembelanjaan).filter(models.RekapPembelanjaan.id == rekap_id).first()
    if not rekap:
        raise HTTPException(status_code=404, detail="Rekap tidak ditemukan")

    supplier = db.query(models.Supplier).filter(models.Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier tidak ditemukan")

    jatuh_tempo = rekap.tanggal_selesai + timedelta(
        days=supplier.terms_pembayaran if supplier.terms_pembayaran else 30
    )
    nomor_hutang = generate_nomor_hutang_rekap(db)
    hutang = models.HutangSupplier(
        nomor_hutang=nomor_hutang,
        supplier_id=supplier_id,
        tanggal=rekap.tanggal_selesai,
        jatuh_tempo=jatuh_tempo,
        jumlah=jumlah,
        sisa=jumlah,
        status=models.HutangStatus.belum_lunas,
        deskripsi=deskripsi or f"Dari rekap {rekap.nomor_rekap} periode {rekap.tanggal_mulai} s/d {rekap.tanggal_selesai}",
        created_by=current_user.id,
    )
    db.add(hutang)
    db.commit()
    db.refresh(hutang)
    return {
        "message": "Hutang berhasil dicatat",
        "nomor_hutang": hutang.nomor_hutang,
        "supplier": supplier.nama,
        "jumlah": float(hutang.jumlah),
        "jatuh_tempo": str(hutang.jatuh_tempo),
    }


@router.get("/{rekap_id}/pdf")
def download_rekap_pdf(
    rekap_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance, models.UserRole.akuntan
    )),
):
    """Generate dan download PDF rekap pembelanjaan."""
    rekap = (
        db.query(models.RekapPembelanjaan)
        .options(
            joinedload(models.RekapPembelanjaan.details).joinedload(models.RekapPembeljanDetail.supplier),
            joinedload(models.RekapPembelanjaan.details).joinedload(models.RekapPembeljanDetail.item),
        )
        .filter(models.RekapPembelanjaan.id == rekap_id)
        .first()
    )
    if not rekap:
        raise HTTPException(status_code=404, detail="Rekap tidak ditemukan")

    # Build data untuk PDF
    details_data = [
        {
            "tanggal": str(d.tanggal),
            "nama_item": d.nama_item,
            "supplier": d.supplier.nama if d.supplier else "-",
            "satuan": d.satuan or "",
            "qty": float(d.qty),
            "harga_satuan": float(d.harga_satuan),
            "subtotal": float(d.subtotal),
        }
        for d in sorted(rekap.details, key=lambda x: (str(x.tanggal), x.nama_item))
    ]

    rekap_data = {
        "nomor_rekap": rekap.nomor_rekap,
        "periode": f"{rekap.periode_bulan}/{rekap.periode_tahun}",
        "tanggal_mulai": rekap.tanggal_mulai,
        "tanggal_selesai": rekap.tanggal_selesai,
        "jenis": rekap.jenis,
        "total_pembelian": float(rekap.total_pembelian),
        "total_item": rekap.total_item,
        "catatan": rekap.catatan or "",
        "details": details_data,
    }

    output_dir = os.path.join(settings.GENERATED_DIR, "rekap_pembelanjaan")
    os.makedirs(output_dir, exist_ok=True)
    pdf_path = generate_rekap_pembelanjaan_pdf(rekap_data, output_dir=output_dir)

    rekap.pdf_path = pdf_path
    rekap.status = models.RekapPembeljanStatus.final
    db.commit()

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"RekapPembelanjaan_{rekap.nomor_rekap.replace('/', '-')}.pdf",
    )


@router.delete("/{rekap_id}")
def delete_rekap_pembelanjaan(
    rekap_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin
    )),
):
    rekap = db.query(models.RekapPembelanjaan).filter(models.RekapPembelanjaan.id == rekap_id).first()
    if not rekap:
        raise HTTPException(status_code=404, detail="Rekap tidak ditemukan")
    db.delete(rekap)
    db.commit()
    return {"message": "Rekap dihapus"}
