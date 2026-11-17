import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const R_EARTH = 6371000;
const ALT = 550000;
const TEX = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/textures/planets/";
const SUN_DIR = new THREE.Vector3(0.12, 0.3, 1).normalize();   // dawn-dusk orbit: the Sun is along +Z

const PARTS = {
  compute_module: ["Compute module", "120 kW of GPUs, about one NVIDIA NVL72 rack, repackaged as trays laid flat."],
  deck: ["Deck", "Carbon-fiber square tubes and four corner posts. The posts carry the stack above them at 6 g during launch. The tubes under the compute trays are too light: about 4× their allowable stress."],
  frame: ["Frame", "Carbon-fiber longerons and cross-members, sized against buckling under the stack at launch."],
  power_conditioning: ["Power conditioning", "Turns ~140 kW of array power into what the GPUs need, at an optimistic 1.5 kW/kg."],
  propellant_tank: ["Propellant tank", "Tank plus the krypton/xenon that fights drag at solar maximum for 5 years."],
  reaction_wheels: ["Reaction wheels", "Four wheels, ~50 N·m·s each. Gravity tries to stand the 80 m satellite on end, and holding it within 1° fills them in about two orbits."],
  avionics: ["Avionics", "Flight computer, radios and sensors."],
  laser_terminals: ["Laser terminals", "Three optical links to the rest of the fleet."],
  ep_thrusters: ["Electric thrusters", "Two Hall thrusters (Isp 1,500 s) for drag make-up, orbit raising and deorbit."],
  array_drives: ["Array drives", "Roll each wing about the direction of travel to follow the Sun."],
  stack_interfaces: ["Stack interfaces", "Fittings that lock each satellite to the ones above and below at launch, then let go."],
  wing_deployed: ["Solar wing", "One of two roll-out wings: 139 kW between them at beginning of life, sized to still carry the full load after 5 years of wear."],
  wing_stowed: ["Solar wing, stowed", "The wing packed for launch. In the flat-pack its thickness sets the height of every layer in the stack."],
  radiator_panel: ["Radiator panel", "Aluminum honeycomb, 25 mm thick, with ammonia tubes every 150 mm. Radiates from both faces at about 80% fin efficiency."],
};

// ---------------------------------------------------------------- renderer, camera, space
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 3e8);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 2;
controls.maxDistance = 400;

const sun = new THREE.DirectionalLight(0xfff3e2, 3.4);
sun.position.copy(SUN_DIR).multiplyScalar(100);
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0x0a0f22, 0x2d5f9a, 0.55));   // earthshine from below
scene.add(new THREE.AmbientLight(0x404058, 0.25));
const fill = new THREE.DirectionalLight(0xb8c8ff, 0.7);   // soft fill so the edge-on radiator faces read
fill.position.set(-60, 25, -20);
scene.add(fill);

function stars() {
  const n = 7000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(8e7);
    pos.set([v.x, v.y, v.z], i * 3);
    const b = 0.35 + Math.random() ** 3 * 0.65;
    col.set([b, b, b * (0.9 + Math.random() * 0.2)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true }));
}
scene.add(stars());

