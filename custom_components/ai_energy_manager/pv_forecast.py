"""Forecast.Solar hourly PV forecast adapter. No network calls or device writes here."""
from datetime import timedelta
from homeassistant.util import dt as dt_util

from .planner import as_float


def parse_pv_forecast(response, now, hours=48):
    """Convert Forecast.Solar response (watts/wh_period keyed by ISO timestamp).

    Times are UTC-normalized. Only explicitly supplied hours are considered
    available. wh_period is Wh for each period and therefore /1000 -> kWh.
    """
    result = {}
    if not isinstance(response, dict):
        return result
    watts = response.get("watts", {})
    energy = response.get("wh_period", {})
    if not isinstance(watts, dict) or not isinstance(energy, dict):
        return result
    start = now.astimezone(dt_util.UTC).replace(minute=0, second=0, microsecond=0)
    end = start + timedelta(hours=hours)
    for key in set(watts) | set(energy):
        try:
            moment = dt_util.parse_datetime(str(key))
        except (TypeError, ValueError):
            continue
        if moment is None or moment.tzinfo is None:
            continue
        moment = moment.astimezone(dt_util.UTC)
        if moment.minute or moment.second or moment.microsecond or not (start <= moment < end):
            continue
        power = as_float(watts.get(key))
        wh = as_float(energy.get(key))
        if power is not None and power < 0:
            power = None
        if wh is not None and wh < 0:
            wh = None
        if power is None and wh is None:
            continue
        result[moment] = {
            "pv_power_w": round(power, 1) if power is not None else None,
            "pv_energy_kwh": round(wh / 1000, 3) if wh is not None else None,
        }
    return result


def pv_summary(hour_map, now, timezone):
    local_now = now.astimezone(timezone)
    today = local_now.date()
    tomorrow = today + timedelta(days=1)
    # The current hour is only partly in the future. Do not count its
    # full predicted production as "remaining today".
    current_hour = now.astimezone(dt_util.UTC).replace(minute=0, second=0, microsecond=0)
    remainder = max(0, min(1, (3600 - (now - current_hour).total_seconds()) / 3600))
    today_energy = [
        x["pv_energy_kwh"] * (remainder if when == current_hour else 1)
        for when, x in hour_map.items()
        if when.astimezone(timezone).date() == today and x.get("pv_energy_kwh") is not None
    ]
    tomorrow_energy = [x["pv_energy_kwh"] for when, x in hour_map.items()
                       if when.astimezone(timezone).date() == tomorrow and x.get("pv_energy_kwh") is not None]
    return {
        "pv_hours": len(hour_map),
        "pv_today_remaining_kwh": round(sum(today_energy), 2) if today_energy else None,
        "pv_tomorrow_kwh": round(sum(tomorrow_energy), 2) if tomorrow_energy else None,
        "pv_peak_w": max((x["pv_power_w"] for x in hour_map.values()
                         if x.get("pv_power_w") is not None), default=None),
    }
