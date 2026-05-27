/**
 * @module patterns
 * @description Chart-pattern detection algorithms operating on OHLCV data.
 * All functions are pure – no DOM, no side-effects.
 * Each detector returns a structured result with pattern metadata,
 * key price levels, reliability (0–1), and human-readable descriptions.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Identifies local peaks (maxima) and troughs (minima) using a lookback
 * window. A peak at index i means high[i] is the highest high in
 * [i-order, i+order]. Troughs are analogous for lows.
 *
 * @param {Array<{time,high,low,close}>} data
 * @param {number} order - half-window size for extremum detection
 * @returns {{peaks: Array<{index,time,price}>, troughs: Array<{index,time,price}>}}
 */
function findExtremes(data, order = 5) {
  const peaks = [];
  const troughs = [];

  for (let i = order; i < data.length - order; i++) {
    let isPeak = true;
    let isTrough = true;

    for (let j = 1; j <= order; j++) {
      if (data[i].high < data[i - j].high || data[i].high < data[i + j].high) {
        isPeak = false;
      }
      if (data[i].low > data[i - j].low || data[i].low > data[i + j].low) {
        isTrough = false;
      }
    }

    if (isPeak) peaks.push({ index: i, time: data[i].time, price: data[i].high });
    if (isTrough) troughs.push({ index: i, time: data[i].time, price: data[i].low });
  }
  return { peaks, troughs };
}

/**
 * Simple linear regression: y = slope*x + intercept.
 * @param {Array<{x: number, y: number}>} points
 * @returns {{slope: number, intercept: number, r2: number}}
 */
