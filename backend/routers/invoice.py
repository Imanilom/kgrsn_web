"""Invoice router - generate, manage, dan download invoice."""
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
from services.invoice_generator import generate_invoice_pdf
from services.price_service import hitung_harga_jual

router = APIRouter()


def generate_nomor_invoice(db: Session) -> str:
    today = date.today()
    count = db.query(func.count(models.Invoice.id)).scalar() + 1
    return f"INV/{today.year}/{today.month:02d}/{count:04d}"


@router.get("/", response_model=schemas.PaginatedResponse[schemas.InvoiceListOut])
def list_invoice(
    dapur_id: Optional[int] = None,
    status: Optional[models.InvoiceStatus] = None,
    tanggal_dari: Optional[date] = None,
    tanggal_sampai: Optional[date] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    q = (
        db.query(models.Invoice)
        .options(joinedload(models.Invoice.dapur))
    )

    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        q = q.filter(models.Invoice.dapur_id == current_user.dapur_id)
    elif dapur_id:
        q = q.filter(models.Invoice.dapur_id == dapur_id)

    if status:
        q = q.filter(models.Invoice.status == status)
    if tanggal_dari:
        q = q.filter(models.Invoice.tanggal_invoice >= tanggal_dari)
    if tanggal_sampai:
        q = q.filter(models.Invoice.tanggal_invoice <= tanggal_sampai)
    if search:
        q = q.filter(models.Invoice.nomor_invoice.ilike(f"%{search}%"))

    total = q.count()
    skip = (page - 1) * limit
    items = q.order_by(models.Invoice.created_at.desc()).offset(skip).limit(limit).all()
    import math
    return {
        "data": items,
        "total": total,
        "page": page,
        "size": limit,
        "total_pages": math.ceil(total / limit) if limit else 1,
    }


@router.get("/recap")
def invoice_recap(
    tanggal_dari: date,
    tanggal_sampai: date,
    dapur_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Rekap item yang dipesan per dapur dalam rentang tanggal invoice."""
    if tanggal_dari > tanggal_sampai:
        raise HTTPException(status_code=400, detail="Tanggal mulai tidak boleh setelah tanggal akhir")

    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        dapur_id = current_user.dapur_id

    query = (
        db.query(models.Invoice)
        .options(joinedload(models.Invoice.dapur), joinedload(models.Invoice.details))
        .filter(
            models.Invoice.tanggal_invoice >= tanggal_dari,
            models.Invoice.tanggal_invoice <= tanggal_sampai,
            models.Invoice.is_draft == False,
            models.Invoice.status != models.InvoiceStatus.cancelled,
        )
    )
    if dapur_id:
        query = query.filter(models.Invoice.dapur_id == dapur_id)

    invoices = query.order_by(models.Invoice.tanggal_invoice, models.Invoice.nomor_invoice).all()
    item_map = {}

    for invoice in invoices:
        for detail in invoice.details:
            nama_item = (detail.nama_item or "").strip()
            satuan = (detail.satuan or "").strip()
            key = (nama_item.casefold(), satuan.casefold())
            if key not in item_map:
                item_map[key] = {
                    "nama_item": nama_item,
                    "satuan": satuan or None,
                    "qty_total": Decimal(0),
                    "total_nilai": Decimal(0),
                    "invoices": [],
                }

            qty = Decimal(str(detail.qty or 0))
            subtotal = Decimal(str(detail.subtotal or 0))
            item_map[key]["qty_total"] += qty
            item_map[key]["total_nilai"] += subtotal
            item_map[key]["invoices"].append({
                "invoice_id": invoice.id,
                "nomor_invoice": invoice.nomor_invoice,
                "tanggal_invoice": invoice.tanggal_invoice,
                "dapur_nama": invoice.dapur.nama if invoice.dapur else "Tanpa Dapur",
                "qty": qty,
                "subtotal": subtotal,
            })

    items = []
    for item in item_map.values():
        item["qty_total"] = float(item["qty_total"])
        item["total_nilai"] = float(item["total_nilai"])
        for invoice_item in item["invoices"]:
            invoice_item["qty"] = float(invoice_item["qty"])
            invoice_item["subtotal"] = float(invoice_item["subtotal"])
        items.append(item)

    items.sort(key=lambda item: item["nama_item"].casefold())
    return {
        "tanggal_dari": tanggal_dari,
        "tanggal_sampai": tanggal_sampai,
        "dapur_id": dapur_id,
        "summary": {
            "total_invoice": len(invoices),
            "total_item": len(items),
            "total_qty": sum(item["qty_total"] for item in items),
            "total_nilai": sum(item["total_nilai"] for item in items),
        },
        "items": items,
    }


@router.get("/{invoice_id}", response_model=schemas.InvoiceOut)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    inv = (
        db.query(models.Invoice)
        .options(joinedload(models.Invoice.dapur))
        .options(joinedload(models.Invoice.details))
        .filter(models.Invoice.id == invoice_id)
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice tidak ditemukan")
        
    if current_user.role in (models.UserRole.akuntan, models.UserRole.operator):
        if inv.dapur_id != current_user.dapur_id:
            raise HTTPException(status_code=403, detail="Akses ditolak: Invoice ini bukan untuk dapur Anda")
            
    return inv


@router.post("/generate/{po_id}", response_model=schemas.InvoiceOut)
def generate_invoice(
    po_id: int,
    payload: schemas.InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.finance, models.UserRole.admin, models.UserRole.super_admin
    )),
):
    """
    Generate invoice dari PO yang sudah approved.
    Harga jual = harga beli × 1.15 (dari master_harga, atau dari harga PO jika tidak ada).
    """
    po = (
        db.query(models.PurchaseOrder)
        .options(joinedload(models.PurchaseOrder.dapur))
        .options(joinedload(models.PurchaseOrder.details).joinedload(models.PODetail.item))
        .filter(models.PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="PO tidak ditemukan")
    if po.status not in (models.POStatus.approved, models.POStatus.delivered):
        raise HTTPException(status_code=400, detail="PO harus approved/delivered sebelum dibuat invoice")

    # Cek sudah ada invoice untuk PO ini
    existing = db.query(models.Invoice).filter(
        models.Invoice.po_id == po_id,
        models.Invoice.status != models.InvoiceStatus.cancelled,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Invoice sudah ada: {existing.nomor_invoice}")

    # Pastikan data harga di PO tersinkronisasi dengan belanja jika ada alokasi
    from routers.belanja import sync_po_and_invoice_from_belanja
    sync_po_and_invoice_from_belanja(db, [po_id], current_user.id)
    db.refresh(po)

    nomor = generate_nomor_invoice(db)
    jatuh_tempo = payload.jatuh_tempo or (payload.tanggal_invoice + timedelta(days=1))

    invoice = models.Invoice(
        nomor_invoice=nomor,
        po_id=po_id,
        dapur_id=po.dapur_id,
        tanggal_invoice=payload.tanggal_invoice,
        jatuh_tempo=jatuh_tempo,
        catatan=payload.catatan,
        created_by=current_user.id,
    )
    db.add(invoice)
    db.flush()

    total = Decimal(0)
    for po_detail in po.details:
        harga_beli = po_detail.harga_satuan
        harga_jual = po_detail.harga_jual if po_detail.harga_jual else harga_beli

        qty = Decimal(str(po_detail.qty))
        subtotal = qty * harga_jual

        inv_detail = models.InvoiceDetail(
            invoice_id=invoice.id,
            po_detail_id=po_detail.id,
            nama_item=po_detail.nama_item_raw or (po_detail.item.nama_item if po_detail.item else ""),
            qty=qty,
            qty_po=qty,         # Dari PO langsung, qty_po = qty
            qty_realisasi=None,  # Tidak ada realisasi — invoice dari PO langsung
            satuan=po_detail.satuan,
            harga_beli=harga_beli,
            harga_jual=harga_jual,
            subtotal=subtotal,
        )
        db.add(inv_detail)
        total += subtotal

    invoice.subtotal = total
    invoice.total = total   # Tanpa pajak

    # Update status PO
    po.status = models.POStatus.invoiced

    db.commit()
    db.refresh(invoice)

    # Generate PDF
    _generate_and_save_pdf(invoice, db)
    db.commit()

    return invoice


def _generate_and_save_pdf(invoice: models.Invoice, db: Session):
    """Helper: generate PDF dan update path di database."""
    dapur = invoice.dapur
    details_data = [
        {
            "nama_item": d.nama_item,
            "qty": float(d.qty),
            "satuan": d.satuan or "",
            "harga_beli": float(d.harga_beli),
            "harga_jual": float(d.harga_jual),
            "subtotal": float(d.subtotal),
        }
        for d in invoice.details
    ]
    invoice_data = {
        "nomor_invoice": invoice.nomor_invoice,
        "tanggal_invoice": invoice.tanggal_invoice,
        "jatuh_tempo": invoice.jatuh_tempo,
        "dapur_nama": dapur.nama if dapur else "",
        "dapur_alamat": dapur.alamat or "" if dapur else "",
        "dapur_kontak": dapur.kontak or "" if dapur else "",
        "status": invoice.status.value,
        "is_draft": invoice.is_draft,
        "details": details_data,
        "subtotal": float(invoice.subtotal or 0),
        "total": float(invoice.total or 0),
        "catatan": invoice.catatan or "",
    }
    pdf_path = generate_invoice_pdf(invoice_data)
    invoice.pdf_path = pdf_path


def _generate_and_save_pdf_realisasi(invoice: models.Invoice, realisasi: models.PORealisasi, db: Session):
    """Helper: generate PDF invoice dari PO Realisasi."""
    dapur = realisasi.dapur or invoice.dapur
    details_data = [
        {
            "nama_item": d.nama_item,
            "qty": float(d.qty),
            "satuan": d.satuan or "",
            "harga_beli": float(d.harga_beli),
            "harga_jual": float(d.harga_jual),
            "subtotal": float(d.subtotal),
        }
        for d in invoice.details
    ]
    invoice_data = {
        "nomor_invoice": invoice.nomor_invoice,
        "tanggal_invoice": invoice.tanggal_invoice,
        "jatuh_tempo": invoice.jatuh_tempo,
        "dapur_nama": dapur.nama if dapur else "",
        "dapur_alamat": dapur.alamat or "" if dapur else "",
        "dapur_kontak": dapur.kontak or "" if dapur else "",
        "status": invoice.status.value,
        "is_draft": invoice.is_draft,
        "nomor_realisasi": realisasi.nomor_realisasi,
        "details": details_data,
        "subtotal": float(invoice.subtotal or 0),
        "total": float(invoice.total or 0),
        "catatan": invoice.catatan or "",
    }
    pdf_path = generate_invoice_pdf(invoice_data)
    invoice.pdf_path = pdf_path


@router.get("/{invoice_id}/download")
def download_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    invoice = db.query(models.Invoice).options(
        joinedload(models.Invoice.dapur),
        joinedload(models.Invoice.details),
    ).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice tidak ditemukan")

    # Selalu regenerate agar perubahan template langsung terlihat
    _generate_and_save_pdf(invoice, db)
    db.commit()

    return FileResponse(
        path=invoice.pdf_path,
        media_type="application/pdf",
        filename=f"Invoice_{invoice.nomor_invoice.replace('/', '-')}.pdf",
    )


@router.put("/{invoice_id}/paid", response_model=schemas.InvoiceOut)
def mark_paid(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.finance, models.UserRole.admin, models.UserRole.super_admin
    )),
):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice tidak ditemukan")
    invoice.status = models.InvoiceStatus.paid
    invoice.paid_at = func.now()
    db.commit()
    db.refresh(invoice)
    return invoice


@router.put("/{invoice_id}", response_model=schemas.InvoiceOut)
def update_invoice(
    invoice_id: int,
    payload: schemas.InvoiceUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.finance, models.UserRole.admin, models.UserRole.super_admin
    )),
):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice tidak ditemukan")
    
    needs_pdf_regen = False
    for field, value in payload.model_dump(exclude_none=True).items():
        if getattr(invoice, field) != value:
            setattr(invoice, field, value)
            if field in ("tanggal_invoice", "jatuh_tempo", "catatan"):
                needs_pdf_regen = True

    db.commit()
    db.refresh(invoice)

    if needs_pdf_regen:
        if invoice.realisasi_id:
            realisasi = db.query(models.PORealisasi).filter(models.PORealisasi.id == invoice.realisasi_id).first()
            if realisasi:
                _generate_and_save_pdf_realisasi(invoice, realisasi, db)
        else:
            _generate_and_save_pdf(invoice, db)
        db.commit()
        
    return invoice


@router.post("/{invoice_id}/details", response_model=schemas.InvoiceOut)
def add_invoice_detail(
    invoice_id: int,
    payload: schemas.InvoiceDetailCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    invoice = (
        db.query(models.Invoice)
        .options(joinedload(models.Invoice.dapur))
        .options(joinedload(models.Invoice.details))
        .filter(models.Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice tidak ditemukan")
    if invoice.status == models.InvoiceStatus.paid:
        raise HTTPException(status_code=400, detail="Tidak dapat menambah item pada invoice yang sudah lunas")

    subtotal = payload.qty * payload.harga_jual
    new_detail = models.InvoiceDetail(
        invoice_id=invoice.id,
        po_detail_id=payload.po_detail_id,
        nama_item=payload.nama_item,
        qty=payload.qty,
        qty_po=payload.qty_po,
        qty_realisasi=payload.qty_realisasi,
        satuan=payload.satuan,
        harga_beli=payload.harga_beli,
        harga_jual=payload.harga_jual,
        subtotal=subtotal,
    )
    db.add(new_detail)
    
    # Recalculate total invoice
    total = sum(Decimal(str(d.subtotal or 0)) for d in invoice.details) + subtotal
    invoice.subtotal = total
    invoice.total = total

    db.flush()
    # Regenerate PDF Invoice
    _generate_and_save_pdf(invoice, db)

    db.commit()
    db.refresh(invoice)
    return invoice


@router.put("/details/{detail_id}", response_model=schemas.InvoiceOut)
def update_invoice_detail(
    detail_id: int,
    payload: schemas.InvoiceDetailUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """
    Update detail item invoice (misal ubah harga jual saat ada penawaran harga dari dapur).
    Hanya dapat dilakukan oleh Admin / Super Admin / Finance.
    """
    detail = db.query(models.InvoiceDetail).filter(models.InvoiceDetail.id == detail_id).first()
    if not detail:
        raise HTTPException(status_code=404, detail="Detail invoice tidak ditemukan")

    invoice = (
        db.query(models.Invoice)
        .options(joinedload(models.Invoice.dapur))
        .options(joinedload(models.Invoice.details))
        .filter(models.Invoice.id == detail.invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice tidak ditemukan")
    if invoice.status == models.InvoiceStatus.paid:
        raise HTTPException(status_code=400, detail="Invoice yang sudah lunas tidak dapat diubah")

    if payload.harga_jual is not None:
        detail.harga_jual = payload.harga_jual
    if payload.harga_beli is not None:
        detail.harga_beli = payload.harga_beli
    if payload.qty is not None:
        detail.qty = payload.qty
        if detail.qty_realisasi is not None:
            detail.qty_realisasi = payload.qty
    if payload.satuan is not None:
        detail.satuan = payload.satuan

    detail.subtotal = Decimal(str(detail.qty)) * Decimal(str(detail.harga_jual))

    # Sinkronkan ke PO Detail dan Master Item / Master Harga agar data harga konsisten
    if detail.po_detail_id:
        po_det = db.query(models.PODetail).filter(models.PODetail.id == detail.po_detail_id).first()
        if po_det:
            if payload.harga_jual is not None:
                po_det.harga_jual = payload.harga_jual
            if payload.harga_beli is not None:
                po_det.harga_satuan = payload.harga_beli
                po_det.subtotal = Decimal(str(po_det.qty or 0)) * Decimal(str(payload.harga_beli))
            if po_det.item_id:
                m_harga = db.query(models.MasterHarga).filter(
                    models.MasterHarga.item_id == po_det.item_id,
                    models.MasterHarga.berlaku_sampai.is_(None)
                ).first()
                if m_harga:
                    if payload.harga_jual is not None:
                        m_harga.harga_jual = payload.harga_jual
                    if payload.harga_beli is not None:
                        m_harga.harga_beli = payload.harga_beli

    # Recalculate total invoice
    total = sum(Decimal(str(d.subtotal or 0)) for d in invoice.details)
    invoice.subtotal = total
    invoice.total = total

    # Regenerate PDF Invoice
    _generate_and_save_pdf(invoice, db)

    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/{invoice_id}/margin")
def get_invoice_margin(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(
        models.UserRole.finance, models.UserRole.admin, models.UserRole.super_admin
    )),
):
    """
    Hitung margin per item dan total margin untuk sebuah invoice.

    Aturan:
    - Harga Jual = InvoiceDetail.harga_jual (harga yang ditagihkan ke dapur).
    - Harga Beli = SUM(BelanjaPOAlokasi.subtotal) / SUM(qty_alokasi) dari semua nota
      belanja yang terkait po_detail_id yang sama.
      Barang belum terbayar (hutang) tetap dihitung karena sudah diterima.
    """
    invoice = (
        db.query(models.Invoice)
        .options(joinedload(models.Invoice.details))
        .options(joinedload(models.Invoice.dapur))
        .filter(models.Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice tidak ditemukan")

    # Kumpulkan po_detail_id dari invoice ini
    pod_ids = [d.po_detail_id for d in invoice.details if d.po_detail_id]

    # Ambil total beli aktual per po_detail_id dari BelanjaPOAlokasi
    from sqlalchemy import func as sqlfunc
    beli_rows = db.query(
        models.BelanjaPOAlokasi.po_detail_id,
        sqlfunc.sum(models.BelanjaPOAlokasi.subtotal).label("total_beli"),
        sqlfunc.sum(models.BelanjaPOAlokasi.qty_alokasi).label("total_qty"),
    ).filter(
        models.BelanjaPOAlokasi.po_detail_id.in_(pod_ids)
    ).group_by(models.BelanjaPOAlokasi.po_detail_id).all()

    beli_by_pod = {
        r.po_detail_id: {
            "total_beli": Decimal(str(r.total_beli or 0)),
            "total_qty": Decimal(str(r.total_qty or 0)),
        }
        for r in beli_rows
    }

    total_beli = Decimal(0)
    total_jual = Decimal(0)
    items = []

    for d in invoice.details:
        harga_jual = Decimal(str(d.harga_jual or 0))
        qty = Decimal(str(d.qty or 0))
        subtotal_jual = qty * harga_jual

        # Harga beli aktual dari BelanjaPOAlokasi
        pod_beli = beli_by_pod.get(d.po_detail_id, {})
        subtotal_beli_aktual = pod_beli.get("total_beli", Decimal(0))
        qty_alokasi = pod_beli.get("total_qty", Decimal(0))
        # Harga beli per satuan (rata-rata dari semua nota)
        harga_beli_aktual = (subtotal_beli_aktual / qty_alokasi).quantize(Decimal("0.01")) if qty_alokasi > 0 else Decimal(str(d.harga_beli or 0))

        # Subtotal beli dihitung berdasarkan qty invoice × harga beli rata-rata
        subtotal_beli = qty * harga_beli_aktual

        margin_nominal = subtotal_jual - subtotal_beli
        margin_pct = (
            round(float(margin_nominal) / float(subtotal_beli) * 100, 2)
            if subtotal_beli > 0 else 0
        )
        total_beli += subtotal_beli
        total_jual += subtotal_jual
        items.append({
            "nama_item": d.nama_item,
            "qty": float(d.qty),
            "qty_po": float(d.qty_po) if d.qty_po is not None else None,
            "qty_realisasi": float(d.qty_realisasi) if d.qty_realisasi is not None else None,
            "satuan": d.satuan,
            "harga_beli": float(harga_beli_aktual),
            "harga_jual": float(harga_jual),
            "subtotal_beli": float(subtotal_beli),
            "subtotal_jual": float(subtotal_jual),
            "margin_nominal": float(margin_nominal),
            "margin_persen": margin_pct,
        })

    total_margin = total_jual - total_beli
    margin_pct_total = (
        round(float(total_margin) / float(total_beli) * 100, 2)
        if total_beli > 0 else 0
    )

    return {
        "invoice_id": invoice_id,
        "nomor_invoice": invoice.nomor_invoice,
        "dapur": invoice.dapur.nama if invoice.dapur else "-",
        "tanggal_invoice": str(invoice.tanggal_invoice),
        "items": items,
        "total_harga_beli": float(total_beli),
        "total_harga_jual": float(total_jual),
        "total_margin_nominal": float(total_margin),
        "margin_persen_total": margin_pct_total,
    }

@router.delete('/details/{detail_id}')
def delete_invoice_detail(
    detail_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    detail = db.query(models.InvoiceDetail).filter(models.InvoiceDetail.id == detail_id).first()
    if not detail:
        raise HTTPException(status_code=404, detail="Item invoice tidak ditemukan")
    invoice = db.query(models.Invoice).filter(models.Invoice.id == detail.invoice_id).first()
    if invoice.status == models.InvoiceStatus.paid:
        raise HTTPException(status_code=400, detail="Item pada invoice yang sudah lunas tidak dapat dihapus")

    db.delete(detail)
    db.commit()

    # Hitung ulang total invoice
    new_total = db.query(func.coalesce(func.sum(models.InvoiceDetail.subtotal), 0)).filter(models.InvoiceDetail.invoice_id == invoice.id).scalar()
    invoice.subtotal = new_total
    invoice.total = new_total
    db.commit()
    return {"message": "Item berhasil dihapus", "new_total": float(new_total)}
