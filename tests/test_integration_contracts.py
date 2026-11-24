"""Contract checks for config flow, translations, and measurement safety."""
import ast
import asyncio
import json
import math
import re
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT=Path(__file__).resolve().parents[1]/"custom_components"/"ai_energy_manager"


class MeasurementSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tree=ast.parse((ROOT/"engine.py").read_text(encoding="utf-8"))
        engine=next(x for x in tree.body if isinstance(x,ast.ClassDef) and x.name=="Engine")
        method=next(x for x in engine.body if isinstance(x,ast.FunctionDef) and x.name=="num")
        module=ast.Module(body=[method], type_ignores=[])
        namespace={"math":math}
        exec(compile(ast.fix_missing_locations(module),"<engine.num>","exec"),namespace)
        cls.func=staticmethod(namespace["num"])

    def reading(self, key, value, unit):
        class Probe:
            def state(self, _key):
                return SimpleNamespace(state=value, attributes={"unit_of_measurement":unit})
        return self.func(Probe(),key)

    def test_power_conversion(self):
        self.assertEqual(self.reading("hp_power","2.4","kW"),2400)
        self.assertEqual(self.reading("hp_power","2400","W"),2400)

    def test_invalid_temperature_unit_is_blocked(self):
        self.assertIsNone(self.reading("room","21","°F"))
        self.assertIsNone(self.reading("room","12","kWh"))
        self.assertEqual(self.reading("room","21","°C"),21)

    def test_out_of_range_and_negative_power(self):
        self.assertIsNone(self.reading("pv","-200","W"))
        self.assertIsNone(self.reading("room","120","°C"))
        self.assertIsNone(self.reading("water","500","°C"))

    def test_valid_negative_price(self):
        self.assertEqual(self.reading("price","-0.21","DKK/kWh"),-0.21)
        self.assertIsNone(self.reading("price","-0.21","EUR/kWh"))
        self.assertIsNone(self.reading("price","nan","DKK/kWh"))


class TranslationContracts(unittest.TestCase):
    def test_all_setup_fields_have_labels(self):
        spec=ast.parse((ROOT/"const.py").read_text(encoding="utf-8"))
        keys=next(node.value for node in spec.body if isinstance(node,ast.Assign)
            and any(isinstance(t,ast.Name) and t.id=="DEFAULTS" for t in node.targets))
        names={x.value for x in keys.keys}
        for language in ("strings.json","translations/da.json","translations/en.json"):
            data=json.loads((ROOT/language).read_text(encoding="utf-8"))
            self.assertEqual(set(data["config"]["step"]["user"]["data"]),names)
            for step in ("edit","autodetect"):
                self.assertEqual(set(data["options"]["step"][step]["data"]),names)
            self.assertEqual(
                set(data["options"]["step"]["init"]["menu_options"]),
                {"edit","autodetect"},
            )

    def test_manifest_version_and_flow_contract(self):
        manifest=json.loads((ROOT/"manifest.json").read_text(encoding="utf-8"))
        self.assertTrue(manifest["config_flow"])
        flow=(ROOT/"config_flow.py").read_text(encoding="utf-8")
        self.assertIn("EntitySelector",flow)
        self.assertIn("ConfigEntrySelector",flow)
        self.assertIn("async_step_autodetect",flow)

    def test_no_live_commands_from_simulation(self):
        js=(ROOT/"frontend"/"ai-energy-panel.js").read_text(encoding="utf-8")
        self.assertIn('if(this.demo)return;',js)
        self.assertIn('disabled',js)


class MigrationContracts(unittest.TestCase):
    def test_v1_to_v2_preserves_data_and_options(self):
        root=ast.parse((ROOT/"__init__.py").read_text(encoding="utf-8"))
        func=next(x for x in root.body if isinstance(x,ast.AsyncFunctionDef)
                  and x.name=="async_migrate_entry")
        namespace={}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[func],type_ignores=[])),
                     "<migration>","exec"),namespace)
        entry=SimpleNamespace(version=1,data={"room":"sensor.mine"},options={"test_mode":True})
        class Manager:
            def async_update_entry(self,entry,**kwargs):
                entry.version=kwargs["version"]
        hass=SimpleNamespace(config_entries=Manager())
        self.assertTrue(asyncio.run(namespace["async_migrate_entry"](hass,entry)))
        self.assertEqual(entry.version,2)
        self.assertEqual(entry.data["room"],"sensor.mine")
        self.assertEqual(entry.options["test_mode"],True)


if __name__=="__main__":
    unittest.main()
