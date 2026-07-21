/**
 * Stock Market Trend Analyzer — Main Application
 * Orchestrates all modules: API, Chart, Indicators, Patterns, Predictor
 */

import { searchSymbols, isValidSymbol, fetchStockData, fetchLivePrice, warmLivePrices, generateDemoData, filterByTimeframe, getStockMeta } from './api.js?v=20260712_rev4';
import { initChart, setChartData, setOverlay, setBollingerBands, removeOverlay, setSupportResistance, setPatternMarkers, drawSparkline, COLORS } from './chart.js?v=20260712_rev4';
import { SMA, EMA, RSI, MACD, BollingerBands, Stochastic, ADX, ATR, analyzeIndicators } from './indicators.js?v=20260712_rev4';
import { detectAllPatterns, detectSupportResistance } from './patterns.js?v=20260712_rev4';
import { predict } from './predictor.js?v=20260712_rev4';
import { getSentiment } from './sentiment.js?v=20260712_rev4';
import { computeAllForecastData, computeForecastChartData, getCurrency } from './ai-forecast.js?v=20260712_rev5';

/* ======================================
   STATE
   ====================================== */
export const state = {
  symbol: localStorage.getItem('smai_last_symbol') || 'AAPL',
  symbolName: localStorage.getItem('smai_last_symbol_name') || 'Apple Inc.',
  timeframe: '1Y',
  apiKey: localStorage.getItem('fh_api_key') || 'd99lb7hr01qssj13qt4gd99lb7hr01qssj13qt50',
  demoMode: false,
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

// AI Forecast Dashboard state
let forecastChartInstance = null;
let forecastChartSeries = {};
let currentForecastDays = 30;

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
  dom.predictionTimeframes = $('#prediction-timeframes');

  // New Redesigned Indicators
  dom.rsiVal = $('#rsi-val');
  dom.rsiStatus = $('#rsi-status');
  dom.rsiBar = $('#rsi-bar');
  dom.macdVal = $('#macd-val');
  dom.macdStatus = $('#macd-status');
  dom.macdBar = $('#macd-bar');
  dom.adxVal = $('#adx-val');
  dom.adxStatus = $('#adx-status');
  dom.adxBar = $('#adx-bar');

  // Patterns
  dom.patternsGrid = $('#patterns-grid');
  dom.patternsCount = $('#patterns-count');

  // News Timeline
  dom.newsTimelineContainer = $('#news-timeline-container');

  // Trend table
  dom.trendBody = $('#trend-body');

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

  // Clear any stale sessionStorage price cache (may contain old INR-converted values)
  try {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('smai_price_'))
      .forEach(k => sessionStorage.removeItem(k));
  } catch (_) {}

  await loadStock(state.symbol);

  // Warm live prices for common symbols in the background.
  // Delayed 3s so it doesn't compete with the initial loadStock network call.
  setTimeout(() => {
    const TOP_SYMBOLS = ['AAPL', 'TSLA', 'RELIANCE.NS', 'INFY.NS', 'NVDA'];
    warmLivePrices(TOP_SYMBOLS).catch(() => {});
  }, 3000);
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

  // Execute Trade simulation button click

  // Execute Trade simulation button click
  const execTradeBtn = document.getElementById('btn-execute-trade');
  if (execTradeBtn) {
    execTradeBtn.addEventListener('click', () => {
      const currentPrice = state.filteredData[state.filteredData.length - 1]?.close || 0;
      showToast(`Simulated trade executed for ${state.symbol} at $${currentPrice.toFixed(2)}!`, 'success');
    });
  }

  // Tab switching behavior via URL hash
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.textContent.trim().toLowerCase();
      let tabId = 'overview';
      if (text === 'overview') tabId = 'overview';
      else if (text === 'technical analysis') tabId = 'technical';
      else if (text === 'financials') tabId = 'financials';
      else if (text === 'news') tabId = 'news';
      else if (text === 'ai forecast') tabId = 'ai-forecast';

      window.location.hash = tabId;
    });
  });

  // Listen for hash change to switch tabs dynamically
  window.addEventListener('hashchange', handleHashTabSwitch);
  // Trigger on initial load
  handleHashTabSwitch();
}

/* ======================================
   SEARCH
   ====================================== */
