// node labs/anthropic-ipo/model.test.js — checks the port against montecarlo.py's published numbers.
// Draws differ from numpy's, so allow sampling noise.
const assert = require('assert');
const { DEFAULTS, makeDraws, simulate, quantile } = require('./model.js');

const d = makeDraws();
const stats = (p) => {
  const { perShare } = simulate({ ...DEFAULTS, ...p }, d);
  const mean = perShare.reduce((a, b) => a + b, 0) / perShare.length;
  return { mean, median: quantile(perShare, 0.5), above: perShare.filter((v) => v >= 83).length / perShare.length };
};
const near = (a, b, tol, what) => assert(Math.abs(a - b) <= tol, `${what}: got ${a.toFixed(3)}, want ${b} ± ${tol}`);

const base = stats({});
console.log('defaults', base);
near(base.mean, 69.47, 1.5, 'mean');
near(base.median, 59.10, 1.5, 'median');
near(base.above, 0.326, 0.015, 'share >= $83');

const small = stats({ anthShareLo: 0.15, anthShareHi: 0.35 });
console.log('15-35%', small);
near(small.mean, 43.92, 1.5, 'mean at 15-35%');

const bull = stats({ rpcLo: 1.8, rpcHi: 3.0, opexEnd: 0.15, beta: 1.5 });
console.log('bull', bull);
near(bull.mean, 124.57, 2.5, 'mean, bull');
console.log('ok');
