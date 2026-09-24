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
