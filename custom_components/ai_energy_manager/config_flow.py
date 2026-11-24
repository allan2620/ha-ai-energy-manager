"""Config flow with safe defaults and clear configuration boundaries."""
import voluptuous as vol
from homeassistant import config_entries
from .const import DOMAIN, DEFAULTS

ENTITY_KEYS = {
    "grid", "pv", "hp_power", "room", "outdoor", "water", "price",
    "weather", "weather_entity", "hp", "dhw", "nilan",
}

def schema(values):
    fields = {}
    for key, default in DEFAULTS.items():
        value = values.get(key, default)
        if key == "energy_mode":
            validator = vol.In(["normal", "comfort", "economy", "holiday"])
        elif key in ENTITY_KEYS:
            validator = str
        elif isinstance(default, bool):
            validator = bool
        elif isinstance(default, float):
            validator = vol.Coerce(float)
        elif isinstance(default, int):
            validator = vol.Coerce(int)
        else:
            validator = type(default)
        fields[vol.Required(key, default=value)] = validator
    return vol.Schema(fields)

class Flow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 2

    async def async_step_user(self, user_input=None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="AI Energy Manager", data=user_input)
        return self.async_show_form(step_id="user", data_schema=schema(DEFAULTS))

    @staticmethod
    def async_get_options_flow(config_entry):
        return Options()

class Options(config_entries.OptionsFlow):
    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)
        return self.async_show_form(
            step_id="init",
            data_schema=schema({**self.config_entry.data, **self.config_entry.options}),
        )
