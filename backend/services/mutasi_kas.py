"""Pembacaan mutasi debit dari laporan rekening Excel dan PDF."""
from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation
from io import BytesIO
import re
from typing import Optional

import openpyxl
import pdfplumber
from pdfminer.pdfdocument import PDFPasswordIncorrect
from pdfminer.pdfparser import PDFSyntaxError


DATE_PATTERN = re.compile(
    r"\b(?:\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}"
    r"|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b",
    re.IGNORECASE,
)
TIME_PATTERN = re.compile(r"\b\d{1,2}:\d{2}:\d{2}\b")
MONEY_PATTERN = re.compile(
    r"(?<![\w])(?:-\s?\d+(?:[.,]\d{3})*(?:[.,]\d{2})?"
    r"|\+?\d{1,3}(?:,\d{3})+(?:\.\d{2})?"
    r"|\+?\d{1,3}(?:\.\d{3})+(?:,\d{2})?"
    r"|\+?\d{4,}[.,]\d{2})(?![\w])"
)


def _parse_date(value) -> Optional[date]:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        match = DATE_PATTERN.search(value)
        if match:
            text = match.group().replace("/", "-")
            formats = (
                "%d %b %Y",
                "%d %B %Y",
                "%d-%m-%Y",
            )
            month_map = {
                "jan": "jan", "feb": "feb", "mar": "mar", "apr": "apr",
                "mei": "may", "jun": "jun", "jul": "jul", "agu": "aug",
                "ags": "aug", "sep": "sep", "sept": "sep", "okt": "oct",
                "nov": "nov", "des": "dec", "januari": "jan",
                "februari": "feb", "maret": "mar", "april": "apr",
                "juni": "jun", "juli": "jul", "agustus": "aug",
                "september": "sep", "oktober": "oct", "november": "nov",
                "desember": "dec",
            }
            for old, new in month_map.items():
                text = re.sub(rf"\b{old}\b", new, text, flags=re.IGNORECASE)
            for format_string in formats:
                try:
                    return datetime.strptime(text, format_string).date()
                except ValueError:
                    continue
    return None


def _parse_time(value) -> Optional[time]:
    if isinstance(value, datetime):
        parsed = value.time()
        return parsed if parsed != time.min else None
    if isinstance(value, time):
        return value
    if isinstance(value, str):
        match = TIME_PATTERN.search(value)
        if match:
            return datetime.strptime(match.group(), "%H:%M:%S").time()
    return None


def _parse_money(value: str) -> Decimal:
    normalized = value.strip().replace(" ", "")
    if "," in normalized and "." in normalized:
        if normalized.rfind(",") > normalized.rfind("."):
            normalized = normalized.replace(".", "").replace(",", ".")
        else:
            normalized = normalized.replace(",", "")
    elif "," in normalized:
        if len(normalized.rsplit(",", 1)[-1]) == 2:
            normalized = normalized.replace(".", "").replace(",", ".")
        else:
            normalized = normalized.replace(",", "")
    elif "." in normalized:
        if len(normalized.rsplit(".", 1)[-1]) != 2:
            normalized = normalized.replace(".", "")
    try:
        return Decimal(normalized)
    except InvalidOperation:
        raise ValueError(f"Nominal mutasi tidak valid: {value}") from None


def _money_values(value) -> list[Decimal]:
    if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
        if isinstance(value, int) and value >= 0:
            return []
        return [Decimal(str(value))]
    if not isinstance(value, str):
        return []
    return [_parse_money(match.group()) for match in MONEY_PATTERN.finditer(value)]


def _cell_money_values(value) -> list[Decimal]:
    if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
        return [Decimal(str(value))]
    return _money_values(value)


def _clean_description(value) -> str:
    if not isinstance(value, str):
        return ""
    cleaned = DATE_PATTERN.sub(" ", value)
    cleaned = TIME_PATTERN.sub(" ", cleaned)
    cleaned = MONEY_PATTERN.sub(" ", cleaned)
    lines = [" ".join(line.split()) for line in cleaned.splitlines()]
    return " ".join(line for line in lines if line)


