"""Config flow with searchable Home Assistant entity selectors."""
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers import selector

from .const import DOMAIN, DEFAULTS


# Leave domain unrestricted: users should be able to search ALL entities.
# Sensor compatibility is checked by the runtime when data is read.
ENTITY_KEYS = {
    "grid", "pv", "hp_power", "room", "outdoor", "water",
    "price", "weather", "weather_entity", "hp", "dhw", "nilan",
    "heat_output",
}

# An optional config-entry identifier is NOT an entity ID.
OPTIONAL_KEYS = {"pv_forecast_entry", "heat_output"}


def schema(values):
    """Build native HA selectors for both the setup flow and options flow."""
    fields = {}
    for key, default in DEFAULTS.items():
        value = values.get(key, default)
        optional_empty = key in OPTIONAL_KEYS and not value
        field = (
            vol.Optional(key) if optional_empty
            else vol.Required(key, default=value)
        )
        if key in ENTITY_KEYS:
            validator = selector.EntitySelector(
                selector.EntitySelectorConfig()
            )
        elif key == "pv_forecast_entry":
            # Forecast.Solar config-entry ID, intentionally not an entity selector.
            validator = selector.ConfigEntrySelector(
                selector.ConfigEntrySelectorConfig(integration="forecast_solar")
            )
        elif key == "energy_mode":
            validator = vol.In(["normal", "comfort", "economy", "holiday"])
        elif isinstance(default, bool):
            validator = bool
        elif isinstance(default, float):
            validator = vol.Coerce(float)
        elif isinstance(default, int):
            validator = vol.Coerce(int)
        else:
            validator = type(default)
        fields[field] = validator
    return vol.Schema(fields)


class Flow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 2

    async def async_step_user(self, user_input=None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(
                title="AI Energy Manager", data=user_input
            )
        return self.async_show_form(
            step_id="user", data_schema=schema(DEFAULTS)
        )

    @staticmethod
    def async_get_options_flow(config_entry):
        return Options()


class Options(config_entries.OptionsFlow):
    async def async_step_init(self, user_input=None):
        if user_input is not None:
            # Omitting an optional selector must clear an older override.
            # Other fields retain their input values.
            return self.async_create_entry(title="", data=user_input)
        return self.async_show_form(
            step_id="init",
            data_schema=schema({
                **self.config_entry.data, **self.config_entry.options
            }),
        )
