"""Explicit user acknowledgement to clear a manual intervention pause."""
from homeassistant.components.button import ButtonEntity
from .const import DOMAIN

async def async_setup_entry(hass, entry, async_add_entities):
    coordinator=hass.data[DOMAIN][entry.entry_id]
    async_add_entities([ResumeAutomation(coordinator, entry.entry_id)])

class ResumeAutomation(ButtonEntity):
    _attr_has_entity_name=True
    _attr_name="Ophæv manuel varmepause"
    _attr_icon="mdi:play-circle-outline"

    def __init__(self, coordinator, entry_id):
        self.coordinator=coordinator
        self._attr_unique_id=entry_id+"resume_manual_hold"
        self._attr_device_info={
            "identifiers": {(DOMAIN, entry_id)},
            "name": "AI Energy Manager",
        }

    async def async_press(self):
        if self.coordinator.saved is None:
            await self.coordinator.async_request_refresh()
        state=self.coordinator.saved
        if state is None:
            return
        state["manual_hold"]=False
        state.setdefault("log", []).append("Manuel varmepause ophævet af bruger")
        await self.coordinator.store.async_save(state)
        await self.coordinator.async_request_refresh()
