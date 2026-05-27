/**
 * @module indicators
 * @description Pure technical indicator calculation functions for OHLCV data.
 * All functions accept arrays of OHLCV objects and return structured results
 * with both raw numerical values and signal interpretations.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Validates that input data is a non-empty array with enough bars for the
 * requested period. Returns a trimmed copy containing only valid (finite
 * close-price) bars.
 * @param {Array<{time,open,high,low,close,volume}>} data
 * @param {number} minLength - minimum number of bars required
 * @returns {{ok: boolean, cleaned: Array, error?: string}}
 */
function validateData(data, minLength = 1) {
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, cleaned: [], error: 'Data must be a non-empty array' };
  }
  const cleaned = data.filter(
    (d) => d && Number.isFinite(d.close) && Number.isFinite(d.high) && Number.isFinite(d.low)
  );
  if (cleaned.length < minLength) {
    return {
      ok: false,
      cleaned,
      error: `Insufficient data: need ${minLength} valid bars, got ${cleaned.length}`,
    };
  }
  return { ok: true, cleaned };
}

// ─── SMA ────────────────────────────────────────────────────────────────────

/**
 * Simple Moving Average.
 * @param {Array<{time,open,high,low,close,volume}>} data - OHLCV bars
 * @param {number} period - look-back window (typically 20, 50, or 200)
 * @returns {{values: Array<{time, value}>, error?: string}}
 */
export function SMA(data, period) {
  const { ok, cleaned, error } = validateData(data, period);
  if (!ok) return { values: [], error };

  const values = [];
  let runningSum = 0;

  for (let i = 0; i < cleaned.length; i++) {
    runningSum += cleaned[i].close;
    if (i >= period) {
      runningSum -= cleaned[i - period].close;
    }
    if (i >= period - 1) {
      values.push({
        time: cleaned[i].time,
        value: runningSum / period,
      });
    }
  }
  return { values };
}

// ─── EMA ────────────────────────────────────────────────────────────────────

/**
 * Exponential Moving Average.
 * @param {Array<{time,open,high,low,close,volume}>} data
 * @param {number} period - smoothing period (typically 12 or 26)
 * @returns {{values: Array<{time, value}>, error?: string}}
 */
export function EMA(data, period) {
  const { ok, cleaned, error } = validateData(data, period);
  if (!ok) return { values: [], error };

  const multiplier = 2 / (period + 1);
  const values = [];

  // Seed with SMA of first `period` bars
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += cleaned[i].close;
  }
  let ema = sum / period;
  values.push({ time: cleaned[period - 1].time, value: ema });

  for (let i = period; i < cleaned.length; i++) {
    ema = (cleaned[i].close - ema) * multiplier + ema;
    values.push({ time: cleaned[i].time, value: ema });
  }
  return { values };
}

// ─── RSI ────────────────────────────────────────────────────────────────────

/**
 * Relative Strength Index (Wilder's smoothing).
 * @param {Array<{time,open,high,low,close,volume}>} data
 * @param {number} [period=14]
 * @returns {{values: Array<{time, value}>, error?: string}}
 */
export function RSI(data, period = 14) {
  const { ok, cleaned, error } = validateData(data, period + 1);
  if (!ok) return { values: [], error };

  const deltas = [];
  for (let i = 1; i < cleaned.length; i++) {
    deltas.push({
      time: cleaned[i].time,
      change: cleaned[i].close - cleaned[i - 1].close,
    });
  }

  // Initial average gain / loss over `period` bars
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const ch = deltas[i].change;
    if (ch > 0) avgGain += ch;
    else avgLoss += Math.abs(ch);
  }
  avgGain /= period;
  avgLoss /= period;

  const values = [];
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  values.push({ time: deltas[period - 1].time, value: rsi });

  // Wilder's smoothing for subsequent bars
  for (let i = period; i < deltas.length; i++) {
    const ch = deltas[i].change;
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? Math.abs(ch) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    values.push({ time: deltas[i].time, value: rs });
  }
  return { values };
}

// ─── MACD ───────────────────────────────────────────────────────────────────

