"""Tests for time-resolved Forecast.Solar adapter and conservative planning."""
import importlib.util
import sys
import types
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path

if "homeassistant.util.dt" not in sys.modules:
    ha = types.ModuleType("homeassistant")
    util = types.ModuleType("homeassistant.util")
    dt = types.ModuleType("homeassistant.util.dt")
    dt.UTC = timezone.utc
    def parse_datetime(value):
        try:
            return datetime.fromisoformat(value)
        except (ValueError, TypeError):
            return None
    dt.parse_datetime = parse_datetime
    sys.modules["homeassistant"] = ha
    sys.modules["homeassistant.util"] = util
    sys.modules["homeassistant.util.dt"] = dt

# Import from the module without importing Home Assistant itself.
root = Path(__file__).resolve().parents[1] / "custom_components" / "ai_energy_manager"
spec_planner = importlib.util.spec_from_file_location("test_forecast_planner", root / "planner.py")
planner = importlib.util.module_from_spec(spec_planner)
spec_planner.loader.exec_module(planner)
# Relative import in pv_forecast.py needs a fake package.
package = types.ModuleType("ai_energy_test_pkg")
package.__path__ = [str(root)]
sys.modules["ai_energy_test_pkg"] = package
sys.modules["ai_energy_test_pkg.planner"] = planner
spec = importlib.util.spec_from_file_location("ai_energy_test_pkg.pv_forecast", root / "pv_forecast.py")
pv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pv)


class SolarForecastTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 24, 8, 30, tzinfo=timezone.utc)

    def test_parses_hourly_solar_forecast(self):
        response = {
            "watts": {
                "2026-11-24T10:00:00+01:00": 1200,
                "2026-11-24T11:00:00+01:00": 1700,
                "invalid": 900,
            },
            "wh_period": {
                "2026-11-24T10:00:00+01:00": 1100,
                "2026-11-24T11:00:00+01:00": 1650,
            },
        }
        result = pv.parse_pv_forecast(response, self.now)
        self.assertEqual(len(result), 2)
        nine_utc = datetime(2026, 11, 24, 9, tzinfo=timezone.utc)
        self.assertEqual(result[nine_utc]["pv_power_w"], 1200)
        self.assertEqual(result[nine_utc]["pv_energy_kwh"], 1.1)

    def test_missing_forecast_not_fabricated(self):
        self.assertEqual(pv.parse_pv_forecast({}, self.now), {})
        self.assertEqual(pv.parse_pv_forecast({"watts": {"invalid": 1}}, self.now), {})

    def test_pv_in_plan_remains_advisory(self):
        start = self.now.replace(minute=0)
        solar = {start+timedelta(hours=2): {"pv_power_w": 3200, "pv_energy_kwh": 2.8}}
        prices = {start+timedelta(hours=i): 2.8 for i in range(48)}
        weather = {start+timedelta(hours=i): {"temperature": 0, "wind": None} for i in range(48)}
        result = planner.make_plan(self.now, prices, weather, 2.8, 0, 20, pv=solar)
        self.assertEqual(result["pv_hours"], 1)
        self.assertEqual(result["hours"][2]["pv_energy_kwh"], 2.8)
        self.assertEqual(result["hours"][2]["action"], "solforvarmning (forslag)")
        self.assertFalse(result["hours"][2]["automatic"])


if __name__ == "__main__":
    unittest.main()
