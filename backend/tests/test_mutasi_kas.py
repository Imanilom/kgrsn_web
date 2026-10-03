from datetime import time
from decimal import Decimal
from io import BytesIO
import unittest

from fpdf import FPDF
import openpyxl

from services.mutasi_kas import parse_mutasi_pdf, parse_mutasi_xlsx


def _workbook_bytes() -> bytes:
    workbook = openpyxl.Workbook()
    first = workbook.active
    first.append(["Tanggal", None, "Deskripsi", None, "Debit", None, None, "Kredit", "Saldo"])
    first.append(["14 Jul 2026", "TR TO REMITT", None, None, -2030000, None, None, 7990000.14, None])
    first.append([time(8, 53, 14), "001283401137 CENAIDJA", None, None, None, None, None, None, None])
    first.append([None, "Pembayaran Daging Tegalsari 12 July", None, None, None, None, None, None, None])
    first.append(["14 Jul 2026", "REMITTANCE CR", None, None, 10000000, None, None, None, 17000000.14])

    continuation = workbook.create_sheet("Continuation")
    continuation.append([
        "15 Jul 2026        TR TO REMITT                                                     "
        "-4,950,000.00                                             25,837,600.14\n"
        "12:52:58          OCTOmobile TO WINDA WIDIYANTI\n"
        "pembayaran jeruk medan bangodua 12 july",
    ])
    continuation.append([
        "16 Jul 2026\nTR TO REMITT\nTransfer supplier -175.000,00 saldo 25.662.600,14",
    ])
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def _pdf_bytes() -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=10)
    pdf.multi_cell(
        0,
        6,
        "Laporan Rekening/Statement of Account\n"
        "Periode: 01 Sep 2026 - 30 Sep 2026\n"
        "Tanggal Deskripsi Debit Kredit Saldo\n"
        "01 Sep 2026 TR TO REMITT -565,500.00 20,488,671.14\n"
        "OCTOmobile TO SURADI\n"
        "06:10:24\n"
        "001364805098 BMRIIDJA\n"
        "bb-jagungpipil-tgs-30\n"
        "02 Sep 2026 REMITTANCE CR - BIFAST 50,000,000.00 70,488,671.14\n"
        "03 Sep 2026 OVERBOOKING - 175,000.00 70,313,671.14\n"
        "10:15:30\n"
        "Pembayaran supplier\n"
        "Saldo Awal IDR 21,054,171.14\n"
        "Total Debit IDR 740,500.00",
    )
    return bytes(pdf.output())


class MutasiKasParserTests(unittest.TestCase):
    def test_parse_debits_and_continuation_descriptions(self):
        mutasis = parse_mutasi_xlsx(_workbook_bytes())

        self.assertEqual(len(mutasis), 3)
        first, second, third = mutasis
        self.assertEqual(first["tanggal"].isoformat(), "2026-07-14")
        self.assertEqual(first["waktu"].strftime("%H:%M:%S"), "08:53:14")
        self.assertEqual(first["jumlah"], 2030000)
        self.assertEqual(first["saldo"], Decimal("7990000.14"))
        self.assertIn("Pembayaran Daging Tegalsari 12 July", first["deskripsi"])
        self.assertEqual(second["tanggal"].isoformat(), "2026-07-15")
        self.assertEqual(second["waktu"].strftime("%H:%M:%S"), "12:52:58")
        self.assertEqual(second["jumlah"], 4950000)
        self.assertEqual(second["saldo"], Decimal("25837600.14"))
        self.assertIn("pembayaran jeruk medan bangodua 12 july", second["deskripsi"])
        self.assertEqual(third["jumlah"], 175000)
        self.assertEqual(third["saldo"], Decimal("25662600.14"))

    def test_parse_pdf_debits_and_skip_credits_and_summary(self):
        mutasis = parse_mutasi_pdf(_pdf_bytes())

        self.assertEqual(len(mutasis), 2)
        first, second = mutasis
        self.assertEqual(first["tanggal"].isoformat(), "2026-09-01")
        self.assertEqual(first["waktu"].strftime("%H:%M:%S"), "06:10:24")
        self.assertEqual(first["jumlah"], Decimal("565500.00"))
        self.assertEqual(first["saldo"], Decimal("20488671.14"))
        self.assertIn("bb-jagungpipil-tgs-30", first["deskripsi"])
        self.assertEqual(second["tanggal"].isoformat(), "2026-09-03")
        self.assertEqual(second["waktu"].strftime("%H:%M:%S"), "10:15:30")
        self.assertEqual(second["jumlah"], Decimal("175000.00"))
        self.assertEqual(second["saldo"], Decimal("70313671.14"))
        self.assertIn("Pembayaran supplier", second["deskripsi"])