function earth() {
  const group = new THREE.Group();
  group.position.set(0, -(R_EARTH + ALT), 0);
  group.rotation.set(0.4, 2.2, 0.15);
  const loader = new THREE.TextureLoader();
  const load = (file, mat, key) => loader.load(TEX + file, (t) => {
    t.colorSpace = key === "map" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    mat[key] = t; mat.color.set(0xffffff); mat.needsUpdate = true;
  });
  const ground = new THREE.MeshStandardMaterial({ color: 0x1d4f8c, roughness: 0.85, metalness: 0 });
  load("earth_atmos_2048.jpg", ground, "map");
  group.add(new THREE.Mesh(new THREE.SphereGeometry(R_EARTH, 192, 128), ground));
  const clouds = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  clouds.alphaMap = null;
  loader.load(TEX + "earth_clouds_1024.png", (t) => { clouds.map = t; clouds.alphaMap = t; clouds.needsUpdate = true; });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(R_EARTH + 12000, 192, 128), clouds));
  // Atmosphere: a thin additive shell, brightest at the limb and on the sunlit side
  const atmo = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        vW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <logdepthbuf_pars_fragment>
      uniform vec3 sunDir; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        #include <logdepthbuf_fragment>
        float rim = pow(1.0 - abs(dot(vN, vV)), 3.0);
        float lit = smoothstep(-0.25, 0.4, dot(vW, sunDir));
        gl_FragColor = vec4(vec3(0.32, 0.6, 1.0) * rim * (0.15 + 1.4 * lit), 1.0);
      }`,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(R_EARTH + 90000, 192, 128), atmo));
  return group;
}
scene.add(earth());

// ---------------------------------------------------------------- materials
function canvasTexture(size, draw, repeat) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) t.repeat.set(...repeat);
  return t;
}
const cellTexture = canvasTexture(256, (g, s) => {    // 2 × 2 solar cells per 0.66 m tile
  g.fillStyle = "#c8ccd6"; g.fillRect(0, 0, s, s);
  const h = s / 2;
  for (const [x, y] of [[0, 0], [h, 0], [0, h], [h, h]]) {
    const grad = g.createLinearGradient(x, y, x + h, y + h);
    grad.addColorStop(0, "#1b2a5c"); grad.addColorStop(1, "#0d1638");
    g.fillStyle = grad;
    g.fillRect(x + 3, y + 3, h - 6, h - 6);
    g.strokeStyle = "rgba(170,180,210,0.35)"; g.lineWidth = 1;
    for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(x + 3, y + (k * h) / 6); g.lineTo(x + h - 3, y + (k * h) / 6); g.stroke(); }
  }
});
const tubeTexture = canvasTexture(64, (g, s) => {     // ammonia tubes show faintly through the white paint
  g.fillStyle = "#f4f4f0"; g.fillRect(0, 0, s, s);
  g.fillStyle = "#d9dbd8"; g.fillRect(0, s / 2 - 3, s, 6);
}, [1, 30]);

const MATS = {
  "0.25,0.25,0.28": new THREE.MeshStandardMaterial({ color: 0x45454f, metalness: 0.6, roughness: 0.45 }),
  "0.15,0.15,0.15": new THREE.MeshStandardMaterial({ color: 0x1e1e22, metalness: 0.35, roughness: 0.5 }),
  "0.75,0.62,0.25": new THREE.MeshStandardMaterial({ color: 0xd4a842, metalness: 0.85, roughness: 0.32, emissive: 0x2a1c00 }),
  "0.92,0.92,0.9": new THREE.MeshStandardMaterial({ map: tubeTexture, metalness: 0, roughness: 0.65 }),
  "0.1,0.2,0.55": new THREE.MeshStandardMaterial({ color: 0x23252e, metalness: 0.4, roughness: 0.45 }),
};
const stowedWingMat = new THREE.MeshStandardMaterial({ color: 0x1a2550, metalness: 0.3, roughness: 0.5 });
const cellMat = (len, width) => {
  const t = cellTexture.clone();
  t.repeat.set(len / 0.66, width / 0.66);
  t.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: t, metalness: 0.15, roughness: 0.3, side: THREE.DoubleSide });
};

// ---------------------------------------------------------------- building parts
function shapeMesh(s, mat) {
  let geo;
  if (s.type === "Box") geo = new THREE.BoxGeometry(...s.size);
  else {
    const across = s.type === "Cylinder" ? null : s.outer;
    const along = { x: [s.length, across, across], y: [across, s.length, across], z: [across, across, s.length] }[s.axis];
    if (s.type === "SquareTube") geo = new THREE.BoxGeometry(...along);
    else {
      geo = new THREE.CylinderGeometry(s.radius, s.radius, s.length, 40);
      if (s.axis === "x") geo.rotateZ(Math.PI / 2);
      if (s.axis === "z") geo.rotateX(Math.PI / 2);
    }
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...s.center);
  return mesh;
}

function buildPart(name, spec) {
  const g = new THREE.Group();
  const base = MATS[spec.color.join(",")] ?? MATS["0.25,0.25,0.28"];
  for (const s of spec.shapes) {
    let mat = base;
    if (name === "wing_stowed") mat = stowedWingMat;
    if (name === "wing_deployed" && s.type === "Box" && Math.min(...s.size) < 0.01) {
      const cells = cellMat(s.size[0], s.size[1]);
      mat = [base, base, base, base, cells, cells];     // solar cells on the ±Z faces (toward and away from the Sun)
    }
    g.add(shapeMesh(s, mat));
  }
  g.userData.part = name;
  return g;
}

function place(obj, { position, rotation }) {
  const R = rotation ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  new THREE.Matrix4().set(R[0][0], R[0][1], R[0][2], position[0], R[1][0], R[1][1], R[1][2], position[1],
    R[2][0], R[2][1], R[2][2], position[2], 0, 0, 0, 1).decompose(obj.position, obj.quaternion, obj.scale);
  return obj;
}

/** One satellite that can fold between its deployed and stowed layouts. */
function buildSatellite(c) {
  const parts = Object.fromEntries(Object.entries(c.parts).map(([n, spec]) => [n, buildPart(n, spec)]));
  const root = new THREE.Group();
  const moving = new Set(["wing_deployed", "wing_stowed", "radiator_panel"]);
  for (const p of c.deployed) if (!moving.has(p.part)) root.add(place(parts[p.part].clone(), p));

  // Radiator panels slide and turn from their place in the fin to their place in the stack
  const dep = c.deployed.filter((p) => p.part === "radiator_panel");
  const stw = c.stowed.filter((p) => p.part === "radiator_panel");
  const panels = dep.map((p, i) => {
    const a = place(new THREE.Object3D(), p), b = place(new THREE.Object3D(), stw[i]);
    const obj = parts.radiator_panel.clone();
    root.add(obj);
    return { obj, a, b };
  });

  // Deployed wings retract toward their root fitting; the stowed wings grow in their place
  const rootX = Math.min(...c.parts.wing_deployed.shapes.map((s) => s.center[0] - (s.type === "Box" ? s.size[0] / 2 : s.radius ?? 0)));
  const wings = c.deployed.filter((p) => p.part === "wing_deployed").map((p) => {
    const holder = place(new THREE.Group(), p);
    const scaler = new THREE.Group();
    scaler.position.x = rootX;
    const w = parts.wing_deployed.clone();
    w.position.x = -rootX;
    scaler.add(w); holder.add(scaler); root.add(holder);
    return { holder, scaler };
  });
  const stowedWings = c.stowed.filter((p) => p.part === "wing_stowed").map((p) => {
    const obj = place(parts.wing_stowed.clone(), p);
    root.add(obj);
    return obj;
  });

  const ease = (t) => t * t * (3 - 2 * t);
  const clamp = (t) => Math.min(1, Math.max(0, t));
  function setFold(t) {
    const w = ease(clamp(t / 0.55));
    for (const { holder, scaler } of wings) { scaler.scale.x = 1 - 0.985 * w; holder.visible = w < 1; }
    const sw = ease(clamp((t - 0.45) / 0.2));
    for (const obj of stowedWings) { obj.visible = sw > 0; obj.scale.setScalar(Math.max(sw, 1e-3)); }
    const r = ease(clamp((t - 0.25) / 0.75));
    for (const { obj, a, b } of panels) {
      obj.position.lerpVectors(a.position, b.position, r);
      obj.quaternion.slerpQuaternions(a.quaternion, b.quaternion, r);
    }
  }
  setFold(0);
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  return { root, setFold, size, parts };
}

/** Starship's payload bay with every stowed satellite that fits. */
function buildStack(c, profile, template) {
  const group = new THREE.Group();
  const pts = profile.map(([h, r]) => new THREE.Vector2(r + 0.05, h));
  const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), new THREE.MeshStandardMaterial({
    color: 0xb9c3d6, metalness: 0.9, roughness: 0.25, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false,
  }));
  group.add(shell);
  const ringMat = new THREE.LineBasicMaterial({ color: 0x9fb0cc, transparent: true, opacity: 0.45 });
  for (const [h, r] of profile) {
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2) * (r + 0.05), h, Math.sin((i / 96) * Math.PI * 2) * (r + 0.05)))), ringMat);
    group.add(ring);
  }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4.05, 96), new THREE.MeshStandardMaterial({ color: 0x2b2f3a, metalness: 0.7, roughness: 0.5 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  group.add(floor);

  const { min, max, size } = c.stowed_box;
  const [cx, cy, cz] = min.map((m, i) => (m + max[i]) / 2);
  for (const { floor: y0, slots } of c.stack) {
    for (const [x, z, turned] of slots) {
      const s = template.clone();
      const center = turned ? [cz, cy, -cx] : [cx, cy, cz];
      s.position.set(x - center[0], y0 + size[1] / 2 - center[1], z - center[2]);
      if (turned) s.rotation.y = Math.PI / 2;
      group.add(s);
    }
  }
  return group;
}

// ---------------------------------------------------------------- app state
const state = { view: "deployed", concept: "flatpack", fold: 0, foldTarget: 0 };
let data, sats = {}, stacks = {}, highlight = null;
const info = document.getElementById("info");
const partInfo = document.getElementById("part-info");

const CAMERAS = {
  deployed: [[38, 16, 62], [0, 0, 0]],
  stowed: [[7, 5, 9], [0, 0, 0]],
  starship: [[26, 17, 30], [0, 10, 0]],
};

function setCamera(view) {
  const [pos, target] = CAMERAS[view];
  const k = view === "stowed" && state.concept === "tower" ? 1.4 : 1;
  camera.position.set(...pos.map((v) => v * k));
  controls.target.set(...target);
}

function render() {
  const c = data.concepts[state.concept];
  for (const [name, s] of Object.entries(sats)) s.root.visible = name === state.concept && state.view !== "starship";
  for (const [name, g] of Object.entries(stacks)) g.visible = name === state.concept && state.view === "starship";
  state.foldTarget = state.view === "deployed" ? 0 : 1;
  if (state.view === "starship") sats[state.concept].setFold((state.fold = 1));

  const s = sats[state.concept];
  const drawn = c.mass_as_drawn;
  const fmt = (v, d = 1) => v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
  const sb = c.stowed_box.size;
  const rows = {
    deployed: [["Span along travel", `${fmt(s.size.x)} m`], ["Span across fins", `${fmt(s.size.y)} m`],
      ["Radiator panels", c.geometry.radiator_panels], ["Mass as drawn", `${fmt(drawn, 0)} kg`],
      ["With 8% unmodeled", `≈ ${fmt(drawn / 0.92, 0)} kg`]],
    stowed: [["Stowed size", sb.map((v) => fmt(v, 2)).join(" × ") + " m"], ["Volume", `${fmt(sb[0] * sb[1] * sb[2])} m³`],
      ["Mass as drawn", `${fmt(drawn, 0)} kg`]],
    starship: [["Satellites per flight", c.per_flight], ["Layers", c.stack.length],
      ["Payload used", `${fmt((c.per_flight * drawn) / 0.92 / 1000, 0)} of 150 t`],
      ["Real launch price at $100/kg", `$${fmt((15e6 * 0.92) / (c.per_flight * drawn), 0)}/kg`]],
  }[state.view];
  const blurb = {
    deployed: "In orbit, flying edge-on through the air: solar wings out along the direction of travel, radiator fins up and down, edge-on to the Sun.",
    stowed: state.concept === "flatpack"
      ? "Folded into one 56 cm plate: compute trays and folded wings inside the deck frame, the radiator panels stacked flat on top."
      : "The first packing idea: the bus stands upright, wings rolled up beside it, radiator panels stacked against its sides.",
    starship: state.concept === "flatpack"
      ? "Plates stacked like pancakes. The plate is 5.7 m wide, so it only fits the full-width part of the bay; the tapered nose stays empty. Starship runs out of room long before it runs out of lift."
      : "Three towers to a layer and four layers: 11 satellites, using about a third of the lift Starship has.",
  }[state.view];
  info.innerHTML = `<p>${blurb}</p><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
  document.querySelectorAll("#view button").forEach((b) => b.classList.toggle("active", b.dataset.v === state.view));
  document.querySelectorAll("#concept button").forEach((b) => b.classList.toggle("active", b.dataset.c === state.concept));
  clearPick();
}

