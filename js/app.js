/**
 * Stock Market Trend Analyzer — Main Application
 * Orchestrates all modules: API, Chart, Indicators, Patterns, Predictor
 */

import { searchSymbols, fetchStockData, generateDemoData, filterByTimeframe, getStockMeta } from './api.js';
import { initChart, setChartData, setOverlay, setBollingerBands, removeOverlay, setSupportResistance, setPatternMarkers, drawSparkline, COLORS } from './chart.js';
import { SMA, EMA, RSI, MACD, BollingerBands, Stochastic, ADX, ATR, analyzeIndicators } from './indicators.js';
import { detectAllPatterns, detectSupportResistance } from './patterns.js';
import { predict } from './predictor.js';
import { getSentiment } from './sentiment.js';

/* ======================================
   STATE
   ====================================== */
export const state = {
  symbol: 'AAPL',
  symbolName: 'Apple Inc.',
  timeframe: '1Y',
  apiKey: localStorage.getItem('av_api_key') || '',
  demoMode: true,
  fullData: [],       // all data for symbol
  filteredData: [],   // timeframe-filtered
  overlays: {
    sma20: true,
    sma50: true,
    sma200: false,
    ema: false,
    bb: false,
    volume: true,
  },
  loading: false,
  prediction: null,
  indicators: null,
  patterns: [],
};

let realTimeInterval = null;

/* ======================================
   DOM REFERENCES
   ====================================== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {};

function cacheDom() {
  dom.chartContainer = $('#chart-container');
  dom.searchInput = $('#search-input');
  dom.searchDropdown = $('#search-dropdown');
  dom.timeframeBtns = $$('.timeframe-btn');
  dom.overlayToggles = $$('.overlay-toggle');
  dom.loadingOverlay = $('#chart-loading');

  // Status bar
  dom.symbolDisplay = $('#stock-symbol');
  dom.priceDisplay = $('#current-price');
  dom.priceChange = $('#price-change');
  dom.metaOpen = $('#meta-open');
  dom.metaHigh = $('#meta-high');
  dom.metaLow = $('#meta-low');
  dom.metaVolume = $('#meta-volume');

  // Prediction
  dom.predictionCard = $('#prediction-card');
  dom.predictionDirection = $('#prediction-direction');
  dom.predictionArrow = $('#prediction-arrow');
  dom.gaugeFill = $('#gauge-fill');
  dom.confidenceValue = $('#confidence-value');
  dom.predictionSummary = $('#prediction-summary');
  dom.signalList = $('#signal-list');
  dom.signalCount = $('#signal-count');

  // Indicators
  dom.indicatorsGrid = $('#indicators-grid');

  // Patterns
  dom.patternsGrid = $('#patterns-grid');

  // Trend table
  dom.trendBody = $('#trend-body');

  // Modal
  dom.modalOverlay = $('#api-modal');
  dom.apiKeyInput = $('#api-key-input');

  // Toast
  dom.toastContainer = $('#toast-container');
}

/* ======================================
   INITIALIZATION
   ====================================== */
export async function init() {
  cacheDom();
  initChart(dom.chartContainer);
  setupEventListeners();
  updateOverlayButtons();

  // Check for API key
  if (!state.apiKey) {
    state.demoMode = true;
  }

  await loadStock(state.symbol);
}

/* ======================================
   EVENT LISTENERS
   ====================================== */
function setupEventListeners() {
  // Search
  dom.searchInput.addEventListener('input', handleSearch);
  dom.searchInput.addEventListener('focus', () => {
    if (dom.searchInput.value.length > 0) handleSearch();
  });
  dom.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = dom.searchInput.value.trim().toUpperCase();
      if (val) {
        selectSymbol(val, val);
        closeSearchDropdown();
      }
    }
    if (e.key === 'Escape') closeSearchDropdown();
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      closeSearchDropdown();
    }
  });

  // Timeframe buttons
  dom.timeframeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      state.timeframe = btn.dataset.timeframe;
      dom.timeframeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyTimeframe();
    });
  });

  // Overlay toggles
  dom.overlayToggles.forEach(btn => {
    btn.addEventListener('click', () => {
      const overlay = btn.dataset.overlay;
      state.overlays[overlay] = !state.overlays[overlay];
      btn.classList.toggle('active', state.overlays[overlay]);
      updateOverlays();
    });
  });

  // Modal
  $('#btn-api-key').addEventListener('click', () => openModal());
  $('#modal-save').addEventListener('click', saveApiKey);
  $('#modal-demo').addEventListener('click', () => {
    state.demoMode = true;
    closeModal();
    loadStock(state.symbol);
  });
  $('#modal-close')?.addEventListener('click', closeModal);

  dom.modalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.modalOverlay) closeModal();
  });
}

