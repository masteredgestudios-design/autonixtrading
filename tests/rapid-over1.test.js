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
      buyContractFromProposal: jest.fn((options, proposal, onSettle) => new Promise((resolve, reject) => {
        orders.push({ options, proposal, onSettle, resolve, reject });
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

  async function waitForNextOrderCount(count, delay = 5000) {
    jest.advanceTimersByTime(delay);
    await waitForOrderCount(count);
  }

  async function confirmOrder(index, won, pl) {
    const order = orders[index];
    const contractId = `rapid-contract-${index}`;
    order.resolve({
      contractId,
      buyPrice: order.proposal.ask_price,
    });
    await flushPromises();
    const rapidCard = document.getElementById('card-rapidOver1');
    expect(document.getElementById('rapid-contract-id').textContent).toBe('Settling');
    expect(rapidCard.textContent).not.toContain(contractId);
    expect(document.getElementById('rapid-status-label').textContent).not.toContain(contractId);
    expect(document.getElementById('last-res-rapidOver1').title).not.toContain(contractId);
    order.onSettle({ contractId, won, pl });
    await flushPromises();
    expect(document.getElementById('rapid-contract-id').textContent).toBe(won ? 'Won' : 'Lost');
    expect(rapidCard.outerHTML).not.toContain(contractId);
  }

  async function startWithStake(stake = '2') {
    document.getElementById('input-stake-rapidOver1').value = stake;
    expect(document.getElementById('rapid-recovery-target').textContent).toBe('$0.00');
    document.getElementById('start-rapidOver1').click();
    expect(orders).toHaveLength(0);
    expect(quoteRequests).toHaveLength(0);
    await waitForNextOrderCount(1);
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
    expect(orders).toHaveLength(1);
    expect(quoteRequests).toHaveLength(1);
    expect(document.getElementById('rapid-countdown').textContent).toBe('5s');
    await waitForNextOrderCount(2);
    expect(quoteRequests).toHaveLength(2);
    expect(orders[1].proposal.amount).toBe(11.33);
    expect(document.getElementById('rapid-recovery-target').textContent).toBe('$2.00');

    await confirmOrder(1, true, 1);
    await waitForNextOrderCount(3);
    expect(orders[2].proposal.amount).toBe(5.67);
    expect(document.getElementById('rapid-recovery-loss').textContent).toBe('$1.00');
    expect(document.getElementById('rapid-recovery-target').textContent).toBe('$1.00');
    expect(document.getElementById('rapid-total-stake').textContent).toBe('$22.00');

    await confirmOrder(2, true, 3);
    expect(document.getElementById('rapid-recovery-loss').textContent).toBe('$0.00');
    expect(document.getElementById('rapid-recovery-target').textContent).toBe('$0.00');
    expect(document.getElementById('rapid-total-stake').textContent).toBe('$37.00');
    expect(document.getElementById('rapid-session-pl').textContent).toBe('+$2.00');
    expect(document.getElementById('rapid-countdown').textContent).toBe('5s');
    expect(document.getElementById('rapid-contract-id').textContent).toBe('Won');
    expect(document.getElementById('rapid-current-stake').textContent).toBe('$2.00');
    expect(rapidCard.textContent).not.toMatch(/analysis|signal|last digit|digit frequency/i);
    expect(rapidCard.textContent).not.toMatch(/multiplier|1 tick/i);

    jest.advanceTimersByTime(1000);
    expect(document.getElementById('rapid-countdown').textContent).toBe('4s');
    jest.advanceTimersByTime(4000);
    await waitForOrderCount(4);
    expect(orders[3].options.stake).toBe(2);
  });

  it('displays one dollar outstanding after a one-dollar loss while preserving the recovery profit objective', async () => {
    await startWithStake('1');

    await confirmOrder(0, false, -1);
    await waitForNextOrderCount(2);

    expect(document.getElementById('rapid-recovery-loss').textContent).toBe('$1.00');
    expect(document.getElementById('rapid-recovery-target').textContent).toBe('$1.00');
    expect(orders[1].proposal.amount).toBe(5.67);
    expect(document.getElementById('rapid-current-stake').textContent).toBe('$5.67');
  });

  it('continues recovering repeated losses using the entire accumulated balance', async () => {
    await startWithStake('1');
    await confirmOrder(0, false, -1);
    await waitForNextOrderCount(2);
    expect(orders[1].proposal.amount).toBe(5.67);

    await confirmOrder(1, false, -5.67);
    await waitForNextOrderCount(3);
    expect(orders[2].proposal.amount).toBe(37.79);
    expect(document.getElementById('rapid-recovery-loss').textContent).toBe('$6.67');
    expect(document.getElementById('rapid-recovery-target').textContent).toBe('$6.67');
    expect(document.getElementById('rapid-total-stake').textContent).toBe('$6.67');
    expect(document.getElementById('rapid-current-stake').textContent).toBe('$37.79');
  });

  it('uses the configured initial stake after recovery across repeated cycles and consecutive losses', async () => {
    await startWithStake('3.25');

    await confirmOrder(0, false, -3.25);
    expect(orders).toHaveLength(1);
    await waitForNextOrderCount(2);
    expect(orders[1].proposal.amount).toBe(18.41);

    await confirmOrder(1, true, 3.25);
    await waitForNextOrderCount(3);
    expect(orders[2].options.stake).toBe(3.25);
    expect(document.getElementById('rapid-recovery-loss').textContent).toBe('$0.00');
    expect(document.getElementById('rapid-recovery-target').textContent).toBe('$0.00');
    expect(document.getElementById('rapid-current-stake').textContent).toBe('$3.25');

    await confirmOrder(2, true, 3.25);
    expect(document.getElementById('rapid-current-stake').textContent).toBe('$3.25');
    jest.advanceTimersByTime(5000);
    await waitForOrderCount(4);
    expect(orders[3].options.stake).toBe(3.25);

    await confirmOrder(3, false, -6);
    await waitForNextOrderCount(5);
    expect(orders[4].proposal.amount).toBe(33.99);

    await confirmOrder(4, false, -33.99);
    await waitForNextOrderCount(6);
    expect(orders[5].proposal.amount).toBe(226.57);

    await confirmOrder(5, true, 43.25);
    expect(document.getElementById('rapid-current-stake').textContent).toBe('$3.25');
    jest.advanceTimersByTime(5000);
    await waitForOrderCount(7);
    expect(orders[6].options.stake).toBe(3.25);
  });

  it('records the maximum confirmed loss streak and resets it only with the session', async () => {
    await startWithStake();

    await confirmOrder(0, false, -1);
    await waitForNextOrderCount(2);
    await confirmOrder(1, false, -5);
    await waitForNextOrderCount(3);
    await confirmOrder(2, false, -10);
    await waitForNextOrderCount(4);
    expect(document.getElementById('rapid-max-loss-streak').textContent)
      .toBe('3 consecutive losses — $16.00 lost');

    document.getElementById('start-rapidOver1').click();
    await confirmOrder(3, true, 100);
    expect(document.getElementById('rapid-max-loss-streak').textContent)
      .toBe('3 consecutive losses — $16.00 lost');

    document.getElementById('start-rapidOver1').click();
    await waitForNextOrderCount(5);
    expect(document.getElementById('rapid-max-loss-streak').textContent)
      .toBe('3 consecutive losses — $16.00 lost');
    await confirmOrder(4, false, -2);
    await waitForNextOrderCount(6);
    await confirmOrder(5, false, -4);
    await waitForNextOrderCount(7);
    expect(document.getElementById('rapid-max-loss-streak').textContent)
      .toBe('3 consecutive losses — $16.00 lost');

    await confirmOrder(6, true, 100);
    jest.advanceTimersByTime(5000);
    await waitForOrderCount(8);
    await confirmOrder(7, false, -1);
    await waitForNextOrderCount(9);
    await confirmOrder(8, false, -2);
    await waitForNextOrderCount(10);
    await confirmOrder(9, false, -3);
    await waitForNextOrderCount(11);
    await confirmOrder(10, false, -4);
    await waitForNextOrderCount(12);
    expect(document.getElementById('rapid-max-loss-streak').textContent)
      .toBe('4 consecutive losses — $10.00 lost');

    await confirmOrder(11, true, 100);
    document.getElementById('reset-rapidOver1').click();
    expect(document.getElementById('rapid-max-loss-streak').textContent)
      .toBe('0 consecutive losses — $0.00 lost');
    expect(document.getElementById('rapid-recovery-target').textContent).toBe('$0.00');
  });

  it('converts minute intervals to the actual countdown schedule', async () => {
    document.getElementById('input-interval-rapidOver1').value = '1';
    document.getElementById('input-interval-unit-rapidOver1').value = 'minutes';
    document.getElementById('start-rapidOver1').click();
    await waitForNextOrderCount(1, 60000);
    await confirmOrder(0, true, 1);

    expect(document.getElementById('rapid-countdown').textContent).toBe('01:00');
    jest.advanceTimersByTime(1000);
    expect(document.getElementById('rapid-countdown').textContent).toBe('59s');
    expect(orders).toHaveLength(1);
  });

  it('cancels the scheduled normal trade when stopped during countdown', async () => {
    document.getElementById('start-rapidOver1').click();
    await waitForNextOrderCount(1);
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
    jest.advanceTimersByTime(5000);
    await flushPromises();
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
    await waitForNextOrderCount(1);
  });

  it('does not start another recovery after Stop during an active recovery contract', async () => {
    await startWithStake();
    await confirmOrder(0, false, -2);
    await waitForNextOrderCount(2);
    document.getElementById('start-rapidOver1').click();
    await confirmOrder(1, false, -20);
    expect(orders).toHaveLength(2);
    expect(document.getElementById('rapid-countdown').textContent).toBe('Stopped');
  });

  it('recovers a submitted contract after a WebSocket disconnect without buying twice', async () => {
    await startWithStake();
    const disconnectError = new Error('WebSocket disconnected while request was pending');
    disconnectError.connectionInterrupted = true;
    disconnectError.requestSent = true;
    window.DerivWS.reconcileContract = jest.fn().mockResolvedValue({
      status: 'settled',
      contractId: 'rapid-recovered-contract',
      won: false,
      pl: -2,
      buyPrice: 2,
    });
    orders[0].reject(disconnectError);
    await flushPromises();

    expect(window.DerivWS.reconcileContract).toHaveBeenCalledWith(expect.objectContaining({
      buyPrice: 2,
      contractType: 'DIGITOVER',
      symbol: expect.any(String),
      barrier: '1',
    }));
    expect(orders).toHaveLength(1);
    expect(document.getElementById('rapid-session-pl').textContent).toBe('-$2.00');
    expect(document.getElementById('rapid-recovery-target').textContent).toBe('$2.00');
    expect(document.getElementById('rapid-contract-id').textContent).toBe('Lost');

    await waitForNextOrderCount(2);
    expect(orders[1].proposal.amount).toBe(11.33);
  });

  it('keeps an unverified submitted order locked instead of retrying it', async () => {
    await startWithStake();
    const disconnectError = new Error('WebSocket disconnected while request was pending');
    disconnectError.connectionInterrupted = true;
    disconnectError.requestSent = true;
    window.DerivWS.reconcileContract = jest.fn().mockResolvedValue({ status: 'not_found' });
    orders[0].reject(disconnectError);
    await flushPromises();

    jest.advanceTimersByTime(15000);
    await flushPromises();
    expect(orders).toHaveLength(1);
    expect(document.getElementById('rapid-countdown').textContent).toBe('Waiting for settlement');
  });
});
