/* AI Energy Manager single-page Nordic Night dashboard.
 * Styled to match the provided mockup closely.
 * Simulation mode only changes visual data and never calls HA services.
 */
class AIEnergyPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.demo = false;
    this.selectedDetail = null;
    this.graphEntity = null;
    this.graphHours = 24;
    this.graphHistory = [];
    this.graphLoading = false;
    this.graphError = "";
    this._hass = null;
    this.editMode=false;
    this.editorError="";
    this.layout=null;
    this.layoutLoadStarted=false;
    this.layoutSaving=false;
    this._renderQueued = false;
    this._scrollInteractionUntil = 0;
    this._deferredRenderTimer = null;
    this._modePending = null;
    this.shadowRoot.addEventListener("focusout", () => {
      // A native select needs to stay mounted until the user has finished.
      if (!this._deferredRenderTimer) {
        this._deferredRenderTimer = setTimeout(() => {
          this._deferredRenderTimer = null;
          this.render();
        }, 200);
      }
    });
  }

  set hass(v) {
    this._hass = v;
    if(!this.layoutLoadStarted){this.layoutLoadStarted=true;this.loadLayout();}
    if(this.editMode)return;
    // Home Assistant can publish state changes several times per second.
    // Replacing shadowRoot.innerHTML while the select is active closes its
    // native menu; replacing the scroll rail resets its horizontal position.
    const focused = this.shadowRoot.activeElement;
    const editingControl = focused && ["SELECT", "INPUT", "TEXTAREA"].includes(focused.tagName);
    if (editingControl || Date.now() < this._scrollInteractionUntil) {
      if (!this._deferredRenderTimer) {
        this._deferredRenderTimer = setTimeout(() => {
          this._deferredRenderTimer = null;
          if (this._hass && !this.editMode) {
            const active = this.shadowRoot.activeElement;
            if (active && ["SELECT", "INPUT", "TEXTAREA"].includes(active.tagName)) return;
            if (Date.now() < this._scrollInteractionUntil) return;
            this.render();
          }
        }, 2200);
      }
      return;
    }
    if (!this._renderQueued) {
      this._renderQueued = true;
      requestAnimationFrame(() => {
        this._renderQueued = false;
        this.render();
      });
    }
  }
  set panel(v) { this._panel = v; }
  set narrow(v) { this._narrow = v; }

  esc(v) {
    return String(v ?? "—").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  st(id) { return this._hass?.states?.[id]; }
  n(id) {
    const s = this.st(id);
    if (!s || ["unknown", "unavailable", "none"].includes(String(s.state))) return null;
    const v = Number(s.state);
    return Number.isFinite(v) ? v : null;
  }
  txt(id) {
    const s = this.st(id);
    if (!s || ["unknown", "unavailable", "none"].includes(String(s.state))) return null;
    return String(s.state);
  }
  a(id, key) { return this.st(id)?.attributes?.[key] ?? null; }
  fmt(v, dec = 1) {
    return v === null || !Number.isFinite(v)
      ? "—"
      : v.toLocaleString("da-DK", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  pct(v) { return v === null || !Number.isFinite(v) ? "—" : this.fmt(v, 0) + " %"; }

  get liveStatusSensor() {
    const states = this._hass?.states || {};
    return Object.values(states).find((x) =>
      x.entity_id?.startsWith("sensor.ai_energy_manager_") &&
      x.attributes?.friendly_name === "AI Energy Manager Status"
    )?.entity_id || "sensor.ai_energy_manager_status";
  }

  seriesSvg() {
    return `
      <svg viewBox="0 0 360 150" aria-label="Temperaturgraf">
        <defs>
          <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#9b6de3" stop-opacity="0.20"/>
            <stop offset="100%" stop-color="#9b6de3" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <g stroke="#34506b" stroke-width="1">
          <line x1="32" y1="18" x2="350" y2="18"/>
          <line x1="32" y1="42" x2="350" y2="42"/>
          <line x1="32" y1="66" x2="350" y2="66"/>
          <line x1="32" y1="90" x2="350" y2="90"/>
          <line x1="32" y1="114" x2="350" y2="114"/>
          <line x1="32" y1="138" x2="350" y2="138"/>
        </g>
        <g fill="#9db2c9" font-size="10">
          <text x="4" y="21">56 °C</text>
          <text x="4" y="45">48 °C</text>
          <text x="4" y="69">40 °C</text>
          <text x="4" y="93">32 °C</text>
          <text x="4" y="117">24 °C</text>
          <text x="4" y="141">16 °C</text>
        </g>
        <path d="M32 34 C80 36, 100 32, 140 32 S220 28, 255 26 315 25, 350 24 L350 138 L32 138 Z" fill="url(#g1)"/>
        <path d="M32 34 C80 36, 100 32, 140 32 S220 28, 255 26 315 25, 350 24" fill="none" stroke="#cc8df5" stroke-width="3"/>
        <path d="M32 79 C70 77, 102 77, 140 76 S210 75, 255 73 320 72, 350 71" fill="none" stroke="#70dd8d" stroke-width="3"/>
        <path d="M32 109 C75 108, 110 107, 150 107 S245 106, 285 105 325 105, 350 104" fill="none" stroke="#77c6ff" stroke-width="3"/>
        <g fill="#9db2c9" font-size="10">
          <text x="28" y="149">06:00</text>
          <text x="80" y="149">07:00</text>
          <text x="132" y="149">08:00</text>
          <text x="184" y="149">09:00</text>
          <text x="236" y="149">10:00</text>
          <text x="320" y="149">12:00</text>
        </g>
      </svg>`;
  }

  energyHouseSvg() {
    return `
      <svg viewBox="0 0 520 220" class="house-svg" aria-label="Hus med energiflow">
        <defs>
          <linearGradient id="roofGlow" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="#355a7f"/>
            <stop offset="100%" stop-color="#12263a"/>
          </linearGradient>
          <linearGradient id="windowGlow" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#ffd498"/>
            <stop offset="100%" stop-color="#f2a94c"/>
          </linearGradient>
          <filter id="softGlow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <rect x="110" y="88" width="300" height="95" rx="6" fill="#17293d" stroke="#3e6382" stroke-width="3"/>
        <path d="M85 97 L260 18 L435 97" fill="none" stroke="#87b7de" stroke-width="6" stroke-linecap="round"/>
        <path d="M100 96 L260 28 L420 96 L394 100 L260 43 L126 100 Z" fill="url(#roofGlow)" stroke="#6f95b7" stroke-width="2"/>
        <polygon points="164,68 245,35 322,70 239,103" fill="#1c4b6b" stroke="#95d0f7" stroke-width="2"/>
        <g stroke="#8bc4f0" stroke-width="1">
          <line x1="179" y1="61" x2="256" y2="94"/><line x1="195" y1="54" x2="271" y2="87"/><line x1="210" y1="48" x2="286" y2="81"/><line x1="225" y1="42" x2="302" y2="75"/>
          <line x1="230" y1="39" x2="214" y2="97"/><line x1="249" y1="46" x2="232" y2="103"/><line x1="267" y1="54" x2="251" y2="110"/><line x1="286" y1="62" x2="270" y2="117"/>
        </g>
        <rect x="150" y="104" width="65" height="49" rx="3" fill="url(#windowGlow)" opacity="0.92"/>
        <rect x="225" y="104" width="65" height="49" rx="3" fill="url(#windowGlow)" opacity="0.90"/>
        <rect x="300" y="104" width="65" height="49" rx="3" fill="url(#windowGlow)" opacity="0.88"/>
        <rect x="248" y="118" width="42" height="65" rx="2" fill="#264862" stroke="#7298b6"/>
        <ellipse cx="261" cy="186" rx="170" ry="14" fill="#0a1018" opacity="0.7"/>
        <rect x="212" y="30" width="96" height="38" rx="18" fill="#162638" stroke="#4f6f8d" stroke-width="2"/>
        <path d="M244 55v-11l16-10 16 10v11" fill="none" stroke="#dbeeff" stroke-width="2"/>
        <path d="M252 56v-9h16v9" fill="none" stroke="#dbeeff" stroke-width="2"/>
        <text x="286" y="55" fill="#f2f8ff" font-size="22" font-weight="700">Hus</text>
        <g filter="url(#softGlow)">
          <path d="M0 112 H116" stroke="#49d67a" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M404 110 H520" stroke="#49d67a" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M390 111 h32 q15 0 15 -16 v-16" stroke="#49d67a" stroke-width="5" fill="none" stroke-linecap="round"/>
          <path d="M390 111 h32 q15 0 15 16 v16" stroke="#49d67a" stroke-width="5" fill="none" stroke-linecap="round"/>
        </g>
      </svg>`;
  }

  priceBars(prices, nowHour) {
    if (!prices?.length) return '<div class="empty">Ingen elpriser endnu</div>';
    const max = Math.max(1, ...prices.filter((x) => Number.isFinite(x))) * 1.08;
    const bars = prices.slice(0, 24).map((p, i) => {
      const h = Math.max(4, Math.min(100, (Number(p) || 0) / max * 100));
      const cls = p < 2.4 ? 'green' : p < 3.4 ? 'amber' : 'red';
      return `<div class="price-bar ${cls}${i === nowHour ? ' now' : ''}" style="height:${h}%" title="${i}:00 · ${this.fmt(p, 2)} kr/kWh"></div>`;
    }).join('');
    return `<div class="price-bars">${bars}</div><div class="price-axis"><span>00</span><span>03</span><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span></div>`;
  }

  weatherBlock(items) {
    return items.map((it) => `
      <div class="weather-item">
        <div class="weather-name">${this.esc(it.name)}</div>
        <ha-icon icon="${it.icon}"></ha-icon>
        <div class="weather-temp">${this.esc(it.temp)}</div>
      </div>`).join('');
  }

  logItems(items) {
    if (!items.length) return '<div class="empty">Ingen beslutningshistorik endnu</div>';
    return items.map((x) => `<div class="log-row"><span class="dot"></span><span>${this.esc(x)}</span></div>`).join('');
  }


  detailGroups() {
    return {
      solar:{title:"Solceller",ids:["sensor.danfoss_tlx_pro_241202n272_grid_power_total","sensor.danfoss_tlx_pro_241202n272_pv_power_string_1","sensor.danfoss_tlx_pro_241202n272_pv_power_string_2","sensor.danfoss_tlx_pro_241202n272_grid_energy_today_total","sensor.ai_energy_manager_pv_rest_i_dag","sensor.ai_energy_manager_pv_i_morgen"]},
      grid:{title:"Elnet og forbrug",ids:["sensor.p1_meter_power","sensor.p1_meter_power_phase_1","sensor.p1_meter_power_phase_2","sensor.p1_meter_power_phase_3","sensor.p1_meter_energy_import","sensor.p1_meter_energy_export"]},
      hp:{title:"IVT varmepumpe",ids:["binary_sensor.hp_compressor","sensor.hp_power_consumption","sensor.hp_heat_carrier_forwrd","sensor.hp_heat_carrier_return","climate.hp_room_temp_setpoint","climate.hp_heat_set_1_curvel","climate.hp_heat_set_3_parallel","binary_sensor.hp_alarm"]},
      water:{title:"Varmtvand",ids:["sensor.hp_warm_water_1_top","sensor.hp_warm_water_setpoint","climate.hp_extra_warm_water","climate.hp_warm_water_stop_temp"]},
      nilan:{title:"Nilan ventilation",ids:["climate.boiler_room_nilan_hvac","sensor.boiler_room_nilan_humidity","sensor.boiler_room_nilan_exchanger_efficiency","sensor.boiler_room_nilan_return_air_temperature_t3","sensor.boiler_room_nilan_user_panel_temperature_t15","sensor.boiler_room_nilan_supply_air_temperature_t7","sensor.boiler_room_nilan_supply_fan_speed","sensor.boiler_room_nilan_return_fan_speed"]},
      price:{title:"Elpriser og CO₂",ids:["sensor.energi_data_service","sensor.energi_data_service_co2"]},
      weather:{title:"Vejrudsigt",ids:["weather.forecast_hjem","sensor.custom_weather_forecast_daily","sensor.hp_outdoor"]},
      room:{title:"Temperaturer",ids:["sensor.boiler_room_nilan_user_panel_temperature_t15","sensor.boiler_room_nilan_return_air_temperature_t3","climate.hp_room_temp_setpoint"]},
      ai:{title:"AI beslutningslog",ids:[]}
    };
  }
  detailsHtml() {
    if(!this.selectedDetail) return "";
    const group=this.detailGroups()[this.selectedDetail];
    if(!group)return "";
    const status=this.st(this.liveStatusSensor);
    const faults=Array.isArray(status?.attributes?.fejl)?status.attributes.fejl:[];
    const logs=Array.isArray(status?.attributes?.beslutninger)?status.attributes.beslutninger:[];
    const rows=group.ids.map(id=>{
      const st=this.st(id);
      const label=st?.attributes?.friendly_name||id.split(".")[1].replaceAll("_"," ");
      const val=st?st.state+" "+(st.attributes?.unit_of_measurement||""):"Sensor mangler";
      return '<div class="detail-line"><div><b>'+this.esc(label)+'</b><small>'+this.esc(id)+'</small></div><div class="detail-actions"><strong>'+this.esc(val)+'</strong>'+(st?'<button data-moreinfo="'+this.esc(id)+'">Vis graf og data</button>':'')+'</div></div>';
    }).join("");
    const diagnostic=this.selectedDetail==="ai"?
      '<div class="detail-line"><b>Status</b>'+this.esc(status?.state||"Afventer")+'</div>'+
      (faults.length?faults.map(x=>'<p class="diag">'+this.esc(x)+'</p>').join(""):'<p>Ingen registrerede fejl.</p>')+
      logs.slice(-20).reverse().map(x=>'<div class="detail-line">'+this.esc(x)+'</div>').join(""):"";
    return '<div class="modal-backdrop" id="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-label="'+this.esc(group.title)+'">'+
      '<div class="modal-header"><h2>'+this.esc(group.title)+'</h2><button id="modal-close" aria-label="Luk">✕</button></div>'+
      (this.demo?'<p class="modal-note">Simulationen er kun en illustration. Disse detaljer viser rigtige Home Assistant-sensorer.</p>':'<p class="modal-note">Vælg Vis graf og data for Home Assistants historie, attributter og flere oplysninger.</p>')+
      (this.graphEntity ? this.graphHtml() : '<div>'+rows+diagnostic+'</div>')+'</div></div>';
  }
  async showMoreInfo(entityId, hours=24) {
    if(!this.st(entityId))return;
    this.graphEntity=entityId;
    this.graphHours=hours;
    this.graphLoading=true;
    this.graphError="";
    this.graphHistory=[];
    this.render();
    try {
      const end=new Date();
      const start=new Date(end.getTime()-hours*3600000);
      const path="history/period/"+encodeURIComponent(start.toISOString())+
        "?filter_entity_id="+encodeURIComponent(entityId)+
        "&end_time="+encodeURIComponent(end.toISOString())+"&minimal_response&no_attributes";
      const result=await this._hass.callApi("GET",path);
      if(this.graphEntity!==entityId||this.graphHours!==hours)return;
      this.graphHistory=(Array.isArray(result)&&Array.isArray(result[0])?result[0]:[])
        .map(p=>({time:Date.parse(p.last_changed||p.last_updated||""),value:String(p.state??"")}))
        .filter(p=>Number.isFinite(p.time));
    }catch(e){
      if(this.graphEntity!==entityId||this.graphHours!==hours)return;
      this.graphError="Kunne ikke hente historik: "+String(e?.message||e);
    }
    this.graphLoading=false;
    this.render();
  }
  graphHtml(){
    const id=this.graphEntity;
    const st=this.st(id);
    if(!id||!st)return "";
    const data=this.graphHistory;
    const numeric=data.filter(p=>p.value.trim()!==""&&Number.isFinite(Number(p.value)));
    const isNumeric=data.length&&numeric.length>=data.length*.85;
    let graph="";
    if(this.graphLoading)graph='<div class="graph-message">Indlæser historik…</div>';
    else if(this.graphError)graph='<div class="graph-message">'+this.esc(this.graphError)+'</div>';
    else if(!data.length)graph='<div class="graph-message">Ingen registreret historik. Kontrollér Recorder.</div>';
    else if(isNumeric){
      const values=numeric.map(p=>Number(p.value));
      const lo=Math.min(...values),hi=Math.max(...values),margin=Math.max(.1,(hi-lo)*.1);
      const min=lo-margin,max=hi+margin;
      const t0=numeric[0].time,t1=numeric[numeric.length-1].time;
      const x=t=>55+(t-t0)/Math.max(1,t1-t0)*570;
      const y=v=>15+(max-v)/Math.max(.01,max-min)*185;
      const points=numeric.map(p=>x(p.time).toFixed(1)+","+y(Number(p.value)).toFixed(1)).join(" ");
      const grid=[0,1,2,3,4].map(i=>{
        const yy=15+185*i/4;
        return '<line x1="55" y1="'+yy+'" x2="625" y2="'+yy+'" stroke="#35536b"/>'+
        '<text x="4" y="'+(yy+4)+'" fill="#afc7db" font-size="12">'+this.esc(this.fmt(max-(max-min)*i/4,1))+'</text>';
      }).join("");
      const leftTime=new Date(t0).toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"});
      const rightTime=new Date(t1).toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"});
      graph='<svg class="nordic-chart" viewBox="0 0 640 232" role="img" aria-label="Historikgraf">'+grid+
        '<polyline points="'+points+'" fill="none" stroke="#92e0bc" stroke-width="3" stroke-linejoin="round"/>'+
        '<text x="55" y="223" fill="#afc7db" font-size="12">'+leftTime+'</text>'+
        '<text x="625" text-anchor="end" y="223" fill="#afc7db" font-size="12">'+rightTime+'</text></svg>'+
        '<div class="graph-sub">'+numeric.length+' målinger · '+this.esc(st.attributes?.unit_of_measurement||"")+'</div>';
    }else{
      graph='<div class="graph-events">'+data.slice(-25).reverse().map(p=>
        '<div class="detail-line"><span>'+this.esc(new Date(p.time).toLocaleString("da-DK"))+'</span><strong>'+this.esc(p.value)+'</strong></div>').join("")+'</div>';
    }
    const attrs=Object.entries(st.attributes||{}).map(([key,value])=>
      '<div class="detail-line"><span>'+this.esc(key)+'</span><strong>'+this.esc(typeof value==="object"?JSON.stringify(value):value)+'</strong></div>').join("");
    return '<div class="nordic-history"><button id="graph-back" class="graph-back">← Tilbage til detaljer</button>'+
      '<h3>'+this.esc(st.attributes?.friendly_name||id)+'</h3><small>'+this.esc(id)+'</small>'+
      '<div class="current-reading">'+this.esc(st.state)+' '+this.esc(st.attributes?.unit_of_measurement||"")+'</div>'+
      '<div class="graph-ranges">'+[6,24,168].map(h=>'<button data-graph-hours="'+h+'" class="'+(this.graphHours===h?'chosen':'')+'">'+(h===168?'7 dage':h+' timer')+'</button>').join("")+'</div>'+
      graph+'<h3>Sensorattributter</h3><div class="history-attrs">'+attrs+'</div></div>';
  }


  defaultLayout(){
    return {title:"AI Energy Manager",accent:"nordic",
      groups:{kpi:["solar","grid","hp","nilan","price","weather"],middle:["ivt","ventilation"],bottom:["production","forecast","prices","log"]},
      hidden:[],labels:{},sensors:{}};
  }
  async loadLayout(){
    try{
      const data=await this._hass.callApi("GET","ai_energy_manager/dashboard");
      this.layout=data?.layout||this.defaultLayout();
    }catch(e){this.layout=this.defaultLayout();this.editorError="Kunne ikke hente gemt layout: "+String(e?.message||e);}
    if(!this.editMode)this.render();
  }
  getLayout(){return this.layout||this.defaultLayout();}
  getKpiSensor(key,fallback){return this.getLayout().sensors?.[key]||fallback;}
  editorGroups(){return {
    kpi:[["solar","Solproduktion"],["grid","Elnet"],["hp","IVT varmepumpe"],["nilan","Nilan ventilation"],["price","Elpris"],["weather","Udetemperatur"]],
    middle:[["ivt","IVT + varmtvand"],["ventilation","Nilan"]],
    bottom:[["production","Sol & strøm"],["forecast","Vejrudsigt"],["prices","Elpris & plan"],["log","Hvad sker der nu?"]]
  };}
  editorHtml(){
    if(!this.editMode)return "";
    const layout=this.getLayout();
    const groups=this.editorGroups();
    const labels=Object.fromEntries(Object.values(groups).flat().map(([id,text])=>[id,text]));
    const sections=Object.entries(layout.groups).map(([group,ids])=>{
      const title={kpi:"Øverste målefelter",middle:"Midterste felter",bottom:"Nederste felter"}[group];
      return '<section class="editor-section"><h3>'+title+'</h3>'+
        ids.map((id,index)=>{
          const hidden=layout.hidden.includes(id);
          const label=layout.labels[id]||labels[id];
          const sensor=group==="kpi"?'<label class="editor-sensor">Sensor:<select data-sensor="'+id+'">'+
            '<option value="">Standard</option>'+Object.keys(this._hass.states||{}).filter(x=>/^(sensor|binary_sensor|weather|climate|number|switch)\./.test(x)).sort().map(entity=>
            '<option value="'+this.esc(entity)+'" '+(layout.sensors[id]===entity?'selected':'')+'>'+this.esc(entity)+'</option>').join("")+'</select></label>':"";
          return '<div class="editor-item"><div class="editor-top"><b>'+this.esc(labels[id])+'</b>'+
            '<div class="editor-actions"><button type="button" data-move="'+id+'" data-group="'+group+'" data-direction="-1" '+(index===0?'disabled':'')+' aria-label="Flyt op">↑</button>'+
            '<button type="button" data-move="'+id+'" data-group="'+group+'" data-direction="1" '+(index===ids.length-1?'disabled':'')+' aria-label="Flyt ned">↓</button></div></div>'+
            '<label class="editor-checkbox"><input type="checkbox" data-visible="'+id+'" '+(!hidden?'checked':'')+'/> Vis felt</label>'+
            '<label>Visningsnavn:<input data-label="'+id+'" maxlength="32" value="'+this.esc(label)+'"/></label>'+
            sensor+'</div>';
        }).join("")+'</section>';
    }).join("");
    return '<div class="editor-overlay" id="editor-overlay"><div class="editor-dialog" role="dialog" aria-modal="true" aria-label="Rediger dashboard">'+
      '<header class="editor-header"><h2><ha-icon icon="mdi:pencil"></ha-icon> Rediger dashboard</h2><button type="button" id="editor-close">✕</button></header>'+
      '<p>Flyt felter med pilene, vælg sensorer og skjul felter. Ændringer påvirker kun visningen – ikke IVT- eller Nilan-styringen.</p>'+
      (this.editorError?'<div class="editor-error">'+this.esc(this.editorError)+'</div>':'')+
      '<div class="editor-fields"><label>Dashboardtitel:<input id="editor-title" maxlength="60" value="'+this.esc(layout.title)+'"/></label>'+
      '<label>Farvetema:<select id="editor-accent">'+
      [["nordic","Nordic Night"],["forest","Nordic Green"],["arctic","Arctic Blue"],["violet","Nordic Violet"]].map(([value,name])=>
        '<option value="'+value+'" '+(layout.accent===value?'selected':'')+'>'+name+'</option>').join("")+'</select></label></div>'+
      sections+'<footer class="editor-footer"><button id="editor-reset" type="button">Nulstil layout</button>'+
      '<span></span><button type="button" id="editor-cancel">Annuller</button>'+
      '<button type="button" id="editor-save" '+(this.layoutSaving?'disabled':'')+'>'+(this.layoutSaving?'Gemmer…':'Gem ændringer')+'</button></footer></div></div>';
  }
  bindEditor(){
    if(!this.editMode)return;
    const q=x=>this.shadowRoot.querySelector(x);
    const close=()=>{this.editMode=false;this.editorError="";this.loadLayout();this.render();};
    q("#editor-close")?.addEventListener("click",close);
    q("#editor-cancel")?.addEventListener("click",close);
    q("#editor-overlay")?.addEventListener("click",e=>{if(e.target.id==="editor-overlay")close();});
    q("#editor-title")?.addEventListener("change",e=>{this.layout.title=e.target.value;});
    q("#editor-accent")?.addEventListener("change",e=>{this.layout.accent=e.target.value;});
    this.shadowRoot.querySelectorAll("[data-label]").forEach(el=>el.addEventListener("change",()=>{
      this.layout.labels[el.dataset.label]=el.value.trim().slice(0,32);
    }));
    this.shadowRoot.querySelectorAll("[data-visible]").forEach(el=>el.addEventListener("change",()=>{
      const key=el.dataset.visible;
      this.layout.hidden=this.layout.hidden.filter(x=>x!==key);
      if(!el.checked)this.layout.hidden.push(key);
    }));
    this.shadowRoot.querySelectorAll("[data-sensor]").forEach(el=>el.addEventListener("change",()=>{
      const id=el.dataset.sensor;
      if(el.value)this.layout.sensors[id]=el.value;
      else delete this.layout.sensors[id];
    }));
    this.shadowRoot.querySelectorAll("[data-move]").forEach(el=>el.addEventListener("click",()=>{
      const arr=this.layout.groups[el.dataset.group],i=arr.indexOf(el.dataset.move),j=i+Number(el.dataset.direction);
      if(i<0||j<0||j>=arr.length)return;
      [arr[i],arr[j]]=[arr[j],arr[i]];
      this.render();
    }));
    q("#editor-reset")?.addEventListener("click",()=>{this.layout=this.defaultLayout();this.editorError="";this.render();});
    q("#editor-save")?.addEventListener("click",async()=>{
      this.layout.title=q("#editor-title")?.value?.trim()||"AI Energy Manager";
      this.layout.accent=q("#editor-accent")?.value||"nordic";
      this.layoutSaving=true;this.editorError="";this.render();
      try{
        const result=await this._hass.callApi("POST","ai_energy_manager/dashboard",{layout:this.layout});
        this.layout=result.layout;
        this.editMode=false;
      }catch(e){this.editorError="Kunne ikke gemme dashboardet: "+String(e?.message||e);}
      this.layoutSaving=false;this.render();
    });
  }
  applyLayout(){
    const layout=this.getLayout();
    const groups=[
      [".topbar .stat","kpi"],
      [".mid .panel","middle"],
      [".bottom .panel","bottom"]
    ];
    const originals=this.editorGroups();
    groups.forEach(([selector,name])=>{
      this.shadowRoot.querySelectorAll(selector).forEach((el,i)=>{
        const id=originals[name][i]?.[0];
        if(!id)return;
        const order=layout.groups[name].indexOf(id);
        el.style.order=String(order<0?i:order);
        el.style.display=layout.hidden.includes(id)?"none":"";
        const text=layout.labels[id];
        if(text) {
          const title=el.querySelector(name==="kpi"?".s-title":"h2");
          if(title){
            if(name==="kpi")title.textContent=text;
            else{
              for(const node of [...title.childNodes])if(node.nodeType===3)node.textContent=text;
            }
          }
        }
      });
    });
    this.shadowRoot.querySelector(".app")?.setAttribute("data-accent",layout.accent);
  }

  planEntity() {
    const states=Object.values(this._hass?.states||{});
    return states.find(x=>x.entity_id?.startsWith("sensor.ai_energy_manager_")&&
      x.attributes?.friendly_name==="AI Energy Manager Plan næste 48 timer")?.entity_id
      || "sensor.ai_energy_manager_plan_naeste_48_timer";
  }
  planMarkup() {
    const status=this.st(this.liveStatusSensor);
    const entity=this.st(this.planEntity());
    const plan=Array.isArray(entity?.attributes?.plan)?entity.attributes.plan:[];
    const prices=plan.filter(x=>typeof x.price==="number").map(x=>x.price);
    const pvStatus=entity?.attributes?.pvstatus||"Afventer Forecast.Solar";
    const pvHours=Number(entity?.attributes?.pvtimer||0);
    const pvRemaining=entity?.attributes?.pv_rest_i_dag;
    const pvTomorrow=entity?.attributes?.pv_i_morgen;

    const minPrice=prices.length?Math.min(...prices):null;
    const maxPrice=prices.length?Math.max(...prices):null;
    const span=minPrice===null?"—":this.fmt(maxPrice-minPrice,2)+" kr/kWh";
    const projected=(maxPrice===null||minPrice===null)?"—":this.fmt(Math.max(0,maxPrice-minPrice)*2.5,2)+" kr";
    const byName=(label)=>Object.values(this._hass?.states||{}).find(x=>x.entity_id?.startsWith("sensor.ai_energy_manager_")&&x.attributes?.friendly_name===label);
    const budget=byName("AI Energy Manager Budget 24 timer ved konstant belastning")?.state;
    const cop=byName("AI Energy Manager COP målt")?.state;
    const slot=byName("AI Energy Manager Foreslået varmtvandstid")?.state;
    const slotText=slot&&!["unknown","unavailable","none"].includes(slot)?
      new Date(slot).toLocaleString("da-DK",{weekday:"short",hour:"2-digit",minute:"2-digit"}):"—";
    const actualMode=status?.attributes?.energiprofil||"normal";
    if (this._modePending && actualMode===this._modePending) this._modePending=null;
    const mode=this._modePending||actualMode;
    const options=["normal","comfort","economy","holiday"];
    const manualPause=Boolean(status?.attributes?.manuel_pause);
    const testMode=status?.attributes?.testtilstand!==false;
    const controls='<div class="plan-policy"><span class="mode-pill">'+(testMode?"TESTTILSTAND":"STYRING KAN VÆRE AKTIV")+'</span>'+
      (manualPause?'<span class="mode-pill warning-pill">Manuel pause aktiv</span><button id="resume-manual" type="button" '+(this.demo?'disabled':'')+'>Ophæv manuel pause</button>':"")+
      '<label>Energiprofil: <select id="energy-mode" aria-label="Vælg energiprofil" '+(this.demo?'disabled':'')+'>'+
      options.map(x=>'<option value="'+x+'" '+(x===mode?'selected':'')+'>'+({
        normal:"Normal",comfort:"Komfort",economy:"Økonomi",holiday:"Ferie"
      }[x])+'</option>').join("")+'</select></label>'+
      '<small>'+(this.demo?'Simulation: styringsknapper er deaktiveret':'Energiprofil ændrer kun tilvalg; sikkerhedsgrænser gælder stadig')+'</small></div>';
    const cards=plan.length?plan.map((hour,index)=>{
      const price=typeof hour.price==="number"?this.fmt(hour.price,2):"—";
      const out=typeof hour.outdoor==="number"?this.fmt(hour.outdoor,1)+" °C":"—";
      const solar=typeof hour.pv_energy_kwh==="number"?this.fmt(hour.pv_energy_kwh,2)+" kWh":"—";
      const when=new Date(hour.time);
      const title=when.toLocaleString("da-DK",{weekday:"short",hour:"2-digit",minute:"2-digit"});
      const action=hour.action||"ukendt";
      const cls=action==="billig forvarmning"?"plan-cheap":action==="undgå ekstra boost"?"plan-expensive":"";
      return '<div class="plan-hour '+cls+'" title="'+this.esc(hour.note||"")+'"><b>'+this.esc(title)+'</b>'+
        '<strong>'+this.esc(price)+'</strong><span>'+this.esc(out)+'</span>'+ '<span class="plan-pv">☀ '+this.esc(solar)+'</span>' +
        '<small>'+this.esc(action)+'</small></div>';
    }).join(""):'<div class="empty">Afventer timebaseret pris- og vejrplan.</div>';
    const coverage=entity?.attributes||{};
    return '<section class="panel plan-section">'+
      '<h2><ha-icon icon="mdi:calendar-clock"></ha-icon>AI-plan – 48 timer</h2>'+
      '<p class="plan-intro">Forslag ud fra DK1-elpriser, vejr og Forecast.Solar. PV er forventet produktion – ikke sikkert overskud.</p>'+
      '<div class="plan-summary"><div><span>Prisdata</span><strong>'+this.esc(coverage.pristimer??0)+'/48 timer</strong></div>'+
      '<div><span>Vejrdata</span><strong>'+this.esc(coverage.vejrtimer??0)+'/48 timer</strong></div>'+
      '<div><span>PV-prognose</span><strong>'+pvHours+'/48 timer</strong></div>'+
      '<div><span>Rest i dag (PV)</span><strong>'+this.esc(typeof pvRemaining==="number"?this.fmt(pvRemaining,2)+" kWh":"—")+'</strong></div>'+
      '<div><span>I morgen (PV)</span><strong>'+this.esc(typeof pvTomorrow==="number"?this.fmt(pvTomorrow,2)+" kWh":"—")+'</strong></div>'+
      '<div><span>Prisspænd</span><strong>'+span+'</strong></div>'+
      '<div><span>Teoretisk prisforskel pr. flyttet time (2,5 kW)</span><strong>'+projected+'</strong></div>'+
      '<div><span>Prisbudget 24 timer ved uændret nettoimport</span><strong>'+this.esc(budget&&!["unknown","unavailable"].includes(budget)?budget+" kr":"—")+'</strong></div>'+
      '<div><span>Målt COP (kræver varmemåler)</span><strong>'+this.esc(cop&&!["unknown","unavailable"].includes(cop)?cop:"—")+'</strong></div>'+
      '<div><span>Forslag til varmtvandsopvarmning</span><strong>'+this.esc(slotText)+'</strong></div></div>'+
      controls+'<div class="plan-scroll"><div class="plan-hours">'+cards+'</div></div>'+
      '<p class="plan-note">'+this.esc(pvStatus)+' · '+this.esc(coverage["bemærkning"]||"Planen er vejledende, og besparelser er ikke målt.")+'</p>'+
      '</section>';
  }

  render() {
    if (!this._hass) return;
    // Keep the user's position when live values refresh the dashboard.
    const previous = {
      pageY: this.scrollTop,
      pageX: this.scrollLeft,
      planX: this.shadowRoot.querySelector(".plan-scroll")?.scrollLeft ?? 0,
      planY: this.shadowRoot.querySelector(".plan-scroll")?.scrollTop ?? 0,
      contentY: this.shadowRoot.querySelector(".content")?.scrollTop ?? 0,
      contentX: this.shadowRoot.querySelector(".content")?.scrollLeft ?? 0,
    };
    const demo = this.demo;
    const statusEntity = this.liveStatusSensor;
    const liveStatus = this.st(statusEntity);

    const pv = demo ? 2900 : this.n(this.getKpiSensor("solar","sensor.danfoss_tlx_pro_241202n272_grid_power_total"));
    const grid = demo ? 1400 : this.n(this.getKpiSensor("grid","sensor.p1_meter_power"));
    const hpEntity=this.getKpiSensor("hp","sensor.hp_power_consumption");
    const rawHp=this.n(hpEntity);
    const hpUnit=this.st(hpEntity)?.attributes?.unit_of_measurement;
    const hpPower = demo ? 2100 : (
      rawHp === null ? null :
      hpUnit === "kW" ? rawHp*1000 :
      hpUnit === "W" ? rawHp : null
    );
    const price = demo ? 2.70 : this.n(this.getKpiSensor("price","sensor.energi_data_service"));
    const outdoor = demo ? -0.9 : (this.n(this.getKpiSensor("weather","sensor.hp_outdoor")) ?? this.a("weather.forecast_hjem", "temperature"));
    const room = demo ? 21.2 : this.n("sensor.boiler_room_nilan_user_panel_temperature_t15");
    const setpoint = demo ? 21.5 : this.a("climate.hp_room_temp_setpoint", "temperature");
    const flow = demo ? 33.4 : this.n("sensor.hp_heat_carrier_forwrd");
    const ret = demo ? 33.2 : this.n("sensor.hp_heat_carrier_return");
    const waterTop = demo ? 49.0 : this.n("sensor.hp_warm_water_1_top");
    const waterTarget = demo ? 53.0 : this.a("climate.hp_warm_water_stop_temp", "temperature");
    const extraHotWater = demo ? 60 : this.a("climate.hp_extra_warm_water", "temperature");
    const nilanState = demo ? "Varme" : (this.txt(this.getKpiSensor("nilan","climate.boiler_room_nilan_hvac")) || "Ukendt");
    const nilanFan = demo ? "2" : (this.a("climate.boiler_room_nilan_hvac", "fan_mode") ?? "—");
    const humidity = demo ? 44 : this.n("sensor.boiler_room_nilan_humidity");
    const t3 = demo ? 18.0 : this.n("sensor.boiler_room_nilan_return_air_temperature_t3");
    const t15 = demo ? 24.1 : this.n("sensor.boiler_room_nilan_user_panel_temperature_t15");
    const exchanger = demo ? 60 : this.n("sensor.boiler_room_nilan_exchanger_efficiency");
    const hpCompressor = demo ? "on" : this.txt("binary_sensor.hp_compressor");
    const todayProd = demo ? 2.9 : this.n("sensor.danfoss_tlx_pro_241202n272_grid_energy_today_total");
    const co2 = demo ? 189 : this.n("sensor.energi_data_service_co2");

    const faults = demo ? [] : (Array.isArray(liveStatus?.attributes?.fejl) ? liveStatus.attributes.fejl : []);
    const logs = demo
      ? [
          "12:10 Soloverskud registreret",
          "12:15 IVT boost +0,5 °C aktiveret",
          "12:20 Ekstra varmtvand startet i 60 min",
          "12:25 Nilan holdes i varmegenvinding",
          "12:30 Ingen eksport prioriteres – egetforbrug øges"
        ]
      : (Array.isArray(liveStatus?.attributes?.beslutninger) ? liveStatus.attributes.beslutninger.slice(-5).reverse() : []);

    const statusText = demo
      ? "AI-beslutning: Soloverskud bruges til varme og varmtvand"
      : (liveStatus?.state || "Afventer AI Energy Manager");

    const exportPercent = demo ? 68 : null; // Historical self-consumption cannot be inferred from instantaneous grid flow.

    const todayPrices = demo
      ? [1.1,1.0,0.95,0.9,0.9,0.95,1.2,1.5,1.6,1.5,1.4,1.3,1.3,1.35,1.7,2.1,2.4,2.7,2.5,2.2,1.9,1.5,1.3,1.2]
      : (Array.isArray(this.a("sensor.energi_data_service", "today")) ? this.a("sensor.energi_data_service", "today").map(Number) : []);

    let weatherItems;
    if (demo) {
      weatherItems = [
        { name: "I dag", icon: "mdi:weather-partly-cloudy", temp: "-2 °C / 2 °C" },
        { name: "I morgen", icon: "mdi:weather-cloudy", temp: "-1 °C / 4 °C" },
        { name: "Onsdag", icon: "mdi:weather-sunny", temp: "0 °C / 5 °C" }
      ];
    } else {
      const fc = this.a("sensor.custom_weather_forecast_daily", "forecast");
      weatherItems = Array.isArray(fc) && fc.length ? fc.slice(0, 3).map((x, i) => {
        const cond = String(x.condition || "cloudy");
        const iconMap = {
          partlycloudy: "mdi:weather-partly-cloudy",
          cloudy: "mdi:weather-cloudy",
          sunny: "mdi:weather-sunny",
          rainy: "mdi:weather-rainy",
          snowy: "mdi:weather-snowy"
        };
        return {
          name: ["I dag", "I morgen", "Om 2 dage"][i] || `Dag ${i+1}`,
          icon: iconMap[cond] || "mdi:weather-cloudy",
          temp: `${this.fmt(Number(x.templow),0)} °C / ${this.fmt(Number(x.temperature),0)} °C`
        };
      }) : [
        { name: "I dag", icon: "mdi:weather-cloudy", temp: "—" },
        { name: "I morgen", icon: "mdi:weather-cloudy", temp: "—" },
        { name: "Om 2 dage", icon: "mdi:weather-cloudy", temp: "—" }
      ];
    }

    const netLabel = grid === null ? "ukendt" : grid > 0 ? "import" : grid < 0 ? "eksport" : "balance";
    const statusClass = faults.length ? 'warn' : 'ok';
    const importKw = grid === null ? '—' : `${this.fmt(Math.abs(grid) / 1000)} kW`;
    const pvKw = pv === null ? '—' : `${this.fmt(pv / 1000)} kW`;
    const hpKw = hpPower === null ? '—' : `${this.fmt(hpPower / 1000)} kW`;

    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;min-height:100vh;background:#07111d;color:#e7eef9;font:14px/1.45 Roboto,Arial,sans-serif}
        *{box-sizing:border-box}
        ha-icon{--mdc-icon-size:22px;color:#90d2ff}
        .app{display:block;min-height:100vh}
        .side{background:linear-gradient(180deg,#081321,#07101a);border-right:1px solid #132536;padding:14px 0;box-shadow:8px 0 26px rgba(0,0,0,.3)}
        .brand{display:flex;align-items:center;gap:12px;padding:8px 18px 20px 18px;color:#fff;font-size:18px;font-weight:600}
        .brand ha-icon{--mdc-icon-size:30px;color:#53c7ff}
        .nav{display:grid;gap:6px;padding:0 8px}
        .nav-item{display:flex;align-items:center;gap:14px;color:#dbe6f3;padding:13px 16px;border-radius:14px;text-decoration:none;border:1px solid transparent}
        .nav-item.active{background:linear-gradient(90deg,#173d6f,#1c5b9f);box-shadow:0 0 18px rgba(50,140,255,.18)}
        .nav-item span{font-size:16px}
        .content{padding:18px 18px 20px 18px;background:radial-gradient(circle at 80% 0%,rgba(39,84,139,.3),transparent 28%),linear-gradient(180deg,#08121d,#091521 32%,#08121c 100%)}
        .header{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:16px}
        .header-icon{width:64px;height:64px;display:grid;place-items:center;border:1px solid #3e5e7b;border-radius:18px;background:rgba(12,23,36,.65)}
        .header-icon ha-icon{--mdc-icon-size:38px;color:#eaf4ff}
        .title-block h1{margin:0;font-size:54px;line-height:1.05;letter-spacing:.2px}
        .title-block p{margin:2px 0 0;color:#d5e0ec;font-size:23px}
        .header-right{margin-left:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
        .btn{background:#16283b;color:#eef6ff;border:1px solid #39536d;border-radius:12px;padding:10px 14px;font:inherit;display:inline-flex;align-items:center;gap:8px;cursor:pointer}
        .btn.active{background:#274f41;border-color:#5fc287;box-shadow:0 0 18px rgba(95,194,135,.2)}
        .topbar{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-bottom:16px}
        .stat{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:18px;border:1px solid #2a4965;background:linear-gradient(180deg,rgba(17,32,49,.95),rgba(13,24,36,.95));box-shadow:inset 0 0 0 1px rgba(150,180,210,.04),0 0 16px rgba(0,0,0,.25)}
        .stat ha-icon{--mdc-icon-size:38px}.stat .s-title{font-size:15px;color:#d8e4f0}.stat .s-big{font-size:26px;font-weight:700;line-height:1.15}.stat .s-sub{font-size:13px;color:#9ecfaf}
        .yellow{color:#f7d266}.green{color:#61f19a}.orange{color:#ff8f7e}.white{color:#f1f8ff}.blue{color:#97ceff}
        .hero{border:1px solid #294862;border-radius:22px;padding:16px 18px;background:linear-gradient(180deg,rgba(9,22,34,.92),rgba(10,18,27,.95));box-shadow:0 0 35px rgba(0,0,0,.25)}
        .decision{max-width:760px;margin:0 auto 16px;border-radius:16px;border:1px solid #3d8f5f;padding:11px 18px;text-align:center;background:rgba(28,78,46,.45);color:#d8ffe5;font-size:19px;font-weight:700;box-shadow:0 0 20px rgba(55,198,95,.16)}
        .decision.warn{background:rgba(96,63,34,.4);border-color:#b47b49;color:#ffe0be;box-shadow:none}
        .flow-layout{display:grid;grid-template-columns:230px 1fr 310px;gap:14px;align-items:center}
        .flow-col{display:grid;gap:14px}.flow-card{min-height:104px;border-radius:18px;border:1px solid #43637f;background:linear-gradient(180deg,#132739,#122131);padding:16px;display:flex;align-items:center;gap:14px;box-shadow:0 0 20px rgba(0,0,0,.18)}
        .flow-card ha-icon{--mdc-icon-size:58px}.flow-card strong{display:block;font-size:22px;color:#fff}.flow-card span{font-size:18px;color:#e8f2fc}.flow-card .sub{margin-top:2px;font-size:14px;color:#bfe9cb}
        .flow-card.solar{box-shadow:0 0 22px rgba(70,228,122,.12)}
        .house-center{display:flex;flex-direction:column;align-items:center}.house-svg{width:100%;max-width:560px;height:auto;display:block}.center-note{margin-top:10px;padding:10px 18px;border-radius:14px;border:1px solid #4a6783;background:rgba(22,36,53,.65);color:#d8e6f4;font-size:16px}
        .mid{display:grid;grid-template-columns:1.1fr 1fr;gap:14px;margin-top:14px}
        .panel{border:1px solid #294862;border-radius:20px;padding:14px 16px;background:linear-gradient(180deg,rgba(9,22,34,.95),rgba(10,18,27,.95));box-shadow:0 0 30px rgba(0,0,0,.18)}
        .panel h2{display:flex;align-items:center;gap:10px;font-size:22px;margin:0 0 12px}.panel h2 ha-icon{--mdc-icon-size:28px}
        .panel-grid{display:grid;grid-template-columns:1fr 1.1fr;gap:18px;align-items:start}
        .line{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;color:#e7eef9;font-size:15px}.line span{color:#eef7ff}.line strong{font-size:16px;text-align:right}
        .chip{display:inline-flex;align-items:center;justify-content:center;padding:5px 12px;border-radius:999px;font-size:14px;font-weight:700;border:1px solid #5ecf85;background:rgba(34,95,55,.35);color:#cbffd6}
        .chip.warn{border-color:#cf995e;background:rgba(89,53,28,.45);color:#ffe0bf}
        .chart-wrap .label{font-size:18px;margin-bottom:8px}.legend{display:flex;gap:18px;flex-wrap:wrap;margin-top:8px;color:#d7e4ef;font-size:13px}.legend .sw{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}
        .nilan-side{display:grid;grid-template-columns:1fr 220px;gap:10px;align-items:center}.rec-box{text-align:center;padding:8px 0}.rec-house{width:180px;height:180px;margin:0 auto;position:relative;border:3px solid #b9d5f5;border-top-left-radius:18px;border-top-right-radius:18px;border-bottom-left-radius:12px;border-bottom-right-radius:12px;clip-path:polygon(50% 0%,100% 28%,100% 100%,0% 100%,0% 28%);background:rgba(12,20,32,.3)}
        .rec-house:before{content:"";position:absolute;left:-30px;top:74px;width:66px;height:18px;background:linear-gradient(90deg,#47c4ff,#69d8ff);filter:blur(.3px);box-shadow:0 0 16px rgba(71,196,255,.55)}
        .rec-house:after{content:"";position:absolute;right:-30px;top:74px;width:66px;height:18px;background:linear-gradient(90deg,#ffbc6f,#ff9a34);box-shadow:0 0 16px rgba(255,165,62,.45)}
        .rec-core{position:absolute;inset:60px;display:grid;place-items:center;border-radius:18px;border:2px solid #e6ba8f;color:#e6ba8f}
        .rec-text{margin-top:8px;color:#e8f4ff;font-size:16px}
        .bottom{display:grid;grid-template-columns:1fr 1fr 1.15fr 1.05fr;gap:14px;margin-top:14px}
        .big-number{font-size:52px;line-height:1;font-weight:800;margin:10px 0 6px;color:#67f08a}
        .donut-wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px}.donut{width:110px;height:110px;border-radius:50%;background:conic-gradient(#63f093 0deg, #63f093 calc(3.6deg * var(--p)), #20384d calc(3.6deg * var(--p)), #20384d 360deg);display:grid;place-items:center;box-shadow:0 0 18px rgba(101,240,145,.18)}.donut:before{content:"";width:74px;height:74px;border-radius:50%;background:#0d1825;display:block;position:absolute}.donut span{position:relative;font-size:24px;font-weight:700;color:#fff}
        .weather-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.weather-item{text-align:center;padding:8px 6px;border-right:1px solid #34516a}.weather-item:last-child{border-right:0}.weather-name{font-size:17px;color:#f5f8fb;margin-bottom:10px}.weather-item ha-icon{--mdc-icon-size:54px;color:#f4c44d}.weather-temp{font-size:18px;margin-top:10px}
        .price-area{display:grid;grid-template-columns:1fr 200px;gap:12px;align-items:start}.price-bars{height:126px;display:flex;align-items:end;gap:4px;border-bottom:1px solid #7e8ea0;padding:0 4px}.price-bar{flex:1;border-radius:4px 4px 0 0;background:#7ee3a2;min-height:4px}.price-bar.amber{background:#efbd59}.price-bar.red{background:#ee826e}.price-bar.now{outline:2px solid #eaf3ff}.price-axis{display:flex;justify-content:space-between;color:#bcc9d6;font-size:12px;padding-top:6px}.plan{padding-top:2px}.plan-title{display:flex;align-items:center;gap:8px;font-size:18px;margin-bottom:10px}.plan-row{display:flex;gap:9px;align-items:flex-start;margin:8px 0;font-size:15px}.check{color:#69f08e;font-weight:700}
        .log-row{display:flex;gap:10px;align-items:flex-start;padding:8px 0;font-size:16px}.dot{width:10px;height:10px;border-radius:50%;background:#63ef8c;margin-top:6px;box-shadow:0 0 10px rgba(99,239,140,.5)}
        .footer{display:flex;justify-content:flex-end;color:#dce6f3;font-style:italic;font-size:14px;margin-top:10px}.empty{color:#9fb1c3}
.click-more{cursor:pointer;transition:border-color .16s ease,box-shadow .16s ease}
        .click-more:hover{border-color:#80bedb;box-shadow:0 0 18px rgba(101,184,229,.25)}
        .click-more:focus-visible{outline:2px solid #a3be8c;outline-offset:2px}
        .modal-backdrop{position:fixed;inset:0;background:rgba(0,8,18,.8);z-index:999;display:flex;align-items:center;justify-content:center;padding:15px}
        .modal{background:#14283b;border:1px solid #5a7c98;border-radius:18px;box-shadow:0 12px 60px #000b;max-height:88vh;overflow:auto;width:min(740px,100%);padding:20px}
        .modal-header{display:flex;justify-content:space-between;gap:12px;align-items:center}
        .modal-header h2{font-size:22px;margin:0}
        .modal-header button,.detail-actions button{border-radius:9px;border:1px solid #4c7895;background:#244158;color:#eef8ff;padding:8px 12px;cursor:pointer}
        .modal-note{color:#b8cce0;font-size:13px}
        .detail-line{display:flex;gap:15px;justify-content:space-between;align-items:center;border-top:1px solid #36536c;padding:12px 2px}
        .detail-line small{display:block;color:#a1b5c9;font-size:11px;overflow-wrap:anywhere}
        .detail-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:end}
        .diag{color:#ffcca6}
        @media(max-width:550px){.detail-line{align-items:flex-start;flex-direction:column}.detail-actions{justify-content:start}}
        .nordic-history h3{font-size:18px;margin:14px 0 5px}
        .nordic-history small,.graph-sub{color:#a9c1d4;font-size:12px;overflow-wrap:anywhere}
        .current-reading{font-size:30px;color:#a3be8c;font-weight:700;margin:13px 0}
        .graph-ranges{display:flex;gap:9px;margin:12px 0 18px;flex-wrap:wrap}
        .graph-ranges button,.graph-back{background:#213c54;border:1px solid #4e7691;border-radius:9px;color:#e6f3fc;padding:8px 13px;cursor:pointer}
        .graph-ranges .chosen{background:#35614e;border-color:#99c5a0}
        .nordic-chart{width:100%;height:auto;display:block;background:#0b1a29;border:1px solid #39566c;border-radius:12px}
        .graph-message{padding:24px;background:#102438;border:1px solid #3c5974;border-radius:12px;color:#c3d8eb}
        .graph-events,.history-attrs{max-height:280px;overflow:auto}
        .history-attrs .detail-line strong{max-width:65%;overflow-wrap:anywhere;text-align:right;font-size:12px}
        .app[data-accent="forest"]{--accent-editor:#93d39a}
        .app[data-accent="arctic"]{--accent-editor:#72d5fb}
        .app[data-accent="violet"]{--accent-editor:#c5a1e8}
        .app[data-accent="nordic"]{--accent-editor:#88c0d0}
        .app[data-accent] .panel,.app[data-accent] .stat{border-color:var(--accent-editor,#88c0d0)}
        .editor-overlay{position:fixed;inset:0;z-index:4000;background:rgba(2,8,18,.83);display:flex;justify-content:center;align-items:center;padding:15px}
        .editor-dialog{width:min(850px,100%);max-height:92vh;overflow:auto;background:#12263a;border:1px solid #547a93;border-radius:18px;padding:20px;color:#edf5ff}
        .editor-header{display:flex;justify-content:space-between;align-items:center;gap:12px}
        .editor-header h2{display:flex;align-items:center;gap:8px;font-size:22px}
        .editor-header button,.editor-footer button,.editor-actions button{background:#27445a;border:1px solid #4e7892;color:#e7f5ff;border-radius:9px;padding:8px 12px;cursor:pointer}
        .editor-header button:disabled,.editor-footer button:disabled,.editor-actions button:disabled{opacity:.4;cursor:default}
        .editor-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}
        .editor-fields label,.editor-item label{display:flex;flex-direction:column;gap:4px;color:#bed2e5;font-size:13px}
        .editor-item input,.editor-item select,.editor-fields input,.editor-fields select{background:#0d1d2c;border:1px solid #4d6e89;border-radius:8px;padding:8px;color:#eaf6ff;min-width:0;width:100%}
        .editor-section{border-top:1px solid #43617c;padding-top:14px;margin-top:12px}
        .editor-section h3{margin:0 0 10px}
        .editor-item{padding:10px;margin-bottom:10px;border-radius:11px;background:#1c3448;display:grid;grid-template-columns:1fr 1fr;gap:9px}
        .editor-top{display:flex;justify-content:space-between;gap:10px;grid-column:1/-1;align-items:center}
        .editor-actions{display:flex;gap:6px}
        .editor-checkbox{display:flex!important;align-items:center;flex-direction:row!important}
        .editor-checkbox input{width:auto}
        .editor-sensor{grid-column:1/-1}
        .editor-footer{position:sticky;bottom:-20px;background:#12263a;display:flex;gap:10px;align-items:center;padding:14px 0;border-top:1px solid #45627d}
        .editor-footer span{flex:1}
        .editor-error{background:#5b3228;color:#ffddc3;padding:10px;border-radius:9px}
        @media(max-width:600px){.editor-fields,.editor-item{grid-template-columns:1fr}.editor-footer{flex-wrap:wrap}}
        .plan-section{margin-top:14px}
        .plan-intro,.plan-note{font-size:12px;color:#b1c9d9}
        .plan-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:12px 0}
        .plan-summary>div{background:#162e40;border:1px solid #3a5974;border-radius:10px;padding:10px}
        .plan-summary span{display:block;color:#acc4d5;font-size:12px}
        .plan-summary strong{display:block;font-size:17px}
        .plan-policy{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:12px 0}
        .mode-pill{background:#214636;color:#c8f0d1;border:1px solid #4f9974;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700}
        .warning-pill{background:#4c372b;color:#ffd5b0;border-color:#a47655}
        #resume-manual{background:#305070;color:#fff;border:1px solid #7c9bb4;border-radius:9px;padding:8px 11px;cursor:pointer}
        .plan-policy select{background:#18334a;color:#e2f5ff;border:1px solid #476c84;border-radius:8px;padding:9px}
        .plan-policy small{color:#99b9ce}
        .plan-scroll{overflow-x:auto;padding-bottom:8px}
        .plan-hours{display:flex;gap:6px;min-width:max-content}
        .plan-hour{width:111px;min-height:112px;display:flex;flex-direction:column;gap:5px;padding:9px 8px;border:1px solid #3a5369;border-radius:11px;background:#142538}
        .plan-hour strong{font-size:19px;color:#edf8ff}
        .plan-hour b{font-size:12px}
        .plan-hour span{font-size:12px;color:#b1c9d9}
        .plan-hour small{font-size:10px;color:#a0b6c8}
        .plan-hour .plan-pv{color:#f5d56d;font-size:11px}
        .plan-cheap{border-color:#569c76;background:#183b31}
        .plan-expensive{border-color:#a7745f;background:#392d29}
        @media(max-width:850px){.plan-summary{grid-template-columns:repeat(2,1fr)}}
        .mobile-head{display:none}
        @media (max-width: 1550px){.topbar{grid-template-columns:repeat(3,1fr)}.bottom{grid-template-columns:1fr 1fr}.price-area{grid-template-columns:1fr}.flow-layout{grid-template-columns:230px 1fr 260px}.title-block h1{font-size:42px}.title-block p{font-size:18px}}
        @media (max-width: 1080px){.app{grid-template-columns:1fr}.side{display:none}.mobile-head{display:inline-flex}.flow-layout,.mid,.bottom,.panel-grid,.nilan-side{grid-template-columns:1fr}.topbar{grid-template-columns:repeat(2,1fr)}.content{padding:14px}.title-block h1{font-size:34px}.title-block p{font-size:16px}.header-icon{width:54px;height:54px}}
        @media (max-width: 620px){.topbar{grid-template-columns:1fr}.weather-grid{grid-template-columns:1fr}.weather-item{border-right:0;border-bottom:1px solid #34516a}.weather-item:last-child{border-bottom:0}.title-block h1{font-size:28px}.title-block p{font-size:15px}.stat .s-big{font-size:22px}}
      </style>
      <div class="app">
        <main class="content">
          <div class="header">
            <button class="btn mobile-head" id="menu-btn"><ha-icon icon="mdi:menu"></ha-icon></button>
            <div class="header-icon"><ha-icon icon="mdi:home-outline"></ha-icon></div>
            <div class="title-block"><h1>${this.esc(this.getLayout().title)}</h1><p>Nordic Night • ${demo ? 'Simuleret oversigt' : 'Live overblik'}</p></div>
            <div class="header-right">
              <button class="btn" id="edit-dashboard"><ha-icon icon="mdi:pencil"></ha-icon> Rediger dashboard</button>
              <button class="btn ${demo ? 'active' : ''}" id="simulate-btn"><ha-icon icon="mdi:play-circle-outline"></ha-icon>${demo ? 'Afslut simulation' : 'Simulér drift'}</button>
            </div>
          </div>
          <div class="topbar">
            <div class="stat"><ha-icon class="yellow" icon="mdi:white-balance-sunny"></ha-icon><div><div class="s-title">Solproduktion</div><div class="s-big white">${pvKw}</div><div class="s-sub">Danfoss TLX</div></div></div>
            <div class="stat"><ha-icon class="white" icon="mdi:transmission-tower"></ha-icon><div><div class="s-title">Net</div><div class="s-big ${grid !== null && grid > 0 ? 'orange' : 'green'}">${importKw}</div><div class="s-sub">${netLabel}</div></div></div>
            <div class="stat"><ha-icon class="orange" icon="mdi:heat-wave"></ha-icon><div><div class="s-title">IVT varmepumpe</div><div class="s-big white">${hpKw}</div><div class="s-sub">${hpCompressor === 'on' ? 'Kompressor aktiv' : 'Kompressor stoppet'}</div></div></div>
            <div class="stat"><ha-icon class="green" icon="mdi:fan"></ha-icon><div><div class="s-title">Nilan ventilation</div><div class="s-big white">${this.esc(nilanState)}</div><div class="s-sub">Varmegenvinding: ${this.fmt(exchanger,0)} %</div></div></div>
            <div class="stat"><ha-icon class="yellow" icon="mdi:cash"></ha-icon><div><div class="s-title">Elpris</div><div class="s-big white">${this.fmt(price, 2)} kr/kWh</div><div class="s-sub">DK1 pris nu</div></div></div>
            <div class="stat"><ha-icon class="blue" icon="mdi:thermometer"></ha-icon><div><div class="s-title">Udetemperatur</div><div class="s-big white">${this.fmt(outdoor)} °C</div><div class="s-sub">Aktuel måling</div></div></div>
          </div>
          <section class="hero">
            <div class="decision ${statusClass}">${this.esc(statusText)}</div>
            <div class="flow-layout">
              <div class="flow-col">
                <div class="flow-card solar"><ha-icon class="green" icon="mdi:solar-panel"></ha-icon><div><span>Solceller</span><strong>${pvKw}</strong></div></div>
                <div class="flow-card"><ha-icon class="white" icon="mdi:transmission-tower"></ha-icon><div><span>Elnet</span><strong>${importKw}</strong><div class="sub">${netLabel}</div></div></div>
              </div>
              <div class="house-center">
                ${this.energyHouseSvg()}
                <div class="center-note">Nilan overvåges; IVT-boost blokeres ved registreret køling.</div>
              </div>
              <div class="flow-col">
                <div class="flow-card"><ha-icon class="white" icon="mdi:heat-pump"></ha-icon><div><span>IVT (varmepumpe)</span><strong>${hpKw}</strong></div></div>
                <div class="flow-card"><ha-icon class="white" icon="mdi:water-boiler"></ha-icon><div><span>Varmtvand</span><strong>${extraHotWater > 0 ? 'Aktiv (opvarmes)' : 'Normal drift'}</strong></div></div>
                <div class="flow-card"><ha-icon class="white" icon="mdi:fan"></ha-icon><div><span>Nilan (ventilation)</span><strong>Varmegenvinding aktiv</strong></div></div>
              </div>
            </div>
          </section>
          <div class="mid">
            <section class="panel">
              <h2><ha-icon icon="mdi:radiator"></ha-icon>IVT + Varmtvand</h2>
              <div class="panel-grid">
                <div>
                  <div class="line"><span>Rumtemperatur</span><strong>${this.fmt(room)} °C</strong></div>
                  <div class="line"><span>Setpunkt</span><strong>${this.fmt(setpoint)} °C</strong></div>
                  <div class="line"><span>Fremløb</span><strong>${this.fmt(flow)} °C</strong></div>
                  <div class="line"><span>Returløb</span><strong>${this.fmt(ret)} °C</strong></div>
                  <div class="line"><span>Varmtvand (top)</span><strong>${this.fmt(waterTop)} °C</strong></div>
                  <div class="line"><span>Varmtvand (mål)</span><strong>${this.fmt(waterTarget)} °C</strong></div>
                  <div class="line"><span>Status</span><strong>${extraHotWater > 0 ? '<span class="chip">Ekstra varmtvand aktiveret</span>' : '<span class="chip warn">Normal drift</span>'}</strong></div>
                </div>
                <div class="chart-wrap">
                  <div class="label">Temperatur (illustration)</div>
                  ${this.seriesSvg()}
                  <div class="legend">
                    <span><span class="sw" style="background:#77c6ff"></span>Rumtemp.</span>
                    <span><span class="sw" style="background:#70dd8d"></span>Fremløb</span>
                    <span><span class="sw" style="background:#cc8df5"></span>Varmtvand</span>
                  </div>
                </div>
              </div>
            </section>
            <section class="panel">
              <h2><ha-icon icon="mdi:fan"></ha-icon>Nilan</h2>
              <div class="nilan-side">
                <div>
                  <div class="line"><span>Drift</span><strong><span class="chip warn">${this.esc(nilanState)}</span></strong></div>
                  <div class="line"><span>Ventilatortrin</span><strong>${this.esc(nilanFan)}</strong></div>
                  <div class="line"><span>Fugt</span><strong>${this.pct(humidity)}</strong></div>
                  <div class="line"><span>T3 retur-luft</span><strong>${this.fmt(t3)} °C</strong></div>
                  <div class="line"><span>T15 panel</span><strong>${this.fmt(t15)} °C</strong></div>
                  <div class="line"><span>Virkningsgrad</span><strong>${this.pct(exchanger)}</strong></div>
                  <div class="line"><span>Status</span><strong><span class="chip">Overvåges af AI</span></strong></div>
                </div>
                <div class="rec-box">
                  <div class="rec-house"><div class="rec-core"><ha-icon icon="mdi:heat-exchanger"></ha-icon></div></div>
                  <div class="rec-text">Varmegenvinding<br>(η ${this.fmt(exchanger,0)} %)</div>
                </div>
              </div>
            </section>
          </div>
          <div class="bottom">
            <section class="panel">
              <h2><ha-icon icon="mdi:white-balance-sunny"></ha-icon>Sol & strøm</h2>
              <div>Produktion i dag</div>
              <div class="big-number">${this.fmt(todayProd, 1)} kWh</div>
              <div class="donut-wrap">
                <div><div style="font-size:16px;margin-bottom:6px">Egetforbrug (kun simulation)</div><div class="muted">CO₂ nu: ${this.fmt(co2,0)} g/kWh</div></div>
                <div class="donut" style="--p:${Number.isFinite(exportPercent) ? exportPercent : 0}"><span>${Number.isFinite(exportPercent) ? this.fmt(exportPercent,0) : '—'}%</span></div>
              </div>
            </section>
            <section class="panel">
              <h2><ha-icon icon="mdi:weather-partly-cloudy"></ha-icon>Vejrudsigt</h2>
              <div class="weather-grid">${this.weatherBlock(weatherItems)}</div>
            </section>
            <section class="panel">
              <h2><ha-icon icon="mdi:cash-multiple"></ha-icon>Elpris & plan</h2>
              <div class="price-area">
                <div>${this.priceBars(todayPrices, new Date().getHours())}</div>
                <div class="plan">
                  <div class="plan-title"><ha-icon icon="mdi:calendar-check-outline"></ha-icon><span>${demo ? "Plan i dag:" : "Mulige tiltag:"}</span></div>
                  <div class="plan-row"><span class="check">✓</span><span>Udnyt soloverskud</span></div>
                  <div class="plan-row"><span class="check">✓</span><span>Opvarm varmtvand</span></div>
                  <div class="plan-row"><span class="check">✓</span><span>Højere varme (dag)</span></div>
                  <div class="plan-row"><span class="check">✓</span><span>Begræns forbrug i højpristimer</span></div>
                </div>
              </div>
            </section>
            <section class="panel">
              <h2><ha-icon icon="mdi:clipboard-text-outline"></ha-icon>Hvad sker der nu?</h2>
              ${this.logItems(logs)}
            </section>
          </div>
          ${this.planMarkup()}
          ${this.detailsHtml()}
          ${this.editorHtml()}
          <div class="footer">${demo ? 'Simuleret dashboard – eksempeldata' : faults.length ? 'Live dashboard – nogle sensorer mangler' : 'Live dashboard – aktuelle data'}</div>
        </main>
      </div>`;


    const selectors=[
      [".topbar .stat",["solar","grid","hp","nilan","price","weather"]],
      [".flow-col:first-child .flow-card",["solar","grid"]],
      [".flow-col:last-child .flow-card",["hp","water","nilan"]],
      [".mid .panel",["hp","nilan"]],
      [".bottom .panel",["solar","weather","price","ai"]]
    ];
    for(const [selector,keys] of selectors){
      this.shadowRoot.querySelectorAll(selector).forEach((el,i)=>{
        el.dataset.detail=keys[i];el.classList.add("click-more");el.setAttribute("role","button");el.tabIndex=0;
      });
    }
    const decision=this.shadowRoot.querySelector(".decision");
    if(decision){decision.dataset.detail="ai";decision.classList.add("click-more");decision.tabIndex=0;decision.setAttribute("role","button");}
    const detail=(key)=>{if(this.detailGroups()[key]){this.selectedDetail=key;this.graphEntity=null;this.render();}};
    this.shadowRoot.querySelectorAll("[data-detail]").forEach(el=>{
      el.addEventListener("click",()=>detail(el.dataset.detail));
      el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();detail(el.dataset.detail);}});
    });
    this.shadowRoot.querySelector("#modal-close")?.addEventListener("click",()=>{this.selectedDetail=null;this.graphEntity=null;this.render();});
    this.shadowRoot.querySelector("#modal-backdrop")?.addEventListener("click",e=>{if(e.target.id==="modal-backdrop"){this.selectedDetail=null;this.render();}});
    this.shadowRoot.querySelectorAll("[data-moreinfo]").forEach(btn=>btn.addEventListener("click",()=>this.showMoreInfo(btn.dataset.moreinfo)));
    this.shadowRoot.querySelector("#graph-back")?.addEventListener("click",()=>{this.graphEntity=null;this.graphHistory=[];this.render();});
    this.shadowRoot.querySelectorAll("[data-graph-hours]").forEach(btn=>btn.addEventListener("click",()=>this.showMoreInfo(this.graphEntity,Number(btn.dataset.graphHours))));

    const rail=this.shadowRoot.querySelector(".plan-scroll");
    if(rail) {
      rail.scrollLeft=previous.planX;
      rail.scrollTop=previous.planY;
      rail.addEventListener("scroll",()=>{
        this._scrollInteractionUntil=Date.now()+1800;
      },{passive:true});
    }
    const contentEl=this.shadowRoot.querySelector(".content");
    if(contentEl){contentEl.scrollTop=previous.contentY;contentEl.scrollLeft=previous.contentX;}
    this.scrollTop=previous.pageY;
    this.scrollLeft=previous.pageX;
    this.applyLayout();
    this.bindEditor();
    this.shadowRoot.getElementById("edit-dashboard")?.addEventListener("click",()=>{
      this.editMode=true;
      this.layout=JSON.parse(JSON.stringify(this.getLayout()));
      this.editorError="";
      this.render();
    });
    this.shadowRoot.querySelector("#resume-manual")?.addEventListener("click",async()=>{
      if(this.demo)return;
      const entity=Object.values(this._hass.states||{}).find(x=>x.entity_id.startsWith("button.ai_energy_manager_")&&
        x.attributes?.friendly_name==="AI Energy Manager Ophæv manuel varmepause");
      if(!entity){this.editorError="Ophæv manuel varmepause-knappen findes ikke";return;}
      try{await this._hass.callService("button","press",{entity_id:entity.entity_id});}
      catch(err){this.editorError=String(err?.message||err);}
    });
    this.shadowRoot.querySelector("#energy-mode")?.addEventListener("change",async(e)=>{
      if(this.demo)return;
      const value=e.target.value;
      this._modePending=value;
      const entity=Object.values(this._hass.states||{}).find(x=>x.entity_id.startsWith("select.ai_energy_manager_")&&x.attributes?.friendly_name==="AI Energy Manager Energiprofil");
      if(!entity){this._modePending=null;this.editorError="Energiprofil-entity findes endnu ikke";this.render();return;}
      try{
        await this._hass.callService("select","select_option",{entity_id:entity.entity_id,option:value});
      }catch(err){this._modePending=null;this.editorError=String(err?.message||err);this.render();}
    });
    this.shadowRoot.getElementById("simulate-btn")?.addEventListener("click", () => {
      this.demo = !this.demo;
      this.render();
    });
    this.shadowRoot.getElementById("menu-btn")?.addEventListener("click", () => {
      this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
    });
  }
}
if (!customElements.get("ai-energy-panel")) {
  customElements.define("ai-energy-panel", AIEnergyPanel);
}