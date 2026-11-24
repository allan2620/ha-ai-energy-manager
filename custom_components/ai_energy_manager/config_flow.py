"""Config flow with HA native entity selectors and conservative auto-detect."""
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers import selector
from .autodetect import suggest_values
from .const import DOMAIN, DEFAULTS

ENTITY_KEYS = {
    "grid", "pv", "hp_power", "room", "outdoor", "water",
    "price", "weather", "weather_entity", "hp", "dhw", "nilan",
    "heat_output",
}
OPTIONAL_KEYS = {"pv_forecast_entry", "heat_output"}


def schema(values):
    """EntitySelector searches the user's own entities; no domain restriction."""
    fields = {}
    for key, default in DEFAULTS.items():
        value = values.get(key, default)
        if key in OPTIONAL_KEYS and not value:
            field = vol.Optional(key)
        else:
            field = vol.Required(key, default=value)
        if key in ENTITY_KEYS:
            validator = selector.EntitySelector(selector.EntitySelectorConfig())
        elif key == "pv_forecast_entry":
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


def available_states(hass):
    """Use the locally registered state machine, never a remote scan."""
    return {state.entity_id: state for state in hass.states.async_all()}


class Flow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 2

    async def async_step_user(self, user_input=None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(
                title="AI Energy Manager", data=user_input
            )
        # Suggested entity IDs are *only* form defaults. Users review/save.
        values = suggest_values(available_states(self.hass))
        return self.async_show_form(step_id="user", data_schema=schema(values))

    @staticmethod
    def async_get_options_flow(config_entry):
        return Options()


class Options(config_entries.OptionsFlow):
    def _values(self):
        return {**DEFAULTS, **self.config_entry.data, **self.config_entry.options}

    async def async_step_init(self, user_input=None):
        return self.async_show_menu(
            step_id="init",
            menu_options=["edit", "autodetect"],
        )

    async def async_step_edit(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)
        return self.async_show_form(
            step_id="edit", data_schema=schema(self._values())
        )

    async def async_step_autodetect(self, user_input=None):
        if user_input is not None:
            # Saving requires an explicit confirmation of the suggested values.
            return self.async_create_entry(title="", data=user_input)
        # Preserve valid user choices. Only replace missing/unavailable IDs
        # when a unique likely alternative exists.
        candidates = suggest_values(
            available_states(self.hass),
            self._values(),
            refresh_missing=True,
        )
        return self.async_show_form(
            step_id="autodetect", data_schema=schema(candidates),
            description_placeholders={
                "info": "Forslag er valgt ud fra eksisterende entities. Kontrollér især rumtemperatur, elmålerens fortegn og IVT før du gemmer. Automatisk styring aktiveres ikke."
            },
        )
