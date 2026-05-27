/**
 * @module dashboard
 * @description Orchestrates the trading dashboard features, fear & greed canvas gauge, and sector heatmaps.
 */

// Simulated Sector Database
const SECTORS = [
  { name: 'Technology', change: 1.84 },
  { name: 'Financials', change: 0.65 },
  { name: 'Healthcare', change: -0.42 },
  { name: 'Energy', change: 1.12 },
  { name: 'Industrials', change: 0.28 },
  { name: 'Consumer Defensive', change: -0.15 },
  { name: 'Utilities', change: -0.84 },
  { name: 'Real Estate', change: -1.24 },
  { name: 'Materials', change: 0.45 },
  { name: 'Communication', change: 2.10 }
];

// Simulated Top Gainers / Losers
const GAINERS = [
  { symbol: 'NVDA', price: '₹1,064.20', gain: '+4.85%' },
  { symbol: 'RELIANCE.NS', price: '₹2,910.15', gain: '+2.24%' },
  { symbol: 'IREDA.NS', price: '₹188.40', gain: '+1.98%' },
  { symbol: 'TSLA', price: '₹178.20', gain: '+1.54%' },
  { symbol: 'AMD', price: '₹164.50', gain: '+1.22%' }
];

const LOSERS = [
  { symbol: 'YESBANK.NS', price: '₹21.40', loss: '-3.12%' },
  { symbol: 'NFLX', price: '₹612.40', loss: '-2.42%' },
  { symbol: 'META', price: '₹465.10', loss: '-1.85%' },
  { symbol: 'AMZN', price: '₹179.40', loss: '-1.40%' },
  { symbol: 'AAPL', price: '₹189.84', loss: '-0.82%' }
];

document.addEventListener('DOMContentLoaded', () => {
  renderSectorHeatmap();
  renderGainersLosers();
  renderFearGreed(64); // Greed value
});

/**
 * Render Sector Heatmap
 */
function renderSectorHeatmap() {
  const container = document.getElementById('sector-heatmap');
  if (!container) return;

  container.innerHTML = '';
  SECTORS.forEach(sec => {
    const item = document.createElement('div');
    item.className = 'heatmap-cell';
    
    // Assign color based on positive or negative performance
    const isPositive = sec.change >= 0;
    const absVal = Math.min(Math.abs(sec.change) / 2.5, 1); // Clamp weight
    
    let bg = '';
    if (isPositive) {
      bg = `rgba(0, 230, 118, ${0.08 + absVal * 0.4})`; // green scaling
    } else {
      bg = `rgba(255, 51, 102, ${0.08 + absVal * 0.4})`; // red scaling
    }
    
    item.style.backgroundColor = bg;

    item.innerHTML = `
      <div class="heatmap-label">${sec.name}</div>
      <div class="heatmap-value" style="color: ${isPositive ? 'var(--accent-green)' : 'var(--accent-magenta)'};">
        ${isPositive ? '+' : ''}${sec.change.toFixed(2)}%
      </div>
    `;

    container.appendChild(item);
  });
}

/**
 * Render Gainers and Losers Tables
 */
function renderGainersLosers() {
  const gBody = document.getElementById('gainers-table-body');
  const lBody = document.getElementById('losers-table-body');

  if (gBody) {
    gBody.innerHTML = GAINERS.map(item => `
      <tr>
        <td style="font-weight: 600; color: var(--text-primary);">${item.symbol}</td>
        <td>${item.price}</td>
        <td style="color: var(--accent-green); font-weight: 600;">${item.gain}</td>
      </tr>
    `).join('');
  }

  if (lBody) {
    lBody.innerHTML = LOSERS.map(item => `
      <tr>
        <td style="font-weight: 600; color: var(--text-primary);">${item.symbol}</td>
        <td>${item.price}</td>
        <td style="color: var(--accent-magenta); font-weight: 600;">${item.loss}</td>
      </tr>
    `).join('');
  }
}

/**
 * Draw Fear & Greed needle indicator on HTML Canvas
 */
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
  ctx.strokeStyle = '#ff3366';
  ctx.lineWidth = 14;
  ctx.lineCap = 'butt';
  ctx.stroke();

  // Arc 2: Neutral (Amber)
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI * 1.33, Math.PI * 1.66);
  ctx.strokeStyle = '#ffaa00';
  ctx.lineWidth = 14;
  ctx.stroke();

  // Arc 3: Greed (Green)
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI * 1.66, Math.PI * 2);
  ctx.strokeStyle = '#00e676';
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
  ctx.strokeStyle = '#00d4ff'; // glow cyan needle
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw Center Hub Inner Circle
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#06090f';
  ctx.fill();
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 3;
  ctx.stroke();
  
  // Set details labels dynamically based on scale
  const label = document.getElementById('fear-greed-label');
  const desc = document.getElementById('fear-greed-desc');
  if (label && desc) {
    label.textContent = value;
    if (value < 35) {
      desc.textContent = 'EXTREME FEAR';
      desc.style.color = '#ff3366';
    } else if (value < 45) {
      desc.textContent = 'FEAR';
      desc.style.color = '#ff6b6b';
    } else if (value < 55) {
      desc.textContent = 'NEUTRAL';
      desc.style.color = '#ffaa00';
    } else if (value < 75) {
      desc.textContent = 'GREED';
      desc.style.color = '#00e676';
    } else {
      desc.textContent = 'EXTREME GREED';
      desc.style.color = '#00d4ff';
    }
  }

  const pointer = document.getElementById('fear-greed-pointer');
  if (pointer) {
    pointer.style.left = `${value}%`;
  }
}
