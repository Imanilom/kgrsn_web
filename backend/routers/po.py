"""Purchase Order router - CRUD + approve."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional
from datetime import date, datetime
from decimal import Decimal
import os
import uuid
import models, schemas, auth
from database import get_db
from services.price_service import hitung_harga_jual
from routers.jadwal_pm import _limit_mingguan, _terpakai_mingguan, _terpakai_harian, _hitung_pagu_total_harian
from routers.config import get_margin_persen


def _get_or_create_manual_item(
    db: Session,
    nama_item: str,
    satuan: str,
    harga_satuan,
    tanggal_po: date,
    user_id: int,
) -> int:
    """Cari atau buat MasterItem + MasterHarga untuk item manual.
    Mengembalikan item_id.
    """
    nama_clean = nama_item.strip()
    # 1. Cek apakah sudah ada master item dengan nama yang sama (case-insensitive)
    existing = db.query(models.MasterItem).filter(
        func.lower(models.MasterItem.nama_item) == nama_clean.lower()
    ).first()
    if existing:
        return existing.id

    # 2. Buat baru dengan kode unik
    short_id = uuid.uuid4().hex[:8].upper()
    kode_baru = f"MANUAL-{short_id}"
    new_item = models.MasterItem(
        kode_item=kode_baru,
        nama_item=nama_clean,
        satuan=satuan or "pcs",
        kategori="lainnya",
        is_active=True
    )
    db.add(new_item)
    db.flush()
    item_id = new_item.id

    # 3. Buat harga dengan margin dari konfigurasi
    margin = get_margin_persen(db)
    harga_jual = hitung_harga_jual(harga_satuan, margin=margin)
    new_harga = models.MasterHarga(
        item_id=item_id,
        harga_beli=harga_satuan,
        harga_jual=harga_jual,
        margin_persen=(margin * 100).quantize(Decimal("0.01")),
        berlaku_dari=tanggal_po,
        updated_by=user_id
    )
    db.add(new_harga)
    db.flush()
    return item_id


def _sync_po_details_from_master_harga(db: Session, po: models.PurchaseOrder):
    """Update PODetail.harga_jual sesuai data MasterHarga aktif untuk item_id terkait."""
    if not po or not po.details:
        return
    updated = False
    for d in po.details:
        item_id = d.item_id
        if not item_id and d.nama_item_raw:
            nama_clean = d.nama_item_raw.strip()
            existing_item = db.query(models.MasterItem).filter(
                func.lower(models.MasterItem.nama_item) == nama_clean.lower()
            ).first()
            if existing_item:
                item_id = existing_item.id
                d.item_id = item_id
                updated = True

        if item_id:
            h_rec = db.query(models.MasterHarga).filter(
                models.MasterHarga.item_id == item_id,
                models.MasterHarga.berlaku_sampai.is_(None)
            ).first()
            if h_rec and h_rec.harga_jual and h_rec.harga_jual > 0:
                if d.harga_jual != h_rec.harga_jual:
                    d.harga_jual = h_rec.harga_jual
                    updated = True
            elif not d.harga_jual or d.harga_jual <= 0:
                d.harga_jual = d.harga_satuan
                updated = True

    if updated:
        db.commit()


def _sync_master_harga_from_po_details(db: Session, po: models.PurchaseOrder, user_id: int):
    """Update MasterHarga (harga_jual dan harga_beli) sesuai dengan item yang ada di detail PO."""
    for d in po.details:
        item_id = d.item_id
        # Jika item_id belum terisi tapi ada nama_item_raw, coba hubungkan ke MasterItem
        if not item_id and d.nama_item_raw:
            nama_clean = d.nama_item_raw.strip()
            existing_item = db.query(models.MasterItem).filter(
                func.lower(models.MasterItem.nama_item) == nama_clean.lower()
            ).first()
            if existing_item:
                item_id = existing_item.id
                d.item_id = item_id

        if item_id:
            hbeli = Decimal(str(d.harga_satuan or 0))
            hjual = Decimal(str(d.harga_jual or 0)) if (d.harga_jual is not None and float(d.harga_jual) > 0) else hbeli

            if hbeli > 0 or hjual > 0:
                current_harga = db.query(models.MasterHarga).filter(
                    models.MasterHarga.item_id == item_id,
                    models.MasterHarga.berlaku_sampai.is_(None)
                ).first()
                if current_harga:
                    if hjual > 0:
                        current_harga.harga_jual = hjual
                    if hbeli > 0:
                        current_harga.harga_beli = hbeli
                    if user_id:
                        current_harga.updated_by = user_id
                else:
                    new_harga = models.MasterHarga(
                        item_id=item_id,
                        harga_beli=hbeli,
                        harga_jual=hjual if hjual > 0 else hbeli,
                        margin_persen=Decimal("0.0"),
                        berlaku_dari=po.tanggal_po or date.today(),
                        updated_by=user_id
                    )
                    db.add(new_harga)
    db.commit()


router = APIRouter()


def generate_nomor_po(db: Session) -> str:
    today = date.today()
    count = db.query(func.count(models.PurchaseOrder.id)).scalar() + 1
    return f"PO/{today.year}/{today.month:02d}/{count:04d}"


@router.get("/budget-breakdown/{dapur_id}", response_model=schemas.BudgetBreakdownOut)
def get_budget_breakdown(
    dapur_id: int,
    tanggal: date,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Dapatkan breakdown budget (kecil/besar) untuk dapur pada tanggal tertentu dari JadwalPM."""
    if current_user.role == models.UserRole.operator:
        if current_user.dapur_id != dapur_id:
            raise HTTPException(status_code=403, detail="Akses ditolak")

    # Ambil jadwal PM untuk tanggal ini
    jadwals = db.query(models.JadwalPM).filter(
        models.JadwalPM.dapur_id == dapur_id,
        models.JadwalPM.tanggal == tanggal,
    ).all()

    jumlah_pm_kecil = 0
    jumlah_pm_besar = 0
    budget_kecil = Decimal(0)
    budget_besar = Decimal(0)

    for jadwal in jadwals:
        if jadwal.jenis_porsi == models.JenisPorsi.kecil:
            jumlah_pm_kecil = jadwal.jumlah_pm
            budget_kecil = jadwal.pagu_harian
        elif jadwal.jenis_porsi == models.JenisPorsi.besar:
            jumlah_pm_besar = jadwal.jumlah_pm
            budget_besar = jadwal.pagu_harian

    total_budget_pm = budget_kecil + budget_besar

    return schemas.BudgetBreakdownOut(
        dapur_id=dapur_id,
        tanggal=tanggal,
        jumlah_pm_kecil=jumlah_pm_kecil,
        jumlah_pm_besar=jumlah_pm_besar,
        budget_kecil=budget_kecil,
        budget_besar=budget_besar,
        total_budget_pm=total_budget_pm,
    )


