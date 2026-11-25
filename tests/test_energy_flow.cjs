"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const code = fs.readFileSync(
  "custom_components/ai_energy_manager/frontend/ai-energy-panel.js", "utf8"
);
let Component;
const scope = {
  HTMLElement: class {},
  customElements: {
    get: () => Component,
    define: (name, ctor) => { Component = ctor; },
  },
  console,
};
vm.runInNewContext(code, scope, {filename: "ai-energy-panel.js"});
assert.ok(Component, "Component must register");
const flow = Component.prototype.calculateLiveFlow;

function close(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 1, msg + ": " + actual + " != " + expected);
}
let result = flow(3000, 1000, 2000);
assert.equal(result.valid, true);
close(result.importW, 1000, "import");
close(result.exportW, 0, "export");
close(result.homeW, 4000, "home");
close(result.pvHpW, 1500, "PV to HP proportionally");
close(result.gridHpW, 500, "grid to HP proportionally");
close(result.pvOtherW + result.pvHpW, 3000, "PV conservation");
close(result.gridOtherW + result.gridHpW, 1000, "grid conservation");

result = flow(4500, -1000, 1750);
assert.equal(result.valid, true);
close(result.importW, 0, "no import while exporting");
close(result.exportW, 1000, "export");
close(result.pvHpW + result.gridHpW, 1750, "HP conservation");
close(result.gridHpW, 0, "no grid to HP while exporting");

result = flow(4500, 1000, 1000, true);
close(result.exportW, 1000, "export-positive sign correctly used");
close(result.importW, 0, "no import with export-positive setting");

result = flow(null, -420, null);
assert.equal(result.valid, true, "grid alone still available");
assert.equal(result.limited, true);
close(result.exportW, 420, "grid export when other data missing");
assert.equal(result.pvHpW, null, "missing PV allocation must be unknown");

result = flow(500, 1200, 1000, false, 700);
assert.equal(result.limited, true, "active battery blocks allocation");
close(result.importW, 1200, "P1 import must remain visible");

result = flow(900, -1000, 500);
assert.equal(result.limited, true, "inconsistent PV/net must block allocation");
close(result.exportW, 1000, "P1 export still visible");

result = flow(900, 800, 2200);
assert.equal(result.limited, true, "HP larger than measured load blocks split");

const unit = Component.prototype.flowPower;
const power = {
  st: (id) => ({
    state: id === "kw" ? "2.5" : "2500",
    attributes: {unit_of_measurement: id === "kw" ? "kW" : "W"}
  })
};
close(unit.call(power, "kw"), 2500, "kW conversion");
close(unit.call(power, "w"), 2500, "W conversion");

assert.ok(code.includes('this.patchDom(nextHtml)'), "Incremental DOM updates preserved");
console.log("Energy flow: 8 scenarios passed");