/* ======================================
   SEARCH
   ====================================== */
function handleSearch() {
  const query = dom.searchInput.value.trim();
  const results = searchSymbols(query);

  if (results.length === 0 || query.length === 0) {
    closeSearchDropdown();
    return;
  }

  dom.searchDropdown.innerHTML = results.map(r => `
    <div class="search-result" data-symbol="${r.symbol}" data-name="${r.name}">
      <span class="symbol">${r.symbol}</span>
      <span class="name">${r.name}</span>
    </div>
  `).join('');

  dom.searchDropdown.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => {
      selectSymbol(el.dataset.symbol, el.dataset.name);
      closeSearchDropdown();
    });
  });

  dom.searchDropdown.classList.add('active');
}

function closeSearchDropdown() {
  dom.searchDropdown.classList.remove('active');
}

async function selectSymbol(symbol, name) {
  state.symbol = symbol;
  state.symbolName = name || symbol;
  dom.searchInput.value = '';
  await loadStock(symbol);
}

/* ======================================
   DATA LOADING
   ====================================== */
export async function loadStock(symbol) {
  if (state.loading) return;
  state.loading = true;
  showLoading(true);

  try {
    let data;

    if (state.demoMode) {
      data = generateDemoData(symbol, 500);
      showToast(`Demo data loaded for ${symbol}`, 'info');
    } else {
      try {
        data = await fetchStockData(symbol, state.apiKey, 'full');
        showToast(`Live data loaded for ${symbol}`, 'success');
      } catch (err) {
        showToast(`API Error: ${err.message}. Using demo data.`, 'error');
        data = generateDemoData(symbol, 500);
        state.demoMode = true;
      }
    }

    state.fullData = data;
    applyTimeframe();

    // Start real-time ticking simulation!
    startRealTimeSimulation();

  } catch (err) {
    showToast(`Error loading data: ${err.message}`, 'error');
    console.error(err);
  } finally {
    state.loading = false;
    showLoading(false);
  }
}

function applyTimeframe() {
  state.filteredData = filterByTimeframe(state.fullData, state.timeframe);
  if (state.filteredData.length === 0 && state.fullData.length > 0) {
    state.filteredData = state.fullData;
  }

  updateChart(true); // Fit content when timeframe changes
  updateStatusBar();
  runAnalysis();
}

/* ======================================
   CHART UPDATE
   ====================================== */
function updateChart(fit = false) {
  setChartData(state.filteredData, fit);
  updateOverlays();
}

function updateOverlays() {
  const data = state.filteredData;
  if (!data || data.length === 0) return;

  // SMA 20
  if (state.overlays.sma20) {
    const sma20 = SMA(data, 20);
    setOverlay('sma20', sma20.values || sma20, COLORS.sma20);
  } else {
    removeOverlay('sma20');
  }

  // SMA 50
  if (state.overlays.sma50) {
    const sma50 = SMA(data, 50);
    setOverlay('sma50', sma50.values || sma50, COLORS.sma50);
  } else {
    removeOverlay('sma50');
  }

  // SMA 200
  if (state.overlays.sma200) {
    const sma200 = SMA(data, 200);
    setOverlay('sma200', sma200.values || sma200, COLORS.sma200);
  } else {
    removeOverlay('sma200');
  }

  // EMA 12/26
  if (state.overlays.ema) {
    const ema12 = EMA(data, 12);
    const ema26 = EMA(data, 26);
    setOverlay('ema12', ema12.values || ema12, COLORS.ema12);
    setOverlay('ema26', ema26.values || ema26, COLORS.ema26);
  } else {
    removeOverlay('ema12');
    removeOverlay('ema26');
  }

  // Bollinger Bands
  if (state.overlays.bb) {
    const bb = BollingerBands(data, 20, 2);
    setBollingerBands(bb.values || bb);
  } else {
    removeOverlay('bb');
  }
}

