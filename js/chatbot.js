/**
 * @module chatbot
 * @description Context-aware Gemini AI chatbot.
 * Injects real-time technical indicators, chart patterns, and ML signals
 * directly into the context stream.
 */

import { state } from './app.js?v=20250528b';

// Chat state
let chatOpen = false;
let currentContext = {
  symbol: 'AAPL',
  price: 0,
  prediction: null,
  indicators: null
};

/**
 * Initialize Chatbot Module
 */
function initChatbot() {
  const toggleBtn = document.getElementById('chatbot-toggle');
  const closeBtn = document.getElementById('chatbot-close');
  const panel = document.getElementById('chatbot-panel');
  const sendBtn = document.getElementById('chatbot-send-btn');
  const input = document.getElementById('chatbot-input');

  if (!toggleBtn || !panel) return;

  // Toggle panel opening
  toggleBtn.addEventListener('click', () => {
    chatOpen = !chatOpen;
    panel.classList.toggle('active', chatOpen);
    if (chatOpen && input) {
      input.focus();
    }
  });

  closeBtn?.addEventListener('click', () => {
    chatOpen = false;
    panel.classList.remove('active');
  });

  // Handle messages
  sendBtn?.addEventListener('click', handleSendMessage);
  input?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSendMessage();
  });

  // Listen to analysis events to grab real-time context
  document.addEventListener('smai:analysis', (e) => {
    currentContext = {
      symbol: e.detail.symbol,
      price: e.detail.price,
      prediction: e.detail.prediction,
      indicators: e.detail.indicators
    };
  });
}

/**
 * Append a bubble in the chatbot conversation container
 */
function appendMessage(text, sender) {
  const container = document.getElementById('chatbot-messages');
  if (!container) return;

  const bubble = document.createElement('div');
  bubble.className = `message ${sender}-message`;
  bubble.textContent = text;

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

/**
 * Process and dispatch user queries
 */
async function handleSendMessage() {
  const input = document.getElementById('chatbot-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  // Append user bubble
  appendMessage(text, 'user');
  input.value = '';

  // Show typing indicator
  appendMessage('SMAI is analyzing...', 'system');
  const typingBubble = document.querySelector('.system-message:last-child');

  // Load API key
  const apiKey = localStorage.getItem('gemini_api_key') || '';

  try {
    let answer = '';
    if (apiKey) {
      answer = await queryGemini(text, apiKey);
    } else {
      answer = getLocalFallbackResponse(text);
    }

    if (typingBubble) typingBubble.remove();
    appendMessage(answer, 'bot');
  } catch (err) {
    if (typingBubble) typingBubble.remove();
    appendMessage(`Error: ${err.message}. Please verify your Gemini API key in Settings.`, 'system');
  }
}

/**
 * Real Gemini API query function
 */
async function queryGemini(promptText, apiKey) {
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Assemble system-level prompt context
  const contextText = `You are SMAI (Smart Market AI), an elite fintech market research assistant.
You have access to the current technical analysis context:
- Active Stock Symbol: ${currentContext.symbol}
- Current Stock Price: ₹${currentContext.price ? currentContext.price.toFixed(2) : '150.00'}
- AI Prediction Direction: ${currentContext.prediction?.direction || 'NEUTRAL'}
- Prediction Confidence: ${currentContext.prediction?.confidence ? currentContext.prediction.confidence.toFixed(1) : '50'}%
- RSI Indicator Value: ${currentContext.indicators?.rsi?.latest ? currentContext.indicators.rsi.latest.toFixed(1) : 'N/A'} (Signal: ${currentContext.indicators?.rsi?.signal || 'neutral'})
- MACD Line Crossover State: ${currentContext.indicators?.macd?.signal || 'neutral'}

Prompt Requirements:
1. Provide a professional, concise, and smart answer.
2. Ground explanations using the indicators supplied. (e.g. if RSI is overbought, explain what that means).
3. Do NOT offer explicit financial advice (e.g. "You must buy this now"), but guide with statistical patterns.
4. Mention that insights are for educational research.`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: `${contextText}\n\nUser Question: "${promptText}"` }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 300
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(errorJson.error?.message || `HTTP ${response.status}`);
  }

  const json = await response.json();
  const textContent = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('Empty response received from Gemini API');
  }

  return textContent;
}

/**
 * Quality mock response generator if no Gemini key is provided
 */
function getLocalFallbackResponse(promptText) {
  const query = promptText.toLowerCase();
  const symbol = currentContext.symbol || 'AAPL';
  const price = currentContext.price ? `₹${currentContext.price.toFixed(2)}` : '₹150.00';
  const rsi = currentContext.indicators?.rsi?.latest ? currentContext.indicators.rsi.latest.toFixed(1) : '52';
  const rsiSig = currentContext.indicators?.rsi?.signal || 'NEUTRAL';
  const direction = currentContext.prediction?.direction || 'NEUTRAL';
  const confidence = currentContext.prediction?.confidence ? `${currentContext.prediction.confidence.toFixed(1)}%` : '50%';

  if (query.includes('buy') || query.includes('sell') || query.includes('should i')) {
    return `[DEMO MODE] Regarding ${symbol} at current price ${price}:
Our local SMAI prediction model indicates a ${direction} directional bias with a confidence factor of ${confidence}.
The RSI is at ${rsi} (${rsiSig}), meaning the stock is not highly stretched in either direction.
Before taking a position, check support and resistance levels on the chart.
(Set your Gemini API key in settings for real-time dynamic AI chat replies!)`;
  }

  if (query.includes('rsi') || query.includes('indicator') || query.includes('technical')) {
    return `[DEMO MODE] Technical breakdown for ${symbol}:
1. Relative Strength Index (RSI): Currently at ${rsi} which points to a ${rsiSig} condition.
2. MACD signal status is: ${currentContext.indicators?.macd?.signal || 'Neutral'}.
3. Trend state: Current momentum is ${direction}.
For deep structural insights, activate your Gemini key in Settings!`;
  }

  return `[DEMO MODE] Hello! I see you are asking about ${symbol}.
I am running in demo fallback mode. Currently, ${symbol} is trading at ${price} with a prediction score of ${confidence} ${direction}.
Please enter a Gemini API Key in the settings overlay (⚙️ top right) to unlock customized natural language stock research conversing directly with Gemini 2.5 Flash!`;
}

// Boot chatbot
document.addEventListener('DOMContentLoaded', initChatbot);
export default { initChatbot };
