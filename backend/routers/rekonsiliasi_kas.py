"""Impor dan pencocokan mutasi kas dengan transaksi belanja."""
from datetime import date, timedelta
from decimal import Decimal
from hashlib import sha256
import json
import re
from zipfile import BadZipFile

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from rapidfuzz import fuzz

import auth
import models
from database import get_db
from services.mutasi_kas import parse_mutasi_pdf, parse_mutasi_xlsx

router = APIRouter()
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def _fingerprint(mutasi: dict) -> str:
    stable_values = {
        "tanggal": mutasi["tanggal"].isoformat(),
        "jumlah": str(mutasi["jumlah"]),
        "saldo": str(mutasi["saldo"]) if mutasi["saldo"] is not None else None,
        "deskripsi": " ".join(mutasi["deskripsi"].split()).casefold(),
    }
    if mutasi.get("jenis", "debit") == "kredit":
        stable_values["jenis"] = "kredit"
    encoded = json.dumps(stable_values, sort_keys=True, ensure_ascii=True).encode("utf-8")
    return sha256(encoded).hexdigest()


def _serialize_transaksi(transaksi: models.TransaksiBelanja) -> dict:
    return {
        "id": transaksi.id,
        "nomor_transaksi": transaksi.nomor_transaksi,
        "tanggal_belanja": transaksi.tanggal_belanja.isoformat(),
        "supplier_nama": transaksi.supplier.nama if transaksi.supplier else transaksi.supplier_nama,
        "total": float(transaksi.total or 0),
    }