/**
 * Moving Average Convergence Divergence.
 * @param {Array<{time,open,high,low,close,volume}>} data
 * @param {number} [fast=12]
 * @param {number} [slow=26]
 * @param {number} [signalPeriod=9]
 * @returns {{values: Array<{time, macd, signal, histogram}>, error?: string}}
 */
export function MACD(data, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = EMA(data, fast);
  const emaSlow = EMA(data, slow);

  if (emaFast.error || emaSlow.error) {
    return { values: [], error: emaFast.error || emaSlow.error };
  }

  // Align by time – both start from different offsets
  const slowMap = new Map(emaSlow.values.map((v) => [v.time, v.value]));
  const macdLine = [];
  for (const fv of emaFast.values) {
    const sv = slowMap.get(fv.time);
    if (sv !== undefined) {
      macdLine.push({ time: fv.time, value: fv.value - sv });
    }
  }

  if (macdLine.length < signalPeriod) {
    return { values: [], error: 'Insufficient data for MACD signal line' };
  }

  // Signal line is an EMA of the MACD line
  const signalMultiplier = 2 / (signalPeriod + 1);
  let signalSum = 0;
  for (let i = 0; i < signalPeriod; i++) {
    signalSum += macdLine[i].value;
  }
  let signalEma = signalSum / signalPeriod;

  const values = [];
  values.push({
    time: macdLine[signalPeriod - 1].time,
    macd: macdLine[signalPeriod - 1].value,
    signal: signalEma,
    histogram: macdLine[signalPeriod - 1].value - signalEma,
  });

  for (let i = signalPeriod; i < macdLine.length; i++) {
    signalEma = (macdLine[i].value - signalEma) * signalMultiplier + signalEma;
    values.push({
      time: macdLine[i].time,
      macd: macdLine[i].value,
      signal: signalEma,
      histogram: macdLine[i].value - signalEma,
    });
  }
  return { values };
}

// ─── Bollinger Bands ────────────────────────────────────────────────────────

/**
 * Bollinger Bands.
 * @param {Array<{time,open,high,low,close,volume}>} data
 * @param {number} [period=20]
 * @param {number} [stdDev=2]
 * @returns {{values: Array<{time, upper, middle, lower, bandwidth}>, error?: string}}
 */
export function BollingerBands(data, period = 20, stdDev = 2) {
  const smaResult = SMA(data, period);
  if (smaResult.error) return { values: [], error: smaResult.error };

  const { ok, cleaned } = validateData(data, period);
  if (!ok) return { values: [], error: 'Insufficient data for Bollinger Bands' };

  const values = [];
  for (let i = period - 1; i < cleaned.length; i++) {
    const slice = cleaned.slice(i - period + 1, i + 1);
    const mean = slice.reduce((s, d) => s + d.close, 0) / period;
    const variance = slice.reduce((s, d) => s + (d.close - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);

    const upper = mean + stdDev * sd;
    const lower = mean - stdDev * sd;
    values.push({
      time: cleaned[i].time,
      upper,
      middle: mean,
      lower,
      bandwidth: mean !== 0 ? (upper - lower) / mean : 0,
    });
  }
  return { values };
}

// ─── Stochastic Oscillator ─────────────────────────────────────────────────

/**
 * Stochastic Oscillator (%K and %D).
 * @param {Array<{time,open,high,low,close,volume}>} data
 * @param {number} [kPeriod=14]
 * @param {number} [dPeriod=3]
 * @returns {{values: Array<{time, k, d}>, error?: string}}
 */
export function Stochastic(data, kPeriod = 14, dPeriod = 3) {
  const { ok, cleaned, error } = validateData(data, kPeriod + dPeriod - 1);
  if (!ok) return { values: [], error };

  // Compute raw %K
  const rawK = [];
  for (let i = kPeriod - 1; i < cleaned.length; i++) {
    const window = cleaned.slice(i - kPeriod + 1, i + 1);
    const lowestLow = Math.min(...window.map((d) => d.low));
    const highestHigh = Math.max(...window.map((d) => d.high));
    const range = highestHigh - lowestLow;
    const k = range === 0 ? 50 : ((cleaned[i].close - lowestLow) / range) * 100;
    rawK.push({ time: cleaned[i].time, k });
  }

  // %D = SMA of %K over dPeriod
  const values = [];
  for (let i = dPeriod - 1; i < rawK.length; i++) {
    let dSum = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      dSum += rawK[j].k;
    }
    values.push({
      time: rawK[i].time,
      k: rawK[i].k,
      d: dSum / dPeriod,
    });
  }
  return { values };
}

