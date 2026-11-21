// Part 2 model: one best-case satellite at 550 km dawn-dusk, as drawn in SolidWorks and packed in Starship.
// Port of size_satellite() and friends from space_gpu_datacenter_part2.ipynb (Sections 3-11).
import { satsPerFlight } from "./packing.js";

const SIGMA = 5.670374419e-8;
const SOLAR_CONSTANT = 1361;
const MU_EARTH = 3.986004418e14;
const R_EARTH = 6371000;
const G0 = 9.80665;
const ALT_KM = 550;

// Fixed by the orbit and the CAD; computed in the notebook.
export const FIXED = {
  P_COMPUTE_KW: 120,
  OVERHEAD_FRAC: 0.1,
  M_COMPUTE_KG: 750,
  AVAILABILITY: 0.92785,          // year-average compute: paused in shadow, throttled in off-angle sun (Sec. 3.4)
  F_EARTH: 0.25777,               // view factor from a vertical fin face to Earth at 550 km
  F_SOLAR: 0.18635,               // direct sunlight on the fins, worst day (Sec. 3.4)
  ALPHA_SOLAR: 0.2,
  ALPHA_IR: 0.9,
  T_SINK_K: 3,
  EARTH_IR: 234,
  ALBEDO: 0.294,
  ALBEDO_GEOM: 0.5,
  RADIATOR_COST_PER_M2: 2000,
  BUS_COST: 500000,
  BUS_MASS_KG: 596.22,            // bottom-up bus from the SolidWorks flat-pack (structure + equipment + 8% unmodeled)
  ARRAY_W_PER_M2: 400,
  SKIN_K: 130,                    // 7075 aluminum, W/m·K
  TUBE_FLANGE_M: 0.02,
  ATM_DENSITY: 3e-13,             // 550 km near solar maximum
  DRAG_CD: 2.2,
  FRONTAL_BUS_M2: 15,
  EP_ISP_S: 1500,
  // Flat-pack plate (Section 6)
  PLATE: [5.7, 5.0],
  POST_M: 0.12,
  GAP_M: 0.03,
  DECK_TUBE_M: 0.08,
  PANEL_GAP_M: 0.005,             // between folded radiator panels
  COMPUTE_TRAY_X_M: 2.4,
  TOWER_PER_FLIGHT: 11,
  // Starship bay with the 22 m extension, (height, radius) m
  BAY: [[0, 4], [12.76, 4], [13.76, 3.85], [14.76, 3.68], [15.76, 3.49], [16.76, 3.27],
        [17.76, 3.04], [18.76, 2.78], [19.76, 2.51], [20.76, 2.2], [22, 1.8]],
};

export const DEFAULTS = {
  datacenter_mw: 200,
  launch_cost_per_kg: 100,
  starship_payload_t: 150,
  array_cost_per_w: 10,
  array_w_per_kg: 200,
  array_degr_pct: 1,
  life_yr: 5,
  gpu_temp_c: 90,
  delta_t_c: 30,
  epsilon: 0.9,
  radiator_kg_per_m2: 2.18,
  skin_mm: 0.25,
  tube_pitch_mm: 150,
  packing: "flatpack",            // flatpack | tower | mass
  tray_cm: 26,
  panel_mm: 25,
  wing_kw_per_m3: 40,
  ground_build_per_mw: 20e6,      // space-friendly yardstick; written off over the satellite's life
  ground_energy_per_kw_yr: 1500,
  real_build_per_mw: 11.7e6,
  real_amort_yr: 15,
};

/** Surface efficiency of a tube-and-sheet radiator face: the sheet between tube flanges is a straight fin,
 *  radiating from one side, with the linearized coefficient h = 4·ε·σ·T³. */
export function finEfficiency(skinM, pitchM, tRadC, epsilon, k = FIXED.SKIN_K, flangeM = FIXED.TUBE_FLANGE_M) {
  const h = 4 * epsilon * SIGMA * (tRadC + 273.15) ** 3;
  const halfGap = (pitchM - flangeM) / 2;
  const mL = Math.sqrt(h / (k * skinM)) * halfGap;
  return (flangeM + (2 * halfGap * Math.tanh(mL)) / mL) / pitchM;
}

function flatpackPerFlight(pArrayKw, aRadPanel, x, byMass) {
  const F = FIXED;
  const [Lx, Lz] = F.PLATE;
  const g = F.GAP_M;
  const wingX = (Lx - F.COMPUTE_TRAY_X_M) / 2 - 2 * g - 2 * F.DECK_TUBE_M;
  const wingZ = Lz - 2 * F.POST_M - 2 * g;
  const wingT = pArrayKw / 2 / x.wing_kw_per_m3 / (wingX * wingZ);
  const panelLMax = Lx - 2 * F.POST_M - 2 * g;
  let nPan = Math.ceil(aRadPanel / (panelLMax * wingZ));
  nPan += nPan % 2;
  const eqH = Math.max(x.tray_cm / 100, wingT);
  const layer = eqH + g + nPan * (x.panel_mm / 1000 + F.PANEL_GAP_M) + g;
  const byVolume = satsPerFlight([Lx + 0.02, layer, Lz + 0.02], F.BAY).total;
  return { n: Math.min(byMass, byVolume), byVolume, byMass, layer, wingT, nPan, limitedBy: byVolume < byMass ? "volume" : "mass" };
}