def _match_tokens(value: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", (value or "").casefold())


def _text_similarity(left: str, right: str) -> int:
    left_text = " ".join(_match_tokens(left))
    right_text = " ".join(_match_tokens(right))
    if not left_text or not right_text:
        return 0
    return round(fuzz.token_set_ratio(left_text, right_text))


def _sunday_saturday_range(value: date) -> tuple[date, date]:
    start = value - timedelta(days=(value.weekday() + 1) % 7)
    return start, start + timedelta(days=6)


def _transaction_in_mutasi_period(mutasi: models.MutasiKas, transaksi: models.TransaksiBelanja) -> bool:
    period_start, period_end = _sunday_saturday_range(mutasi.tanggal)
    po_dates = []
    for detail in getattr(transaksi, "details", []) or []:
        for allocation in getattr(detail, "alokasi", []) or []:
            po = getattr(allocation, "po", None)
            if getattr(po, "tanggal_po", None) is not None:
                po_dates.append(po.tanggal_po)

    if po_dates:
        return all(period_start <= po_date <= period_end for po_date in po_dates)
    return True


def _reference_found(reference: list[str], description_tokens: list[str]) -> bool:
    return bool(reference) and any(
        description_tokens[index:index + len(reference)] == reference
        for index in range(len(description_tokens) - len(reference) + 1)
    )


def _candidate_signals(mutasi: models.MutasiKas, transaksi: models.TransaksiBelanja) -> dict:
    description = " ".join(_match_tokens(mutasi.deskripsi))
    supplier_name = transaksi.supplier.nama if transaksi.supplier else transaksi.supplier_nama or ""
    name_similarity = _text_similarity(supplier_name, description)

    reference = _match_tokens(transaksi.nomor_transaksi or "")
    description_tokens = description.split()

    related_items = {}
    po_references = set()
    po_dates = set()
    item_details = []
    nominal_per_po = {}
    item_similarity = 0
    location_similarity = 0
    for detail in getattr(transaksi, "details", []) or []:
        detail_data = {
            "nama_item": getattr(detail, "nama_item", "") or "",
            "qty": float(getattr(detail, "qty_beli", 0) or 0),
            "satuan": getattr(detail, "satuan", None),
            "harga_satuan": float(getattr(detail, "harga_satuan", 0) or 0),
            "subtotal": float(getattr(detail, "subtotal", 0) or 0),
            "alokasi": [],
        }
        base_item_names = {
            name for name in (
                getattr(detail, "nama_item", None),
                getattr(getattr(detail, "item", None), "nama_item", None),
            )
            if name
        }
        allocations = getattr(detail, "alokasi", []) or []
        if not allocations:
            for item_name in base_item_names:
                related_items[(item_name, None, None)] = {
                    "nama_item": item_name,
                    "nomor_po": None,
                    "dapur": None,
                }

        for allocation in allocations:
            po = getattr(allocation, "po", None)
            po_detail = getattr(allocation, "po_detail", None)
            item_names = base_item_names | {
                name for name in (
                    getattr(po_detail, "nama_item_raw", None),
                    getattr(getattr(po_detail, "item", None), "nama_item", None),
                )
                if name
            }
            location_name = getattr(getattr(po, "dapur", None), "nama", None)
            po_number = getattr(po, "nomor_po", None)
            if po_number:
                po_references.add(po_number)
            po_date = getattr(po, "tanggal_po", None)
            if po_date:
                po_dates.add(po_date)
            allocation_subtotal = Decimal(str(getattr(allocation, "subtotal", 0) or 0))
            allocation_data = {
                "nomor_po": po_number,
                "tanggal_po": po_date.isoformat() if po_date else None,
                "dapur": location_name,
                "qty": float(getattr(allocation, "qty_alokasi", 0) or 0),
                "subtotal": float(allocation_subtotal),
            }
            detail_data["alokasi"].append(allocation_data)
            if po_number:
                po_key = (po_number, po_date.isoformat() if po_date else None, location_name)
                nominal_per_po.setdefault(po_key, Decimal(0))
                nominal_per_po[po_key] += allocation_subtotal
            location_similarity = max(
                location_similarity,
                _text_similarity(location_name or "", description),
            )
            for item_name in item_names:
                key = (item_name, po_number, location_name)
                related_items[key] = {
                    "nama_item": item_name,
                    "nomor_po": po_number,
                    "dapur": location_name,
                }

        for item_name in base_item_names:
            item_similarity = max(
                item_similarity,
                _text_similarity(item_name, description),
            )
        for allocation in allocations:
            po_detail = getattr(allocation, "po_detail", None)
            for item_name in (
                getattr(po_detail, "nama_item_raw", None),
                getattr(getattr(po_detail, "item", None), "nama_item", None),
            ):
                if item_name:
                    item_similarity = max(
                        item_similarity,
                        _text_similarity(item_name, description),
                    )
        item_details.append(detail_data)

    related_items = sorted(
        related_items.values(),
        key=lambda item: (
            -_text_similarity(item["nama_item"], description),
            item["nomor_po"] or "",
        ),
    )[:5]

    return {
        **_serialize_transaksi(transaksi),
        "selisih_nominal": float(
            Decimal(str(transaksi.total or 0)) - Decimal(str(mutasi.jumlah))
        ),
        "kemiripan_nama": name_similarity,
        "nomor_referensi_cocok": _reference_found(reference, description_tokens),
        "nomor_po_cocok": any(
            _reference_found(_match_tokens(po_number), description_tokens)
            for po_number in po_references
        ),
        "kemiripan_item": item_similarity,
        "kemiripan_lokasi_po": location_similarity,
        "item_terkait": related_items,
        "tanggal_po": sorted(po_date.isoformat() for po_date in po_dates),
        "item_detail": item_details,
        "nominal_per_po": [
            {
                "nomor_po": po_number,
                "tanggal_po": po_date,
                "dapur": dapur,
                "subtotal": float(subtotal),
            }
            for (po_number, po_date, dapur), subtotal in sorted(
                nominal_per_po.items(),
                key=lambda pair: (pair[0][1] or "", pair[0][0] or ""),
            )
        ],
    }


def _rank_candidates(
    mutasi: models.MutasiKas,
    transactions: list,
    limit: int = 20,
) -> list[dict]:
    ranked = [
        (_candidate_signals(mutasi, item), item)
        for item in transactions
        if _transaction_in_mutasi_period(mutasi, item)
    ]
    ranked.sort(key=lambda pair: (
        not (pair[0]["nomor_referensi_cocok"] or pair[0]["nomor_po_cocok"]),
        not pair[0]["nomor_referensi_cocok"],
        -pair[0]["kemiripan_nama"],
        -pair[0]["kemiripan_item"],
        -pair[0]["kemiripan_lokasi_po"],
        abs(Decimal(str(pair[1].total or 0)) - Decimal(str(mutasi.jumlah))),
        abs((pair[1].tanggal_belanja - mutasi.tanggal).days),
        pair[1].id,
    ))
    return [candidate for candidate, _ in ranked[:limit]]


def _serialize_mutasi(
    mutasi: models.MutasiKas,
    transaksi_map: dict,
    candidates: list,
    linked_transactions: list | None = None,
) -> dict:
    if linked_transactions is None:
        legacy_transaction = transaksi_map.get(mutasi.transaksi_belanja_id)
        linked_transactions = [legacy_transaction] if legacy_transaction else []
    if mutasi.jenis == "kredit":
        status_pencocokan = "arus_masuk"
    elif linked_transactions or mutasi.transaksi_belanja_id is not None:
        status_pencocokan = "cocok"
    else:
        status_pencocokan = "belum_cocok" if candidates else "tidak_cocok"
    serialized_transactions = [
        _serialize_transaksi(transaksi)
        for transaksi in linked_transactions
        if transaksi is not None
    ]
    return {
        "id": mutasi.id,
        "tanggal": mutasi.tanggal.isoformat(),
        "waktu": mutasi.waktu.isoformat() if mutasi.waktu else None,
        "deskripsi": mutasi.deskripsi,
        "jenis": mutasi.jenis,
        "jumlah": float(mutasi.jumlah),
        "saldo": float(mutasi.saldo) if mutasi.saldo is not None else None,
        "sumber_sheet": mutasi.sumber_sheet,
        "status_pencocokan": status_pencocokan,
        "transaksi_belanja": serialized_transactions[0] if serialized_transactions else None,
        "transaksi_belanja_list": serialized_transactions,
        "kandidat": candidates,
    }


def _supplier_key(transaksi: models.TransaksiBelanja) -> str:
    supplier_name = (
        transaksi.supplier.nama
        if transaksi.supplier else transaksi.supplier_nama
    )
    return " ".join(_match_tokens(supplier_name or ""))


def _auto_match_pairs(unmatched: list, transactions: list) -> list[tuple]:
    transactions_by_key = {}
    for transaksi in transactions:
        supplier_key = _supplier_key(transaksi)
        if not supplier_key:
            continue
        key = (Decimal(str(transaksi.total or 0)), supplier_key)
        transactions_by_key.setdefault(key, []).append(transaksi)

    mutasis_by_key = {}
    for mutasi in unmatched:
        description_tokens = _match_tokens(mutasi.deskripsi)
        matching_keys = [
            key for key in transactions_by_key
            if key[0] == Decimal(str(mutasi.jumlah))
            and _reference_found(key[1].split(), description_tokens)
        ]
        if len(matching_keys) == 1:
            mutasis_by_key.setdefault(matching_keys[0], []).append(mutasi)

    pairs = []
    for key, matching_mutasis in mutasis_by_key.items():
        matching_transactions = transactions_by_key[key]
        if len(matching_mutasis) != len(matching_transactions):
            continue
        matching_mutasis.sort(key=lambda item: (item.tanggal, item.id))
        matching_transactions.sort(
            key=lambda item: (item.tanggal_belanja, item.id)
        )
        valid_pairs = [
            (mutasi, transaksi)
            for mutasi, transaksi in zip(matching_mutasis, matching_transactions)
            if _transaction_in_mutasi_period(mutasi, transaksi)
        ]
        if len(valid_pairs) == len(matching_mutasis):
            pairs.extend(valid_pairs)
    return pairs


def _auto_match_unambiguous(db: Session) -> int:
    matched_mutasi_ids = {
        mutasi_id
        for (mutasi_id,) in db.query(models.MutasiKasTransaksi.mutasi_kas_id).all()
    }
    unmatched_query = db.query(models.MutasiKas).filter(
        models.MutasiKas.jenis == "debit",
        models.MutasiKas.transaksi_belanja_id.is_(None),
    )
    if matched_mutasi_ids:
        unmatched_query = unmatched_query.filter(
            ~models.MutasiKas.id.in_(matched_mutasi_ids)
        )
    unmatched = unmatched_query.order_by(
        models.MutasiKas.tanggal, models.MutasiKas.id
    ).all()
    if not unmatched:
        return 0

    used_ids = {
        transaction_id
        for (transaction_id,) in db.query(models.MutasiKas.transaksi_belanja_id)
        .filter(models.MutasiKas.transaksi_belanja_id.isnot(None))
        .all()
    }
    used_ids.update(
        transaction_id
        for (transaction_id,) in db.query(models.MutasiKasTransaksi.transaksi_belanja_id).all()
    )
    amounts = {Decimal(str(mutasi.jumlah)) for mutasi in unmatched}
    transaction_query = db.query(models.TransaksiBelanja).filter(
        models.TransaksiBelanja.total.in_(amounts)
    ).options(joinedload(models.TransaksiBelanja.supplier))
    if used_ids:
        transaction_query = transaction_query.filter(
            ~models.TransaksiBelanja.id.in_(used_ids)
        )

    pairs = _auto_match_pairs(unmatched, transaction_query.all())
    for mutasi, transaksi in pairs:
        db.add(models.MutasiKasTransaksi(
            mutasi_kas_id=mutasi.id,
            transaksi_belanja_id=transaksi.id,
        ))
    return len(pairs)


@router.post("/import")
async def import_mutasi(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_finance),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Pilih file mutasi berformat .xlsx atau .pdf.")
    extension = file.filename.lower().rsplit(".", 1)[-1]
    if extension not in {"xlsx", "pdf"}:
        raise HTTPException(status_code=400, detail="Pilih file mutasi berformat .xlsx atau .pdf.")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Ukuran file mutasi maksimal 20 MB.")
    if not content:
        raise HTTPException(status_code=400, detail="File mutasi kosong.")

    try:
        mutasis = parse_mutasi_pdf(content) if extension == "pdf" else parse_mutasi_xlsx(content)
    except (ValueError, OSError, BadZipFile, InvalidFileException) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    fingerprints = {_fingerprint(mutasi) for mutasi in mutasis}
    existing = {
        fingerprint
        for (fingerprint,) in db.query(models.MutasiKas.fingerprint)
        .filter(models.MutasiKas.fingerprint.in_(fingerprints))
        .all()
    }
    imported_fingerprints = set()
    imported = 0

    for mutasi in mutasis:
        fingerprint = _fingerprint(mutasi)
        if fingerprint in existing or fingerprint in imported_fingerprints:
            continue
        db.add(models.MutasiKas(**mutasi, fingerprint=fingerprint))
        imported_fingerprints.add(fingerprint)
        imported += 1

    try:
        db.flush()
        cocok_otomatis = _auto_match_unambiguous(db)
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Sebagian mutasi sudah diimpor oleh pengguna lain. Muat ulang halaman lalu coba lagi.",
        ) from error

    return {
        "total_mutasi": len(mutasis),
        "diimpor": imported,
        "duplikat": len(mutasis) - imported,
        "cocok_otomatis": cocok_otomatis,
    }


