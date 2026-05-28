/**
 * @module watchlist
 * @description LocalStorage-backed watchlist with custom price and RSI alert thresholds.
 * Emits browser notifications when conditions are met.
 */

import { state, loadStock, showToast } from './app.js?v=20250528b';
import { getSentiment } from './sentiment.js?v=20250528b';

// Local storage key
const WATCHLIST_KEY = 'smai_watchlist';
const ALERTS_KEY = 'smai_alerts';

// Load initial lists
let watchlist = JSON.parse(localStorage.getItem(WATCHLIST_KEY)) || ['AAPL', 'TSLA', 'RELIANCE.NS'];
let alerts = JSON.parse(localStorage.getItem(ALERTS_KEY)) || {};

/*
Alert format:
{
  'AAPL': { priceAbove: 230, priceBelow: 180, rsiAbove: 70, rsiBelow: 30 }
}
*/

// Request Notification Permission
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

/**
 * Initialize Watchlist Module
 */
function initWatchlist() {
  renderWatchlist();

  // Listen to analysis events to update price & trigger alerts
  document.addEventListener('smai:analysis', (e) => {
    const { symbol, prediction, indicators, price } = e.detail;
    updateWatchlistPrice(symbol, price, prediction?.direction || 'NEUTRAL');
    checkAlerts(symbol, price, indicators?.rsi?.latest);
  });

  // Wire add button
  const addBtn = document.getElementById('btn-add-watchlist');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      addToWatchlist(state.symbol);
    });
  }
}

/**
 * Render Watchlist Items in UI
 */
function renderWatchlist() {
  const container = document.getElementById('watchlist-items');
  if (!container) return;

  if (watchlist.length === 0) {
    container.innerHTML = `<div class="empty-state">No stocks watched yet</div>`;
    return;
  }

  container.innerHTML = '';
  watchlist.forEach(sym => {
    const card = document.createElement('div');
    card.className = `watchlist-item ${sym === state.symbol ? 'active' : ''}`;
    card.dataset.symbol = sym;

    // Get alerts for this stock
    const symAlert = alerts[sym] || {};
    const alertActive = Object.values(symAlert).some(v => v !== null && v !== undefined && v !== '');

    card.innerHTML = `
      <div class="watchlist-info" style="flex: 1; cursor: pointer;">
        <span class="watchlist-symbol" style="font-weight: 600; color: var(--text-primary);">${sym}</span>
        <div class="watchlist-stats" style="font-size: var(--fs-xs); display: flex; gap: var(--sp-2); margin-top: 2px;">
          <span class="watchlist-price" id="watch-price-${sym.replace('.', '_')}">Loading...</span>
          <span class="watchlist-change" id="watch-change-${sym.replace('.', '_')}">—</span>
        </div>
      </div>
      <div class="watchlist-actions" style="display: flex; align-items: center; gap: var(--sp-2);">
        <button class="btn-icon alert-toggle-btn ${alertActive ? 'active' : ''}" data-symbol="${sym}" title="Set Alerts" style="font-size: 1.1rem; padding: 0 var(--sp-1);">
          🔔
        </button>
        <button class="btn-icon remove-watchlist-btn" data-symbol="${sym}" title="Remove Stock" style="font-size: 1.1rem; opacity: 0.6; padding: 0 var(--sp-1);">
          ✕
        </button>
      </div>
    `;

    // Click handler to load the stock in main analyzer
    card.querySelector('.watchlist-info').addEventListener('click', () => {
      loadStock(sym);
      // Highlight selected
      document.querySelectorAll('.watchlist-item').forEach(el => el.classList.remove('active'));
      card.classList.add('active');
    });

    // Alert edit handler
    card.querySelector('.alert-toggle-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openAlertDialog(sym);
    });

    // Delete handler
    card.querySelector('.remove-watchlist-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromWatchlist(sym);
    });

    container.appendChild(card);

    // Initial dummy load to fill UI instantly
    const demoSentiment = getSentiment(sym);
    const mockPrice = 100 + Math.random() * 150;
    const mockChange = (Math.random() - 0.45) * 5;
    updateWatchlistPrice(sym, mockPrice, mockChange >= 0 ? 'BULLISH' : 'BEARISH', mockChange);
  });
}

/**
 * Add stock to watchlist
 */
function addToWatchlist(symbol) {
  if (!symbol) return;
  const upper = symbol.toUpperCase();
  if (watchlist.includes(upper)) {
    showToast(`${upper} is already in your watchlist`, 'info');
    return;
  }

  watchlist.push(upper);
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
  renderWatchlist();
  showToast(`Added ${upper} to watchlist`, 'success');
}

/**
 * Remove stock from watchlist
 */
function removeFromWatchlist(symbol) {
  watchlist = watchlist.filter(s => s !== symbol);
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
  
  // Clean up alerts
  delete alerts[symbol];
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));

  renderWatchlist();
  showToast(`Removed ${symbol} from watchlist`, 'success');
}

/**
 * Update stock price details dynamically inside watchlist card
 */
function updateWatchlistPrice(symbol, price, signalDirection, percentChange = null) {
  const priceEl = document.getElementById(`watch-price-${symbol.replace('.', '_')}`);
  const changeEl = document.getElementById(`watch-change-${symbol.replace('.', '_')}`);

  if (!priceEl) return;

  priceEl.textContent = `₹${price.toFixed(2)}`;

  if (percentChange === null) {
    percentChange = signalDirection === 'BULLISH' ? Math.random() * 2 :
                    signalDirection === 'BEARISH' ? -Math.random() * 2 :
                    (Math.random() - 0.5) * 0.5;
  }

  const isPositive = percentChange >= 0;
  changeEl.textContent = `${isPositive ? '+' : ''}${percentChange.toFixed(2)}%`;
  changeEl.className = `watchlist-change ${isPositive ? 'positive' : 'negative'}`;
  changeEl.style.color = isPositive ? 'var(--accent-green)' : 'var(--accent-magenta)';
}

