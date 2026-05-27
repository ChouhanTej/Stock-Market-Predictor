/**
 * @module sentiment
 * @description News sentiment analysis engine.
 * Provides curated demo financial news with AI-scored sentiment.
 * Swap in a real NewsAPI key for live data.
 */

/* ---- Demo News Database ---- */
const NEWS_DB = {
  // US Stocks
  AAPL: [
    { title: 'Apple hits record iPhone sales in Q4 driven by AI features', source: 'Bloomberg', age: '2h', sentiment: 'positive', score: 0.82 },
    { title: 'Apple Vision Pro demand disappoints analysts amid high price', source: 'Reuters', age: '5h', sentiment: 'negative', score: -0.48 },
    { title: 'Buffett trims Apple stake but maintains largest position', source: 'CNBC', age: '1d', sentiment: 'neutral', score: -0.12 },
    { title: 'Apple Intelligence features rolling out to 50 countries', source: 'The Verge', age: '1d', sentiment: 'positive', score: 0.71 },
    { title: 'Analysts raise Apple price target to $260 on services growth', source: 'Morgan Stanley', age: '2d', sentiment: 'positive', score: 0.65 },
  ],
  TSLA: [
    { title: 'Tesla deliveries beat estimates by 8% on Model Y strength', source: 'Reuters', age: '3h', sentiment: 'positive', score: 0.76 },
    { title: 'Tesla faces fresh recalls over autopilot software concerns', source: 'WSJ', age: '6h', sentiment: 'negative', score: -0.62 },
    { title: 'Elon Musk hints at $25K Tesla model for 2026 launch', source: 'Bloomberg', age: '12h', sentiment: 'positive', score: 0.55 },
    { title: 'Tesla energy business grows 85% YoY, analysts bullish', source: 'CNBC', age: '1d', sentiment: 'positive', score: 0.69 },
    { title: 'EV competition intensifies as BYD overtakes Tesla in Europe', source: 'FT', age: '2d', sentiment: 'negative', score: -0.44 },
  ],
  NVDA: [
    { title: 'NVIDIA data center revenue surges 400% on AI chip demand', source: 'Bloomberg', age: '1h', sentiment: 'positive', score: 0.91 },
    { title: 'NVIDIA unveils Blackwell Ultra GPU with 10x performance gains', source: 'TechCrunch', age: '4h', sentiment: 'positive', score: 0.85 },
    { title: 'China export restrictions could cut NVIDIA revenue by $5B', source: 'Reuters', age: '8h', sentiment: 'negative', score: -0.58 },
    { title: 'NVIDIA stock up 250% YTD — bubble fears grow on Wall Street', source: 'WSJ', age: '1d', sentiment: 'neutral', score: -0.08 },
    { title: 'Microsoft, Google commit to buying $40B in NVIDIA chips', source: 'CNBC', age: '2d', sentiment: 'positive', score: 0.78 },
  ],
  // Indian Stocks
  'RELIANCE.NS': [
    { title: 'Reliance Jio crosses 500M subscribers, sets new record', source: 'Economic Times', age: '2h', sentiment: 'positive', score: 0.79 },
    { title: 'Reliance Retail eyes $10B valuation in potential IPO', source: 'Mint', age: '5h', sentiment: 'positive', score: 0.68 },
    { title: 'RIL Q4 profit rises 7% but refining margins compress', source: 'Business Standard', age: '10h', sentiment: 'neutral', score: 0.14 },
    { title: 'Reliance Green Energy invests ₹75,000 crore in solar plants', source: 'ET', age: '1d', sentiment: 'positive', score: 0.72 },
    { title: 'Mukesh Ambani unveils AI strategy at annual meeting', source: 'NDTV Profit', age: '2d', sentiment: 'positive', score: 0.61 },
  ],
  'TCS.NS': [
    { title: 'TCS wins $2B AI transformation deal from UK bank', source: 'Economic Times', age: '3h', sentiment: 'positive', score: 0.84 },
    { title: 'TCS Q1 revenue misses estimates amid weak BFSI spending', source: 'Mint', age: '7h', sentiment: 'negative', score: -0.41 },
    { title: 'TCS announces 40,000 campus hiring plan for FY26', source: 'Business Standard', age: '12h', sentiment: 'positive', score: 0.53 },
    { title: 'Attrition rate falls to 12.5% — TCS stabilises workforce', source: 'ET', age: '1d', sentiment: 'positive', score: 0.48 },
    { title: 'TCS launches GenAI platform for enterprise clients', source: 'NDTV Profit', age: '2d', sentiment: 'positive', score: 0.71 },
  ],
  'IREDA.NS': [
    { title: 'IREDA sanctions ₹50,000 crore in renewable energy loans', source: 'Mint', age: '2h', sentiment: 'positive', score: 0.76 },
    { title: 'IREDA Q4 NPA rises slightly but below industry average', source: 'Economic Times', age: '6h', sentiment: 'neutral', score: -0.09 },
    { title: 'Government doubles IREDA capital infusion to ₹1,500 crore', source: 'Business Standard', age: '1d', sentiment: 'positive', score: 0.81 },
    { title: 'IREDA stock up 120% in 12 months — momentum traders watch', source: 'ET', age: '1d', sentiment: 'positive', score: 0.44 },
    { title: 'India green energy target drives IREDA loan book growth', source: 'NDTV Profit', age: '2d', sentiment: 'positive', score: 0.69 },
  ],
  'YESBANK.NS': [
    { title: 'Yes Bank posts profit but NPA concerns linger for analysts', source: 'Economic Times', age: '1h', sentiment: 'neutral', score: -0.15 },
    { title: 'Yes Bank credit card biz grows 35% — digital pivot paying off', source: 'Mint', age: '4h', sentiment: 'positive', score: 0.58 },
    { title: 'RBI scrutiny on Yes Bank advances weighs on sentiment', source: 'Business Standard', age: '8h', sentiment: 'negative', score: -0.52 },
    { title: 'Yes Bank stock down 18% from 52-week high on macro fears', source: 'ET', age: '1d', sentiment: 'negative', score: -0.44 },
    { title: 'SBI likely to reduce Yes Bank stake by end of FY26', source: 'CNBC-TV18', age: '2d', sentiment: 'negative', score: -0.33 },
  ],
};

