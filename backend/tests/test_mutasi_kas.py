from datetime import time
from decimal import Decimal
from io import BytesIO
import unittest

import openpyxl

from services.mutasi_kas import parse_mutasi_xlsx


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
