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
    const options = {
      tradeType: 'over-under',
      selection: 'over',
      stake: 1,
      duration: 1,
      symbol: '1HZ10V',
      digit: 1,
      currency: 'USD',
    };
    const proposalPromise = window.DerivWS.getProposal(options);
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
    const proposal = await proposalPromise;
    expect(proposal).toEqual(expect.objectContaining({
      amount: 1,
      ask_price: 1,
      payout: 1.9,
      potentialProfit: 0.9,
      profitRate: 0.9,
    }));

    const purchasePromise = window.DerivWS.buyContractFromProposal(options, proposal, settled);
    await Promise.resolve();
    await Promise.resolve();
    const buyRequest = socket.sent.find((message) => message.buy === 'proposal-1');
    expect(buyRequest).toEqual(expect.objectContaining({ price: 1 }));
    socket.onmessage({ data: JSON.stringify({
      msg_type: 'proposal_open_contract',
      proposal_open_contract: {
        contract_id: 'contract-1', status: 'won',
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

  it('recognizes won and lost statuses as settled and cleans up subscriptions', () => {
    const results = [
      { contractId: 'contract-won', status: 'won', profit: 0.42 },
      { contractId: 'contract-lost', status: 'lost', profit: -1 },
    ];
    const callbacks = results.map(() => jest.fn());
    results.forEach((result, index) => {
      window.DerivWS.watchContract(result.contractId, callbacks[index]);
      const subscription = socket.sent.find((message) =>
        message.proposal_open_contract === 1 && message.contract_id === result.contractId
      );
      const settlementMessage = {
        msg_type: 'proposal_open_contract',
        req_id: subscription.req_id,
        subscription: { id: `poc-${result.contractId}` },
        proposal_open_contract: result,
      };
      socket.onmessage({ data: JSON.stringify(settlementMessage) });
      expect(window.DerivWS.getState().pocSubIds).not.toHaveProperty(result.contractId);
      expect(window.DerivWS.getState().pocBuffer).not.toHaveProperty(result.contractId);
    });

    expect(callbacks[0]).toHaveBeenCalledTimes(1);
    expect(callbacks[0]).toHaveBeenCalledWith(expect.objectContaining({ won: true, pl: 0.42 }));
    expect(callbacks[1]).toHaveBeenCalledTimes(1);
    expect(callbacks[1]).toHaveBeenCalledWith(expect.objectContaining({ won: false, pl: -1 }));
    expect(socket.sent).toEqual(expect.arrayContaining([
      { forget: 'poc-contract-won' },
      { forget: 'poc-contract-lost' },
    ]));
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

  it('reattaches active contract monitoring after reconnecting', () => {
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
      'wss://api.derivws.com/trading/v1/options/ws?otp=first-otp', 'USD',
    );
    socket.readyState = 1;
    socket.onopen();

    const settled = jest.fn();
    window.DerivWS.watchContract('contract-reconnect', settled);
    expect(socket.sent.some((message) => message.proposal_open_contract === 1)).toBe(true);
    socket.onclose();
    window.DerivWS.disconnect();

    socket = {
      readyState: 0,
      sent: [],
      send(message) { this.sent.push(JSON.parse(message)); },
      close() {},
    };
    window.DerivWS.connect(
      '1234', null, 'VRTC12345', null,
      'wss://api.derivws.com/trading/v1/options/ws?otp=second-otp', 'USD',
    );
    socket.readyState = 1;
    socket.onopen();

    expect(socket.sent.some((message) =>
      message.proposal_open_contract === 1 && message.contract_id === 'contract-reconnect'
    )).toBe(true);
  });

  it('finds a uniquely matching settled contract after a lost buy response', async () => {
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

    const submittedAt = Math.floor(Date.now() / 1000);
    const verification = window.DerivWS.reconcileContract({
      submittedAt,
      buyPrice: 2,
      contractType: 'DIGITOVER',
      symbol: '1HZ100V',
      barrier: '1',
    });
    const portfolioRequest = socket.sent.find((message) => message.portfolio === 1);
    const profitTableRequest = socket.sent.find((message) => message.profit_table === 1);
    socket.onmessage({ data: JSON.stringify({
      msg_type: 'portfolio',
      req_id: portfolioRequest.req_id,
      portfolio: { contracts: [] },
    }) });
    socket.onmessage({ data: JSON.stringify({
      msg_type: 'profit_table',
      req_id: profitTableRequest.req_id,
      profit_table: {
        transactions: [{
          contract_id: 'reconciled-contract',
          contract_type: 'DIGITOVER',
          underlying: '1HZ100V',
          barrier: '1',
          buy_price: 2,
          purchase_time: submittedAt,
          profit: -2,
        }],
      },
    }) });

    await expect(verification).resolves.toEqual(expect.objectContaining({
      status: 'settled',
      contractId: 'reconciled-contract',
      won: false,
      pl: -2,
    }));
  });

  it('checks a known contract directly when settlement notifications were missed', async () => {
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

    const verification = window.DerivWS.reconcileContract({ contractId: 'missed-settlement' });
    const request = socket.sent.find((message) =>
      message.proposal_open_contract === 1 && message.contract_id === 'missed-settlement'
    );
    expect(request).not.toHaveProperty('subscribe');
    socket.onmessage({ data: JSON.stringify({
      msg_type: 'proposal_open_contract',
      req_id: request.req_id,
      proposal_open_contract: {
        contract_id: 'missed-settlement',
        status: 'lost',
        profit: -1,
        buy_price: 1,
      },
    }) });

    await expect(verification).resolves.toEqual(expect.objectContaining({
      status: 'settled',
      contractId: 'missed-settlement',
      won: false,
      pl: -1,
    }));
  });
});
