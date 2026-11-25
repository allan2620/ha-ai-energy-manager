"use strict";
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const source=fs.readFileSync("custom_components/ai_energy_manager/frontend/ai-energy-panel.js","utf8");
let Dashboard;
const context={
  HTMLElement:class {},
  customElements:{get:()=>Dashboard,define:(_name,cls)=>{Dashboard=cls;}},
  console
};
vm.runInNewContext(source,context,{filename:"ai-energy-panel.js"});
const proto=Dashboard.prototype;

const layout={
  title:"AI Energy Manager",accent:"nordic",
  groups:{kpi:["solar","grid","hp","nilan","price","weather"],
    middle:["ivt","ventilation"],bottom:["production","forecast","prices","log"]},
  hidden:[],labels:{},sensors:{
    "sensor.hp_power_consumption":"sensor.my_real_ivt_watts",
    "sensor.p1_meter_power":"sensor.my_p1_power",
    "sensor.ai_energy_manager_cop_malt":"sensor.my_cop"
  }
};
const entities={
  "sensor.my_real_ivt_watts":{state:"2200",attributes:{friendly_name:"Mine IVT watt",unit_of_measurement:"W"}},
  "sensor.my_p1_power":{state:"-250",attributes:{friendly_name:"P1 måler",unit_of_measurement:"W"}},
  "sensor.my_cop":{state:"4.3",attributes:{friendly_name:"COP"}},
  "sensor.default_power":{state:"600",attributes:{friendly_name:"Standard",unit_of_measurement:"W"}}
};
const page={
  editMode:true,layout,_hass:{states:entities},editorError:"",layoutSaving:false,
  defaultLayout:proto.defaultLayout,
  getLayout:proto.getLayout,
  editorGroups:proto.editorGroups,
  editorSensorGroups:proto.editorSensorGroups,
  esc:proto.esc,displayEntity:proto.displayEntity,
  st:proto.st,getKpiSensor:proto.getKpiSensor
};
assert.equal(proto.st.call(page,"sensor.hp_power_consumption").state,"2200");
assert.equal(proto.displayEntity.call(page,"sensor.ai_energy_manager_cop_malt"),"sensor.my_cop");
assert.equal(proto.getKpiSensor.call(page,"hp","sensor.hp_power_consumption"),"sensor.my_real_ivt_watts");
const sensorGroups=proto.editorSensorGroups.call(page);
const ids=sensorGroups.flatMap(([,sensors])=>sensors.map(([id])=>id));
assert.ok(ids.length>=45,"Editor covers whole dashboard");
assert.equal(new Set(ids).size,ids.length,"No duplicate sensor editing fields");
for(const id of ["sensor.hp_power_consumption","sensor.p1_meter_power",
  "sensor.danfoss_tlx_pro_241202n272_grid_power_total",
  "sensor.boiler_room_nilan_humidity",
  "sensor.energi_data_service",
  "sensor.ai_energy_manager_plan_naeste_48_timer",
  "sensor.ai_energy_manager_cop_malt"]){
  assert.ok(ids.includes(id),"Missing "+id);
}
const html=proto.editorHtml.call(page);
assert.ok(html.includes("Alle sensorer på dashboardet"));
assert.ok(html.includes('list="editor-entity-options"'),"Searchable datalist");
assert.ok(html.includes('value="sensor.my_real_ivt_watts"'),"Saved selection prefilled");
assert.ok(html.includes('data-sensor="sensor.p1_meter_power"'),"Live grid configurable");
assert.ok(html.includes("Vis felt"),"Old card editor remains");
assert.ok(html.includes('data-sensor="hp"'),"Legacy KPI still editable");
assert.ok(html.includes('value="sensor.my_p1_power"'),"Current grid override appears");
assert.ok(source.includes('this.shadowRoot.querySelectorAll("[data-sensor]").forEach(el=>{'),"Save captures input");
console.log("Dashboard source editor: live mapping, all fields, preserved layout and searchable entities pass");