// ---------------------------------------------------------------- picking
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let down = null;
function clearPick() {
  if (highlight) scene.remove(highlight);
  highlight = null;
  partInfo.hidden = true;
}
function pick(ev) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const target = state.view === "starship" ? stacks[state.concept] : sats[state.concept].root;
  const hit = raycaster.intersectObject(target, true).find((h) => h.object.visible);
  clearPick();
  if (!hit) return;
  let obj = hit.object;
  while (obj && !obj.userData.part) obj = obj.parent;
  if (!obj) return;
  const name = obj.userData.part;
  const c = data.concepts[state.concept];
  const list = state.view === "deployed" ? c.deployed : c.stowed;
  const count = list.filter((p) => p.part === name).length;
  const mass = c.parts[name].mass;
  const [title, desc] = PARTS[name] ?? [name, ""];
  highlight = new THREE.BoxHelper(obj, 0xea4d9b);
  scene.add(highlight);
  partInfo.hidden = false;
  partInfo.innerHTML = `<h2>${title}</h2><p>${desc}</p><dl>
    <dt>Mass${count > 1 ? " (each)" : ""}</dt><dd>${mass.toLocaleString("en-US", { maximumFractionDigits: 1 })} kg</dd>
    ${count > 1 ? `<dt>Count</dt><dd>${count}</dd>` : ""}
    <dt>Share of satellite</dt><dd>${((mass * count * 100) / c.mass_as_drawn).toFixed(1)}%</dd></dl>`;
}
canvas.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
canvas.addEventListener("pointerup", (e) => {
  if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) pick(e);
  down = null;
});