@router.post("/auto-match")
def cocokkan_otomatis(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_finance),
):
    cocok = _auto_match_unambiguous(db)
    db.commit()
    return {"cocok_otomatis": cocok}


@router.get("/arus-kas")
def ringkasan_arus_kas(
    tanggal_mulai: date | None = None,
    tanggal_selesai: date | None = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_finance),
):
    query = db.query(models.MutasiKas)
    if tanggal_mulai:
        query = query.filter(models.MutasiKas.tanggal >= tanggal_mulai)
    if tanggal_selesai:
        query = query.filter(models.MutasiKas.tanggal <= tanggal_selesai)

    daily = {}
    mutasis = query.order_by(models.MutasiKas.tanggal, models.MutasiKas.id).all()
    matched_mutasi_ids = {
        mutasi_id
        for (mutasi_id,) in db.query(models.MutasiKasTransaksi.mutasi_kas_id).all()
    }
    for mutasi in mutasis:
        row = daily.setdefault(mutasi.tanggal, {
            "tanggal": mutasi.tanggal.isoformat(),
            "debit": Decimal(0),
            "kredit": Decimal(0),
            "jumlah_debit": 0,
            "jumlah_kredit": 0,
            "debit_belum_cocok": Decimal(0),
            "jumlah_belum_cocok": 0,
            "saldo_akhir": None,
        })
        if mutasi.jenis == "kredit":
            row["kredit"] += Decimal(str(mutasi.jumlah))
            row["jumlah_kredit"] += 1
        else:
            row["debit"] += Decimal(str(mutasi.jumlah))
            row["jumlah_debit"] += 1
            if (
                mutasi.transaksi_belanja_id is None
                and mutasi.id not in matched_mutasi_ids
            ):
                row["debit_belum_cocok"] += Decimal(str(mutasi.jumlah))
                row["jumlah_belum_cocok"] += 1
        if mutasi.saldo is not None:
            row["saldo_akhir"] = Decimal(str(mutasi.saldo))

    results = []
    for row in daily.values():
        arus_bersih = row["kredit"] - row["debit"]
        saldo_awal = (
            row["saldo_akhir"] - arus_bersih
            if row["saldo_akhir"] is not None else None
        )
        results.append({
            **row,
            "debit": float(row["debit"]),
            "kredit": float(row["kredit"]),
            "arus_bersih": float(arus_bersih),
            "debit_belum_cocok": float(row["debit_belum_cocok"]),
            "saldo_awal": float(saldo_awal) if saldo_awal is not None else None,
            "saldo_akhir": float(row["saldo_akhir"]) if row["saldo_akhir"] is not None else None,
        })
    return results


