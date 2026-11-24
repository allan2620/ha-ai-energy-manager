/* AI Energy Manager single-page Nordic Night dashboard.
 * Display only. Simulation never calls Home Assistant services.
 */
class AIEnergyPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this.demo=false;
    this._hass=null;
    this._renderQueued=false;
  }
  set hass(v) {
    this._hass=v;
    if (!this._renderQueued) {
      this._renderQueued=true;
      requestAnimationFrame(()=>{this._renderQueued=false;this.render();});
    }
  }
  set panel(v) {this._panel=v;}
  set narrow(v) {this._narrow=v;}
  esc(v) {return String(v??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  st(id) {return this._hass?.states?.[id];}
  n(id) {
    const s=this.st(id);
    if (!s || ["unknown","unavailable","none"].includes(s.state)) return null;
    const v=Number(s.state);
    return Number.isFinite(v)?v:null;
  }
  t(id) {const x=this.st(id);return x&&!["unknown","unavailable"].includes(x.state)?x.state:null;}
  a(id,key) {return this.st(id)?.attributes?.[key]??null;}
  fmt(v,dec=1) {return v===null||!Number.isFinite(v)?"—":v.toLocaleString("da-DK",{minimumFractionDigits:dec,maximumFractionDigits:dec});}
  kpi(icon,title,value,sub,color="ice") {
    return '<div class="kpi"><ha-icon icon="'+icon+'" class="'+color+'"></ha-icon><div><span>'+this.esc(title)+'</span><strong>'+this.esc(value)+'</strong><small>'+this.esc(sub)+'</small></div></div>';
  }
  line(label,val) {return '<div class="line"><span>'+this.esc(label)+'</span><strong>'+this.esc(val)+'</strong></div>';}
  panel(title,icon,html,extra="") {return '<section class="panel '+extra+'"><h2><ha-icon icon="'+icon+'"></ha-icon>'+title+'</h2>'+html+'</section>';}
  chart(prices,nowHour) {
    if (!prices?.length) return '<div class="empty">Ingen elprisprognose endnu</div>';
    const n=Math.min(prices.length,24), max=Math.max(1,...prices.filter(Number.isFinite))*1.1;
    return '<div class="bars">'+prices.slice(0,n).map((p,i)=>{
      const h=Math.max(3,Math.min(100,(Number(p)||0)/max*100));
      const col=p<2.4?"green":p<3.4?"amber":"red";
      return '<div class="bar '+col+(i===nowHour?' now':'')+'" style="height:'+h+'%" title="'+this.esc(i+':00 · '+this.fmt(p,2)+' kr/kWh')+'"></div>';
    }).join("")+'</div><div class="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>';
  }
  weatherCards() {
    if(this.demo) {
      return [['I dag','mdi:weather-partly-cloudy','−2 / 2 °C'],['I morgen','mdi:weather-cloudy','−1 / 4 °C'],['Om 2 dage','mdi:weather-sunny','0 / 5 °C']].map(x=>'<div class="day"><span>'+x[0]+'</span><ha-icon icon="'+x[1]+'"></ha-icon><b>'+x[2]+'</b></div>').join("");
    }
    const f=this.a("sensor.custom_weather_forecast_daily","forecast");
    if (!Array.isArray(f)||!f.length) return '<div class="empty">Vejrdata mangler</div>';
    return f.slice(0,3).map((x,i)=>{
      const lo=Number.isFinite(Number(x.templow))?this.fmt(Number(x.templow),0):"—";
      const hi=Number.isFinite(Number(x.temperature))?this.fmt(Number(x.temperature),0):"—";
      const cond=String(x.condition||"cloudy");
      const icon={sunny:"mdi:weather-sunny",cloudy:"mdi:weather-cloudy",partlycloudy:"mdi:weather-partly-cloudy",rainy:"mdi:weather-rainy",snowy:"mdi:weather-snowy" }[cond]||"mdi:weather-cloudy";
      return '<div class="day"><span>'+["I dag","I morgen","Om 2 dage"][i]+'</span><ha-icon icon="'+icon+'"></ha-icon><b>'+lo+' / '+hi+' °C</b></div>';
    }).join("");
  }
  render() {
    if(!this._hass) return;
    const demo=this.demo;
    const pv=demo?2900:this.n("sensor.danfoss_tlx_pro_241202n272_grid_power_total");
    const net=demo?1400:this.n("sensor.p1_meter_power");
    const hp=demo?2100:(v=>v===null?null:v*1000)(this.n("sensor.hp_power_consumption"));
    const price=demo?2.70:this.n("sensor.energi_data_service");
    const outdoor=demo?-0.9:(this.n("sensor.hp_outdoor")??this.a("weather.forecast_hjem","temperature"));
    const water=demo?49:this.n("sensor.hp_warm_water_1_top");
    const room=demo?21.2:this.n("sensor.boiler_room_nilan_user_panel_temperature_t15");
    const supply=demo?33.4:this.n("sensor.hp_heat_carrier_forwrd");
    const ret=demo?33.2:this.n("sensor.hp_heat_carrier_return");
    const nilan=demo?"heat":this.t("climate.boiler_room_nilan_hvac");
    const fan=demo?"2":this.a("climate.boiler_room_nilan_hvac","fan_mode");
    const humidity=demo?44:this.n("sensor.boiler_room_nilan_humidity");
    const efficiency=demo?60:this.n("sensor.boiler_room_nilan_exchanger_efficiency");
    const t3=demo?18:this.n("sensor.boiler_room_nilan_return_air_temperature_t3");
    const t15=demo?24.1:this.n("sensor.boiler_room_nilan_user_panel_temperature_t15");
    const temp=demo?21.5:this.a("climate.hp_room_temp_setpoint","temperature");
    const waterTarget=demo?53:this.a("climate.hp_warm_water_stop_temp","temperature");
    const extra=demo?60:this.a("climate.hp_extra_warm_water","temperature");
    const comp=demo?"on":this.t("binary_sensor.hp_compressor");
    const selected=Object.values(this._hass.states||{}).find(x=>x.entity_id.startsWith("sensor.ai_energy_manager_")&&x.attributes?.friendly_name==="AI Energy Manager Status");
    const status=demo?"Simulering: Sol og billig varme prioriteres":selected?.state||"Afventer AI Energy Manager";
    const logs=demo?[
      "12:10 Soloverskud registreret","12:15 Eksempel: IVT boost +0,5 °C","12:20 Eksempel: ekstra varmtvand 60 min","12:25 Nilan i varmegenvinding","12:30 Egetforbrug prioriteret"
    ]:selected?.attributes?.beslutninger||[];
    const faults=demo?[]:selected?.attributes?.fejl||[];
    const data=this.a("sensor.energi_data_service","today");
    const prices=demo?[2.2,2.1,2,2,2,2.1,2.2,2.5,2.7,2.9,2.7,2.6,2.5,2.7,2.9,3.2,3.8,4.4,4.1,3.9,3.7,2.7,2.6,2.5]:Array.isArray(data)?data.map(Number):[];
    const today=demo?2.9:this.n("sensor.danfoss_tlx_pro_241202n272_production_today_log");
    const netLabel=net===null?"Ukendt":net>0?"Import":net<0?"Eksport":"Balance";
    // The display intentionally does not infer actual solar export from production.
    const pvFormatted=pv===null?"—":this.fmt(pv/1000)+" kW";
    const gridFormatted=net===null?"—":this.fmt(Math.abs(net)/1000)+" kW";
    const hpFormatted=hp===null?"—":this.fmt(hp/1000)+" kW";
    const statusColor=faults.length?"warn":"ok";
    const logLines=(Array.isArray(logs)?logs:[]).slice(-5).reverse();
    const on=demo?true:comp==="on";
    const flow='<div class="flow-grid">'+
      '<div class="sources"><div class="flowbox solar"><ha-icon icon="mdi:solar-panel"></ha-icon><div>Solceller<strong>'+pvFormatted+'</strong></div></div>'+
      '<div class="arrow"><span>Solproduktion</span><b>→</b></div>'+
      '<div class="flowbox"><ha-icon icon="mdi:transmission-tower"></ha-icon><div>Elnet<strong>'+gridFormatted+' '+netLabel.toLowerCase()+'</strong></div></div></div>'+
      '<div class="house"><svg class="house-art" viewBox="0 0 340 202" role="img" aria-label="Illustration af hus med solceller"><defs><linearGradient id="roof" x2="1" y2="1"><stop stop-color="#54799e"/><stop offset="1" stop-color="#1b314b"/></linearGradient></defs><path d="M24 104L172 21l145 83v88H24Z" fill="#172d43" stroke="#6b94ad" stroke-width="3"/><path d="M11 108L172 10l157 98-22 3-135-76-136 76Z" fill="url(#roof)" stroke="#82accc" stroke-width="2"/><path d="M84 73L166 29l69 40-85 47Z" fill="#163a61" stroke="#4b91ba" stroke-width="2"/><path d="M110 61l67 39M134 48l67 40M156 36l67 40M107 91l87-48" fill="none" stroke="#5699c2" stroke-width="2"/><rect x="52" y="121" width="78" height="50" rx="4" fill="#cc9358" opacity=".92"/><rect x="145" y="121" width="65" height="71" rx="3" fill="#ddad66"/><rect x="231" y="121" width="60" height="50" rx="3" fill="#d59c65"/><path d="M91 121v50M262 121v50" stroke="#344c60" stroke-width="4"/><text x="170" y="192" text-anchor="middle" fill="#fff" font-size="13">HUS</text></svg><strong>Hjemmets energiflow</strong><small>Sol · Elnet · Forbrug</small></div>'+
      '<div class="targets"><div class="flowbox"><ha-icon icon="mdi:heat-pump"></ha-icon><div>IVT varmepumpe<strong>'+hpFormatted+' · '+(on?"Kompressor kører":"Kompressor stoppet")+'</strong></div></div>'+
      '<div class="flowbox"><ha-icon icon="mdi:water-boiler"></ha-icon><div>Varmtvand<strong>'+this.fmt(water)+' °C · '+(extra>0?"Ekstra varmtvand valgt":"Normal drift")+'</strong></div></div>'+
      '<div class="flowbox"><ha-icon icon="mdi:fan"></ha-icon><div>Nilan<strong>'+this.esc(nilan||"Ukendt")+' · ventilation</strong></div></div></div>'+
      '</div>';
    this.shadowRoot.innerHTML=String.raw\`
<style>
:host{display:block;min-height:100vh;background:#0b1421;color:#e5edf7;font:14px/1.45 Roboto,Arial,sans-serif;--bg:#18283b;--edge:#344b61;--ice:#88c0d0;--green:#a3be8c;--yellow:#ebcb8b}
*{box-sizing:border-box}main{max-width:1700px;margin:auto;padding:18px 22px 25px}ha-icon{color:var(--ice);--mdc-icon-size:25px}
header{display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}
h1{font-size:29px;letter-spacing:.2px;margin:0}header p{color:#a9bed0;margin:0;font-size:13px}
header .spacer{flex:1}
button,.action{cursor:pointer;background:#263b51;border:1px solid #48637e;color:#e5edf7;border-radius:9px;padding:9px 14px;font:inherit;text-decoration:none;display:inline-flex;gap:8px;align-items:center}
button:focus-visible,.action:focus-visible{outline:2px solid #a3be8c;outline-offset:2px}
button.active{background:#315c50;border-color:#76ab91;color:#e4ffe8}
.grid-kpi{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
.kpi{background:linear-gradient(145deg,#1d3046,#142131);border:1px solid var(--edge);border-radius:14px;padding:14px 12px;display:flex;align-items:center;gap:12px;min-width:0}
.kpi>ha-icon{--mdc-icon-size:29px;flex-shrink:0}.kpi span{font-size:12px;color:#b6c8dc;display:block}.kpi strong{display:block;font-size:22px;white-space:nowrap}.kpi small{font-size:11px;color:#a3b6cc;display:block}
.kpi .green,.green{color:#a3be8c}.kpi .amber{color:#ebcb8b}.kpi .red{color:#d88c8c}
.panel{background:linear-gradient(145deg,#15283c,#132135);border:1px solid #304a61;border-radius:15px;padding:16px 18px;min-width:0;overflow:hidden}
h2{font-size:17px;margin:0 0 13px;display:flex;gap:9px;align-items:center}h2 ha-icon{--mdc-icon-size:24px}
.hero{margin-top:12px;padding:16px 20px}.decision{margin:auto auto 12px;max-width:900px;border:1px solid #426b51;background:#17392f;color:#bcf3c2;text-align:center;border-radius:12px;padding:9px 13px;font-weight:600}.decision.warn{border-color:#a87752;background:#362d28;color:#f1c2a4}
.flow-grid{display:grid;grid-template-columns:1fr 1.3fr 1.18fr;gap:12px;align-items:center}
.sources,.targets{display:grid;gap:9px}.flowbox{border:1px solid #416078;background:#17293d;border-radius:11px;padding:11px;display:flex;align-items:center;gap:12px;min-height:68px}
.flowbox ha-icon{--mdc-icon-size:29px}.flowbox strong{display:block;color:#f5faff;font-size:17px}.solar{border-color:#3a8067}.solar ha-icon{color:#a3e9b4}.arrow{display:flex;justify-content:space-between;padding:0 13px;color:#97cbb0;font-size:12px}.arrow b{font-size:18px}.house{text-align:center}.house-art{width:100%;max-height:185px;display:block;filter:drop-shadow(0 7px 13px #050b12)}.house strong{display:block}.house small{color:#a6bdd0}
.hero-foot{text-align:center;color:#a9c4db;font-size:12px;margin:10px 0 0}
.middle{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
.content-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}.line{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #344a60;padding:8px 0;color:#b8c8da}.line strong{color:#fff;text-align:right}.line:last-child{border:0}
.minichart{height:127px;display:flex;align-items:center;justify-content:center}.minichart svg{width:100%;height:100%}.legend{font-size:11px;color:#b8cad7}.legend b{color:#91d4ef}
.bottom{display:grid;grid-template-columns:1fr 1fr 1.4fr 1.3fr;gap:12px;margin-top:12px}
.statbig{font-size:26px;color:#a3eeb3;font-weight:700;margin:6px 0}.forecast-days{display:flex;justify-content:space-around;gap:6px}.day{display:flex;flex:1;gap:9px;flex-direction:column;text-align:center;align-items:center;border-right:1px solid #344a60}.day:last-child{border:0}.day>span{font-size:12px;color:#a9bbcc}.day ha-icon{--mdc-icon-size:32px}.day b{white-space:nowrap}
.bars{height:106px;display:flex;align-items:end;gap:2px;padding:0 3px;border-bottom:1px solid #627389}.bar{flex:1;min-width:1px;background:#8cc992;border-radius:2px 2px 0 0}.bar.amber{background:#e9bb66}.bar.red{background:#db8987}.bar.now{outline:2px solid #f0f2f8}.axis{display:flex;justify-content:space-between;color:#aab8c9;font-size:11px;padding-top:5px}
.event{padding:7px 0;border-bottom:1px solid #34485b;display:flex;align-items:flex-start;gap:9px;font-size:12px}.event:before{content:"●";color:#a3be8c}.event:last-child{border:0}
.muted,.empty{color:#a9bbca}.foot{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:9px;color:#9fb0c1;font-size:12px;margin-top:13px}
.demo-label{background:#664b27;color:#ffe4a9;border:1px solid #b58b48;border-radius:10px;padding:5px 9px;font-size:12px}
@media(max-width:1250px){.grid-kpi{grid-template-columns:repeat(3,1fr)}.bottom{grid-template-columns:repeat(2,1fr)}} 
@media(max-width:800px){main{padding:12px}.flow-grid{grid-template-columns:1fr}.middle,.bottom{grid-template-columns:1fr}.grid-kpi{grid-template-columns:repeat(2,minmax(0,1fr))}.content-cols{grid-template-columns:1fr}h1{font-size:23px}}
@media(max-width:480px){.grid-kpi{grid-template-columns:1fr 1fr}.kpi{padding:10px;gap:7px}.kpi strong{font-size:18px}.kpi>ha-icon{--mdc-icon-size:22px}}
</style>
<main>
<header>
<button id="menu-btn" aria-label="Åbn menu"><ha-icon icon="mdi:menu"></ha-icon></button>
<ha-icon icon="mdi:brain" style="--mdc-icon-size:35px"></ha-icon>
<div><h1>AI Energy Manager</h1><p>Nordic Night · Samlet energistyring</p></div>
<div class="spacer"></div>
\${demo?'<span class="demo-label">SIMULATION · ingen kommandoer sendes</span>':'<span class="muted">LIVE · data fra Home Assistant</span>'}
<button id="simulate" class="\${demo?'active':''}"><ha-icon icon="mdi:play-circle-outline"></ha-icon>\${demo?'Afslut simulation':'Simulér drift'}</button>
<a class="action" href="/config/integrations"><ha-icon icon="mdi:cog-outline"></ha-icon>Indstillinger</a>
</header>
<div class="grid-kpi">
\${this.kpi("mdi:solar-power","Solproduktion",pvFormatted,"Danfoss TLX","amber")}
\${this.kpi("mdi:transmission-tower","Elnet",gridFormatted,netLabel,net>0?"red":"green")}
\${this.kpi("mdi:heat-pump","IVT varmepumpe",hpFormatted,on?"Kompressor aktiv":"Aktuel effekt")}
\${this.kpi("mdi:fan","Nilan ventilation",this.esc(nilan||"—"),"Ventilatortrin "+this.esc(fan??"—"),"green")}
\${this.kpi("mdi:cash","Elpris",this.fmt(price,2)+" kr","DK1 · pr. kWh","amber")}
\${this.kpi("mdi:thermometer","Udetemperatur",this.fmt(outdoor)+" °C","Aktuel måling")}
</div>
<section class="panel hero">
<div class="decision \${statusColor}">\${this.esc(status)}</div>
\${flow}
<p class="hero-foot">Energiflowet viser målte effekter og driftstilstande. Pilene er illustrative og udgør ikke en måling af individuel strømfordeling.</p>
</section>
<div class="middle">
\${this.panel("IVT + varmtvand","mdi:radiator",
'<div class="content-cols"><div>'+
this.line("Rumtemperatur (T15)",this.fmt(room)+" °C")+
this.line("IVT rumsetpunkt",this.fmt(temp)+" °C")+
this.line("Fremløb",this.fmt(supply)+" °C")+
this.line("Returløb",this.fmt(ret)+" °C")+
this.line("Varmtvand top",this.fmt(water)+" °C")+
this.line("Stoptemperatur",this.fmt(waterTarget)+" °C")+
this.line("Ekstra varmtvand",extra===null?"Ukendt":extra>0?this.fmt(Number(extra),0)+" min":"Ikke aktiv")+
'</div><div class="minichart"><svg viewBox="0 0 350 130" aria-label="Illustration af temperaturforløb"><path d="M5 20H345M5 50H345M5 80H345M5 110H345" stroke="#38526b" stroke-width="1"/><path d="M5 25C50 26 60 20 95 21S155 20 195 17 255 13 345 15" fill="none" stroke="#b48ead" stroke-width="3"/><path d="M5 77C45 75 75 73 100 76S170 72 195 74 280 69 345 70" fill="none" stroke="#a3be8c" stroke-width="3"/><path d="M5 105C50 104 95 102 140 104S245 101 345 102" fill="none" stroke="#88c0d0" stroke-width="3"/><text x="8" y="126" fill="#99aec0" font-size="11">Visuel illustration – ikke historiske sensordata</text></svg></div></div>')}
\${this.panel("Nilan ventilation","mdi:fan",
'<div class="content-cols"><div>'+
this.line("Drift",nilan||"Ukendt")+
this.line("Ventilatortrin",fan??"—")+
this.line("Fugt",this.fmt(humidity)+" %")+
this.line("Returluft T3",this.fmt(t3)+" °C")+
this.line("Panel T15",this.fmt(t15)+" °C")+
this.line("Varmegenvinding",this.fmt(efficiency)+" %")+
'</div><div class="vent-graphic"><ha-icon icon="mdi:home-thermometer-outline" style="--mdc-icon-size:95px;color:#92b6d5"></ha-icon><div style="margin-top:8px;color:#a3be8c">Varmegenvinding · ventilation</div><small class="muted">IVT-beslutning tager højde for aktiv køling i Nilan</small></div></div>')}
</div>
<div class="bottom">
\${this.panel("Sol & strøm","mdi:white-balance-sunny",
'<div class="muted">Produktion i dag</div><div class="statbig">'+this.fmt(today,2)+' kWh</div>'+
this.line("Aktuel produktion",pvFormatted)+
this.line("Netto på elnettet",gridFormatted+' '+netLabel.toLowerCase()))}
\${this.panel("Vejrudsigt","mdi:weather-partly-cloudy",'<div class="forecast-days">'+this.weatherCards()+'</div>')}
\${this.panel("Elpris & plan","mdi:chart-bar",this.chart(prices,new Date().getHours())+
'<p class="muted" style="font-size:12px;margin:8px 0 0">DK1 priser i dag · grøn = lav, gul = mellem, rød = høj</p>')}
\${this.panel("Hvad sker der nu?","mdi:clipboard-text-outline",
logLines.length?logLines.map(x=>'<div class="event">'+this.esc(x)+'</div>').join(""):'<div class="empty">Ingen beslutningshistorik endnu</div>')}
</div>
<div class="foot"><span>AI Energy Manager · Nordic Night · én samlet side</span><span>\${demo?'Simulerede eksempeldata · ingen påvirkning af varmeanlæg':'Live sensorer · styring afhænger af integrationens konfiguration'}</span></div>
</main>\`;
    this.shadowRoot.getElementById("simulate").addEventListener("click",()=>{this.demo=!this.demo;this.render();});
    this.shadowRoot.getElementById("menu-btn").addEventListener("click",()=>this.dispatchEvent(new Event("hass-toggle-menu",{bubbles:true,composed:true})));
  }
}
if(!customElements.get("ai-energy-panel")) customElements.define("ai-energy-panel",AIEnergyPanel);
