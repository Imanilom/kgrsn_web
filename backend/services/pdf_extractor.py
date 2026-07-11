"""
PDF Extractor Service - mengekstrak data PO dari file PDF berbasis teks (dari Word).
Menggunakan pdfplumber untuk ekstraksi tabel dan teks.
"""
import pdfplumber
import re
from typing import List, Dict, Optional, Tuple
from rapidfuzz import process, fuzz
from decimal import Decimal


# Keyword untuk deteksi header kolom (case-insensitive)
COLUMN_KEYWORDS = {
    "no":      ["no", "no.", "nomor", "#"],
    "item":    ["nama", "barang", "item", "keterangan", "deskripsi", "uraian", "produk"],
    "qty":     ["qty", "jumlah", "kuantitas", "banyaknya", "jml", "volume"],
    "satuan":  ["satuan", "unit", "uom", "stn", "ukuran"],
    "harga":   ["harga", "price", "hrg", "harga satuan", "unit price", "h.satuan"],
    "subtotal":["subtotal", "jumlah harga", "total harga", "amount", "nilai"],
}


def parse_number(value: any) -> float:
    """Parse angka dari berbagai format (1.000 / 1,000 / 1.000,00 / dll)."""
    if value is None:
        return 0.0
    text = str(value).strip()
    if not text or text.lower() in ["none", "-", ""]:
        return 0.0
    # Hapus simbol mata uang
    text = re.sub(r"[Rp$€£\s]", "", text)
    # Handle format Indonesia: 1.000.000,00
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        # Kemungkinan desimal Indonesia: 1500,50
        parts = text.split(",")
        if len(parts) == 2 and len(parts[1]) <= 2:
            text = text.replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "." in text:
        parts = text.split(".")
        if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3):
            text = text.replace(".", "")
    try:
        return float(text)
    except ValueError:
        return 0.0


def detect_header_row(rows: List[List]) -> Tuple[Optional[int], Dict[str, int]]:
    """Deteksi baris header dan mapping kolom."""
    for i, row in enumerate(rows):
        col_map = {}
        if not row:
            continue
        for j, cell in enumerate(row):
            if cell is None:
                continue
            cell_lower = str(cell).lower().strip()
            for field, keywords in COLUMN_KEYWORDS.items():
                if any(kw in cell_lower for kw in keywords):
                    if field not in col_map:
                        col_map[field] = j
                    break
        # Jika minimal ada kolom item, row ini dianggap header
        if "item" in col_map:
            return i, col_map
    return None, {}


def parse_table_rows(
    rows: List[List], header_idx: int, col_map: Dict[str, int]
) -> List[Dict]:
    """Parse baris data dari tabel setelah header."""
    items = []
    for row in rows[header_idx + 1:]:
        if not row or all(cell is None or str(cell).strip() == "" for cell in row):
            continue

        item_col = col_map.get("item")
        if item_col is None:
            continue

        nama_raw = str(row[item_col]).strip() if item_col < len(row) else ""
        if not nama_raw or nama_raw.lower() in ["none", "", "total", "subtotal", "grand total"]:
            continue

        qty_col = col_map.get("qty")
        satuan_col = col_map.get("satuan")
        harga_col = col_map.get("harga")
        subtotal_col = col_map.get("subtotal")

        qty = parse_number(row[qty_col]) if qty_col is not None and qty_col < len(row) else 0.0
        satuan = str(row[satuan_col]).strip() if satuan_col is not None and satuan_col < len(row) else ""
        harga = parse_number(row[harga_col]) if harga_col is not None and harga_col < len(row) else 0.0
        subtotal = parse_number(row[subtotal_col]) if subtotal_col is not None and subtotal_col < len(row) else 0.0

        # Kalkulasi subtotal jika tidak ada
        if subtotal == 0 and qty > 0 and harga > 0:
            subtotal = qty * harga

        items.append({
            "nama_item_raw": nama_raw,
            "qty": qty,
            "satuan": satuan if satuan.lower() not in ["none", ""] else "",
            "harga_satuan": harga,
            "subtotal": subtotal,
        })

    return items


def extract_from_text(text: str) -> List[Dict]:
    """
    Fallback: ekstrak item dari teks biasa jika tidak ada tabel terdeteksi.
    Mendukung beberapa pola.
    """
    items = []
    lines = text.split("\n")
    
    # Pola 1: (qty) (satuan) (nama_item) (harga) -> 3 buah Tepung Terigu 12.000
    pattern_qty_first = re.compile(
        r"(\d+(?:[.,]\d+)?)\s+(\w+)\s+(.+?)\s+(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*$"
    )
    # Pola 2: (No.) (nama_item) (qty) (satuan) -> 1. BERAS 150 KG
    pattern_no_first = re.compile(
        r"^\d+\.?\s+(.+?)\s+(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s+([A-Za-z]+)$"
    )

    for line in lines:
        line = line.strip()
        
        m_qty = pattern_qty_first.match(line)
        if m_qty:
            qty = parse_number(m_qty.group(1))
            satuan = m_qty.group(2)
            nama = m_qty.group(3).strip()
            harga = parse_number(m_qty.group(4))
            if qty > 0:
                items.append({
                    "nama_item_raw": nama,
                    "qty": qty,
                    "satuan": satuan,
                    "harga_satuan": harga,
                    "subtotal": qty * harga,
                })
            continue

        m_no = pattern_no_first.match(line)
        if m_no:
            nama = m_no.group(1).strip()
            qty = parse_number(m_no.group(2))
            satuan = m_no.group(3)
            # Harga tidak ada di pola ini, diisi 0
            if qty > 0:
                items.append({
                    "nama_item_raw": nama,
                    "qty": qty,
                    "satuan": satuan,
                    "harga_satuan": 0.0,
                    "subtotal": 0.0,
                })
                
    return items


