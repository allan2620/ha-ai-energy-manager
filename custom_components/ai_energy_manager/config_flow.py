import voluptuous as vol
from homeassistant import config_entries
from .const import DOMAIN, DEFAULTS

def schema(values):
    return vol.Schema({vol.Required(k, default=values.get(k,v)): type(v) for k,v in DEFAULTS.items()})

class Flow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1
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
        return self.async_show_form(step_id="init", data_schema=schema({**self.config_entry.data, **self.config_entry.options}))
