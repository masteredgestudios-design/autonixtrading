describe('Autonix Rapid Over 1 execution', () => {
  let orders;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllTimers();
    jest.resetModules();
    orders = [];
    document.body.innerHTML = '<div id="bots-grid"></div><div id="bot-cards-render-target"></div>';
    window.SESSION_DATA = { isAuthenticated: true, activeAccount: { currency: 'USD' } };
    window.DerivWS = {
      isAuthorized: () => true,
      getState: () => ({ connected: true, authorized: true }),
      getHistory: () => Promise.resolve([]),
      subscribeTicks: jest.fn(),
      buyContract: jest.fn((options, onSettle) => new Promise((resolve) => {
        orders.push({ options, onSettle, resolve });
      })),
    };

    require('../static/js/bots-page.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    document.dispatchEvent(new CustomEvent('derivBalance', {
      detail: { balance: 1000, currency: 'USD' },
    }));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete window.DerivWS;
    delete window.SESSION_DATA;
  });

  async function confirmOrder(index, won, pl) {
    const order = orders[index];
    order.resolve({ contractId: `rapid-contract-${index}` });
    await Promise.resolve();
    await Promise.resolve();
    order.onSettle({ contractId: `rapid-contract-${index}`, won, pl });
  }

  it.each([true, false])('uses one immediate recovery and then schedules a normal trade after recovery win=%s', async (recoveryWon) => {
    const rapidCard = document.getElementById('card-rapidOver1');
    document.getElementById('input-stake-rapidOver1').value = '2';
    document.getElementById('start-rapidOver1').click();

    expect(orders).toHaveLength(1);
    expect(orders[0].options).toEqual(expect.objectContaining({
      tradeType: 'over-under',
      selection: 'over',
      digit: 1,
      duration: 1,
      stake: 2,
    }));

    await confirmOrder(0, false, -2);
    expect(orders).toHaveLength(2);
    expect(orders[1].options.stake).toBe(12);
    expect(orders[1].options.duration).toBe(1);

    await confirmOrder(1, recoveryWon, recoveryWon ? 1 : -12);
    expect(orders).toHaveLength(2);
    expect(document.getElementById('rapid-countdown').textContent).toBe('5s');
    expect(rapidCard.textContent).not.toMatch(/analysis|signal|last digit|digit frequency/i);
    expect(rapidCard.textContent).not.toMatch(/multiplier|1 tick/i);

    jest.advanceTimersByTime(1000);
    expect(document.getElementById('rapid-countdown').textContent).toBe('4s');
    jest.advanceTimersByTime(4000);
    expect(orders).toHaveLength(3);
    expect(orders[2].options.stake).toBe(2);
  });

  it('converts minute intervals to the actual countdown schedule', async () => {
    document.getElementById('input-interval-rapidOver1').value = '1';
    document.getElementById('input-interval-unit-rapidOver1').value = 'minutes';
    document.getElementById('start-rapidOver1').click();
    await confirmOrder(0, true, 1);

    expect(document.getElementById('rapid-countdown').textContent).toBe('01:00');
    jest.advanceTimersByTime(1000);
    expect(document.getElementById('rapid-countdown').textContent).toBe('59s');
    expect(orders).toHaveLength(1);
  });

  it('cancels the scheduled normal trade when stopped during countdown', async () => {
    document.getElementById('start-rapidOver1').click();
    await confirmOrder(0, true, 1);
    document.getElementById('start-rapidOver1').click();

    jest.advanceTimersByTime(5000);
    expect(orders).toHaveLength(1);
    expect(document.getElementById('rapid-countdown').textContent).toBe('Stopped');
  });
});
