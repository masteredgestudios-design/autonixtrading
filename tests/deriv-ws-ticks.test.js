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
});
