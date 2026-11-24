"""Coordinator for AI Energy Manager 2.0.

Physical commands are opt-in and use bounded setpoint changes only.
The 48-hour plan is advisory; no predictive control on sparse forecasts.
"""
from datetime import timedelta
import logging
import math

from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DEFAULTS
from .planner import as_float, make_plan, price_slots, weather_slots

_LOGGER = logging.getLogger(__name__)


class Engine(DataUpdateCoordinator):
    def __init__(self, hass, entry):
        super().__init__(
            hass, _LOGGER, name="AI Energy Manager",
            update_interval=timedelta(minutes=5),
        )
        self.c = {**DEFAULTS, **entry.data, **entry.options}
        self.store = Store(hass, 1, "ai_energy_manager_" + entry.entry_id)
        self.saved = None

    def state(self, key):
        return self.hass.states.get(self.c[key])

    def num(self, key):
        try:
            state = self.state(key)
            val = float(state.state)
            if not math.isfinite(val):
                return None
            if key in ("grid", "pv", "hp_power"):
                unit = state.attributes.get("unit_of_measurement")
                if unit not in ("W", "kW"):
                    return None
                val *= 1000 if unit == "kW" else 1
            return val
        except (TypeError, ValueError, AttributeError):
            return None

    async def command(self, key, value):
        if self.c.get("test_mode", True):
            return False
        await self.hass.services.async_call(
            "climate", "set_temperature",
            {"entity_id": self.c[key], "temperature": value},
            blocking=True,
        )
        return True

    async def _async_update_data(self):
        cfg = self.c
        now = dt_util.utcnow()
        timestamp = now.timestamp()
        if self.saved is None:
            self.saved = await self.store.async_load() or {}
        memory = self.saved
        logs = memory.get("log")
        if not isinstance(logs, list):
            logs = []
            memory["log"] = logs

        readings = {
            key: self.num(key)
            for key in ("grid", "pv", "hp_power", "room", "outdoor", "water", "price")
        }
        grid = readings["grid"]
        pv = readings["pv"]
        hp = readings["hp_power"]
        room = readings["room"]
        outdoor = readings["outdoor"]
        water = readings["water"]
        price = readings["price"]
        alarm = self.hass.states.get("binary_sensor.hp_alarm")
        compressor = self.hass.states.get("binary_sensor.hp_compressor")
        nilan = self.state("nilan")
        nilan_cooling = bool(
            nilan and (nilan.state == "cool"
                       or nilan.attributes.get("hvac_action") == "cooling")
        )
        faults = []
        labels = {
            "grid": "P1 elmåler", "pv": "Danfoss solproduktion",
            "hp_power": "IVT effekt", "room": "Rumtemperatur",
            "outdoor": "Udetemperatur", "water": "Varmtvand",
            "price": "Elpris",
        }
        for key, value in readings.items():
            if value is None:
                state = self.state(key)
                faults.append(
                    f"{labels[key]} ({cfg[key]}: {state.state if state else 'mangler'})"
                )
        if alarm is None or alarm.state not in ("on", "off"):
            faults.append("IVT alarmstatus mangler/er ukendt")
        elif alarm.state == "on":
            faults.append("IVT har aktiv alarm")
        if compressor is None or compressor.state not in ("on", "off"):
            faults.append("IVT kompressorstatus er ukendt")
        if nilan is None or nilan.state in ("unknown", "unavailable"):
            faults.append("Nilan driftstatus er ukendt")
        limits_ok = (
            15 <= cfg["normal"] <= 24
            and cfg["normal"] <= cfg["maximum"] <= 25
            and 0 <= cfg["boost"] <= 1
            and cfg["start_w"] > cfg["stop_w"] >= 0
            and 15 <= cfg.get("min_boost_minutes", 30) <= 240
            and 30 <= cfg.get("max_boost_minutes", 120) <= 360
            and 0.1 <= cfg.get("future_price_jump", 0.8) <= 5
        )
        if not limits_ok:
            faults.append("Ugyldige sikkerhedsgrænser i indstillinger")
        safe = not faults

        # Climate forecasting: accept hourly forecasts only when actually available.
        weather_state = self.state("weather")
        hourly = weather_state.attributes.get("forecast", []) if weather_state else []
        # The official weather entity can provide hourly forecasts through its service.
        try:
            response = await self.hass.services.async_call(
                "weather", "get_forecasts",
                {"entity_id": cfg["weather_entity"], "type": "hourly"},
                blocking=True, return_response=True,
            )
            service_forecast = (response or {}).get(cfg["weather_entity"], {}).get("forecast", [])
            if service_forecast:
                hourly = service_forecast
        except Exception as exc:
            _LOGGER.debug("Hourly weather forecast unavailable: %s", exc)
        if not isinstance(hourly, list):
            hourly = []
        hourly = [
            item for item in hourly
            if isinstance(item, dict) and "datetime" in item and "temperature" in item
            and "templow" not in item
        ]
        # A daily forecast is not relabelled as 48 hours of hourly forecasts.
        forecasts = weather_slots(hourly, now)
        prices = price_slots(self.state("price"), now)
        planning = make_plan(
            now, prices, forecasts, price, outdoor, cfg["normal"],
            allowed=bool(cfg["room_verified"] and safe),
            cheap_limit=cfg["cheap"], room_target=cfg["normal"],
            boost=cfg["boost"], mode=cfg.get("energy_mode", "normal"),
            nominal_kw=cfg.get("nominal_hp_kw", 2.5),
        )
        cold = min(
            (f["temperature"] for k, f in forecasts.items()
             if now <= k < now + timedelta(hours=48)),
            default=outdoor,
        )
        planning["note"] = (
            "Der mangler timebaseret vejrudsigt; planens ukendte timer får ingen beregnede handlinger"
            if planning["weather_hours"] < 24 else planning["note"]
        )

        # Observe the house cooling trend only when the compressor is off.
        prev = memory.get("sample")
        if room is not None and cfg["room_verified"]:
            if (isinstance(prev, list) and len(prev) == 3
                    and compressor is not None and compressor.state == "off"
                    and prev[2] and 240 <= timestamp - prev[0] <= 900):
                rate = (prev[1] - room) * 3600 / (timestamp - prev[0])
                if 0 <= rate <= 2:
                    previous_rate = as_float(memory.get("cooling_rate"))
                    memory["cooling_rate"] = round(
                        rate if previous_rate is None
                        else .9 * previous_rate + .1 * rate, 3
                    )
            memory["sample"] = [timestamp, room, compressor is not None and compressor.state == "off"]

        # Grid sign: default positive import, negative export.
        export = (grid if cfg["export_positive"] else -grid) if grid is not None else None
        headroom = export + max(0, hp) if export is not None and hp is not None else None
        solar_candidate = bool(
            safe and pv is not None and pv > 500 and headroom is not None
            and headroom >= (cfg["stop_w"] if memory.get("solar") else cfg["start_w"])
            and export >= -cfg["stop_w"]
        )
        if solar_candidate:
            memory.setdefault("solar_since", timestamp)
        else:
            memory.pop("solar_since", None)
        solar = bool(
            solar_candidate and (
                memory.get("solar", False) or timestamp - memory["solar_since"] >= 900
            )
        )
        memory["solar"] = solar
        future_prices = [
            prices.get(now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=h))
            for h in range(1, 7)
        ]
        known_future = [p for p in future_prices if p is not None]
        predictive_preheat = bool(
            safe and price is not None and price <= cfg["cheap"]
            and len(known_future) >= 3
            and max(known_future) - price >= cfg.get("future_price_jump", 0.8)
            and outdoor is not None and outdoor < 10
        )
        cheap = bool(safe and price is not None and price <= cfg["cheap"]
                     and cold is not None and cold < 5)
        mode = cfg.get("energy_mode", "normal")
        boost = bool(
            safe and cfg["room_verified"] and not nilan_cooling
            and mode not in ("economy", "holiday") and room < cfg["maximum"] - .2
            and (solar or cheap or predictive_preheat) and outdoor < 15
            and timestamp >= memory.get("boost_blocked_until", 0)
        )
        if memory.get("owned_since") is not None and timestamp - memory["owned_since"] >= cfg.get("max_boost_minutes", 120) * 60:
            boost = False
            memory["boost_blocked_until"] = timestamp + 3600
            logs.append("Maksimal varighed for IVT boost nået; en times pause")
            memory.pop("owned_since", None)
        target = round(
            min(cfg["maximum"], cfg["normal"] + cfg["boost"]) if boost
            else cfg["normal"], 1
        )

        if not safe:
            reason = "Blokeret: " + "; ".join(faults[:2])
            if len(faults) > 2:
                reason += f"; +{len(faults)-2} yderligere"
        elif nilan_cooling:
            reason = "Nilan køler – ekstra rumvarme spærret"
        elif mode == "holiday":
            reason = "Ferie – ingen ekstra boost"
        elif boost and solar:
            reason = "Soloverskud – ekstra rumvarme kan prioriteres"
        elif boost and predictive_preheat:
            reason = "Prognose: billig strøm nu før dyrere timer"
        elif boost and cheap:
            reason = "Billig el – ekstra rumvarme kan prioriteres"
        else:
            reason = "Normal lokal regulering"
        if cfg.get("test_mode", True):
            reason = "TEST: " + reason

        # Observe starts, not actuate compressor. Guard boost changes for minimum
        # time after compressor transitions to limit unnecessary setpoint changes.
        previous_compressor = memory.get("compressor")
        if previous_compressor is None:
            memory["compressor_changed"] = timestamp
        if compressor and compressor.state in ("on", "off"):
            if previous_compressor is not None and previous_compressor != compressor.state:
                memory["compressor_changed"] = timestamp
                logs.append("Kompressor skiftede til " + compressor.state)
            memory["compressor"] = compressor.state
        change_age = timestamp - memory.get("compressor_changed", 0)
        cooldown = max(0, cfg.get("min_boost_minutes", 30)) * 60
        cooldown_active = change_age < cooldown

        hp_state = self.state("hp")
        current_setpoint = as_float(
            hp_state.attributes.get("temperature") if hp_state else None
        )
        owned = memory.get("owned")
        if owned is not None and current_setpoint is not None:
            # Detect human or external intervention; never override it.
            if abs(current_setpoint - owned) > .15:
                memory.pop("owned", None)
                memory.pop("owned_since", None)
                memory["manual_hold"] = True
                logs.append("Manuel ændring registreret; automatisk rumboost sat på pause")
                owned = None

        # A previous active boost requires a bounded restore, even if some
        # readings fail. Do not issue any command if write access is disabled.
        can_write = bool(
            cfg["room_verified"] and cfg["write_heat"]
            and not cfg.get("test_mode", True)
        )
        if owned is not None and not boost and can_write:
            baseline = as_float(memory.get("baseline"))
            if baseline is not None and 15 <= baseline <= 24 and current_setpoint is not None and abs(current_setpoint-owned) <= .15:
                try:
                    await self.command("hp", baseline)
                    memory.pop("owned", None)
                    memory.pop("owned_since", None)
                    logs.append("Tidligere IVT-solboost gendannet til normal setpunkt")
                except Exception as exc:
                    logs.append("Kunne ikke gendanne IVT rumsetpunkt: " + str(exc)[:100])
        elif (can_write and boost and not cooldown_active
              and not memory.get("manual_hold") and owned is None
              and current_setpoint is not None
              and abs(current_setpoint - cfg["normal"]) <= .15):
            # Only own a setpoint close to the configured baseline.
            try:
                await self.command("hp", target)
                memory["baseline"] = current_setpoint
                memory["owned"] = target
                memory["owned_since"] = timestamp
                logs.append(f"IVT rumsetpunkt hævet til {target} °C")
            except Exception as exc:
                logs.append("IVT boost mislykkedes: " + str(exc)[:100])

        # COP is only available when an actual heat-output power meter exists.
        heat_output = None
        if cfg.get("heat_output"):
            heat_sensor = self.hass.states.get(cfg["heat_output"])
            if heat_sensor:
                value = as_float(heat_sensor.state)
                unit = heat_sensor.attributes.get("unit_of_measurement")
                if value is not None and unit in ("W", "kW"):
                    heat_output = value * (1000 if unit == "kW" else 1)
        cop = round(heat_output / hp, 2) if heat_output is not None and hp and hp > 100 else None

        # Cost budget assumes the *current* grid import remains unchanged for
        # 24 hours. This is not a forecast of future household consumption.
        hours24 = planning["hours"][:24]
        complete = len(hours24) == 24 and all(item["price"] is not None for item in hours24)
        current_import_kw = (
            max(0, (grid if not cfg["export_positive"] else -grid) / 1000)
            if grid is not None else None
        )
        budget_24 = (
            round(current_import_kw * sum(hour["price"] for hour in hours24), 2)
            if complete and current_import_kw is not None else None
        )

        # Do not dispatch Husdata extra DHW commands automatically until the
        # integration's special duration semantics have been verified on device.
        dhw_suggestion = bool(
            safe and (solar or cheap) and water is not None
            and water < cfg["water_min"]
        )
        if dhw_suggestion and not memory.get("last_dhw_suggestion"):
            logs.append("Mulighed for ekstra varmtvand; kommando kræver verificering af Rego")
        memory["last_dhw_suggestion"] = dhw_suggestion

        # New confirmed hardware alarms create an HA persistent notification once.
        if alarm is not None and alarm.state == "on" and not memory.get("alarm_notified"):
            try:
                await self.hass.services.async_call(
                    "persistent_notification", "create",
                    {"title": "AI Energy: IVT alarm",
                     "message": "IVT rapporterer aktiv alarm. Ekstra boost er blokeret; kontrollér Husdata og varmepumpens alarm.",
                     "notification_id": "ai_energy_hp_alarm"},
                    blocking=True,
                )
                memory["alarm_notified"] = True
            except Exception as exc:
                _LOGGER.warning("Could not notify about heat pump alarm: %s", exc)
        elif alarm is not None and alarm.state == "off":
            memory["alarm_notified"] = False
        if reason != memory.get("reason"):
            logs.append(dt_util.now().strftime("%d/%m %H:%M") + " " + reason)
        memory["reason"] = reason
        memory["log"] = logs[-45:]
        await self.store.async_save(memory)
        next_hours = planning["hours"]
        return {
            "status": reason, "solar": solar, "export": export,
            "pv": pv, "hp_power": hp, "target": target,
            "price": price, "room": room, "water": water,
            "forecast_low": cold, "cooling_rate": memory.get("cooling_rate"),
            "nilan": nilan.state if nilan else None,
            "log": memory["log"], "faults": faults,
            "manual_hold": memory.get("manual_hold", False),
            "test_mode": cfg.get("test_mode", True),
            "cooldown": cooldown_active,
            "plan": next_hours,
            "price_hours": planning["price_hours"],
            "weather_hours": planning["weather_hours"],
            "suggested_heat_hours": planning["suggested_heat_hours"],
            "dhw_suggestion": dhw_suggestion,
            "mode": mode,
            "plan_note": planning["note"],
            "nilan_cooling": nilan_cooling,
            "cop": cop,
            "budget_24": budget_24,
            "predictive_preheat": predictive_preheat,
        }
