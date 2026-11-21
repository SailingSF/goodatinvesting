// Browser port of montecarlo.py from the anthropic_ipo research repo (06 forecast + 08 valuation).
// Money in $ millions, per-share values in dollars, rates as decimals.

const DATA = {
  // log q/q growth of the revenue run-rate, and the run-rate each quarter started from (Q2-2025..Q3-2026)
  growth: [0.7386391050275085, 0.5630587559102125, 0.38941808251064636, 0.7793113850747986, 0.8929816470773329, 0.3835035097640471],
  start: [1504.0, 3148.0, 5528.0, 8160.0, 17788.56, 43446.8],
  runNow: 63754.56,              // clean Q3-2026 run-rate, ~$64B a year
  cash: 131845.0,                // cash + short-term investments, Sep 30 2026
  strikes: 5163.33813,           // option exercise proceeds
  shares: 16377504962,           // fully diluted
  commit: { 2026: 11231.0, 2027: 83009.26, 2028: 107597.42, 2029: 131716.03, 2030: 128180.25, 2031: 107895.81,
            2032: 103895.81, 2033: 103895.81, 2034: 103895.81, 2035: 103895.81, 2036: 45120.0, 2037: 22560.0 },
  sbcCatchup: 8200.0,            // stock-comp charge the day of the IPO
  sbcBacklog: 25900.0,           // already-granted stock comp, spread over 2027-29
  knowledgeWork: 40e6,           // $40T of knowledge-work wages (S-1)
  ceilingGrowth: 0.07,
  riskFree: 0.0494,
  erp: 0.0441,
  cashYield: 0.04,
  ipoPrice: 83,
};

const DEFAULTS = {
  aiShareLo: 0.015, aiShareHi: 0.08,        // AI's share of knowledge-work wages (log-uniform)
  anthShareLo: 0.30, anthShareHi: 0.55,     // Anthropic's share of AI spending
  rpcLo: 1.5, rpcHi: 2.5,                   // revenue per $1 of compute
  opexNow: 0.25, opexEnd: 0.25,             // cash opex to 2030, and by 2040
  sbcPct: 0.04, donationsPct: 0.03, capexPct: 0.04, taxRate: 0.21,
  beta: 1.25, terminalGrowth: 0.03,
  prizeChance: 0, prizeValue: 10e6,         // $10T breakthrough, off by default
};

const N_WORLDS = 20000;
const YEARS = Array.from({ length: 15 }, (_, k) => (k === 0 ? 'Q4-2026' : String(2026 + k)));   // Q4-2026, 2027..2040
const N_Q = 57;                                                                                   // Q4-2026 .. Q4-2040

// Fixed random numbers, drawn once: every setting reuses them, so sliders move the answer smoothly.
function makeDraws(n = N_WORLDS, seed = 6) {
  let s = seed >>> 0;
  const rand = () => {                      // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const d = { aiU: new Float64Array(n), anthU: new Float64Array(n), rpcU: new Float64Array(n),
              z: new Float64Array(n), prizeU: new Float64Array(n) };
  for (let i = 0; i < n; i++) {
    d.aiU[i] = rand(); d.anthU[i] = rand(); d.rpcU[i] = rand();
    d.z[i] = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
    d.prizeU[i] = rand();
  }
  return d;
}

// Least-squares Gompertz speed through the origin, and its standard error, for one ceiling.
function fitSpeed(ceiling) {
  let sgg = 0, sgy = 0;
  const gaps = DATA.start.map((s) => Math.log(ceiling / s));
  gaps.forEach((g, j) => { sgg += g * g; sgy += g * DATA.growth[j]; });
  const speed = sgy / sgg;
  let rss = 0;
  gaps.forEach((g, j) => { rss += (DATA.growth[j] - speed * g) ** 2; });
  return [speed, Math.sqrt(rss / (gaps.length - 1) / sgg)];
}