@router.get("/")
def list_mutasi(
    tanggal_mulai: date | None = None,
    tanggal_selesai: date | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_finance),
):
    if status not in (None, "cocok", "belum_cocok", "tidak_cocok", "arus_masuk"):
        raise HTTPException(status_code=400, detail="Filter status tidak valid.")

    query = db.query(models.MutasiKas)
    if tanggal_mulai:
        query = query.filter(models.MutasiKas.tanggal >= tanggal_mulai)
    if tanggal_selesai:
        query = query.filter(models.MutasiKas.tanggal <= tanggal_selesai)
    matched_mutasi_ids = {
        mutasi_id
        for (mutasi_id,) in db.query(models.MutasiKasTransaksi.mutasi_kas_id).all()
    }
    matched_mutasi_ids.update(
        mutasi_id
        for (mutasi_id,) in db.query(models.MutasiKas.id)
        .filter(models.MutasiKas.transaksi_belanja_id.isnot(None))
        .all()
    )
    if status == "cocok":
        if matched_mutasi_ids:
            query = query.filter(models.MutasiKas.id.in_(matched_mutasi_ids))
        else:
            query = query.filter(models.MutasiKas.id == -1)
    elif status == "arus_masuk":
        query = query.filter(models.MutasiKas.jenis == "kredit")
    elif status in ("belum_cocok", "tidak_cocok"):
        query = query.filter(models.MutasiKas.jenis == "debit")
        if matched_mutasi_ids:
            query = query.filter(~models.MutasiKas.id.in_(matched_mutasi_ids))
    mutasis = query.order_by(models.MutasiKas.tanggal.desc(), models.MutasiKas.id.desc()).all()

    all_transactions = db.query(models.TransaksiBelanja).options(
        joinedload(models.TransaksiBelanja.supplier),
        selectinload(models.TransaksiBelanja.details)
        .joinedload(models.TransaksiBelanjDetail.item),
        selectinload(models.TransaksiBelanja.details)
        .selectinload(models.TransaksiBelanjDetail.alokasi)
        .joinedload(models.BelanjaPOAlokasi.po)
        .joinedload(models.PurchaseOrder.dapur),
        selectinload(models.TransaksiBelanja.details)
        .selectinload(models.TransaksiBelanjDetail.alokasi)
        .joinedload(models.BelanjaPOAlokasi.po_detail)
        .joinedload(models.PODetail.item),
    ).all()
    transaction_map = {transaction.id: transaction for transaction in all_transactions}
    linked_transactions = {}
    for mutasi_id, transaksi_id in db.query(
        models.MutasiKasTransaksi.mutasi_kas_id,
        models.MutasiKasTransaksi.transaksi_belanja_id,
    ).all():
        transaksi = transaction_map.get(transaksi_id)
        if transaksi is not None:
            linked_transactions.setdefault(mutasi_id, []).append(transaksi)
    for mutasi in mutasis:
        if mutasi.transaksi_belanja_id and not linked_transactions.get(mutasi.id):
            transaksi = transaction_map.get(mutasi.transaksi_belanja_id)
            if transaksi is not None:
                linked_transactions[mutasi.id] = [transaksi]

    result = []
    for mutasi in mutasis:
        candidates = []
        if mutasi.jenis == "debit" and not linked_transactions.get(mutasi.id):
            candidates = _rank_candidates(mutasi, all_transactions)
        if status == "belum_cocok" and not candidates:
            continue
        if status == "tidak_cocok" and candidates:
            continue
        result.append(_serialize_mutasi(
            mutasi,
            transaction_map,
            candidates,
            linked_transactions.get(mutasi.id, []),
        ))
    return result


