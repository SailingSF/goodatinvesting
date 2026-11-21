const pct = (v, dp = 0) => `${(v * 100).toFixed(dp)}%`;
const usd = (v) => `$${v.toFixed(v < 10 ? 2 : 0)}`;
const bigUsd = (m) => (m >= 1e6 ? `$${(m / 1e6).toFixed(2)}T` : `$${Math.round(m / 1e3)}B`);   // m in $M

// key or [lo, hi] keys, label, help, min, max, step, format
const GROUPS = [
  { title: 'The three dice', sub: 'these move the answer most', open: true, ctls: [
    { keys: ['aiShareLo', 'aiShareHi'], label: "AI's share of knowledge-work pay",
      help: "The world pays knowledge workers ~$40T a year. How much of that ends up spent on AI? Cloud computing took 20 years to reach ~5%.",
      min: 0.01, max: 0.15, step: 0.005, fmt: (v) => pct(v, 1) },
    { keys: ['anthShareLo', 'anthShareHi'], label: "Anthropic's share of AI spending",
      help: 'Of all money spent on AI, how much goes to Anthropic rather than OpenAI, Google and the rest?',
      min: 0.1, max: 0.8, step: 0.01, fmt: (v) => pct(v) },
    { keys: ['rpcLo', 'rpcHi'], label: 'Revenue per $1 of compute',
      help: 'How efficiently Anthropic turns chips into sales. Q3-2026 was $1.72, Q2 was $2.08. Cheaper chips push it up, price cuts push it down.',
      min: 1.0, max: 4.0, step: 0.05, fmt: (v) => `$${v.toFixed(2)}` },
  ] },
  { title: 'Other costs', sub: 'as a share of revenue, every year', ctls: [
    { keys: ['opexNow'], label: 'Running costs through 2030', help: 'Salaries, sales, offices, partner fees paid in cash. Q3-2026 was ~28%.', min: 0.1, max: 0.4, step: 0.01, fmt: pct },
    { keys: ['opexEnd'], label: 'Running costs by 2040', help: 'Big companies get cheaper to run as they grow. Mature software firms run lower than 25%.', min: 0.05, max: 0.4, step: 0.01, fmt: pct },
    { keys: ['sbcPct'], label: 'New stock pay to employees', help: 'Paying people in shares shrinks your slice. Grants already made are counted in the share count.', min: 0, max: 0.1, step: 0.005, fmt: (v) => pct(v, 1) },
    { keys: ['donationsPct'], label: 'Charitable donations', help: 'Anthropic gives stock to charity. 9M-2026 was 6%.', min: 0, max: 0.1, step: 0.005, fmt: (v) => pct(v, 1) },
    { keys: ['capexPct'], label: 'Equipment it buys and owns', help: 'Most compute is rented (already counted above). 9M-2026 was 8.7%.', min: 0, max: 0.1, step: 0.005, fmt: (v) => pct(v, 1) },
    { keys: ['taxRate'], label: 'Tax rate on profits', help: 'US federal rate is 21%.', min: 0, max: 0.35, step: 0.01, fmt: pct },
  ] },
  { title: 'How much is future cash worth today?', sub: 'the discount rate', ctls: [
    { keys: ['beta'], label: 'Riskiness vs the stock market (beta)', help: '1 = as risky as the average stock. Listed software companies average 1.25. Higher = future cash is worth less today.', min: 0.5, max: 2.5, step: 0.05, fmt: (v) => v.toFixed(2) },
    { keys: ['terminalGrowth'], label: 'Growth forever after 2040', help: 'Nothing outgrows the economy forever. Keep it low.', min: 0, max: 0.05, step: 0.0025, fmt: (v) => pct(v, 1) },
  ] },
  { title: 'The moonshot', sub: 'off by default', ctls: [
    { keys: ['prizeChance'], label: 'Chance of a huge breakthrough', help: 'AGI, a cancer cure, a new material: something worth far more than selling AI to office workers. $83 implies about 2%.', min: 0, max: 0.3, step: 0.005, fmt: (v) => pct(v, 1) },
    { keys: ['prizeValue'], label: "What it's worth to shareholders", help: "In today's money.", min: 1e6, max: 20e6, step: 0.5e6, fmt: bigUsd },
  ] },
];

