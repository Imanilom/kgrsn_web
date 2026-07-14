"""
Transaksi Belanja router.
Mencatat pembelian aktual bahan baku, mencocokkan ke PO yang ada,
dan mengalokasikan qty ke masing-masing PO detail.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_
from typing import Optional, List
from datetime import date
from decimal import Decimal
import models, schemas, auth
from database import get_db

router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _nomor_transaksi(db: Session) -> str:
    today = date.today()
    count = db.query(func.count(models.TransaksiBelanja.id)).scalar() + 1
    return f"BLJ/{today.year}/{today.month:02d}/{count:04d}"


def _nomor_hutang(db: Session) -> str:
    today = date.today()
    count = db.query(func.count(models.HutangSupplier.id)).scalar() + 1
    return f"HT/{today.year}/{today.month:02d}/{count:04d}"


def _qty_terbeli(db: Session, po_detail_id: int) -> Decimal:
    """Hitung total qty yang sudah dialokasikan ke po_detail ini dari semua belanja."""
    result = db.query(func.coalesce(func.sum(models.BelanjaPOAlokasi.qty_alokasi), 0)).filter(
        models.BelanjaPOAlokasi.po_detail_id == po_detail_id
    ).scalar()
    return Decimal(str(result))


def _cari_po_untuk_item(db: Session, item_id: int, tanggal: date = None) -> list:
    """
    Cari semua PO approved/delivered yang memiliki item ini,
    beserta sisa qty yang belum terbeli.
    Urutkan berdasarkan tanggal_po ascending (prioritaskan PO lama).
    """
    po_details = (
        db.query(models.PODetail)
        .join(models.PurchaseOrder)
        .options(
            joinedload(models.PODetail.po).joinedload(models.PurchaseOrder.dapur),
            joinedload(models.PODetail.item),
        )
        .filter(
            models.PODetail.item_id == item_id,
            models.PurchaseOrder.status.in_([
                models.POStatus.approved,
                models.POStatus.delivered,
                models.POStatus.draft,
            ])
        )
        .order_by(models.PurchaseOrder.tanggal_po.asc())
        .all()
    )

    results = []
    for pd in po_details:
        qty_terbeli = _qty_terbeli(db, pd.id)
        qty_sisa = Decimal(str(pd.qty)) - qty_terbeli
        results.append({
            "po_detail_id": pd.id,
            "po_id": pd.po_id,
            "nomor_po": pd.po.nomor_po,
            "tanggal_po": str(pd.po.tanggal_po),
            "dapur": pd.po.dapur.nama if pd.po.dapur else "-",
            "dapur_id": pd.po.dapur_id,
            "item_id": pd.item_id,
            "nama_item": pd.nama_item_raw or (pd.item.nama_item if pd.item else "-"),
            "satuan": pd.satuan,
            "qty_po": float(pd.qty),
            "harga_satuan_po": float(pd.harga_satuan),
            "qty_terbeli": float(qty_terbeli),
            "qty_sisa": float(qty_sisa),
        })
    return [r for r in results if r["qty_sisa"] > 0]  # hanya yang masih ada sisa


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/match-po/{item_id}")
def match_po_untuk_item(
    item_id: int,
    tanggal: Optional[date] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    """
    Cari PO yang memiliki item ini beserta qty sisa yang belum terbeli.
    Dipakai frontend untuk menampilkan alokasi PO saat input belanja.
    """
    return _cari_po_untuk_item(db, item_id, tanggal)


@router.get("/match-po-by-name")
def match_po_by_name(
    nama: str,
    tanggal: Optional[date] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    """Cari PO berdasarkan nama item (case-insensitive partial match)."""
    items = db.query(models.MasterItem).filter(
        func.lower(models.MasterItem.nama_item).contains(nama.lower())
    ).limit(10).all()

    results = []
    for item in items:
        matches = _cari_po_untuk_item(db, item.id, tanggal)
        results.extend(matches)
    return results


@router.get("/", response_model=list)
def list_belanja(
    tanggal_mulai: Optional[date] = None,
    tanggal_selesai: Optional[date] = None,
    supplier_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    q = (
        db.query(models.TransaksiBelanja)
        .options(
            joinedload(models.TransaksiBelanja.supplier),
            joinedload(models.TransaksiBelanja.details)
            .joinedload(models.TransaksiBelanjDetail.alokasi)
            .joinedload(models.BelanjaPOAlokasi.po),
            joinedload(models.TransaksiBelanja.details)
            .joinedload(models.TransaksiBelanjDetail.item),
        )
    )
    if tanggal_mulai:
        q = q.filter(models.TransaksiBelanja.tanggal_belanja >= tanggal_mulai)
    if tanggal_selesai:
        q = q.filter(models.TransaksiBelanja.tanggal_belanja <= tanggal_selesai)
    if supplier_id:
        q = q.filter(models.TransaksiBelanja.supplier_id == supplier_id)
    if status:
        q = q.filter(models.TransaksiBelanja.status == status)
    transaksis = q.order_by(models.TransaksiBelanja.created_at.desc()).all()
    return [_serialize_transaksi(t) for t in transaksis]


@router.get("/{transaksi_id}")
def get_belanja(
    transaksi_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_user),
):
    t = (
        db.query(models.TransaksiBelanja)
        .options(
            joinedload(models.TransaksiBelanja.supplier),
            joinedload(models.TransaksiBelanja.details)
            .joinedload(models.TransaksiBelanjDetail.alokasi)
            .joinedload(models.BelanjaPOAlokasi.po)
            .joinedload(models.PurchaseOrder.dapur),
            joinedload(models.TransaksiBelanja.details)
            .joinedload(models.TransaksiBelanjDetail.alokasi)
            .joinedload(models.BelanjaPOAlokasi.po_detail),
            joinedload(models.TransaksiBelanja.details)
            .joinedload(models.TransaksiBelanjDetail.item),
        )
        .filter(models.TransaksiBelanja.id == transaksi_id)
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    return _serialize_transaksi(t, detail=True)


@router.post("/")
def create_belanja(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Buat transaksi belanja baru.
    payload: {
      tanggal_belanja: str,
      supplier_id: int (optional),
      supplier_nama: str (optional),
      catatan: str (optional),
      details: [
        {
          item_id: int (optional),
          nama_item: str,
          satuan: str,
          qty_beli: float,
          harga_satuan: float,
          alokasi: [
            { po_detail_id: int, po_id: int, qty_alokasi: float }
          ]
        }
      ]
    }
    """
    tanggal = date.fromisoformat(payload["tanggal_belanja"])
    nomor = _nomor_transaksi(db)

    transaksi = models.TransaksiBelanja(
        nomor_transaksi=nomor,
        tanggal_belanja=tanggal,
        supplier_id=payload.get("supplier_id"),
        supplier_nama=payload.get("supplier_nama"),
        catatan=payload.get("catatan"),
        created_by=current_user.id,
        status=models.BelanjaStatus.draft,
    )
    db.add(transaksi)
    db.flush()

    total = Decimal(0)
    for d in payload.get("details", []):
        qty_beli = Decimal(str(d["qty_beli"]))
        harga = Decimal(str(d["harga_satuan"]))
        subtotal = qty_beli * harga
        total += subtotal

        detail = models.TransaksiBelanjDetail(
            transaksi_id=transaksi.id,
            item_id=d.get("item_id"),
            nama_item=d["nama_item"],
            satuan=d.get("satuan"),
            qty_beli=qty_beli,
            harga_satuan=harga,
            subtotal=subtotal,
        )
        db.add(detail)
        db.flush()

        # Simpan alokasi ke PO
        for alok in d.get("alokasi", []):
            qty_alok = Decimal(str(alok["qty_alokasi"]))
            if qty_alok <= 0:
                continue
            alokasi = models.BelanjaPOAlokasi(
                detail_id=detail.id,
                po_id=alok["po_id"],
                po_detail_id=alok["po_detail_id"],
                qty_alokasi=qty_alok,
                harga_satuan=harga,
                subtotal=qty_alok * harga,
            )
            db.add(alokasi)

    transaksi.total = total
    db.commit()
    db.refresh(transaksi)
    return {"id": transaksi.id, "nomor_transaksi": transaksi.nomor_transaksi, "total": float(total)}


