/**
 * Normalize a price that may have been returned in cents (e.g. some
 * exchanges via Yahoo Finance / Finnhub return in minor currency units).
 * Rule: if a stock is a US stock (no .NS) and price > $5000, it is almost
 * certainly in cents — divide by 100.
 * This also catches Finnhub quirks for certain tickers.
 */
function normalizePriceUSD(price, symbol) {
  if (!price || price <= 0) return price;
  const isUS = !symbol.toUpperCase().endsWith('.NS');
  // US blue-chips above $5000 don't exist (NVDA tops ~$1350, BRK.A excluded)
  if (isUS && price > 5000) {
    console.warn(`[API] Price sanity: ${symbol} raw=${price} looks like cents → dividing by 100 → ${price/100}`);
    return parseFloat((price / 100).toFixed(2));
  }
  return parseFloat(price.toFixed(2));
}

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const FINNHUB_KEY  = 'd99lb7hr01qssj13qt4gd99lb7hr01qssj13qt50';

/** Convert .NS Yahoo symbol → Finnhub NSE format (e.g. RELIANCE.NS → NSE:RELIANCE) */
function toFinnhubSymbol(symbol) {
  const s = symbol.toUpperCase();
  if (s.endsWith('.NS')) return `NSE:${s.replace('.NS', '')}`;
  return s; // US stocks unchanged: AAPL, TSLA, etc.
}

