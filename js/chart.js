/**
 * Chart Rendering Module
 * TradingView Lightweight Charts wrapper with indicator overlays
 */

// Chart theme matching app design system
const CHART_THEME = {
  layout: {
    background: { type: 'solid', color: 'transparent' },
    textColor: '#8893a7',
    fontSize: 12,
    fontFamily: "'Inter', sans-serif",
  },
  grid: {
    vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
    horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
  },
  crosshair: {
    mode: 0, // Normal
    vertLine: {
      color: 'rgba(0, 212, 255, 0.3)',
      width: 1,
      style: 2,
      labelBackgroundColor: '#0c1119',
    },
    horzLine: {
      color: 'rgba(0, 212, 255, 0.3)',
      width: 1,
      style: 2,
      labelBackgroundColor: '#0c1119',
    },
  },
  timeScale: {
    borderColor: 'rgba(255, 255, 255, 0.06)',
    timeVisible: true,
    secondsVisible: false,
  },
  rightPriceScale: {
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
};

export const COLORS = {
  bullish: '#00e676',
  bearish: '#ff3366',
  sma20: '#ffaa00',
  sma50: '#a855f7',
  sma200: '#00d4ff',
  ema12: '#ff6b6b',
  ema26: '#4ecdc4',
  bbUpper: 'rgba(0, 212, 255, 0.4)',
  bbMiddle: 'rgba(0, 212, 255, 0.6)',
  bbLower: 'rgba(0, 212, 255, 0.4)',
  bbFill: 'rgba(0, 212, 255, 0.04)',
  volume: 'rgba(0, 212, 255, 0.15)',
  volumeUp: 'rgba(0, 230, 118, 0.25)',
  volumeDown: 'rgba(255, 51, 102, 0.25)',
  supportLine: '#00e676',
  resistanceLine: '#ff3366',
};

let chartInstance = null;
let candleSeries = null;
let volumeSeries = null;
const overlaySeries = {};
let currentContainer = null;
let resizeObserver = null;
let activePriceLines = [];

/**
 * Initialize or reinitialize the chart
 * @param {HTMLElement} container
 */
export function initChart(container) {
  if (typeof LightweightCharts === 'undefined') {
    console.warn('TradingView LightweightCharts is undefined. Chart rendering is bypassed.');
    return null;
  }

  if (chartInstance) {
    destroyChart();
  }

  currentContainer = container;

  chartInstance = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight,
    ...CHART_THEME,
    handleScroll: { vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true },
  });

  // Candlestick series
  candleSeries = chartInstance.addCandlestickSeries({
    upColor: COLORS.bullish,
    downColor: COLORS.bearish,
    borderUpColor: COLORS.bullish,
    borderDownColor: COLORS.bearish,
    wickUpColor: COLORS.bullish,
    wickDownColor: COLORS.bearish,
  });

  // Volume histogram
  volumeSeries = chartInstance.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
  });

  // Configure volume scale
  chartInstance.priceScale('volume').applyOptions({
    scaleMargins: { top: 0.85, bottom: 0 },
  });

  // Responsive resize
  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      chartInstance.applyOptions({ width, height });
    }
  });
  resizeObserver.observe(container);

  return chartInstance;
}

/**
 * Set candlestick + volume data
 * @param {Array} data - OHLCV data
 */
export function setChartData(data, fit = false) {
  if (!candleSeries || !data || data.length === 0) return;

  candleSeries.setData(data.map(d => ({
    time: d.time,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
  })));

  volumeSeries.setData(data.map(d => ({
    time: d.time,
    value: d.volume,
    color: d.close >= d.open ? COLORS.volumeUp : COLORS.volumeDown,
  })));

  if (fit && chartInstance) {
    chartInstance.timeScale().fitContent();
  }
}

/**
 * Add or update an SMA overlay
 * @param {string} key - 'sma20', 'sma50', 'sma200'
 * @param {Array} lineData - Array of {time, value}
 * @param {string} color
 */
export function setOverlay(key, lineData, color) {
  if (!chartInstance) return;

  // Remove existing
  if (overlaySeries[key]) {
    chartInstance.removeSeries(overlaySeries[key]);
    delete overlaySeries[key];
  }

  if (!lineData || lineData.length === 0) return;

  const series = chartInstance.addLineSeries({
    color: color || COLORS[key] || '#ffffff',
    lineWidth: key.includes('sma200') || key.includes('sma50') ? 2 : 1,
    lineStyle: 0,
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
  });

  series.setData(lineData.filter(d => d.value != null && !isNaN(d.value)));
  overlaySeries[key] = series;
}

/**
 * Add Bollinger Bands overlay (upper, middle, lower with shaded area)
 * @param {Array} bbData - Array of {time, upper, middle, lower}
 */
