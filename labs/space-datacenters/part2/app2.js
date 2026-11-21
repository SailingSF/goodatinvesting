import { sizeSatellite, DEFAULTS } from "./model2.js";

const C = {
  text: "#2d1f47", grid: "#e8dcf3", muted: "#6a5e83",
  array: "#d057cb", radiator: "#f28cb9", bus: "#8f72dd", launch: "#6e57d8",
  line: "#b054e0", flat: "#ea4d9b", tower: "#8f72dd", mass: "#6e57d8",
};

// [key, label, min, max, step, unit, note]
const GROUPS = [
  ["Launch", [
    ["launch_cost_per_kg", "Starship price", 20, 3000, 10, "$/kg", "Price of a full flight ÷ its payload. Musk's goal is ~$10M a flight, about $100/kg at 150 t."],
    ["starship_payload_t", "Starship payload", 100, 200, 5, "t", "SpaceX says >100 t reusable; V3 claims ~200 t."],
  ]],
  ["Solar array", [
    ["array_cost_per_w", "Array price", 0, 150, 0.5, "$/W", "Whole deployed wing. Cheapest space panel today: $11.20/W; Solestial's target $40/W; flight wings $75–250/W."],
    ["array_w_per_kg", "Array specific power", 40, 400, 5, "W/kg", "Flown roll-out arrays: 100–120. 200 is a startup target."],
    ["array_degr_pct", "Degradation", 0, 4, 0.1, "%/yr", "Power lost per year to radiation. The array is oversized up front to cover it."],
    ["life_yr", "Satellite life", 3, 15, 0.5, "yr", "Also the GPUs' life: they retire with the satellite."],
  ]],
  ["Radiator", [
    ["gpu_temp_c", "GPU temperature", 60, 110, 1, "°C", "Hotter GPUs make a hotter radiator, which emits as T⁴."],
    ["delta_t_c", "GPU → radiator drop", 10, 50, 1, "°C", "Temperature lost through cold plates, coolant loop and tubes."],
    ["epsilon", "Emissivity", 0.7, 0.95, 0.01, "", "White silicate paint: ≥ 0.88."],
    ["radiator_kg_per_m2", "Areal density", 1, 5, 0.01, "kg/m²", "Per m² of radiating surface. The drawn panel: 2.18."],
    ["skin_mm", "Face sheet", 0.1, 1, 0.01, "mm", "Thicker sheets spread heat farther from the tubes."],
    ["tube_pitch_mm", "Tube spacing", 50, 300, 5, "mm", "Closer tubes, less cold sheet between them."],
  ]],
  ["Packing", [
    ["tray_cm", "Compute-tray layer", 10, 30, 1, "cm", "Flat-pack only. Thickness of the compute trays laid flat."],
    ["panel_mm", "Radiator panel", 5, 30, 1, "mm", "Flat-pack only. Folded panel thickness (5 mm gap added between panels)."],
    ["wing_kw_per_m3", "Wing stowed density", 20, 120, 5, "kW/m³", "Flat-pack only. ROSA-class roll-out wings: 40."],
  ]],
  ["Ground yardstick", [
    ["datacenter_mw", "Fleet size", 10, 1000, 10, "MW", "Average compute to deliver."],
    ["ground_build_per_mw", "Space-friendly build", 5e6, 30e6, 0.5e6, "$/MW", "Written off over the satellite's life. $20M/MW is a high-end AI build."],
    ["ground_energy_per_kw_yr", "Ground power", 500, 3000, 50, "$/kW-yr", "Suncatcher's range: $570–3,000."],
  ]],
];

const PRESETS = [
  ["Part 2 headline", {}],
  ["8-year life", { life_yr: 8 }],
  ["Solestial $40/W", { array_cost_per_w: 40 }],
  ["Rooftop-price wing", { array_cost_per_w: 0.11 }],
  ["Today's launch", { launch_cost_per_kg: 2500, array_cost_per_w: 50 }],
  ["All-in packing", { tray_cm: 15, panel_mm: 10, wing_kw_per_m3: 100 }],
];

const state = { ...DEFAULTS };
const form = document.getElementById("controls-form");
const inputs = {};