/** Popular stock symbols for search autocomplete */
export const POPULAR_SYMBOLS = [
  // Indian Equities (NIFTY 50 & High-Volume Tickers)
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries Ltd' },
  { symbol: 'TCS.NS',      name: 'Tata Consultancy Services Ltd' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank Ltd' },
  { symbol: 'INFY.NS',     name: 'Infosys Ltd' },
  { symbol: 'ICICIBANK.NS',name: 'ICICI Bank Ltd' },
  { symbol: 'SBIN.NS',     name: 'State Bank of India' },
  { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel Ltd' },
  { symbol: 'ITC.NS',      name: 'ITC Ltd' },
  { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever Ltd' },
  { symbol: 'LTIM.NS',     name: 'LTIMindtree Ltd' },
  { symbol: 'LT.NS',       name: 'Larsen & Toubro Ltd' },
  { symbol: 'BAJFINANCE.NS', name: 'Bajaj Finance Ltd' },
  { symbol: 'MARUTI.NS',   name: 'Maruti Suzuki India Ltd' },
  { symbol: 'TATASTEEL.NS',name: 'Tata Steel Ltd' },
  { symbol: 'WIPRO.NS',    name: 'Wipro Ltd' },
  { symbol: 'TATAMOTORS.NS', name: 'Tata Motors Ltd' },
  { symbol: 'AXISBANK.NS', name: 'Axis Bank Ltd' },
  { symbol: 'ADANIENT.NS', name: 'Adani Enterprises Ltd' },
  { symbol: 'ADANIPORTS.NS', name: 'Adani Ports & SEZ Ltd' },
  { symbol: 'POWERGRID.NS', name: 'Power Grid Corp of India' },
  { symbol: 'ONGC.NS',     name: 'Oil & Natural Gas Corp Ltd' },
  { symbol: 'NTPC.NS',     name: 'NTPC Ltd' },
  { symbol: 'COALINDIA.NS',name: 'Coal India Ltd' },
  { symbol: 'JIOFIN.NS',   name: 'Jio Financial Services Ltd' },
  { symbol: 'IREDA.NS',    name: 'Indian Renewable Energy Dev Agency' },
  { symbol: 'YESBANK.NS',  name: 'Yes Bank Ltd' },

  // US Equities (NASDAQ & NYSE Giants)
  { symbol: 'AAPL',  name: 'Apple Inc.' },
  { symbol: 'MSFT',  name: 'Microsoft Corporation' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'AMZN',  name: 'Amazon.com Inc.' },
  { symbol: 'TSLA',  name: 'Tesla Inc.' },
  { symbol: 'NVDA',  name: 'NVIDIA Corporation' },
  { symbol: 'META',  name: 'Meta Platforms Inc.' },
  { symbol: 'NFLX',  name: 'Netflix Inc.' },
  { symbol: 'AMD',   name: 'Advanced Micro Devices Inc.' },
  { symbol: 'INTC',  name: 'Intel Corporation' },
  { symbol: 'QCOM',  name: 'Qualcomm Inc.' },
  { symbol: 'AVGO',  name: 'Broadcom Inc.' },
  { symbol: 'CRM',   name: 'Salesforce Inc.' },
  { symbol: 'ADBE',  name: 'Adobe Inc.' },
  { symbol: 'PYPL',  name: 'PayPal Holdings Inc.' },
  { symbol: 'JPM',   name: 'JPMorgan Chase & Co.' },
  { symbol: 'BAC',   name: 'Bank of America Corp' },
  { symbol: 'WMT',   name: 'Walmart Inc.' },
  { symbol: 'COST',  name: 'Costco Wholesale Corp' },
  { symbol: 'DIS',   name: 'The Walt Disney Company' },
  { symbol: 'NKE',   name: 'Nike Inc.' },
  { symbol: 'SBUX',  name: 'Starbucks Corporation' },
  { symbol: 'XOM',   name: 'Exxon Mobil Corp' },
  { symbol: 'CVX',   name: 'Chevron Corp' },
  { symbol: 'KO',    name: 'The Coca-Cola Company' },
  { symbol: 'PEP',   name: 'PepsiCo Inc.' },
  { symbol: 'LLY',   name: 'Eli Lilly & Company' },
  { symbol: 'JNJ',   name: 'Johnson & Johnson' },
  { symbol: 'MRK',   name: 'Merck & Co. Inc.' },
  { symbol: 'PFE',   name: 'Pfizer Inc.' },
];

/** Search symbols matching query */
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

/* ====================================================
   HISTORICAL CANDLES — Finnhub /stock/candle
   ==================================================== */

const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 min

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_DURATION) return entry.data;
  cache.delete(key);
  return null;
}
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Fetch daily OHLCV candles via Finnhub /stock/candle
 * Falls back to Yahoo Finance candles via corsproxy.io if Finnhub returns no_data.
 * @param {string} symbol  - App-format symbol e.g. 'AAPL' or 'RELIANCE.NS'
 * @param {string} _apiKey - ignored (key is embedded); kept for API compatibility
 * @param {string} outputSize - 'compact' (~100 days) | 'full' (~2 years)
 */
export async function fetchStockData(symbol, _apiKey, outputSize = 'full') {
  const cacheKey = `candles-${symbol}-${outputSize}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const days = outputSize === 'compact' ? 120 : 730;
  const to   = Math.floor(Date.now() / 1000);
  const from = to - days * 86400;

  // 1. Try Finnhub candles
  try {
    const fhSym = toFinnhubSymbol(symbol);
    const url = `${FINNHUB_BASE}/stock/candle?symbol=${encodeURIComponent(fhSym)}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const json = await res.json();
      if (json.s === 'ok' && json.c && json.c.length > 0) {
        // Log first candle for price debugging
        console.log(`[API] Finnhub candle sample ${symbol}:`, { o: json.o[0], h: json.h[0], l: json.l[0], c: json.c[0] });
        const data = json.t.map((ts, i) => ({
          time:   new Date(ts * 1000).toISOString().split('T')[0],
          open:   normalizePriceUSD(json.o[i], symbol),
          high:   normalizePriceUSD(json.h[i], symbol),
          low:    normalizePriceUSD(json.l[i], symbol),
          close:  normalizePriceUSD(json.c[i], symbol),
          volume: json.v[i] || 0,
        })).sort((a, b) => a.time.localeCompare(b.time));

        setCache(cacheKey, data);
        return data;
      }
    }
  } catch (_) { /* fall through */ }

  // 2. Yahoo Finance via multiple CORS proxies (works for both US and .NS stocks)
  const range = outputSize === 'compact' ? '6mo' : '2y';
  const yhUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  
  const isNode = typeof window === 'undefined';
  const localOrigin = isNode ? 'http://localhost:8080' : '';
  const proxies = [
    `${localOrigin}/api/proxy?url=${encodeURIComponent(yhUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(yhUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yhUrl)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(yhUrl)}`,
    yhUrl // direct fetch
  ];

  console.log(`[API] Ingestion URL: ${yhUrl}`);
  for (const proxy of proxies) {
    try {
      console.log(`[API] Trying Yahoo fetch via proxy: ${proxy}`);
      const res = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
      console.log(`[API] Proxy status: ${res.status}`);
      if (res.ok) {
        const json = await res.json();
        console.log(`[API] Raw response:`, json);
        const result = json?.chart?.result?.[0];
        if (result?.timestamp) {
          const ts   = result.timestamp;
          const q    = result.indicators?.quote?.[0] || {};
          console.log(`[API] Yahoo candle sample ${symbol} fetched successfully via ${proxy}`);
          
          const data = ts.map((t, i) => ({
            time:   new Date(t * 1000).toISOString().split('T')[0],
            open:   normalizePriceUSD(q.open?.[i]  || 0, symbol),
            high:   normalizePriceUSD(q.high?.[i]  || 0, symbol),
            low:    normalizePriceUSD(q.low?.[i]   || 0, symbol),
            close:  normalizePriceUSD(q.close?.[i] || 0, symbol),
            volume: Math.round(q.volume?.[i] || 0),
          }))
          .filter(d => d.close > 0)
          .sort((a, b) => a.time.localeCompare(b.time));

          if (data.length > 0) {
            setCache(cacheKey, data);
            return data;
          } else {
            console.warn(`[API] Historical data array is empty for ${symbol} after parsing.`);
          }
        } else {
          console.warn(`[API] Yahoo Finance response missing chart.result or timestamp:`, json);
        }
      }
    } catch (e) {
      console.warn(`[API] Proxy failed: ${proxy} - ${e.message}`);
    }
  }

  // 3. Nothing worked — throw a descriptive error
  throw new Error(`Historical API returned an empty array or failed to fetch for ${symbol}. All proxies exhausted.`);
}

