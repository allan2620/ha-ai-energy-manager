"""Pure-rule tests for coordinated energy advice; no device commands."""
import importlib.util
import unittest
from pathlib import Path
from datetime import datetime,timezone,timedelta
from types import SimpleNamespace

p=Path(__file__).resolve().parents[1]/"custom_components"/"ai_energy_manager"/"energy_strategy.py"
spec=importlib.util.spec_from_file_location("energy_strategy_test",p)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class CoordinationTests(unittest.TestCase):
    def setUp(self):
        self.now=datetime(2026,11,24,9,0,tzinfo=timezone.utc)
        self.hours=[{
            "time":(self.now+timedelta(hours=i)).isoformat(),
            "price":(1.3 if i%2==0 else 3.0),
            "outdoor":4,"wind":8,"action":"billig forvarmning",
            "pv_power_w":3200,"pv_energy_kwh":2.5
        } for i in range(48)]
    def test_unknown_presence_remains_unknown(self):
        self.assertEqual(mod.presence_state(None),"unknown")
        self.assertEqual(mod.presence_state(SimpleNamespace(entity_id="person.x",state="unavailable")),"unknown")
        self.assertEqual(mod.presence_state(SimpleNamespace(entity_id="person.x",state="not_home")),"away")
        self.assertEqual(mod.presence_state(SimpleNamespace(entity_id="person.x",state="home")),"home")
    def test_overheating_prevents_recommendation(self):
        plan=mod.coordinate_plan(self.hours,presence="home",room=21,
                                 room_target=20,nominal_load_w=700)
        self.assertTrue(plan[0]["overheating_risk"])
        self.assertIn("Undgå forvarmning",plan[0]["heat_advice"])
        self.assertEqual(plan[0]["estimated_surplus_w"],2500)
        self.assertTrue(all(h["suggested_only"] for h in plan))
    def test_without_load_no_surplus_invented(self):
        plan=mod.coordinate_plan(self.hours,presence="unknown",
                                 battery_soc=None,nominal_load_w=None)
        self.assertIsNone(plan[0]["estimated_surplus_w"])
        self.assertEqual(plan[0]["battery_advice"],"Ikke tilsluttet")
    def test_low_battery_prefers_storage_without_device_action(self):
        result=mod.coordinate_plan(self.hours,battery_soc=10,room=19,room_target=20)
        self.assertIn("Batteriet er lavt",result[0]["heat_advice"])
        self.assertEqual(result[0]["presence_now"],"unknown")
        self.assertTrue(result[0]["suggested_only"])

    def test_low_hotwater_is_never_scheduled_later(self):
        slot,reason=mod.suggested_hot_water_time(self.hours,42,48)
        self.assertIsNone(slot)
        self.assertIn("udsæt ikke",reason)
    def test_hotwater_temp_drop_observation(self):
        state={}
        mod.dhw_demand_update(state,self.now,55)
        out=mod.dhw_demand_update(state,self.now+timedelta(minutes=10),51)
        self.assertTrue(out["detected"])
        self.assertEqual(out["events"],1)
    def test_old_hotwater_patterns_expire(self):
        history={"dhw_event_log":[
            [self.now.timestamp()-10*86400, 8],
            [self.now.timestamp()-2*86400, 9]
        ]}
        result=mod.dhw_demand_update(history,self.now,None)
        self.assertEqual(result["events"],1)
        self.assertEqual(result["counts"][9],1)

    def test_no_bad_sample_learning(self):
        state={}
        mod.dhw_demand_update(state,self.now,55)
        out=mod.dhw_demand_update(state,self.now+timedelta(minutes=10),54.5)
        self.assertEqual(out["events"],0)

if __name__=="__main__":
    unittest.main()
