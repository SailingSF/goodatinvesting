import { radiator, SIGMA, FLANGE_M, PANEL, LOAD_W, BACKLOAD_W_M2, T_SINK_K } from "./thermal.js";

// [key, label, min, max, step, default, unit, group, note]
const CONTROLS = [
  ["junctionC", "GPU junction temperature", 60, 120, 1, 90, "°C", "GPU", "The hottest point on the die. Blackwell-class GPUs run up to about 90 °C; hotter means throttling and a shorter life."],
  ["d1", "Junction → cold plate", 2, 30, 1, 12, "°C", "Temperature drops", "Through the silicon, thermal paste and the cold plate bolted to each GPU."],
  ["d2", "Cold plate → coolant", 2, 20, 1, 8, "°C", "Temperature drops", "Into the liquid flowing through the cold plates."],
  ["d3", "Coolant → radiator tube", 2, 25, 1, 10, "°C", "Temperature drops", "Across a heat exchanger into the ammonia loop, and out along the lines to the panels."],
  ["eps", "Emissivity", 0.7, 0.95, 0.01, 0.9, "", "Radiator panel", "How close the surface comes to a perfect radiator. White silicate paint: at least 0.88."],
  ["skinMm", "Face sheet thickness", 0.1, 1.0, 0.01, 0.25, "mm", "Radiator panel", "Thicker sheets carry heat farther from the tubes, but weigh more."],
  ["pitchMm", "Tube spacing", 60, 300, 5, 150, "mm", "Radiator panel", "Closer tubes leave less cold sheet between them, but tubes and coolant weigh more."],
];

const state = Object.fromEntries(CONTROLS.map((c) => [c[0], c[5]]));
state.backload = true;
let R;

// ---------------------------------------------------------------- colors
const T_MIN = 0, T_MAX = 110;   // fixed color scale, °C, so changes are visible
const STOPS = [[0, [8, 6, 30]], [0.22, [60, 15, 110]], [0.45, [160, 35, 105]], [0.65, [230, 85, 50]], [0.85, [252, 175, 40]], [1, [252, 250, 200]]];
function heat(c) {
  const t = Math.min(1, Math.max(0, (c - T_MIN) / (T_MAX - T_MIN)));
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, a] = STOPS[i - 1], [t1, b] = STOPS[i];
      const f = (t - t0) / (t1 - t0);
      return a.map((v, k) => Math.round(v + (b[k] - v) * f));
    }
  }
  return STOPS.at(-1)[1];
}
const rgb = (c, a = 1) => `rgba(${heat(c).join(",")},${a})`;
const textOn = (c) => ((c - T_MIN) / (T_MAX - T_MIN) > 0.55 ? "#120c1c" : "#f4eefc");
const emit = (c) => state.eps * SIGMA * ((c + 273.15) ** 4 - T_SINK_K ** 4);

/** Temperature at a distance from the nearest tube center, inside one tube spacing. */
function tempAt(dFromTube) {
  const d = dFromTube - FLANGE_M / 2;
  if (d <= 0) return R.tubeC;
  const { x, T, L } = R.fin;
  const pos = Math.min(d, L) / L * (x.length - 1);
  const i = Math.min(Math.floor(pos), x.length - 2);
  return T[i] + (T[i + 1] - T[i]) * (pos - i);
}

