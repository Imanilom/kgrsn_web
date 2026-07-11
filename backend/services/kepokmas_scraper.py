"""
Kepokmas Scraper — mengambil data HET dari:
http://kepokmas.cirebonkab.go.id/statistik-komoditas

Data diambil per komoditas dengan parameter ?komoditi={id}&bulan=MM-YYYY
kemudian di-fuzzy match ke nama item internal KGRSN.
"""
import re
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict
from decimal import Decimal

import requests
from bs4 import BeautifulSoup
from rapidfuzz import process as fuzz_process, fuzz

from sqlalchemy.orm import Session
import models

logger = logging.getLogger(__name__)

BASE_URL = "http://kepokmas.cirebonkab.go.id"
CACHE_HOURS = 6

# Daftar komoditas yang kemungkinan relevan dengan KGRSN
# Extracted dari <select> HTML Kepokmas
KOMODITAS_LIST = {
    27: "Gula Impor",
    28: "Gula Pasir lokal",
    29: "Minyak Goreng Curah",
    30: "Minyak Goreng Bimoli",
    31: "Daging Sapi Murni",
    32: "Daging Ayam Broiler",
    33: "Daging Ayam Kampung",
    34: "Telur Ayam Broiler",
    35: "Telur Ayam Kampung",
    40: "Garam Beryodium",
    44: "Kacang Hijau",
    45: "Kacang Tanah/Suuk",
    46: "Teri Medan Kering",
    47: "Ikan Kembung",
    51: "Cabe Merah Keriting",
    52: "Cabe Merah Biasa",
    53: "Cabe Rawit Merah",
    54: "Cabe Rawit Hijau",
    57: "Singkong",
    58: "Indomie Kari Ayam",
    59: "Jagung Pipilan",
    70: "Gula Merah",
    72: "Minyak Goreng Tropical",
    74: "Daging Kambing",
    75: "Telur Bebek Mentah",
    102: "Kentang",
    103: "Wortel",
    104: "Buncis",
    105: "Kol",
    106: "Sawi Hijau",
    107: "Sawi Petsay",
    108: "Tomat Buah",
    109: "Tomat Sayur",
    113: "Cabe Hijau",
    114: "Bawang Merah",
    115: "Bawang Putih",
    116: "Bawang Bombay",
    121: "Daging Sapi Kw 2",
    122: "Ikan Tongkol",
    123: "Ikan Mas",
    126: "Beras Premium Super",
    127: "Beras Medium",
    128: "Beras Bulog",
    131: "Minyak Goreng Kemasan Sederhana",
}

KOMODITAS_NAMES = list(KOMODITAS_LIST.values())
KOMODITAS_IDS   = {v: k for k, v in KOMODITAS_LIST.items()}


def _get_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    })
    return s


