/**
 * Stock Data API Module
 * Handles Alpha Vantage API integration and demo data generation
 */

const API_BASE = 'https://www.alphavantage.co/query';

/** Popular stock symbols for search autocomplete */
export const POPULAR_SYMBOLS = [
  // Indian Equities (NIFTY 50 & High-Volume Tickers)
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries Ltd' },
  { symbol: 'TCS.NS', name: 'Tata Consultancy Services Ltd' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank Ltd' },
  { symbol: 'INFY.NS', name: 'Infosys Ltd' },
  { symbol: 'ICICIBANK.NS', name: 'ICICI Bank Ltd' },
  { symbol: 'SBIN.NS', name: 'State Bank of India' },
  { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel Ltd' },
  { symbol: 'ITC.NS', name: 'ITC Ltd' },
  { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever Ltd' },
  { symbol: 'LTIM.NS', name: 'LTIMindtree Ltd' },
  { symbol: 'LT.NS', name: 'Larsen & Toubro Ltd' },
  { symbol: 'BAJFINANCE.NS', name: 'Bajaj Finance Ltd' },
  { symbol: 'MARUTI.NS', name: 'Maruti Suzuki India Ltd' },
  { symbol: 'TATASTEEL.NS', name: 'Tata Steel Ltd' },
  { symbol: 'WIPRO.NS', name: 'Wipro Ltd' },
  { symbol: 'TATAMOTORS.NS', name: 'Tata Motors Ltd' },
  { symbol: 'AXISBANK.NS', name: 'Axis Bank Ltd' },
  { symbol: 'ADANIENT.NS', name: 'Adani Enterprises Ltd' },
  { symbol: 'ADANIPORTS.NS', name: 'Adani Ports & SEZ Ltd' },
  { symbol: 'POWERGRID.NS', name: 'Power Grid Corp of India' },
  { symbol: 'ONGC.NS', name: 'Oil & Natural Gas Corp Ltd' },
  { symbol: 'NTPC.NS', name: 'NTPC Ltd' },
  { symbol: 'COALINDIA.NS', name: 'Coal India Ltd' },
  { symbol: 'JIOFIN.NS', name: 'Jio Financial Services Ltd' },
  { symbol: 'IREDA.NS', name: 'Indian Renewable Energy Dev Agency' },
  { symbol: 'YESBANK.NS', name: 'Yes Bank Ltd' },

  // US Equities (NASDAQ & NYSE Giants)
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  { symbol: 'META', name: 'Meta Platforms Inc.' },
  { symbol: 'NFLX', name: 'Netflix Inc.' },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.' },
  { symbol: 'INTC', name: 'Intel Corporation' },
  { symbol: 'QCOM', name: 'Qualcomm Inc.' },
  { symbol: 'AVGO', name: 'Broadcom Inc.' },
  { symbol: 'CRM', name: 'Salesforce Inc.' },
  { symbol: 'ADBE', name: 'Adobe Inc.' },
  { symbol: 'PYPL', name: 'PayPal Holdings Inc.' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
  { symbol: 'BAC', name: 'Bank of America Corp' },
  { symbol: 'WMT', name: 'Walmart Inc.' },
  { symbol: 'COST', name: 'Costco Wholesale Corp' },
  { symbol: 'DIS', name: 'The Walt Disney Company' },
  { symbol: 'NKE', name: 'Nike Inc.' },
  { symbol: 'SBUX', name: 'Starbucks Corporation' },
  { symbol: 'XOM', name: 'Exxon Mobil Corp' },
  { symbol: 'CVX', name: 'Chevron Corp' },
  { symbol: 'KO', name: 'The Coca-Cola Company' },
  { symbol: 'PEP', name: 'PepsiCo Inc.' },
  { symbol: 'LLY', name: 'Eli Lilly & Company' },
  { symbol: 'JNJ', name: 'Johnson & Johnson' },
  { symbol: 'MRK', name: 'Merck & Co. Inc.' },
  { symbol: 'PFE', name: 'Pfizer Inc.' },
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

export function isValidSymbol(symbol) {
  if (!symbol) return false;
  const s = symbol.toUpperCase();
  return POPULAR_SYMBOLS.some(x => x.symbol === s);
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

    // Check if the symbol is a US stock (does not end in .NS)
    const isUSStock = !symbol.toUpperCase().endsWith('.NS');
    const usdToInrRate = 84.50; // USD to INR rate (May 2025)

    const data = Object.entries(timeSeries)
      .map(([date, values]) => {
        let open = parseFloat(values['1. open']);
        let high = parseFloat(values['2. high']);
        let low = parseFloat(values['3. low']);
        let close = parseFloat(values['4. close']);

        if (isUSStock) {
          open *= usdToInrRate;
          high *= usdToInrRate;
          low *= usdToInrRate;
          close *= usdToInrRate;
        }

        return {
          time: date,
          open: parseFloat(open.toFixed(2)),
          high: parseFloat(high.toFixed(2)),
          low: parseFloat(low.toFixed(2)),
          close: parseFloat(close.toFixed(2)),
          volume: parseInt(values['5. volume'], 10),
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time));

    setCache(cacheKey, data);
    return data;
  } catch (err) {
    console.error('API fetch error:', err);
    throw err;
  }
}

const REAL_WORLD_PRICES = {
  // Indian Stocks Reference Prices (NSE values — May 2025)
  'RELIANCE.NS': 1408.00,
  'TCS.NS': 3204.00,
  'HDFCBANK.NS': 1911.00,
  'INFY.NS': 1591.00,
  'ICICIBANK.NS': 1416.00,
  'SBIN.NS': 818.00,
  'BHARTIARTL.NS': 1893.00,
  'ITC.NS': 415.00,
  'HINDUNILVR.NS': 2375.00,
  'LTIM.NS': 4842.00,
  'LT.NS': 3425.00,
  'BAJFINANCE.NS': 9085.00,
  'MARUTI.NS': 12530.00,
  'TATASTEEL.NS': 152.00,
  'WIPRO.NS': 249.00,
  'TATAMOTORS.NS': 729.00,
  'AXISBANK.NS': 1195.00,
  'ADANIENT.NS': 2268.00,
  'ADANIPORTS.NS': 1333.00,
  'POWERGRID.NS': 293.00,
  'ONGC.NS': 241.00,
  'NTPC.NS': 362.00,
  'COALINDIA.NS': 388.00,
  'JIOFIN.NS': 280.00,
  'IREDA.NS': 163.00,
  'YESBANK.NS': 18.50,

  // US Stocks — USD prices (May 2025) converted to INR at 84.50/USD
  AAPL: 17238.00,       // $204.00 * 84.50
  MSFT: 37153.00,       // $439.75 * 84.50
  GOOGL: 14364.00,      // $169.99 * 84.50
  AMZN: 16645.00,       // $197.00 * 84.50
  TSLA: 27083.00,       // $320.63 * 84.50
  NVDA: 112388.00,      // $1330.00 * 84.50
  META: 53753.00,       // $636.13 * 84.50
  NFLX: 103190.00,      // $1221.18 * 84.50
  AMD: 11432.00,        // $135.29 * 84.50
  INTC: 1868.00,        // $22.11 * 84.50
  QCOM: 15818.00,       // $187.19 * 84.50
  AVGO: 182900.00,      // $2164.50 * 84.50
  CRM: 28458.00,        // $336.78 * 84.50
  ADBE: 36380.00,       // $430.53 * 84.50
  PYPL: 6671.00,        // $78.94 * 84.50
  JPM: 18534.00,        // $219.34 * 84.50
  BAC: 3494.00,         // $41.35 * 84.50
  WMT: 9775.00,         // $115.68 * 84.50
  COST: 105625.00,      // $1250.00 * 84.50
  DIS: 9853.00,         // $116.60 * 84.50
  NKE: 6248.00,         // $73.94 * 84.50
  SBUX: 6655.00,        // $78.76 * 84.50
  XOM: 9393.00,         // $111.16 * 84.50
  CVX: 13018.00,        // $154.06 * 84.50
  KO: 5753.00,          // $68.08 * 84.50
  PEP: 12784.00,        // $151.29 * 84.50
  LLY: 71774.00,        // $849.40 * 84.50
  JNJ: 13520.00,        // $159.99 * 84.50
  MRK: 8271.00,         // $97.88 * 84.50
  PFE: 2396.00,         // $28.36 * 84.50
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
  const targetPrice = REAL_WORLD_PRICES[upperSymbol] || (500 + rng() * 2000);
  const drift = (rng() - 0.45) * 0.0008; // slight upward bias
  const volatility = 0.012 + rng() * 0.02; // 1.2% - 3.2% daily vol
  const trendStrength = 0.0003;

  const baseVolume = 5000000 + Math.floor(rng() * 30000000);

  // Create a longer-term trend cycle
  const trendPeriod = 60 + Math.floor(rng() * 120);
  const trendAmplitude = 0.0005 + rng() * 0.001;

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  // Occasionally inject patterns
  const patternStart = Math.floor(days * 0.5 + rng() * days * 0.3);
  const patternType = Math.floor(rng() * 4); // 0: H&S, 1: double top, 2: triangle, 3: none

  // Pass 1: Simulate raw log-returns starting from 1.0 (normalised)
  // This gives us the shape of the price path; we rescale to targetPrice at the end
  const rawCloses = [];
  let rawPrice = 1.0;

  for (let i = 0; i < days; i++) {
    const trendCycle = Math.sin((2 * Math.PI * i) / trendPeriod) * trendAmplitude;
    const logReturn = drift + trendCycle + trendStrength * Math.sin(i / 30) +
      volatility * gaussianRandom(rng);

    let patternMod = 0;
    if (patternType < 3 && i >= patternStart && i < patternStart + 40) {
      const phase = (i - patternStart) / 40;
      if (patternType === 0) {
        patternMod = Math.sin(phase * Math.PI * 3) * 0.008 * (1 - phase);
      } else if (patternType === 1) {
        patternMod = Math.sin(phase * Math.PI * 4) * 0.006;
      } else {
        patternMod = Math.sin(phase * Math.PI * 6) * 0.005 * (1 - phase);
      }
    }

    rawPrice = rawPrice * Math.exp(logReturn + patternMod);
    if (rawPrice < 0.001) rawPrice = 0.001;
    rawCloses.push(rawPrice);
  }

  // Rescale so the LAST close lands exactly on targetPrice (today's real price)
  const finalRaw = rawCloses[rawCloses.length - 1];
  const scaleFactor = targetPrice / finalRaw;

  // Pass 2: Build OHLC data using scaled prices
  const data = [];
  let currentDate = new Date(startDate);

  for (let i = 0; i < days; i++) {
    // Skip weekends
    while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const dateStr = currentDate.toISOString().split('T')[0];
    const close = rawCloses[i] * scaleFactor;

    // Percentage-based intraday spread -- works at any price level
    const spreadPct = volatility * 1.5;
    const open = close * (1 + (rng() - 0.5) * volatility * 0.5);
    const high = Math.max(open, close) * (1 + rng() * spreadPct);
    const low  = Math.min(open, close) * (1 - rng() * spreadPct);

    // Volume with randomness and occasional spikes
    const volumeMultiplier = 0.5 + rng() * 1.5;
    const volumeSpike = rng() > 0.93 ? 2 + rng() * 3 : 1;
    const volume = Math.floor(baseVolume * volumeMultiplier * volumeSpike);

    data.push({
      time: dateStr,
      open: roundPrice(open),
      high: roundPrice(high),
      low: roundPrice(Math.max(low, 0.01)),
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
  isValidSymbol,
  fetchStockData,
  generateDemoData,
  filterByTimeframe,
  getStockMeta,
  POPULAR_SYMBOLS,
};