/* ====================================================
   FALLBACK / DEMO PRICES  (native currency, no conversion)
   ==================================================== */
const FALLBACK_PRICES = {
  // Indian Stocks — NSE (INR)
  'RELIANCE.NS':  1408, 'TCS.NS':      3204, 'HDFCBANK.NS': 1911,
  'INFY.NS':      1591, 'ICICIBANK.NS':1416, 'SBIN.NS':      818,
  'BHARTIARTL.NS':1893, 'ITC.NS':       415, 'HINDUNILVR.NS':2375,
  'LTIM.NS':      4842, 'LT.NS':       3425, 'BAJFINANCE.NS':9085,
  'MARUTI.NS':   12530, 'TATASTEEL.NS': 152, 'WIPRO.NS':      249,
  'TATAMOTORS.NS': 729, 'AXISBANK.NS': 1195, 'ADANIENT.NS':  2268,
  'ADANIPORTS.NS':1333, 'POWERGRID.NS': 293, 'ONGC.NS':       241,
  'NTPC.NS':       362, 'COALINDIA.NS': 388, 'JIOFIN.NS':     280,
  'IREDA.NS':      163, 'YESBANK.NS':  18.5,

  // US Stocks — native USD
  AAPL:  204, MSFT:  440, GOOGL: 170, AMZN:  197, TSLA:  320,
  NVDA: 1330, META:  636, NFLX: 1221, AMD:   135, INTC:  22.1,
  QCOM:  187, AVGO: 2165, CRM:   337, ADBE:  430, PYPL:  78.9,
  JPM:   219, BAC:  41.3, WMT:  115.7,COST: 1249, DIS:  116.6,
  NKE:  73.9, SBUX: 78.7, XOM:  111.1, CVX:  154, KO:   68.1,
  PEP:  151.3,LLY:   849, JNJ:  159.9, MRK:  97.8, PFE:  28.3,
};

/* ====================================================
   LIVE PRICE  — Finnhub /quote  (primary)
   ==================================================== */
const livePriceCache = new Map();

/**
 * Fetch the current market price via Finnhub /quote.
 * Falls back to Yahoo Finance, then static snapshot.
 *
 * @param {string}  symbol       - e.g. 'AAPL' or 'RELIANCE.NS'
 * @param {string}  [_apiKey]    - unused (Finnhub key embedded)
 * @param {boolean} [bypassCache=false] - skip in-memory & sessionStorage cache
 * @returns {Promise<number>}     Price in native currency
 */
