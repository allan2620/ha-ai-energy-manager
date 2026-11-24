"""AI Energy Manager 2.0: self-contained diagnostic and forecast sensors."""
from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from .const import DOMAIN

METRICS = [
    ("status","Status",None), ("export","Eksport","W"),
    ("pv","Solproduktion","W"), ("hp_power","IVT effekt","W"),
    ("target","Anbefalet rumsetpunkt","°C"),
    ("price","Elpris","DKK/kWh"), ("room","Rumtemperatur","°C"),
    ("water","Varmtvand","°C"), ("forecast_low","Prognose minimum","°C"),
    ("cooling_rate","Observeret afkøling","°C/h"),
    ("nilan","Nilan status",None),
    ("price_hours","Prisprognose timer","h"),
    ("weather_hours","Vejrprognose timer","h"),
    ("suggested_heat_hours","Foreslåede varmetimer","h"),
    ("mode","Energiprofil",None),
    ("plan_note","Prognosebeskrivelse",None),
    ("test_mode","Testtilstand",None),
    ("cooldown","Kompressor reguleringspause",None),
    ("dhw_suggestion","Anbefaler ekstra varmtvand",None),
    ("nilan_cooling","Nilan køling aktiv",None),
    ("plan","Plan næste 48 timer",None),
    ("pv_forecast_status","PV prognose status",None),
    ("pv_forecast_hours","PV prognose timer","h"),
    ("pv_today_remaining_kwh","PV rest i dag","kWh"),
    ("pv_tomorrow_kwh","PV i morgen","kWh"),
    ("pv_peak_w","PV forventet top","W"),
    ("cop","COP målt",None),
    ("budget_24","Budget 24 timer ved konstant belastning","DKK"),
    ("predictive_preheat","Forvarmning før dyr strøm",None),
    ("dhw_slot","Foreslået varmtvandstid",None),
    ("dhw_reason","Begrundelse for varmtvandsplan",None),
    ("presence","Tilstedeværelse",None),
    ("battery_soc","Batteristand","%"),
    ("battery_power_w","Batterieffekt","W"),
    ("house_load_w","Målt husforbrug","W"),
    ("surplus_basis","Grundlag for soloverskud",None),
    ("thermal_warning","Risiko for ekstra solopvarmning",None),
    ("dhw_demand_events","Observerede varmtvandstemperaturfald",None),
]

async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([
        Metric(coordinator, entry.entry_id, key, name, unit)
        for key, name, unit in METRICS
    ])

class Metric(CoordinatorEntity, SensorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator, entry_id, key, name, unit):
        super().__init__(coordinator)
        self.key = key
        self._attr_name = name
        self._attr_unique_id = entry_id + key
        self._attr_native_unit_of_measurement = unit
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry_id)},
            "name": "AI Energy Manager", "manufacturer": "Local Energy",
        }

    @property
    def native_value(self):
        data = self.coordinator.data or {}
        if self.key == "plan":
            return f"{data.get('price_hours', 0)}/48 priser"
        value = data.get(self.key)
        if isinstance(value, bool):
            return "Til" if value else "Fra"
        return value

    @property
    def extra_state_attributes(self):
        data = self.coordinator.data or {}
        if self.key == "status":
            return {
                "beslutninger": data.get("log", []),
                "manuel_pause": data.get("manual_hold", False),
                "fejl": data.get("faults", []),
                "testtilstand": data.get("test_mode", True),
                "kompressor_pause": data.get("cooldown", False),
                "energiprofil": data.get("mode", "normal"),
                "ekstra_varmtvand_foreslået": data.get("dhw_suggestion", False),
                "plan_timer_med_pris": data.get("price_hours", 0),
                "plan_timer_med_vejr": data.get("weather_hours", 0),
                "plan_timer_med_pv": data.get("pv_forecast_hours", 0),
                "pv_prognose_status": data.get("pv_forecast_status"),
                "tilstedeværelse": data.get("presence", "unknown"),
                "batteristand": data.get("battery_soc"),
                "varme_advarsel": data.get("thermal_warning"),
            }
        if self.key == "plan":
            return {
                "plan": data.get("plan", []),
                "pristimer": data.get("price_hours", 0),
                "vejrtimer": data.get("weather_hours", 0),
                "pvtimer": data.get("pv_forecast_hours", 0),
                "pvstatus": data.get("pv_forecast_status"),
                "pv_rest_i_dag": data.get("pv_today_remaining_kwh"),
                "pv_i_morgen": data.get("pv_tomorrow_kwh"),
                "bemærkning": data.get("plan_note"),
            }
        return None
