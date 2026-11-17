// Heat rejection for the Part 2 radiator panel (cad/radiator in the space_datacenters repo).
// The face sheet between two tube flanges is a fin: heat conducts sideways from the tube and
// radiates away as εσT⁴, so the sheet gets cooler the farther it is from a tube.
export const SIGMA = 5.670374419e-8;
export const K_AL = 130;              // 7075 aluminum, W/m·K
export const FLANGE_M = 0.02;         // each tube's flange bonded to the sheet
export const PANEL = { length: 4.556, width: 4.7, tubes: 30 };   // one of eight panels, m
export const LOAD_W = 132000;         // 120 kW of GPUs + 10% overhead, all of it heat
export const T_SINK_K = 3;
// Absorbed Sun and Earth heat per m² of radiating surface, worst day (notebook Section 3.4):
// Earth IR 54 + albedo 10 + grazing sunlight 51 W/m²
export const BACKLOAD_W_M2 = 0.9 * 234 * 0.25777 + 0.2 * 1361 * 0.294 * 0.25777 * 0.5 + 0.2 * 1361 * 0.18635;

/** Temperature along the sheet from a flange edge (x = 0) to midway between tubes (x = L).
 *  Solves k·t·T'' = ε·σ·(T⁴ − T_sink⁴) with T(0) = T_tube and T'(L) = 0, by Newton's method. */
export function finProfile({ tubeC, skinM, pitchM, eps, n = 81 }) {
  const L = (pitchM - FLANGE_M) / 2;
  const dx = L / (n - 1);
  const kt = (K_AL * skinM) / dx ** 2;
  const Tb = tubeC + 273.15;
  const T = new Float64Array(n).fill(Tb);
  const a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n), d = new Float64Array(n);
  for (let iter = 0; iter < 30; iter++) {
    b[0] = 1; c[0] = 0; d[0] = 0;                                 // fixed at the tube
    for (let i = 1; i < n; i++) {
      const left = T[i - 1], right = i === n - 1 ? T[n - 2] : T[i + 1];   // symmetry at the midpoint
      a[i] = i === n - 1 ? 2 * kt : kt;
      c[i] = i === n - 1 ? 0 : kt;
      b[i] = -2 * kt - 4 * eps * SIGMA * T[i] ** 3;
      d[i] = -(kt * (left - 2 * T[i] + right) - eps * SIGMA * (T[i] ** 4 - T_SINK_K ** 4));
    }
    for (let i = 1; i < n; i++) {                                  // Thomas algorithm
      const m = a[i] / b[i - 1];
      b[i] -= m * c[i - 1];
      d[i] -= m * d[i - 1];
    }
    let worst = 0;
    for (let i = n - 1; i >= 0; i--) {
      const step = (d[i] - c[i] * (i < n - 1 ? d[i + 1] : 0)) / b[i];
      d[i] = step;
      T[i] += step;
      worst = Math.max(worst, Math.abs(step));
    }
    if (worst < 1e-7) break;
  }
  const x = Array.from(T, (_, i) => i * dx);
  return { x, T: Array.from(T, (v) => v - 273.15), L };
}

/** The notebook's closed form: the same fin with radiation linearized at the tube temperature. */
export function linearFinEfficiency({ tubeC, skinM, pitchM, eps }) {
  const h = 4 * eps * SIGMA * (tubeC + 273.15) ** 3;
  const half = (pitchM - FLANGE_M) / 2;
  const mL = Math.sqrt(h / (K_AL * skinM)) * half;
  return (FLANGE_M + (2 * half * Math.tanh(mL)) / mL) / pitchM;
}

/** Everything the page shows, for one set of inputs. */
export function radiator({ junctionC, drops, eps, skinMm, pitchMm, backload }) {
  const tubeC = junctionC - drops.reduce((s, v) => s + v, 0);
  const skinM = skinMm / 1000, pitchM = pitchMm / 1000;
  const fin = finProfile({ tubeC, skinM, pitchM, eps });
  const emit = (c) => eps * SIGMA * ((c + 273.15) ** 4 - T_SINK_K ** 4);
  // Average emission over one pitch: the flange (at tube temperature) plus the fin on each side
  let finSum = 0;
  for (let i = 1; i < fin.T.length; i++) finSum += ((emit(fin.T[i - 1]) + emit(fin.T[i])) / 2) * (fin.x[i] - fin.x[i - 1]);
  const ideal = emit(tubeC);
  const efficiency = (FLANGE_M * ideal + 2 * finSum) / (pitchM * ideal);
  const qBack = backload ? BACKLOAD_W_M2 : 0;
  const qNet = efficiency * ideal - qBack;
  const area = qNet > 0 ? LOAD_W / qNet : Infinity;            // radiating area, both faces counted
  const perPanel = 2 * PANEL.length * PANEL.width;
  // Panel mass per m² of planform, from the CAD roll-up: two skins + tubes + everything else
  const planformKg = 2 * skinM * 2810 + (1.08709 / PANEL.width) / pitchM + 1.4108;
  return {
    tubeC, fin, efficiency, linearEfficiency: linearFinEfficiency({ tubeC, skinM, pitchM, eps }), ideal, qBack, qNet, area,
    panels: Math.ceil(area / perPanel / 2) * 2,
    kgPerM2: planformKg / 2,
    mass: (area * planformKg) / 2,
    midC: fin.T[fin.T.length - 1],
  };
}