// ---------------------------------------------------------------- canvases
function sized(canvas) {
  const dpr = Math.min(devicePixelRatio, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [g, w, h];
}

/** Minimal line chart. series: [{ y, color, dash, width, fillTo }] */
function plot(canvas, { xs, series, xLabel, yLabel, xFmt, yFmt, marker, yMin, yMax }) {
  const [g, w, h] = sized(canvas);
  g.clearRect(0, 0, w, h);
  const m = { l: 58, r: 14, t: 12, b: 40 };
  const all = series.flatMap((s) => s.y).filter(Number.isFinite);
  const lo = yMin ?? Math.min(...all), hi = yMax ?? Math.max(...all) * 1.05;
  const X = (v) => m.l + ((v - xs[0]) / (xs.at(-1) - xs[0])) * (w - m.l - m.r);
  const Y = (v) => h - m.b - ((v - lo) / (hi - lo)) * (h - m.t - m.b);
  g.font = "11px Plus Jakarta Sans, sans-serif";
  g.strokeStyle = "rgba(206,185,226,0.12)";
  g.fillStyle = "#a497bd";
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4;
    g.beginPath(); g.moveTo(m.l, Y(v)); g.lineTo(w - m.r, Y(v)); g.stroke();
    g.textAlign = "right"; g.fillText(yFmt(v), m.l - 6, Y(v) + 4);
  }
  for (let i = 0; i <= 5; i++) {
    const v = xs[0] + ((xs.at(-1) - xs[0]) * i) / 5;
    g.textAlign = "center"; g.fillText(xFmt(v), X(v), h - m.b + 16);
  }
  g.fillText(xLabel, (m.l + w - m.r) / 2, h - 6);
  g.save(); g.translate(13, (m.t + h - m.b) / 2); g.rotate(-Math.PI / 2); g.fillText(yLabel, 0, 0); g.restore();
  for (const s of series) {
    if (s.fillTo) {
      g.beginPath();
      xs.forEach((x, i) => g.lineTo(X(x), Y(s.y[i])));
      for (let i = xs.length - 1; i >= 0; i--) g.lineTo(X(xs[i]), Y(s.fillTo[i]));
      g.fillStyle = s.fill; g.fill();
    }
    g.beginPath();
    xs.forEach((x, i) => (Number.isFinite(s.y[i]) ? g.lineTo(X(x), Y(Math.min(s.y[i], hi))) : null));
    g.setLineDash(s.dash ?? []); g.strokeStyle = s.color; g.lineWidth = s.width ?? 2.5; g.stroke(); g.setLineDash([]);
    if (s.label) { g.fillStyle = s.color; g.textAlign = "right"; g.fillText(s.label, w - m.r - 4, Y(Math.min(s.y.at(-1), hi)) - 7); }
  }
  if (marker && Number.isFinite(marker.y)) {
    g.beginPath(); g.arc(X(marker.x), Y(marker.y), 6, 0, Math.PI * 2);
    g.fillStyle = "#ea4d9b"; g.fill(); g.lineWidth = 2; g.strokeStyle = "#fff"; g.stroke();
  }
}

