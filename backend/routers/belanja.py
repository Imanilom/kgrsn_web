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


def sync_po_and_invoice_from_belanja(
    db: Session,
    po_ids: Optional[List[int]] = None,
    current_user_id: Optional[int] = None,
):
    """
    Sinkronisasi harga beli aktual dan harga jual dari BelanjaPOAlokasi ke:
    1. PODetail (harga_satuan, harga_jual, subtotal)
    2. PurchaseOrder (total_nilai)
    3. MasterHarga (update/insert harga aktif sesuai nota)
    4. Invoice & InvoiceDetail (harga_beli, harga_jual, subtotal, invoice.total)
    5. PORealisasi & PORealisasiDetail (jika ada)
    """
    from routers.config import get_margin_persen
    from services.price_service import hitung_harga_jual

    if po_ids is None:
        po_ids = [r[0] for r in db.query(models.BelanjaPOAlokasi.po_id).distinct().all()]

    default_margin = get_margin_persen(db)
    synced_po_count = 0

    for po_id in set(po_ids):
        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == po_id).first()
        if not po:
            continue

        for d in po.details:
            aloks = db.query(models.BelanjaPOAlokasi).filter(
                models.BelanjaPOAlokasi.po_detail_id == d.id
            ).all()
            if aloks:
                tot_qty = sum(Decimal(str(a.qty_alokasi or 0)) for a in aloks)
                tot_sub = sum(Decimal(str(a.subtotal or 0)) for a in aloks)
                harga_beli = (tot_sub / tot_qty).quantize(Decimal("0.01")) if tot_qty > 0 else Decimal(str(aloks[-1].harga_satuan or 0))

                # Harga beli diperbarui sesuai nota aktual dari belanja
                d.harga_satuan = harga_beli

                # Harga jual ditentukan secara manual per produk, TIDAK dikalkulasi otomatis
                if not d.harga_jual or d.harga_jual <= 0:
                    if d.item_id:
                        h_rec = db.query(models.MasterHarga).filter(
                            models.MasterHarga.item_id == d.item_id,
                            models.MasterHarga.berlaku_sampai.is_(None)
                        ).first()
                        if h_rec and h_rec.harga_jual and h_rec.harga_jual > 0:
                            d.harga_jual = h_rec.harga_jual
                        else:
                            d.harga_jual = harga_beli
                    else:
                        d.harga_jual = harga_beli

                d.subtotal = Decimal(str(d.qty or 0)) * harga_beli

                # Update harga beli di MasterHarga aktif tanpa mengubah harga jual manual
                if d.item_id and harga_beli > 0:
                    current_harga = db.query(models.MasterHarga).filter(
                        models.MasterHarga.item_id == d.item_id,
                        models.MasterHarga.berlaku_sampai.is_(None)
                    ).first()
                    if current_harga:
                        if current_harga.harga_beli != harga_beli:
                            current_harga.harga_beli = harga_beli
                    else:
                        new_h = models.MasterHarga(
                            item_id=d.item_id,
                            harga_beli=harga_beli,
                            harga_jual=d.harga_jual,
                            margin_persen=Decimal("0.0"),
                            berlaku_dari=date.today(),
                            updated_by=current_user_id
                        )
                        db.add(new_h)

        po.total_nilai = sum(Decimal(str(x.qty or 0)) * Decimal(str(x.harga_satuan or 0)) for x in po.details)
        synced_po_count += 1

        # Sinkronkan Invoices yang terhubung ke PO
        invoices = db.query(models.Invoice).filter(
            models.Invoice.po_id == po.id,
            models.Invoice.status != models.InvoiceStatus.cancelled
        ).all()
        for inv in invoices:
            inv_changed = False
            for inv_d in inv.details:
                matching_d = next((x for x in po.details if x.id == inv_d.po_detail_id), None)
                if matching_d:
                    # Jangan timpa harga_jual invoice jika sudah ada nilainya (pertahankan harga invoice)
                    if inv_d.harga_jual and inv_d.harga_jual > 0:
                        if inv_d.harga_beli != matching_d.harga_satuan:
                            inv_d.harga_beli = matching_d.harga_satuan
                            inv_changed = True
                    else:
                        if inv_d.harga_beli != matching_d.harga_satuan or inv_d.harga_jual != matching_d.harga_jual:
                            inv_d.harga_beli = matching_d.harga_satuan
                            inv_d.harga_jual = matching_d.harga_jual
                            inv_d.subtotal = Decimal(str(inv_d.qty or 0)) * matching_d.harga_jual
                            inv_changed = True
            if inv_changed:
                inv.subtotal = sum(Decimal(str(x.subtotal or 0)) for x in inv.details)
                inv.total = inv.subtotal
                from routers.invoice import _generate_and_save_pdf
                try:
                    _generate_and_save_pdf(inv, db)
                except Exception as e:
                    print(f"Error regenerasi PDF invoice {inv.id}: {e}")

        # Sinkronkan PORealisasi
        realisasis = db.query(models.PORealisasi).filter(models.PORealisasi.po_id == po.id).all()
        for rel in realisasis:
            rel_changed = False
            for rel_d in rel.details:
                matching_d = next((x for x in po.details if x.id == rel_d.po_detail_id), None)
                if matching_d:
                    if rel_d.harga_satuan != matching_d.harga_satuan or rel_d.harga_jual != matching_d.harga_jual:
                        rel_d.harga_satuan = matching_d.harga_satuan
                        rel_d.harga_jual = matching_d.harga_jual
                        rel_d.subtotal = Decimal(str(rel_d.qty_realisasi or 0)) * matching_d.harga_satuan
                        rel_d.subtotal_jual = Decimal(str(rel_d.qty_realisasi or 0)) * matching_d.harga_jual
                        rel_changed = True
            if rel_changed:
                rel.total_nilai = sum(Decimal(str(x.subtotal or 0)) for x in rel.details)
                rel.total_nilai_jual = sum(Decimal(str(x.subtotal_jual or 0)) for x in rel.details)
                for rel_inv in rel.invoices:
                    if rel_inv.status != models.InvoiceStatus.cancelled:
                        for inv_d in rel_inv.details:
                            matching_d = next((x for x in po.details if x.id == inv_d.po_detail_id), None)
                            if matching_d:
                                inv_d.harga_beli = matching_d.harga_satuan
                                inv_d.harga_jual = matching_d.harga_jual
                                inv_d.subtotal = Decimal(str(inv_d.qty or 0)) * matching_d.harga_jual
                        rel_inv.subtotal = sum(Decimal(str(x.subtotal or 0)) for x in rel_inv.details)
                        rel_inv.total = rel_inv.subtotal
                        from routers.invoice import _generate_and_save_pdf_realisasi
                        try:
                            _generate_and_save_pdf_realisasi(rel_inv, rel, db)
                        except Exception as e:
                            print(f"Error regenerasi PDF realisasi invoice {rel_inv.id}: {e}")

    db.flush()
    return synced_po_count


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
    dari: Optional[str] = None,
    sampai: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_admin),
):
    """
    Aggregasi total belanja per hari — untuk tampilan SPPG harian.
    Meskipun status belum_lunas, tetap dihitung karena barang sudah dikirim.
    """
    from datetime import datetime
    dari_date = datetime.strptime(dari, "%Y-%m-%d").date() if dari else None
    sampai_date = datetime.strptime(sampai, "%Y-%m-%d").date() if sampai else None

    q = db.query(models.TransaksiBelanja)
    if dari_date:
        q = q.filter(models.TransaksiBelanja.tanggal_belanja >= dari_date)
    if sampai_date:
        q = q.filter(models.TransaksiBelanja.tanggal_belanja <= sampai_date)
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

    affected_po_ids = set()
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
            affected_po_ids.add(alok["po_id"])

    transaksi.total = total

    # Sinkronisasi harga aktual beli ke PO, Invoice, dan MasterHarga
    db.flush()
    if affected_po_ids:
        sync_po_and_invoice_from_belanja(db, list(affected_po_ids), current_user.id)

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
    
    # Kumpulkan po_id lama sebelum alokasi dihapus
    affected_po_ids = set()
    for detail in t.details:
        for alok in detail.alokasi:
            affected_po_ids.add(alok.po_id)
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
            affected_po_ids.add(alok["po_id"])

    t.total = total

    # Sinkronisasi harga aktual beli ke PO, Invoice, dan MasterHarga
    db.flush()
    if affected_po_ids:
        sync_po_and_invoice_from_belanja(db, list(affected_po_ids), current_user.id)

    # Logika Hutang
    if t.hutang_id:
        hutang = db.query(models.HutangSupplier).filter(models.HutangSupplier.id == t.hutang_id).first()
        if hutang:
            if is_lunas:
                # Transaksi diubah menjadi LUNAS
                if hutang.status != models.HutangStatus.lunas:
                    sisa_bayar = Decimal(str(hutang.sisa))
                    if sisa_bayar > 0:
                        pembayaran = models.PembayaranHutang(
                            hutang_id=hutang.id,
                            tanggal_bayar=date.today(),
                            jumlah_bayar=sisa_bayar,
                            metode="transfer",
                            catatan=f"Pelunasan otomatis dari edit transaksi belanja #{t.nomor_transaksi}",
                            created_by=current_user.id,
                        )
                        db.add(pembayaran)
                    hutang.jumlah_terbayar = Decimal(str(hutang.jumlah))
                    hutang.sisa = Decimal(0)
                    hutang.status = models.HutangStatus.lunas
            else:
                sudah_dibayar = Decimal(str(hutang.jumlah_terbayar or 0))
                if total < sudah_dibayar:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Gagal mengedit. Total belanja baru ({total}) lebih kecil dari cicilan hutang yang sudah dibayarkan ({sudah_dibayar})."
                    )
                
                hutang.jumlah = total
                hutang.sisa = total - sudah_dibayar
                hutang.supplier_id = supplier_id
                if hutang.sisa <= 0:
                    hutang.status = models.HutangStatus.lunas
                elif sudah_dibayar > 0:
                    hutang.status = models.HutangStatus.sebagian
                else:
                    hutang.status = models.HutangStatus.belum_lunas
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
    
    if t.hutang_id:
        hutang = db.query(models.HutangSupplier).filter(models.HutangSupplier.id == t.hutang_id).first()
        if hutang:
            if Decimal(str(hutang.jumlah_terbayar or 0)) > 0:
                raise HTTPException(
                    status_code=400,
                    detail="Transaksi belanja tidak dapat dihapus karena hutang terkait sudah memiliki riwayat pembayaran."
                )
            db.delete(hutang)

    affected_po_ids = set()
    for detail in t.details:
        for alok in detail.alokasi:
            affected_po_ids.add(alok.po_id)

    db.delete(t)
    db.flush()

    if affected_po_ids:
        sync_po_and_invoice_from_belanja(db, list(affected_po_ids), current_user.id)

    db.commit()
    return {"message": "Transaksi dihapus"}