@router.get("/{mutasi_id}/candidates")
def cari_kandidat_transaksi(
    mutasi_id: int,
    q: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_finance),
):
    mutasi = db.query(models.MutasiKas).filter(
        models.MutasiKas.id == mutasi_id
    ).first()
    if not mutasi:
        raise HTTPException(status_code=404, detail="Mutasi kas tidak ditemukan.")
    if mutasi.jenis != "debit":
        raise HTTPException(status_code=400, detail="Arus kas masuk tidak memiliki kandidat transaksi.")
    query = q.strip()
    if not query:
        return []

    pattern = f"%{query}%"
    transactions = db.query(models.TransaksiBelanja).outerjoin(
        models.Supplier,
        models.TransaksiBelanja.supplier_id == models.Supplier.id,
    ).outerjoin(
        models.TransaksiBelanjDetail,
        models.TransaksiBelanjDetail.transaksi_id == models.TransaksiBelanja.id,
    ).filter(or_(
        models.TransaksiBelanja.nomor_transaksi.ilike(pattern),
        models.TransaksiBelanja.supplier_nama.ilike(pattern),
        models.Supplier.nama.ilike(pattern),
        models.TransaksiBelanjDetail.nama_item.ilike(pattern),
    )).distinct().options(
        joinedload(models.TransaksiBelanja.supplier),
        selectinload(models.TransaksiBelanja.details)
        .joinedload(models.TransaksiBelanjDetail.item),
        selectinload(models.TransaksiBelanja.details)
        .selectinload(models.TransaksiBelanjDetail.alokasi)
        .joinedload(models.BelanjaPOAlokasi.po)
        .joinedload(models.PurchaseOrder.dapur),
        selectinload(models.TransaksiBelanja.details)
        .selectinload(models.TransaksiBelanjDetail.alokasi)
        .joinedload(models.BelanjaPOAlokasi.po_detail)
        .joinedload(models.PODetail.item),
    ).all()
    return _rank_candidates(mutasi, transactions, limit=50)