const usd = (v, d = 0) => (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const big = (v) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`);

function buildControls() {
  const packing = document.createElement("label");
  packing.innerHTML = `<span class="label-heading">Packing concept</span>
    <select id="packing"><option value="flatpack">Flat-pack (Starlink-style plates)</option>
    <option value="tower">Tower (first CAD pass, 11 per flight)</option>
    <option value="mass">No packing limit (flights leave full by mass)</option></select>`;
  for (const [title, rows] of GROUPS) {
    const h = document.createElement("h3");
    h.className = "group-title";
    h.textContent = title;
    form.append(h);
    if (title === "Packing") form.append(packing);
    for (const [key, label, min, max, step, unit, note] of rows) {
      const el = document.createElement("label");
      el.innerHTML = `<span class="label-heading">${label}</span>
        <span class="slider-row"><input type="range" min="${min}" max="${max}" step="${step}">
        <span class="value-with-unit"><input type="number" class="value-input${max >= 1e5 ? " wide" : ""}" step="${step}">
        <span class="value-unit">${unit}</span></span></span><p class="control-note">${note}</p>`;
      const [range, num] = el.querySelectorAll("input");
      const set = (v) => { state[key] = Number(v); sync(); render(); };
      range.addEventListener("input", () => set(range.value));
      num.addEventListener("change", () => set(num.value));
      inputs[key] = [range, num];
      form.append(el);
    }
  }
  packing.querySelector("select").addEventListener("change", (e) => { state.packing = e.target.value; render(); });

  const box = document.getElementById("presets");
  for (const [name, over] of PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = name;
    b.addEventListener("click", () => {
      Object.assign(state, DEFAULTS, over);
      box.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      sync();
      render();
    });
    box.append(b);
  }
  box.firstChild.classList.add("active");
}

function sync() {
  for (const [key, [range, num]] of Object.entries(inputs)) {
    range.value = state[key];
    num.value = state[key];
  }
  document.getElementById("packing").value = state.packing;
}

function kpi(label, value, desc, primary = false) {
  return `<article class="kpi${primary ? " primary" : ""}"><p>${label}</p><strong>${value}</strong><p class="kpi-desc">${desc}</p></article>`;
}

const layout = (extra) => ({
  margin: { l: 72, r: 20, t: 30, b: 50 },
  paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
  font: { family: "Plus Jakarta Sans, sans-serif", color: C.text, size: 12 },
  xaxis: { gridcolor: C.grid, zeroline: false }, yaxis: { gridcolor: C.grid, zeroline: false },
  legend: { orientation: "h", y: -0.25 },
  ...extra,
});
const vline = (x, dash, text) => ({
  shape: { type: "line", x0: x, x1: x, yref: "paper", y0: 0, y1: 1, line: { color: C.muted, dash, width: 1.5 } },
  ann: { x, yref: "paper", y: 1.02, text, showarrow: false, font: { size: 10, color: C.muted }, yanchor: "bottom" },
});
const hline = (y, dash, text) => ({
  shape: { type: "line", y0: y, y1: y, xref: "paper", x0: 0, x1: 1, line: { color: C.muted, dash, width: 1.5 } },
  ann: { y, xref: "paper", x: 1, text, showarrow: false, font: { size: 10, color: C.muted }, xanchor: "right", yanchor: "bottom" },
});
const cfg = { displayModeBar: false, responsive: true };

function render() {
  const s = sizeSatellite(state);
  const kpis = document.getElementById("kpis");
  if (!s.ok) {
    kpis.innerHTML = kpi("Space premium", "No solution", s.reason, true);
    return;
  }
  const be = (v) => (v > 0 ? usd(v, 2) + "/W" : "none");
  const fit = s.pack.n ? `${s.pack.n}` : `${s.pack.byMass}`;
  kpis.innerHTML = [
    kpi("Space premium", `${usd(s.perKwYr)} / kW-yr`, `${big(s.fleetPremium)} for a ${state.datacenter_mw} MW fleet of ${s.nSats.toLocaleString()} satellites.`, true),
    kpi("vs space-friendly ground", `${(s.perKwYr / s.groundFriendly).toFixed(2)}×`, `Ground at ${usd(s.groundFriendly)}/kW-yr: an expensive build written off over ${state.life_yr} years. Below 1× = space wins.`),
    kpi("vs realistic ground", `${(s.perKwYr / s.groundReal).toFixed(2)}×`, `Ground at ${usd(s.groundReal)}/kW-yr: an average US build over 15 years.`),
    kpi("Satellites per flight", fit, s.pack.n ? `Limited by ${s.pack.limitedBy}. ${s.pack.byMass} would fit by mass. ${s.flights} flights for the fleet.` : `Every flight full by mass. ${s.flights} flights for the fleet.`),
    kpi("Real launch price", `${usd(s.effPerKg)}/kg`, `Flight price ÷ what's actually on board. Sticker: ${usd(state.launch_cost_per_kg)}/kg.`),
    kpi("Satellite mass", `${Math.round(s.mTotal).toLocaleString()} kg`, `Array ${Math.round(s.mArray)} · radiator ${Math.round(s.mRad)} · bus ${Math.round(s.mBus)} · compute 750 · propellant ${Math.round(s.mProp)} kg.`),
    kpi("Break-even array price", be(s.breakevenFriendly), `Most the whole wing can cost per watt to match space-friendly ground. Realistic ground: ${be(s.breakevenReal)}.`),
    kpi("Radiator", `${Math.round(s.aRad)} m²`, `Radiating area, ${(s.finEff * 100).toFixed(0)}% fin efficiency at ${s.tRadC.toFixed(0)} °C. Net ${s.qNet.toFixed(0)} W/m².`),
    kpi("Solar array", `${s.pArrayKw.toFixed(1)} kW`, `At beginning of life, to still carry 132 kW after ${state.life_yr} years.`),
  ].join("");

  const ratio = s.perKwYr / s.groundReal;
  document.getElementById("verdict").innerHTML = s.perKwYr < s.groundReal
    ? `<strong>Space beats even the realistic ground build</strong> with these settings.`
    : s.perKwYr < s.groundFriendly
      ? `Space beats the space-friendly yardstick, but is still <strong>${ratio.toFixed(1)}×</strong> the realistic one.`
      : `Space loses to both yardsticks: <strong>${(s.perKwYr / s.groundFriendly).toFixed(2)}×</strong> the space-friendly one and <strong>${ratio.toFixed(1)}×</strong> the realistic one.`;

  // 1. Stacked bar of the premium
  const per = (c) => (c * s.perKwYr) / s.premium;  // $ per satellite → $/kW-yr
  const parts = [["Solar array", s.cArray, C.array], ["Radiator", s.cRad, C.radiator], ["Bus", s.cBus, C.bus], ["Launch", s.cLaunch, C.launch]];
  const lines = [vline(s.groundFriendly, "dash", "space-friendly"), vline(s.groundReal, "dot", "realistic")];
  Plotly.react("chart-stack", parts.map(([name, c, color]) => ({
    type: "bar", orientation: "h", name, x: [per(c)], y: ["Space"], marker: { color },
    hovertemplate: `${name}: %{x:$,.0f}/kW-yr<extra></extra>`,
  })), layout({
    barmode: "stack", height: 240, yaxis: { visible: false },
    xaxis: { gridcolor: C.grid, tickprefix: "$", tickformat: ",.0f", range: [0, Math.max(s.perKwYr, s.groundFriendly) * 1.12] },
    shapes: lines.map((l) => l.shape), annotations: lines.map((l) => l.ann),
  }), cfg);

  // 2. Premium vs life
  const lives = Array.from({ length: 49 }, (_, i) => 3 + i * 0.25);
  const lifeRuns = lives.map((L) => sizeSatellite({ ...state, life_yr: L }));
  const real = hline(s.groundReal, "dot", "realistic ground");
  Plotly.react("chart-life", [
    { x: lives, y: lifeRuns.map((r) => (r.ok ? r.perKwYr : null)), name: "Space premium", line: { color: C.line, width: 3 }, hovertemplate: "%{x} yr: %{y:$,.0f}<extra></extra>" },
    { x: lives, y: lifeRuns.map((r) => r.groundFriendly), name: "Space-friendly ground", line: { color: C.muted, dash: "dash", width: 1.5 }, hoverinfo: "skip" },
    { x: [state.life_yr], y: [s.perKwYr], mode: "markers", marker: { size: 11, color: C.flat, line: { color: "#fff", width: 2 } }, showlegend: false, hoverinfo: "skip" },
  ], layout({
    height: 340, xaxis: { title: "Life, years", gridcolor: C.grid },
    yaxis: { title: "$ per kW-yr", tickprefix: "$", tickformat: ",.0f", gridcolor: C.grid, range: [0, Math.max(10000, s.perKwYr * 1.2)] },
    shapes: [real.shape], annotations: [real.ann],
  }), cfg);

  // 3. Premium vs launch price for each packing
  const prices = Array.from({ length: 40 }, (_, i) => 20 * (3000 / 20) ** (i / 39));
  const curve = (packing) => prices.map((L) => { const r = sizeSatellite({ ...state, packing, launch_cost_per_kg: L }); return r.ok ? r.perKwYr : null; });
  const lf = hline(s.groundFriendly, "dash", "space-friendly"), lr = hline(s.groundReal, "dot", "realistic");
  Plotly.react("chart-launch", [
    { x: prices, y: curve("mass"), name: "Mass-limited", line: { color: C.mass, width: 2 } },
    { x: prices, y: curve("flatpack"), name: "Flat-pack", line: { color: C.flat, width: 3 } },
    { x: prices, y: curve("tower"), name: "Tower", line: { color: C.tower, width: 2, dash: "dash" } },
    { x: [state.launch_cost_per_kg], y: [s.perKwYr], mode: "markers", marker: { size: 11, color: C.text, line: { color: "#fff", width: 2 } }, showlegend: false, hoverinfo: "skip" },
  ], layout({
    height: 340, hovermode: "x unified",
    xaxis: { title: "Starship $/kg (log)", type: "log", gridcolor: C.grid, tickprefix: "$" },
    yaxis: { title: "$ per kW-yr (log)", type: "log", tickprefix: "$", tickformat: ",.0f", gridcolor: C.grid },
    shapes: [lf.shape, lr.shape], annotations: [lf.ann, lr.ann],
  }), cfg);
}

buildControls();
sync();
render();
