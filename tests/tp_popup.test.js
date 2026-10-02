const assert = require('assert');
const fs = require('fs');
const path = require('path');

function readSource(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const botsPageSource = readSource('static/js/bots-page.js');
assert.ok(botsPageSource.includes('window.showTPCelebration'), 'Free and Basic bots should trigger the shared TP celebration popup.');
assert.ok(botsPageSource.includes('reason === "tp"'), 'The bots page TP stop path should be explicitly handled.');

const bulkTraderSource = readSource('static/js/bulk-trader.js');
assert.ok(bulkTraderSource.includes('window.showTPCelebration'), 'Bulk Trader should trigger the shared TP celebration popup.');

console.log('TP popup regression test passed.');