// ─── True Range helper ─────────────────────────────────────────────────────

/**
 * Calculates True Range for each bar (starting from index 1).
 * @param {Array<{high, low, close}>} bars
 * @returns {number[]}
 */
function trueRanges(bars) {
  const tr = [];
  for (let i = 1; i < bars.length; i++) {
    const hl = bars[i].high - bars[i].low;
    const hc = Math.abs(bars[i].high - bars[i - 1].close);
    const lc = Math.abs(bars[i].low - bars[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }
  return tr;
}

// ─── ATR ────────────────────────────────────────────────────────────────────

/**
 * Average True Range (Wilder's smoothing).
 * @param {Array<{time,open,high,low,close,volume}>} data
 * @param {number} [period=14]
 * @returns {{values: Array<{time, value}>, error?: string}}
 */
export function ATR(data, period = 14) {
  const { ok, cleaned, error } = validateData(data, period + 1);
  if (!ok) return { values: [], error };

  const tr = trueRanges(cleaned);

  // Seed ATR with simple average of first `period` TRs
  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += tr[i];
  }
  atr /= period;

  const values = [];
  // tr[i] corresponds to cleaned[i+1], so tr[period-1] corresponds to cleaned[period]
  values.push({ time: cleaned[period].time, value: atr });

  for (let i = period; i < tr.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    values.push({ time: cleaned[i + 1].time, value: atr });
  }
  return { values };
}

// ─── ADX ────────────────────────────────────────────────────────────────────

/**
 * Average Directional Index.
 * @param {Array<{time,open,high,low,close,volume}>} data
 * @param {number} [period=14]
 * @returns {{values: Array<{time, adx, plusDI, minusDI}>, error?: string}}
 */
export function ADX(data, period = 14) {
  const { ok, cleaned, error } = validateData(data, 2 * period + 1);
  if (!ok) return { values: [], error };

  const tr = trueRanges(cleaned);

  // Directional movement
  const plusDM = [];
  const minusDM = [];
  for (let i = 1; i < cleaned.length; i++) {
    const upMove = cleaned[i].high - cleaned[i - 1].high;
    const downMove = cleaned[i - 1].low - cleaned[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Wilder's smoothing for TR, +DM, -DM
  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  for (let i = 0; i < period; i++) {
    smoothTR += tr[i];
    smoothPlusDM += plusDM[i];
    smoothMinusDM += minusDM[i];
  }

  const diValues = [];
  const computeDI = () => {
    const pDI = smoothTR === 0 ? 0 : (smoothPlusDM / smoothTR) * 100;
    const mDI = smoothTR === 0 ? 0 : (smoothMinusDM / smoothTR) * 100;
    const dx = pDI + mDI === 0 ? 0 : (Math.abs(pDI - mDI) / (pDI + mDI)) * 100;
    return { pDI, mDI, dx };
  };

  let di = computeDI();
  // index in tr/plusDM/minusDM is (period-1), corresponds to cleaned[period]
  diValues.push({ time: cleaned[period].time, ...di });

  for (let i = period; i < tr.length; i++) {
    smoothTR = smoothTR - smoothTR / period + tr[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
    di = computeDI();
    diValues.push({ time: cleaned[i + 1].time, ...di });
  }

  // ADX = Wilder-smoothed DX over `period` readings
  if (diValues.length < period) {
    return { values: [], error: 'Insufficient data for ADX' };
  }

  let adxSum = 0;
  for (let i = 0; i < period; i++) {
    adxSum += diValues[i].dx;
  }
  let adx = adxSum / period;

  const values = [];
  values.push({
    time: diValues[period - 1].time,
    adx,
    plusDI: diValues[period - 1].pDI,
    minusDI: diValues[period - 1].mDI,
  });

  for (let i = period; i < diValues.length; i++) {
    adx = (adx * (period - 1) + diValues[i].dx) / period;
    values.push({
      time: diValues[i].time,
      adx,
      plusDI: diValues[i].pDI,
      minusDI: diValues[i].mDI,
    });
  }
  return { values };
}

// ─── analyzeIndicators ──────────────────────────────────────────────────────

/**
 * Runs all indicators on the given data and returns a comprehensive summary
 * with latest values, signal interpretations, and crossover detections.
 *
 * @param {Array<{time,open,high,low,close,volume}>} data - OHLCV bars,
 *   ideally ≥ 220 bars for all indicators (including 200-SMA) to produce output.
 * @returns {{
 *   sma: object, ema: object, rsi: object, macd: object,
 *   bollingerBands: object, stochastic: object, adx: object, atr: object,
 *   crossovers: object, overallSignal: string
 * }}
 */
export function analyzeIndicators(data) {
  // ── Compute all indicators ────────────────────────────────────────────
  const sma20 = SMA(data, 20);
  const sma50 = SMA(data, 50);
  const sma200 = SMA(data, 200);

  const ema12 = EMA(data, 12);
  const ema26 = EMA(data, 26);

  const rsiResult = RSI(data, 14);
  const macdResult = MACD(data, 12, 26, 9);
  const bbResult = BollingerBands(data, 20, 2);
  const stochResult = Stochastic(data, 14, 3);
  const adxResult = ADX(data, 14);
  const atrResult = ATR(data, 14);

  // ── Helper: latest value from an indicator result ─────────────────────
  const latest = (result, key = 'value') => {
    const vals = result.values;
    if (!vals || vals.length === 0) return null;
    const last = vals[vals.length - 1];
    return key === '*' ? { ...last } : last[key];
  };

  const lastClose =
    Array.isArray(data) && data.length > 0 ? data[data.length - 1].close : null;

  // ── SMA analysis ──────────────────────────────────────────────────────
  const sma20Val = latest(sma20);
  const sma50Val = latest(sma50);
  const sma200Val = latest(sma200);

  const smaSignal = (() => {
    if (lastClose === null || sma50Val === null) return 'neutral';
    const aboveShort = sma20Val !== null && lastClose > sma20Val;
    const aboveMedium = lastClose > sma50Val;
    const aboveLong = sma200Val !== null && lastClose > sma200Val;
    if (aboveShort && aboveMedium && aboveLong) return 'bullish';
    if (!aboveShort && !aboveMedium && (sma200Val === null || !aboveLong)) return 'bearish';
    return 'neutral';
  })();

  // ── Crossover detection ───────────────────────────────────────────────
  const detectCrossover = (shortResult, longResult) => {
    const sVals = shortResult.values || [];
    const lVals = longResult.values || [];
    if (sVals.length < 2 || lVals.length < 2) return 'none';

    // Align by last two matching times
    const longMap = new Map(lVals.map((v) => [v.time, v.value]));
    const aligned = sVals.filter((v) => longMap.has(v.time));
    if (aligned.length < 2) return 'none';

    const prev = aligned[aligned.length - 2];
    const curr = aligned[aligned.length - 1];
    const prevLong = longMap.get(prev.time);
    const currLong = longMap.get(curr.time);

    if (prev.value <= prevLong && curr.value > currLong) return 'goldenCross';
    if (prev.value >= prevLong && curr.value < currLong) return 'deathCross';
    return 'none';
  };

  const smaCrossover50_200 = detectCrossover(sma50, sma200);
  const emaCrossover12_26 = detectCrossover(ema12, ema26);

  // ── RSI analysis ──────────────────────────────────────────────────────
  const rsiValue = latest(rsiResult);
  const rsiSignal = (() => {
    if (rsiValue === null) return 'neutral';
    if (rsiValue > 70) return 'bearish'; // overbought
    if (rsiValue < 30) return 'bullish'; // oversold
    return 'neutral';
  })();
  const rsiCondition = (() => {
    if (rsiValue === null) return 'unknown';
    if (rsiValue > 70) return 'overbought';
    if (rsiValue < 30) return 'oversold';
    return 'normal';
  })();

  // ── MACD analysis ─────────────────────────────────────────────────────
  const macdLatest = latest(macdResult, '*');
  const macdSignalDir = (() => {
    const vals = macdResult.values || [];
    if (vals.length < 2) return 'neutral';
    const prev = vals[vals.length - 2];
    const curr = vals[vals.length - 1];
    // Histogram crossing zero
    if (prev.histogram <= 0 && curr.histogram > 0) return 'bullish';
    if (prev.histogram >= 0 && curr.histogram < 0) return 'bearish';
    // Use histogram sign as fallback
    if (curr.histogram > 0) return 'bullish';
    if (curr.histogram < 0) return 'bearish';
    return 'neutral';
  })();

  const macdCrossover = (() => {
    const vals = macdResult.values || [];
    if (vals.length < 2) return 'none';
    const prev = vals[vals.length - 2];
    const curr = vals[vals.length - 1];
    if (prev.macd <= prev.signal && curr.macd > curr.signal) return 'bullishCrossover';
    if (prev.macd >= prev.signal && curr.macd < curr.signal) return 'bearishCrossover';
    return 'none';
  })();

  // ── Bollinger Bands analysis ──────────────────────────────────────────
  const bbLatest = latest(bbResult, '*');
  const bbSignal = (() => {
    if (!bbLatest || lastClose === null) return 'neutral';
    if (lastClose >= bbLatest.upper) return 'bearish'; // potentially overbought
    if (lastClose <= bbLatest.lower) return 'bullish'; // potentially oversold
    return 'neutral';
  })();

  // ── Stochastic analysis ───────────────────────────────────────────────
  const stochLatest = latest(stochResult, '*');
  const stochSignal = (() => {
    if (!stochLatest) return 'neutral';
    if (stochLatest.k > 80 && stochLatest.d > 80) return 'bearish';
    if (stochLatest.k < 20 && stochLatest.d < 20) return 'bullish';
    return 'neutral';
  })();

  // ── ADX analysis ──────────────────────────────────────────────────────
  const adxLatest = latest(adxResult, '*');
  const adxSignal = (() => {
    if (!adxLatest) return 'neutral';
    if (adxLatest.adx < 20) return 'neutral'; // weak trend
    return adxLatest.plusDI > adxLatest.minusDI ? 'bullish' : 'bearish';
  })();

  // ── ATR (informational, not directional) ──────────────────────────────
  const atrValue = latest(atrResult);

  // ── Overall composite signal ──────────────────────────────────────────
  const signalScores = { bullish: 1, neutral: 0, bearish: -1 };
  const signals = [smaSignal, rsiSignal, macdSignalDir, bbSignal, stochSignal, adxSignal];
  const avgScore = signals.reduce((s, sig) => s + signalScores[sig], 0) / signals.length;

  const overallSignal = avgScore > 0.25 ? 'bullish' : avgScore < -0.25 ? 'bearish' : 'neutral';

  return {
    sma: {
      sma20: sma20Val,
      sma50: sma50Val,
      sma200: sma200Val,
      signal: smaSignal,
      crossover: smaCrossover50_200,
    },
    ema: {
      ema12: latest(ema12),
      ema26: latest(ema26),
      crossover: emaCrossover12_26,
    },
    rsi: {
      value: rsiValue,
      signal: rsiSignal,
      condition: rsiCondition,
    },
    macd: {
      ...macdLatest,
      signal: macdSignalDir,
      crossover: macdCrossover,
    },
    bollingerBands: {
      ...bbLatest,
      signal: bbSignal,
    },
    stochastic: {
      ...stochLatest,
      signal: stochSignal,
    },
    adx: {
      ...adxLatest,
      signal: adxSignal,
    },
    atr: {
      value: atrValue,
    },
    crossovers: {
      sma50_200: smaCrossover50_200,
      ema12_26: emaCrossover12_26,
      macd: macdCrossover,
    },
    overallSignal,
  };
}
