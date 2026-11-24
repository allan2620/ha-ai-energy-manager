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
    this._hass = null;
    this._renderQueued = false;
  }

  set hass(v) {
    this._hass = v;
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
      solar:{title:"Solceller",ids:["sensor.danfoss_tlx_pro_241202n272_grid_power_total","sensor.danfoss_tlx_pro_241202n272_pv_power_string_1","sensor.danfoss_tlx_pro_241202n272_pv_power_string_2","sensor.danfoss_tlx_pro_241202n272_grid_energy_today_total"]},
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
      '<div>'+rows+diagnostic+'</div></div></div>';
  }
  showMoreInfo(entityId) {
    if(!this.st(entityId)) return;
    this.dispatchEvent(new CustomEvent("hass-more-info",{bubbles:true,composed:true,detail:{entityId}}));
  }

  render() {
    if (!this._hass) return;
    const demo = this.demo;
    const statusEntity = this.liveStatusSensor;
    const liveStatus = this.st(statusEntity);

    const pv = demo ? 2900 : this.n("sensor.danfoss_tlx_pro_241202n272_grid_power_total");
    const grid = demo ? 1400 : this.n("sensor.p1_meter_power");
    const hpPower = demo ? 2100 : ((v) => v === null ? null : v * 1000)(this.n("sensor.hp_power_consumption"));
    const price = demo ? 2.70 : this.n("sensor.energi_data_service");
    const outdoor = demo ? -0.9 : (this.n("sensor.hp_outdoor") ?? this.a("weather.forecast_hjem", "temperature"));
    const room = demo ? 21.2 : this.n("sensor.boiler_room_nilan_user_panel_temperature_t15");
    const setpoint = demo ? 21.5 : this.a("climate.hp_room_temp_setpoint", "temperature");
    const flow = demo ? 33.4 : this.n("sensor.hp_heat_carrier_forwrd");
    const ret = demo ? 33.2 : this.n("sensor.hp_heat_carrier_return");
    const waterTop = demo ? 49.0 : this.n("sensor.hp_warm_water_1_top");
    const waterTarget = demo ? 53.0 : this.a("climate.hp_warm_water_stop_temp", "temperature");
    const extraHotWater = demo ? 60 : this.a("climate.hp_extra_warm_water", "temperature");
    const nilanState = demo ? "Varme" : (this.txt("climate.boiler_room_nilan_hvac") || "Ukendt");
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
            <div class="title-block"><h1>AI Energy Manager</h1><p>Nordic Night • ${demo ? 'Simuleret oversigt' : 'Live overblik'}</p></div>
            <div class="header-right">
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
          ${this.detailsHtml()}
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
    const detail=(key)=>{if(this.detailGroups()[key]){this.selectedDetail=key;this.render();}};
    this.shadowRoot.querySelectorAll("[data-detail]").forEach(el=>{
      el.addEventListener("click",()=>detail(el.dataset.detail));
      el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();detail(el.dataset.detail);}});
    });
    this.shadowRoot.querySelector("#modal-close")?.addEventListener("click",()=>{this.selectedDetail=null;this.render();});
    this.shadowRoot.querySelector("#modal-backdrop")?.addEventListener("click",e=>{if(e.target.id==="modal-backdrop"){this.selectedDetail=null;this.render();}});
    this.shadowRoot.querySelectorAll("[data-moreinfo]").forEach(btn=>btn.addEventListener("click",()=>this.showMoreInfo(btn.dataset.moreinfo)));

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