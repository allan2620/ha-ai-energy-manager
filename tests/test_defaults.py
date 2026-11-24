"""Regression checks that installation is non-actuating by default."""
import importlib.util
import unittest
from pathlib import Path

const_path = (
    Path(__file__).resolve().parents[1] / "custom_components"
    / "ai_energy_manager" / "const.py"
)
spec = importlib.util.spec_from_file_location("ai_energy_test_const", const_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SafeDefaults(unittest.TestCase):
    def test_safe_install(self):
        c = module.DEFAULTS
        self.assertTrue(c["test_mode"])
        self.assertFalse(c["write_heat"])
        self.assertFalse(c["write_water"])
        self.assertFalse(c["room_verified"])

    def test_guard_limits(self):
        c = module.DEFAULTS
        self.assertGreater(c["start_w"], c["stop_w"])
        self.assertLessEqual(c["boost"], 1)
        self.assertLessEqual(c["maximum"], 25)
        self.assertGreaterEqual(c["min_boost_minutes"], 15)
        self.assertLessEqual(c["max_boost_minutes"], 360)

    def test_entity_configuration(self):
        c = module.DEFAULTS
        self.assertTrue(c["grid"].startswith("sensor."))
        self.assertTrue(c["weather_entity"].startswith("weather."))
        self.assertEqual(module.DOMAIN, "ai_energy_manager")
