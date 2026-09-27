/* ═══════════════════════════════════════════════════════════════
   Autonix Trader — Deriv WebSocket API Client
   Handles authorization, balance streaming, tick streaming,
   and contract buying/settling via Deriv's WebSocket API.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=";
  var RECONNECT_DELAY = 3000;
  var MAX_RECONNECTS = 10;

  var state = {
    ws: null,
    appId: null,
    token: null,
    accountId: null,
    currency: null,
    connected: false,
    authorized: false,
    reqId: 1,
    pendingReqs: {},    // reqId -> { resolve, reject }
    tickSubs: {},       // symbol -> [{ id, callback }]
    balanceCb: null,
    contractCbs: {},    // contractId -> settleCallback
    pocBuffer: {},      // contractId -> [poc, …]  — buffers POC arriving before callback
    pocSubIds: {},      // contractId -> subscriptionId (for cleanup)
    reconnectCount: 0,
    reconnectTimer: null,
    tickSubIds: {},     // symbol -> subscriptionId
    tickSubPending: {}, // symbol -> subscription request in flight
    tickListenerId: 1,
    balanceSubId: null,
    wsUrl: null,
  };

  /* ── Helpers ────────────────────────────────────────────────── */
  function nextReqId() {
    return state.reqId++;
  }

  function send(msg) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    state.ws.send(JSON.stringify(msg));
    return true;
  }

  function sendRequest(payload) {
    return new Promise(function (resolve, reject) {
      var id = nextReqId();
      payload.req_id = id;
      state.pendingReqs[id] = { resolve: resolve, reject: reject };
      if (!send(payload)) {
        delete state.pendingReqs[id];
        reject(new Error("WebSocket not open"));
      }
    });
  }

  /* ── Message dispatcher ─────────────────────────────────────── */
  function onMessage(evt) {
    var msg;
    try {
      msg = JSON.parse(evt.data);
    } catch (e) {
      return;
    }

    var id = msg.req_id;
    var type = msg.msg_type;

    /* Resolve pending one-shot requests */
    if (id && state.pendingReqs[id]) {
      var cb = state.pendingReqs[id];
      delete state.pendingReqs[id];
      if (msg.error) {
        cb.reject(new Error(msg.error.message || "Deriv API error"));
      } else {
        cb.resolve(msg);
      }
      /* Don't return — subscriptions also carry req_id on first message */
    }

    if (type === "authorize") {
      if (!msg.error) {
        state.authorized = true;
        var acc = msg.authorize;
        state.accountId = acc.loginid;
        state.currency = acc.currency;
        if (!state.wsUrl) {
          afterAuthorize(acc);
        }
      }
    }

    if (type === "balance") {
      var bal = msg.balance;
      if (bal && state.balanceCb) {
        state.balanceCb(bal.balance, bal.currency, bal.loginid);
      }
      if (bal) {
        syncBalance(bal.balance, bal.currency, bal.loginid);
        /* Fire global event so any page (bots, trader) can update its balance display */
        try {
          document.dispatchEvent(new CustomEvent("derivBalance", {
            detail: { balance: bal.balance, currency: bal.currency, loginid: bal.loginid }
          }));
        } catch (e) {}
      }
    }

    if (type === "tick") {
      var tick = msg.tick;
      var listeners = tick && state.tickSubs[tick.symbol];
      if (listeners && listeners.length) {
        listeners.slice().forEach(function (listener) {
          try { listener.callback(tick); } catch (e) { console.error("[DerivWS] Tick listener failed:", e); }
        });
      } else if (tick && window._onDerivTick) {
        window._onDerivTick(tick);
      }
    }

    if (type === "buy") {
      if (msg.error) {
        var buyErr = msg.error.message || "Buy failed";
        console.error(
          "[DerivWS] Buy error:",
          JSON.stringify(msg.error),
          "| currency:", state.currency,
          "| account:", state.accountId
        );
        if (window.showToast)
          window.showToast("Trade error: " + buyErr, "red", 4000);
      }
    }

    if (type === "proposal_open_contract") {
      var poc = msg.proposal_open_contract;
      if (poc && poc.contract_id) {
        /* Track subscription id for cleanup */
        if (msg.subscription && msg.subscription.id) {
          state.pocSubIds[poc.contract_id] = msg.subscription.id;
        }

        if (state.contractCbs[poc.contract_id]) {
          /* Callback already registered — dispatch immediately */
          _dispatchPOC(poc.contract_id, poc);
        } else {
          /* Race condition: POC arrived before callback was registered.
             Buffer it — drainPocBuffer() will replay it after registration. */
          if (!state.pocBuffer[poc.contract_id]) {
            state.pocBuffer[poc.contract_id] = [];
          }
          state.pocBuffer[poc.contract_id].push(poc);
        }
      }
    }
  }

  /* Dispatch a POC to the registered callback and clean up when sold */
  function _dispatchPOC(contractId, poc) {
    var fn = state.contractCbs[contractId];
    if (!fn) return;
    fn(poc);
    if (poc.is_sold || poc.status === "sold") {
      delete state.contractCbs[contractId];
      /* Cancel the POC subscription stream to keep things tidy */
      var subId = state.pocSubIds[contractId];
      if (subId) {
        send({ forget: subId });
        delete state.pocSubIds[contractId];
      }
      /* Clear any residual buffer */
      delete state.pocBuffer[contractId];
    }
  }

  /* Drain buffered POC messages for a contractId once the callback is ready */
  function drainPocBuffer(contractId) {
    var buf = state.pocBuffer[contractId];
    if (!buf || !buf.length) return;
    delete state.pocBuffer[contractId];
    buf.forEach(function (poc) {
      /* Guard: callback might have been cleared by an earlier drain entry */
      if (state.contractCbs[contractId]) {
        _dispatchPOC(contractId, poc);
      }
    });
  }

  /* Explicitly subscribe to proposal_open_contract for a specific contract */
  function subscribeContractPOC(contractId) {
    var id = nextReqId();
    /* Register a dummy pending handler so the first POC response (which
       carries the req_id) resolves cleanly and doesn't stay pending forever */
    state.pendingReqs[id] = {
      resolve: function (msg) {
        /* First POC message from this subscription — hand it to onMessage */
        if (msg.proposal_open_contract) {
          var poc = msg.proposal_open_contract;
          if (poc && poc.contract_id) {
            if (msg.subscription && msg.subscription.id) {
              state.pocSubIds[poc.contract_id] = msg.subscription.id;
            }
            if (state.contractCbs[poc.contract_id]) {
              _dispatchPOC(poc.contract_id, poc);
            } else {
              if (!state.pocBuffer[poc.contract_id]) state.pocBuffer[poc.contract_id] = [];
              state.pocBuffer[poc.contract_id].push(poc);
            }
          }
        }
      },
      reject: function () {},
    };
    send({ proposal_open_contract: 1, subscribe: 1, contract_id: contractId, req_id: id });
  }

  /* ── Post-authorize setup ───────────────────────────────────── */
  function afterAuthorize(acc) {
    var balReqId = nextReqId();
    state.pendingReqs[balReqId] = {
      resolve: function (msg) {
        if (msg.balance) state.balanceSubId = msg.balance.id;
      },
      reject: function () {},
    };
    send({ balance: 1, subscribe: 1, req_id: balReqId });

    if (acc.balance !== undefined && state.balanceCb) {
      state.balanceCb(acc.balance, acc.currency, acc.loginid);
    }
    if (acc.balance !== undefined) {
      syncBalance(acc.balance, acc.currency, acc.loginid);
    }
  }

  /* ── Sync balance to Flask session + global event ───────────── */
  function syncBalance(balance, currency, loginid) {
    fetch("/auth/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ balance: balance, currency: currency, account: loginid }),
    }).catch(function () {});

    /* Update top-nav balance chip */
    var balEl = document.querySelector(".account-balance");
    if (balEl && loginid === state.accountId) {
      balEl.textContent = window.AutonixCurrency
        ? window.AutonixCurrency.format(balance)
        : currency + " " + parseFloat(balance).toFixed(2);
    }
  }

  /* ── Tick subscription ──────────────────────────────────────── */
  function subscribeTicksInternal(symbol) {
    if (state.tickSubIds[symbol] || state.tickSubPending[symbol]) return;
    state.tickSubPending[symbol] = true;
    var id = nextReqId();
    state.pendingReqs[id] = {
      resolve: function (msg) {
        delete state.tickSubPending[symbol];
        if (msg.subscription && state.tickSubs[symbol] && state.tickSubs[symbol].length) {
          state.tickSubIds[symbol] = msg.subscription.id;
        } else if (msg.subscription) {
          send({ forget: msg.subscription.id });
        }
      },
      reject: function () { delete state.tickSubPending[symbol]; },
    };
    send({ ticks: symbol, subscribe: 1, req_id: id });
  }

  function unsubscribeTicksInternal(symbol) {
    var subId = state.tickSubIds[symbol];
    if (subId) {
      send({ forget: subId });
      delete state.tickSubIds[symbol];
    }
    delete state.tickSubs[symbol];
    delete state.tickSubPending[symbol];
  }

  /* ── Connect & (optionally) authorize ───────────────────────── */
  function connect(appId, token, accountId, onBalance, wsUrl, currency) {
    state.appId = appId;
    state.token = token || null;
    state.accountId = accountId || null;
    state.balanceCb = onBalance || null;
    state.wsUrl = wsUrl || null;
    state.currency = currency || state.currency || null;

    if (state.ws) {
      try { state.ws.close(); } catch (e) {}
    }

     /* Public chart/tick streaming uses the same Options endpoint as the
       React chart. Authenticated accounts continue using their OTP URL. */
     var url = wsUrl || window.DERIV_PUBLIC_WS_URL || WS_URL + appId;
    var ws = new WebSocket(url);
    state.ws = ws;
    state.connected = false;
    state.authorized = false;

    ws.onopen = function () {
      state.connected = true;
      state.reconnectCount = 0;

      Object.keys(state.tickSubs).forEach(function (sym) {
        subscribeTicksInternal(sym);
      });

      if (state.wsUrl) {
        state.authorized = true;
        afterAuthorize({
          loginid: state.accountId || "",
          balance: undefined,
          currency: state.currency || "USD",
        });

        try {
          var up = new URL(state.wsUrl).searchParams;
          var otpToken = up.get("otp") || up.get("token") || up.get("access_token");
          if (otpToken) {
            sendRequest({ authorize: otpToken })
              .then(function () {})
              .catch(function () {});
          }
        } catch (e) {}
      } else if (state.token) {
        sendRequest({ authorize: state.token })
          .then(function () {})
          .catch(function (err) {
            if (window.showToast)
              window.showToast("Deriv auth error: " + (err.message || "unknown"), "red", 4000);
          });
      }
    };

    ws.onmessage = onMessage;
    ws.onerror = function () {};
    ws.onclose = function () {
      state.connected = false;
      state.authorized = false;
      state.tickSubIds = {};
      state.tickSubPending = {};
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (state.reconnectCount >= MAX_RECONNECTS) return;
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(function () {
      state.reconnectCount++;

      if (state.wsUrl) {
        fetch("/auth/otp-url", { credentials: "include" })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
          .then(function (data) {
            var freshUrl = (data && data.wsUrl) ? data.wsUrl : state.wsUrl;
            state.wsUrl = freshUrl;
            connect(state.appId, state.token, state.accountId, state.balanceCb, freshUrl, state.currency);
          })
          .catch(function () {
            connect(state.appId, state.token, state.accountId, state.balanceCb, state.wsUrl, state.currency);
          });
      } else {
        connect(state.appId, state.token, state.accountId, state.balanceCb, null, state.currency);
      }
    }, RECONNECT_DELAY);
  }

  /* ── Public tick API ────────────────────────────────────────── */
  function subscribeTicks(symbol, cb) {
    if (!symbol || typeof cb !== "function") return function () {};
    var listener = { id: state.tickListenerId++, callback: cb };
    if (!state.tickSubs[symbol]) state.tickSubs[symbol] = [];
    state.tickSubs[symbol].push(listener);
    if (state.connected) subscribeTicksInternal(symbol);
    var active = true;
    return function () {
      if (!active) return;
      active = false;
      var listeners = state.tickSubs[symbol];
      if (!listeners) return;
      state.tickSubs[symbol] = listeners.filter(function (item) { return item.id !== listener.id; });
      if (!state.tickSubs[symbol].length) unsubscribeTicksInternal(symbol);
    };
  }

  function unsubscribeTicks(symbol) {
    unsubscribeTicksInternal(symbol);
  }

  function getHistory(symbol, count) {
    if (!state.connected) {
      return Promise.reject(new Error("WebSocket not connected"));
    }
    return sendRequest({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: count || 100,
      end: "latest",
      start: 1,
      style: "ticks",
    }).then(function (msg) {
      var hist = msg.history;
      if (!hist || !hist.prices || !hist.times) return [];
      var out = [];
      for (var i = 0; i < hist.prices.length; i++) {
        out.push({ price: hist.prices[i], time: hist.times[i] * 1000 });
      }
      return out;
    });
  }

  /* ── Contract type maps ─────────────────────────────────────────
     Legacy API (ws.derivws.com)  → CALL/PUT for higher-lower.
     New Options API (api.derivws.com) → HIGHER/LOWER.             */
  var CONTRACT_TYPE_MAP_LEGACY = {
    "rise-fall":    { rise: "CALL",        fall: "PUT"        },
    "even-odd":     { even: "DIGITEVEN",   odd: "DIGITODD"    },
    "match-differ": { match: "DIGITMATCH", differ: "DIGITDIFF" },
    "over-under":   { over: "DIGITOVER",   under: "DIGITUNDER" },
    "higher-lower": { higher: "CALL",      lower: "PUT"        },
  };

  var CONTRACT_TYPE_MAP_NEW = {
    "rise-fall":    { rise: "CALL",        fall: "PUT"        },
    "even-odd":     { even: "DIGITEVEN",   odd: "DIGITODD"    },
    "match-differ": { match: "DIGITMATCH", differ: "DIGITDIFF" },
    "over-under":   { over: "DIGITOVER",   under: "DIGITUNDER" },
    "higher-lower": { higher: "HIGHER",    lower: "LOWER"      },
  };

  /* ── buyContract ─────────────────────────────────────────────── */
  /*
   * Two-step proposal → buy flow, works on both old (ws.derivws.com)
   * and new (api.derivws.com) APIs.
   *
   * RACE CONDITION FIX:
   *   For 1-tick contracts, Deriv streams proposal_open_contract with
   *   is_sold:true almost instantly — often before the buy response
   *   returns.  We now:
   *     1. Register the settle callback immediately after getting contractId.
   *     2. Drain any POC messages that arrived while the callback was absent.
   *     3. Subscribe explicitly to POC for the contractId (belt-and-suspenders).
   *
   * opts: { tradeType, selection, stake, duration, symbol, digit,
   *          currency, barrier? }
   * onSettle(result): called exactly once when the contract settles.
   */
  function buyContract(opts, onSettle) {
    if (!state.authorized) {
      return Promise.reject(new Error("Not authorized — please log in first"));
    }

    /* Both ws.derivws.com (old) and api.derivws.com (new) use the same
       "symbol" field name for the proposal endpoint.  The old code sent
       "underlying_symbol" for new-API accounts which the server rejects. */
    var isNewApi = !!(state.wsUrl && state.wsUrl.indexOf("api.derivws.com") !== -1);
    var typeMap = (isNewApi ? CONTRACT_TYPE_MAP_NEW : CONTRACT_TYPE_MAP_LEGACY)[opts.tradeType];
    if (!typeMap) return Promise.reject(new Error("Unknown trade type: " + opts.tradeType));

    var contractType = typeMap[opts.selection];
    if (!contractType) return Promise.reject(new Error("Unknown selection: " + opts.selection));

    /* Old API (ws.derivws.com)  → "symbol"
       New API (api.derivws.com) → "underlying_symbol"
       These are two different field names for the same concept; each server
       rejects the other's field name with InputValidationFailed. */
    var symbolField = isNewApi ? "underlying_symbol" : "symbol";
    var proposal = {
      proposal: 1,
      subscribe: 1,
      amount: opts.stake,
      basis: "stake",
      contract_type: contractType,
      currency: opts.currency || state.currency || "USD",
      duration: opts.duration || 5,
      duration_unit: "t",
    };
    proposal[symbolField] = opts.symbol || "1HZ100V";

    if (["DIGITMATCH", "DIGITDIFF", "DIGITOVER", "DIGITUNDER"].indexOf(contractType) !== -1) {
      proposal.barrier = String(opts.digit !== undefined ? opts.digit : 5);
    }

    if (opts.tradeType === "higher-lower" && opts.barrier !== undefined && opts.barrier !== null) {
      proposal.barrier = String(opts.barrier);
    }

    /* Step 1 — proposal */
    return sendRequest(proposal)
      .then(function (propMsg) {
        var prop = propMsg.proposal;
        if (!prop || !prop.id) throw new Error("No proposal returned from Deriv");

        /* Step 2 — buy */
        return sendRequest({ buy: prop.id, price: opts.stake });
      })
      .then(function (buyMsg) {
        var buyData = buyMsg.buy;
        if (!buyData) throw new Error("No buy data returned");

        var contractId = buyData.contract_id;

        if (onSettle && contractId) {
          /* ─ 1. Register callback FIRST, before anything else ─ */
          state.contractCbs[contractId] = function (poc) {
            if (poc.is_sold || poc.status === "sold") {
              var pl = parseFloat(poc.profit) || 0;
              onSettle({
                won: pl > 0,
                pl: pl,
                contractId: contractId,
                buyPrice: poc.buy_price,
                sellPrice: poc.sell_price,
                payout: poc.payout,
                entrySpot: poc.entry_spot,
                exitSpot: poc.exit_spot,
              });
            }
          };

          /* ─ 2. Drain any POC that arrived before we registered ─ */
          drainPocBuffer(contractId);

          /* ─ 3. Explicit POC subscription (belt-and-suspenders) ─
                  The proposal's implicit subscription may have been
                  cancelled by the buy; this guarantees we get the
                  settlement message.                                */
          if (state.contractCbs[contractId]) {
            /* Only subscribe if callback wasn't already consumed by drain */
            subscribeContractPOC(contractId);
          }
        }

        return { contractId: contractId, buyPrice: buyData.buy_price };
      });
  }

  /* ── Disconnect ─────────────────────────────────────────────── */
  function disconnect() {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectCount = MAX_RECONNECTS;
    if (state.ws) {
      try { state.ws.close(); } catch (e) {}
      state.ws = null;
    }
    state.connected = false;
    state.authorized = false;
  }

  function isAuthorized() { return state.authorized; }
  function getState()     { return state; }

  /* ── Expose globally ────────────────────────────────────────── */
  window.DerivWS = {
    connect: connect,
    disconnect: disconnect,
    subscribeTicks: subscribeTicks,
    unsubscribeTicks: unsubscribeTicks,
    getHistory: getHistory,
    buyContract: buyContract,
    isAuthorized: isAuthorized,
    getState: getState,
  };
})();