const DEFAULT_NEWS = [
  { title: 'Global markets rally on cooling inflation data', source: 'Reuters', age: '1h', sentiment: 'positive', score: 0.62 },
  { title: 'Fed signals rate cuts possible in Q3 as economy softens', source: 'Bloomberg', age: '3h', sentiment: 'positive', score: 0.55 },
  { title: 'Oil prices slip 2% on demand slowdown concerns', source: 'WSJ', age: '5h', sentiment: 'negative', score: -0.38 },
  { title: 'Tech sector leads market gains amid AI spending surge', source: 'CNBC', age: '8h', sentiment: 'positive', score: 0.71 },
  { title: 'Dollar strengthens as jobs data exceeds expectations', source: 'FT', age: '1d', sentiment: 'neutral', score: 0.08 },
];

/* ---- AI Summaries (template-based) ---- */
const SUMMARY_TEMPLATES = {
  positive: [
    'Bullish momentum is building for {symbol}. Recent news flow is strongly positive with analysts upgrading price targets and institutional buying activity detected.',
    '{symbol} sentiment is overwhelmingly positive. Strong earnings beats and product launches are driving upward price pressure.',
    'Positive catalysts dominate {symbol} news. Market participants appear optimistic about near-term growth prospects.',
  ],
  negative: [
    '{symbol} faces significant headwinds. Negative news flow is weighing on investor confidence and may continue to pressure prices.',
    'Bearish sentiment dominates {symbol} coverage. Fundamental concerns and macro headwinds are creating selling pressure.',
    'Multiple risk factors are surfacing for {symbol}. Caution is warranted as negative catalysts outweigh positive developments.',
  ],
  neutral: [
    '{symbol} news flow is balanced. Mixed signals from earnings, guidance, and macro environment suggest a wait-and-see approach.',
    'Sentiment for {symbol} is neutral with offsetting positive and negative catalysts. Range-bound trading may persist.',
    'No clear directional bias for {symbol} in recent news. Volatility may increase as the market digests mixed information.',
  ],
};

/**
 * Get sentiment data for a symbol
 * @param {string} symbol
 * @returns {{articles: Array, sentiment: {positive: number, negative: number, neutral: number}, score: number, direction: string, summary: string}}
 */
