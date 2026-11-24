from datetime import timedelta
import logging, math
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from .const import DEFAULTS
_LOGGER = logging.getLogger(__name__)
class Engine(DataUpdateCoordinator):
    def __init__(self,hass,entry):
        super().__init__(hass,_LOGGER,name="AI Energy Manager",update_interval=timedelta(minutes=5))
        self.c={**DEFAULTS,**entry.data,**entry.options}
        self.store=Store(hass,1,"ai_energy_manager_"+entry.entry_id)
        self.saved=None
    def state(self,k): return self.hass.states.get(self.c[k])
    def num(self,k):
        try:
            s=self.state(k); v=float(s.state)
            if not math.isfinite(v): return None
            if k in ("grid","pv","hp_power"):
                u=s.attributes.get("unit_of_measurement")
                if u not in ("W","kW"): return None
                v*=1000 if u=="kW" else 1
            return v
        except (ValueError,TypeError,AttributeError): return None
    async def command(self,k,value):
        await self.hass.services.async_call("climate","set_temperature",{"entity_id":self.c[k],"temperature":value},blocking=True)
    async def _async_update_data(self):
        c=self.c; now=dt_util.utcnow().timestamp()
        if self.saved is None: self.saved=await self.store.async_load() or {}
        m=self.saved; log=m.setdefault("log",[])
        grid,pv,hp,room,out,water,price=[self.num(k) for k in ("grid","pv","hp_power","room","outdoor","water","price")]
        export=(grid if c["export_positive"] else -grid) if grid is not None else None
        available=export+max(0,hp) if export is not None and hp is not None else None
        nilan=self.state("nilan"); cooling=nilan is not None and (nilan.state=="cool" or nilan.attributes.get("hvac_action")=="cooling")
        alarm=self.hass.states.get("binary_sensor.hp_alarm")
        safe=all(v is not None for v in (grid,pv,hp,room,out,water,price)) and alarm is not None and alarm.state=="off" and nilan is not None and nilan.state not in ("unknown","unavailable") and 15<=c["normal"]<=24 and c["normal"]<=c["maximum"]<=25 and 0<=c["boost"]<=1 and c["start_w"]>c["stop_w"]>=0
        forecast=self.state("weather"); lows=[]
        for f in (forecast.attributes.get("forecast",[]) if forecast else [])[:3]:
            try:
                t=dt_util.parse_datetime(f["datetime"])
                if t and -86400 <= t.timestamp()-now <=172800: lows.append(float(f.get("templow",f["temperature"])))
            except (ValueError,TypeError,KeyError): pass
        cold=min(lows) if lows else out
        comp=self.hass.states.get("binary_sensor.hp_compressor")
        prev=m.get("sample")
        if room is not None and c["room_verified"]:
            if prev and comp and comp.state=="off" and prev[2] and 240<=now-prev[0]<=900:
                rate=(prev[1]-room)*3600/(now-prev[0])
                if 0<=rate<=2: m["cooling_rate"]=round(.9*m.get("cooling_rate",rate)+.1*rate,3)
            m["sample"]=[now,room,bool(comp and comp.state=="off")]
        solar=bool(safe and pv>500 and available>= (c["stop_w"] if m.get("solar") else c["start_w"]) and export>=-c["stop_w"])
        if solar:
            m.setdefault("solar_since",now)
        else: m.pop("solar_since",None)
        solar=solar and (m.get("solar",False) or now-m.get("solar_since",now)>=900)
        m["solar"]=solar
        cheap=bool(safe and price<=c["cheap"] and cold is not None and cold<5)
        boost=bool(safe and c["room_verified"] and not cooling and room<c["maximum"]-.2 and (solar or cheap) and out<15)
        target=round(min(c["maximum"],c["normal"]+c["boost"]) if boost else c["normal"],1)
        reason="Sensorfejl eller alarm – ingen nye boosts" if not safe else "Nilan køler – ingen ekstra rumvarme" if cooling else "Soloverskud – forvarmning" if boost and solar else "Billig strøm og koldt vejr – forvarmning" if boost else "Normal lokal regulering"
        hpstate=self.state("hp")
        try:
            current=float(hpstate.attributes.get("temperature"))
            if m.get("owned") is not None and abs(current-m["owned"])>.11: m.pop("owned",None); m["manual_hold"]=True
            if m.get("owned") is not None and (not boost or not c["write_heat"]):
                await self.command("hp",m["baseline"]); m.pop("owned",None); log.append("Rumsetpunkt gendannet")
            elif boost and c["write_heat"] and not m.get("manual_hold") and m.get("owned") is None and abs(current-c["normal"])<=.11:
                m["baseline"]=current; m["owned"]=target; await self.store.async_save(m); await self.command("hp",target); log.append(f"IVT boost {target} °C")
        except Exception as e: log.append("IVT kommando ikke bekræftet: "+str(e)[:100])
        if safe and c["write_water"] and (solar or cheap) and water<c["water_min"] and now-m.get("water_last",0)>21600:
            try:
                if float(self.state("dhw").attributes.get("temperature"))==0:
                    m["water_last"]=now; await self.store.async_save(m); await self.command("dhw",60); log.append("Ekstra varmtvand 60 minutter")
            except Exception as e: log.append("Varmtvandskommando ikke bekræftet: "+str(e)[:100])
        if m.get("reason")!=reason: log.append(dt_util.now().isoformat(timespec="minutes")+" "+reason)
        m["reason"]=reason; m["log"]=log[-30:]; await self.store.async_save(m)
        return {"status":reason,"solar":solar,"export":export,"pv":pv,"hp_power":hp,"target":target,"price":price,"room":room,"water":water,"forecast_low":cold,"cooling_rate":m.get("cooling_rate"),"nilan":nilan.state if nilan else None,"log":m["log"],"manual_hold":m.get("manual_hold",False)}
