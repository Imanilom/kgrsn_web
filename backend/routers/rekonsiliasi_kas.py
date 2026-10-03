"""Impor dan pencocokan mutasi kas dengan transaksi belanja."""
from datetime import date
from decimal import Decimal
from hashlib import sha256
import json
from zipfile import BadZipFile

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

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


def _serialize_mutasi(mutasi: models.MutasiKas, transaksi_map: dict, candidates: list) -> dict:
    return {
        "id": mutasi.id,
        "tanggal": mutasi.tanggal.isoformat(),
        "waktu": mutasi.waktu.isoformat() if mutasi.waktu else None,
        "deskripsi": mutasi.deskripsi,
        "jumlah": float(mutasi.jumlah),
        "saldo": float(mutasi.saldo) if mutasi.saldo is not None else None,
        "sumber_sheet": mutasi.sumber_sheet,
        "transaksi_belanja": (
            _serialize_transaksi(transaksi_map[mutasi.transaksi_belanja_id])
            if mutasi.transaksi_belanja_id in transaksi_map
            else None
        ),
        "kandidat": candidates,
    }


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
        raise HTTPException(status_code=413, detail="Ukuran file Excel maksimal 20 MB.")
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
    }


@router.get("/")
def list_mutasi(
    tanggal_mulai: date | None = None,
    tanggal_selesai: date | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_finance),
):
    if status not in (None, "cocok", "belum_cocok"):
        raise HTTPException(status_code=400, detail="Filter status tidak valid.")

    query = db.query(models.MutasiKas)
    if tanggal_mulai:
        query = query.filter(models.MutasiKas.tanggal >= tanggal_mulai)
    if tanggal_selesai:
        query = query.filter(models.MutasiKas.tanggal <= tanggal_selesai)
    if status == "cocok":
        query = query.filter(models.MutasiKas.transaksi_belanja_id.isnot(None))
    elif status == "belum_cocok":
        query = query.filter(models.MutasiKas.transaksi_belanja_id.is_(None))
    mutasis = query.order_by(models.MutasiKas.tanggal.desc(), models.MutasiKas.id.desc()).all()

    used_ids = {
        transaksi_id
        for (transaksi_id,) in db.query(models.MutasiKas.transaksi_belanja_id)
        .filter(models.MutasiKas.transaksi_belanja_id.isnot(None))
        .all()
    }
    transactions = (
        db.query(models.TransaksiBelanja)
        .filter(models.TransaksiBelanja.id.in_(used_ids))
        .all()
        if used_ids
        else []
    )
    transaction_map = {transaction.id: transaction for transaction in transactions}

    amounts = {Decimal(str(mutasi.jumlah)) for mutasi in mutasis if not mutasi.transaksi_belanja_id}
    candidates_by_amount = {amount: [] for amount in amounts}
    if amounts:
        candidate_query = db.query(models.TransaksiBelanja).filter(
            models.TransaksiBelanja.total.in_(amounts)
        )
        if used_ids:
            candidate_query = candidate_query.filter(~models.TransaksiBelanja.id.in_(used_ids))
        for transaction in candidate_query.all():
            amount = Decimal(str(transaction.total or 0))
            if amount in candidates_by_amount:
                candidates_by_amount[amount].append(transaction)

    result = []
    for mutasi in mutasis:
        candidates = []
        if not mutasi.transaksi_belanja_id:
            matches = candidates_by_amount.get(Decimal(str(mutasi.jumlah)), [])
            matches.sort(key=lambda item: (
                abs((item.tanggal_belanja - mutasi.tanggal).days),
                item.id,
            ))
            candidates = [_serialize_transaksi(item) for item in matches[:10]]
        result.append(_serialize_mutasi(mutasi, transaction_map, candidates))
    return result


@router.post("/{mutasi_id}/match")
def cocokkan_mutasi(
    mutasi_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_finance),
):
    try:
        transaksi_id = int(payload["transaksi_belanja_id"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Pilih transaksi belanja yang akan dicocokkan.") from None

    mutasi = db.query(models.MutasiKas).filter(models.MutasiKas.id == mutasi_id).first()
    if not mutasi:
        raise HTTPException(status_code=404, detail="Mutasi kas tidak ditemukan.")
    if mutasi.transaksi_belanja_id is not None:
        raise HTTPException(status_code=409, detail="Mutasi ini sudah dicocokkan.")

    transaksi = (
        db.query(models.TransaksiBelanja)
        .filter(models.TransaksiBelanja.id == transaksi_id)
        .first()
    )
    if not transaksi:
        raise HTTPException(status_code=404, detail="Transaksi belanja tidak ditemukan.")
    if Decimal(str(transaksi.total or 0)) != Decimal(str(mutasi.jumlah)):
        raise HTTPException(status_code=400, detail="Jumlah transaksi dan mutasi harus sama persis.")
    if db.query(models.MutasiKas.id).filter(
        models.MutasiKas.transaksi_belanja_id == transaksi_id
    ).first():
        raise HTTPException(status_code=409, detail="Transaksi belanja sudah dicocokkan dengan mutasi lain.")

    mutasi.transaksi_belanja_id = transaksi.id
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="Transaksi belanja sudah dicocokkan dengan mutasi lain.") from error
    return {"message": "Mutasi kas berhasil dicocokkan.", "transaksi_belanja": _serialize_transaksi(transaksi)}


@router.post("/{mutasi_id}/unmatch")
def lepas_cocokkan_mutasi(
    mutasi_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_finance),
):
    mutasi = db.query(models.MutasiKas).filter(models.MutasiKas.id == mutasi_id).first()
    if not mutasi:
        raise HTTPException(status_code=404, detail="Mutasi kas tidak ditemukan.")
    if mutasi.transaksi_belanja_id is None:
        raise HTTPException(status_code=400, detail="Mutasi ini belum dicocokkan.")

    mutasi.transaksi_belanja_id = None
    db.commit()
    return {"message": "Pencocokan mutasi berhasil dibatalkan."}
