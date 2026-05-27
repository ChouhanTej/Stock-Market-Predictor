/**
 * Stock Data API Module
 * Handles Alpha Vantage API integration and demo data generation
 */

const API_BASE = 'https://www.alphavantage.co/query';

/** Popular stock symbols for search autocomplete */
const POPULAR_SYMBOLS = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries Ltd' },
  { symbol: 'TCS.NS', name: 'Tata Consultancy Services Ltd' },
  { symbol: 'IREDA.NS', name: 'Indian Renewable Energy Development Agency' },
  { symbol: 'YESBANK.NS', name: 'Yes Bank Ltd' },
  { symbol: 'META', name: 'Meta Platforms Inc.' },
  { symbol: 'NFLX', name: 'Netflix Inc.' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
  { symbol: 'V', name: 'Visa Inc.' },
  { symbol: 'WMT', name: 'Walmart Inc.' },
  { symbol: 'DIS', name: 'The Walt Disney Company' },
  { symbol: 'AMD', name: 'Advanced Micro Devices' },
];

/**
 * Simple in-memory cache to avoid redundant API calls
 */
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_DURATION) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Search symbols matching query
 * @param {string} query
 * @returns {Array<{symbol: string, name: string}>}
 */
export function searchSymbols(query) {
  if (!query || query.length < 1) return [];
  const q = query.toUpperCase();
  return POPULAR_SYMBOLS.filter(
    s => s.symbol.includes(q) || s.name.toUpperCase().includes(q)
  ).slice(0, 8);
}

/**
 * Fetch daily stock data from Alpha Vantage
 * @param {string} symbol
 * @param {string} apiKey
 * @param {string} outputSize - 'compact' (100 days) or 'full' (20+ years)
 * @returns {Promise<Array<{time: string, open: number, high: number, low: number, close: number, volume: number}>>}
 */
export async function fetchStockData(symbol, apiKey, outputSize = 'full') {
  const cacheKey = `${symbol}-${outputSize}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `${API_BASE}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=${outputSize}&apikey=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();

    // Check for API error messages
    if (json['Error Message']) {
      throw new Error('Invalid symbol or API error');
    }
    if (json['Note']) {
      throw new Error('API rate limit reached. Please wait or use Demo Mode.');
    }
    if (json['Information']) {
      throw new Error('API call limit reached. Please use Demo Mode.');
    }

    const timeSeries = json['Time Series (Daily)'];
    if (!timeSeries) {
      throw new Error('No data returned from API');
    }

    const data = Object.entries(timeSeries)
      .map(([date, values]) => ({
        time: date,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume'], 10),
      }))
      .sort((a, b) => a.time.localeCompare(b.time));

    setCache(cacheKey, data);
    return data;
  } catch (err) {
    console.error('API fetch error:', err);
    throw err;
  }
}

const REAL_WORLD_PRICES = {
  'RELIANCE.NS': 2910.15,
  'TCS.NS': 3842.10,
  'IREDA.NS': 188.40,
  'YESBANK.NS': 21.40,
  AAPL: 15400.00,
  MSFT: 35000.00,
  GOOGL: 14500.00,
  AMZN: 14800.00,
  TSLA: 14700.00,
  NVDA: 88000.00,
  META: 38000.00,
  NFLX: 50000.00,
  AMD: 13500.00,
};

/**
 * Generate realistic demo stock data
 * Uses geometric Brownian motion with mean reversion and trend components
 * @param {string} symbol
 * @param {number} days
 * @returns {Array<{time: string, open: number, high: number, low: number, close: number, volume: number}>}
 */
