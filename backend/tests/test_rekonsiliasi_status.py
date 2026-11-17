import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from routers.rekonsiliasi_kas import _candidate_signals, _rank_candidates, _serialize_mutasi


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

    def test_candidate_matching_item_and_po_is_ranked_higher(self):
        mutasi = _mutasi()
        mutasi.deskripsi = "BB AYAM TGS"
        ayam = SimpleNamespace(
            id=4,
            nomor_transaksi="TRX-004",
            tanggal_belanja=date(2026, 11, 9),
            supplier_nama="",
            supplier=None,
            total=Decimal("10000"),
            details=[
                SimpleNamespace(
                    nama_item="Ayam Broiler",
                    item=None,
                    alokasi=[
                        SimpleNamespace(
                            po=SimpleNamespace(
                                nomor_po="PO-AYAM-01",
                                dapur=SimpleNamespace(nama="TGS"),
                            ),
                            po_detail=SimpleNamespace(
                                nama_item_raw="Ayam Broiler",
                                item=None,
                            ),
                        )
                    ],
                )
            ],
        )
        beras = SimpleNamespace(
            id=5,
            nomor_transaksi="TRX-005",
            tanggal_belanja=date(2026, 11, 9),
            supplier_nama="",
            supplier=None,
            total=Decimal("10000"),
            details=[
                SimpleNamespace(nama_item="Beras", item=None, alokasi=[]),
            ],
        )

        result = _rank_candidates(mutasi, [beras, ayam])

        self.assertEqual(result[0]["id"], ayam.id)
        self.assertGreater(result[0]["kemiripan_item"], result[1]["kemiripan_item"])
        self.assertEqual(result[0]["item_terkait"][0]["nomor_po"], "PO-AYAM-01")
        self.assertEqual(result[0]["kemiripan_lokasi_po"], 100)

        mutasi.deskripsi += " PO-AYAM-01"
        self.assertTrue(_candidate_signals(mutasi, ayam)["nomor_po_cocok"])


if __name__ == "__main__":
    unittest.main()