export async function fetchLivePrice(symbol, _apiKey, bypassCache = false) {
  const upper      = symbol.toUpperCase();
  const sessionKey = `smai_price_${upper}`;

  // 1. In-memory cache
  if (!bypassCache && livePriceCache.has(upper)) return livePriceCache.get(upper);

  // 2. sessionStorage cache (15 min)
  if (!bypassCache) {
    try {
      const stored = sessionStorage.getItem(sessionKey);
      if (stored) {
        const { price, ts } = JSON.parse(stored);
        if (Date.now() - ts < 15 * 60 * 1000) {
          livePriceCache.set(upper, price);
          return price;
        }
      }
    } catch (_) {}
  }

  const save = (price) => {
    livePriceCache.set(upper, price);
    try { sessionStorage.setItem(sessionKey, JSON.stringify({ price, ts: Date.now() })); } catch (_) {}
    return price;
  };

  // 3. Finnhub /quote (primary — real-time, keyed)
  try {
    const fhSym = toFinnhubSymbol(symbol);
    const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(fhSym)}&token=${FINNHUB_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = await res.json();
      console.log(`[API] Finnhub quote ${symbol}:`, json);
      const rawPrice = json.c; // current price
      if (rawPrice && rawPrice > 0) return save(normalizePriceUSD(rawPrice, symbol));
    }
  } catch (_) {}

  // 4. Yahoo Finance via multiple CORS proxies (no key needed, works for .NS too)
  const yhUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
  
  const isNode = typeof window === 'undefined';
  const localOrigin = isNode ? 'http://localhost:8080' : '';
  const proxies = [
    `${localOrigin}/api/proxy?url=${encodeURIComponent(yhUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(yhUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yhUrl)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(yhUrl)}`,
    yhUrl
  ];

  console.log(`[API] Live quote Ingestion URL: ${yhUrl}`);
  for (const proxy of proxies) {
    try {
      console.log(`[API] Trying Yahoo quote via proxy: ${proxy}`);
      const res = await fetch(proxy, { signal: AbortSignal.timeout(5000) });
      console.log(`[API] Quote proxy status: ${res.status}`);
      if (res.ok) {
        const json = await res.json();
        const meta  = json?.chart?.result?.[0]?.meta;
        const rawPrice = meta?.regularMarketPrice ?? meta?.previousClose;
        if (rawPrice && rawPrice > 0) {
          console.log(`[API] Yahoo quote ${symbol} fetched successfully via ${proxy}:`, rawPrice);
          return save(normalizePriceUSD(rawPrice, symbol));
        }
      }
    } catch (e) {
      console.warn(`[API] Quote proxy failed: ${proxy} - ${e.message}`);
    }
  }

  // 5. Throw error if everything fails
  throw new Error(`Failed to fetch live quote for ${symbol} from all sources.`);
}

/** Pre-warm prices for several symbols in the background */
export async function warmLivePrices(symbols) {
  await Promise.allSettled(symbols.map(s => fetchLivePrice(s)));
}

/* ====================================================
   DEMO DATA GENERATOR  (Geometric Brownian Motion)
   ==================================================== */