const PRESETS = {
  'My forecast': {},
  'Smaller slice (15–35%)': { anthShareLo: 0.15, anthShareHi: 0.35 },
  'Stuck at Q3 efficiency': { rpcLo: 1.6, rpcHi: 1.8 },
  'Lean & efficient': { rpcLo: 1.8, rpcHi: 3.0, opexEnd: 0.15 },
  'Moonshot (5%)': { prizeChance: 0.05 },
};

const state = { ...DEFAULTS };
const inputs = {};       // key -> range input
const valueEls = [];     // [el, ctl]

// --- build controls -------------------------------------------------------------------------------------------
const groupsEl = document.getElementById('groups');
for (const g of GROUPS) {
  const det = document.createElement('details');
  det.open = !!g.open;
  det.innerHTML = `<summary>${g.title}<small>${g.sub}</small></summary>`;
  for (const c of g.ctls) {
    const div = document.createElement('div');
    div.className = 'ctl';
    div.innerHTML = `<div class="top"><span>${c.label}</span><span class="val"></span></div><p>${c.help}</p>`;
    const holder = c.keys.length === 2 ? Object.assign(document.createElement('div'), { className: 'pair' }) : div;
    c.keys.forEach((k, i) => {
      const inp = Object.assign(document.createElement('input'), { type: 'range', min: c.min, max: c.max, step: c.step });
      inp.setAttribute('aria-label', c.keys.length === 2 ? `${c.label}, ${i ? 'high' : 'low'} end` : c.label);
      inp.addEventListener('input', () => { state[k] = +inp.value; keepOrdered(c.keys, k); clearPreset(); schedule(); });
      inputs[k] = inp;
      if (c.keys.length === 2) holder.append(i ? 'high' : 'low', inp);
      else holder.append(inp);
    });
    if (holder !== div) div.append(holder);
    valueEls.push([div.querySelector('.val'), c]);
    det.append(div);
  }
  if (g.title === 'The three dice') det.append(Object.assign(document.createElement('div'), { className: 'note', id: 'ceiling-note' }));
  groupsEl.append(det);
}

// Dragging "low" past "high" drags "high" along (and vice versa)
function keepOrdered(keys, moved) {
  if (keys.length !== 2) return;
  const [lo, hi] = keys;
  if (state[lo] > state[hi]) {
    const other = moved === lo ? hi : lo;
    state[other] = state[moved];
    inputs[other].value = state[moved];
  }
}

const presetsEl = document.getElementById('presets');
for (const name of Object.keys(PRESETS)) {
  const b = Object.assign(document.createElement('button'), { type: 'button', textContent: name });
  b.addEventListener('click', () => {
    Object.assign(state, DEFAULTS, PRESETS[name]);
    syncInputs();
    clearPreset();
    b.classList.add('on');
    schedule();
  });
  presetsEl.append(b);
}
const clearPreset = () => presetsEl.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
function syncInputs() { for (const k in inputs) inputs[k].value = state[k]; }

// --- simulate + render ----------------------------------------------------------------------------------------
const draws = makeDraws();
const defaultRun = simulate(DEFAULTS, draws);
const BINS = 40;
let MAX = 200;   // x-axis stretches so ~95% of worlds fit on the chart
const histOf = (arr) => {
  const h = new Array(BINS).fill(0);
  for (const v of arr) h[Math.min(BINS - 1, Math.floor(v / (MAX / BINS)))]++;
  return h;
};
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

let pending = false;
function schedule() { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; update(); }); } }

