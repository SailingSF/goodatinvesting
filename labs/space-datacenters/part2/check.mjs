import { sizeSatellite, DEFAULTS } from "./model2.js";
import assert from "node:assert";
const near = (a, b, tol) => assert(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const h = sizeSatellite(DEFAULTS);
near(h.perKwYr, 5700.27, 1); near(h.mTotal, 2825.53, 0.5); assert.equal(h.pack.n, 25);
near(h.breakevenFriendly, 9.197, 0.01); assert(h.breakevenReal < 0); assert.equal(h.nSats, 1797); assert.equal(h.flights, 72);
const l8 = sizeSatellite({ ...DEFAULTS, life_yr: 8 });
near(l8.perKwYr, 3638.4, 1); assert.equal(l8.pack.n, 24); near(l8.breakevenReal, 1.54, 0.01);
near(sizeSatellite({ ...DEFAULTS, packing: "mass" }).perKwYr, 5154.15, 120);  // notebook's mass-limited case used a 25% bus
near(sizeSatellite({ ...DEFAULTS, packing: "tower" }).effPerKg, 475, 15);
console.log("ok", h.perKwYr.toFixed(0), l8.perKwYr.toFixed(0), sizeSatellite({ ...DEFAULTS, packing: "mass" }).perKwYr.toFixed(0));