def _header_columns(row) -> dict[str, int]:
    labels = {}
    for index, value in enumerate(row):
        if isinstance(value, str):
            label = value.strip().lower()
            if label in {"tanggal", "deskripsi", "debit", "kredit", "saldo"}:
                labels[label] = index
    return labels


def parse_mutasi_xlsx(content: bytes) -> list[dict]:
    """Mengambil transaksi debit/kredit dan detail baris lanjutannya dari semua sheet."""
    workbook = openpyxl.load_workbook(BytesIO(content), data_only=True, read_only=True)
    transactions = []

    try:
        for worksheet in workbook.worksheets:
            current_date = None
            current_time = None
            header = {}
            last_transaction = None

            for row in worksheet.iter_rows(values_only=True):
                if not any(value is not None for value in row):
                    continue

                columns = _header_columns(row)
                if "debit" in columns and "tanggal" in columns:
                    header = columns
                    continue

                row_date = next(
                    (parsed for value in row if (parsed := _parse_date(value)) is not None),
                    None,
                )
                row_time = next(
                    (parsed for value in row if (parsed := _parse_time(value)) is not None),
                    None,
                )
                if row_date:
                    current_date = row_date
                    current_time = row_time
                elif row_time:
                    current_time = row_time
                    if last_transaction and last_transaction["waktu"] is None and current_date:
                        last_transaction["waktu"] = datetime.combine(current_date, row_time)

                amount = None
                jenis = None
                debit_index = header.get("debit")
                if debit_index is not None and debit_index < len(row):
                    debit_values = _cell_money_values(row[debit_index])
                    amount = next((value for value in debit_values if value != 0), None)
                    if amount is not None:
                        jenis = "debit"
                if amount is None:
                    credit_index = header.get("kredit")
                    if credit_index is not None and credit_index < len(row):
                        credit_values = _cell_money_values(row[credit_index])
                        amount = next((value for value in credit_values if value != 0), None)
                        if amount is not None:
                            jenis = "kredit"

                amounts = [
                    value
                    for cell in row
                    for value in _money_values(cell)
                ]
                if amount is None:
                    amount = next((value for value in amounts if value < 0), None)
                    if amount is not None:
                        jenis = "debit"
                    elif row_date and not header:
                        amount = next((value for value in amounts if value > 0), None)
                        if amount is not None:
                            jenis = "kredit"

                description_parts = [
                    text
                    for value in row
                    if (text := _clean_description(value))
                ]
                row_description = " ".join(description_parts)

                if amount is not None and jenis:
                    if current_date is None:
                        continue

                    balance = None
                    debit_cell_index = None
                    saldo_index = header.get("saldo")
                    if saldo_index is not None and saldo_index < len(row):
                        saldo_values = _cell_money_values(row[saldo_index])
                        balance = next((value for value in saldo_values if value >= 0), None)
                    if balance is None:
                        for index, value in enumerate(row):
                            values = _cell_money_values(value)
                            if amount in values:
                                debit_cell_index = index
                                following = values[values.index(amount) + 1:]
                                balance = next((value for value in following if value >= 0), None)
                                if balance is None:
                                    for next_value in row[index + 1:]:
                                        balance_values = _cell_money_values(next_value)
                                        balance = next((value for value in balance_values if value >= 0), None)
                                        if balance is not None:
                                            break
                                break
                    if balance is None and saldo_index is not None:
                        if saldo_index < len(row) and saldo_index != debit_cell_index:
                            saldo_values = _cell_money_values(row[saldo_index])
                            balance = next((amount for amount in saldo_values if amount >= 0), None)
                    transaction = {
                        "tanggal": current_date,
                        "waktu": datetime.combine(current_date, current_time) if current_time else None,
                        "deskripsi": row_description,
                        "jenis": jenis,
                        "jumlah": abs(amount).quantize(Decimal("0.01")),
                        "saldo": balance.quantize(Decimal("0.01")) if balance is not None else None,
                        "sumber_sheet": worksheet.title,
                    }
                    transactions.append(transaction)
                    last_transaction = transaction
                elif amounts:
                    last_transaction = None
                elif last_transaction and row_description:
                    last_transaction["deskripsi"] = (
                        f"{last_transaction['deskripsi']} {row_description}".strip()
                    )
    finally:
        workbook.close()

    if not transactions:
        raise ValueError("Tidak ditemukan transaksi debit pada file Excel.")
    return transactions


