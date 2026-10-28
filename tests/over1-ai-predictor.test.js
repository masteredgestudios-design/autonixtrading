describe('Over 1 AI Predictor model', () => {
  const makeTicks = (digits) => digits.map((digit) => ({ price: Number(`1.0${digit}`) }));

  beforeEach(() => {
    document.body.innerHTML = '<div id="bots-grid"></div>';
    jest.resetModules();
    require('../static/js/bots-page.js');
  });

  it('computes a probability from real tick data and uses controlled stake progression', () => {
    const predictor = window.AutonixOver1Predictor;
    expect(predictor).toBeDefined();
    const tickSeries = makeTicks(Array.from({ length: 240 }, (_, index) => 2 + (index % 8)));

    const result = predictor.evaluateWindow(tickSeries);
    expect(result).toBeDefined();
    expect(result.over1Probability).toBeGreaterThan(0);
    expect(result.over1Probability).toBeLessThanOrEqual(1);
    expect(result.valid).toBe(true);
    const session = predictor.createSession({ stake: 10, takeProfit: 5, martingale: 4.5, stopLoss: 50 });
    const firstLoss = predictor.handleTradeResult(session, { won: false, pl: -10 });
    expect(firstLoss.currentStake).toBeCloseTo(45, 2);
    expect(firstLoss.tradeAllowed).toBe(true);
    const win = predictor.handleTradeResult(session, { won: true, pl: 2.75 });
    expect(win.currentStake).toBeCloseTo(10, 2);
    expect(win.sessionProfit).toBeCloseTo(-7.25, 2);
  });

  it('rejects weak, unstable, and short-history setups', () => {
    const predictor = window.AutonixOver1Predictor;
    const balanced = makeTicks(Array.from({ length: 240 }, (_, index) => index % 10));
    const result = predictor.evaluateWindow(balanced);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Analyzing|Collecting/);
  });

  it('signals Over 1 when none of the configured previous tick digits are 1', () => {
    const predictor = window.AutonixOver1Predictor;
    const ticks = makeTicks([1, 2, 3, 4]);

    expect(predictor.defaultPreviousTickCount).toBe(3);
    expect(predictor.analyzePreviousTicks(ticks, 3)).toEqual({
      ready: true,
      shouldTrade: true,
      digits: [2, 3, 4],
    });
    expect(predictor.analyzePreviousTicks(makeTicks([2, 1, 4]), 3).shouldTrade).toBe(false);
    expect(predictor.analyzePreviousTicks(makeTicks([2, 4]), 3).ready).toBe(false);
  });

  it('reports separate development and validation metrics', () => {
    const predictor = window.AutonixOver1Predictor;
    const historical = makeTicks(Array.from({ length: 260 }, (_, index) => 2 + (index % 8)));
    const report = predictor.validateHistory({
      developmentTicks: historical,
      validationTicks: historical,
    });

    expect(report.development.samples).toBeGreaterThan(0);
    expect(report.validation.samples).toBeGreaterThan(0);
    expect(report.validation).toEqual(expect.objectContaining({
      signalFrequency: expect.any(Number),
      winRate: expect.any(Number),
      falseSignalRate: expect.any(Number),
      maxConsecutiveLosses: expect.any(Number),
      performanceByWindow: expect.any(Object),
    }));
  });

  it('stops only when the configured stop loss is reached', () => {
    const predictor = window.AutonixOver1Predictor;
    const session = predictor.createSession({ stake: 10, takeProfit: 5, martingale: 4.5, stopLoss: 20 });

    session.running = true;
    session.activeTrade = true;

    const continued = predictor.handleTradeResult(session, { won: false, pl: -10 });
    expect(continued.lossStopped).toBe(false);
    expect(continued.tradeAllowed).toBe(true);

    const stopped = predictor.handleTradeResult(session, { won: false, pl: -10 });
    expect(stopped.lossStopped).toBe(true);
    expect(stopped.running).toBe(false);
    expect(stopped.tradeAllowed).toBe(false);
  });
});

describe('Over 1 AI Predictor tick stream', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    document.body.innerHTML = '<div id="bots-grid"><div id="bot-cards-render-target"></div></div>';
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete window.DerivWS;
    delete window.SESSION_DATA;
  });

  it('counts seeded and live ticks once across duplicate updates and repeated stream setup', async () => {
    const listeners = [];
    window.SESSION_DATA = { isAuthenticated: false };
    window.DerivWS = {
      getState: () => ({ connected: true, authorized: false }),
      isAuthorized: () => false,
      getHistory: jest.fn(() => Promise.resolve([
        { price: 1.02, time: 100000 },
        { price: 1.03, time: 101000 },
      ])),
      subscribeTicks: jest.fn((symbol, callback) => {
        listeners.push(callback);
        return jest.fn();
      }),
    };

    require('../static/js/bots-page.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();
    await Promise.resolve();

    window.AutonixCore.ensureSymbolStream('1HZ100V');
    document.dispatchEvent(new CustomEvent('derivBalance', {
      detail: { balance: 100, currency: 'USD' },
    }));

    expect(window.DerivWS.subscribeTicks).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(1);

    const onTick = listeners[0];
    onTick({ quote: 1.03, epoch: 101 });
    onTick({ quote: 1.04, epoch: 102 });
    onTick({ quote: 1.04, epoch: 102 });
    onTick({ quote: 1.05, epoch: 103 });

    const ticks = window.AutonixCore.tickBuffers['1HZ100V'];
    const analysis = window.AutonixOver1Predictor.analyzePreviousTicks(ticks, 3);
    const frequencyCounts = window.AutonixCore.countDigits(ticks, ticks.length);

    expect(ticks).toHaveLength(4);
    expect(frequencyCounts.reduce((total, count) => total + count, 0)).toBe(4);
    expect(analysis).toEqual({
      ready: true,
      shouldTrade: true,
      digits: [3, 4, 5],
    });
    expect(document.getElementById('live-digits-over1AiPredictor').textContent).toBe('3  ·  4  ·  5');
  });
});