@router.post("/{mutasi_id}/match")
def cocokkan_mutasi(
    mutasi_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_finance),
):
    raw_ids = payload.get("transaksi_belanja_ids")
    if raw_ids is None and payload.get("transaksi_belanja_id") is not None:
        raw_ids = [payload["transaksi_belanja_id"]]
    if not isinstance(raw_ids, list) or not raw_ids:
        raise HTTPException(status_code=422, detail="Pilih transaksi belanja yang akan dicocokkan.") from None
    try:
        transaksi_ids = list(dict.fromkeys(int(value) for value in raw_ids))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Pilihan transaksi belanja tidak valid.") from None

    mutasi = db.query(models.MutasiKas).filter(models.MutasiKas.id == mutasi_id).first()
    if not mutasi:
        raise HTTPException(status_code=404, detail="Mutasi kas tidak ditemukan.")
    has_existing_links = db.query(models.MutasiKasTransaksi.mutasi_kas_id).filter(
        models.MutasiKasTransaksi.mutasi_kas_id == mutasi_id
    ).first()
    if mutasi.transaksi_belanja_id is not None or has_existing_links:
        raise HTTPException(status_code=409, detail="Mutasi ini sudah dicocokkan.")
    if mutasi.jenis != "debit":
        raise HTTPException(status_code=400, detail="Arus kas masuk tidak dicocokkan dengan belanja.")

    transactions = (
        db.query(models.TransaksiBelanja)
        .filter(models.TransaksiBelanja.id.in_(transaksi_ids))
        .options(joinedload(models.TransaksiBelanja.supplier))
        .all()
    )
    if len(transactions) != len(transaksi_ids):
        raise HTTPException(status_code=404, detail="Satu atau beberapa transaksi belanja tidak ditemukan.")
    if len(transactions) > 1:
        supplier_keys = {_supplier_key(transaksi) for transaksi in transactions}
        if "" in supplier_keys or len(supplier_keys) != 1:
            raise HTTPException(
                status_code=400,
                detail="Beberapa transaksi hanya dapat dicocokkan jika berasal dari supplier yang sama.",
            )
    for transaksi in transactions:
        if not _transaction_in_mutasi_period(mutasi, transaksi):
            raise HTTPException(
                status_code=400,
                detail="Tanggal transaksi/PO tidak berada dalam periode Minggu-Sabtu mutasi kas.",
            )

    db.add_all([
        models.MutasiKasTransaksi(
            mutasi_kas_id=mutasi.id,
            transaksi_belanja_id=transaksi.id,
        )
        for transaksi in transactions
    ])
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="Transaksi belanja tidak dapat dicocokkan.") from error
    return {
        "message": "Mutasi kas berhasil dicocokkan.",
        "transaksi_belanja": [_serialize_transaksi(transaksi) for transaksi in transactions],
    }


@router.post("/{mutasi_id}/unmatch")
def lepas_cocokkan_mutasi(
    mutasi_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_finance),
):
    mutasi = db.query(models.MutasiKas).filter(models.MutasiKas.id == mutasi_id).first()
    if not mutasi:
        raise HTTPException(status_code=404, detail="Mutasi kas tidak ditemukan.")
    has_links = db.query(models.MutasiKasTransaksi.mutasi_kas_id).filter(
        models.MutasiKasTransaksi.mutasi_kas_id == mutasi_id
    ).first()
    if mutasi.transaksi_belanja_id is None and not has_links:
        raise HTTPException(status_code=400, detail="Mutasi ini belum dicocokkan.")

    db.query(models.MutasiKasTransaksi).filter(
        models.MutasiKasTransaksi.mutasi_kas_id == mutasi_id
    ).delete(synchronize_session=False)

    mutasi.transaksi_belanja_id = None
    db.commit()
    return {"message": "Pencocokan mutasi berhasil dibatalkan."}
