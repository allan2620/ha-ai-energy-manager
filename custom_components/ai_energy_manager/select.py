"""User-selectable energy policy. Changing it does not bypass test mode."""
from homeassistant.components.select import SelectEntity
from .const import DOMAIN

MODES = ["normal", "comfort", "economy", "holiday"]

async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([EnergyProfile(entry)])

class EnergyProfile(SelectEntity):
    _attr_has_entity_name = True
    _attr_name = "Energiprofil"
    _attr_options = MODES
    _attr_icon = "mdi:home-lightning-bolt"

    def __init__(self, entry):
        self.entry = entry
        self._attr_unique_id = entry.entry_id + "energy_mode"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": "AI Energy Manager",
        }

    @property
    def current_option(self):
        return self.entry.options.get("energy_mode",
            self.entry.data.get("energy_mode", "normal"))

    async def async_select_option(self, option):
        if option not in MODES:
            raise ValueError("Unsupported energy mode")
        options = dict(self.entry.options)
        options["energy_mode"] = option
        self.hass.config_entries.async_update_entry(self.entry, options=options)