export function generateDemoData(symbol, days = 365) {
  // Seed parameters based on symbol for consistency
  const seedVal = symbolHash(symbol);
  const rng = seededRandom(seedVal);

  // Base parameters
  const upperSymbol = symbol.toUpperCase();
  const startPrice = REAL_WORLD_PRICES[upperSymbol] || (80 + rng() * 200);
  const drift = (rng() - 0.45) * 0.0008; // slight upward bias
  const volatility = 0.012 + rng() * 0.02; // 1.2% - 3.2% daily vol
  const meanReversion = 0.002;
  const trendStrength = 0.0003;

  const data = [];
  let price = startPrice;
  const baseVolume = 5000000 + Math.floor(rng() * 30000000);

  // Create a longer-term trend cycle
  const trendPeriod = 60 + Math.floor(rng() * 120);
  const trendAmplitude = 0.0005 + rng() * 0.001;

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  let currentDate = new Date(startDate);

  // Occasionally inject patterns
  const patternStart = Math.floor(days * 0.5 + rng() * days * 0.3);
  const patternType = Math.floor(rng() * 4); // 0: H&S, 1: double top, 2: triangle, 3: none

  for (let i = 0; i < days; i++) {
    // Skip weekends
    while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const dateStr = currentDate.toISOString().split('T')[0];

    // Trend component (sinusoidal)
    const trendCycle = Math.sin((2 * Math.PI * i) / trendPeriod) * trendAmplitude;

    // Mean reversion to moving average (simulated)
    const logReturn = drift + trendCycle + trendStrength * Math.sin(i / 30) +
      volatility * gaussianRandom(rng);

    // Optional: inject pattern behavior
    let patternMod = 0;
    if (patternType < 3 && i >= patternStart && i < patternStart + 40) {
      const phase = (i - patternStart) / 40;
      if (patternType === 0) {
        // Head and shoulders: up, higher up, down
        patternMod = Math.sin(phase * Math.PI * 3) * 0.008 * (1 - phase);
      } else if (patternType === 1) {
        // Double top: up, down, up, down
        patternMod = Math.sin(phase * Math.PI * 4) * 0.006;
      } else {
        // Triangle: converging
        patternMod = Math.sin(phase * Math.PI * 6) * 0.005 * (1 - phase);
      }
    }

    price = price * Math.exp(logReturn + patternMod);

    // Ensure price stays realistic
    if (price < 5) price = 5 + rng() * 5;
    if (price > 2000) price = 1800 + rng() * 100;

    // Generate OHLC from close
    const dailyVol = volatility * price;
    const open = price * (1 + (rng() - 0.5) * 0.01);
    const high = Math.max(open, price) + rng() * dailyVol * 1.5;
    const low = Math.min(open, price) - rng() * dailyVol * 1.5;
    const close = price;

    // Volume with some randomness and volume spikes
    const volumeMultiplier = 0.5 + rng() * 1.5;
    const volumeSpike = rng() > 0.93 ? 2 + rng() * 3 : 1;
    const volume = Math.floor(baseVolume * volumeMultiplier * volumeSpike);

    data.push({
      time: dateStr,
      open: roundPrice(open),
      high: roundPrice(high),
      low: roundPrice(Math.max(low, 0.5)),
      close: roundPrice(close),
      volume,
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return data;
}

/**
 * Filter data based on timeframe selection
 * @param {Array} data - Full dataset
 * @param {string} timeframe - '1D', '1W', '1M', '3M', '1Y', 'ALL'
 * @returns {Array}
 */
export function filterByTimeframe(data, timeframe) {
  if (!data || data.length === 0) return [];
  if (timeframe === 'ALL') return data;

  const now = new Date(data[data.length - 1].time);
  let cutoff = new Date(now);

  switch (timeframe) {
    case '1W':
      cutoff.setDate(cutoff.getDate() - 7);
      break;
    case '1M':
      cutoff.setMonth(cutoff.getMonth() - 1);
      break;
    case '3M':
      cutoff.setMonth(cutoff.getMonth() - 3);
      break;
    case '6M':
      cutoff.setMonth(cutoff.getMonth() - 6);
      break;
    case '1Y':
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      break;
    default:
      return data;
  }

  const cutoffStr = cutoff.toISOString().split('T')[0];
  return data.filter(d => d.time >= cutoffStr);
}

/**
 * Get stock metadata summary from data
 */
export function getStockMeta(data) {
  if (!data || data.length === 0) return null;

  const latest = data[data.length - 1];
  const previous = data.length > 1 ? data[data.length - 2] : latest;
  const first = data[0];

  const change = latest.close - previous.close;
  const changePercent = (change / previous.close) * 100;
  const periodChange = latest.close - first.close;
  const periodChangePercent = (periodChange / first.close) * 100;

  // Find high/low of the period
  let periodHigh = -Infinity, periodLow = Infinity, totalVolume = 0;
  for (const d of data) {
    if (d.high > periodHigh) periodHigh = d.high;
    if (d.low < periodLow) periodLow = d.low;
    totalVolume += d.volume;
  }

  const avgVolume = Math.floor(totalVolume / data.length);

  return {
    price: latest.close,
    change,
    changePercent,
    periodChange,
    periodChangePercent,
    open: latest.open,
    high: latest.high,
    low: latest.low,
    volume: latest.volume,
    periodHigh,
    periodLow,
    avgVolume,
  };
}

/* ---- Utility functions ---- */

function roundPrice(val) {
  return Math.round(val * 100) / 100;
}

function symbolHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed) {
  let s = seed || 42;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function gaussianRandom(rng) {
  // Box-Muller transform
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export default {
  searchSymbols,
  fetchStockData,
  generateDemoData,
  filterByTimeframe,
  getStockMeta,
  POPULAR_SYMBOLS,
};
