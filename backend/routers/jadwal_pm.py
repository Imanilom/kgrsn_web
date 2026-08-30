"""Jadwal PM router - manajemen jadwal penerima manfaat & pagu harian."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_
from typing import Optional, List
from datetime import date, timedelta
from decimal import Decimal
import models, schemas, auth
from database import get_db
from config import settings

router = APIRouter()

TARIF = {
    "kecil": Decimal(str(settings.TARIF_PORSI_KECIL)),
    "besar": Decimal(str(settings.TARIF_PORSI_BESAR)),
}


def _hitung_pagu(jumlah_pm: int, jenis_porsi: str) -> Decimal:
    return Decimal(jumlah_pm) * TARIF.get(jenis_porsi, TARIF["kecil"])


def _minggu_range(tanggal: date):
    """Return (minggu, sabtu) of the week containing tanggal."""
    days_to_subtract = (tanggal.weekday() + 1) % 7
    start_date = tanggal - timedelta(days=days_to_subtract)
    end_date = start_date + timedelta(days=6)
    return start_date, end_date


def _terpakai_harian(db: Session, dapur_id: int, tanggal: date, exclude_po_id: Optional[int] = None) -> Decimal:
    """Sum total HARGA JUAL of non-cancelled PO for a dapur on specific date."""
    query = db.query(
        func.coalesce(
            func.sum(
                models.PODetail.qty * func.coalesce(
                    func.nullif(models.PODetail.harga_jual, 0),
                    models.PODetail.harga_satuan,
                    0
                )
            ),
            0
        )
    ).join(
        models.PurchaseOrder, models.PODetail.po_id == models.PurchaseOrder.id
    ).filter(
        models.PurchaseOrder.dapur_id == dapur_id,
        models.PurchaseOrder.tanggal_po == tanggal,
        models.PurchaseOrder.status != models.POStatus.cancelled,
    )
    if exclude_po_id:
        query = query.filter(models.PurchaseOrder.id != exclude_po_id)
    result = query.scalar()
    return Decimal(str(result))


def _hitung_pagu_total_harian(db: Session, dapur_id: int, tanggal: date) -> Decimal:
    """Sum semua pagu_harian untuk dapur pada tanggal (gabungan kecil+besar)."""
    result = db.query(func.coalesce(func.sum(models.JadwalPM.pagu_harian), 0)).filter(
        models.JadwalPM.dapur_id == dapur_id,
        models.JadwalPM.tanggal == tanggal,
    ).scalar()
    return Decimal(str(result))


def _limit_mingguan(db: Session, dapur_id: int, tanggal: date) -> Decimal:
    """Sum of pagu_harian for all JadwalPM in the same week for the dapur."""
    senin, minggu = _minggu_range(tanggal)
    result = db.query(func.coalesce(func.sum(models.JadwalPM.pagu_harian), 0)).filter(
        models.JadwalPM.dapur_id == dapur_id,
        models.JadwalPM.tanggal >= senin,
        models.JadwalPM.tanggal <= minggu,
    ).scalar()
    return Decimal(str(result))


def _terpakai_mingguan(db: Session, dapur_id: int, tanggal: date, exclude_po_id: Optional[int] = None) -> Decimal:
    """Sum total HARGA JUAL of non-cancelled PO for the whole week."""
    senin, minggu = _minggu_range(tanggal)
    query = db.query(
        func.coalesce(
            func.sum(
                models.PODetail.qty * func.coalesce(
                    func.nullif(models.PODetail.harga_jual, 0),
                    models.PODetail.harga_satuan,
                    0
                )
            ),
            0
        )
    ).join(
        models.PurchaseOrder, models.PODetail.po_id == models.PurchaseOrder.id
    ).filter(
        models.PurchaseOrder.dapur_id == dapur_id,
        models.PurchaseOrder.tanggal_po >= senin,
        models.PurchaseOrder.tanggal_po <= minggu,
        models.PurchaseOrder.status != models.POStatus.cancelled,
    )
    if exclude_po_id:
        query = query.filter(models.PurchaseOrder.id != exclude_po_id)
    result = query.scalar()
    return Decimal(str(result))


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/pagu-check", response_model=schemas.PaguCheckOut)
def pagu_check(
    dapur_id: int,
    tanggal: date,
    exclude_po_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Cek status pagu untuk dapur pada tanggal tertentu (gabungan semua jenis porsi)."""
    if current_user.role in (models.UserRole.operator, models.UserRole.akuntan):
        if current_user.dapur_id != dapur_id:
            raise HTTPException(status_code=403, detail="Akses ditolak")

    # Ambil semua jadwal untuk tanggal ini (bisa ada kecil dan besar sekaligus)
    jadwals = db.query(models.JadwalPM).filter(
        models.JadwalPM.dapur_id == dapur_id,
        models.JadwalPM.tanggal == tanggal,
    ).all()

    senin, minggu = _minggu_range(tanggal)
    lim = _limit_mingguan(db, dapur_id, tanggal)
    terp_week = _terpakai_mingguan(db, dapur_id, tanggal, exclude_po_id=exclude_po_id)

    if not jadwals:
        return schemas.PaguCheckOut(
            tanggal=tanggal,
            jadwal_ada=False,
            minggu_dari=senin,
            minggu_sampai=minggu,
            limit_mingguan=lim,
            terpakai_mingguan=terp_week,
            sisa_limit_mingguan=max(lim - terp_week, Decimal(0)),
            over_mingguan=(terp_week > lim and lim > 0),
        )

    # Breakdown per jenis
    j_kecil = next((j for j in jadwals if j.jenis_porsi == models.JenisPorsi.kecil), None)
    j_besar = next((j for j in jadwals if j.jenis_porsi == models.JenisPorsi.besar), None)

    pagu_kecil = j_kecil.pagu_harian if j_kecil else Decimal(0)
    pagu_besar = j_besar.pagu_harian if j_besar else Decimal(0)
    pagu_total = pagu_kecil + pagu_besar

    jumlah_pm_kecil = j_kecil.jumlah_pm if j_kecil else 0
    jumlah_pm_besar = j_besar.jumlah_pm if j_besar else 0
    jumlah_pm_total = jumlah_pm_kecil + jumlah_pm_besar

    th = _terpakai_harian(db, dapur_id, tanggal, exclude_po_id=exclude_po_id)
    sisa_h = max(pagu_total - th, Decimal(0))
    sisa_w = max(lim - terp_week, Decimal(0))

    # Jenis utama untuk backward compat (yang terbesar nilainya)
    jenis_utama = "besar" if pagu_besar >= pagu_kecil and pagu_besar > 0 else "kecil"

    return schemas.PaguCheckOut(
        tanggal=tanggal,
        jadwal_ada=True,
        jumlah_pm_kecil=jumlah_pm_kecil,
        jumlah_pm_besar=jumlah_pm_besar,
        pagu_kecil=pagu_kecil,
        pagu_besar=pagu_besar,
        jumlah_pm=jumlah_pm_total,
        jenis_porsi=jenis_utama,
        pagu_harian=pagu_total,
        terpakai_harian=th,
        sisa_pagu_harian=sisa_h,
        over_harian=(th > pagu_total),
        minggu_dari=senin,
        minggu_sampai=minggu,
        limit_mingguan=lim,
        terpakai_mingguan=terp_week,
        sisa_limit_mingguan=sisa_w,
        over_mingguan=(terp_week > lim and lim > 0),
    )


