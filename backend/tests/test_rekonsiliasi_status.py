import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from routers.rekonsiliasi_kas import _rank_candidates, _serialize_mutasi


def _mutasi(transaksi_id=None):
    return SimpleNamespace(
        id=1,
        tanggal=date(2026, 11, 9),
        waktu=None,
        deskripsi="Pembayaran bahan baku",
        jumlah=Decimal("10000"),
        saldo=None,
        sumber_sheet="Sheet1",
        transaksi_belanja_id=transaksi_id,
    )


class RekonsiliasiStatusTests(unittest.TestCase):
    def test_matched_mutation_status(self):
        result = _serialize_mutasi(_mutasi(3), {}, [])

        self.assertEqual(result["status_pencocokan"], "cocok")

    def test_unmatched_mutation_with_exact_amount_candidates(self):
        result = _serialize_mutasi(_mutasi(), {}, [{"id": 3}])

        self.assertEqual(result["status_pencocokan"], "belum_cocok")

    def test_unmatched_mutation_without_candidates(self):
        result = _serialize_mutasi(_mutasi(), {}, [])

        self.assertEqual(result["status_pencocokan"], "tidak_cocok")

    def test_candidates_are_ranked_by_reference_then_supplier_name(self):
        mutasi = _mutasi()
        mutasi.deskripsi = "Transfer Koperasi Makmur REF-2026-001"
        same_name = SimpleNamespace(
            id=1,
            nomor_transaksi="TRX-999",
            tanggal_belanja=date(2026, 11, 9),
            supplier_nama="Koperasi Makmur",
            supplier=None,
            total=Decimal("10000"),
        )
        matching_reference = SimpleNamespace(
            id=2,
            nomor_transaksi="REF-2026-001",
            tanggal_belanja=date(2026, 11, 20),
            supplier_nama="Supplier Lain",
            supplier=None,
            total=Decimal("10000"),
        )

        result = _rank_candidates(mutasi, [same_name, matching_reference])

        self.assertEqual([item["id"] for item in result], [2, 1])
        self.assertTrue(result[0]["nomor_referensi_cocok"])
        self.assertGreater(result[1]["kemiripan_nama"], result[0]["kemiripan_nama"])


if __name__ == "__main__":
    unittest.main()