export function getSentiment(symbol) {
  // Normalize symbol for lookup
  const key = Object.keys(NEWS_DB).find(k => k.toUpperCase() === symbol.toUpperCase()) || null;
  const articles = key ? NEWS_DB[key] : DEFAULT_NEWS;

  // Score articles
  const scored = articles.map(a => ({
    ...a,
    impact: Math.abs(a.score) > 0.6 ? 'High' : Math.abs(a.score) > 0.3 ? 'Medium' : 'Low',
  }));

  // Aggregate sentiment
  let pos = 0, neg = 0, neu = 0, totalScore = 0;
  for (const art of scored) {
    if (art.sentiment === 'positive') pos++;
    else if (art.sentiment === 'negative') neg++;
    else neu++;
    totalScore += art.score;
  }

  const total = scored.length;
  const avgScore = totalScore / total; // -1 to +1
  const direction = avgScore > 0.2 ? 'positive' : avgScore < -0.2 ? 'negative' : 'neutral';

  // Normalised percentages
  const posPercent = Math.round((pos / total) * 100);
  const negPercent = Math.round((neg / total) * 100);
  const neuPercent = 100 - posPercent - negPercent;

  // AI summary
  const templates = SUMMARY_TEMPLATES[direction];
  const template = templates[Math.floor(Math.random() * templates.length)];
  const summary = template.replace(/{symbol}/g, symbol);

  return {
    articles: scored,
    sentiment: { positive: posPercent, negative: negPercent, neutral: neuPercent },
    score: parseFloat(avgScore.toFixed(3)),
    direction,
    summary,
    impactScore: Math.round(Math.abs(avgScore) * 100),
  };
}

/**
 * Fetch live news from NewsAPI (requires API key)
 * Falls back to demo data if key is not provided
 * @param {string} symbol
 * @param {string} apiKey
 */
export async function fetchLiveNews(symbol, apiKey) {
  if (!apiKey) return getSentiment(symbol);

  const query = symbol.replace('.NS', '').replace('.BSE', '');
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${apiKey}`;

  try {
    const res = await fetch(url);
    const json = await res.json();

    if (!json.articles || json.articles.length === 0) {
      return getSentiment(symbol);
    }

    // Score articles using keyword heuristics
    const articles = json.articles.slice(0, 8).map(a => {
      const score = scoreText(a.title + ' ' + (a.description || ''));
      return {
        title: a.title,
        source: a.source?.name || 'News',
        age: formatAge(new Date(a.publishedAt)),
        sentiment: score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral',
        score,
        url: a.url,
      };
    });

    // Build result same as demo
    let totalScore = 0, pos = 0, neg = 0, neu = 0;
    for (const a of articles) {
      totalScore += a.score;
      if (a.sentiment === 'positive') pos++;
      else if (a.sentiment === 'negative') neg++;
      else neu++;
    }

    const avgScore = totalScore / articles.length;
    const direction = avgScore > 0.2 ? 'positive' : avgScore < -0.2 ? 'negative' : 'neutral';
    const total = articles.length;

    const templates = SUMMARY_TEMPLATES[direction];
    const summary = templates[0].replace(/{symbol}/g, symbol);

    return {
      articles,
      sentiment: {
        positive: Math.round((pos / total) * 100),
        negative: Math.round((neg / total) * 100),
        neutral: Math.round((neu / total) * 100),
      },
      score: parseFloat(avgScore.toFixed(3)),
      direction,
      summary,
      impactScore: Math.round(Math.abs(avgScore) * 100),
    };
  } catch {
    return getSentiment(symbol);
  }
}

/* ---- Utilities ---- */

const POSITIVE_WORDS = ['beat', 'surge', 'record', 'profit', 'growth', 'rally', 'upgrade', 'buy', 'strong', 'hits', 'wins', 'bullish', 'rises', 'soars', 'expand', 'gain'];
const NEGATIVE_WORDS = ['miss', 'fall', 'recall', 'loss', 'decline', 'downgrade', 'sell', 'weak', 'concern', 'risk', 'cut', 'bearish', 'drops', 'slips', 'layoff', 'debt', 'fine'];

function scoreText(text) {
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of POSITIVE_WORDS) if (lower.includes(w)) score += 0.15;
  for (const w of NEGATIVE_WORDS) if (lower.includes(w)) score -= 0.15;
  return Math.max(-1, Math.min(1, score));
}

function formatAge(date) {
  const diff = Date.now() - date.getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default { getSentiment, fetchLiveNews };
