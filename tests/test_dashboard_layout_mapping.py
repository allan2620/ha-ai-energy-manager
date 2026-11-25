"""Validate persisted layout sensors without importing Home Assistant."""
import ast
import copy
import re
import unittest
from pathlib import Path

FILE=Path(__file__).resolve().parents[1]/"custom_components"/"ai_energy_manager"/"dashboard_api.py"
SOURCE=ast.parse(FILE.read_text(encoding="utf-8"))
allowed_names={"ALLOWED_GROUPS","ALLOWED_COLORS","ENTITY_PATTERN",
               "DISPLAY_SENSOR_IDS","DISPLAY_KEYS","MAX_SENSOR_OVERRIDES","MAX_LABEL"}
selected=[]
for node in SOURCE.body:
    if isinstance(node,ast.Assign):
        if any(isinstance(target,ast.Name) and target.id in allowed_names for target in node.targets):
            selected.append(node)
    elif isinstance(node,ast.FunctionDef) and node.name in ("default_layout","validate_layout"):
        selected.append(node)
NS={"re":re}
exec(compile(ast.fix_missing_locations(ast.Module(body=selected,type_ignores=[])),
             "<dashboard_api>", "exec"), NS)
validate=NS["validate_layout"]
defaults=NS["default_layout"]


class DashboardLayoutTests(unittest.TestCase):
    def test_old_kpi_overrides_continue_to_load(self):
        layout=defaults()
        layout["sensors"]={"solar":"sensor.legacy_solar","grid":"sensor.legacy_grid"}
        self.assertEqual(validate(layout)["sensors"],layout["sensors"])

    def test_full_dashboard_mapping_is_saved(self):
        layout=defaults()
        ids=list(NS["DISPLAY_SENSOR_IDS"])
        layout["sensors"]={source:"sensor.my_custom_"+str(i) for i,source in enumerate(ids)}
        layout["sensors"]["hp"]="sensor.my_hp"
        result=validate(layout)
        self.assertEqual(result["sensors"],layout["sensors"])
        self.assertGreaterEqual(len(ids),45)

    def test_unexpected_key_is_rejected(self):
        layout=defaults()
        layout["sensors"]["write_heat"]="sensor.my_hp"
        with self.assertRaises(ValueError):
            validate(layout)

    def test_invalid_entity_id_is_rejected(self):
        layout=defaults()
        layout["sensors"]["sensor.p1_meter_power"]="<script>"
        with self.assertRaises(ValueError):
            validate(layout)

    def test_saved_layout_keeps_other_preferences(self):
        layout=defaults()
        layout["title"]="Mit energi-dashboard"
        layout["accent"]="forest"
        layout["groups"]["kpi"]=list(reversed(layout["groups"]["kpi"]))
        layout["hidden"]=["price"]
        layout["labels"]={"solar":"Mine solceller"}
        layout["sensors"]={"sensor.hp_power_consumption":"sensor.my_hp"}
        self.assertEqual(validate(layout),layout)


if __name__=="__main__":
    unittest.main()
