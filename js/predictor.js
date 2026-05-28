/**
 * @module predictor
 * @description Weighted signal aggregation for stock-market predictions.
 * Combines technical indicators and chart-pattern signals into a single
 * directional forecast with confidence scoring.
 *
 * Signal categories and their weights:
 *   Trend (SMA/EMA crossovers)   — 25 %
 *   Momentum (RSI, Stochastic)   — 20 %
 *   MACD                         — 20 %
 *   Chart patterns               — 20 %
 *   Volatility (Bollinger, ATR)  — 15 %
 *
 * Each signal yields a score in [-1, +1]:
 *   -1 = strongly bearish,  0 = neutral,  +1 = strongly bullish.
 * The weighted average becomes the raw prediction; its absolute value
 * is the confidence.
 */

import { SMA, EMA, RSI, MACD, BollingerBands, Stochastic, ADX, ATR, analyzeIndicators } from './indicators.js';
import { detectAllPatterns } from './patterns.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Clamp a number to [min, max].
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Map a direction string to a numeric score.
 * @param {'bullish'|'bearish'|'neutral'} dir
 * @returns {number}
 */
function directionScore(dir) {
  if (dir === 'bullish') return 1;
  if (dir === 'bearish') return -1;
  return 0;
}

/**
 * Derive a direction label from a raw score.
 * @param {number} score
 * @returns {'bullish'|'bearish'|'neutral'}
 */
function scoreToDirection(score) {
  if (score > 0.15) return 'bullish';
  if (score < -0.15) return 'bearish';
  return 'neutral';
}

// ─── Signal Generators ──────────────────────────────────────────────────────

/**
 * Trend signal from SMA/EMA crossovers and price position.
 * @param {object} analysis - output of analyzeIndicators()
 * @param {number} lastClose
 * @returns {{score: number, detail: string}}
 */
function trendSignal(analysis, lastClose) {
  let score = 0;
  const parts = [];

  // SMA crossover (golden/death cross)
  if (analysis.crossovers.sma50_200 === 'goldenCross') {
    score += 0.8;
    parts.push('Golden cross (50/200 SMA)');
  } else if (analysis.crossovers.sma50_200 === 'deathCross') {
    score -= 0.8;
    parts.push('Death cross (50/200 SMA)');
  }

  // EMA crossover
  if (analysis.crossovers.ema12_26 === 'goldenCross') {
    score += 0.5;
    parts.push('EMA 12/26 bullish crossover');
  } else if (analysis.crossovers.ema12_26 === 'deathCross') {
    score -= 0.5;
    parts.push('EMA 12/26 bearish crossover');
  }

  // Price vs key SMAs
  if (analysis.sma.sma50 !== null) {
    if (lastClose > analysis.sma.sma50) {
      score += 0.3;
      parts.push('Price above 50-day SMA');
    } else {
      score -= 0.3;
      parts.push('Price below 50-day SMA');
    }
  }

  if (analysis.sma.sma200 !== null) {
    if (lastClose > analysis.sma.sma200) {
      score += 0.2;
      parts.push('Price above 200-day SMA');
    } else {
      score -= 0.2;
      parts.push('Price below 200-day SMA');
    }
  }

  return { score: clamp(score, -1, 1), detail: parts.join('; ') || 'No trend signals' };
}

/**
 * Momentum signal from RSI and Stochastic.
 * @param {object} analysis
 * @returns {{score: number, detail: string}}
 */
function momentumSignal(analysis) {
  let score = 0;
  const parts = [];

  // RSI
  const rsi = analysis.rsi.value;
  if (rsi !== null) {
    if (rsi > 70) {
      score -= 0.6;
      parts.push(`RSI overbought (${rsi.toFixed(1)})`);
    } else if (rsi > 60) {
      score += 0.2;
      parts.push(`RSI strong (${rsi.toFixed(1)})`);
    } else if (rsi < 30) {
      score += 0.6;
      parts.push(`RSI oversold (${rsi.toFixed(1)})`);
    } else if (rsi < 40) {
      score -= 0.2;
      parts.push(`RSI weak (${rsi.toFixed(1)})`);
    } else {
      parts.push(`RSI neutral (${rsi.toFixed(1)})`);
    }
  }

  // Stochastic
  const stochK = analysis.stochastic?.k;
  const stochD = analysis.stochastic?.d;
  if (stochK !== undefined && stochK !== null) {
    if (stochK > 80 && stochD > 80) {
      score -= 0.5;
      parts.push(`Stochastic overbought (%K ${stochK.toFixed(1)})`);
    } else if (stochK < 20 && stochD < 20) {
      score += 0.5;
      parts.push(`Stochastic oversold (%K ${stochK.toFixed(1)})`);
    } else if (stochK > stochD) {
      score += 0.15;
      parts.push(`Stochastic %K above %D`);
    } else {
      score -= 0.15;
      parts.push(`Stochastic %K below %D`);
    }
  }

  return { score: clamp(score, -1, 1), detail: parts.join('; ') || 'No momentum signals' };
}

