describe('DerivWS shared tick subscriptions', () => {
  let socket;

  beforeEach(() => {
    jest.resetModules();
    socket = {
      readyState: 0,
      sent: [],
      send(message) { this.sent.push(JSON.parse(message)); },
      close() {},
    };
    global.WebSocket = Object.assign(function MockWebSocket() { return socket; }, { OPEN: 1 });
    require('../static/js/deriv-ws.js');
    window.DerivWS.connect('1234');
    socket.readyState = 1;
    socket.onopen();
  });

  afterEach(() => {
    window.DerivWS.disconnect();
    delete window.DerivWS;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('uses the authenticated OTP URL without sending an authorize request', () => {
    jest.useFakeTimers();
    window.DerivWS.disconnect();
    socket = {
      readyState: 0,
      sent: [],
      send(message) { this.sent.push(JSON.parse(message)); },
      close() {},
    };
    window.DerivWS.connect(
      '1234', null, 'VRTC12345', null,
      'wss://ws.derivws.com/websockets/v3?app_id=1234&otp=fresh-otp', 'USD',
    );
    socket.readyState = 1;
    socket.onopen();

    expect(window.DerivWS.isAuthorized()).toBe(true);
    expect(socket.sent.some((message) => Object.prototype.hasOwnProperty.call(message, 'authorize'))).toBe(false);
    expect(socket.sent).toContainEqual(expect.objectContaining({ balance: 1, subscribe: 1 }));
  });

  it('places and settles an Over Digit 1 contract through the shared proposal/buy flow', async () => {
    jest.useFakeTimers();
    window.DerivWS.disconnect();
    socket = {
      readyState: 0,
      sent: [],
      send(message) { this.sent.push(JSON.parse(message)); },
      close() {},
    };
    window.DerivWS.connect(
      '1234', null, 'VRTC12345', null,
      'wss://api.derivws.com/trading/v1/options/ws?otp=fresh-otp', 'USD',
    );
    socket.readyState = 1;
    socket.onopen();

    const settled = jest.fn();
    const purchasePromise = window.DerivWS.buyContract({
      tradeType: 'over-under',
      selection: 'over',
      stake: 1,
      duration: 1,
      symbol: '1HZ10V',
      digit: 1,
      currency: 'USD',
    }, settled);
    const proposalRequest = socket.sent.find((message) => message.proposal === 1);
    expect(proposalRequest).toEqual(expect.objectContaining({
      underlying_symbol: '1HZ10V',
      contract_type: 'DIGITOVER',
      barrier: '1',
      duration: 1,
      duration_unit: 't',
    }));
    expect(proposalRequest).not.toHaveProperty('subscribe');

    socket.onmessage({ data: JSON.stringify({
      msg_type: 'proposal',
      req_id: proposalRequest.req_id,
      proposal: {
        id: 'proposal-1', payout: 1.9, ask_price: 1, contract_type: 'DIGITOVER',
        underlying: '1HZ10V', barrier: '1',
      },
    }) });
    await Promise.resolve();
    await Promise.resolve();

    const buyRequest = socket.sent.find((message) => message.buy === 'proposal-1');
    expect(buyRequest).toEqual(expect.objectContaining({ price: 1 }));
    socket.onmessage({ data: JSON.stringify({
      msg_type: 'proposal_open_contract',
      proposal_open_contract: {
        contract_id: 'contract-1', is_sold: true, status: 'sold',
        profit: 0.42, buy_price: 1, sell_price: 1.42, payout: 1.9,
      },
    }) });
    socket.onmessage({ data: JSON.stringify({
      msg_type: 'buy',
      req_id: buyRequest.req_id,
      buy: { contract_id: 'contract-1', buy_price: 1 },
    }) });
    await Promise.resolve();
    await Promise.resolve();

    await expect(purchasePromise).resolves.toEqual(expect.objectContaining({
      contractId: 'contract-1',
      buyPrice: 1,
    }));
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({
      won: true,
      pl: 0.42,
      contractId: 'contract-1',
    }));
  });

  it('submits Expert direct-buy parameters in one Deriv request', async () => {
    jest.useFakeTimers();
    window.DerivWS.disconnect();
    socket = {
      readyState: 0,
      sent: [],
      send(message) { this.sent.push(JSON.parse(message)); },
      close() {},
    };
    window.DerivWS.connect(
      '1234', null, 'VRTC12345', null,
      'wss://api.derivws.com/trading/v1/options/ws?otp=fresh-otp', 'USD',
    );
    socket.readyState = 1;
    socket.onopen();

    const beforeBuy = jest.fn();
    const buySent = jest.fn();
    const settled = jest.fn();
    const purchase = window.DerivWS.buyContract({
      tradeType: 'over-under',
      selection: 'over',
      stake: 1,
      duration: 1,
      symbol: '1HZ10V',
      digit: 1,
      currency: 'USD',
      atomicBuy: true,
      onBeforeBuy: beforeBuy,
      onBuySent: buySent,
    }, settled);
    await Promise.resolve();

    const buyRequest = socket.sent.find((message) => message.buy === '1');
    expect(socket.sent.some((message) => message.proposal === 1)).toBe(false);
    expect(buyRequest).toEqual(expect.objectContaining({
      price: 1,
      parameters: expect.objectContaining({
        amount: 1,
        basis: 'stake',
        contract_type: 'DIGITOVER',
        underlying_symbol: '1HZ10V',
        barrier: '1',
        duration: 1,
        duration_unit: 't',
      }),
    }));
    expect(beforeBuy).toHaveBeenCalledTimes(1);
    expect(buySent).toHaveBeenCalledTimes(1);

    socket.onmessage({ data: JSON.stringify({
      msg_type: 'buy',
      req_id: buyRequest.req_id,
      buy: { contract_id: 'contract-direct', buy_price: 1 },
    }) });
    await expect(purchase).resolves.toEqual(expect.objectContaining({
      contractId: 'contract-direct',
      buyPrice: 1,
    }));
    expect(socket.sent.some((message) => message.proposal_open_contract === 1)).toBe(true);
  });

  it('does not buy a Basic proposal after its activation expires', async () => {
    jest.useFakeTimers();
    window.DerivWS.disconnect();
    socket = {
      readyState: 0,
      sent: [],
      send(message) { this.sent.push(JSON.parse(message)); },
      close() {},
    };
    window.DerivWS.connect(
      '1234', null, 'VRTC12345', null,
      'wss://api.derivws.com/trading/v1/options/ws?otp=fresh-otp', 'USD',
    );
    socket.readyState = 1;
    socket.onopen();
    const activationCheck = jest.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const purchase = window.DerivWS.buyContract({
      tradeType: 'over-under',
      selection: 'over',
      stake: 1,
      duration: 1,
      symbol: '1HZ10V',
      digit: 1,
      currency: 'USD',
      activationCheck,
    });
    const proposalRequest = socket.sent.find((message) => message.proposal === 1);
    socket.onmessage({ data: JSON.stringify({
      msg_type: 'proposal',
      req_id: proposalRequest.req_id,
      proposal: {
        id: 'proposal-after-expiry', payout: 1.9, ask_price: 1,
        contract_type: 'DIGITOVER', underlying: '1HZ10V', barrier: '1',
      },
    }) });

    await expect(purchase).rejects.toMatchObject({ notSent: true });
    expect(activationCheck).toHaveBeenCalledTimes(2);
    expect(socket.sent.some((message) => message.buy)).toBe(false);
  });

  it('fans ticks out to each listener and removes only the requested listener', () => {
    const first = jest.fn();
    const second = jest.fn();
    const removeFirst = window.DerivWS.subscribeTicks('R_50', first);
    const removeSecond = window.DerivWS.subscribeTicks('R_50', second);
    const tickMessage = (quote) => socket.onmessage({
      data: JSON.stringify({ msg_type: 'tick', tick: { symbol: 'R_50', quote } }),
    });

    tickMessage('100.25');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    removeFirst();
    tickMessage('100.50');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    removeSecond();
    expect(window.DerivWS.getState().tickSubs.R_50).toBeUndefined();
  });

  it('reattaches to a saved contract and reports its settlement once', () => {
    jest.useFakeTimers();
    window.DerivWS.disconnect();
    socket = {
      readyState: 0,
      sent: [],
      send(message) { this.sent.push(JSON.parse(message)); },
      close() {},
    };
    window.DerivWS.connect(
      '1234', null, 'VRTC12345', null,
      'wss://api.derivws.com/trading/v1/options/ws?otp=fresh-otp', 'USD',
    );
    socket.readyState = 1;
    socket.onopen();

    const settled = jest.fn();
    window.DerivWS.watchContract('contract-saved', settled);
    const subscription = socket.sent.find((message) => message.proposal_open_contract === 1);
    expect(subscription).toEqual(expect.objectContaining({
      contract_id: 'contract-saved',
      subscribe: 1,
    }));
    const settlementMessage = {
      msg_type: 'proposal_open_contract',
      req_id: subscription.req_id,
      subscription: { id: 'poc-sub-1' },
      proposal_open_contract: {
        contract_id: 'contract-saved', is_sold: true, status: 'sold', profit: 0.19,
      },
    };
    socket.onmessage({ data: JSON.stringify(settlementMessage) });
    socket.onmessage({ data: JSON.stringify(settlementMessage) });

    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({
      won: true,
      pl: 0.19,
      contractId: 'contract-saved',
    }));
  });
});