def extract_header_info(text: str) -> Dict:
    """Ekstrak info header PO: nomor PO, tanggal, nama dapur, dll."""
    info = {}

    # Cari nomor PO
    po_patterns = [
        r"(?:no\.?\s*po|nomor\s*po|purchase\s*order\s*no\.?)\s*[:\-]?\s*([A-Z0-9\-/]+)",
        r"PO[-/]([A-Z0-9\-/]+)",
    ]
    for pattern in po_patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            info["nomor_po"] = m.group(1).strip()
            break

    # Cari tanggal
    date_patterns = [
        r"(?:tanggal|date|tgl\.?)\s*[:\-]?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})",
        r"(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{4})",
    ]
    for pattern in date_patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            info["tanggal_raw"] = m.group(1).strip()
            break

    return info


def match_item_to_master(
    nama_raw: str, master_items: List[Dict], threshold: int = 75
) -> Tuple[Optional[int], float]:
    """
    Fuzzy matching nama item dari PDF ke master_item.
    Returns: (item_id, confidence_score)
    """
    if not master_items:
        return None, 0.0

    choices = {}
    for m in master_items:
        choices[m["id"]] = m["nama_item"]
        # Tambahkan alias jika ada
        if m.get("alias"):
            for alias in m["alias"].split(","):
                alias = alias.strip()
                if alias:
                    choices[f"{m['id']}_alias_{alias}"] = alias

    # Gunakan rapidfuzz untuk fuzzy matching
    result = process.extractOne(
        nama_raw,
        choices,
        scorer=fuzz.WRatio,
        score_cutoff=threshold,
    )

    if result:
        key, score, _ = result
        # Ambil item_id
        item_id = int(str(key).split("_alias_")[0])
        return item_id, score / 100.0

    return None, 0.0


def extract_po_from_pdf(pdf_path: str, master_items: List[Dict] = None) -> Dict:
    """
    Fungsi utama: ekstrak data PO dari file PDF.

    Returns:
    {
        "header": {...},
        "items": [...],
        "method": "table" | "text",
        "confidence": float,
        "raw_text": str
    }
    """
    if master_items is None:
        master_items = []

    items = []
    raw_text = ""
    method = "table"
    header_info = {}

    try:
        with pdfplumber.open(pdf_path) as pdf:
            all_text_pages = []

            for page in pdf.pages:
                # Ambil teks mentah
                page_text = page.extract_text() or ""
                all_text_pages.append(page_text)

                # Coba ekstrak tabel
                tables = page.extract_tables({
                    "vertical_strategy": "lines_strict",
                    "horizontal_strategy": "lines_strict",
                    "intersection_tolerance": 3,
                })

                if not tables:
                    # Fallback ke strategi yang lebih longgar
                    tables = page.extract_tables({
                        "vertical_strategy": "text",
                        "horizontal_strategy": "text",
                    })

                for table in tables:
                    if len(table) < 2:
                        continue
                    header_idx, col_map = detect_header_row(table)
                    if header_idx is not None and "item" in col_map:
                        parsed = parse_table_rows(table, header_idx, col_map)
                        items.extend(parsed)

            raw_text = "\n".join(all_text_pages)
            header_info = extract_header_info(raw_text)

            # Validasi hasil ekstraksi tabel: Jika semua qty = 0, berarti tabel gagal diekstrak
            if items and all(item.get("qty", 0) == 0 for item in items):
                items = []

            # Jika tidak ada item valid dari tabel, coba parsing teks
            if not items:
                method = "text"
                items = extract_from_text(raw_text)

            # Fuzzy matching ke master item
            total_confidence = 0.0
            for item in items:
                if master_items:
                    matched_id, conf = match_item_to_master(item["nama_item_raw"], master_items)
                    item["matched_item_id"] = matched_id
                    item["confidence"] = conf
                    total_confidence += conf
                else:
                    item["matched_item_id"] = None
                    item["confidence"] = 0.0

            avg_confidence = total_confidence / len(items) if items else 0.0

            return {
                "header": header_info,
                "items": items,
                "method": method,
                "confidence": avg_confidence,
                "raw_text": raw_text[:2000],    # Simpan preview teks
                "error": None,
            }

    except Exception as e:
        return {
            "header": {},
            "items": [],
            "method": "error",
            "confidence": 0.0,
            "raw_text": "",
            "error": str(e),
        }