/**
 * MACD signal.
 * @param {object} analysis
 * @returns {{score: number, detail: string}}
 */
function macdSignal(analysis) {
  let score = 0;
  const parts = [];

  // Crossover events carry the most weight
  if (analysis.crossovers.macd === 'bullishCrossover') {
    score += 0.8;
    parts.push('MACD bullish crossover');
  } else if (analysis.crossovers.macd === 'bearishCrossover') {
    score -= 0.8;
    parts.push('MACD bearish crossover');
  }

  // Histogram direction
  const hist = analysis.macd?.histogram;
  if (hist !== undefined && hist !== null) {
    if (hist > 0) {
      score += 0.3;
      parts.push(`MACD histogram positive (${hist.toFixed(4)})`);
    } else {
      score -= 0.3;
      parts.push(`MACD histogram negative (${hist.toFixed(4)})`);
    }
  }

  return { score: clamp(score, -1, 1), detail: parts.join('; ') || 'No MACD signals' };
}

/**
 * Pattern signal from detected chart patterns.
 * @param {Array} patterns - output of detectAllPatterns()
 * @returns {{score: number, detail: string}}
 */
function patternSignal(patterns) {
  if (!patterns || patterns.length === 0) {
    return { score: 0, detail: 'No chart patterns detected' };
  }

  // Use the most reliable pattern to set the direction, then blend in others
  let weightedScore = 0;
  let totalWeight = 0;
  const parts = [];

  for (const pat of patterns) {
    if (pat.type === 'supportResistance') continue; // levels are directionally neutral
    const weight = pat.reliability ?? 0.5;
    weightedScore += directionScore(pat.direction) * weight;
    totalWeight += weight;
    parts.push(`${pat.name} (${pat.direction}, reliability ${(pat.reliability * 100).toFixed(0)}%)`);
  }

  const score = totalWeight > 0 ? clamp(weightedScore / totalWeight, -1, 1) : 0;
  return { score, detail: parts.join('; ') || 'No directional patterns' };
}

/**
 * Volatility context from Bollinger Bands and ATR.
 * High volatility with price near band edges produces a mean-reversion signal.
 *
 * @param {object} analysis
 * @param {number} lastClose
 * @returns {{score: number, detail: string}}
 */
function volatilitySignal(analysis, lastClose) {
  let score = 0;
  const parts = [];

  const bb = analysis.bollingerBands;
  if (bb && bb.upper !== undefined && bb.lower !== undefined) {
    const range = bb.upper - bb.lower;
    if (range > 0) {
      const position = (lastClose - bb.lower) / range; // 0 = at lower, 1 = at upper
      if (position >= 0.95) {
        score -= 0.6;
        parts.push('Price at upper Bollinger Band — overbought');
      } else if (position <= 0.05) {
        score += 0.6;
        parts.push('Price at lower Bollinger Band — oversold');
      } else if (position > 0.5) {
        score += 0.15;
        parts.push('Price in upper half of Bollinger Band');
      } else {
        score -= 0.15;
        parts.push('Price in lower half of Bollinger Band');
      }
    }

    if (bb.bandwidth !== undefined) {
      if (bb.bandwidth < 0.03) {
        parts.push('Bollinger squeeze — low volatility, breakout expected');
      } else if (bb.bandwidth > 0.15) {
        parts.push('Wide Bollinger Bands — high volatility');
      }
    }
  }

  // ADX for trend strength context
  const adx = analysis.adx;
  if (adx && adx.adx !== undefined) {
    if (adx.adx > 25) {
      // Strong trend — reduce mean-reversion bias
      score *= 0.5;
      parts.push(`Strong trend (ADX ${adx.adx.toFixed(1)})`);
    } else {
      parts.push(`Weak/no trend (ADX ${adx.adx.toFixed(1)})`);
    }
  }

  return { score: clamp(score, -1, 1), detail: parts.join('; ') || 'No volatility signals' };
}

