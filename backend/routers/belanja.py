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
    max_id = db.query(func.max(models.TransaksiBelanja.id)).scalar() or 0
    return f"BLJ/{today.year}/{today.month:02d}/{(max_id + 1):04d}"


def _nomor_hutang(db: Session) -> str:
    today = date.today()
    max_id = db.query(func.max(models.HutangSupplier.id)).scalar() or 0
    return f"HT/{today.year}/{today.month:02d}/{(max_id + 1):04d}"


def _qty_terbeli(db: Session, po_detail_id: int) -> Decimal:
    """Hitung total qty yang sudah dialokasikan ke po_detail ini dari semua belanja."""
    result = db.query(func.coalesce(func.sum(models.BelanjaPOAlokasi.qty_alokasi), 0)).filter(
        models.BelanjaPOAlokasi.po_detail_id == po_detail_id
    ).scalar()
    return Decimal(str(result))


def _cari_po_untuk_item(db: Session, item_id: int, tanggal: date = None, dapur_id: int = None) -> list:
    """
    Cari semua PO approved/delivered/draft yang memiliki item ini,
    beserta sisa qty yang belum terbeli.
    Urutkan mengutamakan PO dengan tanggal_po yang belum terlewat (>= tanggal belanja/hari ini).
    """
    ref_date = tanggal or date.today()
    query = (
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
    )
    
    if dapur_id:
        query = query.filter(models.PurchaseOrder.dapur_id == dapur_id)
        
    po_details = query.all()
    
    po_detail_ids = [pd.id for pd in po_details]
    terbeli_map = {}
    if po_detail_ids:
        terbeli_agg = db.query(
            models.BelanjaPOAlokasi.po_detail_id,
            func.coalesce(func.sum(models.BelanjaPOAlokasi.qty_alokasi), 0)
        ).filter(
            models.BelanjaPOAlokasi.po_detail_id.in_(po_detail_ids)
        ).group_by(
            models.BelanjaPOAlokasi.po_detail_id
        ).all()
        for pid, total_alok in terbeli_agg:
            terbeli_map[pid] = Decimal(str(total_alok))

    results = []
    for pd in po_details:
        qty_terbeli = terbeli_map.get(pd.id, Decimal(0))
        qty_sisa = Decimal(str(pd.qty)) - qty_terbeli
        if qty_sisa <= 0:
            continue

        po_date = pd.po.tanggal_po
        is_belum_terlewat = (po_date >= ref_date) if po_date else False

        results.append({
            "po_detail_id": pd.id,
            "po_id": pd.po_id,
            "nomor_po": pd.po.nomor_po,
            "tanggal_po": str(pd.po.tanggal_po),
            "is_belum_terlewat": is_belum_terlewat,
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

    # Utamakan yang belum terlewat (is_belum_terlewat = True), lalu urutkan berdasarkan tanggal_po asc
    results.sort(key=lambda x: (not x["is_belum_terlewat"], x["tanggal_po"]))
    return results


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/summary-harian")
def belanja_summary_harian(
    dari: Optional[date] = None,
    sampai: Optional[date] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_admin),
):
    """
    Aggregasi total belanja per hari — untuk tampilan SPPG harian.
    Meskipun status belum_lunas, tetap dihitung karena barang sudah dikirim.
    """
    from datetime import date as date_type
    q = db.query(models.TransaksiBelanja)
    if dari:
        q = q.filter(models.TransaksiBelanja.tanggal_belanja >= dari)
    if sampai:
        q = q.filter(models.TransaksiBelanja.tanggal_belanja <= sampai)
    transaksi_list = q.order_by(models.TransaksiBelanja.tanggal_belanja.desc()).all()

    # Group by tanggal
    per_hari = {}
    for t in transaksi_list:
        tgl = str(t.tanggal_belanja)
        if tgl not in per_hari:
            per_hari[tgl] = {"tanggal": t.tanggal_belanja, "total": Decimal(0), "jumlah_transaksi": 0, "supplier_list": []}
        per_hari[tgl]["total"] += Decimal(str(t.total or 0))
        per_hari[tgl]["jumlah_transaksi"] += 1
        supplier_name = t.supplier.nama if t.supplier else (t.supplier_nama or "—")
        if supplier_name and supplier_name not in per_hari[tgl]["supplier_list"]:
            per_hari[tgl]["supplier_list"].append(supplier_name)

    result = sorted(per_hari.values(), key=lambda x: x["tanggal"], reverse=True)
    return [
        {
            "tanggal": str(r["tanggal"]),
            "total": float(r["total"]),
            "jumlah_transaksi": r["jumlah_transaksi"],
            "supplier_list": r["supplier_list"],
        }
        for r in result
    ]


@router.get("/match-po/{item_id}")
def match_po_untuk_item(
    item_id: int,
    tanggal: Optional[date] = None,
    dapur_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_admin),
):
    """
    Cari PO yang memiliki item ini beserta qty sisa yang belum terbeli.
    Dipakai frontend untuk menampilkan alokasi PO saat input belanja.
    """
    return _cari_po_untuk_item(db, item_id, tanggal, dapur_id)


@router.get("/match-po-by-name")
def match_po_by_name(
    nama: str,
    tanggal: Optional[date] = None,
    dapur_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_admin),
):
    """Cari PO berdasarkan nama item (case-insensitive partial match)."""
    items = db.query(models.MasterItem).filter(
        func.lower(models.MasterItem.nama_item).contains(nama.lower())
    ).limit(10).all()

    results = []
    for item in items:
        matches = _cari_po_untuk_item(db, item.id, tanggal, dapur_id)
        results.extend(matches)
    return results


