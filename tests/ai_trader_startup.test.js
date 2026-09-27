const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runAITraderRegression() {
const chartHtml = fs.readFileSync(path.join(__dirname, '..', 'templates', 'partials', 'chart_area.html'), 'utf8');
assert.ok(chartHtml.includes('data-type="over-under"'), 'Over/Under option should exist in the selector.');
assert.ok(/class="trade-type-btn active"[\s\S]*data-type="over-under"/.test(chartHtml), 'The default selected trade type on page load should be Over/Under.');

function createElement(id) {
  return {
    id,
    value: '',
    innerHTML: '',
    textContent: '',
    style: {},
    disabled: false,
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    click() {
      if (this.listeners.click) this.listeners.click();
    }
  };
}

const elements = new Map();
const document = {
  getElementById(id) {
    if (!['ai-trader-section', 'ai-start-btn', 'ai-stop-btn', 'ai-reset-btn', 'ai-log-list', 'ai-summary', 'ai-stats', 'ai-status-text', 'ai-status-pill', 'ai-risk-amount', 'ai-take-profit'].includes(id)) {
      return null;
    }
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  }
};

const window = {
  SESSION_DATA: { activeAccount: { currency: 'USD' } },
  DerivWS: {
    isAuthorized() { return true; },
    subscribeTicks() { return {}; },
    getHistory() { return Promise.resolve([]); },
    buyContract(opts) {
      return Promise.resolve({ won: true, pl: opts.stake * 0.1876 });
    }
  }
};

const context = { window, document, console, setTimeout() { return 0; }, clearTimeout() {}, Date, Promise, Math };
vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'ai-trader.js'), 'utf8');
vm.runInContext(source, context, { filename: 'ai-trader.js' });

const strategy = context.window.AutonixAITrader;
assert.ok(strategy, 'AI trader strategy API should be exposed for testing.');

const startButton = context.document.getElementById('ai-start-btn');
startButton.click();
assert.ok(context.document.getElementById('ai-status-text').textContent.length > 0, 'The AI should update its live status when started.');
assert.ok(context.document.getElementById('ai-status-text').textContent.includes('Analyzing') || context.document.getElementById('ai-status-text').textContent.includes('Signal') || context.document.getElementById('ai-status-text').textContent.includes('Waiting'), 'The AI must remain active in its analysis lifecycle after start.');

assert.ok(Math.abs(strategy.getPayoutRate(0.1876) - 0.1876) < 1e-9, 'Default payout should be 18.76%.');
assert.ok(Math.abs(strategy.calculateStake(1000, 0.1876) - 157.97) < 0.05, 'Stake should be calculated from risk amount and payout.');
assert.ok(Math.abs(strategy.calculateRecoveryStake(3.77, 0.1876) - 20.09) < 0.1, 'Recovery stake should be actual loss divided by payout rate.');
assert.ok(Math.abs(strategy.calculateRecoveryStake(100, 0.1876) - 533.05) < 0.05, 'Recovery stake should be loss divided by payout rate.');

const overSignal = strategy.analyzeLastDigitFrequencies([
  { price: 0.10 }, { price: 1.11 }, { price: 2.22 }, { price: 3.33 }, { price: 4.44 },
  { price: 5.55 }, { price: 6.66 }, { price: 7.77 }, { price: 8.88 }, { price: 9.99 },
  { price: 5.55 }, { price: 6.66 }, { price: 7.77 }, { price: 8.88 }, { price: 9.99 },
  { price: 5.55 }, { price: 6.66 }, { price: 7.77 }, { price: 8.88 }, { price: 9.99 }
]);
assert.strictEqual(overSignal.selection, 'over', 'High digits should win when 5-9 frequency exceeds 0-4.');

const underSignal = strategy.analyzeLastDigitFrequencies([
  { price: 0.10 }, { price: 1.11 }, { price: 2.22 }, { price: 3.33 }, { price: 4.44 },
  { price: 0.10 }, { price: 1.11 }, { price: 2.22 }, { price: 3.33 }, { price: 4.44 },
  { price: 0.10 }, { price: 1.11 }, { price: 2.22 }, { price: 3.33 }, { price: 4.44 },
  { price: 5.55 }, { price: 6.66 }, { price: 7.77 }, { price: 8.88 }, { price: 9.99 }
]);
assert.strictEqual(underSignal.selection, 'under', 'Low digits should win when 0-4 frequency exceeds 5-9.');

const noTradeSignal = strategy.analyzeLastDigitFrequencies([
  { price: 0.10 }, { price: 1.11 }, { price: 2.22 }, { price: 3.33 }, { price: 4.44 },
  { price: 5.55 }, { price: 6.66 }, { price: 7.77 }, { price: 8.88 }, { price: 9.99 }
]);
assert.strictEqual(noTradeSignal.selection, null, 'Equal groups must produce no trade.');

console.log('AI trader strategy regression test passed.');
}

if (typeof test === 'function') {
  test('AI Trader startup and strategy regression', runAITraderRegression);
} else {
  runAITraderRegression();
}
