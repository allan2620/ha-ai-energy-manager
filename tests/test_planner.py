"""Planner unit tests runnable without a full Home Assistant installation."""
import importlib.util
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ha = types.ModuleType("homeassistant")
util = types.ModuleType("homeassistant.util")
dt = types.ModuleType("homeassistant.util.dt")
dt.UTC = timezone.utc
dt.parse_datetime = datetime.fromisoformat
sys.modules["homeassistant"] = ha
sys.modules["homeassistant.util"] = util
sys.modules["homeassistant.util.dt"] = dt

path = Path(__file__).resolve().parents[1] / "custom_components" / "ai_energy_manager" / "planner.py"
spec = importlib.util.spec_from_file_location("ai_energy_test_planner", path)
planner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(planner)


class FakePrice:
    def __init__(self, rows):
        self.attributes = {"raw_today": rows, "raw_tomorrow": []}


class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 24, 12, 30, tzinfo=timezone.utc)

    def test_missing_data_not_fabricated(self):
        plan = planner.make_plan(
            self.now, {}, {}, None, None, 20.0
        )
        self.assertEqual(len(plan["hours"]), 48)
        self.assertEqual(plan["price_hours"], 0)
        self.assertEqual(plan["weather_hours"], 0)
        self.assertEqual(plan["hours"][4]["action"], "afventer data")
        self.assertIsNone(plan["hours"][4]["price"])

    def test_timestamped_prices(self):
        prices = planner.price_slots(
            FakePrice([{"hour": "2026-11-24T14:00:00+01:00", "price": 1.75},
                       {"hour": "broken", "price": 99}]),
            self.now,
        )
        self.assertEqual(prices[datetime(2026, 11, 24, 13, tzinfo=timezone.utc)], 1.75)
        self.assertEqual(len(prices), 1)

    def test_plan_has_advisory_actions_only(self):
        hour = self.now.replace(minute=0)
        prices = {hour + timedelta(hours=i): 1.5 for i in range(48)}
        temps = {hour + timedelta(hours=i): {"temperature": 0, "wind": 3}
                 for i in range(48)}
        plan = planner.make_plan(
            self.now, prices, temps, 1.5, 0, 20,
            allowed=True, cheap_limit=2.3, boost=0.5,
        )
        self.assertEqual(plan["price_hours"], 48)
        self.assertEqual(plan["weather_hours"], 48)
        self.assertEqual(plan["hours"][0]["action"], "billig forvarmning")
        self.assertTrue(all(not x["automatic"] for x in plan["hours"]))

    def test_weather_from_hourly(self):
        hours = planner.weather_slots([
            {"datetime": "2026-11-24T13:00:00+00:00", "temperature": 0.1, "wind_speed": 3.4}
        ], self.now)
        self.assertEqual(len(hours), 1)
        self.assertEqual(list(hours.values())[0]["temperature"], 0.1)


if __name__ == "__main__":
    unittest.main()