function updateOverlayButtons() {
  dom.overlayToggles.forEach(btn => {
    const overlay = btn.dataset.overlay;
    btn.classList.toggle('active', state.overlays[overlay]);
  });
}

/* ======================================
   STATUS BAR
   ====================================== */
function updateStatusBar() {
  const meta = getStockMeta(state.filteredData);
  if (!meta) return;

  dom.symbolDisplay.textContent = state.symbol;
  dom.priceDisplay.textContent = `₹${meta.price.toFixed(2)}`;

  const changeSign = meta.change >= 0 ? '+' : '';
  dom.priceChange.textContent = `${changeSign}${meta.change.toFixed(2)} (${changeSign}${meta.changePercent.toFixed(2)}%)`;
  dom.priceChange.className = `price-change ${meta.change >= 0 ? 'positive' : 'negative'}`;

  dom.metaOpen.textContent = `₹${meta.open.toFixed(2)}`;
  dom.metaHigh.textContent = `₹${meta.periodHigh.toFixed(2)}`;
  dom.metaLow.textContent = `₹${meta.periodLow.toFixed(2)}`;
  dom.metaVolume.textContent = formatVolume(meta.avgVolume);
}

/* ======================================
   ANALYSIS
   ====================================== */
function runAnalysis() {
  const data = state.filteredData;
  if (!data || data.length < 30) {
    showToast('Insufficient data for analysis (need at least 30 data points)', 'error');
    return;
  }

  // Run indicators (raw results for sparklines)
  const rawIndicators = analyzeIndicators(data);
  
  // Also compute raw value arrays for sparklines
  const rsiRaw = RSI(data, 14);
  const macdRaw = MACD(data, 12, 26, 9);
  const stochRaw = Stochastic(data, 14, 3);
  const adxRaw = ADX(data, 14);
  const sma20Raw = SMA(data, 20);
  const sma50Raw = SMA(data, 50);
  const sma200Raw = SMA(data, 200);
  
  // Build enriched indicators object for UI
  state.indicators = {
    rsi: {
      latest: rawIndicators.rsi?.value,
      signal: rawIndicators.rsi?.signal || 'neutral',
      detail: rawIndicators.rsi?.condition === 'overbought' ? `Overbought territory (>${70})` :
              rawIndicators.rsi?.condition === 'oversold' ? `Oversold territory (<${30})` :
              `Neutral zone (${rawIndicators.rsi?.value?.toFixed(1) || '—'})`,
      values: rsiRaw.values || [],
    },
    macd: {
      latest: rawIndicators.macd || {},
      signal: rawIndicators.macd?.signal || 'neutral',
      detail: rawIndicators.crossovers?.macd === 'bullishCrossover' ? 'Bullish signal crossover' :
              rawIndicators.crossovers?.macd === 'bearishCrossover' ? 'Bearish signal crossover' :
              rawIndicators.macd?.histogram > 0 ? 'Histogram positive' : 'Histogram negative',
      values: macdRaw.values || [],
    },
    stochastic: {
      latest: rawIndicators.stochastic || {},
      signal: rawIndicators.stochastic?.signal || 'neutral',
      detail: rawIndicators.stochastic?.k > 80 ? 'Overbought zone' :
              rawIndicators.stochastic?.k < 20 ? 'Oversold zone' :
              `%K: ${rawIndicators.stochastic?.k?.toFixed(1) || '—'}`,
      values: stochRaw.values || [],
    },
    adx: {
      latest: rawIndicators.adx || {},
      signal: rawIndicators.adx?.signal || 'neutral',
      detail: rawIndicators.adx?.adx > 40 ? 'Very strong trend' :
              rawIndicators.adx?.adx > 25 ? 'Moderate trend strength' :
              'Weak or no trend',
      values: adxRaw.values || [],
    },
    sma20: { latest: rawIndicators.sma?.sma20 },
    sma50: { latest: rawIndicators.sma?.sma50 },
    sma200: { latest: rawIndicators.sma?.sma200 },
  };

  // Run pattern detection
  state.patterns = detectAllPatterns(data);

  // Run prediction
  state.prediction = predict(data);

  // Update UI
  updatePredictionCard();
  updateSignals();
  updateIndicatorCards();
  updatePatternCards();
  updateTrendTable();
  updateNewsSentiment(state.symbol);

  // Add S/R to chart
  const srLevels = detectSupportResistance(data, 3);
  setSupportResistance(srLevels);

  // Add pattern markers
  setPatternMarkers(state.patterns);

  // Update Risk Badge
  const riskBadge = document.getElementById('risk-badge');
  if (riskBadge && state.prediction) {
    const score = Math.abs(state.prediction.confidence);
    if (score > 60) {
      riskBadge.textContent = 'High Risk';
      riskBadge.style.background = 'var(--accent-magenta-dim)';
      riskBadge.style.color = 'var(--accent-magenta)';
    } else if (score > 30) {
      riskBadge.textContent = 'Moderate Risk';
      riskBadge.style.background = 'var(--accent-amber-dim)';
      riskBadge.style.color = 'var(--accent-amber)';
    } else {
      riskBadge.textContent = 'Low Risk';
      riskBadge.style.background = 'var(--accent-green-dim)';
      riskBadge.style.color = 'var(--accent-green)';
    }
  }

  // Dispatch custom event when analysis is complete
  document.dispatchEvent(new CustomEvent('smai:analysis', {
    detail: {
      symbol: state.symbol,
      prediction: state.prediction,
      indicators: state.indicators,
      price: state.filteredData[state.filteredData.length - 1]?.close || 0
    }
  }));
}

