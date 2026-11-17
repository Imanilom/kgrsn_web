import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from database import Base
from routers.belanja import _validate_belanja_allocations, create_belanja


class BelanjaAllocationValidationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        dapur = models.Dapur(kode="D-TEST", nama="Dapur Test")
        self.db.add(dapur)
        self.db.flush()
        po = models.PurchaseOrder(
            nomor_po="PO-TEST",
            dapur_id=dapur.id,
            tanggal_po=date(2026, 11, 9),
        )
        self.db.add(po)
        self.db.flush()
        self.po_detail = models.PODetail(
            po_id=po.id,
            nama_item_raw="Beras",
            qty=Decimal("5.000"),
            harga_satuan=Decimal("1000"),
        )
        self.db.add(self.po_detail)
        self.db.commit()
        self.po_id = po.id

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _detail(self, qty_beli, qty_alokasi):
        return {
            "nama_item": "Beras",
            "qty_beli": qty_beli,
            "harga_satuan": "1000",
            "alokasi": [{
                "po_id": self.po_id,
                "po_detail_id": self.po_detail.id,
                "qty_alokasi": qty_alokasi,
            }],
        }

    def _existing_transaction(self, qty):
        transaction = models.TransaksiBelanja(
            nomor_transaksi="BLJ-TEST",
            tanggal_belanja=date(2026, 11, 9),
            total=Decimal(str(qty)) * Decimal("1000"),
        )
        self.db.add(transaction)
        self.db.flush()
        detail = models.TransaksiBelanjDetail(
            transaksi_id=transaction.id,
            nama_item="Beras",
            qty_beli=Decimal(str(qty)),
            harga_satuan=Decimal("1000"),
            subtotal=Decimal(str(qty)) * Decimal("1000"),
        )
        self.db.add(detail)
        self.db.flush()
        self.db.add(models.BelanjaPOAlokasi(
            detail_id=detail.id,
            po_id=self.po_id,
            po_detail_id=self.po_detail.id,
            qty_alokasi=Decimal(str(qty)),
            harga_satuan=Decimal("1000"),
            subtotal=Decimal(str(qty)) * Decimal("1000"),
        ))
        self.db.commit()
        return transaction.id

    def test_rejects_allocation_above_purchased_quantity(self):
        with self.assertRaises(HTTPException) as error:
            _validate_belanja_allocations(self.db, [self._detail("2", "3")])

        self.assertIn("melebihi qty beli", error.exception.detail)

    def test_rejects_allocation_above_remaining_po_quantity(self):
        self._existing_transaction(Decimal("3"))

        with self.assertRaises(HTTPException) as error:
            _validate_belanja_allocations(self.db, [self._detail("3", "3")])

        self.assertIn("sisa 2", error.exception.detail)

    def test_update_does_not_count_its_old_allocation_twice(self):
        transaction_id = self._existing_transaction(Decimal("3"))

        _validate_belanja_allocations(
            self.db,
            [self._detail("5", "5")],
            transaksi_id=transaction_id,
        )

    def test_create_splits_items_into_transactions_by_supplier(self):
        first_supplier = models.Supplier(kode="SUP-1", nama="Supplier Satu")
        second_supplier = models.Supplier(kode="SUP-2", nama="Supplier Dua")
        self.db.add_all([first_supplier, second_supplier])
        self.db.commit()

        result = create_belanja({
            "tanggal_belanja": "2026-11-09",
            "is_lunas": True,
            "details": [
                {"nama_item": "Beras", "qty_beli": 1, "harga_satuan": 1000, "supplier_id": first_supplier.id},
                {"nama_item": "Telur", "qty_beli": 2, "harga_satuan": 500, "supplier_id": second_supplier.id},
            ],
        }, self.db, SimpleNamespace(id=None))

        self.assertEqual(len(result["transactions"]), 2)
        self.assertEqual({transaction["supplier_id"] for transaction in result["transactions"]}, {
            first_supplier.id,
            second_supplier.id,
        })
        self.assertEqual(result["total"], 2000)


if __name__ == "__main__":
    unittest.main()