def scrape_harga_komoditas(komoditas_id: int, bulan: str = None) -> Optional[float]:
    """
    Scrape rata-rata harga suatu komoditas dari Kepokmas.
    bulan: format 'MM-YYYY' (default: bulan ini)
    Returns: rata-rata harga (float) atau None
    """
    if bulan is None:
        bulan = datetime.now().strftime("%m-%Y")

    url = f"{BASE_URL}/statistik-komoditas"
    params = {"komoditi": komoditas_id, "bulan": bulan}

    try:
        resp = _get_session().get(url, params=params, timeout=10)
        resp.raise_for_status()
    except Exception as e:
        logger.warning(f"Gagal mengambil data Kepokmas komoditas {komoditas_id}: {e}")
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Cari sel rata-rata (kolom "Rata-rata ... 2026")
    # Tabel header: No | Pasar | 1 | 2 | ... | 31 | Terendah | Tertinggi | Rata-rata
    all_prices = []
    try:
        tbl = soup.find("table", class_="table-pasar")
        if not tbl:
            return None

        for tr in tbl.find_all("tr"):
            cells = tr.find_all("td")
            if len(cells) < 3:
                continue
            # Ambil semua nilai numerik dalam row
            for cell in cells:
                txt = cell.get_text(strip=True).replace(".", "").replace(",", ".")
                try:
                    val = float(txt)
                    if val > 100:  # Filter noise kecil
                        all_prices.append(val)
                except ValueError:
                    pass
    except Exception as e:
        logger.warning(f"Parse error Kepokmas: {e}")
        return None

    if not all_prices:
        return None

    # Ambil median sebagai referensi HET
    sorted_prices = sorted(all_prices)
    n = len(sorted_prices)
    median = sorted_prices[n // 2]
    return median


def fuzzy_match_komoditas(nama_item: str, threshold: float = 60.0) -> Optional[dict]:
    """
    Fuzzy match nama item KGRSN ke komoditas Kepokmas.
    Returns: { komoditas_id, nama_kepokmas, score } atau None
    """
    nama_lower = nama_item.lower().strip()
    result = fuzz_process.extractOne(
        nama_lower,
        [n.lower() for n in KOMODITAS_NAMES],
        scorer=fuzz.WRatio,
        score_cutoff=threshold,
    )
    if not result:
        return None

    matched_lower, score, idx = result
    matched_name = KOMODITAS_NAMES[idx]
    return {
        "komoditas_id": KOMODITAS_IDS[matched_name],
        "nama_kepokmas": matched_name,
        "score": round(score, 1),
    }


def get_het(nama_item: str, db: Session, force_refresh: bool = False) -> dict:
    """
    Ambil data HET untuk satu item.
    1. Cek cache di tabel het_cache
    2. Jika tidak ada / kadaluarsa → scrape Kepokmas → simpan cache
    Returns: { het, nama_kepokmas, match_score, sumber }
    """
    nama_norm = nama_item.lower().strip()

    # Cek cache
    if not force_refresh:
        cached = db.query(models.HetCache).filter(
            models.HetCache.nama_item == nama_norm
        ).first()

        if cached and cached.updated_at:
            age_hours = (datetime.utcnow() - cached.updated_at).total_seconds() / 3600
            if age_hours < CACHE_HOURS:
                return {
                    "het": float(cached.het_harga) if cached.het_harga else None,
                    "nama_kepokmas": cached.nama_kepokmas,
                    "match_score": float(cached.match_score) if cached.match_score else None,
                    "komoditas_id": cached.komoditas_id,
                    "sumber": "cache",
                }

    # Fuzzy match ke Kepokmas
    match = fuzzy_match_komoditas(nama_norm)
    if not match:
        # Simpan cache "tidak ditemukan"
        _upsert_het_cache(db, nama_norm, None, None, None, None)
        return {"het": None, "nama_kepokmas": None, "match_score": None, "sumber": "tidak_ditemukan"}

    # Scrape harga
    het_harga = scrape_harga_komoditas(match["komoditas_id"])

    # Simpan/update cache
    _upsert_het_cache(
        db, nama_norm,
        match["nama_kepokmas"],
        match["komoditas_id"],
        het_harga,
        match["score"],
    )

    return {
        "het": het_harga,
        "nama_kepokmas": match["nama_kepokmas"],
        "match_score": match["score"],
        "komoditas_id": match["komoditas_id"],
        "sumber": "kepokmas",
    }


def _upsert_het_cache(
    db: Session,
    nama_item: str,
    nama_kepokmas: Optional[str],
    komoditas_id: Optional[int],
    het_harga: Optional[float],
    match_score: Optional[float],
):
    existing = db.query(models.HetCache).filter(
        models.HetCache.nama_item == nama_item
    ).first()

    if existing:
        existing.nama_kepokmas = nama_kepokmas
        existing.komoditas_id = komoditas_id
        existing.het_harga    = Decimal(str(het_harga)) if het_harga else None
        existing.match_score  = Decimal(str(match_score)) if match_score else None
        existing.updated_at   = datetime.utcnow()
    else:
        db.add(models.HetCache(
            nama_item     = nama_item,
            nama_kepokmas = nama_kepokmas,
            komoditas_id  = komoditas_id,
            het_harga     = Decimal(str(het_harga)) if het_harga else None,
            match_score   = Decimal(str(match_score)) if match_score else None,
        ))

    try:
        db.commit()
    except Exception as e:
        logger.warning(f"Gagal simpan HET cache: {e}")
        db.rollback()
