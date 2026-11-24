"""Read-only coordination of price, weather, occupancy, hot water and PV/battery.

All values are suggestions, never service calls. An unknown input must not
silently become 'away', zero energy, or an available battery.
"""
from datetime import datetime
from math import isfinite


def bounded_number(value, minimum, maximum):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if isfinite(parsed) and minimum <= parsed <= maximum else None


def presence_state(state):
    """Return home/away/unknown. Unknown is not the same as away."""
    if state is None:
        return "unknown"
    value = str(getattr(state, "state", "unknown")).lower()
    domain = str(getattr(state, "entity_id", "")).split(".")[0]
    if domain in ("person", "device_tracker"):
        if value == "home":
            return "home"
        if value == "not_home":
            return "away"
    if domain in ("binary_sensor", "input_boolean"):
        if value == "on":
            return "home"
        if value == "off":
            return "away"
    return "unknown"


def dhw_demand_update(history, now, measured, mode="normal"):
    """Observe significant hot-water top-temperature drops, not water volume.

    Requires samples 5-30 minutes apart. Per-hour drop observations describe
    *possible* demand and are NOT guaranteed draw events.
    """
    previous = history.get("dhw_last_sample")
    counts = history.get("dhw_events")
    counts = counts if isinstance(counts, list) and len(counts) == 24 else [0] * 24
    if measured is None:
        return {"counts": counts, "events": sum(counts), "detected": False}
    detected = False
    if isinstance(previous, list) and len(previous) == 2:
        stamp, former = previous
        seconds = now.timestamp() - stamp
        delta = former - measured
        if 300 <= seconds <= 1800 and 2 <= delta <= 15:
            local_hour = now.hour
            counts[local_hour] = min(100, counts[local_hour] + 1)
            detected = True
    history["dhw_last_sample"] = [now.timestamp(), measured]
    history["dhw_events"] = counts
    return {"counts": counts, "events": sum(counts), "detected": detected}


def coordinate_plan(plan, *, presence="unknown", battery_soc=None,
                    pv_peak_threshold_w=2500, nominal_load_w=None,
                    room=None, room_target=20, hotwater=None,
                    water_min=48, draw_hours=None, local_tz=None):
    """Decorate the existing 48h plan with evidence-based recommendations.

    PV >= nominal load estimates an *opportunity*, not confirmed export.
    With an unspecified household load no export forecast is presented.
    Battery hints do not command inverters, chargers or storage.
    """
    counts = draw_hours if isinstance(draw_hours, list) and len(draw_hours) == 24 else [0] * 24
    low_water = hotwater is not None and hotwater < water_min
    filled = []
    for h in plan:
        row = dict(h)
        p = row.get("price")
        solar_w = row.get("pv_power_w")
        temperature = row.get("outdoor")
        wind = row.get("wind")
        cloud = row.get("cloud_coverage")
        time = datetime.fromisoformat(row["time"])
        if local_tz is not None:
            time = time.astimezone(local_tz)
        hour = time.hour
        expected_draw = counts[hour] > 0
        solar_opportunity = solar_w is not None and solar_w >= pv_peak_threshold_w
        estimated_surplus = (
            round(max(0, solar_w - nominal_load_w), 0)
            if solar_w is not None and nominal_load_w is not None else None
        )
        # A solar forecast models PV yield, not indoor solar gains. High PV
        # AND an already warm room is a cautious signal not to preheat further.
        overheating = bool(
            room is not None and room >= room_target - 0.1
            and solar_opportunity and temperature is not None
        )
        windy_cold = bool(wind is not None and temperature is not None
                          and wind >= 7 and temperature <= 6)
        reasons = []
        if overheating:
            heat = "Undgå forvarmning – rum tæt på mål og sol forventes"
            reasons.append("Indetemperatur er allerede tæt på målet")
        elif row["action"] == "solforvarmning (forslag)":
            heat = "Solbaseret varme kan overvejes"
            reasons.append("PV-prognose høj, men faktisk overskud er ukendt")
        elif row["action"] == "billig forvarmning":
            heat = "Billig el – moderat forvarmning kan overvejes"
            reasons.append("Lav elpris i denne time")
        else:
            heat = row["action"]
        if windy_cold:
            reasons.append("Koldt og blæsende: større muligt varmetab")
        if presence == "away":
            reasons.append("Ingen hjemme nu; fremtidig tilstedeværelse er ukendt")
        if presence == "unknown":
            reasons.append("Tilstedeværelsessensor mangler eller er ukendt")
        if low_water:
            hot_action = "Varmtvand bør ikke udsættes alene på grund af elpris"
        elif expected_draw:
            hot_action = "Muligt varmtvandsbehov – temperaturfald observeret tidligere i denne time"
        elif solar_opportunity:
            hot_action = "Mulig PV-time til planlagt varmtvand (kun forslag)"
        elif p is not None and p <= 2.3:
            hot_action = "Mulig billig time til planlagt varmtvand"
        else:
            hot_action = "Ingen særlig varmtvandsprioritet"
        battery = "Ikke tilsluttet"
        if battery_soc is not None:
            if battery_soc < 25:
                battery = "Lav batteristand – undgå at antage ledig batterienergi"
            elif solar_opportunity and battery_soc < 90:
                battery = "PV-prognose og batteri: mulig opladning, ikke garanteret"
            else:
                battery = "Batteri overvåges; ingen automatisk batteristyring"
        row.update({
            "heat_advice": heat,
            "water_advice": hot_action,
            "battery_advice": battery,
            "estimated_surplus_w": estimated_surplus,
            "overheating_risk": overheating,
            "wind_chill_hint": windy_cold,
            "presence_now": presence,
            "demand_history_hint": expected_draw,
            "reason": "; ".join(reasons),
            "suggested_only": True,
        })
        filled.append(row)
    return filled


def suggested_hot_water_time(hours, water, water_min):
    """Choose an advisory 24h hour; if already too cold, flag immediate need."""
    if water is None:
        return None, "Ingen varmtvandssensor"
    if water < water_min:
        return None, "Lav varmtvandstemperatur – udsæt ikke opvarmning efter elpris"
    candidates = []
    for hour in hours[:24]:
        price = hour.get("price")
        if price is None:
            continue
        # A possible 2.5 kW PV hour receives a small *heuristic* preference.
        pv_w = hour.get("pv_power_w")
        pv_bonus = .4 if pv_w is not None and pv_w >= 2500 else 0
        demand_penalty = .2 if hour.get("demand_history_hint") else 0
        candidates.append((price - pv_bonus + demand_penalty, hour["time"]))
    if not candidates:
        return None, "Ingen kendte elpriser de næste 24 timer"
    _, chosen = min(candidates)
    return chosen, "Rådgivende time fra elpris, PV og mulig varmtvandsaktivitet"