@router.get("/verify-jadwal/{dapur_id}/{tanggal_po}")
def verify_jadwal(
    dapur_id: int,
    tanggal_po: str,  # Format: YYYY-MM-DD
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Verify jadwal PM ada untuk dapur & tanggal sebelum membuat PO."""
    from datetime import datetime
    
    if current_user.role == models.UserRole.operator:
        if current_user.dapur_id != dapur_id:
            raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Parse tanggal
    try:
        tanggal = datetime.strptime(tanggal_po, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Format tanggal tidak valid: {tanggal_po}")
    
    # Check jadwal
    jadwals = db.query(models.JadwalPM).filter(
        models.JadwalPM.dapur_id == dapur_id,
        models.JadwalPM.tanggal == tanggal,
    ).all()
    
    if not jadwals:
        all_dates = db.query(models.JadwalPM.tanggal).filter(
            models.JadwalPM.dapur_id == dapur_id
        ).distinct().order_by(models.JadwalPM.tanggal).limit(10).all()
        available_dates = ", ".join([str(d[0]) for d in all_dates]) if all_dates else "Tidak ada"
        
        return {
            "exists": False,
            "dapur_id": dapur_id,
            "tanggal": tanggal,
            "available_dates": available_dates,
            "message": f"Jadwal PM belum diisi untuk tanggal {tanggal}"
        }
    
    # Calculate pagu
    total_pagu = _hitung_pagu_total_harian(db, dapur_id, tanggal)
    terpakai = _terpakai_harian(db, dapur_id, tanggal)
    sisa = total_pagu - terpakai
    
    return {
        "exists": True,
        "dapur_id": dapur_id,
        "tanggal": tanggal,
        "jadwals": [
            {
                "jenis_porsi": j.jenis_porsi.value,
                "jumlah_pm": j.jumlah_pm,
                "pagu_harian": str(j.pagu_harian),
            }
            for j in jadwals
        ],
        "total_pagu": str(total_pagu),
        "terpakai": str(terpakai),
        "sisa": str(sisa),
        "message": f"Jadwal PM tersedia untuk {tanggal}"
    }


@router.get("/", response_model=list[schemas.POOut])
def list_po(
    dapur_id: Optional[int] = None,
    status: Optional[models.POStatus] = None,
    tanggal_po: Optional[date] = None,
    jenis_po: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if current_user.role in (models.UserRole.operator, models.UserRole.akuntan):
        if not current_user.dapur_id:
            return []
        dapur_id = current_user.dapur_id
    q = (
        db.query(models.PurchaseOrder)
        .options(joinedload(models.PurchaseOrder.dapur))
        .options(joinedload(models.PurchaseOrder.details).joinedload(models.PODetail.item))
    )
    if dapur_id:
        q = q.filter(models.PurchaseOrder.dapur_id == dapur_id)
    if status:
        q = q.filter(models.PurchaseOrder.status == status)
    if tanggal_po:
        q = q.filter(models.PurchaseOrder.tanggal_po == tanggal_po)
    if jenis_po:
        q = q.filter(models.PurchaseOrder.jenis_po == models.JenisPO(jenis_po))
    pos = q.order_by(models.PurchaseOrder.created_at.desc()).all()
    for po in pos:
        _sync_po_details_from_master_harga(db, po)
    return pos


@router.get("/{po_id}", response_model=schemas.POOut)
def get_po(
    po_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    po = (
        db.query(models.PurchaseOrder)
        .options(joinedload(models.PurchaseOrder.dapur))
        .options(joinedload(models.PurchaseOrder.details).joinedload(models.PODetail.item))
        .filter(models.PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="PO tidak ditemukan")
    if current_user.role == models.UserRole.operator and po.dapur_id != current_user.dapur_id:
        raise HTTPException(status_code=403, detail="Akses ditolak")

    # Otomatis update PO Detail dari MasterHarga
    _sync_po_details_from_master_harga(db, po)
    db.refresh(po)

    return po


@router.post("/{po_id}/sync-harga", response_model=schemas.POOut)
def sync_po_harga(
    po_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Secara manual memicu sinkronisasi harga jual PO dari Master Harga."""
    po = (
        db.query(models.PurchaseOrder)
        .options(joinedload(models.PurchaseOrder.dapur))
        .options(joinedload(models.PurchaseOrder.details).joinedload(models.PODetail.item))
        .filter(models.PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="PO tidak ditemukan")
    if current_user.role == models.UserRole.operator and po.dapur_id != current_user.dapur_id:
        raise HTTPException(status_code=403, detail="Akses ditolak")

    _sync_po_details_from_master_harga(db, po)
    db.refresh(po)
    return po


@router.post("/sync-all-harga")
def sync_all_po_harga(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(models.UserRole.admin, models.UserRole.super_admin)),
):
    """Sinkronisasi seluruh harga_jual item di semua PO dari Master Harga."""
    pos = db.query(models.PurchaseOrder).options(joinedload(models.PurchaseOrder.details)).all()
    count = 0
    for po in pos:
        _sync_po_details_from_master_harga(db, po)
        count += 1
    return {"message": f"Berhasil menyinkronkan {count} PO dengan Master Harga"}


@router.get("/{po_id}/belanja-status")
def get_po_belanja_status(
    po_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    """
    Untuk setiap PODetail di PO ini, hitung qty yang sudah dibeli (dari belanja aktual).
    Berguna untuk menampilkan progress pembelian di halaman PO.
    """
    from sqlalchemy import func as sqlfunc
    details = db.query(models.PODetail).filter(models.PODetail.po_id == po_id).all()
    result = []
    for d in details:
        qty_terbeli = db.query(
            sqlfunc.coalesce(sqlfunc.sum(models.BelanjaPOAlokasi.qty_alokasi), 0)
        ).filter(models.BelanjaPOAlokasi.po_detail_id == d.id).scalar()
        qty_sisa = float(d.qty) - float(qty_terbeli)
        result.append({
            "po_detail_id": d.id,
            "nama_item": d.nama_item_raw,
            "satuan": d.satuan,
            "qty_po": float(d.qty),
            "qty_terbeli": float(qty_terbeli),
            "qty_sisa": qty_sisa,
            "persen_terbeli": round(float(qty_terbeli) / float(d.qty) * 100, 1) if float(d.qty) > 0 else 0,
        })
    return result


@router.post("/", response_model=schemas.POOut)
def create_po(
    payload: schemas.POCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if db.query(models.PurchaseOrder).filter(models.PurchaseOrder.nomor_po == payload.nomor_po).first():
        raise HTTPException(status_code=400, detail="Nomor PO sudah ada")

    if current_user.role == models.UserRole.operator:
        if not current_user.dapur_id:
            raise HTTPException(status_code=403, detail="Akun operator belum terikat ke dapur")
        payload.dapur_id = current_user.dapur_id

    # ──── VALIDASI: Verify dapur exists ────
    dapur = db.query(models.Dapur).filter(models.Dapur.id == payload.dapur_id).first()
    if not dapur:
        raise HTTPException(status_code=404, detail="Dapur tidak ditemukan")

    is_ops = (payload.jenis_po == "ops")

    if not is_ops:
        # ──── VALIDASI: Check JadwalPM ada untuk tanggal ini ────
        jadwals = db.query(models.JadwalPM).filter(
            models.JadwalPM.dapur_id == payload.dapur_id,
            models.JadwalPM.tanggal == payload.tanggal_po,
        ).all()

        if not jadwals:
            # Provide debug info
            all_dates = db.query(models.JadwalPM.tanggal).filter(
                models.JadwalPM.dapur_id == payload.dapur_id
            ).distinct().limit(5).all()
            available_dates = ", ".join([str(d[0]) for d in all_dates]) if all_dates else "Tidak ada"
            
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Jadwal PM belum diisi untuk tanggal {payload.tanggal_po}. "
                    f"Jadwal tersedia: {available_dates}. "
                    f"Hubungi admin untuk mengisi jumlah penerima manfaat."
                )
            )

        # ──── VALIDASI: Check pagu harian ────
        total_pagu_harian = _hitung_pagu_total_harian(db, payload.dapur_id, payload.tanggal_po)
        terpakai_existing = _terpakai_harian(db, payload.dapur_id, payload.tanggal_po)
        
    # Hitung total nilai PO yang akan dibuat
    total_po_value = Decimal(0)
    for d in payload.details:
        subtotal = Decimal(str(d.qty)) * Decimal(str(d.harga_satuan))
        total_po_value += subtotal

    if not is_ops:
        # ──── VALIDASI: Check limit mingguan (pagu harian boleh overbudget) ────
        limit_mingguan = _limit_mingguan(db, payload.dapur_id, payload.tanggal_po)
        terpakai_mingguan = _terpakai_mingguan(db, payload.dapur_id, payload.tanggal_po)
        
        total_terpakai_after = terpakai_mingguan + total_po_value
        if total_terpakai_after > limit_mingguan and limit_mingguan > 0:
            remaining = max(limit_mingguan - terpakai_mingguan, Decimal(0))
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Batas limit mingguan tidak cukup. "
                    f"Limit mingguan: Rp {limit_mingguan:,.0f}, "
                    f"Sudah terpakai: Rp {terpakai_mingguan:,.0f}, "
                    f"Sisa: Rp {remaining:,.0f}, "
                    f"PO ini memerlukan: Rp {total_po_value:,.0f}"
                )
            )

    po = models.PurchaseOrder(
        nomor_po=payload.nomor_po,
        dapur_id=payload.dapur_id,
        tanggal_po=payload.tanggal_po,
        tanggal_kirim=payload.tanggal_kirim,
        catatan=payload.catatan,
        jumlah_pm_kecil=payload.jumlah_pm_kecil,
        jumlah_pm_besar=payload.jumlah_pm_besar,
        budget_kecil=payload.budget_kecil,
        budget_besar=payload.budget_besar,
        jenis_po=models.JenisPO(payload.jenis_po) if payload.jenis_po else models.JenisPO.bahan_baku,
        created_by=current_user.id,
    )
    db.add(po)
    db.flush()

    total = Decimal(0)
    for d in payload.details:
        subtotal = Decimal(str(d.qty)) * Decimal(str(d.harga_satuan))
        
        # Handle manual item
        item_id = d.item_id
        if not item_id:
            item_id = _get_or_create_manual_item(
                db,
                nama_item=d.nama_item_raw or "",
                satuan=d.satuan or "pcs",
                harga_satuan=d.harga_satuan,
                tanggal_po=payload.tanggal_po,
                user_id=current_user.id,
            )

        harga_jual = d.harga_jual
        if not harga_jual or harga_jual <= 0:
            if item_id:
                h_rec = db.query(models.MasterHarga).filter(
                    models.MasterHarga.item_id == item_id,
                    models.MasterHarga.berlaku_sampai.is_(None)
                ).first()
                harga_jual = h_rec.harga_jual if h_rec else d.harga_satuan
            else:
                harga_jual = d.harga_satuan

        detail = models.PODetail(
            po_id=po.id,
            item_id=item_id,
            nama_item_raw=d.nama_item_raw,
            qty=d.qty,
            satuan=d.satuan,
            harga_satuan=d.harga_satuan,
            harga_jual=harga_jual,
            subtotal=subtotal,
            catatan=d.catatan,
        )
        db.add(detail)
        total += subtotal

    po.total_nilai = total

    # ── Pagu adalah soft warning (ditampilkan di frontend, bukan hard-block) ───
    # Tidak ada HTTPException di sini — PO tetap bisa disimpan meski melebihi pagu.

    db.commit()

    db.refresh(po)
    return po