// ─── Trend Analysis ─────────────────────────────────────────────────────────

/**
 * Analyses short / medium / long-term trends based on SMA position.
 * @param {object} analysis
 * @param {number} lastClose
 * @returns {{shortTerm: object, mediumTerm: object, longTerm: object}}
 */
function analyzeTrends(analysis, lastClose) {
  const build = (smaValue, label) => {
    if (smaValue === null || lastClose === null) {
      return { direction: 'neutral', strength: 0 };
    }
    const diff = (lastClose - smaValue) / smaValue;
    const direction = diff > 0.005 ? 'bullish' : diff < -0.005 ? 'bearish' : 'neutral';
    const strength = clamp(Math.abs(diff) * 10, 0, 1); // 10 % diff → strength 1
    return { direction, strength: parseFloat(strength.toFixed(2)) };
  };

  return {
    shortTerm: build(analysis.sma.sma20, '20-day SMA'),
    mediumTerm: build(analysis.sma.sma50, '50-day SMA'),
    longTerm: build(analysis.sma.sma200, '200-day SMA'),
  };
}

// ─── Main Prediction ────────────────────────────────────────────────────────

/**
 * Generates a composite market prediction from technical indicators
 * and chart patterns.
 *
 * @param {Array<{time,open,high,low,close,volume}>} data - OHLCV bars.
 *   For full analysis (including 200-SMA), supply ≥ 220 bars.
 * @returns {{
 *   direction: 'bullish'|'bearish'|'neutral',
 *   confidence: number,
 *   signals: Array<{name: string, direction: string, weight: number, detail: string}>,
 *   summary: string,
 *   trendAnalysis: {shortTerm: object, mediumTerm: object, longTerm: object}
 * }}
 */