@router.delete("/{transaksi_id}")
def delete_belanja(
    transaksi_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    t = db.query(models.TransaksiBelanja).filter(models.TransaksiBelanja.id == transaksi_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    if t.status == models.BelanjaStatus.lunas:
        raise HTTPException(status_code=400, detail="Transaksi yang sudah lunas tidak bisa dihapus")
    db.delete(t)
    db.commit()
    return {"message": "Transaksi dihapus"}


@router.post("/{transaksi_id}/bayar")
def bayar_belanja(
    transaksi_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Tandai transaksi sebagai lunas dan otomatis catat hutang ke supplier jika ada.
    payload: { catatan_bayar: str (optional) }
    """
    t = (
        db.query(models.TransaksiBelanja)
        .options(joinedload(models.TransaksiBelanja.supplier))
        .filter(models.TransaksiBelanja.id == transaksi_id)
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    if t.status == models.BelanjaStatus.lunas:
        raise HTTPException(status_code=400, detail="Sudah lunas")

    t.status = models.BelanjaStatus.lunas
    db.commit()
    return {"message": "Transaksi ditandai lunas", "total": float(t.total)}


@router.post("/konsolidasi-hutang")
def konsolidasi_hutang_supplier(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_roles(
        models.UserRole.admin, models.UserRole.super_admin, models.UserRole.finance
    )),
):
    """
    Konsolidasi beberapa transaksi belanja ke satu supplier menjadi satu hutang.
    payload: { supplier_id: int, transaksi_ids: [int, ...], jatuh_tempo: str (optional) }
    """
    supplier_id = payload.get("supplier_id")
    transaksi_ids = payload.get("transaksi_ids", [])
    if not transaksi_ids:
        raise HTTPException(status_code=400, detail="Pilih minimal satu transaksi")

    transaksis = db.query(models.TransaksiBelanja).filter(
        models.TransaksiBelanja.id.in_(transaksi_ids),
        models.TransaksiBelanja.supplier_id == supplier_id,
        models.TransaksiBelanja.hutang_id == None,
    ).all()

    if not transaksis:
        raise HTTPException(status_code=400, detail="Tidak ada transaksi yang bisa dikonsolidasi")

    total_hutang = sum(t.total for t in transaksis)
    nomor = _nomor_hutang(db)
    jatuh_tempo_str = payload.get("jatuh_tempo")
    jatuh_tempo = date.fromisoformat(jatuh_tempo_str) if jatuh_tempo_str else None

    hutang = models.HutangSupplier(
        nomor_hutang=nomor,
        supplier_id=supplier_id,
        tanggal=date.today(),
        jatuh_tempo=jatuh_tempo,
        jumlah=total_hutang,
        sisa=total_hutang,
        deskripsi=f"Konsolidasi {len(transaksis)} transaksi belanja",
        created_by=current_user.id,
    )
    db.add(hutang)
    db.flush()

    # Link transaksi ke hutang
    for t in transaksis:
        t.hutang_id = hutang.id
        t.status = models.BelanjaStatus.lunas

    db.commit()
    db.refresh(hutang)
    return {
        "message": f"{len(transaksis)} transaksi dikonsolidasi menjadi 1 hutang",
        "nomor_hutang": hutang.nomor_hutang,
        "total": float(total_hutang),
        "hutang_id": hutang.id,
    }


def _serialize_transaksi(t: models.TransaksiBelanja, detail: bool = False) -> dict:
    result = {
        "id": t.id,
        "nomor_transaksi": t.nomor_transaksi,
        "tanggal_belanja": str(t.tanggal_belanja),
        "supplier_id": t.supplier_id,
        "supplier_nama": t.supplier.nama if t.supplier else t.supplier_nama,
        "total": float(t.total or 0),
        "status": t.status.value if t.status else "draft",
        "catatan": t.catatan,
        "hutang_id": t.hutang_id,
        "created_at": str(t.created_at) if t.created_at else None,
        "details": [],
    }
    for d in (t.details or []):
        detail_data = {
            "id": d.id,
            "item_id": d.item_id,
            "nama_item": d.nama_item,
            "satuan": d.satuan,
            "qty_beli": float(d.qty_beli or 0),
            "harga_satuan": float(d.harga_satuan or 0),
            "subtotal": float(d.subtotal or 0),
            "alokasi": [],
        }
        for a in (d.alokasi or []):
            detail_data["alokasi"].append({
                "id": a.id,
                "po_id": a.po_id,
                "nomor_po": a.po.nomor_po if a.po else None,
                "tanggal_po": str(a.po.tanggal_po) if a.po else None,
                "dapur": a.po.dapur.nama if (a.po and a.po.dapur) else None,
                "po_detail_id": a.po_detail_id,
                "qty_alokasi": float(a.qty_alokasi or 0),
                "harga_satuan": float(a.harga_satuan or 0),
                "subtotal": float(a.subtotal or 0),
            })
        result["details"].append(detail_data)
    return result
