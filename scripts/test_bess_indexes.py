import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("build_negative_prices.py")
SPEC = importlib.util.spec_from_file_location("build_negative_prices", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SpreadIndexTests(unittest.TestCase):
    def assert_valid_plan(self, prices, plan, discharge_limit):
        margin, actions = plan
        self.assertEqual(len(actions), len(prices))
        state_of_charge = 0
        discharged = 0
        calculated_margin = 0
        for price, action in zip(prices, actions):
            self.assertIn(action, (-1, 0, 1))
            state_of_charge -= action
            self.assertGreaterEqual(state_of_charge, 0)
            self.assertLessEqual(state_of_charge, 2)
            if action == 1:
                discharged += 1
            calculated_margin += price * action
        self.assertEqual(state_of_charge, 0)
        self.assertLessEqual(discharged, discharge_limit)
        self.assertEqual(calculated_margin, margin)

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
        one_cycle, two_cycles = MODULE.bess_2h_dispatch_plans(prices)
        self.assert_valid_plan(prices, one_cycle, 2)
        self.assert_valid_plan(prices, two_cycles, 4)
        self.assertEqual(one_cycle[1].count(-1), 2)
        self.assertEqual(one_cycle[1].count(1), 2)
        self.assertEqual(two_cycles[1].count(-1), 4)
        self.assertEqual(two_cycles[1].count(1), 4)

    def test_unprofitable_dispatch_stays_idle(self):
        prices = list(range(100, 76, -1))
        one_cycle, two_cycles = MODULE.bess_2h_dispatch_plans(prices)
        self.assertEqual(one_cycle, (0.0, (0,) * 24))
        self.assertEqual(two_cycles, (0.0, (0,) * 24))

    def test_market_days_can_have_23_or_25_periods(self):
        self.assertIsNotNone(MODULE.daily_spread_indexes(list(range(23)))["tb4Spread"])
        self.assertIsNotNone(MODULE.daily_spread_indexes(list(range(25)))["tb4Spread"])
        self.assertIsNone(MODULE.daily_spread_indexes(list(range(22)))["tb1Spread"])


if __name__ == "__main__":
    unittest.main()