export function predict(data) {
  // ── Edge-case guard ───────────────────────────────────────────────────
  if (!Array.isArray(data) || data.length < 30) {
    return {
      direction: 'neutral',
      confidence: 0,
      signals: [],
      summary: 'Insufficient data for prediction (need at least 30 OHLCV bars).',
      trendAnalysis: {
        shortTerm: { direction: 'neutral', strength: 0 },
        mediumTerm: { direction: 'neutral', strength: 0 },
        longTerm: { direction: 'neutral', strength: 0 },
      },
    };
  }

  const lastClose = data[data.length - 1].close;
  const analysis = analyzeIndicators(data);
  const patterns = detectAllPatterns(data);

  // ── Compute each signal category ──────────────────────────────────────
  const trend = trendSignal(analysis, lastClose);
  const momentum = momentumSignal(analysis);
  const macd = macdSignal(analysis);
  const pattern = patternSignal(patterns);
  const volatility = volatilitySignal(analysis, lastClose);

  // ── Adaptive Quant Weighting based on ADX Regime ────────────────────
  const adxVal = analysis.adx?.adx ?? 0;
  let weights = {
    trend: 0.25,
    momentum: 0.20,
    macd: 0.20,
    pattern: 0.20,
    volatility: 0.15,
  };

  if (adxVal > 22) {
    // Strongly trending regime: Trend following indicators carry more weight
    weights.trend = 0.35;
    weights.macd = 0.25;
    weights.pattern = 0.20;
    weights.momentum = 0.15;
    weights.volatility = 0.05; // mean reversion carries very little weight
  } else {
    // Ranging / mean-reverting regime: Oscillators and BBs carry more weight
    weights.trend = 0.10;
    weights.macd = 0.10;
    weights.pattern = 0.20;
    weights.momentum = 0.30; // RSI/Stoch oscillator
    weights.volatility = 0.30; // Bollinger reversion
  }

  // ── Volume Flow Confirmation ──────────────────────────────────────────
  let volumeFactor = 1.0;
  if (data.length >= 20) {
    const recentBars = data.slice(-20);
    const avgVolume = recentBars.reduce((sum, bar) => sum + (bar.volume || 0), 0) / 20;
    const lastVolume = data[data.length - 1].volume || 0;
    if (lastVolume > avgVolume * 1.3) {
      volumeFactor = 1.25; // boost prediction confidence by 25% if breakout volume is detected
    } else if (lastVolume < avgVolume * 0.7) {
      volumeFactor = 0.85; // reduce confidence if volume is low and dry
    }
  }

  const weightedSum =
    trend.score * weights.trend +
    momentum.score * weights.momentum +
    macd.score * weights.macd +
    pattern.score * weights.pattern +
    volatility.score * weights.volatility;

  const direction = scoreToDirection(weightedSum);
  const rawConfidence = Math.abs(weightedSum);

  // Apply Volume Flow Confirmation factor to conviction
  const compositeConviction = rawConfidence * volumeFactor;

  // Scale the conviction to an actionable and confident user-facing gauge score
  let confidence = 0;
  if (compositeConviction > 0.45) {
    confidence = 0.85 + (compositeConviction - 0.45) * 0.25; // maps [0.45, 1.0] to [85%, 98%]
  } else if (compositeConviction > 0.15) {
    confidence = 0.50 + (compositeConviction - 0.15) * 1.16; // maps [0.15, 0.45] to [50%, 85%]
  } else {
    confidence = compositeConviction * 3.33; // maps [0, 0.15] to [0%, 50%]
  }
  confidence = parseFloat(clamp(confidence, 0.05, 0.98).toFixed(4));

  // ── Build signal list ─────────────────────────────────────────────────
  const signals = [
    {
      name: 'SMA / EMA Crossovers',
      direction: scoreToDirection(trend.score),
      score: trend.score,
      weight: weights.trend,
      detail: trend.detail,
    },
    {
      name: 'RSI & Stochastic',
      direction: scoreToDirection(momentum.score),
      score: momentum.score,
      weight: weights.momentum,
      detail: momentum.detail,
    },
    {
      name: 'MACD',
      direction: scoreToDirection(macd.score),
      score: macd.score,
      weight: weights.macd,
      detail: macd.detail,
    },
    {
      name: 'Chart Patterns',
      direction: scoreToDirection(pattern.score),
      score: pattern.score,
      weight: weights.pattern,
      detail: pattern.detail,
    },
    {
      name: 'Volatility (Bollinger / ATR)',
      direction: scoreToDirection(volatility.score),
      score: volatility.score,
      weight: weights.volatility,
      detail: volatility.detail,
    },
  ];

  // ── Trend Analysis ────────────────────────────────────────────────────
  const trendAnalysis = analyzeTrends(analysis, lastClose);

  // ── Human-readable summary ────────────────────────────────────────────
  const strength =
    confidence > 0.75
      ? 'strong'
      : confidence > 0.45
        ? 'moderate'
        : 'weak';

  const regimeNote =
    adxVal > 22
      ? ` Market is in a strong trend (Regime: Trending).`
      : ` Market is currently range-bound (Regime: Mean-Reverting).`;

  const volumeNote =
    volumeFactor > 1.1
      ? ' High volume breakout confirms signal conviction.'
      : volumeFactor < 0.9
        ? ' Warning: Low volume indicates weak participation.'
        : '';

  const crossoverNote =
    analysis.crossovers.sma50_200 === 'goldenCross'
      ? ' A Golden Cross (50/200 SMA) has occurred.'
      : analysis.crossovers.sma50_200 === 'deathCross'
        ? ' A Death Cross (50/200 SMA) has occurred.'
        : '';

  const patternNote =
    patterns.length > 0 && patterns[0].type !== 'supportResistance'
      ? ` ${patterns[0].name} pattern detected (${patterns[0].direction}).`
      : '';

  const rsiNote =
    analysis.rsi.condition === 'overbought'
      ? ` RSI is overbought at ${analysis.rsi.value?.toFixed(1)}.`
      : analysis.rsi.condition === 'oversold'
        ? ` RSI is oversold at ${analysis.rsi.value?.toFixed(1)}.`
        : '';

  const summary =
    `Overall outlook is ${direction} with ${strength} confidence (${(confidence * 100).toFixed(1)}%).` +
    regimeNote +
    volumeNote +
    crossoverNote +
    patternNote +
    rsiNote;

  return {
    direction,
    confidence,
    signals,
    summary,
    trendAnalysis,
  };
}

export default predict;
