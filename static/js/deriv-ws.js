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

  function rejectPendingRequests(message, connectionInterrupted) {
    Object.keys(state.pendingReqs).forEach(function (reqId) {
      var pending = state.pendingReqs[reqId];
      delete state.pendingReqs[reqId];
      var error = new Error(message);
      error.connectionInterrupted = !!connectionInterrupted;
      error.requestSent = !!pending.requestSent;
      pending.reject(error);
    });
  }

  function sendRequest(payload) {
    return new Promise(function (resolve, reject) {
      var id = nextReqId();
      payload.req_id = id;
      var timeoutId = setTimeout(function () {
        var pending = state.pendingReqs[id];
        delete state.pendingReqs[id];
        var error = new Error("Deriv request timed out");
        error.requestTimedOut = true;
        error.requestSent = !!(pending && pending.requestSent);
        reject(error);
      }, 15000);
      state.pendingReqs[id] = {
        requestSent: false,
        resolve: function (value) { clearTimeout(timeoutId); resolve(value); },
        reject: function (error) { clearTimeout(timeoutId); reject(error); },
      };
      try {
        if (send(payload)) {
          state.pendingReqs[id].requestSent = true;
          return;
        }
        delete state.pendingReqs[id];
        clearTimeout(timeoutId);
        var sendError = new Error("WebSocket not open");
        sendError.notSent = true;
        reject(sendError);
      } catch (error) {
        delete state.pendingReqs[id];
        clearTimeout(timeoutId);
        error.notSent = true;
        reject(error);
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
        var apiError = new Error(msg.error.message || "Deriv API error");
        apiError.apiRejected = true;
        cb.reject(apiError);
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
        afterAuthorize(acc);
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

  function isContractSettled(poc) {
    if (!poc) return false;
    var status = String(poc.status || "").toLowerCase();
    return poc.is_sold === true || poc.is_sold === 1 || poc.is_sold === "1" ||
      status === "won" || status === "lost" || status === "sold";
  }

  /* Dispatch a POC to the registered callback and clean up when settled */
  function _dispatchPOC(contractId, poc) {
    var fn = state.contractCbs[contractId];
    if (!fn) return;
    fn(poc);
    if (isContractSettled(poc)) {
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
    if (!state.authorized || !state.connected) return;
    var previousSubId = state.pocSubIds[contractId];
    if (previousSubId) {
      send({ forget: previousSubId });
      delete state.pocSubIds[contractId];
    }
    var id = nextReqId();
    /* The shared onMessage path dispatches the first POC response after this resolves. */
    state.pendingReqs[id] = {
      requestSent: false,
      resolve: function () {},
      reject: function () {},
    };
    try {
      if (send({ proposal_open_contract: 1, subscribe: 1, contract_id: contractId, req_id: id })) {
        state.pendingReqs[id].requestSent = true;
      } else {
        delete state.pendingReqs[id];
      }
    } catch (error) {
      delete state.pendingReqs[id];
      console.error("[DerivWS] Contract subscription failed:", error);
    }
  }

  function watchContract(contractId, onSettle) {
    if (!contractId || typeof onSettle !== "function") return null;
    var settled = false;
    state.contractCbs[contractId] = function (poc) {
      if (settled || !isContractSettled(poc)) return;
      settled = true;
      var profit = parseFloat(poc.profit) || 0;
      var status = String(poc.status || "").toLowerCase();
      onSettle({
        won: status === "won" || (status !== "lost" && profit > 0),
        pl: profit,
        contractId: String(contractId),
        buyPrice: poc.buy_price,
        sellPrice: poc.sell_price,
        payout: poc.payout,
        entrySpot: poc.entry_spot,
        exitSpot: poc.exit_spot,
      });
    };
    drainPocBuffer(contractId);
    if (state.contractCbs[contractId]) subscribeContractPOC(contractId);
    return function () {
      delete state.contractCbs[contractId];
      delete state.pocBuffer[contractId];
      var subId = state.pocSubIds[contractId];
      if (subId) {
        send({ forget: subId });
        delete state.pocSubIds[contractId];
      }
    };
  }

  function reconcileContract(options) {
    if (!state.authorized || !state.connected) {
      var disconnectedError = new Error("Deriv connection is unavailable for contract verification");
      disconnectedError.connectionInterrupted = true;
      disconnectedError.notSent = true;
      return Promise.reject(disconnectedError);
    }
    if (options && options.contractId) {
      return sendRequest({
        proposal_open_contract: 1,
        contract_id: options.contractId,
      }).then(function (response) {
        var contract = response.proposal_open_contract;
        if (!contract || String(contract.contract_id) !== String(options.contractId)) {
          throw new Error("Deriv returned no status for the active contract");
        }
        if (!isContractSettled(contract)) {
          return { status: "open", contractId: String(options.contractId) };
        }
        var profit = Number(contract.profit);
        if (!Number.isFinite(profit)) {
          return { status: "unconfirmed", contractId: String(options.contractId) };
        }
        var status = String(contract.status || "").toLowerCase();
        return {
          status: "settled",
          contractId: String(options.contractId),
          won: status === "won" || (status !== "lost" && profit > 0),
          pl: profit,
          buyPrice: Number(contract.buy_price),
          sellPrice: contract.sell_price,
          payout: contract.payout,
        };
      });
    }
    var submittedAt = Number(options && options.submittedAt);
    var expectedPrice = Number(options && options.buyPrice);
    if (!Number.isFinite(submittedAt) || !Number.isFinite(expectedPrice) ||
        !options.symbol || !options.contractType || options.barrier === undefined) {
      return Promise.reject(new Error("Contract verification requires the submitted trade details"));
    }
    return Promise.all([
      sendRequest({ portfolio: 1 }),
      sendRequest({
        profit_table: 1,
        description: 1,
        date_from: Math.max(0, submittedAt - 2),
        limit: 500,
      }),
    ]).then(function (responses) {
      var portfolio = responses[0].portfolio;
      var profitTable = responses[1].profit_table;
      if (!portfolio || !Array.isArray(portfolio.contracts) ||
          !profitTable || !Array.isArray(profitTable.transactions)) {
        throw new Error("Deriv returned incomplete contract verification data");
      }
      var openContracts = portfolio.contracts;
      var closedContracts = profitTable.transactions;
      var possibleContracts = {};
      openContracts.concat(closedContracts).forEach(function (contract) {
        if (!contract || !contract.contract_id || contract.contract_type !== options.contractType) return;
        var price = Number(contract.buy_price);
        if (!Number.isFinite(price) || Math.abs(price - expectedPrice) > 0.01) return;
        var purchaseTime = Number(contract.purchase_time || contract.transaction_time);
        if (!Number.isFinite(purchaseTime) || purchaseTime < submittedAt - 2 ||
            purchaseTime > Math.floor(Date.now() / 1000) + 2) return;
        var underlying = contract.underlying || contract.symbol;
        var exactMatch = underlying === options.symbol &&
          String(contract.barrier) === String(options.barrier);
        var contractId = String(contract.contract_id);
        if (!possibleContracts[contractId] || exactMatch) {
          possibleContracts[contractId] = { contract: contract, exactMatch: exactMatch };
        }
      });
      var contractIds = Object.keys(possibleContracts);
      if (contractIds.length !== 1) {
        return { status: contractIds.length ? "ambiguous" : "not_found" };
      }
      var candidate = possibleContracts[contractIds[0]];
      if (!candidate.exactMatch) return { status: "inconclusive" };
      var contract = candidate.contract;
      var contractId = contractIds[0];
      var isOpenContract = openContracts.some(function (entry) {
        return String(entry.contract_id) === contractId;
      });
      if (isOpenContract) return { status: "open", contractId: contractId };
      var isInProfitTable = closedContracts.some(function (entry) {
        return String(entry.contract_id) === contractId;
      });
      var profit = Number(contract.profit);
      if ((!isInProfitTable && !isContractSettled(contract)) || !Number.isFinite(profit)) {
        return { status: "unconfirmed", contractId: contractId };
      }
      return {
        status: "settled",
        contractId: contractId,
        won: String(contract.status || "").toLowerCase() === "won" ||
          (String(contract.status || "").toLowerCase() !== "lost" && profit > 0),
        pl: profit,
        buyPrice: Number(contract.buy_price),
        sellPrice: contract.sell_price,
        payout: contract.payout,
      };
    });
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
    Object.keys(state.contractCbs).forEach(function (contractId) {
      subscribeContractPOC(contractId);
    });
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

  /* ── Connect using authenticated OTP URL or public market data ─ */
  function connect(appId, token, accountId, onBalance, wsUrl, currency) {
    state.appId = appId;
    state.token = token || null;
    state.accountId = accountId || null;
    state.balanceCb = onBalance || null;
    state.wsUrl = wsUrl || null;
    state.currency = currency || state.currency || null;

    if (state.ws) {
      var previousSocket = state.ws;
      state.ws = null;
      try { previousSocket.close(); } catch (e) {}
    }

     /* Public chart/tick streaming uses the same Options endpoint as the
       React chart. Authenticated accounts continue using their OTP URL. */
     var url = wsUrl || window.DERIV_PUBLIC_WS_URL || WS_URL + appId;
    var ws = new WebSocket(url);
    state.ws = ws;
    state.connected = false;
    state.authorized = false;

    ws.onopen = function () {
      if (ws !== state.ws) return;
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
      }
    };

    ws.onmessage = function (event) {
      if (ws === state.ws) onMessage(event);
    };
    ws.onerror = function () {
      if (ws === state.ws) {
        try { ws.close(); } catch (error) {
          console.error("[DerivWS] Failed to close errored socket:", error);
          ws.onclose();
        }
      }
    };
    ws.onclose = function () {
      if (ws !== state.ws) return;
      state.connected = false;
      state.authorized = false;
      rejectPendingRequests("WebSocket disconnected while request was pending", true);
      state.tickSubIds = {};
      state.tickSubPending = {};
      state.pocSubIds = {};
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (state.reconnectCount >= MAX_RECONNECTS) return;
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(function () {
      state.reconnectTimer = null;
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
  * Proposal → buy flow, with an optional one-request direct-buy mode.
   *
   * RACE CONDITION FIX:
   *   For 1-tick contracts, Deriv streams proposal_open_contract with
   *   a terminal status almost instantly — sometimes before the buy response
   *   returns and sometimes without is_sold:true. We now:
   *     1. Register the settle callback immediately after getting contractId.
   *     2. Drain any POC messages that arrived while the callback was absent.
   *     3. Subscribe explicitly to POC for the contractId (belt-and-suspenders).
   *
   * opts: { tradeType, selection, stake, duration, symbol, digit,
   *          currency, barrier? }
   * onSettle(result): called exactly once when the contract settles.
   */
  function getContractProposal(opts) {
    if (!state.authorized) {
      return Promise.reject(new Error("Not authorized — please log in first"));
    }
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

    return sendRequest(proposal)
      .then(function (propMsg) {
        var prop = propMsg.proposal;
        if (!prop || !prop.id) throw new Error("No proposal returned from Deriv");
        var askPrice = Number(prop.ask_price);
        var payout = Number(prop.payout);
        if (!Number.isFinite(askPrice) || askPrice <= 0 ||
            !Number.isFinite(payout) || payout < 0) {
          throw new Error("Broker proposal did not include valid price and payout values");
        }
        return {
          id: prop.id,
          amount: Number(opts.stake),
          payout: payout,
          ask_price: askPrice,
          potentialProfit: payout - askPrice,
          profitRate: (payout - askPrice) / askPrice,
          contract_type: prop.contract_type || contractType,
          symbol: prop.symbol || prop.underlying || opts.symbol,
          barrier: prop.barrier !== undefined ? prop.barrier : String(opts.digit),
          duration: opts.duration || 5,
          currency: prop.currency || opts.currency || state.currency || "USD",
        };
      })
  }

  function buyFromContractProposal(opts, proposalDetails, onSettle) {
    if (!state.authorized) {
      return Promise.reject(new Error("Not authorized — please log in first"));
    }
    if (!proposalDetails || !proposalDetails.id || !Number.isFinite(Number(proposalDetails.ask_price))) {
      return Promise.reject(new Error("A valid broker proposal is required before purchase"));
    }
    if (typeof opts.activationCheck === "function" && !opts.activationCheck()) {
      var activationError = new Error("Bot activation expired before purchase submission");
      activationError.notSent = true;
      return Promise.reject(activationError);
    }
    return Promise.resolve(
      typeof opts.onProposal === "function" ? opts.onProposal(proposalDetails) : null
    ).then(function () {
      if (typeof opts.activationCheck === "function" && !opts.activationCheck()) {
        var activationExpired = new Error("Bot activation expired before purchase submission");
        activationExpired.notSent = true;
        throw activationExpired;
      }
      return sendRequest({ buy: proposalDetails.id, price: Number(proposalDetails.ask_price) });
    }).then(function (buyMsg) {
        var buyData = buyMsg.buy;
        if (!buyData) throw new Error("No buy data returned");

        var contractId = buyData.contract_id;

        if (onSettle && contractId) {
          watchContract(contractId, onSettle);
        }

        return {
          contractId: contractId,
          buyPrice: buyData.buy_price,
          proposal: proposalDetails,
          buy: buyData,
        };
      });
  }

  function getProposal(opts) {
    return getContractProposal(opts);
  }

  function buyContractFromProposal(opts, proposalDetails, onSettle) {
    return buyFromContractProposal(opts, proposalDetails, onSettle);
  }

  function buyContract(opts, onSettle) {
    return getContractProposal(opts).then(function (proposalDetails) {
      return buyFromContractProposal(opts, proposalDetails, onSettle);
    });
  }

  /* ── Disconnect ─────────────────────────────────────────────── */
  function disconnect() {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    state.reconnectCount = MAX_RECONNECTS;
    if (state.ws) {
      var socket = state.ws;
      state.ws = null;
      try { socket.close(); } catch (e) {}
    }
    state.connected = false;
    state.authorized = false;
    rejectPendingRequests("Deriv connection was closed", true);
    state.tickSubIds = {};
    state.tickSubPending = {};
    state.pocSubIds = {};
  }

  function requestBalance() {
    if (!state.authorized) return Promise.reject(new Error("Not authorized"));
    return sendRequest({ balance: 1 }).then(function (msg) {
      if (!msg.balance || msg.balance.balance === undefined) {
        throw new Error("Deriv did not return an account balance");
      }
      return msg.balance;
    });
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
    getProposal: getProposal,
    buyContractFromProposal: buyContractFromProposal,
    buyContract: buyContract,
    watchContract: watchContract,
    reconcileContract: reconcileContract,
    requestBalance: requestBalance,
    isAuthorized: isAuthorized,
    getState: getState,
  };
})();