PDF_PAGE_PATTERN = re.compile(r"^Page\s+\d+\s+of\s+\d+$", re.IGNORECASE)
PDF_SUMMARY_PATTERN = re.compile(
    r"^(?:Saldo Awal|Total Kredit|Total Debit|Saldo Akhir|IMPORTANT!|"
    r"User ID, Password|Your User ID)",
    re.IGNORECASE,
)
PDF_METADATA_PATTERN = re.compile(
    r"^(?:Laporan Rekening/|Periode:|No\. Rekening\s*:|Jenis Produk\s*:|"
    r"Nama\s*:|Mata Uang\s*:|Tanggal\s+Deskripsi\s+Debit)",
    re.IGNORECASE,
)


def parse_mutasi_pdf(content: bytes) -> list[dict]:
    """Mengambil mutasi debit/kredit dari rekening koran PDF berbasis teks."""
    transactions = []
    has_text = False

    try:
        with pdfplumber.open(BytesIO(content)) as document:
            for page_number, page in enumerate(document.pages, start=1):
                text = page.extract_text()
                if not text:
                    continue
                has_text = True
                current_date = None
                last_transaction = None

                for line in text.splitlines():
                    line = line.strip()
                    if not line or PDF_PAGE_PATTERN.match(line) or PDF_METADATA_PATTERN.match(line):
                        continue
                    if PDF_SUMMARY_PATTERN.match(line):
                        last_transaction = None
                        continue

                    date_match = re.match(
                        r"^(\d{1,2}(?:\s+[A-Za-z]{3,9}\s+|[/-]\d{1,2}[/-])\d{4})\b",
                        line,
                        re.IGNORECASE,
                    )
                    if date_match:
                        current_date = _parse_date(date_match.group(1))
                        money_matches = list(MONEY_PATTERN.finditer(line))
                        if not money_matches:
                            last_transaction = None
                            continue

                        debit_match = money_matches[0]
                        amount = _parse_money(debit_match.group())
                        if amount == 0:
                            last_transaction = None
                            continue
                        jenis = "debit" if amount < 0 else "kredit"
                        description = _clean_description(
                            line[date_match.end():debit_match.start()]
                        )
                        following_values = _money_values(line[debit_match.end():])
                        balance = next(
                            (amount for amount in following_values if amount >= 0),
                            None,
                        )
                        parsed_time = _parse_time(line)
                        transaction = {
                            "tanggal": current_date,
                            "waktu": (
                                datetime.combine(current_date, parsed_time)
                                if current_date and parsed_time else None
                            ),
                            "deskripsi": description,
                            "jenis": jenis,
                            "jumlah": abs(amount).quantize(Decimal("0.01")),
                            "saldo": (
                                balance.quantize(Decimal("0.01"))
                                if balance is not None else None
                            ),
                            "sumber_sheet": f"PDF halaman {page_number}",
                        }
                        transactions.append(transaction)
                        last_transaction = transaction
                        continue

                    if not last_transaction:
                        continue
                    parsed_time = _parse_time(line)
                    if parsed_time:
                        if last_transaction["waktu"] is None:
                            last_transaction["waktu"] = datetime.combine(
                                last_transaction["tanggal"], parsed_time
                            )
                        continue
                    continuation = _clean_description(line)
                    if continuation:
                        last_transaction["deskripsi"] = (
                            f"{last_transaction['deskripsi']} {continuation}".strip()
                        )
    except PDFPasswordIncorrect as error:
        raise ValueError(
            "PDF dilindungi kata sandi. Simpan salinan PDF tanpa kata sandi lalu unggah kembali."
        ) from error
    except PDFSyntaxError as error:
        raise ValueError("File bukan dokumen PDF rekening koran yang valid.") from error

    if not has_text:
        raise ValueError(
            "PDF tidak memiliki teks yang bisa dibaca. PDF hasil scan/gambar belum didukung; "
            "gunakan PDF hasil unduh bank atau unggah file XLSX."
        )
    if not transactions:
        raise ValueError("Tidak ditemukan transaksi debit pada file PDF.")
    return transactions