export function generateDemoData(symbol, days = 365, overridePrice = null) {
  const seedVal   = symbolHash(symbol);
  const rng       = seededRandom(seedVal);
  const upper     = symbol.toUpperCase();
  const targetPrice = overridePrice ?? FALLBACK_PRICES[upper] ?? (100 + rng() * 500);

  const drift        = (rng() - 0.45) * 0.0008;
  const volatility   = 0.012 + rng() * 0.02;
  const trendStrength= 0.0003;
  const baseVolume   = 5_000_000 + Math.floor(rng() * 30_000_000);
  const trendPeriod  = 60 + Math.floor(rng() * 120);
  const trendAmplitude = 0.0005 + rng() * 0.001;

  const endDate   = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  const patternStart = Math.floor(days * 0.5 + rng() * days * 0.3);
  const patternType  = Math.floor(rng() * 4);

  const rawCloses = [];
  let rawPrice = 1.0;

  for (let i = 0; i < days; i++) {
    const trendCycle = Math.sin((2 * Math.PI * i) / trendPeriod) * trendAmplitude;
    const logReturn  = drift + trendCycle + trendStrength * Math.sin(i / 30) +
                       volatility * gaussianRandom(rng);
    let patternMod = 0;
    if (patternType < 3 && i >= patternStart && i < patternStart + 40) {
      const phase = (i - patternStart) / 40;
      if      (patternType === 0) patternMod = Math.sin(phase * Math.PI * 3) * 0.008 * (1 - phase);
      else if (patternType === 1) patternMod = Math.sin(phase * Math.PI * 4) * 0.006;
      else                        patternMod = Math.sin(phase * Math.PI * 6) * 0.005 * (1 - phase);
    }
    rawPrice = rawPrice * Math.exp(logReturn + patternMod);
    if (rawPrice < 0.001) rawPrice = 0.001;
    rawCloses.push(rawPrice);
  }

  const scaleFactor = targetPrice / rawCloses[rawCloses.length - 1];
  const data = [];
  let currentDate = new Date(startDate);

  for (let i = 0; i < days; i++) {
    while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    const close = rawCloses[i] * scaleFactor;
    const spreadPct = volatility * 1.5;
    const open  = close * (1 + (rng() - 0.5) * volatility * 0.5);
    const high  = Math.max(open, close) * (1 + rng() * spreadPct);
    const low   = Math.min(open, close) * (1 - rng() * spreadPct);
    const volumeSpike = rng() > 0.93 ? 2 + rng() * 3 : 1;
    const volume = Math.floor(baseVolume * (0.5 + rng() * 1.5) * volumeSpike);

    data.push({
      time:   currentDate.toISOString().split('T')[0],
      open:   roundPrice(open),
      high:   roundPrice(high),
      low:    roundPrice(Math.max(low, 0.01)),
      close:  roundPrice(close),
      volume,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return data;
}

/* ====================================================
   TIMEFRAME FILTER & META
   ==================================================== */
export function filterByTimeframe(data, timeframe) {
  if (!data || data.length === 0) return [];
  if (timeframe === 'ALL') return data;

  const now    = new Date(data[data.length - 1].time);
  const cutoff = new Date(now);
  switch (timeframe) {
    case '1W': cutoff.setDate(cutoff.getDate() - 7);        break;
    case '1M': cutoff.setMonth(cutoff.getMonth() - 1);      break;
    case '3M': cutoff.setMonth(cutoff.getMonth() - 3);      break;
    case '6M': cutoff.setMonth(cutoff.getMonth() - 6);      break;
    case '1Y': cutoff.setFullYear(cutoff.getFullYear() - 1);break;
    default:   return data;
  }
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return data.filter(d => d.time >= cutoffStr);
}

export function getStockMeta(data) {
  if (!data || data.length === 0) return null;
  const latest   = data[data.length - 1];
  const previous = data.length > 1 ? data[data.length - 2] : latest;
  const first    = data[0];
  const change   = latest.close - previous.close;
  const changePercent = (change / previous.close) * 100;
  const periodChange  = latest.close - first.close;
  const periodChangePercent = (periodChange / first.close) * 100;

  let periodHigh = -Infinity, periodLow = Infinity, totalVolume = 0;
  for (const d of data) {
    if (d.high > periodHigh) periodHigh = d.high;
    if (d.low  < periodLow)  periodLow  = d.low;
    totalVolume += d.volume;
  }

  return {
    price: latest.close,
    change,
    changePercent,
    periodChange,
    periodChangePercent,
    open: latest.open,
    high: latest.high,
    low:  latest.low,
    volume: latest.volume,
    periodHigh,
    periodLow,
    avgVolume: Math.floor(totalVolume / data.length),
  };
}

/* ====================================================
   UTILITIES
   ==================================================== */
function roundPrice(val) { return Math.round(val * 100) / 100; }

function symbolHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function seededRandom(seed) {
  let s = seed || 42;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function gaussianRandom(rng) {
  return Math.sqrt(-2 * Math.log(rng())) * Math.cos(2 * Math.PI * rng());
}

export default {
  searchSymbols, isValidSymbol, fetchStockData,
  fetchLivePrice, warmLivePrices, generateDemoData,
  filterByTimeframe, getStockMeta, POPULAR_SYMBOLS,
};