@router.get("/weekly-summary", response_model=List[schemas.WeeklySummaryDapurOut])
def weekly_summary(
    tanggal: date,
    dapur_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Ringkasan pagu mingguan per dapur — total PM per jenis, budget, terpakai, sisa."""
    senin, minggu = _minggu_range(tanggal)

    if current_user.role in (models.UserRole.operator, models.UserRole.akuntan):
        dapur_id = current_user.dapur_id

    q = db.query(models.Dapur).filter(models.Dapur.is_active == True)
    if dapur_id:
        q = q.filter(models.Dapur.id == dapur_id)
    dapurs = q.order_by(models.Dapur.nama).all()

    result = []
    for dapur in dapurs:
        days = []
        total_pagu = Decimal(0)
        total_terpakai = Decimal(0)

        current = senin
        while current <= minggu:
            jadwals = db.query(models.JadwalPM).filter(
                models.JadwalPM.dapur_id == dapur.id,
                models.JadwalPM.tanggal == current,
            ).all()

            j_kecil = next((j for j in jadwals if j.jenis_porsi == models.JenisPorsi.kecil), None)
            j_besar = next((j for j in jadwals if j.jenis_porsi == models.JenisPorsi.besar), None)

            pagu_kecil = j_kecil.pagu_harian if j_kecil else Decimal(0)
            pagu_besar = j_besar.pagu_harian if j_besar else Decimal(0)
            pagu_total_hari = pagu_kecil + pagu_besar

            terpakai = _terpakai_harian(db, dapur.id, current)

            days.append(schemas.WeeklySummaryDayOut(
                tanggal=current,
                jumlah_pm_kecil=j_kecil.jumlah_pm if j_kecil else 0,
                jumlah_pm_besar=j_besar.jumlah_pm if j_besar else 0,
                pagu_kecil=pagu_kecil,
                pagu_besar=pagu_besar,
                pagu_total=pagu_total_hari,
                terpakai=terpakai,
                sisa=max(pagu_total_hari - terpakai, Decimal(0)),
                over=(terpakai > pagu_total_hari and pagu_total_hari > 0),
            ))

            total_pagu += pagu_total_hari
            total_terpakai += terpakai
            current += timedelta(days=1)

        # Skip dapur yang belum punya jadwal sama sekali minggu ini (kecuali filter spesifik)
        if total_pagu == 0 and not dapur_id:
            continue

        persen = float((total_terpakai / total_pagu * 100) if total_pagu > 0 else 0)
        result.append(schemas.WeeklySummaryDapurOut(
            dapur_id=dapur.id,
            dapur_nama=dapur.nama,
            dapur_kode=dapur.kode,
            tanggal_mulai=senin,
            tanggal_selesai=minggu,
            total_pagu=total_pagu,
            total_terpakai=total_terpakai,
            total_sisa=max(total_pagu - total_terpakai, Decimal(0)),
            persen_terpakai=round(persen, 1),
            days=days,
        ))

    return result


@router.get("/", response_model=list[schemas.JadwalPMOut])
def list_jadwal(
    dapur_id: Optional[int] = None,
    dari_tanggal: Optional[date] = None,
    sampai_tanggal: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if current_user.role in (models.UserRole.operator, models.UserRole.akuntan):
        dapur_id = current_user.dapur_id

    q = db.query(models.JadwalPM).options(joinedload(models.JadwalPM.dapur))
    if dapur_id:
        q = q.filter(models.JadwalPM.dapur_id == dapur_id)
    if dari_tanggal:
        q = q.filter(models.JadwalPM.tanggal >= dari_tanggal)
    if sampai_tanggal:
        q = q.filter(models.JadwalPM.tanggal <= sampai_tanggal)

    rows = q.order_by(models.JadwalPM.tanggal, models.JadwalPM.jenis_porsi).all()

    result = []
    for r in rows:
        th = _terpakai_harian(db, r.dapur_id, r.tanggal)
        pagu_total = _hitung_pagu_total_harian(db, r.dapur_id, r.tanggal)
        out = schemas.JadwalPMOut.model_validate(r)
        out.terpakai_harian = th
        out.sisa_pagu_harian = max(pagu_total - th, Decimal(0))
        result.append(out)
    return result


@router.get("/debug-by-dapur/{dapur_id}")
def debug_jadwal_by_dapur(
    dapur_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Debug endpoint: list semua jadwal PM untuk dapur (untuk troubleshooting)."""
    if current_user.role in (models.UserRole.operator, models.UserRole.akuntan):
        if current_user.dapur_id != dapur_id:
            raise HTTPException(status_code=403, detail="Akses ditolak")

    # Verify dapur exists
    dapur = db.query(models.Dapur).filter(models.Dapur.id == dapur_id).first()
    if not dapur:
        raise HTTPException(status_code=404, detail="Dapur tidak ditemukan")

    # Get all jadwal for this dapur
    jadwals = db.query(models.JadwalPM).filter(
        models.JadwalPM.dapur_id == dapur_id
    ).order_by(models.JadwalPM.tanggal.desc()).limit(30).all()

    return {
        "dapur_id": dapur_id,
        "dapur_nama": dapur.nama,
        "total_jadwal": len(jadwals),
        "jadwals": [
            {
                "id": j.id,
                "tanggal": str(j.tanggal),
                "jenis_porsi": j.jenis_porsi.value,
                "jumlah_pm": j.jumlah_pm,
                "pagu_harian": str(j.pagu_harian),
            }
            for j in jadwals
        ]
    }


@router.post("/", response_model=schemas.JadwalPMOut)
def create_or_update_jadwal(
    payload: schemas.JadwalPMCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Buat atau update jadwal PM untuk satu tanggal + jenis porsi (upsert)."""
    if current_user.role in (models.UserRole.operator, models.UserRole.akuntan):
        payload.dapur_id = current_user.dapur_id

    pagu = _hitung_pagu(payload.jumlah_pm, payload.jenis_porsi)

    # Upsert key: (dapur_id, tanggal, jenis_porsi)
    existing = db.query(models.JadwalPM).filter(
        models.JadwalPM.dapur_id == payload.dapur_id,
        models.JadwalPM.tanggal == payload.tanggal,
        models.JadwalPM.jenis_porsi == payload.jenis_porsi,
    ).first()

    if existing:
        existing.jumlah_pm = payload.jumlah_pm
        existing.jenis_porsi = payload.jenis_porsi
        existing.pagu_harian = pagu
        existing.catatan = payload.catatan
        db.commit()
        db.refresh(existing)
        jadwal = existing
    else:
        jadwal = models.JadwalPM(
            dapur_id=payload.dapur_id,
            tanggal=payload.tanggal,
            jumlah_pm=payload.jumlah_pm,
            jenis_porsi=payload.jenis_porsi,
            pagu_harian=pagu,
            catatan=payload.catatan,
            created_by=current_user.id,
        )
        db.add(jadwal)
        db.commit()
        db.refresh(jadwal)

    th = _terpakai_harian(db, jadwal.dapur_id, jadwal.tanggal)
    pagu_total = _hitung_pagu_total_harian(db, jadwal.dapur_id, jadwal.tanggal)
    out = schemas.JadwalPMOut.model_validate(jadwal)
    out.terpakai_harian = th
    out.sisa_pagu_harian = max(pagu_total - th, Decimal(0))
    return out


@router.post("/bulk", response_model=list[schemas.JadwalPMOut])
def bulk_create_jadwal(
    payload: schemas.JadwalPMBulkCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Buat jadwal PM untuk range tanggal sekaligus (semua hari)."""
    if current_user.role in (models.UserRole.operator, models.UserRole.akuntan):
        payload.dapur_id = current_user.dapur_id

    if payload.sampai_tanggal < payload.dari_tanggal:
        raise HTTPException(status_code=400, detail="sampai_tanggal harus >= dari_tanggal")
    if (payload.sampai_tanggal - payload.dari_tanggal).days > 60:
        raise HTTPException(status_code=400, detail="Rentang maksimal 60 hari")

    pagu = _hitung_pagu(payload.jumlah_pm, payload.jenis_porsi)
    created = []

    current = payload.dari_tanggal
    while current <= payload.sampai_tanggal:
        # Upsert key: (dapur_id, tanggal, jenis_porsi)
        existing = db.query(models.JadwalPM).filter(
            models.JadwalPM.dapur_id == payload.dapur_id,
            models.JadwalPM.tanggal == current,
            models.JadwalPM.jenis_porsi == payload.jenis_porsi,
        ).first()
        if existing:
            existing.jumlah_pm = payload.jumlah_pm
            existing.jenis_porsi = payload.jenis_porsi
            existing.pagu_harian = pagu
            existing.catatan = payload.catatan
            created.append(existing)
        else:
            j = models.JadwalPM(
                dapur_id=payload.dapur_id,
                tanggal=current,
                jumlah_pm=payload.jumlah_pm,
                jenis_porsi=payload.jenis_porsi,
                pagu_harian=pagu,
                catatan=payload.catatan,
                created_by=current_user.id,
            )
            db.add(j)
            created.append(j)
        current += timedelta(days=1)

    db.commit()
    for j in created:
        db.refresh(j)

    result = []
    for r in created:
        th = _terpakai_harian(db, r.dapur_id, r.tanggal)
        pagu_total = _hitung_pagu_total_harian(db, r.dapur_id, r.tanggal)
        out = schemas.JadwalPMOut.model_validate(r)
        out.terpakai_harian = th
        out.sisa_pagu_harian = max(pagu_total - th, Decimal(0))
        result.append(out)
    return result


@router.put("/{jadwal_id}", response_model=schemas.JadwalPMOut)
def update_jadwal(
    jadwal_id: int,
    payload: schemas.JadwalPMUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    jadwal = db.query(models.JadwalPM).filter(models.JadwalPM.id == jadwal_id).first()
    if not jadwal:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan")
    if current_user.role in (models.UserRole.operator, models.UserRole.akuntan) and jadwal.dapur_id != current_user.dapur_id:
        raise HTTPException(status_code=403, detail="Akses ditolak")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(jadwal, field, value)
    jadwal.pagu_harian = _hitung_pagu(jadwal.jumlah_pm, jadwal.jenis_porsi)
    db.commit()
    db.refresh(jadwal)

    th = _terpakai_harian(db, jadwal.dapur_id, jadwal.tanggal)
    pagu_total = _hitung_pagu_total_harian(db, jadwal.dapur_id, jadwal.tanggal)
    out = schemas.JadwalPMOut.model_validate(jadwal)
    out.terpakai_harian = th
    out.sisa_pagu_harian = max(pagu_total - th, Decimal(0))
    return out


@router.delete("/{jadwal_id}")
def delete_jadwal(
    jadwal_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin
    )),
):
    jadwal = db.query(models.JadwalPM).filter(models.JadwalPM.id == jadwal_id).first()
    if not jadwal:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan")

    # Check if any PO references this date/dapur
    has_po = db.query(models.PurchaseOrder).filter(
        models.PurchaseOrder.dapur_id == jadwal.dapur_id,
        models.PurchaseOrder.tanggal_po == jadwal.tanggal,
        models.PurchaseOrder.status != models.POStatus.cancelled,
    ).first()
    if has_po:
        raise HTTPException(
            status_code=400,
            detail="Tidak bisa hapus jadwal karena sudah ada PO aktif pada tanggal ini"
        )

    db.delete(jadwal)
    db.commit()
    return {"message": "Jadwal berhasil dihapus"}
