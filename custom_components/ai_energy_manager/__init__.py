from .const import DOMAIN
from .engine import Engine

async def async_setup_entry(hass, entry):
    engine = Engine(hass, entry)
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = engine
    await engine.async_config_entry_first_refresh()
    await hass.config_entries.async_forward_entry_setups(entry, ["sensor"])
    entry.async_on_unload(entry.add_update_listener(reload_entry))
    return True

async def reload_entry(hass, entry):
    await hass.config_entries.async_reload(entry.entry_id)

async def async_unload_entry(hass, entry):
    ok = await hass.config_entries.async_unload_platforms(entry, ["sensor"])
    if ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return ok
