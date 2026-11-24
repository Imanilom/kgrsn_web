import unittest
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from database import Base, migrate_mutasi_kas_links
from routers.rekonsiliasi_kas import cari_kandidat_transaksi, cocokkan_mutasi


class RekonsiliasiManyToManyTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _transaction(self, number, supplier, total):
        transaction = models.TransaksiBelanja(
            nomor_transaksi=number,
            tanggal_belanja=date(2026, 11, 9),
            supplier_nama=supplier,
            total=Decimal(str(total)),
        )
        self.db.add(transaction)
        self.db.flush()
        return transaction

    def _mutasi(self, amount):
        mutasi = models.MutasiKas(
            tanggal=date(2026, 11, 9),
            deskripsi="Transfer supplier",
            jumlah=Decimal(str(amount)),
            fingerprint=f"fingerprint-{amount}-{self.db.query(models.MutasiKas).count()}",
        )
        self.db.add(mutasi)
        self.db.commit()
        return mutasi

    def _match(self, mutasi, transaction_ids):
        return cocokkan_mutasi(
            mutasi.id,
            {"transaksi_belanja_ids": transaction_ids},
            self.db,
            object(),
        )

    def test_one_transfer_can_match_multiple_same_supplier_transactions_with_difference(self):
        first = self._transaction("TRX-1", "Supplier A", 600)
        second = self._transaction("TRX-2", "Supplier A", 500)
        mutasi = self._mutasi(1000)

        result = self._match(mutasi, [first.id, second.id])

        self.assertEqual(len(result["transaksi_belanja"]), 2)
        self.assertEqual(
            self.db.query(models.MutasiKasTransaksi)
            .filter_by(mutasi_kas_id=mutasi.id).count(),
            2,
        )

    def test_one_transaction_can_match_multiple_transfers(self):
        transaction = self._transaction("TRX-1", "Supplier A", 1000)
        first_mutasi = self._mutasi(600)
        second_mutasi = self._mutasi(400)

        self._match(first_mutasi, [transaction.id])
        self._match(second_mutasi, [transaction.id])

        self.assertEqual(
            self.db.query(models.MutasiKasTransaksi)
            .filter_by(transaksi_belanja_id=transaction.id).count(),
            2,
        )

    def test_rejects_multiple_suppliers(self):
        first = self._transaction("TRX-1", "Supplier A", 600)
        second = self._transaction("TRX-2", "Supplier B", 500)
        mutasi = self._mutasi(1000)

        with self.assertRaises(HTTPException) as error:
            self._match(mutasi, [first.id, second.id])

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(
            self.db.query(models.MutasiKasTransaksi)
            .filter_by(mutasi_kas_id=mutasi.id).count(),
            0,
        )

    def test_migration_copies_existing_legacy_match(self):
        transaction = self._transaction("TRX-OLD", "Supplier A", 1000)
        mutasi = models.MutasiKas(
            tanggal=date(2026, 11, 9),
            deskripsi="Transfer supplier",
            jumlah=Decimal("1000"),
            fingerprint="legacy-fingerprint",
            transaksi_belanja_id=transaction.id,
        )
        self.db.add(mutasi)
        self.db.commit()

        with self.engine.begin() as connection:
            migrate_mutasi_kas_links(connection)

        link = self.db.query(models.MutasiKasTransaksi).one()
        self.assertEqual(link.mutasi_kas_id, mutasi.id)
        self.assertEqual(link.transaksi_belanja_id, transaction.id)

    def test_candidate_search_finds_transactions_by_supplier_not_amount(self):
        matching = self._transaction("TRX-SEARCH", "Supplier Dicari", 1250)
        self._transaction("TRX-OTHER", "Supplier Lain", 1000)
        mutasi = self._mutasi(1000)

        candidates = cari_kandidat_transaksi(
            mutasi.id,
            "Dicari",
            self.db,
            object(),
        )

        self.assertEqual([candidate["id"] for candidate in candidates], [matching.id])
        self.assertEqual(candidates[0]["selisih_nominal"], 250)


if __name__ == "__main__":
    unittest.main()
