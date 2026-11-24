"""Pure, side-effect-free planning functions. No device commands in this module."""
from __future__ import annotations
from datetime import datetime, timedelta
from math import isfinite
from homeassistant.util import dt as dt_util


def as_float(value):
    try:
        n = float(value)
        return n if isfinite(n) else None
    except (ValueError, TypeError):
        return None


def price_slots(price_state, now, hours=48):
    """Return per-hour prices from timestamped DK1 data; never fabricate prices."""
    out = {}
    if price_state is None:
        return out
    for field in ("raw_today", "raw_tomorrow"):
        for row in price_state.attributes.get(field, []) or []:
            if not isinstance(row, dict):
                continue
            try:
                timestamp = dt_util.parse_datetime(str(row.get("hour", "")))
            except (TypeError, ValueError):
                continue
            cost = as_float(row.get("price"))
            if timestamp is None or cost is None or cost < 0:
                continue
            out[timestamp.astimezone(dt_util.UTC).replace(minute=0, second=0, microsecond=0)] = round(cost, 3)
    return out


def weather_slots(hourly, now):
    """Map hourly forecasts by UTC hour; missing hours remain unknown."""
    out = {}
    for item in hourly or []:
        if not isinstance(item, dict):
            continue
        try:
            moment = dt_util.parse_datetime(str(item.get("datetime", "")))
        except (TypeError, ValueError):
            continue
        temperature = as_float(item.get("temperature"))
        wind = as_float(item.get("wind_speed"))
        if moment is None or temperature is None:
            continue
        out[moment.astimezone(dt_util.UTC).replace(minute=0, second=0, microsecond=0)] = {
            "temperature": round(temperature, 1),
            "wind": wind,
            "condition": str(item.get("condition", ""))[:30],
        }
    return out


def make_plan(now, prices, forecast, current_price, outdoor, base_temp,
              allowed=True, cheap_limit=2.3, room_target=20.0, boost=0.5,
              nominal_kw=2.5, mode="normal", pv=None):
    """Informational 48-hour hourly plan; control is never performed here.

    Missing price, weather, or PV forecast data remain unknown.
    PV input comes from an external Forecast.Solar prediction, not an inferred value.
    """
    now = now.astimezone(dt_util.UTC).replace(minute=0, second=0, microsecond=0)
    plan = []
    priced = sorted(v for k, v in prices.items()
                    if now <= k < now + timedelta(hours=48))
    cheap_cut = min(cheap_limit, priced[max(0, int(len(priced) * .35) - 1)]) if priced else cheap_limit
    for i in range(48):
        moment = now + timedelta(hours=i)
        p = prices.get(moment)
        if p is None and i == 0:
            p = current_price
        weather = forecast.get(moment, {})
        pv_hour = (pv or {}).get(moment, {})
        power = pv_hour.get("pv_power_w")
        energy = pv_hour.get("pv_energy_kwh")
        temp = weather.get("temperature")
        if i == 0 and temp is None:
            temp = outdoor
        wind = weather.get("wind")
        # Heuristic, not thermodynamic prediction.
        need = None if temp is None else max(0, round((20 - temp) * (1 + min(12, max(0, wind or 0)) * .015), 2))
        low_price = p is not None and p <= cheap_limit
        plan_action = "ukendt"
        if mode == "holiday":
            plan_action = "ferie"
        elif p is None or temp is None:
            plan_action = "afventer data"
        elif need <= 1.0:
            plan_action = "ingen forvarmning"
        elif power is not None and power >= max(1000, nominal_kw*1000) and need > 1:
            plan_action = "solforvarmning (forslag)"
        elif low_price and need > 1:
            plan_action = "billig forvarmning"
        elif p > cheap_limit and need > 1:
            plan_action = "undgå ekstra boost"
        else:
            plan_action = "normal"
        flexibility = bool(allowed and plan_action in ("billig forvarmning", "solforvarmning (forslag)")
                           and mode not in ("holiday", "economy"))
        plan.append({
            "time": moment.isoformat(timespec="minutes"),
            "price": round(p, 3) if p is not None else None,
            "pv_power_w": power, "pv_energy_kwh": energy,
            "outdoor": temp, "wind": wind, "heat_need_index": need,
            "action": plan_action,
            "recommended_target": round(min(24, room_target + boost), 1) if flexibility else round(room_target, 1),
            "potential_extra_cost": round(max(0, nominal_kw) * p, 2) if flexibility and p is not None else None,
            "automatic": False,
            "note": "Rådgivende; solprognosen er forventet produktion, ikke sikkert overskud",
        })
    present_price=sum(item["price"] is not None for item in plan)
    present_temp=sum(item["outdoor"] is not None for item in plan)
    proposals=sum(item["action"] in ("billig forvarmning", "solforvarmning (forslag)") for item in plan)
    pv_hours=sum(item["pv_power_w"] is not None or item["pv_energy_kwh"] is not None for item in plan)
    return {
        "hours": plan,
        "price_hours": present_price, "weather_hours": present_temp,
        "suggested_heat_hours": proposals, "cheap_threshold": cheap_limit,
        "pv_hours": pv_hours,
        "note": "48-timers rådgivende plan: PV er forventet produktion, ikke beregnet netto-eksport",
    }


def future_savings_estimate(price, baseline, low_price, nominal_kw):
    """Comparable price-shift only; not measured realized savings."""
    if None in (price, baseline, low_price, nominal_kw):
        return None
    return round(max(0, baseline - low_price) * max(0, nominal_kw), 2)