/* ======================================
   PREDICTION UI
   ====================================== */
function updatePredictionCard() {
  const pred = state.prediction;
  if (!pred) return;

  // Update card class
  dom.predictionCard.className = `prediction-card ${pred.direction}`;

  // Direction text
  const directionText = {
    bullish: '▲ BULLISH',
    bearish: '▼ BEARISH',
    neutral: '─ NEUTRAL',
  };
  dom.predictionDirection.textContent = directionText[pred.direction] || '─ NEUTRAL';

  // Arrow
  const arrows = { bullish: '↑', bearish: '↓', neutral: '→' };
  dom.predictionArrow.textContent = arrows[pred.direction] || '→';

  // Confidence gauge
  const pct = Math.round(pred.confidence * 100);
  dom.gaugeFill.style.width = `${pct}%`;
  dom.confidenceValue.textContent = `${pct}%`;

  // Summary
  dom.predictionSummary.textContent = pred.summary || '';
}

function updateSignals() {
  const pred = state.prediction;
  if (!pred || !pred.signals) return;

  dom.signalCount.textContent = `${pred.signals.length} signals`;

  dom.signalList.innerHTML = pred.signals.map(sig => {
    const score = typeof sig.score === 'number' ? sig.score : (sig.direction === 'bullish' ? 0.6 : sig.direction === 'bearish' ? -0.6 : 0);
    const absScore = Math.abs(score);
    const barWidth = Math.min(50, Math.max(5, absScore * 50)); // 0-50% each side
    const barClass = sig.direction === 'bullish' ? 'bullish' : sig.direction === 'bearish' ? 'bearish' : 'neutral';

    return `
      <div class="signal-item">
        <div class="signal-row-top">
          <div class="signal-name">${sig.name}</div>
          <div class="signal-badge ${barClass}">${sig.direction.toUpperCase()}</div>
        </div>
        <div class="signal-row-bottom">
          <div class="signal-detail" title="${sig.detail || ''}">${sig.detail || 'Neutral indicators'}</div>
          <div class="signal-bar">
            <div class="signal-bar-fill ${barClass}" style="width: ${barWidth}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/* ======================================
   INDICATOR CARDS
   ====================================== */
function updateIndicatorCards() {
  const ind = state.indicators;
  if (!ind) return;

  const data = state.filteredData;

  const cards = [
    {
      name: 'RSI (14)',
      value: ind.rsi?.latest?.toFixed(1) || '—',
      signal: ind.rsi?.signal || 'neutral',
      detail: ind.rsi?.detail || '',
      sparkData: ind.rsi?.values?.map(v => v.value) || [],
      color: ind.rsi?.signal === 'bullish' ? '#00e676' : ind.rsi?.signal === 'bearish' ? '#ff3366' : '#ffaa00',
    },
    {
      name: 'MACD',
      value: ind.macd?.latest?.macd?.toFixed(2) || '—',
      signal: ind.macd?.signal || 'neutral',
      detail: ind.macd?.detail || '',
      sparkData: ind.macd?.values?.map(v => v.histogram) || [],
      color: '#a855f7',
    },
    {
      name: 'STOCH (%K)',
      value: ind.stochastic?.latest?.k?.toFixed(1) || '—',
      signal: ind.stochastic?.signal || 'neutral',
      detail: ind.stochastic?.detail || '',
      sparkData: ind.stochastic?.values?.map(v => v.k) || [],
      color: '#00d4ff',
    },
    {
      name: 'ADX (14)',
      value: ind.adx?.latest?.adx?.toFixed(1) || '—',
      signal: ind.adx?.signal || 'neutral',
      detail: ind.adx?.detail || '',
      sparkData: ind.adx?.values?.map(v => v.adx) || [],
      color: '#ffaa00',
    },
  ];

  dom.indicatorsGrid.innerHTML = cards.map((card, i) => `
    <div class="indicator-card" style="animation-delay: ${0.4 + i * 0.08}s">
      <div class="indicator-header">
        <span class="indicator-name">${card.name}</span>
        <span class="indicator-signal ${card.signal}">${card.signal.toUpperCase()}</span>
      </div>
      <div class="indicator-value">${card.value}</div>
      <div class="indicator-detail">${card.detail}</div>
      <div class="indicator-sparkline">
        <canvas data-spark-index="${i}"></canvas>
      </div>
    </div>
  `).join('');

  // Draw sparklines after DOM update
  requestAnimationFrame(() => {
    cards.forEach((card, i) => {
      const canvas = document.querySelector(`canvas[data-spark-index="${i}"]`);
      if (canvas && card.sparkData.length > 0) {
        const tail = card.sparkData.slice(-60); // last 60 points
        drawSparkline(canvas, tail, card.color);
      }
    });
  });
}

/* ======================================
   PATTERN CARDS
   ====================================== */
function updatePatternCards() {
  const patterns = state.patterns;

  if (!patterns || patterns.length === 0) {
    dom.patternsGrid.innerHTML = `
      <div class="no-patterns">
        <div class="icon">🔍</div>
        <p>No significant chart patterns detected in current timeframe</p>
      </div>
    `;
    return;
  }

  dom.patternsGrid.innerHTML = patterns.filter(p => p.type !== 'supportResistance').map(p => {
    const reliabilityDots = Array.from({ length: 5 }, (_, i) =>
      `<span class="reliability-dot ${i < Math.round(p.reliability * 5) ? 'filled' : ''}"></span>`
    ).join('');

    const typeClass = p.patternType || p.type;
    const dirLabel = p.direction === 'bullish' ? '▲ Bullish' : p.direction === 'bearish' ? '▼ Bearish' : '─ Neutral';

    return `
      <div class="pattern-card">
        <div class="pattern-header">
          <span class="pattern-name">${p.name}</span>
          <span class="pattern-type ${typeClass}">${p.patternType || p.type}</span>
        </div>
        <div class="pattern-description">${p.description}</div>
        <div class="pattern-meta">
          <div class="pattern-reliability">
            <span>Reliability</span>
            <div class="reliability-dots">${reliabilityDots}</div>
          </div>
          <span class="pattern-direction-badge ${p.direction}">${dirLabel}</span>
        </div>
      </div>
    `;
  }).join('');
}

/* ======================================
   TREND TABLE
   ====================================== */
function updateTrendTable() {
  const pred = state.prediction;
  const ind = state.indicators;
  if (!pred || !ind) return;

  const ta = pred.trendAnalysis || {};

  const rows = [
    {
      label: 'Short-term Trend (20-day)',
      direction: ta.shortTerm?.direction || 'neutral',
      strength: ta.shortTerm?.strength || 'weak',
      indicator: `SMA(20) = ${ind.sma20?.latest?.toFixed(2) || '—'}`,
    },
    {
      label: 'Medium-term Trend (50-day)',
      direction: ta.mediumTerm?.direction || 'neutral',
      strength: ta.mediumTerm?.strength || 'weak',
      indicator: `SMA(50) = ${ind.sma50?.latest?.toFixed(2) || '—'}`,
    },
    {
      label: 'Long-term Trend (200-day)',
      direction: ta.longTerm?.direction || 'neutral',
      strength: ta.longTerm?.strength || 'weak',
      indicator: `SMA(200) = ${ind.sma200?.latest?.toFixed(2) || '—'}`,
    },
    {
      label: 'Momentum (RSI)',
      direction: ind.rsi?.signal || 'neutral',
      strength: ind.rsi?.latest > 70 || ind.rsi?.latest < 30 ? 'strong' : 'moderate',
      indicator: `RSI(14) = ${ind.rsi?.latest?.toFixed(1) || '—'}`,
    },
    {
      label: 'MACD Signal',
      direction: ind.macd?.signal || 'neutral',
      strength: Math.abs(ind.macd?.latest?.histogram || 0) > 1 ? 'strong' : 'moderate',
      indicator: `MACD = ${ind.macd?.latest?.macd?.toFixed(2) || '—'}`,
    },
    {
      label: 'Trend Strength (ADX)',
      direction: ind.adx?.latest?.adx > 25 ? (ind.adx?.latest?.plusDI > ind.adx?.latest?.minusDI ? 'bullish' : 'bearish') : 'neutral',
      strength: ind.adx?.latest?.adx > 40 ? 'strong' : ind.adx?.latest?.adx > 25 ? 'moderate' : 'weak',
      indicator: `ADX(14) = ${ind.adx?.latest?.adx?.toFixed(1) || '—'}`,
    },
  ];

  dom.trendBody.innerHTML = rows.map(r => `
    <tr>
      <td class="label">${r.label}</td>
      <td><span class="trend-badge ${r.direction}">${r.direction === 'bullish' ? '▲' : r.direction === 'bearish' ? '▼' : '─'} ${r.direction}</span></td>
      <td class="value">${r.strength}</td>
      <td class="value">${r.indicator}</td>
    </tr>
  `).join('');
}

/* ======================================
   MODAL
   ====================================== */
function openModal() {
  dom.modalOverlay.classList.add('active');
  dom.apiKeyInput.value = state.apiKey;
  const geminiInput = document.getElementById('gemini-key-input');
  if (geminiInput) {
    geminiInput.value = localStorage.getItem('gemini_api_key') || '';
  }
  dom.apiKeyInput.focus();
}

function closeModal() {
  dom.modalOverlay.classList.remove('active');
}

function saveApiKey() {
  const key = dom.apiKeyInput.value.trim();
  const geminiInput = document.getElementById('gemini-key-input');
  const geminiKey = geminiInput ? geminiInput.value.trim() : '';

  state.apiKey = key;
  if (key) {
    state.demoMode = false;
    localStorage.setItem('av_api_key', key);
  } else {
    state.demoMode = true;
    localStorage.removeItem('av_api_key');
  }

  if (geminiKey) {
    localStorage.setItem('gemini_api_key', geminiKey);
  } else {
    localStorage.removeItem('gemini_api_key');
  }

  closeModal();
  showToast('Settings saved successfully!', 'success');
  loadStock(state.symbol);
}

/* ======================================
   LOADING
   ====================================== */
function showLoading(show) {
  dom.loadingOverlay?.classList.toggle('active', show);
}

/* ======================================
   TOAST
   ====================================== */
export function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${message}`;

  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* ======================================
   UTILITIES
   ====================================== */
function formatVolume(vol) {
  if (vol >= 1e9) return (vol / 1e9).toFixed(1) + 'B';
  if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
  if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
  return vol.toString();
}

/**
 * Updates the News Sentiment panel on the stock analyzer page
 */
function updateNewsSentiment(symbol) {
  const sentimentOverallBadge = document.getElementById('sentiment-overall-badge');
  const sentimentBarPos = document.getElementById('sentiment-bar-pos');
  const sentimentBarNeu = document.getElementById('sentiment-bar-neu');
  const sentimentBarNeg = document.getElementById('sentiment-bar-neg');
  const sentimentPercentPos = document.getElementById('sentiment-percent-pos');
  const sentimentPercentNeu = document.getElementById('sentiment-percent-neu');
  const sentimentPercentNeg = document.getElementById('sentiment-percent-neg');
  const sentimentSummaryText = document.getElementById('sentiment-summary-text');
  const newsListContainer = document.getElementById('news-list-container');

  if (!sentimentSummaryText) return; // Not on the analyzer page

  const data = getSentiment(symbol);
  
  // Update badge
  if (sentimentOverallBadge) {
    const scoreVal = Math.round(((data.score + 1) / 2) * 100);
    const dirText = data.direction === 'positive' ? 'Bullish' :
                    data.direction === 'negative' ? 'Bearish' : 'Neutral';
    sentimentOverallBadge.textContent = `${scoreVal}% ${dirText}`;
    
    // style badge
    if (data.direction === 'positive') {
      sentimentOverallBadge.style.background = 'var(--accent-green-dim)';
      sentimentOverallBadge.style.color = 'var(--accent-green)';
    } else if (data.direction === 'negative') {
      sentimentOverallBadge.style.background = 'var(--accent-magenta-dim)';
      sentimentOverallBadge.style.color = 'var(--accent-magenta)';
    } else {
      sentimentOverallBadge.style.background = 'var(--accent-amber-dim)';
      sentimentOverallBadge.style.color = 'var(--accent-amber)';
    }
  }

  // Update bars
  if (sentimentBarPos) sentimentBarPos.style.width = `${data.sentiment.positive}%`;
  if (sentimentBarNeu) sentimentBarNeu.style.width = `${data.sentiment.neutral}%`;
  if (sentimentBarNeg) sentimentBarNeg.style.width = `${data.sentiment.negative}%`;

  // Update text percentages
  if (sentimentPercentPos) sentimentPercentPos.textContent = data.sentiment.positive;
  if (sentimentPercentNeu) sentimentPercentNeu.textContent = data.sentiment.neutral;
  if (sentimentPercentNeg) sentimentPercentNeg.textContent = data.sentiment.negative;

  // Update AI Summary
  if (sentimentSummaryText) {
    sentimentSummaryText.textContent = data.summary;
  }

  // Render news list
  if (newsListContainer) {
    if (data.articles.length === 0) {
      newsListContainer.innerHTML = '<div style="font-size: var(--fs-xs); color: var(--text-muted); padding: var(--sp-4); text-align: center;">No news articles available.</div>';
    } else {
      newsListContainer.innerHTML = data.articles.map(art => {
        const artColor = art.sentiment === 'positive' ? 'var(--accent-green)' :
                         art.sentiment === 'negative' ? 'var(--accent-magenta)' : 'var(--accent-amber)';
        return `
          <div class="news-item" style="border-bottom: 1px solid var(--glass-border); padding: var(--sp-3) 0; display: flex; flex-direction: column; gap: var(--sp-1);">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: var(--fs-xs);">
              <span style="color: var(--text-muted); font-weight: 500;">${art.source} • ${art.age}</span>
              <span style="color: ${artColor}; font-weight: 600; font-size: 10px; background: rgba(255,255,255,0.02); padding: 1px 4px; border-radius: 4px;">
                ${art.sentiment.toUpperCase()}
              </span>
            </div>
            <a href="${art.url || '#'}" target="_blank" rel="noopener" style="font-size: var(--fs-sm); font-weight: 500; color: var(--text-primary); text-decoration: none; line-height: 1.4; transition: color 0.2s;" onmouseover="this.style.color='var(--accent-cyan)'" onmouseout="this.style.color='var(--text-primary)'">
              ${art.title}
            </a>
          </div>
        `;
      }).join('');
    }
  }
}

/**
 * Simulates real-time stock price fluctuations in background loops
 */
function startRealTimeSimulation() {
  if (realTimeInterval) clearInterval(realTimeInterval);
  
  realTimeInterval = setInterval(() => {
    if (state.loading || !state.fullData || state.fullData.length === 0) return;
    
    const latestIndex = state.fullData.length - 1;
    const latestBar = state.fullData[latestIndex];
    
    // Vary closing price +/- 0.15% random walk
    const changePercent = (Math.random() - 0.5) * 0.003;
    latestBar.close = parseFloat((latestBar.close * (1 + changePercent)).toFixed(2));
    
    if (latestBar.close > latestBar.high) latestBar.high = latestBar.close;
    if (latestBar.close < latestBar.low) latestBar.low = latestBar.close;
    
    const filteredLatestIndex = state.filteredData.length - 1;
    if (filteredLatestIndex >= 0) {
      state.filteredData[filteredLatestIndex] = latestBar;
    }
    
    // Re-render chart, status bars, and execute technical analysis & alert checks
    updateChart();
    updateStatusBar();
    runAnalysis();
  }, 4000); // 4-second interval for real-time responsiveness
}

/* ======================================
   BOOT
   ====================================== */
document.addEventListener('DOMContentLoaded', init);