// 2. Animated cross-section with photons
const section = document.getElementById("section");
const photons = [];
function drawSection(dt) {
  const [g, w, h] = sized(section);
  g.clearRect(0, 0, w, h);
  const pitchPx = w / 3, mmPx = pitchPx / state.pitchMm;
  const coreH = Math.max(36, 25 * mmPx * 1.6), skinH = Math.max(7, state.skinMm * mmPx * 12);
  const top = h / 2 - coreH / 2, bottom = h / 2 + coreH / 2;
  // honeycomb core
  g.fillStyle = "#231c30"; g.fillRect(0, top, w, coreH);
  g.strokeStyle = "rgba(206,185,226,0.12)";
  for (let x = 0; x < w; x += 9) { g.beginPath(); g.moveTo(x, top); g.lineTo(x, bottom); g.stroke(); }
  // skins, colored by local temperature
  for (let px = 0; px < w; px += 2) {
    const d = Math.abs(((px / pitchPx) % 1) - 0.5) * state.pitchMm / 1000;
    g.fillStyle = rgb(tempAt(d));
    g.fillRect(px, top - skinH, 2, skinH);
    g.fillRect(px, bottom, 2, skinH);
  }
  // tubes, bonded to both skins
  const flangePx = FLANGE_M * 1000 * mmPx;
  for (let j = 0; j < 3; j++) {
    const cx = (j + 0.5) * pitchPx;
    g.fillStyle = rgb(R.tubeC);
    g.fillRect(cx - flangePx / 2, top, flangePx, coreH);
    g.fillStyle = "rgba(20,14,30,0.5)";
    g.beginPath(); g.arc(cx, h / 2, Math.max(4, flangePx * 0.3), 0, Math.PI * 2); g.fill();
  }
  // photons out: spawn rate follows εσT⁴ of the sheet under them
  const rate = 0.011 * dt * 60;
  const ref = emit(100);
  for (let px = 0; px < w; px += 3) {
    const d = Math.abs(((px / pitchPx) % 1) - 0.5) * state.pitchMm / 1000;
    const c = tempAt(d);
    const p = (emit(c) / ref) * rate * 3;
    for (const side of [-1, 1]) {
      if (Math.random() < p) {
        const ang = (Math.random() - 0.5) * 1.6;
        photons.push({ x: px, y: side < 0 ? top - skinH : bottom + skinH, vx: Math.sin(ang) * 70, vy: side * Math.cos(ang) * 70, c, life: 1, out: true });
      }
    }
  }
  // photons in: Sun and Earth heat arriving
  if (state.backload && Math.random() < (BACKLOAD_W_M2 / ref) * rate * w * 0.4) {
    const side = Math.random() < 0.5 ? -1 : 1;
    photons.push({ x: Math.random() * w, y: side < 0 ? 0 : h, vx: (Math.random() - 0.5) * 20, vy: -side * 60, c: null, life: 1, out: false });
  }
  for (let i = photons.length - 1; i >= 0; i--) {
    const p = photons[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    const gone = p.out ? (p.y < 0 || p.y > h) : (p.y > top - skinH && p.y < bottom + skinH);
    if (gone) { photons.splice(i, 1); continue; }
    const fade = p.out ? Math.min(1, Math.abs(p.y - h / 2) / 30) * (1 - Math.abs(p.y - h / 2) / (h / 2)) + 0.15 : 0.55;
    g.fillStyle = p.out ? rgb(Math.max(p.c, 45) + 25, Math.min(1, fade * 1.4)) : `rgba(150,190,255,${fade})`;
    g.beginPath(); g.arc(p.x, p.y, p.out ? 2.2 : 1.6, 0, Math.PI * 2); g.fill();
  }
  // labels
  g.font = "600 12px Plus Jakarta Sans, sans-serif";
  g.textAlign = "center";
  g.fillStyle = "#f4eefc";
  g.fillText(`tube ${R.tubeC.toFixed(0)} °C`, pitchPx * 0.5, h / 2 + coreH / 2 + skinH + 18);
  g.fillText(`midway ${R.midC.toFixed(0)} °C`, pitchPx, h / 2 + coreH / 2 + skinH + 18);
  g.fillStyle = "#a497bd";
  g.font = "11px Plus Jakarta Sans, sans-serif";
  g.fillText("deep space, 3 K", w / 2, 14);
  g.fillText("deep space, 3 K", w / 2, h - 6);
  g.textAlign = "left";
  g.fillText(`face sheet ${state.skinMm.toFixed(2)} mm (drawn thicker)`, 8, top - skinH - 8);
}

// 3. Panel face heatmap
function drawFace() {
  const canvas = document.getElementById("face");
  const [g, w, h] = sized(canvas);
  const img = g.createImageData(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const pitch = state.pitchMm / 1000;
  const nTubes = Math.floor(PANEL.length / pitch);
  const margin = (PANEL.length - nTubes * pitch) / 2;
  const manifold = 0.09;   // m, at each end of the tubes
  for (let py = 0; py < img.height; py++) {
    const y = (py / img.height) * PANEL.length - margin;
    const k = Math.min(nTubes - 1, Math.max(0, Math.floor(y / pitch)));
    const d = Math.abs(y - (k + 0.5) * pitch);
    const rowC = tempAt(d);
    for (let px = 0; px < img.width; px++) {
      const x = (px / img.width) * PANEL.width;
      const c = x < manifold || x > PANEL.width - manifold ? R.tubeC : rowC;
      const [r, gg, b] = heat(c);
      const o = (py * img.width + px) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  const dpr = canvas.width / w;
  g.setTransform(1, 0, 0, 1, 0, 0);
  const tmp = new OffscreenCanvas(img.width, img.height);
  tmp.getContext("2d").putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(tmp, 0, 0, canvas.width, canvas.height);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  document.getElementById("face-note").textContent =
    `${nTubes} tubes at ${state.pitchMm} mm, fed by a manifold at each end. Average emission is ${(R.efficiency * 100).toFixed(0)}% of a panel held entirely at ${R.tubeC.toFixed(0)} °C.`;
}

// ---------------------------------------------------------------- page
function buildControls() {
  const form = document.getElementById("controls");
  let group = "";
  for (const [key, label, min, max, step, , unit, grp, note] of CONTROLS) {
    if (grp !== group) {
      group = grp;
      form.insertAdjacentHTML("beforeend", `<p class="group-title">${grp}</p>`);
    }
    const el = document.createElement("label");
    el.className = "control";
    el.innerHTML = `<span class="head">${label}<output></output></span>
      <input type="range" min="${min}" max="${max}" step="${step}"><small>${note}</small>`;
    const input = el.querySelector("input");
    input.dataset.key = key;
    input.addEventListener("input", () => { state[key] = Number(input.value); update(); });
    form.append(el);
  }
  document.getElementById("backload").addEventListener("change", (e) => { state.backload = e.target.checked; update(); });
  document.getElementById("reset").addEventListener("click", () => {
    for (const c of CONTROLS) state[c[0]] = c[5];
    state.backload = true;
    update();
  });
  document.getElementById("backload-value").textContent = BACKLOAD_W_M2.toFixed(0);
  const bar = STOPS.map(([t, c]) => `rgb(${c.join(",")}) ${t * 100}%`).join(",");
  document.getElementById("legend").innerHTML = `<span>${T_MIN} °C</span><span class="bar" style="background:linear-gradient(90deg,${bar})"></span><span>${T_MAX} °C</span>`;
}

const inputs = (s) => ({ junctionC: s.junctionC, drops: [s.d1, s.d2, s.d3], eps: s.eps, skinMm: s.skinMm, pitchMm: s.pitchMm, backload: s.backload });

function update() {
  R = radiator(inputs(state));
  for (const input of document.querySelectorAll("#controls input")) {
    const key = input.dataset.key;
    input.value = state[key];
    const unit = CONTROLS.find((c) => c[0] === key)[6];
    input.previousElementSibling.querySelector("output").textContent = `${state[key]}${unit ? " " + unit : ""}`;
  }
  document.getElementById("backload").checked = state.backload;

  const ok = Number.isFinite(R.area);
  const kpi = (label, value, sub, primary) => `<div class="kpi${primary ? " primary" : ""}"><p>${label}</p><strong>${value}</strong><p>${sub}</p></div>`;
  document.getElementById("kpis").innerHTML = [
    kpi("Radiator area", ok ? `${Math.round(R.area)} m²` : "∞", ok ? `${R.panels} panels like the drawn one` : "Absorbs more than it emits", true),
    kpi("Radiator mass", ok ? `${Math.round(R.mass)} kg` : "–", `${R.kgPerM2.toFixed(2)} kg per m² radiating`),
    kpi("Fin efficiency", `${(R.efficiency * 100).toFixed(1)}%`, `Notebook's linear estimate: ${(R.linearEfficiency * 100).toFixed(1)}%`),
    kpi("Tube → midway", `${R.tubeC.toFixed(0)} → ${R.midC.toFixed(0)} °C`, "Sheet temperature between tubes"),
    kpi("Net heat out", `${R.qNet.toFixed(0)} W/m²`, `${(R.efficiency * R.ideal).toFixed(0)} emitted − ${R.qBack.toFixed(0)} absorbed`),
  ].join("");

  const drops = [state.d1, state.d2, state.d3];
  const nodes = [["GPU junction", state.junctionC], ["Cold plate", state.junctionC - drops[0]],
    ["Coolant", state.junctionC - drops[0] - drops[1]], ["Radiator tube", R.tubeC], ["Sheet, midway", R.midC]];
  const arrows = [`−${drops[0]} °C`, `−${drops[1]} °C`, `−${drops[2]} °C`, "spreads", `${(LOAD_W / 1000).toFixed(0)} kW as IR`];
  document.getElementById("chain").innerHTML = nodes.map(([name, c], i) =>
    `<div class="node" style="background:${rgb(c)};color:${textOn(c)}"><b>${c.toFixed(0)} °C</b><span>${name}</span></div><div class="arrow"><em>${arrows[i]}</em></div>`,
  ).join("") + `<div class="node space"><b>3 K</b><span>Deep space</span></div>`;

  drawFace();

  // 4. Profile across one tube spacing
  const n = 121, pitch = state.pitchMm;
  const xs = Array.from({ length: n }, (_, i) => (i / (n - 1)) * pitch);
  const T = xs.map((x) => tempAt(Math.min(x, pitch - x) / 1000));
  plot(document.getElementById("profile"), {
    xs, xLabel: "Across the sheet, mm (tube at each end)", yLabel: "°C", xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0),
    yMin: Math.floor(Math.min(...T) / 10) * 10 - 5, yMax: R.tubeC + 8,
    series: [
      { y: xs.map(() => R.tubeC), color: "#a497bd", dash: [5, 4], width: 1.5, label: "if it were all at tube temperature" },
      { y: T, color: "#f2a33c", fillTo: xs.map(() => R.tubeC), fill: "rgba(234,77,155,0.18)" },
    ],
  });

  // 5. Area vs junction temperature
  const js = Array.from({ length: 61 }, (_, i) => 60 + i);
  const areas = js.map((j) => radiator(inputs({ ...state, junctionC: j })).area);
  const ideal = js.map((j) => {
    const r = radiator(inputs({ ...state, junctionC: j }));
    const q = r.ideal - r.qBack;
    return q > 0 ? LOAD_W / q : NaN;
  });
  plot(document.getElementById("sweep"), {
    xs: js, xLabel: "GPU junction temperature, °C", yLabel: "Radiating area, m²", xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0),
    yMin: 0, yMax: Math.min(1500, Math.max(...areas.filter(Number.isFinite)) * 1.05),
    marker: { x: state.junctionC, y: R.area },
    series: [
      { y: ideal, color: "#a497bd", dash: [5, 4], width: 1.5, label: "perfect sheet (100% fin)" },
      { y: areas, color: "#ea4d9b", label: "this panel" },
    ],
  });
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  drawSection(dt);
  requestAnimationFrame(loop);
}

buildControls();
update();
addEventListener("resize", update);
requestAnimationFrame(loop);
