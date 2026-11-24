"""Auto-detection regression tests: prefer exact IDs and protect manual settings."""
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace

base=Path(__file__).resolve().parents[1]/"custom_components"/"ai_energy_manager"
package=types.ModuleType("autodetect_test_package")
package.__path__=[str(base)]
sys.modules[package.__name__]=package
for name in ("const", "autodetect"):
    spec=importlib.util.spec_from_file_location(package.__name__+"."+name,base/(name+".py"))
    module=importlib.util.module_from_spec(spec)
    sys.modules[spec.name]=module
    spec.loader.exec_module(module)
const=sys.modules[package.__name__+".const"]
detect=sys.modules[package.__name__+".autodetect"]


def state(entity_id, status="20", name="", unit=None):
    if unit is None:
        if entity_id.startswith("sensor."):
            if "power" in entity_id or "consumption" in entity_id:
                unit = "W"
            elif "price" in entity_id:
                unit = "DKK/kWh"
    return SimpleNamespace(entity_id=entity_id, state=status, attributes={"friendly_name": name, "unit_of_measurement": unit})


class AutoDetectTests(unittest.TestCase):
    def test_exact_default_first(self):
        ids={"sensor.p1_meter_power":state("sensor.p1_meter_power"),
             "sensor.grid_power":state("sensor.grid_power"),
             "sensor.hp_power_consumption":state("sensor.hp_power_consumption")}
        found=detect.detect_entities(ids)
        self.assertEqual(found["grid"],"sensor.p1_meter_power")
        self.assertEqual(found["hp_power"],"sensor.hp_power_consumption")

    def test_keep_manual_selection(self):
        ids={"sensor.p1_meter_power":state("sensor.p1_meter_power"),
             "sensor.my_grid_power":state("sensor.my_grid_power")}
        values=detect.suggest_values(ids,{"grid":"sensor.my_grid_power"},refresh_missing=True)
        self.assertEqual(values["grid"],"sensor.my_grid_power")

    def test_replace_missing_only_after_confirmation_preview(self):
        ids={"sensor.p1_meter_power":state("sensor.p1_meter_power")}
        values=detect.suggest_values(ids,{"grid":"sensor.obsolete"},refresh_missing=True)
        self.assertEqual(values["grid"],"sensor.p1_meter_power")

    def test_no_unverified_heat_output(self):
        ids={"sensor.hp_power_consumption":state("sensor.hp_power_consumption")}
        found=detect.detect_entities(ids)
        self.assertNotIn("heat_output",found)

    def test_ambiguous_not_guessed(self):
        ids={"sensor.x_solar_power":state("sensor.x_solar_power"),
             "sensor.y_solar_power":state("sensor.y_solar_power")}
        found=detect.detect_entities(ids)
        self.assertNotIn("pv",found)

    def test_rebinding_room_disables_heating(self):
        ids = {
            "sensor.indoor_temperature": state(
                "sensor.indoor_temperature", unit="°C"
            )
        }
        settings = {
            "room": "sensor.obsolete_room",
            "room_verified": True,
            "write_heat": True,
            "write_water": True,
            "test_mode": False,
        }
        result = detect.suggest_values(ids, settings, refresh_missing=True)
        self.assertEqual(result["room"], "sensor.indoor_temperature")
        self.assertFalse(result["room_verified"])
        self.assertFalse(result["write_heat"])
        self.assertFalse(result["write_water"])
        self.assertTrue(result["test_mode"])

    def test_already_good_manual_flags_preserved(self):
        ids={"sensor.p1_meter_power":state("sensor.p1_meter_power")}
        values=detect.suggest_values(ids,{"room_verified":True,"write_heat":False,"test_mode":True},refresh_missing=True)
        self.assertTrue(values["room_verified"])
        self.assertFalse(values["write_heat"])
        self.assertTrue(values["test_mode"])


if __name__=="__main__":
    unittest.main()