/** One satellite plus the fleet. `x` = DEFAULTS-shaped inputs. */
export function sizeSatellite(x) {
  const F = FIXED;
  const pLoadW = 1000 * F.P_COMPUTE_KW * (1 + F.OVERHEAD_FRAC);

  // Array: end-of-life power must still meet the full load
  const pArrayW = pLoadW / (1 - x.array_degr_pct / 100) ** x.life_yr;
  const mArray = pArrayW / x.array_w_per_kg;
  const cArray = pArrayW * x.array_cost_per_w;

  // Radiator: vertical fins, both faces radiate, sized for full load on the sunniest day
  const tRadC = x.gpu_temp_c - x.delta_t_c;
  const eff = finEfficiency(x.skin_mm / 1000, x.tube_pitch_mm / 1000, tRadC, x.epsilon);
  const qEmit = x.epsilon * SIGMA * eff * ((tRadC + 273.15) ** 4 - F.T_SINK_K ** 4);
  const qBack = F.ALPHA_IR * F.EARTH_IR * F.F_EARTH
    + F.ALPHA_SOLAR * SOLAR_CONSTANT * F.ALBEDO * F.F_EARTH * F.ALBEDO_GEOM
    + F.ALPHA_SOLAR * SOLAR_CONSTANT * F.F_SOLAR;
  const qNet = qEmit - qBack;
  if (qNet <= 0) return { ok: false, reason: "The radiator absorbs more than it emits at this temperature." };
  const aRad = pLoadW / qNet;
  const aRadPanel = aRad / 2;
  const mRad = aRad * x.radiator_kg_per_m2;
  const cRad = aRad * F.RADIATOR_COST_PER_M2;

  // Dry mass with the CAD bus, then drag propellant
  const mCore = F.M_COMPUTE_KG + mRad + mArray;
  const mDry = mCore + F.BUS_MASS_KG;
  const v = Math.sqrt(MU_EARTH / (R_EARTH + 1000 * ALT_KM));
  const accel = (0.5 * F.ATM_DENSITY * v ** 2 * F.DRAG_CD * (F.FRONTAL_BUS_M2 + aRadPanel)) / mDry;
  const dvLife = accel * 365.25 * 86400 * x.life_yr;
  const mProp = mDry * (Math.exp(dvLife / (G0 * F.EP_ISP_S)) - 1);
  const mTotal = mDry + mProp;

  // Launch: Starship sells flights, so the price is flight cost ÷ satellites per flight
  const flightCost = x.launch_cost_per_kg * x.starship_payload_t * 1000;
  const byMass = Math.floor((x.starship_payload_t * 1000) / mTotal);
  let pack;
  if (x.packing === "flatpack") pack = flatpackPerFlight(pArrayW / 1000, aRadPanel, x, byMass);
  else if (x.packing === "tower") pack = { n: Math.min(F.TOWER_PER_FLIGHT, byMass), byVolume: F.TOWER_PER_FLIGHT, byMass, limitedBy: "volume" };
  else pack = { n: null, byMass, limitedBy: "mass (no packing limit)" };
  const cLaunch = pack.n ? flightCost / pack.n : mTotal * x.launch_cost_per_kg;

  const premium = cArray + cRad + F.BUS_COST + cLaunch;
  const avgKw = F.P_COMPUTE_KW * F.AVAILABILITY;
  const perKwYr = premium / (avgKw * x.life_yr);

  const nSats = Math.ceil((x.datacenter_mw * 1000) / avgKw);
  const groundFriendly = x.ground_build_per_mw / 1000 / x.life_yr + x.ground_energy_per_kw_yr;
  const groundReal = x.real_build_per_mw / 1000 / x.real_amort_yr + x.ground_energy_per_kw_yr;
  // Premium is linear in array price, so the break-even $/W is exact
  const breakeven = (target) => (target * avgKw * x.life_yr - (premium - cArray)) / pArrayW;

  return {
    ok: true,
    pArrayKw: pArrayW / 1000, mArray, mRad, mBus: F.BUS_MASS_KG, mProp, mCompute: F.M_COMPUTE_KG, mTotal,
    aRad, aRadPanel, finEff: eff, tRadC, qNet, qEmit, qBack,
    cArray, cRad, cBus: F.BUS_COST, cLaunch, premium, perKwYr,
    effPerKg: cLaunch / mTotal, pack, nSats,
    flights: pack.n ? Math.ceil(nSats / pack.n) : Math.ceil((nSats * mTotal) / (x.starship_payload_t * 1000)),
    fleetPremium: nSats * premium,
    groundFriendly, groundReal,
    breakevenFriendly: breakeven(groundFriendly),
    breakevenReal: breakeven(groundReal),
  };
}