function linearRegression(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points.length ? points[0].y : 0, r2: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (const { x, y } of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R²
  const ssTot = sumY2 - (sumY * sumY) / n;
  const ssRes = points.reduce((s, p) => {
    const pred = slope * p.x + intercept;
    return s + (p.y - pred) ** 2;
  }, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

/**
 * Checks whether the value b is approximately equal to a within a
 * given tolerance ratio.
 */
function approxEqual(a, b, tolerance = 0.03) {
  if (a === 0 && b === 0) return true;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) <= tolerance;
}

/**
 * Average volume over a range of indices.
 */
function avgVolume(data, startIdx, endIdx) {
  let sum = 0;
  let count = 0;
  for (let i = startIdx; i <= endIdx && i < data.length; i++) {
    if (Number.isFinite(data[i].volume)) {
      sum += data[i].volume;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pattern Detectors
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detects Head-and-Shoulders and Inverse Head-and-Shoulders patterns.
 *
 * Algorithm:
 *  1. Find peaks (for H&S) or troughs (for inverse) in the window.
 *  2. Search for groups of three where the middle one is the most extreme.
 *  3. Compute neckline through the two shoulders' counter-extremes.
 *  4. Derive target from neckline and head distance.
 *
 * @param {Array<{time,open,high,low,close,volume}>} data
 * @param {number} [windowSize=60]
 * @returns {{found: boolean, type?: string, neckline?: number, target?: number,
 *            reliability?: number, points?: Array<{time, price}>,
 *            name?: string, patternType?: string, direction?: string,
 *            description?: string, keyLevels?: object}}
 */
export function detectHeadAndShoulders(data, windowSize = 60) {
  const noResult = { found: false };
  if (!Array.isArray(data) || data.length < windowSize) return noResult;

  const window = data.slice(-windowSize);
  const { peaks, troughs } = findExtremes(window, 5);

  // ── Regular H&S (bearish reversal) ────────────────────────────────────
  for (let i = 0; i < peaks.length - 2; i++) {
    const leftShoulder = peaks[i];
    const head = peaks[i + 1];
    const rightShoulder = peaks[i + 2];

    // Head must be higher than both shoulders
    if (head.price <= leftShoulder.price || head.price <= rightShoulder.price) continue;
    // Shoulders should be roughly equal height (within 5 %)
    if (!approxEqual(leftShoulder.price, rightShoulder.price, 0.05)) continue;

    // Neckline: troughs between shoulders
    const neckTroughs = troughs.filter(
      (t) => t.index > leftShoulder.index && t.index < rightShoulder.index
    );
    if (neckTroughs.length < 1) continue;

    const necklinePrice = neckTroughs.reduce((s, t) => s + t.price, 0) / neckTroughs.length;
    const headHeight = head.price - necklinePrice;
    const target = necklinePrice - headHeight;

    // Volume confirmation: volume at head should ideally be lower than left shoulder
    const volHead = avgVolume(data, data.length - windowSize + head.index - 2, data.length - windowSize + head.index + 2);
    const volLS = avgVolume(data, data.length - windowSize + leftShoulder.index - 2, data.length - windowSize + leftShoulder.index + 2);
    const volumeConfirm = volHead < volLS ? 0.15 : 0;

    // Symmetry bonus
    const symmetry = 1 - Math.abs(leftShoulder.price - rightShoulder.price) / head.price;
    const reliability = Math.min(1, 0.5 + symmetry * 0.2 + volumeConfirm);

    return {
      found: true,
      type: 'headAndShoulders',
      name: 'Head and Shoulders',
      patternType: 'reversal',
      direction: 'bearish',
      neckline: necklinePrice,
      target,
      reliability,
      points: [
        { time: leftShoulder.time, price: leftShoulder.price },
        { time: head.time, price: head.price },
        { time: rightShoulder.time, price: rightShoulder.price },
      ],
      description: `Head-and-Shoulders reversal detected. Neckline at ${necklinePrice.toFixed(2)}, target ${target.toFixed(2)}.`,
      keyLevels: { neckline: necklinePrice, target, head: head.price },
    };
  }

  // ── Inverse H&S (bullish reversal) ────────────────────────────────────
  for (let i = 0; i < troughs.length - 2; i++) {
    const leftShoulder = troughs[i];
    const head = troughs[i + 1];
    const rightShoulder = troughs[i + 2];

    if (head.price >= leftShoulder.price || head.price >= rightShoulder.price) continue;
    if (!approxEqual(leftShoulder.price, rightShoulder.price, 0.05)) continue;

    const neckPeaks = peaks.filter(
      (p) => p.index > leftShoulder.index && p.index < rightShoulder.index
    );
    if (neckPeaks.length < 1) continue;

    const necklinePrice = neckPeaks.reduce((s, p) => s + p.price, 0) / neckPeaks.length;
    const headDepth = necklinePrice - head.price;
    const target = necklinePrice + headDepth;

    const symmetry = 1 - Math.abs(leftShoulder.price - rightShoulder.price) / necklinePrice;
    const reliability = Math.min(1, 0.5 + symmetry * 0.2);

    return {
      found: true,
      type: 'inverseHeadAndShoulders',
      name: 'Inverse Head and Shoulders',
      patternType: 'reversal',
      direction: 'bullish',
      neckline: necklinePrice,
      target,
      reliability,
      points: [
        { time: leftShoulder.time, price: leftShoulder.price },
        { time: head.time, price: head.price },
        { time: rightShoulder.time, price: rightShoulder.price },
      ],
      description: `Inverse Head-and-Shoulders reversal detected. Neckline at ${necklinePrice.toFixed(2)}, target ${target.toFixed(2)}.`,
      keyLevels: { neckline: necklinePrice, target, head: head.price },
    };
  }

  return noResult;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects Double Top (bearish) and Double Bottom (bullish) patterns.
 *
 * @param {Array<{time,open,high,low,close,volume}>} data
 * @param {number} [windowSize=40]
 * @returns {{found: boolean, type?: string, neckline?: number, target?: number,
 *            reliability?: number, points?: Array<{time, price}>,
 *            name?: string, patternType?: string, direction?: string,
 *            description?: string, keyLevels?: object}}
 */
export function detectDoubleTopBottom(data, windowSize = 40) {
  const noResult = { found: false };
  if (!Array.isArray(data) || data.length < windowSize) return noResult;

  const window = data.slice(-windowSize);
  const { peaks, troughs } = findExtremes(window, 4);

  // ── Double Top ────────────────────────────────────────────────────────
  for (let i = 0; i < peaks.length - 1; i++) {
    const first = peaks[i];
    const second = peaks[i + 1];
    if (!approxEqual(first.price, second.price, 0.03)) continue;
    // Must have a meaningful trough between them
    const between = troughs.filter((t) => t.index > first.index && t.index < second.index);
    if (between.length === 0) continue;

    const lowestBetween = between.reduce((m, t) => (t.price < m.price ? t : m));
    const neckline = lowestBetween.price;
    const patternHeight = ((first.price + second.price) / 2) - neckline;
    const target = neckline - patternHeight;

    // Volume: second peak should have lower volume
    const vol1 = avgVolume(data, data.length - windowSize + first.index - 2, data.length - windowSize + first.index + 2);
    const vol2 = avgVolume(data, data.length - windowSize + second.index - 2, data.length - windowSize + second.index + 2);
    const volumeBonus = vol2 < vol1 ? 0.1 : 0;

    const reliability = Math.min(1, 0.55 + volumeBonus + 0.1);

    return {
      found: true,
      type: 'doubleTop',
      name: 'Double Top',
      patternType: 'reversal',
      direction: 'bearish',
      neckline,
      target,
      reliability,
      points: [
        { time: first.time, price: first.price },
        { time: lowestBetween.time, price: lowestBetween.price },
        { time: second.time, price: second.price },
      ],
      description: `Double Top detected with peaks near ${first.price.toFixed(2)}. Neckline ${neckline.toFixed(2)}, target ${target.toFixed(2)}.`,
      keyLevels: { resistance: (first.price + second.price) / 2, neckline, target },
    };
  }

  // ── Double Bottom ─────────────────────────────────────────────────────
  for (let i = 0; i < troughs.length - 1; i++) {
    const first = troughs[i];
    const second = troughs[i + 1];
    if (!approxEqual(first.price, second.price, 0.03)) continue;

    const between = peaks.filter((p) => p.index > first.index && p.index < second.index);
    if (between.length === 0) continue;

    const highestBetween = between.reduce((m, p) => (p.price > m.price ? p : m));
    const neckline = highestBetween.price;
    const patternHeight = neckline - (first.price + second.price) / 2;
    const target = neckline + patternHeight;

    const reliability = Math.min(1, 0.55 + 0.1);

    return {
      found: true,
      type: 'doubleBottom',
      name: 'Double Bottom',
      patternType: 'reversal',
      direction: 'bullish',
      neckline,
      target,
      reliability,
      points: [
        { time: first.time, price: first.price },
        { time: highestBetween.time, price: highestBetween.price },
        { time: second.time, price: second.price },
      ],
      description: `Double Bottom detected with troughs near ${first.price.toFixed(2)}. Neckline ${neckline.toFixed(2)}, target ${target.toFixed(2)}.`,
      keyLevels: { support: (first.price + second.price) / 2, neckline, target },
    };
  }

  return noResult;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects ascending, descending, and symmetric triangle patterns
 * by fitting linear regressions to peaks and troughs.
 *
 * @param {Array<{time,open,high,low,close,volume}>} data
 * @param {number} [windowSize=40]
 * @returns {{found: boolean, type?: string, apex?: number,
 *            reliability?: number, upperLine?: object, lowerLine?: object,
 *            name?: string, patternType?: string, direction?: string,
 *            description?: string, keyLevels?: object}}
 */
export function detectTriangles(data, windowSize = 40) {
  const noResult = { found: false };
  if (!Array.isArray(data) || data.length < windowSize) return noResult;

  const window = data.slice(-windowSize);
  const { peaks, troughs } = findExtremes(window, 3);
  if (peaks.length < 3 || troughs.length < 3) return noResult;

  const peakReg = linearRegression(peaks.map((p) => ({ x: p.index, y: p.price })));
  const troughReg = linearRegression(troughs.map((t) => ({ x: t.index, y: t.price })));

  const upperSlope = peakReg.slope;
  const lowerSlope = troughReg.slope;

  // Threshold for "flat"
  const avgPrice = (peaks[0].price + troughs[0].price) / 2;
  const flatThreshold = avgPrice * 0.0005; // slope per bar

  let type = null;
  let direction = null;
  let patternType = null;

  if (Math.abs(upperSlope) < flatThreshold && lowerSlope > flatThreshold) {
    // Flat top, rising bottom → ascending triangle (bullish continuation)
    type = 'ascendingTriangle';
    direction = 'bullish';
    patternType = 'continuation';
  } else if (upperSlope < -flatThreshold && Math.abs(lowerSlope) < flatThreshold) {
    // Falling top, flat bottom → descending triangle (bearish continuation)
    type = 'descendingTriangle';
    direction = 'bearish';
    patternType = 'continuation';
  } else if (upperSlope < -flatThreshold && lowerSlope > flatThreshold) {
    // Converging → symmetric triangle (neutral until breakout)
    type = 'symmetricTriangle';
    direction = 'neutral';
    patternType = 'continuation';
  }

  if (!type) return noResult;

  // Converging point (apex)
  const apexIndex =
    upperSlope !== lowerSlope
      ? (troughReg.intercept - peakReg.intercept) / (peakReg.slope - troughReg.slope)
      : windowSize;

  const reliability = Math.min(1, 0.4 + (peakReg.r2 + troughReg.r2) / 2 * 0.4 + (peaks.length >= 3 ? 0.1 : 0));

  const nameMap = {
    ascendingTriangle: 'Ascending Triangle',
    descendingTriangle: 'Descending Triangle',
    symmetricTriangle: 'Symmetric Triangle',
  };

  return {
    found: true,
    type,
    name: nameMap[type],
    patternType,
    direction,
    apex: apexIndex,
    upperLine: { slope: peakReg.slope, intercept: peakReg.intercept, r2: peakReg.r2 },
    lowerLine: { slope: troughReg.slope, intercept: troughReg.intercept, r2: troughReg.r2 },
    reliability,
    description: `${nameMap[type]} detected over the last ${windowSize} bars. Apex near bar ${Math.round(apexIndex)}.`,
    keyLevels: {
      upperBound: peakReg.slope * (windowSize - 1) + peakReg.intercept,
      lowerBound: troughReg.slope * (windowSize - 1) + troughReg.intercept,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects rising and falling wedge patterns. Both are converging, but
 * both trendlines slope in the same direction.
 *
 * @param {Array<{time,open,high,low,close,volume}>} data
 * @param {number} [windowSize=40]
 * @returns {{found: boolean, type?: string, reliability?: number,
 *            upperLine?: object, lowerLine?: object,
 *            name?: string, patternType?: string, direction?: string,
 *            description?: string, keyLevels?: object}}
 */
export function detectWedges(data, windowSize = 40) {
  const noResult = { found: false };
  if (!Array.isArray(data) || data.length < windowSize) return noResult;

  const window = data.slice(-windowSize);
  const { peaks, troughs } = findExtremes(window, 3);
  if (peaks.length < 3 || troughs.length < 3) return noResult;

  const peakReg = linearRegression(peaks.map((p) => ({ x: p.index, y: p.price })));
  const troughReg = linearRegression(troughs.map((t) => ({ x: t.index, y: t.price })));

  const upperSlope = peakReg.slope;
  const lowerSlope = troughReg.slope;

  let type = null;
  let direction = null;

  // Both slopes positive and converging → rising wedge (bearish)
  if (upperSlope > 0 && lowerSlope > 0 && lowerSlope > upperSlope) {
    type = 'risingWedge';
    direction = 'bearish';
  }
  // Both slopes negative and converging → falling wedge (bullish)
  if (upperSlope < 0 && lowerSlope < 0 && upperSlope > lowerSlope) {
    type = 'fallingWedge';
    direction = 'bullish';
  }

  if (!type) return noResult;

  const reliability = Math.min(1, 0.4 + (peakReg.r2 + troughReg.r2) / 2 * 0.35);
  const nameMap = { risingWedge: 'Rising Wedge', fallingWedge: 'Falling Wedge' };

  return {
    found: true,
    type,
    name: nameMap[type],
    patternType: 'reversal',
    direction,
    upperLine: { slope: peakReg.slope, intercept: peakReg.intercept, r2: peakReg.r2 },
    lowerLine: { slope: troughReg.slope, intercept: troughReg.intercept, r2: troughReg.r2 },
    reliability,
    description: `${nameMap[type]} detected. Both trendlines slope ${upperSlope > 0 ? 'upward' : 'downward'} but converge, suggesting ${direction} reversal.`,
    keyLevels: {
      upperBound: peakReg.slope * (windowSize - 1) + peakReg.intercept,
      lowerBound: troughReg.slope * (windowSize - 1) + troughReg.intercept,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Identifies key support and resistance levels by clustering local
 * extremes and scoring by touch-count.
 *
 * @param {Array<{time,open,high,low,close,volume}>} data
 * @param {number} [sensitivity=3] - minimum number of touches to qualify
 * @returns {Array<{level: number, strength: number, type: 'support'|'resistance',
 *                  touches: number}>}
 */
export function detectSupportResistance(data, sensitivity = 3) {
  if (!Array.isArray(data) || data.length < 10) return [];

  const { peaks, troughs } = findExtremes(data, 3);
  const allLevels = [
    ...peaks.map((p) => ({ price: p.price, kind: 'resistance' })),
    ...troughs.map((t) => ({ price: t.price, kind: 'support' })),
  ];

  if (allLevels.length === 0) return [];

  // Cluster levels within 1.5 % of each other
  const tolerance = 0.015;
  const clusters = [];

  for (const lv of allLevels) {
    let merged = false;
    for (const cluster of clusters) {
      if (approxEqual(cluster.level, lv.price, tolerance)) {
        cluster.level = (cluster.level * cluster.touches + lv.price) / (cluster.touches + 1);
        cluster.touches++;
        // Dominant type = whichever has more touches
        cluster.kinds.push(lv.kind);
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({ level: lv.price, touches: 1, kinds: [lv.kind] });
    }
  }

  const lastClose = data[data.length - 1].close;

  return clusters
    .filter((c) => c.touches >= sensitivity)
    .map((c) => {
      const supportCount = c.kinds.filter((k) => k === 'support').length;
      const resistanceCount = c.kinds.filter((k) => k === 'resistance').length;
      const type = c.level < lastClose
        ? 'support'
        : c.level > lastClose
          ? 'resistance'
          : supportCount >= resistanceCount ? 'support' : 'resistance';
      return {
        level: c.level,
        strength: Math.min(1, c.touches / 8),
        type,
        touches: c.touches,
      };
    })
    .sort((a, b) => b.strength - a.strength);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects a price channel (parallel trendlines) via linear regression
 * on peaks and troughs.
 *
 * @param {Array<{time,open,high,low,close,volume}>} data
 * @param {number} [windowSize=30]
 * @returns {{found: boolean, type?: string, upperLine?: object,
 *            lowerLine?: object, reliability?: number,
 *            name?: string, patternType?: string, direction?: string,
 *            description?: string, keyLevels?: object}}
 */
export function detectTrendChannel(data, windowSize = 30) {
  const noResult = { found: false };
  if (!Array.isArray(data) || data.length < windowSize) return noResult;

  const window = data.slice(-windowSize);
  const { peaks, troughs } = findExtremes(window, 3);
  if (peaks.length < 2 || troughs.length < 2) return noResult;

  const peakReg = linearRegression(peaks.map((p) => ({ x: p.index, y: p.price })));
  const troughReg = linearRegression(troughs.map((t) => ({ x: t.index, y: t.price })));

  // Channels require roughly parallel lines (slope ratio close to 1)
  const slopeDiff = Math.abs(peakReg.slope - troughReg.slope);
  const avgSlope = (Math.abs(peakReg.slope) + Math.abs(troughReg.slope)) / 2;
  if (avgSlope > 0 && slopeDiff / avgSlope > 0.5) return noResult; // not parallel enough

  const avgChannelSlope = (peakReg.slope + troughReg.slope) / 2;
  const avgPrice = (peaks[0].price + troughs[0].price) / 2;
  const slopePerBar = avgChannelSlope / avgPrice;

  let type;
  let direction;
  if (slopePerBar > 0.0003) {
    type = 'ascendingChannel';
    direction = 'bullish';
  } else if (slopePerBar < -0.0003) {
    type = 'descendingChannel';
    direction = 'bearish';
  } else {
    type = 'horizontalChannel';
    direction = 'neutral';
  }

  const reliability = Math.min(
    1,
    0.35 + (peakReg.r2 + troughReg.r2) / 2 * 0.4 + (1 - Math.min(1, slopeDiff / (avgSlope || 1))) * 0.15
  );

  const nameMap = {
    ascendingChannel: 'Ascending Channel',
    descendingChannel: 'Descending Channel',
    horizontalChannel: 'Horizontal Channel',
  };

  return {
    found: true,
    type,
    name: nameMap[type],
    patternType: 'continuation',
    direction,
    upperLine: { slope: peakReg.slope, intercept: peakReg.intercept, r2: peakReg.r2 },
    lowerLine: { slope: troughReg.slope, intercept: troughReg.intercept, r2: troughReg.r2 },
    reliability,
    description: `${nameMap[type]} detected over the last ${windowSize} bars.`,
    keyLevels: {
      upperBound: peakReg.slope * (windowSize - 1) + peakReg.intercept,
      lowerBound: troughReg.slope * (windowSize - 1) + troughReg.intercept,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Aggregate detector
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Runs every pattern detector on the data and returns all detected
 * patterns sorted by reliability (highest first).
 *
 * @param {Array<{time,open,high,low,close,volume}>} data
 * @returns {Array<{found: boolean, type: string, name: string,
 *                  patternType: string, direction: string,
 *                  reliability: number, description: string,
 *                  keyLevels: object}>}
 */
export function detectAllPatterns(data) {
  const detectors = [
    () => detectHeadAndShoulders(data, 60),
    () => detectDoubleTopBottom(data, 40),
    () => detectTriangles(data, 40),
    () => detectWedges(data, 40),
    () => detectTrendChannel(data, 30),
  ];

  const results = [];
  for (const detect of detectors) {
    const result = detect();
    if (result.found) {
      results.push(result);
    }
  }

  // Add support / resistance as a separate entry if any are found
  const srLevels = detectSupportResistance(data, 3);
  if (srLevels.length > 0) {
    results.push({
      found: true,
      type: 'supportResistance',
      name: 'Support / Resistance Levels',
      patternType: 'levels',
      direction: 'neutral',
      reliability: Math.max(...srLevels.map((l) => l.strength)),
      description: `${srLevels.length} key support/resistance level(s) identified.`,
      keyLevels: Object.fromEntries(
        srLevels.map((l, idx) => [`${l.type}_${idx + 1}`, l.level])
      ),
      levels: srLevels,
    });
  }

  return results.sort((a, b) => (b.reliability ?? 0) - (a.reliability ?? 0));
}
