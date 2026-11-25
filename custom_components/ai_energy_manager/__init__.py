"""AI Energy Manager – automatic sidebar panel."""
from pathlib import Path
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import CoreState, callback
from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from .const import DOMAIN
from .engine import Engine
from .dashboard_api import AIEnergyLayoutView

PANEL_ROUTE = "ai-energy"
ASSET_URL = "/ai_energy_manager_static"
PANEL_KEY = "_ai_energy_panel_registered"
API_KEY = "_ai_energy_dashboard_api_registered"
STATIC_KEY = "_ai_energy_static_registered"

async def _setup_panel(hass):
    if hass.data.get(PANEL_KEY):
        return
    if PANEL_ROUTE in hass.data.get("frontend_panels", {}):
        hass.data[PANEL_KEY] = True
        return
    # Static HTTP routes live for the HA process lifetime. Register once,
    # even when an options change unloads and recreates the sidebar panel.
    if not hass.data.get(STATIC_KEY):
        await hass.http.async_register_static_paths([
            StaticPathConfig(ASSET_URL, str(Path(__file__).parent / "frontend"), cache_headers=False)
        ])
        hass.data[STATIC_KEY] = True
    await panel_custom.async_register_panel(
        hass, webcomponent_name="ai-energy-panel",
        frontend_url_path=PANEL_ROUTE,
        sidebar_title="AI Energy", sidebar_icon="mdi:brain",
        module_url=f"{ASSET_URL}/ai-energy-panel.js?v=2.4.0",
        embed_iframe=False, require_admin=False,
    )
    hass.data[PANEL_KEY] = True

async def async_migrate_entry(hass, entry):
    """Migrate an existing v1 config entry without losing user settings.

    Version 2 only added optional settings with defaults. Existing entity IDs,
    options and enabled write flags are deliberately kept unchanged.
    """
    if entry.version == 1:
        hass.config_entries.async_update_entry(entry, version=2)
        return True
    if entry.version == 2:
        return True
    return False


async def async_setup_entry(hass, entry):
    if not hass.data.get(API_KEY):
        hass.http.register_view(AIEnergyLayoutView(hass))
        hass.data[API_KEY] = True
    engine = Engine(hass, entry)
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = engine
    await engine.async_config_entry_first_refresh()
    await hass.config_entries.async_forward_entry_setups(entry, ["sensor", "select", "button"])
    # The first refresh may run before P1, Husdata, Nilan and price entities
    # have published their initial states. Re-evaluate after HA is fully started.
    if hass.state != CoreState.running:
        @callback
        def _after_start(_event):
            hass.async_create_task(engine.async_request_refresh())
        entry.async_on_unload(hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _after_start))
    else:
        await engine.async_request_refresh()
    await _setup_panel(hass)
    entry.async_on_unload(entry.add_update_listener(reload_entry))
    return True

async def reload_entry(hass, entry):
    await hass.config_entries.async_reload(entry.entry_id)

async def async_unload_entry(hass, entry):
    ok = await hass.config_entries.async_unload_platforms(entry, ["sensor", "select", "button"])
    if ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        if not hass.data[DOMAIN] and hass.data.pop(PANEL_KEY, False):
            frontend.async_remove_panel(hass, PANEL_ROUTE)
    return ok
