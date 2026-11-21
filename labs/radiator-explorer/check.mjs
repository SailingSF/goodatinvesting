// node check.mjs: the drawn panel should reproduce the notebook (80% linearized / 81% exact fin efficiency, 343 m², 8 panels, 2.18 kg/m²).
import assert from "node:assert";
import { radiator } from "./thermal.js";

const r = radiator({ junctionC: 90, drops: [12, 8, 10], eps: 0.9, skinMm: 0.25, pitchMm: 150, backload: true });
console.log({ eff: r.efficiency.toFixed(4), area: r.area.toFixed(1), panels: r.panels, kgPerM2: r.kgPerM2.toFixed(3), mid: r.midC.toFixed(1) });
assert(Math.abs(r.efficiency - 0.811) < 0.005, "fin efficiency (exact T⁴ solve)");
assert(Math.abs(r.linearEfficiency - 0.7962) < 0.001, "notebook linearized efficiency");
assert(Math.abs(r.area - 342.7) < 10, "area");
assert.equal(r.panels, 8);
assert(Math.abs(r.kgPerM2 - 2.18) < 0.01, "areal density");
// A hotter GPU needs less radiator; a thicker sheet is more efficient
assert(radiator({ junctionC: 110, drops: [30], eps: 0.9, skinMm: 0.25, pitchMm: 150, backload: true }).area < r.area);
assert(radiator({ junctionC: 90, drops: [30], eps: 0.9, skinMm: 0.6, pitchMm: 150, backload: true }).efficiency > r.efficiency);
console.log("ok");
