"""Persistent, admin-only layout editor for the AI Energy sidebar."""
import re
from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.helpers.storage import Store

ALLOWED_GROUPS = {
    "kpi": ("solar", "grid", "hp", "nilan", "price", "weather"),
    "middle": ("ivt", "ventilation"),
    "bottom": ("production", "forecast", "prices", "log"),
}
ALLOWED_COLORS = ("nordic", "forest", "arctic", "violet")
ENTITY_PATTERN = re.compile(r"^(sensor|binary_sensor|climate|weather|number|switch)\.[a-z0-9_]+$")
MAX_LABEL = 32


def default_layout():
    return {
        "title": "AI Energy Manager",
        "accent": "nordic",
        "groups": {k: list(v) for k, v in ALLOWED_GROUPS.items()},
        "hidden": [],
        "labels": {},
        "sensors": {},
    }


def validate_layout(raw):
    if not isinstance(raw, dict):
        raise ValueError("Layout must be an object")
    base = default_layout()
    title = raw.get("title", base["title"])
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 60:
        raise ValueError("Invalid dashboard title")
    base["title"] = title.strip()
    accent = raw.get("accent", "nordic")
    if accent not in ALLOWED_COLORS:
        raise ValueError("Invalid color theme")
    base["accent"] = accent

    input_groups = raw.get("groups", {})
    if not isinstance(input_groups, dict):
        raise ValueError("Invalid card groups")
    for group, allowed in ALLOWED_GROUPS.items():
        received = input_groups.get(group, list(allowed))
        if not isinstance(received, list) or sorted(received) != sorted(allowed):
            raise ValueError("Invalid card order: " + group)
        base["groups"][group] = received

    allowed_ids = set().union(*(set(x) for x in ALLOWED_GROUPS.values()))
    hidden = raw.get("hidden", [])
    if not isinstance(hidden, list) or len(hidden) > len(allowed_ids) or any(x not in allowed_ids for x in hidden):
        raise ValueError("Invalid hidden cards")
    base["hidden"] = list(dict.fromkeys(hidden))

    labels = raw.get("labels", {})
    if not isinstance(labels, dict) or len(labels) > len(allowed_ids):
        raise ValueError("Invalid labels")
    for key, val in labels.items():
        if key not in allowed_ids or not isinstance(val, str) or len(val) > MAX_LABEL:
            raise ValueError("Invalid card label")
        if val.strip():
            base["labels"][key] = val.strip()

    sensors = raw.get("sensors", {})
    if not isinstance(sensors, dict) or len(sensors) > len(ALLOWED_GROUPS["kpi"]):
        raise ValueError("Invalid sensor overrides")
    for key, val in sensors.items():
        if key not in ALLOWED_GROUPS["kpi"] or not isinstance(val, str) or not ENTITY_PATTERN.fullmatch(val):
            raise ValueError("Invalid sensor override")
        base["sensors"][key] = val
    return base


class AIEnergyLayoutView(HomeAssistantView):
    """Authenticated API; only administrators can modify saved layout."""

    url = "/api/ai_energy_manager/dashboard"
    name = "api:ai_energy_manager:dashboard"
    requires_auth = True

    def __init__(self, hass):
        self._store = Store(hass, 1, "ai_energy_manager_dashboard")

    async def get(self, request):
        saved = await self._store.async_load()
        try:
            layout = validate_layout(saved or default_layout())
        except ValueError:
            layout = default_layout()
        return web.json_response({"layout": layout})

    async def post(self, request):
        user = request.get("hass_user")
        if user is None or not user.is_admin:
            raise web.HTTPForbidden(text="Only administrators may edit the dashboard")
        if request.content_length is not None and request.content_length > 12000:
            raise web.HTTPRequestEntityTooLarge(max_size=12000, actual_size=request.content_length)
        try:
            raw = await request.json()
            layout = validate_layout(raw.get("layout") if isinstance(raw, dict) else None)
        except (ValueError, TypeError, web.HTTPBadRequest) as exc:
            raise web.HTTPBadRequest(text=str(exc)) from exc
        await self._store.async_save(layout)
        return web.json_response({"ok": True, "layout": layout})
