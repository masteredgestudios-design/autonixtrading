describe('Bulk Trader execution flow', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    document.body.innerHTML = `
      <section id="bulk-trader-section">
        <select id="bulk-symbol"><option value="1HZ100V" selected>Volatility 100</option></select>
        <select id="bulk-strategy"><option value="differs" selected>Differs</option></select>
        <input id="bulk-stake" value="10" />
        <input id="bulk-num-trades" value="2" />
        <input id="bulk-take-profit" value="100" />
        <input id="bulk-stop-loss" value="100" />
        <select id="bulk-duration"><option value="5" selected>5 ticks</option></select>
        <input id="bulk-martingale" value="2" />
        <button id="bulk-execute-btn"></button><button id="bulk-stop-btn"></button>
        <div id="bulk-status-pill"></div><div id="bulk-analysis-summary"></div>
        <div id="bulk-live-summary"></div><div id="bulk-history-wrap"></div>
        <table><tbody id="bulk-history-tbody"></tbody></table>
      </section>`;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete window.AutonixBulkTrader;
  });

  it('submits one trade, then waits for a fresh tick before using the next stake', async () => {
    const ticks = Array.from({ length: 100 }, (_, index) => ({
      price: 100 + (index % 10) / 100,
      time: index * 1000,
    }));
    let onTick;
    const settlements = [];
    const buyContract = jest.fn((options, onSettle) => {
      settlements.push(onSettle);
      return Promise.resolve({ contractId: `contract-${settlements.length}` });
    });
    window.AutonixCore = { tickBuffers: { '1HZ100V': ticks }, ensureSymbolStream: jest.fn() };
    window.SESSION_DATA = { activeAccount: { currency: 'USD' } };
    window.DerivWS = {
      isAuthorized: () => true,
      subscribeTicks: jest.fn((symbol, callback) => { onTick = callback; return jest.fn(); }),
      buyContract,
    };

    require('../static/js/bulk-trader.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    document.getElementById('bulk-execute-btn').click();
    await jest.advanceTimersByTimeAsync(500);

    expect(buyContract).toHaveBeenCalledTimes(1);
    expect(buyContract.mock.calls[0][0]).toEqual(expect.objectContaining({
      tradeType: 'match-differ',
      duration: 5,
      stake: 10,
    }));

    settlements[0]({ won: false, pl: -10 });
    await Promise.resolve();
    expect(buyContract).toHaveBeenCalledTimes(1);

    onTick({ symbol: '1HZ100V', quote: '100.08', epoch: 101 });
    await jest.advanceTimersByTimeAsync(500);

    expect(buyContract).toHaveBeenCalledTimes(2);
    expect(buyContract.mock.calls[1][0]).toEqual(expect.objectContaining({
      tradeType: 'match-differ',
      duration: 5,
      stake: 20,
    }));
    expect(document.getElementById('bulk-history-tbody').textContent).toContain('In Trade');
  }, 20000);
});