@router.get("/", response_model=list)
def list_belanja(
    tanggal_mulai: Optional[date] = None,
    tanggal_selesai: Optional[date] = None,
    supplier_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_admin),
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
    _: models.User = Depends(auth.require_admin),
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
    current_user: models.User = Depends(auth.require_admin),
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

    is_lunas = payload.get("is_lunas", True)
    
    supplier_id = payload.get("supplier_id")
    supplier_nama = payload.get("supplier_nama")
    
    # Auto-create supplier if manual supplier name is provided
    if not supplier_id and supplier_nama:
        import time
        new_sup = models.Supplier(
            kode=f"SUP-{int(time.time())}",
            nama=supplier_nama,
            is_active=True,
            nama_bank=payload.get("nama_bank_manual"),
            rekening=payload.get("rekening_manual"),
        )
        db.add(new_sup)
        db.flush()
        supplier_id = new_sup.id

    transaksi = models.TransaksiBelanja(
        nomor_transaksi=nomor,
        tanggal_belanja=tanggal,
        supplier_id=supplier_id,
        supplier_nama=supplier_nama,
        catatan=payload.get("catatan"),
        created_by=current_user.id,
        status=models.BelanjaStatus.lunas if is_lunas else models.BelanjaStatus.draft,
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

    # Jika transaksi BELUM LUNAS (is_lunas = False) & ada supplier, buat hutang otomatis
    if not is_lunas and supplier_id:
        from datetime import timedelta
        nomor_ht = _nomor_hutang(db)
        tempo = tanggal + timedelta(days=3)
        hutang = models.HutangSupplier(
            nomor_hutang=nomor_ht,
            supplier_id=supplier_id,
            tanggal=tanggal,
            jatuh_tempo=tempo,
            jumlah=total,
            sisa=total,
            deskripsi=f"Hutang otomatis dari belanja #{nomor}",
            created_by=current_user.id,
        )
        db.add(hutang)
        db.flush()
        transaksi.hutang_id = hutang.id

    db.commit()
    db.refresh(transaksi)
    return {"id": transaksi.id, "nomor_transaksi": transaksi.nomor_transaksi, "total": float(total)}


@router.put("/{transaksi_id}")
def update_belanja(
    transaksi_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_admin),
):
    t = db.query(models.TransaksiBelanja).filter(models.TransaksiBelanja.id == transaksi_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    
    is_lunas = payload.get("is_lunas", t.status == models.BelanjaStatus.lunas)
    
    tanggal = date.fromisoformat(payload["tanggal_belanja"])
    supplier_id = payload.get("supplier_id")
    supplier_nama = payload.get("supplier_nama")
    
    if not supplier_id and supplier_nama:
        import time
        new_sup = models.Supplier(
            kode=f"SUP-{int(time.time())}",
            nama=supplier_nama,
            is_active=True,
        )
        db.add(new_sup)
        db.flush()
        supplier_id = new_sup.id

    t.tanggal_belanja = tanggal
    t.supplier_id = supplier_id
    t.supplier_nama = supplier_nama
    t.catatan = payload.get("catatan", t.catatan)
    t.status = models.BelanjaStatus.lunas if is_lunas else models.BelanjaStatus.draft
    
    # Hapus alokasi & detail lama
    for detail in t.details:
        db.query(models.BelanjaPOAlokasi).filter(models.BelanjaPOAlokasi.detail_id == detail.id).delete()
    db.query(models.TransaksiBelanjDetail).filter(models.TransaksiBelanjDetail.transaksi_id == t.id).delete()
    
    db.flush()

    total = Decimal(0)
    for d in payload.get("details", []):
        qty_beli = Decimal(str(d["qty_beli"]))
        harga = Decimal(str(d["harga_satuan"]))
        subtotal = qty_beli * harga
        total += subtotal

        detail = models.TransaksiBelanjDetail(
            transaksi_id=t.id,
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

    t.total = total

    # Logika Hutang
    if t.hutang_id:
        hutang = db.query(models.HutangSupplier).filter(models.HutangSupplier.id == t.hutang_id).first()
        if hutang:
            sudah_dibayar = hutang.jumlah - hutang.sisa
            
            if total < sudah_dibayar:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Gagal mengedit. Total belanja baru ({total}) lebih kecil dari cicilan hutang yang sudah dibayarkan ({sudah_dibayar})."
                )
            
            hutang.jumlah = total
            hutang.sisa = total - sudah_dibayar
            hutang.supplier_id = supplier_id
            db.add(hutang)
    else:
        # Jika sebelumnya lunas, tapi edit jadi hutang
        if not is_lunas and supplier_id:
            from datetime import timedelta
            nomor_ht = _nomor_hutang(db)
            tempo = tanggal + timedelta(days=3)
            hutang = models.HutangSupplier(
                nomor_hutang=nomor_ht,
                supplier_id=supplier_id,
                tanggal=tanggal,
                jatuh_tempo=tempo,
                jumlah=total,
                sisa=total,
                deskripsi=f"Hutang otomatis dari belanja #{t.nomor_transaksi} (hasil edit)",
                created_by=current_user.id,
            )
            db.add(hutang)
            db.flush()
            t.hutang_id = hutang.id

    db.commit()
    db.refresh(t)
    return {"id": t.id, "nomor_transaksi": t.nomor_transaksi, "total": float(total)}


@router.delete("/{transaksi_id}")
def delete_belanja(
    transaksi_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_admin),
):
    t = db.query(models.TransaksiBelanja).filter(models.TransaksiBelanja.id == transaksi_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    
    # Hapus transaksi terlepas dari statusnya (lunas maupun belum)
    db.delete(t)
    db.commit()
    return {"message": "Transaksi dihapus"}


@router.post("/{transaksi_id}/bayar")
def bayar_belanja(
    transaksi_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_admin),
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
