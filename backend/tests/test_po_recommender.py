import unittest
from datetime import date, timedelta
from decimal import Decimal

from services.po_recommender import (
    cap_recommendations,
    convert_quantity,
    predict_item_quantity,
)


class PORecommenderTests(unittest.TestCase):
    def test_uses_random_forest_when_history_is_sufficient(self):
        start = date(2026, 1, 1)
        history = [
            {
                "tanggal": start + timedelta(days=index),
                "pm_kecil": 900 + index * 10,
                "pm_besar": 100,
                "qty": 80 + index,
            }
            for index in range(14)
        ]

        result = predict_item_quantity(history, 1000, 100, date(2026, 1, 20))

        self.assertEqual(result["source"], "random_forest")
        self.assertEqual(result["observations"], 14)
        self.assertGreaterEqual(result["qty"], 0)

    def test_uses_weighted_history_below_model_threshold(self):
        history = [
            {"tanggal": date(2026, 1, 1), "pm_kecil": 100, "pm_besar": 0, "qty": 10},
            {"tanggal": date(2026, 1, 1), "pm_kecil": 100, "pm_besar": 0, "qty": 50},
        ]

        result = predict_item_quantity(history, 100, 0, date(2026, 1, 1))

        self.assertEqual(result["source"], "riwayat_berbobot")
        self.assertEqual(result["qty"], 10)

    def test_preserves_current_quantity_without_history(self):
        result = predict_item_quantity([], 100, 0, date(2026, 1, 1), current_qty=4.5)

        self.assertEqual(result["source"], "qty_saat_ini")
        self.assertEqual(result["qty"], 4.5)

    def test_scales_recommendations_to_available_budget(self):
        result = cap_recommendations([
            {"key": "a", "qty": 5, "unit_price": 10000, "satuan": "kg"},
            {"key": "b", "qty": 3, "unit_price": 10000, "satuan": "kg"},
        ], 40000)

        self.assertTrue(result["budget_limited"])
        self.assertLessEqual(result["recommended_total"], Decimal("40000"))
        self.assertEqual(result["recommended_total"], Decimal("40000.000"))

    def test_converts_common_weight_units(self):
        result = convert_quantity(500, "g", "kg")

        self.assertEqual(result, Decimal("0.500"))


if __name__ == "__main__":
    unittest.main()