@router.put("/{po_id}", response_model=schemas.POOut)
def update_po(
    po_id: int,
    payload: schemas.POUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="PO tidak ditemukan")
    if current_user.role == models.UserRole.operator and po.dapur_id != current_user.dapur_id:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    if po.status not in (models.POStatus.draft,):
        raise HTTPException(status_code=400, detail="Hanya PO berstatus draft yang bisa diedit")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(po, field, value)
    db.commit()
    db.refresh(po)
    return po


@router.post("/{po_id}/approve", response_model=schemas.POOut)
def approve_po(
    po_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin
    )),
):
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="PO tidak ditemukan")
    if po.status != models.POStatus.draft:
        raise HTTPException(status_code=400, detail="Hanya PO draft yang bisa diapprove")
    po.status = models.POStatus.approved
    po.approved_by = current_user.id
    po.approved_at = func.now()

    _sync_master_harga_from_po_details(db, po, current_user.id)
    db.refresh(po)
    return po


@router.post("/{po_id}/details", response_model=schemas.PODetailOut)
def add_po_detail(
    po_id: int,
    payload: schemas.PODetailCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == po_id).first()
    if not po or po.status != models.POStatus.draft:
        raise HTTPException(status_code=400, detail="PO tidak ditemukan atau sudah dikunci")
    
    item_id = payload.item_id
    if not item_id:
        nama_raw = (payload.nama_item_raw or "").strip() or f"Item-Manual"
        item_id = _get_or_create_manual_item(
            db,
            nama_item=nama_raw,
            satuan=payload.satuan or "pcs",
            harga_satuan=payload.harga_satuan,
            tanggal_po=po.tanggal_po,
            user_id=current_user.id,
        )

    harga_jual = payload.harga_jual
    if not harga_jual:
        if item_id:
            h_rec = db.query(models.MasterHarga).filter(
                models.MasterHarga.item_id == item_id,
                models.MasterHarga.berlaku_sampai.is_(None)
            ).first()
            harga_jual = h_rec.harga_jual if h_rec else payload.harga_satuan
        else:
            harga_jual = payload.harga_satuan

    subtotal = Decimal(str(payload.qty)) * Decimal(str(payload.harga_satuan))
    detail = models.PODetail(
        po_id=po_id,
        item_id=item_id,
        nama_item_raw=payload.nama_item_raw,
        qty=payload.qty,
        satuan=payload.satuan,
        harga_satuan=payload.harga_satuan,
        harga_jual=harga_jual,
        subtotal=subtotal,
        catatan=payload.catatan,
    )
    db.add(detail)
    # Update total PO
    po.total_nilai = (po.total_nilai or 0) + subtotal
    _sync_master_harga_from_po_details(db, po, current_user.id)
    db.commit()
    db.refresh(detail)
    return detail



