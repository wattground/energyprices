import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("build_negative_prices.py")
SPEC = importlib.util.spec_from_file_location("build_negative_prices", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SpreadIndexTests(unittest.TestCase):
    def test_top_bottom_indices(self):
        prices = list(range(24))
        self.assertEqual(MODULE.top_bottom_spread(prices, 1), 23)
        self.assertEqual(MODULE.top_bottom_spread(prices, 2), 44)
        self.assertEqual(MODULE.top_bottom_spread(prices, 4), 80)

    def test_bess_respects_chronology(self):
        prices = [100, 100] + [50] * 20 + [0, 0]
        self.assertEqual(MODULE.top_bottom_spread(prices, 2), 200)
        self.assertEqual(MODULE.bess_2h_dispatch_spread(prices, 1), 0)

    def test_second_equivalent_cycle_is_optional(self):
        prices = [0, 0, 100, 100, 0, 0, 100, 100] + [50] * 16
        self.assertEqual(MODULE.bess_2h_dispatch_spread(prices, 1), 200)
        self.assertEqual(MODULE.bess_2h_dispatch_spread(prices, 2), 400)

    def test_market_days_can_have_23_or_25_periods(self):
        self.assertIsNotNone(MODULE.daily_spread_indexes(list(range(23)))["tb4Spread"])
        self.assertIsNotNone(MODULE.daily_spread_indexes(list(range(25)))["tb4Spread"])
        self.assertIsNone(MODULE.daily_spread_indexes(list(range(22)))["tb1Spread"])


if __name__ == "__main__":
    unittest.main()
