"""Conservative auto-detection of existing Home Assistant entities.

Ranking only uses already available states and friendly names. Detection never
writes a device, changes a permission, or turns on automatic control.
"""
from .const import DEFAULTS

ENTITY_DOMAINS = {
    "grid": ("sensor",), "pv": ("sensor",), "hp_power": ("sensor",),
    "room": ("sensor",), "outdoor": ("sensor",), "water": ("sensor",),
    "price": ("sensor",), "weather": ("sensor",),
    "weather_entity": ("weather",), "hp": ("climate",),
    "dhw": ("climate",), "nilan": ("climate",),
    "heat_output": ("sensor",),
}

# Exact known IDs are preferred to fuzzy title matching. Descriptions are
# ordered strongest first; the fallback only applies to sensor-type entities.
PATTERNS = {
    "grid": ("p1_meter_power", "grid_power_import", "net_power", "grid_power"),
    "pv": ("grid_power_total", "pv_power_total", "total_pv_power", "solar_power"),
    "hp_power": ("hp_power_consumption", "heat_pump_power", "varmepumpe_effekt"),
    "room": ("nilan_user_panel_temperature_t15", "room_temperature", "indoor_temperature", "indetemperatur"),
    "outdoor": ("hp_outdoor", "outside_temperature", "outdoor_temperature", "udetemperatur"),
    "water": ("hp_warm_water_1_top", "hot_water_temperature", "varmtvand_top", "dhw_temperature"),
    "price": ("energi_data_service", "electricity_price", "elpris", "spotprice"),
    "weather": ("custom_weather_forecast_daily", "forecast_daily"),
    "weather_entity": ("forecast_hjem", "forecast_home", "weather"),
    "hp": ("hp_room_temp_setpoint", "heat_pump", "ivt_room"),
    "dhw": ("hp_extra_warm_water", "extra_hot_water"),
    "nilan": ("boiler_room_nilan_hvac", "nilan_hvac", "nilan"),
    "heat_output": ("heat_output_power", "thermal_output_power", "heat_meter_power"),
}


def _valid(state):
    value = getattr(state, "state", None)
    return value not in (None, "unavailable", "unknown", "")


def _suitable(field, state):
    """Reject mismatched units and obvious unintended device types."""
    attrs = getattr(state, "attributes", {}) or {}
    unit = attrs.get("unit_of_measurement")
    if field in ("grid", "pv", "hp_power", "heat_output"):
        return unit in ("W", "kW")
    if field in ("room", "outdoor", "water"):
        return unit in ("°C", "°F")
    if field == "price":
        return unit in ("DKK/kWh", "kr/kWh", "DKK/MWh", "EUR/kWh")
    return True


def detect_entities(states):
    """Suggest only unambiguous, suitable, currently available entities.

    Return no match rather than choosing a random sensor. Do not infer heat
    output from electric consumption, or map the PV sensor to grid import.
    """
    result = {}
    for field, domains in ENTITY_DOMAINS.items():
        default = DEFAULTS.get(field)
        if default and default in states and _valid(states[default]) and _suitable(field, states[default]):
            result[field] = default
            continue
        candidates = []
        for entity_id, state in states.items():
            if entity_id.split(".", 1)[0] not in domains or not _valid(state) or not _suitable(field, state):
                continue
            name = str(getattr(state, "attributes", {}).get("friendly_name", "") or "").lower()
            slug = entity_id.split(".", 1)[1].lower()
            score = 0
            for i, pattern in enumerate(PATTERNS[field]):
                if slug == pattern:
                    score = max(score, 1000 - i * 25)
                elif pattern in slug:
                    score = max(score, 600 - i * 20)
                elif len(pattern) >= 8 and pattern.replace("_", " ") in name:
                    score = max(score, 320 - i * 10)
            if score <= 0:
                continue
            # Prevent accidental cross-mapping of compressor electrical consumption
            # and measured thermal output.
            if field == "heat_output" and not any(t in slug for t in ("thermal", "heat_output", "heat_meter")):
                continue
            if field == "grid" and ("solar" in slug or "pv_" in slug):
                continue
            if field == "pv" and ("p1_" in slug or "import" in slug):
                continue
            candidates.append((score, entity_id))
        candidates.sort(key=lambda item: (-item[0], item[1]))
        if candidates and (len(candidates) == 1 or candidates[0][0] > candidates[1][0]):
            result[field] = candidates[0][1]
    return result


def suggest_values(states, current=None, *, refresh_missing=False):
    """Keep saved/manual selection; optionally fill missing/unavailable entries."""
    values = {**DEFAULTS, **(current or {})}
    found = detect_entities(states)
    for field, entity_id in found.items():
        configured = (current or {}).get(field, "")
        if configured and not refresh_missing:
            continue
        if configured and refresh_missing and configured in states and _valid(states[configured]):
            continue
        if not configured or (configured not in states and refresh_missing):
            values[field] = entity_id
    # If no previous configuration was provided, detect over the built-in defaults.
    if current is None:
        values.update(found)
    return values
