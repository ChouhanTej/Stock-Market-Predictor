/**
 * @module dashboard
 * @description Orchestrates the portfolio dashboard features, sparklines, allocation pie chart, and rebalance simulation.
 */

document.addEventListener('DOMContentLoaded', () => {
  initSparklines();
  initRebalanceSimulation();
});

/**
 * Renders smooth sparkline charts in the watchlist table
 */
function initSparklines() {
  const assets = [
    { id: 'sparkline-aapl', color: '#2ecc71', points: [180, 182, 181, 185, 184, 187, 186, 189.42] },
    { id: 'sparkline-tsla', color: '#e74c3c', points: [260, 255, 252, 256, 248, 245, 240, 242.11] },
    { id: 'sparkline-msft', color: '#2ecc71', points: [370, 372, 371, 375, 373, 376, 374, 376.51] },
    { id: 'sparkline-amd',  color: '#2ecc71', points: [135, 137, 136, 140, 138, 142, 141, 145.28] }
  ];

  assets.forEach(asset => {
    const canvas = document.getElementById(asset.id);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = 100;
    const height = canvas.height = 32;

    // Clear and draw path
    ctx.clearRect(0, 0, width, height);

    // Calculate scaling
    const min = Math.min(...asset.points);
    const max = Math.max(...asset.points);
    const range = max - min || 1;

    ctx.beginPath();
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    asset.points.forEach((val, index) => {
      const x = (index / (asset.points.length - 1)) * (width - 6) + 3;
      const y = height - ((val - min) / range) * (height - 8) - 4;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    // Draw main line
    ctx.strokeStyle = asset.color;
    ctx.stroke();

    // Create a smooth gradient fill underneath
    ctx.lineTo((width - 6) + 3, height);
    ctx.lineTo(3, height);
    ctx.closePath();
    
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    if (asset.color === '#2ecc71') {
      grad.addColorStop(0, 'rgba(46, 204, 113, 0.2)');
      grad.addColorStop(1, 'rgba(46, 204, 113, 0)');
    } else {
      grad.addColorStop(0, 'rgba(231, 76, 60, 0.2)');
      grad.addColorStop(1, 'rgba(231, 76, 60, 0)');
    }
    ctx.fillStyle = grad;
    ctx.fill();
  });
}

/**
 * Sets up rebalance simulation actions
 */
function initRebalanceSimulation() {
  const btn = document.getElementById('run-rebalance-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.innerHTML = '⚙️ Optimizing Asset Weights...';
    
    showToast('Running rebalance simulation... recalibrating asset weights', 'info');

    setTimeout(() => {
      // Simulate rebalancing weights
      // New weights: Tech 36.0%, Finance 29.0%, Energy 20.0%, Others 15.0%
      const newWeights = [
        { percentage: 36, offset: 0, color: '#9eb5ff', name: 'Technology' },
        { percentage: 29, offset: -36, color: '#2ecc71', name: 'Finance' },
        { percentage: 20, offset: -65, color: '#e74c3c', name: 'Energy' },
        { percentage: 15, offset: -85, color: '#f39c12', name: 'Others' }
      ];

      // Update Donut Segment Slices
      const segments = document.querySelectorAll('.pie-segment');
      newWeights.forEach((w, index) => {
        if (segments[index]) {
          segments[index].setAttribute('stroke-dasharray', `${w.percentage} ${100 - w.percentage}`);
          segments[index].setAttribute('stroke-dashoffset', `${w.offset}`);
        }
      });

      // Update Legend Values
      const legendVals = document.querySelectorAll('.legend-val');
      newWeights.forEach((w, index) => {
        if (legendVals[index]) {
          legendVals[index].textContent = `${w.percentage.toFixed(1)}%`;
        }
      });

      // Update Total Investment Card (show visual growth)
      const investmentVal = document.getElementById('total-investment');
      if (investmentVal) {
        investmentVal.textContent = '$144,380.20';
        investmentVal.style.color = 'var(--bullish-green)';
        setTimeout(() => {
          investmentVal.style.color = 'var(--text-main)';
        }, 1500);
      }

      // Update Today's P/L
      const pnlVal = document.getElementById('today-pnl');
      if (pnlVal) {
        pnlVal.textContent = '+$2,769.78';
      }

      // Update Risk score display to show lower risk
      const riskScore = document.getElementById('risk-score');
      if (riskScore) {
        riskScore.textContent = 'LOW';
        riskScore.style.color = 'var(--bullish-green)';
      }

      btn.innerHTML = '✓ Portfolio Rebalanced';
      showToast('Portfolio optimized! Technology allocation reduced to 36%. Risk profile lowered.', 'success');

      // Re-enable button after 5 seconds to run again
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '⚡ Run Rebalance Simulation';
      }, 5000);

    }, 2000);
  });
}

/**
 * Toast notifications for dashboard.html
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${message}`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
