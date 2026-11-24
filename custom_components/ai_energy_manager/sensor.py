from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from .const import DOMAIN
async def async_setup_entry(hass,entry,async_add_entities):
    engine=hass.data[DOMAIN][entry.entry_id]
    async_add_entities([Metric(engine,entry.entry_id,k,n,u) for k,n,u in [("status","Status",None),("export","Eksport","W"),("pv","Solproduktion","W"),("hp_power","IVT effekt","W"),("target","Anbefalet rumsetpunkt","°C"),("price","Elpris","DKK/kWh"),("room","Rumtemperatur","°C"),("water","Varmtvand","°C"),("forecast_low","Prognose minimum","°C"),("cooling_rate","Observeret afkøling","°C/h"),("nilan","Nilan status",None)]])
class Metric(CoordinatorEntity,SensorEntity):
    _attr_has_entity_name=True
    def __init__(self,engine,eid,key,name,unit):
        super().__init__(engine); self.key=key; self._attr_name=name; self._attr_unique_id=eid+key; self._attr_native_unit_of_measurement=unit
        self._attr_device_info={"identifiers":{(DOMAIN,eid)},"name":"AI Energy Manager","manufacturer":"Local Energy"}
    @property
    def native_value(self): return self.coordinator.data.get(self.key)
    @property
    def extra_state_attributes(self):
        return {"beslutninger":self.coordinator.data.get("log"),"manuel_pause":self.coordinator.data.get("manual_hold"),"fejl":self.coordinator.data.get("faults",[])} if self.key=="status" else None