function simulate(p, d) {
  const n = d.aiU.length;
  const r = DATA.riskFree + p.beta * DATA.erp;
  const g = p.terminalGrowth;
  const K = YEARS.length;
  const commit = YEARS.map((_, k) => DATA.commit[2026 + k] || 0);
  const sbcEx = YEARS.map((_, k) => (k === 0 ? DATA.sbcCatchup : k <= 3 ? DATA.sbcBacklog / 3 : 0));
  const opex = YEARS.map((_, k) => (k <= 4 ? p.opexNow : p.opexNow + (p.opexEnd - p.opexNow) * (k - 4) / 10));
  const t = YEARS.map((_, k) => (k === 0 ? 0.125 : k - 0.25));
  const disc = t.map((x) => (1 + r) ** -x);
  const cGrow = Array.from({ length: N_Q + 1 }, (_, q) => (1 + DATA.ceilingGrowth) ** (q / 4));
  const yearOf = Array.from({ length: N_Q + 1 }, (_, q) => (q <= 1 ? 0 : 1 + Math.floor((q - 2) / 4)));
  const [lnAiLo, lnAiHi] = [Math.log(p.aiShareLo), Math.log(p.aiShareHi)];

  const perShare = new Float64Array(n), rev2030 = new Float64Array(n), ceilings = new Float64Array(n);
  let outOfCash = 0;
  const rev = new Float64Array(K);
  for (let i = 0; i < n; i++) {
    const ai = Math.exp(lnAiLo + (lnAiHi - lnAiLo) * d.aiU[i]);
    const anth = p.anthShareLo + (p.anthShareHi - p.anthShareLo) * d.anthU[i];
    const rpc = p.rpcLo + (p.rpcHi - p.rpcLo) * d.rpcU[i];
    // ponytail: the Python model requires ceiling > today's run-rate; we floor it there instead of rejecting the world
    const ceiling = Math.max(DATA.knowledgeWork * ai * anth, DATA.runNow * 1.001);
    const [sp, se] = fitSpeed(ceiling);
    const speed = Math.min(0.9, Math.max(0.02, sp + se * d.z[i]));

    rev.fill(0);
    let rr = DATA.runNow;
    for (let q = 1; q <= N_Q; q++) {
      rr *= Math.exp(speed * Math.log(ceiling * cGrow[q] / rr));
      rev[yearOf[q]] += rr / 4;
    }

    let cash = DATA.cash, minCash = Infinity, pv = 0, cf = 0;
    for (let k = 0; k < K; k++) {
      const compute = Math.max(rev[k] / rpc, commit[k]);              // take-or-pay floor
      const sbc = sbcEx[k] + p.sbcPct * rev[k];
      const don = p.donationsPct * rev[k];
      const oi = rev[k] * (1 - opex[k]) - compute - sbc - don;
      const fcf = oi - p.taxRate * Math.max(oi, 0) - p.capexPct * rev[k];
      cash += fcf + sbc + don + cash * DATA.cashYield * (k === 0 ? 0.25 : 1);
      minCash = Math.min(minCash, cash);
      cf = fcf + sbcEx[k];
      pv += cf * disc[k];
    }
    const terminal = cf * (1 + g) / (r - g) * disc[K - 1];
    const prize = d.prizeU[i] < p.prizeChance ? p.prizeValue : 0;
    const equity = Math.max(0, pv + terminal + DATA.cash + DATA.strikes + prize);
    perShare[i] = equity * 1e6 / DATA.shares;
    rev2030[i] = rev[4];
    ceilings[i] = ceiling;
    if (minCash < 0) outOfCash++;
  }
  return { perShare, rev2030, ceilings, discountRate: r, outOfCash: outOfCash / n };
}

function quantile(arr, q) {
  const s = Float64Array.from(arr).sort();
  const pos = (s.length - 1) * q, lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
}

if (typeof module !== 'undefined') module.exports = { DATA, DEFAULTS, YEARS, makeDraws, simulate, quantile };
