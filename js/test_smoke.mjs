/**
 * Smoke test – generates synthetic OHLCV data and runs the full prediction
 * pipeline to verify that all three modules load and produce valid output.
 *
 * Run:  node --experimental-vm-modules js/test_smoke.mjs
 *        (or simply:  node js/test_smoke.mjs   on Node ≥ 18)
 */

import { SMA, EMA, RSI, MACD, BollingerBands, Stochastic, ADX, ATR, analyzeIndicators } from './indicators.js';
import { detectAllPatterns, detectSupportResistance } from './patterns.js';
import { predict } from './predictor.js';

// ── Generate 250 synthetic daily bars ───────────────────────────────────────
function generateData(n = 250) {
  const bars = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const change = (Math.random() - 0.48) * 2;   // slight upward bias
    price = Math.max(10, price + change);
    const open = price - Math.random();
    const high = price + Math.random() * 1.5;
    const low = price - Math.random() * 1.5;
    const close = price;
    const volume = Math.floor(1e6 + Math.random() * 5e5);
    bars.push({ time: `2025-${String(Math.floor(i / 22) + 1).padStart(2, '0')}-${String((i % 22) + 1).padStart(2, '0')}`, open, high, low, close, volume });
  }
  return bars;
}

const data = generateData(250);
let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✅  ${label}`);
    pass++;
  } else {
    console.error(`  ❌  ${label}`);
    fail++;
  }
}

console.log('\n══════════════════════════════════════════════════');
console.log(' Stock Market Analyzer – Smoke Test');
console.log('══════════════════════════════════════════════════\n');

// ── indicators.js ───────────────────────────────────────────────────────────
console.log('▸ indicators.js');
assert('SMA(20) returns values', SMA(data, 20).values.length > 0);
assert('SMA(200) returns values', SMA(data, 200).values.length > 0);
assert('EMA(12) returns values', EMA(data, 12).values.length > 0);
assert('RSI returns values 0–100', (() => {
  const r = RSI(data);
  return r.values.length > 0 && r.values.every(v => v.value >= 0 && v.value <= 100);
})());
assert('MACD returns macd/signal/histogram', (() => {
  const m = MACD(data);
  const last = m.values[m.values.length - 1];
  return last && 'macd' in last && 'signal' in last && 'histogram' in last;
})());
assert('BollingerBands upper > lower', (() => {
  const b = BollingerBands(data);
  return b.values.length > 0 && b.values.every(v => v.upper >= v.lower);
})());
assert('Stochastic returns k and d', Stochastic(data).values.length > 0);
assert('ADX returns adx/plusDI/minusDI', (() => {
  const a = ADX(data);
  const last = a.values[a.values.length - 1];
  return last && 'adx' in last && 'plusDI' in last && 'minusDI' in last;
})());
assert('ATR returns values', ATR(data).values.length > 0);
assert('analyzeIndicators returns overallSignal', (() => {
  const a = analyzeIndicators(data);
  return ['bullish', 'bearish', 'neutral'].includes(a.overallSignal);
})());

// ── Edge-case: insufficient data ────────────────────────────────────────────
assert('SMA(200) on 10 bars returns error', SMA(data.slice(0, 10), 200).error !== undefined);

// ── patterns.js ─────────────────────────────────────────────────────────────
console.log('\n▸ patterns.js');
assert('detectAllPatterns returns array', Array.isArray(detectAllPatterns(data)));
assert('detectSupportResistance returns array', Array.isArray(detectSupportResistance(data)));

// ── predictor.js ────────────────────────────────────────────────────────────
console.log('\n▸ predictor.js');
const prediction = predict(data);
assert('predict returns direction', ['bullish', 'bearish', 'neutral'].includes(prediction.direction));
assert('predict confidence in [0, 1]', prediction.confidence >= 0 && prediction.confidence <= 1);
assert('predict has 5 signals', prediction.signals.length === 5);
assert('predict has trendAnalysis', 'shortTerm' in prediction.trendAnalysis && 'longTerm' in prediction.trendAnalysis);
assert('predict summary is a string', typeof prediction.summary === 'string' && prediction.summary.length > 10);

// ── Edge-case: tiny dataset ─────────────────────────────────────────────────
assert('predict on 5 bars returns neutral', predict(data.slice(0, 5)).direction === 'neutral');

console.log(`\n──────────────────────────────────────────────────`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`──────────────────────────────────────────────────\n`);

if (fail > 0) process.exit(1);