@router.post("/{transaksi_id}/bayar")
def bayar_belanja(
    transaksi_id: int,
    payload: Optional[dict] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_admin),
):
    """
    Tandai transaksi sebagai lunas dan otomatis catat pelunasan hutang ke supplier jika ada.
    payload: { catatan_bayar: str (optional), metode: str (optional) }
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

    if t.hutang_id:
        hutang = db.query(models.HutangSupplier).filter(models.HutangSupplier.id == t.hutang_id).first()
        if hutang and hutang.status != models.HutangStatus.lunas:
            sisa_bayar = Decimal(str(hutang.sisa))
            if sisa_bayar > 0:
                catatan = (payload or {}).get("catatan_bayar") or f"Pelunasan dari transaksi belanja #{t.nomor_transaksi}"
                metode = (payload or {}).get("metode") or "transfer"
                pembayaran = models.PembayaranHutang(
                    hutang_id=hutang.id,
                    tanggal_bayar=date.today(),
                    jumlah_bayar=sisa_bayar,
                    metode=metode,
                    catatan=catatan,
                    created_by=current_user.id,
                )
                db.add(pembayaran)

            hutang.jumlah_terbayar = Decimal(str(hutang.jumlah))
            hutang.sisa = Decimal(0)
            hutang.status = models.HutangStatus.lunas

    db.commit()
    return {"message": "Transaksi ditandai lunas", "total": float(t.total)}


def sync_hutang_belanja_lunas(db: Session):
    """
    Menyinkronkan status hutang supplier dengan transaksi belanja.
    Jika transaksi belanja ber-status LUNAS dan terhubung ke record HutangSupplier,
    pastikan HutangSupplier juga ber-status LUNAS dan sisanya 0.
    """
    lunas_belanja = (
        db.query(models.TransaksiBelanja)
        .filter(
            models.TransaksiBelanja.status == models.BelanjaStatus.lunas,
            models.TransaksiBelanja.hutang_id.isnot(None)
        )
        .all()
    )
    synced_count = 0
    for t in lunas_belanja:
        hutang = db.query(models.HutangSupplier).filter(models.HutangSupplier.id == t.hutang_id).first()
        if hutang and hutang.status != models.HutangStatus.lunas:
            sisa_bayar = Decimal(str(hutang.sisa))
            if sisa_bayar > 0:
                pembayaran = models.PembayaranHutang(
                    hutang_id=hutang.id,
                    tanggal_bayar=t.tanggal_belanja or date.today(),
                    jumlah_bayar=sisa_bayar,
                    metode="transfer",
                    catatan=f"Pelunasan otomatis (sinkronisasi transaksi belanja #{t.nomor_transaksi})",
                    created_by=t.created_by,
                )
                db.add(pembayaran)
            hutang.jumlah_terbayar = Decimal(str(hutang.jumlah))
            hutang.sisa = Decimal(0)
            hutang.status = models.HutangStatus.lunas
            synced_count += 1

    if synced_count > 0:
        db.commit()
        print(f"✅ Auto-synced {synced_count} hutang supplier yang sudah lunas dari transaksi belanja")


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