function handleSearch() {
  const query = dom.searchInput.value.trim();
  
  if (query.length === 0) {
    closeSearchDropdown();
    return;
  }

  const results = searchSymbols(query);

  if (results.length === 0) {
    dom.searchDropdown.innerHTML = `
      <div class="search-result empty" style="pointer-events: none; opacity: 0.8; padding: var(--sp-3) var(--sp-4); display: flex; align-items: center; gap: var(--sp-2);">
        <span class="symbol" style="color: var(--accent-amber);">⚠️</span>
        <span class="name" style="color: var(--text-secondary); font-size: var(--fs-xs);">Stock not found</span>
      </div>
    `;
    dom.searchDropdown.classList.add('active');
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
  state.symbolName = name || symbol;
  localStorage.setItem('smai_last_symbol_name', state.symbolName);
  dom.searchInput.value = '';
  await loadStock(symbol);
}

/* ======================================
   DATA LOADING
   ====================================== */
export async function loadStock(symbol) {
  if (state.loading) return;

  // Always sync state.symbol first so that every subsequent render
  // (status bar, real-time interval, etc.) uses the correct ticker.
  state.symbol = symbol;

  // Persist so the next page load restores this stock, not AAPL.
  localStorage.setItem('smai_last_symbol', symbol);

  // Update the symbol display immediately — don't wait for the async fetch.
  // This kills the flicker where the old/AAPL ticker shows during loading.
  if (dom.symbolDisplay) dom.symbolDisplay.textContent = symbol;

  // Notify other modules (e.g. watchlist) that the active symbol changed
  // so they can update their highlighted "tab" without a full re-render.
  document.dispatchEvent(new CustomEvent('smai:symbolChange', { detail: { symbol } }));
  state.loading = true;
  showLoading(true);

  try {
    console.log(`[Data Flow] 1. Loading Stock Symbol: ${symbol}`);
    const data = await fetchStockData(symbol, state.apiKey, 'full');
    
    console.log(`[Data Flow] 2. Historical API Price Data (First 5):`, data.slice(0, 5));
    showToast(`Live data loaded for ${symbol}`, 'success');

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

  console.log(`[Data Flow] 3. Filtered Data for Timeframe (${state.timeframe}):`, state.filteredData.slice(-3));

  updateChart(true); // Fit content when timeframe changes
  updateStatusBar();
  runAnalysis();
}

/* ======================================
   CHART UPDATE
   ====================================== */
function updateChart(fit = false) {
  if (state.filteredData && state.filteredData.length > 0) {
    console.log(`[Data Flow] 4. Chart Input Data Sample (First):`, state.filteredData[0]);
    console.log(`[Data Flow] 5. Chart Input Data Sample (Last):`, state.filteredData.at(-1));
  }
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

  const isIndian = state.symbol.toUpperCase().endsWith('.NS');
  const curr = getCurrency(state.symbol);

  if (dom.symbolDisplay) dom.symbolDisplay.textContent = state.symbol;
  if (dom.priceDisplay) dom.priceDisplay.textContent = `${curr}${meta.price.toFixed(2)}`;

  const changeSign = meta.change >= 0 ? '+' : '';
  if (dom.priceChange) {
    dom.priceChange.textContent = `${changeSign}${meta.change.toFixed(2)} (${changeSign}${meta.changePercent.toFixed(2)}%)`;
    dom.priceChange.className = `stock-price-chg ${meta.change >= 0 ? 'positive' : 'negative'}`;
  }

  if (dom.metaOpen) dom.metaOpen.textContent = `${curr}${meta.open.toFixed(2)}`;
  if (dom.metaHigh) dom.metaHigh.textContent = `${curr}${meta.periodHigh.toFixed(2)}`;
  if (dom.metaLow)  dom.metaLow.textContent  = `${curr}${meta.periodLow.toFixed(2)}`;
  if (dom.metaVolume) dom.metaVolume.textContent = formatVolume(meta.avgVolume);

  // Set stock details
  const logo = document.getElementById('stock-logo-char');
  if (logo) logo.textContent = state.symbol[0];

  const full = document.getElementById('stock-name-full');
  if (full) full.textContent = state.symbolName || state.symbol;

  const exch = document.getElementById('stock-exchange-tag');
  if (exch) exch.textContent = state.symbol.endsWith('.NS') ? 'NSE' : 'NASDAQ';

  // Mock Caps & P/E for high-fidelity
  const cap = document.getElementById('stock-market-cap');
  const pe = document.getElementById('stock-pe-ratio');
  if (cap) {
    const caps = { 'AAPL': '$2.89T', 'TSLA': '$760.4B', 'MSFT': '$3.15T', 'NVDA': '$1.82T' };
    cap.textContent = caps[state.symbol] || '$45.2B';
  }
  if (pe) {
    const pes = { 'AAPL': '28.4', 'TSLA': '68.2', 'MSFT': '34.8', 'NVDA': '95.4' };
    pe.textContent = pes[state.symbol] || '18.2';
  }

  // AI Price bounds
  const lowBound = document.getElementById('proj-range-low');
  const highBound = document.getElementById('proj-range-high');
  if (lowBound && highBound) {
    lowBound.textContent = `${curr}${(meta.price * 0.95).toFixed(2)}`;
    highBound.textContent = `${curr}${(meta.price * 1.12).toFixed(2)}`;
  }

  // Pattern engine entry/target
  const entry = document.getElementById('pattern-entry');
  const target = document.getElementById('pattern-target');
  if (entry && target) {
    entry.textContent = `${curr}${meta.price.toFixed(2)}`;
    target.textContent = `${curr}${(meta.price * 1.08).toFixed(2)}`;
  }
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
  console.log(`[Data Flow] 6. Indicator Calculation Sample (overallSignal):`, rawIndicators.overallSignal);
  console.log(`[Data Flow] 7. Prediction Input Data (Last Close):`, data[data.length - 1].close);
  
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

  // Run prediction and set loading state
  const aiOverlay = document.getElementById('ai-loading-overlay');
  const aiError = document.getElementById('ai-error-banner');
  if (aiOverlay) aiOverlay.classList.add('active');
  if (aiError) aiError.style.display = 'none';

  // Allow UI to paint loading state before heavy calculation
  setTimeout(() => {
    try {
      state.prediction = predict(data);
      console.log(`[Data Flow] 8. Prediction Output (direction/confidence):`, state.prediction?.direction, state.prediction?.confidence);
    } catch (e) {
      console.error("[Data Flow] AI Prediction Error:", e);
      state.prediction = { direction: 'neutral', confidence: 0, signals: [] };
    }

    // Update UI
    updatePredictionCard();
    updateSignals();
    updateIndicatorCards();
    updatePatternCards();
    updateTrendTable();
    updateNewsSentiment(state.symbol);

    // Render AI Forecast Dashboard (all 14 sections)
    renderAIForecastDashboard();
    
    if (aiOverlay) aiOverlay.classList.remove('active');

    // Update Fear & Greed + Trending Sectors
    const fearGreedValue = Math.round(50 + (state.prediction?.confidence || 0) * (state.prediction?.direction === 'bullish' ? 35 : state.prediction?.direction === 'bearish' ? -35 : 0));
    renderFearGreed(fearGreedValue);
    updateTrendingSectors();

    // Add S/R to chart
    const srLevels = detectSupportResistance(data, 3);
    setSupportResistance(srLevels, state.symbol.toUpperCase().endsWith('.NS'));

    // Add pattern markers
    setPatternMarkers(state.patterns);

    const riskBadge = document.getElementById('risk-badge');
    if (riskBadge && state.prediction) {
      const score = Math.abs(state.prediction.confidence ?? 0); // 0..1
      if (score > 0.6) {
        riskBadge.textContent = 'High Risk';
        riskBadge.style.background = 'var(--accent-magenta-dim)';
        riskBadge.style.color = 'var(--accent-magenta)';
      } else if (score > 0.3) {
        riskBadge.textContent = 'Moderate Risk';
        riskBadge.style.background = 'var(--accent-amber-dim)';
        riskBadge.style.color = 'var(--accent-amber)';
      } else {
        riskBadge.textContent = 'Low Risk';
        riskBadge.style.background = 'var(--accent-green-dim)';
        riskBadge.style.color = 'var(--accent-green)';
      }
    }
  }, 100);

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

  if (!pred) {
    // Show neutral fallback UI while data loads
    if (dom.predictionCard) dom.predictionCard.className = 'prediction-signal-box neutral';
    if (dom.predictionDirection) dom.predictionDirection.textContent = 'LOADING…';
    if (dom.confidenceValue) dom.confidenceValue.textContent = '--';
    if (dom.predictionTimeframes) {
      dom.predictionTimeframes.innerHTML = `
        <div style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; width: 100%; padding: 10px 0;">
          Calculating projections...
        </div>
      `;
    }
    return;
  }

  if (dom.predictionCard) dom.predictionCard.className = `prediction-signal-box ${pred.direction}`;

  // Direction text
  const directionText = {
    bullish: 'BULLISH SIGNAL',
    bearish: 'BEARISH SIGNAL',
    neutral: 'NEUTRAL SIGNAL',
  };
  if (dom.predictionDirection) dom.predictionDirection.textContent = directionText[pred.direction] || 'NEUTRAL SIGNAL';

  // Confidence gauge — pred.confidence is 0..1
  const pct = Math.round((pred.confidence ?? 0) * 100);
  if (dom.confidenceValue) dom.confidenceValue.textContent = `${pct}%`;

  // Expected move KPI
  const expMoveVal = document.getElementById('expected-move-val');
  if (expMoveVal) {
    const move = Math.round((pred.confidence ?? 0) * 8);
    const sign = pred.direction === 'bearish' ? '-' : '+';
    expMoveVal.textContent = `${sign}${move.toFixed(1)}%`;
    expMoveVal.className = `pred-kpi-val ${pred.direction === 'bullish' ? 'green' : pred.direction === 'bearish' ? 'red' : ''}`;
  }

  // Timeframe Predictions
  if (dom.predictionTimeframes) {
    if (pred.timeframePredictions && pred.timeframePredictions.length > 0) {
      dom.predictionTimeframes.innerHTML = pred.timeframePredictions.map(tf => {
        const moveClass = tf.direction === 'strong-bullish' || tf.direction === 'bullish' ? 'green' : tf.direction === 'bearish' ? 'red' : '';
        const dirLabel = tf.direction.replace('-', ' ').toUpperCase();
        return `
          <div class="pred-tf-item">
            <div class="pred-tf-range">${tf.range}</div>
            <div class="pred-tf-move ${moveClass}">${tf.move}</div>
            <div class="pred-tf-conf" title="Direction: ${dirLabel}">${tf.confidence} conf</div>
          </div>
        `;
      }).join('');
    } else {
      dom.predictionTimeframes.innerHTML = `
        <div style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; width: 100%; padding: 10px 0;">
          No projections available
        </div>
      `;
    }
  }
}

function updateSignals() {
  const pred = state.prediction;
  if (!pred || !pred.signals) return;

  if (dom.signalCount) {
    dom.signalCount.textContent = `${pred.signals.length} signals`;
  }

  if (dom.signalList) {
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
}

/* ======================================
   INDICATOR CARDS
   ====================================== */
function updateIndicatorCards() {
  const ind = state.indicators;
  if (!ind) return;

  // RSI
  if (dom.rsiVal) dom.rsiVal.textContent = ind.rsi?.latest?.toFixed(1) || '—';
  if (dom.rsiStatus) {
    dom.rsiStatus.textContent = ind.rsi?.signal?.toUpperCase() || 'NEUTRAL';
    dom.rsiStatus.className = `ind-status-badge ${ind.rsi?.signal || 'neutral'}`;
  }
  if (dom.rsiBar) dom.rsiBar.style.width = `${Math.min(100, Math.max(0, ind.rsi?.latest || 0))}%`;

  // MACD
  if (dom.macdVal) dom.macdVal.textContent = ind.macd?.latest?.macd?.toFixed(2) || '—';
  if (dom.macdStatus) {
    dom.macdStatus.textContent = ind.macd?.signal?.toUpperCase() || 'NEUTRAL';
    dom.macdStatus.className = `ind-status-badge ${ind.macd?.signal || 'neutral'}`;
  }
  if (dom.macdBar) {
    const rawMacd = ind.macd?.latest?.macd || 0;
    const normMacd = ((rawMacd + 10) / 20) * 100;
    dom.macdBar.style.width = `${Math.min(100, Math.max(0, normMacd))}%`;
  }

  // ADX (Trend Strength)
  if (dom.adxVal) dom.adxVal.textContent = ind.adx?.latest?.adx?.toFixed(1) || '—';
  if (dom.adxStatus) {
    dom.adxStatus.textContent = ind.adx?.latest?.adx > 25 ? 'STRONG' : 'WEAK';
    dom.adxStatus.className = `ind-status-badge ${ind.adx?.latest?.adx > 25 ? 'bullish' : 'neutral'}`;
  }
  if (dom.adxBar) {
    const rawAdx = ind.adx?.latest?.adx || 0;
    dom.adxBar.style.width = `${Math.min(100, Math.max(0, rawAdx * 2))}%`;
  }
}

/* ======================================
   PATTERN CARDS
   ====================================== */
function updatePatternCards() {
  const patterns = state.patterns;
  const countBadge = document.getElementById('patterns-count');
  if (countBadge) {
    countBadge.textContent = patterns && patterns.length > 0 ? `${patterns.length} Active` : 'None';
    countBadge.style.color = patterns && patterns.length > 0 ? 'var(--bullish-green)' : 'var(--text-secondary)';
  }

  const desc = document.getElementById('pattern-description-text');
  if (desc) {
    if (patterns && patterns.length > 0) {
      desc.textContent = patterns[0].description;
    } else {
      desc.textContent = 'No significant candlestick or trendline patterns detected in current timeframe.';
    }
  }

  // Target values based on current price
  const entry = document.getElementById('pattern-entry');
  const target = document.getElementById('pattern-target');
  if (entry && target && state.filteredData && state.filteredData.length > 0) {
    const price = state.filteredData[state.filteredData.length - 1].close;
    const curr = state.symbol.toUpperCase().endsWith('.NS') ? '₹' : '$';
    entry.textContent = `${curr}${price.toFixed(2)}`;

    const direction = state.prediction?.direction === 'bearish' ? -1 : 1;
    const targetPrice = price * (1 + direction * 0.08 * (state.prediction?.confidence || 0.5));
    target.textContent = `${curr}${targetPrice.toFixed(2)}`;
  }
}

/* ======================================
   TREND TABLE
   ====================================== */
function updateTrendTable() {
  const pred = state.prediction;
  const ind = state.indicators;
  if (!pred || !ind || !dom.trendBody) return;

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
   TAB SWITCHING IMPLEMENTATION
   ====================================== */
function handleHashTabSwitch() {
  const hash = window.location.hash.substring(1) || 'overview';
  const validTabs = ['overview', 'technical', 'financials', 'news', 'ai-forecast'];
  const tabId = validTabs.includes(hash) ? hash : 'overview';
  switchTab(tabId);
}

function switchTab(tabId) {
  // tabId can be 'overview', 'technical', 'financials', 'news', 'ai-forecast'
  // 1. Find the corresponding tab button in tabs-navigation
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    const text = btn.textContent.trim().toLowerCase();
    let btnTabId = '';
    if (text === 'overview') btnTabId = 'overview';
    else if (text === 'technical analysis') btnTabId = 'technical';
    else if (text === 'financials') btnTabId = 'financials';
    else if (text === 'news') btnTabId = 'news';
    else if (text === 'ai forecast') btnTabId = 'ai-forecast';

    btn.classList.toggle('active', btnTabId === tabId);
  });

  // 2. Update active sidebar item
  const sidebarItems = document.querySelectorAll('.sidebar-nav-item');
  sidebarItems.forEach(item => {
    const label = item.querySelector('.sidebar-nav-label')?.textContent.trim().toLowerCase();
    if (label === 'dashboard' && tabId === 'overview') {
      item.classList.add('active');
    } else if (label === 'analytics' && tabId === 'technical') {
      item.classList.add('active');
    } else if (label === 'ai signals' && tabId === 'ai-forecast') {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // 3. Show/hide relevant sections on the page!
  const leftCol = document.querySelector('.analyzer-col-left');
  const rightCol = document.querySelector('.analyzer-col-right');

  // Find all sections
  const chartPanel = leftCol ? leftCol.querySelector('section.glass-panel:first-of-type') : null;
  const keyStats = leftCol ? Array.from(leftCol.querySelectorAll('section.glass-panel')).find(el => el.textContent.includes('Key Statistics')) : null;
  const techIndicators = document.getElementById('indicators-grid-container');
  const fearGreedRow = leftCol ? leftCol.querySelector('div[style*="display: grid"]') : null;
  const priceProjection = leftCol ? Array.from(leftCol.querySelectorAll('section.glass-panel')).find(el => el.textContent.includes('AI Price Projection')) : null;

  const predictionCard = document.getElementById('prediction-card');
  const patternsSection = document.getElementById('patterns-section');
  const newsTimeline = rightCol ? Array.from(rightCol.querySelectorAll('section.glass-panel')).find(el => el.textContent.includes('News')) : null;
  const riskSection = rightCol ? Array.from(rightCol.querySelectorAll('section.glass-panel')).find(el => el.textContent.includes('Risk')) : null;

  // Let's reset displays of columns and sections
  if (leftCol) {
    leftCol.style.display = 'flex';
    leftCol.style.gridColumn = 'span 8';
  }
  if (rightCol) {
    rightCol.style.display = 'flex';
    rightCol.style.gridColumn = 'span 4';
  }

  // Helper to set display of an element
  const setVisible = (el, visible) => {
    if (el) el.style.display = visible ? '' : 'none';
  };

  if (tabId === 'overview') {
    // Overview shows everything
    setVisible(chartPanel, true);
    setVisible(keyStats, true);
    setVisible(techIndicators, true);
    setVisible(fearGreedRow, true);
    setVisible(priceProjection, true);
    setVisible(predictionCard, true);
    setVisible(patternsSection, true);
    setVisible(newsTimeline, true);
    setVisible(riskSection, true);
  } else if (tabId === 'technical') {
    // Technical analysis shows Chart panel, Key Stats, Tech indicators, Fear & Greed row
    setVisible(chartPanel, true);
    setVisible(keyStats, true);
    setVisible(techIndicators, true);
    setVisible(fearGreedRow, true);
    setVisible(priceProjection, false);
    
    // Hide all right column elements
    setVisible(predictionCard, false);
    setVisible(patternsSection, false);
    setVisible(newsTimeline, false);
    setVisible(riskSection, false);

    // Make left column full width
    if (leftCol) leftCol.style.gridColumn = 'span 12';
    if (rightCol) rightCol.style.display = 'none';
  } else if (tabId === 'ai-forecast') {
    // AI Forecast: hide BOTH columns, show full-width AI Forecast Dashboard
    if (leftCol) leftCol.style.display = 'none';
    if (rightCol) rightCol.style.display = 'none';

    const aiFD = document.getElementById('ai-forecast-dashboard');
    if (aiFD) aiFD.style.display = 'flex';

    // Re-render to ensure latest data
    renderAIForecastDashboard();
    return; // skip rest — columns are hidden
  } else if (tabId === 'news') {
    // News shows only News timeline
    setVisible(chartPanel, false);
    setVisible(keyStats, false);
    setVisible(techIndicators, false);
    setVisible(fearGreedRow, false);
    setVisible(priceProjection, false);

    setVisible(predictionCard, false);
    setVisible(patternsSection, false);
    setVisible(newsTimeline, true);
    setVisible(riskSection, false);

    // Make right column full width
    if (leftCol) leftCol.style.display = 'none';
    if (rightCol) {
      rightCol.style.display = 'flex';
      rightCol.style.gridColumn = 'span 12';
    }
  } else if (tabId === 'financials') {
    // Financials shows only Risk intelligence section
    setVisible(chartPanel, false);
    setVisible(keyStats, false);
    setVisible(techIndicators, false);
    setVisible(fearGreedRow, false);
    setVisible(priceProjection, false);

    setVisible(predictionCard, false);
    setVisible(patternsSection, false);
    setVisible(newsTimeline, false);
    setVisible(riskSection, true);

    // Make right column full width
    if (leftCol) leftCol.style.display = 'none';
    if (rightCol) {
      rightCol.style.display = 'flex';
      rightCol.style.gridColumn = 'span 12';
    }
  }

  // Hide AI Forecast Dashboard when NOT on ai-forecast tab
  const aiFD = document.getElementById('ai-forecast-dashboard');
  if (aiFD) aiFD.style.display = 'none';
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
  const newsTimelineContainer = document.getElementById('news-timeline-container');
  const sentimentOverallBadge = document.getElementById('sentiment-overall-badge');
  const sentimentSummaryText = document.getElementById('sentiment-summary-text');

  const data = getSentiment(symbol);
  
  // Update badge if present
  if (sentimentOverallBadge) {
    const scoreVal = Math.round(((data.score + 1) / 2) * 100);
    const dirText = data.direction === 'positive' ? 'Bullish' :
                    data.direction === 'negative' ? 'Bearish' : 'Neutral';
    sentimentOverallBadge.textContent = `${scoreVal}% ${dirText}`;
    
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

  // Update AI Summary if present
  if (sentimentSummaryText) {
    sentimentSummaryText.textContent = data.summary;
  }

  // Render news timeline
  if (newsTimelineContainer) {
    if (data.articles.length === 0) {
      newsTimelineContainer.innerHTML = '<div style="font-size: var(--fs-xs); color: var(--text-muted); padding: var(--sp-4); text-align: center;">No news articles available.</div>';
    } else {
      newsTimelineContainer.innerHTML = data.articles.map(art => {
        const artColor = art.sentiment === 'positive' ? 'var(--bullish-green)' :
                         art.sentiment === 'negative' ? 'var(--bearish-red)' : 'var(--warning-amber)';
        const sentimentText = art.sentiment === 'positive' ? 'Bullish' :
                              art.sentiment === 'negative' ? 'Bearish' : 'Neutral';
        return `
          <div class="pulse-item">
            <span class="pulse-dot" style="background-color: ${artColor}; box-shadow: 0 0 6px ${artColor};"></span>
            <div class="pulse-time">${art.age} • <span style="color: ${artColor}; font-weight: 700;">${sentimentText}</span></div>
            <div class="pulse-text" style="font-size: 0.85rem; font-weight: 500; color: var(--text-main); line-height: 1.4;">
              <a href="${art.url || '#'}" target="_blank" rel="noopener" style="color: inherit; text-decoration: none; transition: color var(--transition-fast);" onmouseover="this.style.color='var(--accent-blue)'" onmouseout="this.style.color='var(--text-main)'">
                ${art.title}
              </a>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

/**
 * Simulates real-time stock price fluctuations in background loops
 */
let realTimeTickCount = 0;
function startRealTimeSimulation() {
  if (realTimeInterval) clearInterval(realTimeInterval);
  realTimeTickCount = 0;

  // Poll a fresh live price every 30 seconds
  realTimeInterval = setInterval(async () => {
    if (state.loading || !state.fullData || state.fullData.length === 0) return;

    let newPrice = null;

    try {
      // bypassCache = true → always fetch fresh from Yahoo Finance
      newPrice = await fetchLivePrice(state.symbol, state.apiKey, true);
    } catch (_) {
      // Network failed — fall back to a tiny random walk to keep chart alive
      const last = state.fullData[state.fullData.length - 1].close;
      newPrice = parseFloat((last * (1 + (Math.random() - 0.5) * 0.001)).toFixed(2));
    }

    if (!newPrice || newPrice <= 0) return;

    // Patch the latest candle with the real price
    const latestIndex = state.fullData.length - 1;
    const latestBar = state.fullData[latestIndex];
    latestBar.close = newPrice;
    if (newPrice > latestBar.high) latestBar.high = newPrice;
    if (newPrice < latestBar.low)  latestBar.low  = newPrice;

    const filteredLatestIndex = state.filteredData.length - 1;
    if (filteredLatestIndex >= 0) {
      state.filteredData[filteredLatestIndex] = { ...latestBar };
    }

    // Update chart and price bar every tick
    updateChart();
    updateStatusBar();

    // Full indicator/pattern reanalysis is expensive — run every 3rd tick (~90s)
    realTimeTickCount++;
    if (realTimeTickCount % 3 === 0) {
      runAnalysis();
    }
  }, 30000); // 30-second real-time poll

  // Also fire immediately once so the price updates right away on load
  (async () => {
    try {
      const livePrice = await fetchLivePrice(state.symbol, state.apiKey, true);
      if (livePrice && livePrice > 0 && state.fullData.length > 0) {
        const idx = state.fullData.length - 1;
        state.fullData[idx].close = livePrice;
        if (livePrice > state.fullData[idx].high) state.fullData[idx].high = livePrice;
        if (livePrice < state.fullData[idx].low)  state.fullData[idx].low  = livePrice;
        if (state.filteredData.length > 0) {
          state.filteredData[state.filteredData.length - 1] = { ...state.fullData[idx] };
        }
        updateChart();
        updateStatusBar();
      }
    } catch (_) {}
  })();
}

/* ======================================
   BOOT
   ====================================== */
document.addEventListener('DOMContentLoaded', () => {
  init();
  setupAIForecastListeners();
});

/* ======================================
   AI FORECAST DASHBOARD — RENDERING
   ====================================== */

function setupAIForecastListeners() {
  // Horizon buttons (1D, 1W, 1M, 3M)
  document.querySelectorAll('.ai-fd-horizon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ai-fd-horizon-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderAIForecastDashboard(); // re-render with new horizon
    });
  });

  // Forecast chart timeframe buttons (5D, 10D, 30D, 90D)
  document.querySelectorAll('.ai-fd-forecast-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ai-fd-forecast-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentForecastDays = parseInt(btn.dataset.forecastDays, 10);
      renderForecastChart();
    });
  });
}

function renderAIForecastDashboard() {
  const errorBanner = document.getElementById('ai-error-banner');
  const errorText = document.getElementById('ai-error-message');
  
  if (!state.prediction || !state.filteredData) {
    if (errorBanner) {
      errorBanner.style.display = 'block';
      errorText.textContent = "Data source is missing or undefined.";
    }
    return;
  }

  // Debug Logging Requirement
  console.log(`[Data Flow] AI FORECAST DEBUG`);
  console.log(`Current Stock: ${state.symbol}`);
  console.log(`Current Price: ${state.filteredData[state.filteredData.length - 1]?.close || 0}`);
  console.log(`Currency: ${getCurrency(state.symbol)}`);
  console.log(`Historical Candle Count: ${state.filteredData.length}`);
  console.log(`Prediction Object:`, state.prediction);

  let fd = null;
  try {
    fd = computeAllForecastData(
      state.filteredData,
      state.prediction,
      state.indicators,
      state.patterns,
      state.symbol
    );
  } catch (err) {
    console.error("AI Forecast rendering failed:", err);
    if (errorBanner) {
      errorBanner.style.display = 'block';
      errorText.textContent = err.message;
    }
    return;
  }

  if (!fd) {
    if (errorBanner) {
      errorBanner.style.display = 'block';
      errorText.textContent = "AI Model requires at least 30 historical data points to generate a forecast.";
    }
    return;
  }

  if (errorBanner) errorBanner.style.display = 'none';

  console.log(`Confidence: ${fd.hero.confidence}`);
  console.log(`Predicted Price: ${fd.hero.predictedPrice}`);

  // --- SECTION 1: Hero Card ---
  const badge = document.getElementById('ai-signal-badge');
  if (badge) {
    badge.textContent = `${fd.hero.labelEmoji} ${fd.hero.overallLabel}`;
    badge.style.color = fd.hero.labelColor;
  }

  const curPrice = document.getElementById('ai-current-price');
  if (curPrice) curPrice.textContent = `${fd.hero.currency}${fd.hero.currentPrice.toFixed(2)}`;

  const predPrice = document.getElementById('ai-predicted-price');
  if (predPrice) {
    predPrice.textContent = `${fd.hero.currency}${fd.hero.predictedPrice.toFixed(2)}`;
    predPrice.style.color = fd.hero.direction === 'bearish' ? '#e74c3c' : '#9eb5ff';
  }

  const expRet = document.getElementById('ai-expected-return');
  if (expRet) {
    const sign = fd.hero.expectedReturn >= 0 ? '+' : '';
    expRet.textContent = `${sign}${fd.hero.expectedReturn.toFixed(2)}%`;
    expRet.style.color = fd.hero.expectedReturn >= 0 ? '#2ecc71' : '#e74c3c';
  }

  const prob = document.getElementById('ai-probability');
  if (prob) prob.textContent = `${fd.hero.probabilityOfSuccess}%`;

  const confPct = document.getElementById('ai-confidence-pct');
  if (confPct) confPct.textContent = `${fd.hero.confidence}%`;

  // Animate confidence ring
  const ring = document.getElementById('ai-confidence-ring');
  if (ring) {
    const circumference = 2 * Math.PI * 52; // r=52
    const fillLength = (fd.hero.confidence / 100) * circumference;
    // Trigger animation by setting after a small delay
    requestAnimationFrame(() => {
      ring.setAttribute('stroke-dasharray', `${fillLength} ${circumference}`);
    });
    // Color the ring based on confidence
    if (fd.hero.confidence >= 75) ring.style.stroke = '#2ecc71';
    else if (fd.hero.confidence >= 50) ring.style.stroke = '#9eb5ff';
    else if (fd.hero.confidence >= 35) ring.style.stroke = '#f39c12';
    else ring.style.stroke = '#e74c3c';
  }

  // Hero gradient based on direction
  const heroCard = document.getElementById('ai-hero-card');
  if (heroCard) {
    if (fd.hero.direction === 'bearish') {
      heroCard.style.background = 'linear-gradient(135deg, rgba(14,17,26,0.95) 0%, rgba(231,76,60,0.04) 100%)';
      heroCard.style.borderColor = 'rgba(231,76,60,0.15)';
    } else if (fd.hero.direction === 'bullish') {
      heroCard.style.background = 'linear-gradient(135deg, rgba(14,17,26,0.95) 0%, rgba(46,204,113,0.04) 100%)';
      heroCard.style.borderColor = 'rgba(46,204,113,0.15)';
    } else {
      heroCard.style.background = 'linear-gradient(135deg, rgba(14,17,26,0.95) 0%, rgba(255,255,255,0.02) 100%)';
      heroCard.style.borderColor = 'var(--border-color)';
    }
  }

  // --- SECTION 2: Forecast Chart ---
  renderForecastChart();

  // --- SECTION 3: AI Reasoning ---
  const reasoningBody = document.getElementById('ai-reasoning-body');
  if (reasoningBody) reasoningBody.innerHTML = fd.reasoning;

  // --- SECTION 4: Factors Breakdown ---
  const factorsList = document.getElementById('ai-factors-list');
  if (factorsList) {
    factorsList.innerHTML = fd.factors.map(f => `
      <div class="ai-fd-factor-row">
        <div class="ai-fd-factor-header">
          <span class="ai-fd-factor-lbl">${f.label}</span>
          <span class="ai-fd-factor-pct">${f.value}%</span>
        </div>
        <div class="ai-fd-factor-track">
          <div class="ai-fd-factor-fill" style="background:${f.color};" data-width="${f.value}"></div>
        </div>
      </div>
    `).join('');
    // Animate bar widths
    requestAnimationFrame(() => {
      factorsList.querySelectorAll('.ai-fd-factor-fill').forEach(el => {
        el.style.width = el.dataset.width + '%';
      });
    });
  }

  // --- SECTION 5: Prediction Timeline ---
  const timelineGrid = document.getElementById('ai-timeline-grid');
  if (timelineGrid) {
    timelineGrid.innerHTML = fd.timeline.map(item => {
      const dirColor = item.direction === 'Bullish' ? '#2ecc71' : item.direction === 'Bearish' ? '#e74c3c' : '#f39c12';
      return `
        <div class="ai-fd-tl-card">
          <div class="ai-fd-tl-label">${item.label}</div>
          <div class="ai-fd-tl-direction" style="color:${dirColor}">${item.direction}</div>
          <div class="ai-fd-tl-prob">${item.probability}%</div>
          <div class="ai-fd-tl-target">${item.targetPrice}</div>
          <span class="ai-fd-tl-risk" style="background:${item.riskColor}20; color:${item.riskColor}">${item.risk}</span>
        </div>
      `;
    }).join('');
  }

  // --- SECTION 6: Confidence Breakdown ---
  const confScore = document.getElementById('ai-overall-conf-score');
  if (confScore) confScore.textContent = `${fd.hero.confidence}%`;

  const confBars = document.getElementById('ai-conf-bars');
  if (confBars) {
    confBars.innerHTML = fd.confidenceBreakdown.map(c => `
      <div class="ai-fd-conf-row">
        <div class="ai-fd-conf-header">
          <span class="ai-fd-conf-lbl">${c.label}</span>
          <span class="ai-fd-conf-val">${c.value}%</span>
        </div>
        <div class="ai-fd-conf-track">
          <div class="ai-fd-conf-fill" style="background:${c.color};" data-width="${c.value}"></div>
        </div>
      </div>
    `).join('');
    requestAnimationFrame(() => {
      confBars.querySelectorAll('.ai-fd-conf-fill').forEach(el => {
        el.style.width = el.dataset.width + '%';
      });
    });
  }

  // --- SECTION 7: Model Accuracy ---
  const accGrid = document.getElementById('ai-accuracy-grid');
  if (accGrid) {
    const ma = fd.modelAccuracy;
    accGrid.innerHTML = `
      <div class="ai-fd-acc-item">
        <span class="ai-fd-acc-lbl">Last 30 Days</span>
        <span class="ai-fd-acc-val green">${ma.last30Days}%</span>
      </div>
      <div class="ai-fd-acc-item">
        <span class="ai-fd-acc-lbl">Last 90 Days</span>
        <span class="ai-fd-acc-val green">${ma.last90Days}%</span>
      </div>
      <div class="ai-fd-acc-item">
        <span class="ai-fd-acc-lbl">Bullish Accuracy</span>
        <span class="ai-fd-acc-val green">${ma.bullishAccuracy}%</span>
      </div>
      <div class="ai-fd-acc-item">
        <span class="ai-fd-acc-lbl">Bearish Accuracy</span>
        <span class="ai-fd-acc-val amber">${ma.bearishAccuracy}%</span>
      </div>
      <div class="ai-fd-acc-item">
        <span class="ai-fd-acc-lbl">Winning</span>
        <span class="ai-fd-acc-val green">${ma.winningPredictions}</span>
      </div>
      <div class="ai-fd-acc-item">
        <span class="ai-fd-acc-lbl">Losing</span>
        <span class="ai-fd-acc-val amber">${ma.losingPredictions}</span>
      </div>
    `;
  }

  // --- SECTION 8: Scenario Analysis ---
  const scenarioGrid = document.getElementById('ai-scenario-grid');
  if (scenarioGrid) {
    scenarioGrid.innerHTML = [fd.scenarios.bull, fd.scenarios.base, fd.scenarios.bear].map(s => `
      <div class="ai-fd-scenario-card" style="background:${s.color}08; border-color:${s.color}30;">
        <span class="ai-fd-scenario-emoji">${s.emoji}</span>
        <span class="ai-fd-scenario-label" style="color:${s.color}">${s.label}</span>
        <span class="ai-fd-scenario-price">${s.targetPrice}</span>
        <span class="ai-fd-scenario-prob">Probability: ${s.probability}%</span>
      </div>
    `).join('');
  }

  // --- SECTION 9: Risk Analysis ---
  const riskList = document.getElementById('ai-risk-list');
  if (riskList) {
    const r = fd.risk;
    const riskColor = r.riskScore > 60 ? '#e74c3c' : r.riskScore > 35 ? '#f39c12' : '#2ecc71';
    riskList.innerHTML = `
      <div class="ai-fd-risk-row"><span class="ai-fd-risk-lbl">Volatility (Annual)</span><span class="ai-fd-risk-val">${r.volatility}</span></div>
      <div class="ai-fd-risk-row"><span class="ai-fd-risk-lbl">Beta</span><span class="ai-fd-risk-val">${r.beta}</span></div>
      <div class="ai-fd-risk-row"><span class="ai-fd-risk-lbl">Risk Score</span><span class="ai-fd-risk-val" style="color:${riskColor}">${r.riskScore}/100</span></div>
      <div class="ai-fd-risk-row"><span class="ai-fd-risk-lbl">Max Drawdown</span><span class="ai-fd-risk-val" style="color:#e74c3c">${r.maxDrawdown}</span></div>
      <div class="ai-fd-risk-row"><span class="ai-fd-risk-lbl">Stop Loss</span><span class="ai-fd-risk-val" style="color:#e74c3c">${r.stopLoss}</span></div>
      <div class="ai-fd-risk-row"><span class="ai-fd-risk-lbl">Take Profit</span><span class="ai-fd-risk-val" style="color:#2ecc71">${r.takeProfit}</span></div>
      <div class="ai-fd-risk-row"><span class="ai-fd-risk-lbl">Risk/Reward Ratio</span><span class="ai-fd-risk-val">1:${r.riskReward}</span></div>
    `;
  }

  // --- SECTION 10: News Impact ---
  const newsScore = document.getElementById('ai-news-overall-score');
  if (newsScore) {
    newsScore.textContent = `${fd.newsImpact.overallScore}% ${fd.newsImpact.overallLabel}`;
    newsScore.style.background = `${fd.newsImpact.overallColor}20`;
    newsScore.style.color = fd.newsImpact.overallColor;
  }

  const newsList = document.getElementById('ai-news-impact-list');
  if (newsList) {
    newsList.innerHTML = fd.newsImpact.articles.map(a => `
      <div class="ai-fd-news-item">
        <span class="ai-fd-news-title">${a.title}</span>
        <span class="ai-fd-news-impact" style="background:${a.impactColor}15; color:${a.impactColor}">${a.impactIcon} ${a.impact}</span>
      </div>
    `).join('');
  }

  // --- SECTION 11: Technical Scores ---
  const techOverall = document.getElementById('ai-tech-overall');
  if (techOverall) techOverall.textContent = fd.techScores.overall;

  const techScores = document.getElementById('ai-tech-scores');
  if (techScores) {
    const items = [
      { label: 'Trend Strength', value: fd.techScores.trendStrength },
      { label: 'Momentum', value: fd.techScores.momentum },
      { label: 'Volume', value: fd.techScores.volume },
      { label: 'Volatility', value: fd.techScores.volatility },
      { label: 'Liquidity', value: fd.techScores.liquidity },
    ];
    techScores.innerHTML = items.map(i => `
      <div class="ai-fd-tech-row">
        <div class="ai-fd-tech-header">
          <span class="ai-fd-tech-lbl">${i.label}</span>
          <span class="ai-fd-tech-val">${i.value}/100</span>
        </div>
        <div class="ai-fd-tech-track">
          <div class="ai-fd-tech-fill" data-width="${i.value}"></div>
        </div>
      </div>
    `).join('');
    requestAnimationFrame(() => {
      techScores.querySelectorAll('.ai-fd-tech-fill').forEach(el => {
        el.style.width = el.dataset.width + '%';
      });
    });
  }

  // --- SECTION 12: Pattern Detection ---
  const patternsList = document.getElementById('ai-patterns-list');
  if (patternsList) {
    patternsList.innerHTML = fd.enrichedPatterns.map(p => {
      const dirColor = p.direction === 'bullish' ? '#2ecc71' : p.direction === 'bearish' ? '#e74c3c' : '#f39c12';
      return `
        <div class="ai-fd-pattern-card">
          <div class="ai-fd-pattern-info">
            <span class="ai-fd-pattern-name">${p.name}</span>
            <span class="ai-fd-pattern-meta">Confidence: ${p.confidence}% · Success: ${p.historicalSuccess}% · <span style="color:${dirColor}">${p.direction}</span></span>
          </div>
          <div class="ai-fd-pattern-target">
            <span class="ai-fd-pattern-target-lbl">Breakout Target</span>
            <span class="ai-fd-pattern-target-val" style="color:${dirColor}">${p.breakoutTarget}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- SECTION 14: Executive Summary ---
  const execBody = document.getElementById('ai-exec-body');
  if (execBody) execBody.innerHTML = `<p>${fd.executiveSummary.text}</p>`;

  const execAction = document.getElementById('ai-exec-action');
  if (execAction) {
    execAction.textContent = fd.executiveSummary.action;
    execAction.style.background = `${fd.executiveSummary.actionColor}20`;
    execAction.style.color = fd.executiveSummary.actionColor;
  }

  const execConf = document.getElementById('ai-exec-confidence');
  if (execConf) execConf.textContent = `${fd.executiveSummary.confidence}%`;

  const execTarget = document.getElementById('ai-exec-target');
  if (execTarget) execTarget.textContent = fd.executiveSummary.targetPrice;

  const execSL = document.getElementById('ai-exec-stoploss');
  if (execSL) execSL.textContent = fd.executiveSummary.stopLoss;
}

/* ======================================
   FORECAST CHART (LightweightCharts)
   ====================================== */
function renderForecastChart() {
  const container = document.getElementById('ai-forecast-chart-container');
  if (!container || !state.filteredData || state.filteredData.length < 30) return;

  // Destroy previous instance
  if (forecastChartInstance) {
    forecastChartInstance.remove();
    forecastChartInstance = null;
    forecastChartSeries = {};
  }

  const chartData = computeForecastChartData(state.filteredData, state.prediction, currentForecastDays);

  forecastChartInstance = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: 340,
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: '#8e9cae',
      fontFamily: 'Outfit, sans-serif',
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.03)' },
      horzLines: { color: 'rgba(255,255,255,0.03)' },
    },
    crosshair: { mode: 0 },
    rightPriceScale: {
      borderColor: 'rgba(255,255,255,0.07)',
    },
    timeScale: {
      borderColor: 'rgba(255,255,255,0.07)',
      timeVisible: false,
    },
  });

  // Historical line
  forecastChartSeries.historical = forecastChartInstance.addLineSeries({
    color: '#9eb5ff',
    lineWidth: 2,
    title: 'Historical',
  });
  forecastChartSeries.historical.setData(chartData.historical);

  // Forecast line (dashed via area workaround — using line with different color)
  forecastChartSeries.forecast = forecastChartInstance.addLineSeries({
    color: '#a855f7',
    lineWidth: 2,
    lineStyle: 2, // dashed
    title: 'AI Forecast',
  });
  // Connect historical to forecast
  const bridgePoint = chartData.historical.length > 0 ? [chartData.historical[chartData.historical.length - 1]] : [];
  forecastChartSeries.forecast.setData([...bridgePoint, ...chartData.forecast]);

  // Upper band
  forecastChartSeries.upper = forecastChartInstance.addLineSeries({
    color: 'rgba(168, 85, 247, 0.25)',
    lineWidth: 1,
    lineStyle: 1,
    title: 'Upper CI',
  });
  forecastChartSeries.upper.setData([...bridgePoint, ...chartData.upperBand]);

  // Lower band
  forecastChartSeries.lower = forecastChartInstance.addLineSeries({
    color: 'rgba(168, 85, 247, 0.25)',
    lineWidth: 1,
    lineStyle: 1,
    title: 'Lower CI',
  });
  forecastChartSeries.lower.setData([...bridgePoint, ...chartData.lowerBand]);

  forecastChartInstance.timeScale().fitContent();

  // Handle resize
  const ro = new ResizeObserver(() => {
    if (forecastChartInstance) {
      forecastChartInstance.applyOptions({ width: container.clientWidth });
    }
  });
  ro.observe(container);
}

/* ======================================
   FEAR & GREED CANVAS NEEDLE
   ====================================== */
function renderFearGreed(value) {
  const canvas = document.getElementById('fear-greed-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height - 15;
  const radius = 90;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw Arc sectors (Fear, Neutral, Greed)
  // Arc 1: Fear (Red)
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI, Math.PI * 1.33);
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 14;
  ctx.lineCap = 'butt';
  ctx.stroke();

  // Arc 2: Neutral (Amber)
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI * 1.33, Math.PI * 1.66);
  ctx.strokeStyle = '#f39c12';
  ctx.lineWidth = 14;
  ctx.stroke();

  // Arc 3: Greed (Green)
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI * 1.66, Math.PI * 2);
  ctx.strokeStyle = '#2ecc71';
  ctx.lineWidth = 14;
  ctx.stroke();

  // Draw Arc Track Background glow (thin outer ring)
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 12, Math.PI, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Map value (0 - 100) to angle (Math.PI to Math.PI * 2)
  const angle = Math.PI + (value / 100) * Math.PI;

  // Draw Needle Shadow
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  const shadowX = cx + Math.cos(angle) * (radius - 15);
  const shadowY = cy + Math.sin(angle) * (radius - 15);
  ctx.lineTo(shadowX, shadowY + 2);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Draw Needle Line
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  const targetX = cx + Math.cos(angle) * (radius - 15);
  const targetY = cy + Math.sin(angle) * (radius - 15);
  ctx.lineTo(targetX, targetY);
  ctx.strokeStyle = '#9eb5ff'; // blue needle
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw Center Hub Inner Circle
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#07090e';
  ctx.fill();
  ctx.strokeStyle = '#9eb5ff';
  ctx.lineWidth = 3;
  ctx.stroke();
  
  // Set details labels dynamically based on scale
  const label = document.getElementById('fear-greed-label');
  const desc = document.getElementById('fear-greed-desc');
  if (label && desc) {
    label.textContent = value;
    if (value < 35) {
      desc.textContent = 'EXTREME FEAR';
      desc.style.color = '#e74c3c';
    } else if (value < 45) {
      desc.textContent = 'FEAR';
      desc.style.color = '#e74c3c';
    } else if (value < 55) {
      desc.textContent = 'NEUTRAL';
      desc.style.color = '#f39c12';
    } else if (value < 75) {
      desc.textContent = 'GREED';
      desc.style.color = '#2ecc71';
    } else {
      desc.textContent = 'EXTREME GREED';
      desc.style.color = '#9eb5ff';
    }
  }
}

/* ======================================
   TRENDING SECTORS CARD POPULATION
   ====================================== */
function updateTrendingSectors() {
  const container = document.getElementById('sector-heatmap');
  if (!container) return;

  const SECTORS = [
    { name: 'Technology', change: 1.84 },
    { name: 'Financials', change: 0.65 },
    { name: 'Healthcare', change: 1.12 },
    { name: 'Energy', change: -0.42 },
    { name: 'Communication', change: 2.10 }
  ];

  container.innerHTML = SECTORS.map(sec => {
    const isPositive = sec.change >= 0;
    const sign = isPositive ? '+' : '';
    const valClass = isPositive ? 'up' : 'down';
    return `
      <div class="sector-row-card">
        <span class="sector-name-txt">${sec.name}</span>
        <span class="sector-val-txt ${valClass}">${sign}${sec.change.toFixed(2)}%</span>
      </div>
    `;
  }).join('');
}
