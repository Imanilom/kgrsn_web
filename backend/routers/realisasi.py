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
            harga_beli = Decimal(str(d.harga_satuan))
            # Coba ambil qty_po dan harga_jual dari PO Detail
            qty_po = Decimal(0)
            harga_j = harga_beli
            if d.po_detail_id:
                pod = db.query(models.PODetail).filter(models.PODetail.id == d.po_detail_id).first()
                if pod:
                    qty_po = Decimal(str(pod.qty))
                    harga_j = pod.harga_jual if pod.harga_jual else harga_beli

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
            harga_j = pod.harga_jual if pod.harga_jual else harga_beli

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


@router.post("/{realisasi_id}/detail", response_model=schemas.PORealisasiDetailOut)
def add_realisasi_detail(
    realisasi_id: int,
    payload: schemas.PORealisasiDetailCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_akuntan),
):
    """Menambahkan item extra/tambahan secara manual langsung ke realisasi draft."""
    rel = db.query(models.PORealisasi).filter(models.PORealisasi.id == realisasi_id).first()
    if not rel:
        raise HTTPException(status_code=404, detail="Realisasi tidak ditemukan")
    if rel.status != models.RealisasiStatus.draft:
        raise HTTPException(status_code=400, detail="Hanya realisasi berstatus DRAFT yang bisa ditambahkan item")
    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        if rel.dapur_id != current_user.dapur_id:
            raise HTTPException(status_code=403, detail="Akses ditolak")

    item_id = payload.item_id
    nama_item = payload.nama_item_raw
    if item_id:
        item = db.query(models.MasterItem).filter(models.MasterItem.id == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Item tidak ditemukan di master")
        if not nama_item:
            nama_item = item.nama_item

    if not nama_item:
        raise HTTPException(status_code=400, detail="Nama item tidak boleh kosong")

    # Hitung harga jual otomatis
    harga_jual = hitung_harga_jual(payload.harga_satuan, db=db)

    # Buat detail baru
    detail = models.PORealisasiDetail(
        realisasi_id=realisasi_id,
        po_detail_id=None,  # Item ekstra baru, tidak ada di PO asli
        item_id=item_id,
        nama_item_raw=nama_item,
        qty_po=Decimal(0),  # Tidak ada di PO
        qty_realisasi=payload.qty_realisasi,
        satuan=payload.satuan,
        harga_satuan=payload.harga_satuan,
        harga_jual=harga_jual,
        subtotal=payload.qty_realisasi * payload.harga_satuan,
        subtotal_jual=payload.qty_realisasi * harga_jual,
        catatan=payload.catatan
    )
    db.add(detail)
    db.flush()

    # Update total nilai realisasi
    details_all = db.query(models.PORealisasiDetail).filter(models.PORealisasiDetail.realisasi_id == realisasi_id).all()
    rel.total_nilai = sum(d.subtotal for d in details_all)
    rel.total_nilai_jual = sum(d.subtotal_jual for d in details_all)
    
    db.commit()
    db.refresh(detail)
    return detail


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
        detail.harga_jual = hitung_harga_jual(Decimal(str(payload.harga_satuan)), db=db)
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
    """Admin/Finance mengapprove realisasi. Jika ada item tambahan (tidak ada di PO asli), buat reimbursement."""
    rel = db.query(models.PORealisasi).filter(models.PORealisasi.id == realisasi_id).first()
    if not rel:
        raise HTTPException(status_code=404, detail="Realisasi tidak ditemukan")
    if rel.status not in (models.RealisasiStatus.draft, models.RealisasiStatus.submitted):
        raise HTTPException(status_code=400, detail="Realisasi tidak dalam status yang bisa diapprove")
    rel.status = models.RealisasiStatus.approved
    rel.approved_by = current_user.id
    rel.approved_at = func.now()

    # Dapatkan info relawan pembuat realisasi untuk mencatat rekeningnya di reimbursement
    creator = db.query(models.User).filter(models.User.id == rel.created_by).first() if rel.created_by else None
    rek_nomor = creator.rekening if creator else None
    rek_bank = creator.nama_bank if creator else None
    rek_nama = creator.nama_rekening or creator.full_name or creator.username if creator else None

    # Cek detail item yang tidak ada di PO asli (po_detail_id is NULL) -> buat reimbursement
    for det in rel.details:
        if not det.po_detail_id:
            # Cari supplier dari master_harga item jika ada, atau supplier default
            supplier_id = None
            if det.item_id:
                h_rec = db.query(models.MasterHarga).filter(
                    models.MasterHarga.item_id == det.item_id,
                    models.MasterHarga.berlaku_sampai.is_(None)
                ).first()
                if h_rec and h_rec.supplier:
                    # Cek supplier by name
                    sup = db.query(models.Supplier).filter(
                        func.lower(models.Supplier.nama) == func.lower(h_rec.supplier.strip())
                    ).first()
                    if sup:
                        supplier_id = sup.id

            reimb = models.Reimbursement(
                realisasi_id=rel.id,
                dapur_id=rel.dapur_id,
                supplier_id=supplier_id,
                nama_item=det.nama_item_raw or (det.item.nama_item if det.item else "Item Ekstra"),
                satuan=det.satuan or "pcs",
                qty=det.qty_realisasi,
                harga_satuan=det.harga_satuan,
                total=det.qty_realisasi * det.harga_satuan,
                status=models.ReimbursementStatus.pending,
                catatan=f"Otomatis dari realisasi #{rel.nomor_realisasi}",
                rekening_relawan=rek_nomor,
                nama_bank_relawan=rek_bank,
                nama_relawan=rek_nama,
                created_by=current_user.id,
            )
            db.add(reimb)

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
    jatuh_tempo = payload.jatuh_tempo or (payload.tanggal_invoice + timedelta(days=3))

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
                harga_j = hitung_harga_jual(harga_beli, db=db)

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


@router.post("/{realisasi_id}/geser")
def geser_realisasi_item(
    realisasi_id: int,
    payload: schemas.RealisasiGeserRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_akuntan),
):
    """
    Geser sebagian atau seluruh qty suatu item di realisasi ke tanggal lain.
    Hal ini dilakukan untuk mengontrol pagu harian di tanggal asal agar tidak over.
    Item yang digeser akan dibuatkan/dimasukkan ke PO dan Realisasi tanggal baru.
    """
    # 1. Validasi realisasi asal
    rel_asal = db.query(models.PORealisasi).filter(models.PORealisasi.id == realisasi_id).first()
    if not rel_asal:
        raise HTTPException(404, detail="Realisasi asal tidak ditemukan")
    if rel_asal.status != models.RealisasiStatus.draft:
        raise HTTPException(400, detail="Hanya realisasi berstatus DRAFT yang itemnya bisa digeser")

    # 2. Ambil detail item yang akan digeser
    detail_asal = db.query(models.PORealisasiDetail).filter(
        models.PORealisasiDetail.id == payload.detail_id,
        models.PORealisasiDetail.realisasi_id == realisasi_id
    ).first()
    if not detail_asal:
        raise HTTPException(404, detail="Item detail tidak ditemukan di realisasi ini")

    qty_geser = payload.qty_geser
    if qty_geser <= 0 or qty_geser > detail_asal.qty_realisasi:
        raise HTTPException(400, detail="Qty geser tidak valid atau melebihi qty realisasi saat ini")

    # Ambil info item asal
    item_id = detail_asal.item_id
    nama_item = detail_asal.nama_item_raw
    satuan = detail_asal.satuan
    harga_satuan = detail_asal.harga_satuan
    harga_jual = detail_asal.harga_jual

    # Kurangi qty di asal
    detail_asal.qty_realisasi -= qty_geser
    if detail_asal.qty_realisasi <= 0:
        db.delete(detail_asal)
    else:
        detail_asal.subtotal = detail_asal.qty_realisasi * detail_asal.harga_satuan
        detail_asal.subtotal_jual = detail_asal.qty_realisasi * detail_asal.harga_jual

    # Hitung ulang total nilai realisasi asal
    db.flush()
    details_asal_all = db.query(models.PORealisasiDetail).filter(models.PORealisasiDetail.realisasi_id == realisasi_id).all()
    rel_asal.total_nilai = sum(d.subtotal for d in details_asal_all)
    rel_asal.total_nilai_jual = sum(d.subtotal_jual for d in details_asal_all)

    # 3. Cari / Buat PO & Realisasi target pada tanggal_baru
    dapur_id = rel_asal.dapur_id
    tgl_baru = payload.tanggal_baru

    # Cek PO bahan baku pada tanggal baru untuk dapur ini
    po_target = db.query(models.PurchaseOrder).filter(
        models.PurchaseOrder.dapur_id == dapur_id,
        models.PurchaseOrder.tanggal_po == tgl_baru,
        models.PurchaseOrder.jenis_po == models.JenisPO.bahan_baku,
        models.PurchaseOrder.status != models.POStatus.cancelled
    ).first()

    if not po_target:
        # Buat PO draft baru
        from routers.po import generate_nomor_po
        nomor_po = generate_nomor_po(db)
        po_target = models.PurchaseOrder(
            nomor_po=nomor_po,
            dapur_id=dapur_id,
            tanggal_po=tgl_baru,
            tanggal_kirim=tgl_baru,
            catatan=f"Limpahan geser item dari tanggal {rel_asal.tanggal_realisasi}",
            status=models.POStatus.draft,
            jenis_po=models.JenisPO.bahan_baku,
            total_nilai=Decimal(0),
            created_by=current_user.id
        )
        db.add(po_target)
        db.flush()

    # Cek Realisasi draft pada PO target
    rel_target = db.query(models.PORealisasi).filter(
        models.PORealisasi.po_id == po_target.id,
        models.PORealisasi.status == models.RealisasiStatus.draft
    ).first()

    if not rel_target:
        # Buat Realisasi draft baru
        from routers.realisasi import generate_nomor_realisasi
        nomor_rel = generate_nomor_realisasi(db)
        rel_target = models.PORealisasi(
            nomor_realisasi=nomor_rel,
            po_id=po_target.id,
            dapur_id=dapur_id,
            tanggal_realisasi=tgl_baru,
            catatan=f"Limpahan realisasi dari tanggal {rel_asal.tanggal_realisasi}",
            status=models.RealisasiStatus.draft,
            total_nilai=Decimal(0),
            total_nilai_jual=Decimal(0)
        )
        db.add(rel_target)
        db.flush()

    # 4. Tambah/Gabung item ke realisasi target
    # Cek jika item sejenis sudah ada di realisasi target, gabungkan saja
    detail_target = None
    if item_id:
        detail_target = db.query(models.PORealisasiDetail).filter(
            models.PORealisasiDetail.realisasi_id == rel_target.id,
            models.PORealisasiDetail.item_id == item_id
        ).first()
    else:
        detail_target = db.query(models.PORealisasiDetail).filter(
            models.PORealisasiDetail.realisasi_id == rel_target.id,
            func.lower(models.PORealisasiDetail.nama_item_raw) == func.lower(nama_item)
        ).first()

    if detail_target:
        detail_target.qty_realisasi += qty_geser
        detail_target.subtotal = detail_target.qty_realisasi * detail_target.harga_satuan
        detail_target.subtotal_jual = detail_target.qty_realisasi * detail_target.harga_jual
    else:
        detail_target = models.PORealisasiDetail(
            realisasi_id=rel_target.id,
            item_id=item_id,
            nama_item_raw=nama_item,
            qty_po=Decimal(0), # limpahan, tidak ada di PO asal target
            qty_realisasi=qty_geser,
            satuan=satuan,
            harga_satuan=harga_satuan,
            harga_jual=harga_jual,
            subtotal=qty_geser * harga_satuan,
            subtotal_jual=qty_geser * harga_jual,
            catatan="Item limpahan/geseran"
        )
        db.add(detail_target)

    # Hitung ulang total nilai realisasi target & PO target
    db.flush()
    details_target_all = db.query(models.PORealisasiDetail).filter(models.PORealisasiDetail.realisasi_id == rel_target.id).all()
    rel_target.total_nilai = sum(d.subtotal for d in details_target_all)
    rel_target.total_nilai_jual = sum(d.subtotal_jual for d in details_target_all)
    po_target.total_nilai = rel_target.total_nilai

    db.commit()
    db.refresh(rel_asal)
    return rel_asal