// ---------------------------------------------------------------- loop
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state.fold !== state.foldTarget && state.view !== "starship") {
    const step = dt / 2.2;
    state.fold = state.foldTarget > state.fold ? Math.min(state.foldTarget, state.fold + step) : Math.max(state.foldTarget, state.fold - step);
    sats[state.concept].setFold(state.fold);
    if (highlight) highlight.update();
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

async function init() {
  data = await (await fetch("./satellite.json")).json();
  for (const [name, c] of Object.entries(data.concepts)) {
    sats[name] = buildSatellite(c);
    scene.add(sats[name].root);
    // A stowed satellite to copy into the bay: a second build, folded
    const folded = buildSatellite(c);
    folded.setFold(1);
    stacks[name] = buildStack(c, data.bay_profile, folded.root);
    scene.add(stacks[name]);
  }
  document.querySelectorAll("#view button").forEach((b) => b.addEventListener("click", () => {
    const from = state.view;
    state.view = b.dataset.v;
    if (from === "starship" && state.view === "stowed") state.fold = 1;
    if (from === "starship" && state.view === "deployed") { state.fold = 1; sats[state.concept].setFold(1); }
    setCamera(state.view);
    render();
  }));
  document.querySelectorAll("#concept button").forEach((b) => b.addEventListener("click", () => {
    state.concept = b.dataset.c;
    state.fold = state.view === "deployed" ? 0 : 1;
    sats[state.concept].setFold(state.fold);
    setCamera(state.view);
    render();
  }));
  resize();
  const start = location.hash.slice(1);
  if (CAMERAS[start]) { state.view = start; state.fold = start === "deployed" ? 0 : 1; sats.flatpack.setFold(state.fold); }
  setCamera(state.view);
  render();
  document.getElementById("loading").remove();
  requestAnimationFrame(loop);
}
init().catch((e) => { document.getElementById("loading").textContent = `Could not load the satellite: ${e.message}`; });
