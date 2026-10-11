describe('Autonix Rapid Over 1 execution', () => {
  let orders;
  let quoteRequests;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllTimers();
    jest.resetModules();
    orders = [];
    quoteRequests = [];
    document.body.innerHTML = '<div id="bots-grid"></div><div id="bot-cards-render-target"></div>';
    window.SESSION_DATA = { isAuthenticated: true, activeAccount: { currency: 'USD' } };
    window.DerivWS = {
      isAuthorized: () => true,
      getState: () => ({ connected: true, authorized: true }),
      getHistory: () => Promise.resolve([]),
      subscribeTicks: jest.fn(),
      getProposal: jest.fn((options) => {
        quoteRequests.push(options.stake);
        const profitRate = 0.2;
        return Promise.resolve({
          id: `proposal-${quoteRequests.length}`,
          amount: options.stake,
          ask_price: options.stake,
          payout: options.stake * (1 + profitRate),
          potentialProfit: options.stake * profitRate,
          profitRate,
        });
      }),
      buyContractFromProposal: jest.fn((options, proposal, onSettle) => new Promise((resolve) => {
        orders.push({ options, proposal, onSettle, resolve });
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

  async function flushPromises() {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  }

  async function waitForOrderCount(count) {
    await flushPromises();
    expect(orders).toHaveLength(count);
  }

  async function confirmOrder(index, won, pl) {
    const order = orders[index];
    order.resolve({
      contractId: `rapid-contract-${index}`,
      buyPrice: order.proposal.ask_price,
    });
    await flushPromises();
    order.onSettle({ contractId: `rapid-contract-${index}`, won, pl });
    await flushPromises();
  }

  async function startWithStake(stake = '2') {
    document.getElementById('input-stake-rapidOver1').value = stake;
    document.getElementById('start-rapidOver1').click();
    await waitForOrderCount(1);
  }

  it('recalculates after a partial recovery win and tracks purchased stake separately', async () => {
    const rapidCard = document.getElementById('card-rapidOver1');
    await startWithStake();

    expect(orders[0].options).toEqual(expect.objectContaining({
      tradeType: 'over-under',
      selection: 'over',
      digit: 1,
      duration: 1,
      stake: 2,
    }));
    await confirmOrder(0, false, -2);
    await waitForOrderCount(2);
    expect(orders[1].proposal.amount).toBe(20);

    await confirmOrder(1, true, 1);
    await waitForOrderCount(3);
    expect(orders[2].proposal.amount).toBe(15);
    expect(document.getElementById('rapid-recovery-loss').textContent).toBe('$2.00');
    expect(document.getElementById('rapid-total-stake').textContent).toBe('$37.00');

    await confirmOrder(2, true, 3);
    expect(document.getElementById('rapid-recovery-loss').textContent).toBe('$0.00');
    expect(document.getElementById('rapid-total-stake').textContent).toBe('$37.00');
    expect(document.getElementById('rapid-session-pl').textContent).toBe('+$2.00');
    expect(document.getElementById('rapid-countdown').textContent).toBe('5s');
    expect(rapidCard.textContent).not.toMatch(/analysis|signal|last digit|digit frequency/i);
    expect(rapidCard.textContent).not.toMatch(/multiplier|1 tick/i);

    jest.advanceTimersByTime(1000);
    expect(document.getElementById('rapid-countdown').textContent).toBe('4s');
    jest.advanceTimersByTime(4000);
    await waitForOrderCount(4);
    expect(orders[3].options.stake).toBe(2);
  });

  it('continues recovering repeated losses using the entire accumulated balance', async () => {
    await startWithStake();
    await confirmOrder(0, false, -2);
    await waitForOrderCount(2);
    expect(orders[1].proposal.amount).toBe(20);

    await confirmOrder(1, false, -20);
    await waitForOrderCount(3);
    expect(orders[2].proposal.amount).toBe(120);
    expect(document.getElementById('rapid-recovery-loss').textContent).toBe('$22.00');
    expect(document.getElementById('rapid-total-stake').textContent).toBe('$22.00');
  });

  it('converts minute intervals to the actual countdown schedule', async () => {
    document.getElementById('input-interval-rapidOver1').value = '1';
    document.getElementById('input-interval-unit-rapidOver1').value = 'minutes';
    document.getElementById('start-rapidOver1').click();
    await waitForOrderCount(1);
    await confirmOrder(0, true, 1);

    expect(document.getElementById('rapid-countdown').textContent).toBe('01:00');
    jest.advanceTimersByTime(1000);
    expect(document.getElementById('rapid-countdown').textContent).toBe('59s');
    expect(orders).toHaveLength(1);
  });

  it('cancels the scheduled normal trade when stopped during countdown', async () => {
    document.getElementById('start-rapidOver1').click();
    await waitForOrderCount(1);
    await confirmOrder(0, true, 1);
    document.getElementById('start-rapidOver1').click();

    jest.advanceTimersByTime(5000);
    expect(orders).toHaveLength(1);
    expect(document.getElementById('rapid-countdown').textContent).toBe('Stopped');
  });

  it('does not buy after Stop while a proposal is pending', async () => {
    let resolveProposal;
    window.DerivWS.getProposal.mockImplementationOnce(() => new Promise((resolve) => {
      resolveProposal = resolve;
    }));
    document.getElementById('start-rapidOver1').click();
    document.getElementById('start-rapidOver1').click();
    resolveProposal({
      id: 'proposal-stopped',
      amount: 2,
      ask_price: 2,
      payout: 2.4,
      potentialProfit: 0.4,
      profitRate: 0.2,
    });
    await flushPromises();
    expect(orders).toHaveLength(0);
    expect(document.getElementById('rapid-countdown').textContent).toBe('Stopped');

    document.getElementById('start-rapidOver1').click();
    await waitForOrderCount(1);
  });

  it('does not start another recovery after Stop during an active recovery contract', async () => {
    await startWithStake();
    await confirmOrder(0, false, -2);
    await waitForOrderCount(2);
    document.getElementById('start-rapidOver1').click();
    await confirmOrder(1, false, -20);
    expect(orders).toHaveLength(2);
    expect(document.getElementById('rapid-countdown').textContent).toBe('Stopped');
  });
});
