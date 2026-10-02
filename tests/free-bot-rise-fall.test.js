describe('Free Bot Rise/Fall analysis', () => {
  beforeAll(() => {
    document.body.innerHTML = '<div id="bots-grid"><div id="bot-cards-render-target"></div></div>';
    jest.resetModules();
    require('../static/js/bots-page.js');
  });

  beforeEach(() => {
    document.body.innerHTML = '<div id="bots-grid"><div id="bot-cards-render-target"></div></div>';
  });

  const makeTicks = (direction) => Array.from({ length: 120 }, (_, index) => ({
    price: 100 + direction * index,
  }));

  it('qualifies a consistently rising market as Rise', () => {
    const result = window.AutonixFreeBotStrategy.analyzeRiseFall(makeTicks(1));

    expect(result).toEqual(expect.objectContaining({
      valid: true,
      selection: 'rise',
      tradeType: 'rise-fall',
      alignedWindows: 5,
    }));
  });

  it('qualifies a consistently falling market as Fall', () => {
    const result = window.AutonixFreeBotStrategy.analyzeRiseFall(makeTicks(-1));

    expect(result.valid).toBe(true);
    expect(result.selection).toBe('fall');
  });

  it('rejects noisy direction changes and insufficient tick history', () => {
    const noisy = Array.from({ length: 120 }, (_, index) => ({
      price: 100 + (index % 2 ? 1 : 0),
    }));

    expect(window.AutonixFreeBotStrategy.analyzeRiseFall(noisy).valid).toBe(false);
    expect(window.AutonixFreeBotStrategy.analyzeRiseFall(makeTicks(1).slice(0, 49)).valid).toBe(false);
  });

  it('reports live price and momentum while gathering the required history', () => {
    const result = window.AutonixFreeBotStrategy.analyzeRiseFall(makeTicks(1).slice(0, 20));

    expect(result).toEqual(expect.objectContaining({
      valid: false,
      setupStage: 'collecting',
      sampleSize: 20,
      currentPrice: 119,
      marketDirection: 'rise',
      change5: 4,
      change10: 9,
    }));
    expect(result.reason).toMatch(/20\/50/);
  });

  it('builds only valid Rise/Fall orders with a five-tick duration and 2x recovery', () => {
    const state = { symbol: 'R_50', martingale: 4.5 };
    const options = window.AutonixFreeBotStrategy.buildTradeOptions(
      state,
      { tradeType: 'rise-fall', selection: 'fall' },
      20,
      'USD',
    );

    expect(options).toEqual({
      tradeType: 'rise-fall',
      selection: 'fall',
      stake: 20,
      duration: 5,
      symbol: 'R_50',
      currency: 'USD',
    });
    expect(state.martingale).toBe(2);
    expect(() => window.AutonixFreeBotStrategy.buildTradeOptions(
      state,
      { tradeType: 'rise-fall', selection: 'over' },
      20,
      'USD',
    )).toThrow(/qualified Rise\/Fall signal/);
  });

  it('places a qualified trade from the Bots card and keeps live analysis updated', async () => {
    jest.useFakeTimers();
    const ticks = makeTicks(1).map((tick, index) => ({ ...tick, time: index * 1000 }));
    const buyContract = jest.fn((options, onSettle) => {
      onSettle({ won: true, pl: 1 });
      return Promise.resolve({});
    });
    window.SESSION_DATA = { isAuthenticated: true, activeAccount: { currency: 'USD' } };
    window.DerivWS = {
      getState: () => ({ connected: true, authorized: true }),
      isAuthorized: () => true,
      getHistory: () => Promise.resolve(ticks),
      subscribeTicks: () => {},
      buyContract,
    };

    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();
    document.dispatchEvent(new CustomEvent('derivBalance', { detail: { balance: 100, currency: 'USD' } }));
    await Promise.resolve();
    await Promise.resolve();

    const strategy = document.getElementById('tradetype-freeBot');
    strategy.value = 'rise-fall';
    strategy.dispatchEvent(new Event('change'));
    expect(document.getElementById('rf-analysis-freeBot').style.display).not.toBe('none');
    expect(document.getElementById('rf-direction-freeBot').textContent).toBe('RISE');

    document.getElementById('start-freeBot').click();
    jest.advanceTimersByTime(200);
    await Promise.resolve();

    expect(buyContract).toHaveBeenCalledTimes(1);
    expect(buyContract.mock.calls[0][0]).toEqual(expect.objectContaining({
      tradeType: 'rise-fall',
      selection: 'rise',
      duration: 5,
      stake: 10,
      currency: 'USD',
    }));
    expect(document.getElementById('rf-result-freeBot').textContent).toMatch(/WIN/);

    document.getElementById('start-freeBot').click();
    window.AutonixCore.tickBuffers['1HZ100V'].push({ price: 220, time: 121000 });
    jest.advanceTimersByTime(1000);
    expect(document.getElementById('rf-price-freeBot').textContent).toBe('220.00');
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('expires Basic and Expert independently after inactivity', async () => {
    jest.useFakeTimers();
    const response = (body) => ({ ok: true, json: () => Promise.resolve(body) });
    global.fetch = jest.fn((url, options) => {
      if (!options || options.method !== 'POST') return Promise.resolve(response({ active: false }));
      const body = JSON.parse(options.body);
      if (url === '/api/validate-activation') return Promise.resolve(response({ valid: true }));
      return Promise.resolve(response({
        active: body.action === 'activity',
        remaining_seconds: 600,
      }));
    });

    document.dispatchEvent(new Event('DOMContentLoaded'));
    for (let index = 0; index < 8; index += 1) await Promise.resolve();

    ['basicBot', 'expertBot'].forEach((botId) => {
      document.getElementById(`actcode-${botId}`).value = `${botId}-code`;
      document.getElementById(`validate-${botId}`).click();
    });
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    expect(document.getElementById('start-basicBot')).toBeTruthy();
    expect(document.getElementById('challenge-start')).toBeTruthy();

    jest.advanceTimersByTime(9 * 60 * 1000);
    document.getElementById('input-stake-basicBot').dispatchEvent(new Event('input', { bubbles: true }));
    await jest.advanceTimersByTimeAsync(200);
    jest.advanceTimersByTime(60 * 1000);

    expect(document.getElementById('actcode-expertBot')).toBeTruthy();
    expect(document.getElementById('start-basicBot')).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledWith('/api/activation-session', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'lock', tier: 'expert' }),
    }));
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});