export function setBollingerBands(bbData) {
  if (!chartInstance) return;

  // Remove existing BB lines
  ['bbUpper', 'bbMiddle', 'bbLower'].forEach(key => {
    if (overlaySeries[key]) {
      chartInstance.removeSeries(overlaySeries[key]);
      delete overlaySeries[key];
    }
  });

  if (!bbData || bbData.length === 0) return;

  const validData = bbData.filter(d => d.upper != null && !isNaN(d.upper));

  // Upper band
  const upperSeries = chartInstance.addLineSeries({
    color: COLORS.bbUpper,
    lineWidth: 1,
    lineStyle: 2,
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
  });
  upperSeries.setData(validData.map(d => ({ time: d.time, value: d.upper })));
  overlaySeries['bbUpper'] = upperSeries;

  // Middle band
  const middleSeries = chartInstance.addLineSeries({
    color: COLORS.bbMiddle,
    lineWidth: 1,
    lineStyle: 0,
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
  });
  middleSeries.setData(validData.map(d => ({ time: d.time, value: d.middle })));
  overlaySeries['bbMiddle'] = middleSeries;

  // Lower band
  const lowerSeries = chartInstance.addLineSeries({
    color: COLORS.bbLower,
    lineWidth: 1,
    lineStyle: 2,
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
  });
  lowerSeries.setData(validData.map(d => ({ time: d.time, value: d.lower })));
  overlaySeries['bbLower'] = lowerSeries;
}

/**
 * Remove a specific overlay
 * @param {string} key
 */
export function removeOverlay(key) {
  if (key === 'bb') {
    ['bbUpper', 'bbMiddle', 'bbLower'].forEach(k => {
      if (overlaySeries[k]) {
        chartInstance.removeSeries(overlaySeries[k]);
        delete overlaySeries[k];
      }
    });
    return;
  }

  if (overlaySeries[key]) {
    chartInstance.removeSeries(overlaySeries[key]);
    delete overlaySeries[key];
  }
}

/**
 * Add support/resistance horizontal lines
 * @param {Array} levels - Array of {level, type}
 */
export function setSupportResistance(levels) {
  // Remove existing S/R price lines
  if (candleSeries) {
    activePriceLines.forEach(line => {
      candleSeries.removePriceLine(line);
    });
  }
  activePriceLines = [];

  if (!levels || levels.length === 0 || !candleSeries) return;

  levels.forEach((sr, i) => {
    const priceLine = candleSeries.createPriceLine({
      price: sr.level,
      color: sr.type === 'support' ? COLORS.supportLine : COLORS.resistanceLine,
      lineWidth: 1.5,
      lineStyle: 2,
      axisLabelVisible: true,
      title: sr.type === 'support' ? `Support: ₹${sr.level.toFixed(1)}` : `Resist: ₹${sr.level.toFixed(1)}`,
    });

    activePriceLines.push(priceLine);
  });
}

/**
 * Add markers for detected patterns
 * @param {Array} patterns - Detected pattern objects
 */
export function setPatternMarkers(patterns) {
  if (!candleSeries || !patterns || patterns.length === 0) return;

  const markers = patterns
    .filter(p => p.keyLevels && p.keyLevels.time)
    .map(p => ({
      time: p.keyLevels.time,
      position: p.direction === 'bullish' ? 'belowBar' : 'aboveBar',
      color: p.direction === 'bullish' ? COLORS.bullish : COLORS.bearish,
      shape: p.direction === 'bullish' ? 'arrowUp' : 'arrowDown',
      text: p.name,
    }));

  if (markers.length > 0) {
    candleSeries.setMarkers(markers);
  }
}

/**
 * Draw a mini sparkline chart in a canvas element
 * @param {HTMLCanvasElement} canvas
 * @param {Array} data - Array of numbers
 * @param {string} color
 */
export function drawSparkline(canvas, data, color = '#00d4ff') {
  if (!canvas || !data || data.length < 2) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const xStep = (w - padding * 2) / (data.length - 1);

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, color.replace(')', ', 0.15)').replace('rgb', 'rgba'));
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  // Draw filled area
  ctx.beginPath();
  ctx.moveTo(padding, h);

  for (let i = 0; i < data.length; i++) {
    const x = padding + i * xStep;
    const y = h - padding - ((data[i] - min) / range) * (h - padding * 2);
    if (i === 0) ctx.lineTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.lineTo(padding + (data.length - 1) * xStep, h);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw line
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = padding + i * xStep;
    const y = h - padding - ((data[i] - min) / range) * (h - padding * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/**
 * Destroy chart instance and clean up
 */
export function destroyChart() {
  if (resizeObserver && currentContainer) {
    resizeObserver.unobserve(currentContainer);
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  Object.keys(overlaySeries).forEach(key => delete overlaySeries[key]);

  if (chartInstance) {
    chartInstance.remove();
    chartInstance = null;
    candleSeries = null;
    volumeSeries = null;
  }
}

/**
 * Get the chart instance
 */
export function getChart() {
  return chartInstance;
}

export default {
  initChart,
  setChartData,
  setOverlay,
  setBollingerBands,
  removeOverlay,
  setSupportResistance,
  setPatternMarkers,
  drawSparkline,
  destroyChart,
  getChart,
  COLORS,
};
