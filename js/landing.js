/**
 * @module landing
 * @description Controls the landing page particle chart animations, scrolling stock ticker strip, and monthly/annual toggles.
 */

// All prices in INR -- US stocks converted at Rs.84.50/USD (May 2025)
const TICKER_ITEMS = [
  { symbol: 'AAPL',         price: 17238.00,  change: -0.82 },  // $204.00 * 84.50
  { symbol: 'TSLA',         price: 27083.00,  change:  3.92 },  // $320.63 * 84.50
  { symbol: 'NVDA',         price: 112388.00, change:  4.85 },  // $1330.00 * 84.50
  { symbol: 'RELIANCE.NS',  price: 1408.00,   change:  0.64 },
  { symbol: 'TCS.NS',       price: 3204.00,   change:  0.82 },
  { symbol: 'HDFCBANK.NS',  price: 1911.00,   change: -0.35 },
  { symbol: 'BAJFINANCE.NS',price: 9085.00,   change:  2.24 },
  { symbol: 'MSFT',         price: 37153.00,  change:  1.10 },  // $439.75 * 84.50
  { symbol: 'GOOGL',        price: 14364.00,  change:  0.45 },  // $169.99 * 84.50
  { symbol: 'INFY.NS',      price: 1591.00,   change:  1.12 },
  { symbol: 'YESBANK.NS',   price: 18.50,     change: -3.12 },
  { symbol: 'META',         price: 53753.00,  change:  1.54 },  // $636.13 * 84.50
];

document.addEventListener('DOMContentLoaded', () => {
  initTicker();
  initPricingToggle();
  initHeroCanvas();
});

/**
 * Populate and slide Stock Ticker Strip
 */
function initTicker() {
  const strip = document.getElementById('ticker-strip');
  if (!strip) return;

  // Duplicate items twice to ensure perfect looping
  const doubleList = [...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS];

  strip.innerHTML = doubleList.map(item => {
    const isPositive = item.change >= 0;
    const arrow = isPositive ? '▲' : '▼';
    const color = isPositive ? 'var(--accent-green)' : 'var(--accent-magenta)';
    
    return `
      <div style="display: inline-flex; align-items: center; gap: 8px;">
        <span style="font-weight: 700; color: var(--text-primary);">${item.symbol}</span>
        <span style="color: var(--text-secondary);">₹${item.price.toFixed(2)}</span>
        <span style="color: ${color}; font-weight: 600;">${arrow} ${Math.abs(item.change).toFixed(2)}%</span>
      </div>
    `;
  }).join('');
}

/**
 * Handle pricing Monthly / Annual toggle switch
 */
function initPricingToggle() {
  const btnMonthly = document.getElementById('toggle-monthly');
  const btnAnnual = document.getElementById('toggle-annual');
  const proPriceLabel = document.getElementById('pro-price');

  if (!btnMonthly || !btnAnnual || !proPriceLabel) return;

  btnMonthly.addEventListener('click', () => {
    btnMonthly.classList.add('active');
    btnAnnual.classList.remove('active');
    proPriceLabel.textContent = '$29';
  });

  btnAnnual.addEventListener('click', () => {
    btnAnnual.classList.add('active');
    btnMonthly.classList.remove('active');
    proPriceLabel.textContent = '$23'; // 20% discount
  });
}

/**
 * Animate high-quality background canvas with a glowing price line + particles
 */
function initHeroCanvas() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  // Track resizing
  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  // Particle parameters
  const particles = [];
  const particleCount = 45;

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 2 + 1,
      opacity: Math.random() * 0.5 + 0.1
    });
  }

  // Stock sine wave parameters
  let time = 0;

  function animate() {
    ctx.clearRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    const gridSize = 60;
    
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Update & draw particles
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 212, 255, ${p.opacity})`;
      ctx.fill();
    });

    // Draw flowing price graph wave (futuristic stock chart line)
    ctx.beginPath();
    ctx.lineWidth = 3;
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(0, 212, 255, 0.15)');
    gradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 51, 102, 0.15)');
    ctx.strokeStyle = gradient;

    for (let x = 0; x < width; x++) {
      const sineVal1 = Math.sin(x * 0.003 + time * 0.005) * 80;
      const sineVal2 = Math.cos(x * 0.008 - time * 0.003) * 30;
      const y = height * 0.65 + sineVal1 + sineVal2;
      
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw glowing points along the wave
    ctx.beginPath();
    const pulseX = (time * 2) % width;
    const pulseY = height * 0.65 + Math.sin(pulseX * 0.003 + time * 0.005) * 80 + Math.cos(pulseX * 0.008 - time * 0.003) * 30;
    
    ctx.arc(pulseX, pulseY, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 212, 255, 0.7)';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00d4ff';
    ctx.fill();
    
    // Reset shadow
    ctx.shadowBlur = 0;

    time += 1.5;
    requestAnimationFrame(animate);
  }

  animate();
}
