describe('Over 1 AI Predictor model', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="bots-grid"></div>';
    jest.resetModules();
    require('../static/js/bots-page.js');
  });

  it('computes a probability from real tick data and uses controlled stake progression', () => {
    const predictor = window.AutonixOver1Predictor;
    expect(predictor).toBeDefined();
    const tickSeries = [
      { price: 1.12 }, { price: 1.14 }, { price: 1.16 }, { price: 1.17 },
      { price: 1.18 }, { price: 1.19 }, { price: 1.20 }, { price: 1.21 },
      { price: 1.22 }, { price: 1.24 }, { price: 1.25 }, { price: 1.26 },
      { price: 1.27 }, { price: 1.29 }, { price: 1.21 }, { price: 1.19 },
      { price: 1.20 }, { price: 1.22 }, { price: 1.24 }, { price: 1.25 },
      { price: 1.26 }, { price: 1.28 }, { price: 1.32 }, { price: 1.34 },
      { price: 1.35 }, { price: 1.37 }, { price: 1.39 }, { price: 1.41 },
      { price: 1.42 }, { price: 1.45 }, { price: 1.46 }
    ];

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
