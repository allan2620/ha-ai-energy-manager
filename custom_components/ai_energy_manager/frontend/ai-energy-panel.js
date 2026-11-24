/* AI Energy Manager – Nordic Night sidebar panel; uses only Home Assistant state */
class AIEnergyPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this.tab="overblik";
    this._hass=null;
    this._entryId="";
    this._layout=false;
  }
  set hass(value) { this._hass=value; this.render(); }
  set panel(value) { this._panel=value; this.render(); }
  set narrow(value) { this._narrow=value; this.render(); }
  esc(v) { return String(v == null ? "—" : v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  state(id) { return this._hass?.states?.[id]; }
  val(id,unit="") {
    const s=this.state(id); if(!s || ["unknown","unavailable"].includes(s.state))return "—";
    const n=Number(s.state); return (Number.isFinite(n) && s.state.trim()!=="" ? (Math.round(n*10)/10).toLocaleString("da-DK") : this.esc(s.state))+(unit ? " "+unit : "");
  }
  metric(name,id,unit="",icon="mdi:flash") {
    return '<article class="metric"><div class="label"><ha-icon icon="'+icon+'"></ha-icon>'+this.esc(name)+'</div><div class="number">'+this.val(id,unit)+'</div></article>';
  }
  line(label,id,unit="") { return '<div class="line"><span>'+this.esc(label)+'</span><strong>'+this.val(id,unit)+'</strong></div>'; }
  render() {
    if(!this._hass)return;
    const s=this._hass.states;
    const idByName=(name)=>Object.keys(s).find(k=>k.startsWith("sensor.ai_energy_manager_")&&s[k].attributes?.friendly_name===name);
    const status=idByName("AI Energy Manager Status")||"sensor.ai_energy_manager_status";
    const logs=this.state(status)?.attributes?.beslutninger||[];
    const stats={
      overblik: '<div class="grid">'+
        this.metric("Solproduktion","sensor.danfoss_tlx_pro_241202n272_grid_power_total","W","mdi:solar-power")+
        this.metric("Netforbrug","sensor.p1_meter_power","W","mdi:transmission-tower")+
        this.metric("IVT effekt","sensor.hp_power_consumption","kW","mdi:heat-pump")+
        this.metric("Elpris","sensor.energi_data_service","kr/kWh","mdi:currency-eur")+
        this.metric("Rumtemperatur","sensor.boiler_room_nilan_user_panel_temperature_t15","°C","mdi:home-thermometer")+
        this.metric("Varmtvand","sensor.hp_warm_water_1_top","°C","mdi:water-thermometer")+
        '</div><section><h2>Systemets beslutning</h2><p class="decision">'+this.esc(this.state(status)?.state||"Afventer integrationens status")+'</p></section>',
      ivt: '<section><h2>IVT Greenline C11</h2>'+
        this.line("Kompressor","binary_sensor.hp_compressor")+
        this.line("Rumsetpunkt","climate.hp_room_temp_setpoint")+
        this.line("Varmekurve","climate.hp_heat_set_1_curvel")+
        this.line("Forskydning","climate.hp_heat_set_3_parallel")+
        this.line("Fremløb","sensor.hp_heat_carrier_forwrd","°C")+
        this.line("Returløb","sensor.hp_heat_carrier_return","°C")+
        this.line("Udetemperatur","sensor.hp_outdoor","°C")+
        this.line("Varmtvand top","sensor.hp_warm_water_1_top","°C")+
        this.line("Ekstra varmtvand","climate.hp_extra_warm_water")+'</section>',
      nilan: '<section><h2>Nilan ventilation</h2>'+
        this.line("Drift","climate.boiler_room_nilan_hvac")+
        this.line("Returluft T3","sensor.boiler_room_nilan_return_air_temperature_t3","°C")+
        this.line("Panel T15","sensor.boiler_room_nilan_user_panel_temperature_t15","°C")+
        this.line("Indblæsning T7","sensor.boiler_room_nilan_supply_air_temperature_t7","°C")+
        this.line("Udeluft T8","sensor.boiler_room_nilan_fresh_air_intake_temperature_t8","°C")+
        this.line("Fugt","sensor.boiler_room_nilan_humidity","%")+
        this.line("Varmegenvinding","sensor.boiler_room_nilan_exchanger_efficiency","%")+
        this.line("Indblæsningsventilator","sensor.boiler_room_nilan_supply_fan_speed","%")+
        this.line("Udsugningsventilator","sensor.boiler_room_nilan_return_fan_speed","%")+'</section>',
      energi: '<section><h2>Sol, strøm og pris</h2>'+
        this.line("Danfoss produktion","sensor.danfoss_tlx_pro_241202n272_grid_power_total","W")+
        this.line("Solstreng 1","sensor.danfoss_tlx_pro_241202n272_pv_power_string_1","W")+
        this.line("Solstreng 2","sensor.danfoss_tlx_pro_241202n272_pv_power_string_2","W")+
        this.line("P1 nettoeffekt","sensor.p1_meter_power","W")+
        this.line("Elpris DK1","sensor.energi_data_service","kr/kWh")+
        this.line("CO₂","sensor.energi_data_service_co2","g/kWh")+'</section>',
      vejr: '<section><h2>Vejr og forventet varmebehov</h2>'+
        this.line("Aktuel vejrtype","weather.forecast_hjem")+
        this.line("Udetemperatur","sensor.hp_outdoor","°C")+
        this.line("Prognose laveste temperatur",idByName("AI Energy Manager Prognose minimum")||"sensor.ai_energy_manager_prognose_minimum","°C")+
        this.line("Observeret afkøling",idByName("AI Energy Manager Observeret afkøling")||"sensor.ai_energy_manager_observeret_afkoling","°C/t")+'</section>',
      log: '<section><h2>Seneste beslutninger</h2>'+ (logs.length?logs.slice(-25).reverse().map(t=>'<div class="event">'+this.esc(t)+'</div>').join(""):'<p>Ingen beslutninger registreret endnu.</p>')+'</section>',
      settings: '<section><h2>Indstillinger</h2><p>Alle skrivefunktioner er deaktiveret ved første installation. Vælg og kontrollér dine sensorer i integrationens indstillinger.</p><p>For at ændre enheder og grænseværdier: Indstillinger → Enheder og tjenester → AI Energy Manager → Konfigurer.</p><a class="action" href="/config/integrations">Åbn integrationsindstillinger</a></section>'
    };
    const tabs=[["overblik","Overblik"],["ivt","IVT / vand"],["nilan","Nilan"],["energi","Sol og el"],["vejr","Vejr"],["log","Beslutningslog"],["settings","Indstillinger"]];
    this.shadowRoot.innerHTML=`
      <style>
       :host{display:block;min-height:100%;background:#111925;color:#e5edf7;font-family:Roboto,"Segoe UI",sans-serif;box-sizing:border-box}
       *{box-sizing:border-box}main{max-width:1220px;margin:auto;padding:20px}
       header{display:flex;gap:14px;align-items:center;margin-bottom:20px}
       header ha-icon{color:#88c0d0;--mdc-icon-size:38px}#menu-btn{display:none}@media(max-width:870px){#menu-btn{display:inline-block}}
       h1{font-size:26px;margin:0}small{color:#9aafc7}h2{font-size:18px;margin:0 0 16px}
       nav{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:22px}
       button{font:inherit;border:1px solid #36485c;background:#1c2a3a;color:#c3d4e7;border-radius:10px;padding:10px 14px;cursor:pointer}
       button.active{background:#324960;color:#fff;border-color:#88c0d0}
       .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:13px;margin-bottom:15px}
       .metric,section{background:#1c2838;border:1px solid #334357;border-radius:16px;padding:19px;margin-bottom:15px;box-shadow:0 4px 14px #070e191f}
       .label{color:#a9bed3;font-size:14px;display:flex;gap:9px;align-items:center}
       ha-icon{--mdc-icon-size:21px;color:#88c0d0}.number{font-size:26px;font-weight:650;margin-top:14px}
       .line{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 0;border-bottom:1px solid #334357}
       .line:last-child{border:none}.line span{color:#afc0d4}.line strong{text-align:right;overflow-wrap:anywhere}
       .event{padding:12px;border-bottom:1px solid #364357;color:#dce7f2}.decision{font-size:18px;color:#a3be8c}
       .action{display:inline-block;padding:11px 16px;border-radius:10px;background:#36536b;color:white;text-decoration:none;margin-top:10px}
       .note{color:#9baec2;font-size:13px;margin-top:15px}
       @media(max-width:600px){main{padding:12px}h1{font-size:21px}.metric{padding:15px}}
      </style>
      <main><header><button id="menu-btn" aria-label="Åbn Home Assistant-menu" title="Åbn menu">☰</button><ha-icon icon="mdi:brain"></ha-icon><div><h1>AI Energy Manager</h1><small>Nordic Night · Intelligent energioverblik</small></div></header>
      <nav>${tabs.map(([k,t])=>'<button data-tab="'+k+'" class="'+(k===this.tab?'active':'')+'">'+t+'</button>').join("")}</nav>
      <div id="content">${stats[this.tab]||stats.overblik}</div>
      <p class="note">Live data fra Home Assistant · Beslutningsmotoren er regelbaseret · Fysiske ændringer kræver særskilt aktivering.</p>
      </main>`;
    this.shadowRoot.querySelector("#menu-btn")?.addEventListener("click",()=>this.dispatchEvent(new Event("hass-toggle-menu",{bubbles:true,composed:true})));
    this.shadowRoot.querySelectorAll("button[data-tab]").forEach(btn=>btn.addEventListener("click",()=>{this.tab=btn.dataset.tab;this.render()}));
  }
}
if(!customElements.get("ai-energy-panel"))customElements.define("ai-energy-panel",AIEnergyPanel);