/**
 * Open alert setup overlay modal dynamically
 */
function openAlertDialog(symbol) {
  const symAlerts = alerts[symbol] || { priceAbove: '', priceBelow: '', rsiAbove: '', rsiBelow: '' };

  const modalHtml = `
    <div class="modal-overlay active" id="alert-modal">
      <div class="modal" style="max-width: 400px; padding: var(--sp-6);">
        <h3>🔔 Set Alerts for ${symbol}</h3>
        <p style="font-size: var(--fs-sm); margin-bottom: var(--sp-4); color: var(--text-secondary);">
          Trigger browser alerts when threshold parameters are crossed.
        </p>
        
        <div class="modal-field" style="margin-top: 1rem;">
          <label>Price crosses above (₹)</label>
          <input type="number" step="0.01" id="alert-price-above" class="modal-input" value="${symAlerts.priceAbove || ''}" placeholder="e.g. 230">
        </div>
        
        <div class="modal-field" style="margin-top: 0.75rem;">
          <label>Price drops below (₹)</label>
          <input type="number" step="0.01" id="alert-price-below" class="modal-input" value="${symAlerts.priceBelow || ''}" placeholder="e.g. 180">
        </div>

        <div class="modal-field" style="margin-top: 0.75rem;">
          <label>RSI jumps above (Overbought)</label>
          <input type="number" max="100" min="0" id="alert-rsi-above" class="modal-input" value="${symAlerts.rsiAbove || ''}" placeholder="e.g. 70">
        </div>

        <div class="modal-field" style="margin-top: 0.75rem; margin-bottom: 1.5rem;">
          <label>RSI drops below (Oversold)</label>
          <input type="number" max="100" min="0" id="alert-rsi-below" class="modal-input" value="${symAlerts.rsiBelow || ''}" placeholder="e.g. 30">
        </div>

        <div class="modal-actions">
          <button class="btn-primary" id="btn-save-alert">Save Alerts</button>
          <button class="btn-secondary" id="btn-clear-alert">Clear</button>
        </div>
        <button class="btn-icon" id="alert-modal-close" style="position: absolute; top: 1rem; right: 1rem;">✕</button>
      </div>
    </div>
  `;

  const div = document.createElement('div');
  div.innerHTML = modalHtml;
  document.body.appendChild(div);

  const modal = document.getElementById('alert-modal');
  const close = () => {
    modal.remove();
  };

  document.getElementById('alert-modal-close').addEventListener('click', close);
  
  document.getElementById('btn-clear-alert').addEventListener('click', () => {
    delete alerts[symbol];
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
    renderWatchlist();
    showToast(`Alerts cleared for ${symbol}`, 'info');
    close();
  });

  document.getElementById('btn-save-alert').addEventListener('click', () => {
    const priceAbove = document.getElementById('alert-price-above').value;
    const priceBelow = document.getElementById('alert-price-below').value;
    const rsiAbove = document.getElementById('alert-rsi-above').value;
    const rsiBelow = document.getElementById('alert-rsi-below').value;

    alerts[symbol] = {
      priceAbove: priceAbove !== '' ? parseFloat(priceAbove) : null,
      priceBelow: priceBelow !== '' ? parseFloat(priceBelow) : null,
      rsiAbove: rsiAbove !== '' ? parseFloat(rsiAbove) : null,
      rsiBelow: rsiBelow !== '' ? parseFloat(rsiBelow) : null,
    };

    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
    renderWatchlist();
    showToast(`Alert configuration saved for ${symbol}`, 'success');
    close();
  });
}

/**
 * Check and trigger configured alerts
 */
function checkAlerts(symbol, currentPrice, currentRsi) {
  const symAlerts = alerts[symbol];
  if (!symAlerts) return;

  const title = `📈 SMAI Market Alert: ${symbol}`;
  let triggered = false;
  let body = '';

  if (symAlerts.priceAbove && currentPrice >= symAlerts.priceAbove) {
    body += `Price is now ₹${currentPrice.toFixed(2)} (crossed target ₹${symAlerts.priceAbove.toFixed(2)}). `;
    triggered = true;
    symAlerts.priceAbove = null; // trigger once
  }

  if (symAlerts.priceBelow && currentPrice <= symAlerts.priceBelow) {
    body += `Price is now ₹${currentPrice.toFixed(2)} (fell below target ₹${symAlerts.priceBelow.toFixed(2)}). `;
    triggered = true;
    symAlerts.priceBelow = null;
  }

  if (currentRsi) {
    if (symAlerts.rsiAbove && currentRsi >= symAlerts.rsiAbove) {
      body += `RSI is now ${currentRsi.toFixed(1)} (overbought signal > ${symAlerts.rsiAbove}). `;
      triggered = true;
      symAlerts.rsiAbove = null;
    }

    if (symAlerts.rsiBelow && currentRsi <= symAlerts.rsiBelow) {
      body += `RSI is now ${currentRsi.toFixed(1)} (oversold signal < ${symAlerts.rsiBelow}). `;
      triggered = true;
      symAlerts.rsiBelow = null;
    }
  }

  if (triggered) {
    // Save state back with triggered alert reset
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
    renderWatchlist();

    // Trigger toast in-app
    showToast(`${symbol} ALERT: ${body}`, 'info');

    // Trigger OS notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚨</text></svg>' });
    }
  }
}

// Boot module
document.addEventListener('DOMContentLoaded', initWatchlist);
export default { addToWatchlist, removeFromWatchlist };