@router.put("/details/{detail_id}", response_model=schemas.PODetailOut)
def update_po_detail(
    detail_id: int,
    payload: schemas.PODetailUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    detail = db.query(models.PODetail).filter(models.PODetail.id == detail_id).first()
    if not detail:
        raise HTTPException(status_code=404, detail="Detail tidak ditemukan")
    old_subtotal = detail.subtotal or Decimal(0)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(detail, field, value)
    new_qty = Decimal(str(detail.qty))
    new_harga = Decimal(str(detail.harga_satuan))
    detail.subtotal = new_qty * new_harga
    # Update total PO
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == detail.po_id).first()
    if po:
        po.total_nilai = (po.total_nilai or 0) - old_subtotal + detail.subtotal
        _sync_master_harga_from_po_details(db, po, current_user.id)
    db.commit()
    db.refresh(detail)
    return detail


@router.delete("/details/{detail_id}")
def delete_po_detail(
    detail_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    detail = db.query(models.PODetail).filter(models.PODetail.id == detail_id).first()
    if not detail:
        raise HTTPException(status_code=404, detail="Detail tidak ditemukan")
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == detail.po_id).first()
    if po and po.status != models.POStatus.draft:
        raise HTTPException(status_code=400, detail="PO sudah dikunci, tidak bisa hapus item")
    if po:
        po.total_nilai = (po.total_nilai or 0) - (detail.subtotal or 0)
    db.delete(detail)
    db.commit()
    return {"message": "Item dihapus"}


@router.delete("/{po_id}")
def delete_po(
    po_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="PO tidak ditemukan")
    if current_user.role == models.UserRole.operator and po.dapur_id != current_user.dapur_id:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    if po.status not in (models.POStatus.draft, models.POStatus.cancelled):
        raise HTTPException(status_code=400, detail="Hanya PO draft/cancelled yang bisa dihapus")
    po.status = models.POStatus.cancelled
    db.commit()
    return {"message": "PO dibatalkan"}
