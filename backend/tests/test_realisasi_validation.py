import unittest
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException

from routers.realisasi import _validate_zero_qty_deviation


def _po():
    return SimpleNamespace(
        nomor_po="PO-TEST",
        details=[
            SimpleNamespace(id=1, qty=Decimal("3.000"), nama_item_raw="Beras", item=None),
            SimpleNamespace(id=2, qty=Decimal("5.000"), nama_item_raw="Telur", item=None),
        ],
    )


class RealisasiValidationTests(unittest.TestCase):
    def test_accepts_realization_with_zero_deviation(self):
        _validate_zero_qty_deviation(_po(), [
            SimpleNamespace(po_detail_id=1, qty_realisasi=Decimal("3.000")),
            SimpleNamespace(po_detail_id=2, qty_realisasi=Decimal("5.000")),
            SimpleNamespace(po_detail_id=None, qty_realisasi=Decimal("1.000")),
        ])

    def test_rejects_nonzero_deviation(self):
        with self.assertRaises(HTTPException) as error:
            _validate_zero_qty_deviation(_po(), [
                SimpleNamespace(po_detail_id=1, qty_realisasi=Decimal("2.000")),
                SimpleNamespace(po_detail_id=2, qty_realisasi=Decimal("5.000")),
            ])

        self.assertIn("deviasi", error.exception.detail.lower())
        self.assertIn("Beras", error.exception.detail)

    def test_rejects_missing_planned_item(self):
        with self.assertRaises(HTTPException) as error:
            _validate_zero_qty_deviation(_po(), [
                SimpleNamespace(po_detail_id=1, qty_realisasi=Decimal("3.000")),
            ])

        self.assertIn("Telur", error.exception.detail)

    def test_rejects_item_from_another_purchase_order(self):
        with self.assertRaises(HTTPException) as error:
            _validate_zero_qty_deviation(_po(), [
                SimpleNamespace(po_detail_id=99, qty_realisasi=Decimal("1.000")),
            ])

        self.assertIn("bukan bagian dari PO", error.exception.detail)


if __name__ == "__main__":
    unittest.main()
