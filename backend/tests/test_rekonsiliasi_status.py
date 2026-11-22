import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from routers.rekonsiliasi_kas import (
    _auto_match_pairs,
    _candidate_signals,
    _rank_candidates,
    _serialize_mutasi,
    _transaction_in_mutasi_period,
)


def _mutasi(transaksi_id=None):
    return SimpleNamespace(
        id=1,
        tanggal=date(2026, 11, 9),
        waktu=None,
        deskripsi="Pembayaran bahan baku",
        jumlah=Decimal("10000"),
        saldo=None,
        sumber_sheet="Sheet1",
        jenis="debit",
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

    def test_credit_is_not_treated_as_an_unmatched_expense(self):
        mutasi = _mutasi()
        mutasi.jenis = "kredit"

        result = _serialize_mutasi(mutasi, {}, [])

        self.assertEqual(result["status_pencocokan"], "arus_masuk")

    def test_duplicate_amount_and_recipient_pairs_match_one_to_one(self):
        mutasis = [_mutasi(), _mutasi()]
        mutasis[0].id = 1
        mutasis[1].id = 2
        mutasis[0].deskripsi = "OCTOmobile TO APIPAH"
        mutasis[1].deskripsi = "Transfer APIPAH"
        transactions = [
            SimpleNamespace(
                id=11,
                tanggal_belanja=date(2026, 11, 9),
                supplier_nama="Apipah",
                supplier=None,
                total=Decimal("10000"),
            ),
            SimpleNamespace(
                id=12,
                tanggal_belanja=date(2026, 11, 10),
                supplier_nama="APIPAH",
                supplier=None,
                total=Decimal("10000"),
            ),
        ]

        pairs = _auto_match_pairs(mutasis, transactions)

        self.assertEqual([(mutasi.id, transaksi.id) for mutasi, transaksi in pairs], [(1, 11), (2, 12)])

    def test_automatic_match_skips_ambiguous_or_unequal_groups(self):
        mutasi = _mutasi()
        mutasi.deskripsi = "Transfer CV Makmur"
        transactions = [
            SimpleNamespace(
                id=11,
                tanggal_belanja=date(2026, 11, 9),
                supplier_nama="CV Makmur",
                supplier=None,
                total=Decimal("10000"),
            ),
            SimpleNamespace(
                id=12,
                tanggal_belanja=date(2026, 11, 10),
                supplier_nama="Makmur",
                supplier=None,
                total=Decimal("10000"),
            ),
        ]

        self.assertEqual(_auto_match_pairs([mutasi], transactions), [])
        unmatched_duplicate = _mutasi()
        unmatched_duplicate.id = 2
        unmatched_duplicate.deskripsi = "Transfer CV Makmur"
        self.assertEqual(
            _auto_match_pairs([mutasi, unmatched_duplicate], transactions[:1]),
            [],
        )

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

    def test_candidate_must_follow_mutasi_sunday_saturday_period(self):
        mutasi = _mutasi()
        mutasi.tanggal = date(2026, 11, 11)
        inside = SimpleNamespace(
            id=21,
            nomor_transaksi="TRX-IN",
            tanggal_belanja=date(2026, 11, 10),
            supplier_nama="",
            supplier=None,
            total=Decimal("10000"),
            details=[
                SimpleNamespace(
                    nama_item="Ayam",
                    nama_item_raw="Ayam",
                    item=None,
                    qty_beli=Decimal("2"),
                    harga_satuan=Decimal("5000"),
                    subtotal=Decimal("10000"),
                    satuan="kg",
                    alokasi=[
                        SimpleNamespace(
                            po=SimpleNamespace(
                                nomor_po="PO-IN",
                                tanggal_po=date(2026, 11, 9),
                                dapur=SimpleNamespace(nama="TGS"),
                            ),
                            po_detail=SimpleNamespace(nama_item_raw="Ayam", item=None),
                            qty_alokasi=Decimal("2"),
                            subtotal=Decimal("10000"),
                        )
                    ],
                )
            ],
        )
        outside = SimpleNamespace(
            id=22,
            nomor_transaksi="TRX-OUT",
            tanggal_belanja=date(2026, 11, 10),
            supplier_nama="",
            supplier=None,
            total=Decimal("10000"),
            details=[
                SimpleNamespace(
                    nama_item="Ayam",
                    nama_item_raw="Ayam",
                    item=None,
                    qty_beli=Decimal("2"),
                    harga_satuan=Decimal("5000"),
                    subtotal=Decimal("10000"),
                    satuan="kg",
                    alokasi=[
                        SimpleNamespace(
                            po=SimpleNamespace(
                                nomor_po="PO-OUT",
                                tanggal_po=date(2026, 11, 16),
                                dapur=SimpleNamespace(nama="TGS"),
                            ),
                            po_detail=SimpleNamespace(nama_item_raw="Ayam", item=None),
                            qty_alokasi=Decimal("2"),
                            subtotal=Decimal("10000"),
                        )
                    ],
                )
            ],
        )

        self.assertTrue(_transaction_in_mutasi_period(mutasi, inside))
        self.assertFalse(_transaction_in_mutasi_period(mutasi, outside))
        result = _rank_candidates(mutasi, [outside, inside])
        self.assertEqual([item["id"] for item in result], [inside.id])
        self.assertEqual(result[0]["nominal_per_po"][0]["subtotal"], 10000)


if __name__ == "__main__":
    unittest.main()