function update() {
  for (const [el, c] of valueEls) el.textContent = c.keys.map((k) => c.fmt(state[k])).join(' – ');

  const res = simulate(state, draws);
  const ps = res.perShare, n = ps.length;
  const avg = mean(ps), med = quantile(ps, 0.5);
  const above = ps.filter((v) => v >= DATA.ipoPrice).length / n;
  const zero = ps.filter((v) => v === 0).length / n;
  MAX = Math.max(200, Math.ceil(quantile(ps, 0.95) / 100) * 100);

  document.getElementById('t-mean').textContent = usd(avg);
  document.getElementById('t-median').textContent = usd(med);
  document.getElementById('t-above').textContent = pct(above);
  document.getElementById('t-zero').textContent = pct(zero);

  const ratio = DATA.ipoPrice / avg;
  document.getElementById('verdict').innerHTML = avg >= DATA.ipoPrice
    ? `On your inputs, <strong>$83 looks cheap</strong>: the average world is worth ${usd(avg)}, ${(avg / DATA.ipoPrice).toFixed(1)}× the IPO price.`
    : avg < 0.5 ? `On your inputs, <strong>Anthropic is worth nothing</strong> in almost every world.`
    : `On your inputs, <strong>$83 is ${ratio.toFixed(1)}× what a share is worth</strong> on average (${usd(avg)}).`;

  const cLo = quantile(res.ceilings, 0.05), cHi = quantile(res.ceilings, 0.95);
  document.getElementById('ceiling-note').innerHTML =
    `Together these set how big Anthropic can get: a revenue ceiling of <strong>${bigUsd(cLo)}–${bigUsd(cHi)}</strong> a year ` +
    `in today's money (today it makes ~$64B).`;

  document.getElementById('explain').innerHTML = [
    `Each bar counts how many of the 20,000 simulated futures landed at that value per share. The last bar collects everything above $${MAX}.`,
    `Median revenue in 2030: <strong>${bigUsd(quantile(res.rev2030, 0.5))}</strong> a year.`,
    `Discount rate: <strong>${pct(res.discountRate, 1)}</strong> a year (the return you'd demand for owning something this risky).`,
    `At the average, the whole company is worth <strong>${bigUsd(avg * DATA.shares / 1e6)}</strong> (on 16.4B fully diluted shares).`,
    zero > 0.005 ? `Worlds worth $0 are the inefficient ones: once revenue outgrows the signed compute contracts, each extra dollar of sales loses money.` : '',
    res.outOfCash > 0.001 ? `${pct(res.outOfCash, 1)} of worlds run out of cash at some point before 2040.` : '',
  ].filter(Boolean).map((s) => `<li>${s}</li>`).join('');

  drawHist(histOf(ps), histOf(defaultRun.perShare), avg);
}

function drawHist(h, defaultHist, avg) {
  const cv = document.getElementById('hist');
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const pad = { l: 8, r: 8, t: 22, b: 26 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const top = Math.max(...h, ...defaultHist) * 1.05;
  const x = (v) => pad.l + (Math.min(v, MAX) / MAX) * pw;
  const y = (c) => pad.t + ph - (c / top) * ph;
  const bw = pw / h.length;

  ctx.fillStyle = '#6b56db99';
  h.forEach((c, i) => ctx.fillRect(pad.l + i * bw + 1, y(c), bw - 2, pad.t + ph - y(c)));

  ctx.strokeStyle = '#9b90b0'; ctx.lineWidth = 2; ctx.beginPath();
  defaultHist.forEach((c, i) => { const x0 = pad.l + i * bw; i ? ctx.lineTo(x0, y(c)) : ctx.moveTo(x0, y(c)); ctx.lineTo(x0 + bw, y(c)); });
  ctx.stroke();

  ctx.strokeStyle = '#e2d5ee'; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(pad.l, pad.t + ph + .5); ctx.lineTo(pad.l + pw, pad.t + ph + .5); ctx.stroke();
  ctx.fillStyle = '#62557d'; ctx.font = '12px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'center';
  for (let v = 0; v <= MAX; v += MAX / 4) ctx.fillText(v === MAX ? `$${v}+` : `$${v}`, Math.min(Math.max(x(v), pad.l + 14), pad.l + pw - 18), H - 6);

  const vline = (v, color, dash, label, align) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.beginPath();
    ctx.moveTo(x(v), pad.t); ctx.lineTo(x(v), pad.t + ph); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = color; ctx.font = '600 12px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = align;
    const lx = x(v) + (align === 'left' ? 4 : -4);
    ctx.textAlign = 'left';
    ctx.fillText(label, Math.min(Math.max(align === 'left' ? lx : lx - ctx.measureText(label).width, pad.l), W - pad.r - ctx.measureText(label).width), pad.t - 8);
  };
  const avgLeft = avg < DATA.ipoPrice;
  vline(DATA.ipoPrice, '#c8602c', [], 'IPO $83', avgLeft ? 'left' : 'right');
  vline(avg, '#24193a', [5, 4], `Your avg ${usd(avg)}`, avgLeft ? 'right' : 'left');
}

window.addEventListener('resize', schedule);
syncInputs();
presetsEl.querySelector('button').classList.add('on');
update();
