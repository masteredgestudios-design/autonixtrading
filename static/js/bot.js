/* ═══════════════════════════════════════════════════════════
   Autonix Trader — Bot Control Panel + Automation Logic
   ═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ═══════════════════════════ STATE ═══════════════════════════ */
  var botState = {
    running: false,
    tradeType: "over-under",
    selection: "over",
    digit: 1,
    stake: 10,
    tp: 5,
    sl: 20,
    duration: 1,
    martingale: 2.2,
    currentStake: 10, // changes with martingale
    sessionPL: 0,
    sessionTrades: 0,
    sessionWins: 0,
    streak: 0, // positive = win streak, negative = loss streak
    bestTrade: 0,
    totalStaked: 0,
    interval: null,
    activePositions: [],
    tradeHistory: [],
  };

  /* ═══════════════════════════ CONFIG PER TYPE ═══════════════════════════ */
  var typeDefaults = {
    "rise-fall": { stake: 10, tp: 5, martingale: 2.2, digit: null },
    "even-odd": { stake: 10, tp: 5, martingale: 2.2, digit: null },
    "match-differ": { stake: 10, tp: 5, martingale: 12, digit: 0 },
    "over-under": { stake: 10, tp: 5, martingale: 4.5, digit: 1 },
  };

  var typeSelections = {
    "rise-fall": [
      { label: "Rise", cls: "green" },
      { label: "Fall", cls: "red" },
    ],
    "even-odd": [
      { label: "Even", cls: "neutral" },
      { label: "Odd", cls: "neutral" },
    ],
    "match-differ": [
      { label: "Match", cls: "green" },
      { label: "Differ", cls: "red" },
    ],
    "over-under": [
      { label: "Over", cls: "green" },
      { label: "Under", cls: "red" },
    ],
  };

  /* ═══════════════════════════ PERSISTENCE ═══════════════════════════ */
  function getCurrentAccountId() {
    var sd = window.SESSION_DATA;
    return sd && sd.activeAccount ? sd.activeAccount.account : null;
  }

  function getStorageKey() {
    return "autonix-trade-history";
  }

  function loadTradeHistory() {
    var key = getStorageKey();
    var stored = localStorage.getItem(key);
    if (stored) {
      try {
        botState.tradeHistory = JSON.parse(stored);
      } catch (e) {
        botState.tradeHistory = [];
      }
    } else {
      botState.tradeHistory = [];
    }
  }

  function saveTradeHistory() {
    var key = getStorageKey();
    localStorage.setItem(key, JSON.stringify(botState.tradeHistory));
  }

  /* ═══════════════════════════ DOM REFS ═══════════════════════════ */
  function $id(id) {
    return document.getElementById(id);
  }

  /* ═══════════════════════════ INIT ═══════════════════════════ */
  document.addEventListener("DOMContentLoaded", function () {
    loadTradeHistory();
    initTypeTabs();
    initDigitPicker();
    initStartStop();
    setTradeType(botState.tradeType);
    syncInputs();
    updateStartBtnAuthLabel();
  });

  function updateStartBtnAuthLabel() {
    var btn = $id("bot-start-btn");
    var label = $id("bot-start-label");
    if (!btn || !label) return;
    var sd = window.SESSION_DATA;
    if (!sd || !sd.isAuthenticated) {
      label.textContent = "LOG IN TO TRADE";
    }
  }

  /* ══ Trade type tabs (single source of truth — above the chart) ══ */
  function initTypeTabs() {
    var tabs = document.querySelectorAll(".trade-type-btn");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        if (botState.running) return; // don't change type while running
        setTradeType(tab.dataset.type);
      });
    });
  }

  function setTradeType(type) {
    if (!type || !typeDefaults[type]) return;
    botState.tradeType = type;
    var tabs = document.querySelectorAll(".trade-type-btn");
    tabs.forEach(function (t) {
      var on = t.dataset.type === type;
      t.classList.toggle("active", on);
      t.setAttribute("aria-pressed", on ? "true" : "false");
    });
    loadTypeConfig(type);
    /* Notify any listeners that the global trade type changed */
    document.dispatchEvent(
      new CustomEvent("tradeTypeChanged", { detail: { type: type } }),
    );
  }

  /* Public API for other modules to read / change the trade type */
  window.AutonixTradeType = {
    get: function () {
      return botState.tradeType;
    },
    set: setTradeType,
  };

  /* ══ Load config for type ══ */
  function loadTypeConfig(type) {
    var defaults = typeDefaults[type] || typeDefaults["rise-fall"];
    botState.martingale = defaults.martingale;

    // Set the default digit if specified
    if (defaults.digit !== null) {
      botState.digit = defaults.digit;
    }

    // Show/hide digit picker
    var digitGroup = $id("bot-digit-group");
    if (digitGroup) {
      digitGroup.style.display = defaults.digit !== null ? "" : "none";
    }

    // Update martingale input
    var mInput = $id("bot-martingale");
    if (mInput) mInput.value = defaults.martingale;

    // Render selection buttons
    renderSelectionBtns(type);
    
    if (defaults.digit !== null) {
      /* Update digit picker UI for other types with digit */
      var row = $id("bot-digit-row");
      if (row) {
        row.querySelectorAll(".bot-digit-btn").forEach(function (btn) {
          btn.classList.toggle("active", parseInt(btn.dataset.digit) === defaults.digit);
        });
      }
    }
  }

  /* ══ Render selection buttons ══ */
  function renderSelectionBtns(type) {
    var container = $id("bot-selection-segmented");
    if (!container) return;
    var options = typeSelections[type] || [];
    container.innerHTML = "";
    
    /* For match-differ, Differ is the default (idx 1) */
    var defaultIdx = type === "match-differ" ? 1 : 0;
    
    options.forEach(function (opt, idx) {
      var isDefault = idx === defaultIdx;
      var btn = document.createElement("button");
      btn.className = "bot-seg-btn" + (isDefault ? " active " + opt.cls : "");
      btn.dataset.sel = opt.label.toLowerCase();
      btn.dataset.cls = opt.cls;
      btn.textContent = opt.label;
      if (isDefault) botState.selection = opt.label.toLowerCase();
      btn.addEventListener("click", function () {
        container.querySelectorAll(".bot-seg-btn").forEach(function (b) {
          b.className = "bot-seg-btn";
        });
        btn.className = "bot-seg-btn active " + opt.cls;
        botState.selection = opt.label.toLowerCase();
      });
      container.appendChild(btn);
    });
  }

  /* ══ Digit picker ══ */
  function initDigitPicker() {
    var row = $id("bot-digit-row");
    if (!row) return;
    row.addEventListener("click", function (e) {
      var btn = e.target.closest(".bot-digit-btn");
      if (!btn) return;
      row.querySelectorAll(".bot-digit-btn").forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      botState.digit = parseInt(btn.dataset.digit);
    });
  }

  /* ══ Update digit for match-differ from chart frequency ══ */
  function updateMatchDifferDigit() {
    if (botState.tradeType !== "match-differ") return;
    
    /* Get the least frequent digit from the chart */
    var lowestDigit = window.getLowestFrequencyDigit ? window.getLowestFrequencyDigit() : 0;
    botState.digit = lowestDigit;
    
    /* Update the UI: highlight the corresponding digit button */
    var row = $id("bot-digit-row");
    if (!row) return;
    row.querySelectorAll(".bot-digit-btn").forEach(function (btn) {
      btn.classList.toggle("active", parseInt(btn.dataset.digit) === lowestDigit);
    });
  }

  /* ══ Sync inputs into state ══ */
  function syncInputs() {
    function get(id, fallback) {
      var el = $id(id);
      return el ? parseFloat(el.value) || fallback : fallback;
    }
    function listenInput(id, key) {
      var el = $id(id);
      if (!el) return;
      el.addEventListener("input", function () {
        botState[key] = parseFloat(el.value) || 0;
        if (key === "stake") botState.currentStake = botState.stake;
      });
    }
    botState.stake = get("bot-stake", 10);
    botState.tp = get("bot-tp", 5);
    botState.sl = get("bot-sl", 20);
    botState.duration = get("bot-duration", 1);
    botState.martingale = get("bot-martingale", 2.2);
    botState.currentStake = botState.stake;

    listenInput("bot-stake", "stake");
    listenInput("bot-tp", "tp");
    listenInput("bot-sl", "sl");
    listenInput("bot-duration", "duration");
    listenInput("bot-martingale", "martingale");
  }

  /* ══ Start / Stop ══ */
  function initStartStop() {
    var btn = $id("bot-start-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (botState.running) {
        stopBot("manual");
      } else {
        startBot();
      }
    });

    var resetBtn = $id("bot-reset-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        resetBot();
      });
    }
  }

  function startBot() {
    /* Require login for real trading */
    var sd = window.SESSION_DATA;
    var isLoggedIn = sd && sd.isAuthenticated;
    var isAuthorized = window.DerivWS && window.DerivWS.isAuthorized();

    if (!isLoggedIn) {
      window.showToast &&
        window.showToast("Please log in to start the bot.", "red", 3500);
      return;
    }
    if (!isAuthorized) {
      window.showToast &&
        window.showToast(
          "Connecting to Deriv — please wait a moment and try again.",
          "red",
          3500,
        );
      return;
    }

    botState.stake =
      parseFloat($id("bot-stake") && $id("bot-stake").value) || 10;
    botState.tp = parseFloat($id("bot-tp") && $id("bot-tp").value) || 5;
    botState.sl = parseFloat($id("bot-sl") && $id("bot-sl").value) || 20;
    botState.duration =
      parseInt($id("bot-duration") && $id("bot-duration").value) || 1;
    botState.martingale =
      parseFloat($id("bot-martingale") && $id("bot-martingale").value) || 2.2;

    botState.running = true;
    botState.currentStake = botState.stake;
    botState.awaitingSettle = false;
    setBotRunningUI(true);

    placeTrade();
  }

  function triggerTpCelebration() {
    if (window.showTPCelebration) {
      window.showTPCelebration(botState.sessionPL);
    }
  }

  function stopBot(reason) {
    botState.running = false;
    if (botState.interval) {
      clearInterval(botState.interval);
      botState.interval = null;
    }
    setBotRunningUI(false);
    var msgs = {
      tp: "Take Profit reached — bot stopped!",
      sl: "Stop Loss hit — bot stopped.",
      manual: "Bot stopped.",
    };
    window.showToast &&
      window.showToast(
        msgs[reason] || "Bot stopped.",
        reason === "tp" ? "green" : "red",
        3500,
      );
    /* TP celebration modal */
    if (reason === "tp") {
      triggerTpCelebration();
    }
    updateSessionStats();
  }

  function resetBot() {
    if (botState.running) {
      stopBot("manual");
    }
    // Clear bot state but preserve trade history
    botState.sessionPL = 0;
    botState.sessionTrades = 0;
    botState.sessionWins = 0;
    botState.streak = 0;
    botState.bestTrade = 0;
    botState.totalStaked = 0;
    botState.activePositions = [];
    botState.currentStake = botState.stake;
    botState.awaitingSettle = false;

    // Update UI
    updatePositionsPanel();
    updateSessionStats();
    updateReportsIfOpen();

    // Hide last trade
    var lastEl = $id("bot-last-trade");
    if (lastEl) lastEl.style.display = "none";

    window.showToast && window.showToast("Bot state reset!", "neutral", 2000);
  }

  function setBotRunningUI(running) {
    var btn = $id("bot-start-btn");
    var dot = $id("bot-status-dot");
    var label = $id("bot-start-label");
    var iconStart = btn && btn.querySelector(".btn-icon-start");
    var iconStop = btn && btn.querySelector(".btn-icon-stop");

    if (btn) {
      btn.classList.toggle("running", running);
    }
    if (dot) {
      dot.classList.toggle("running", running);
    }
    if (label) {
      label.textContent = running ? "STOP BOT" : "START BOT";
    }
    if (iconStart) iconStart.style.display = running ? "none" : "";
    if (iconStop) iconStop.style.display = running ? "" : "none";

    // Disable type tabs while running
    document.querySelectorAll(".chart-trade-type-btn").forEach(function (t) {
      t.style.opacity = running ? ".4" : "";
      t.style.pointerEvents = running ? "none" : "";
    });
  }

  /* ═══════════════════════════ TRADE LOGIC ═══════════════════════════ */
  function placeTrade() {
    var symbol = window._selectedAssetSymbol || "1HZ100V";
    var priceEl = document.getElementById("current-price");
    var entryPrice = priceEl
      ? parseFloat(priceEl.textContent.replace(/,/g, "")) || 0
      : 0;

    /* Resolve the friendly display name from the UI */
    var symbolNameEl = document.getElementById("selected-asset-name");
    var symbolDisplayName =
      (symbolNameEl && symbolNameEl.textContent.trim()) || symbol;

    var trade = {
      id: Date.now(),
      type: botState.tradeType,
      selection: botState.selection,
      digit: botState.digit,
      stake: botState.currentStake,
      entry: entryPrice,
      duration: botState.duration,
      symbol: symbol,
      symbolName: symbolDisplayName,
      startTime: Date.now(),
      status: "active",
      pl: 0,
    };

    botState.activePositions.push(trade);
    botState.totalStaked += trade.stake;
    updatePositionsPanel();

    var useRealWS = window.DerivWS && window.DerivWS.isAuthorized();

    if (useRealWS) {
      /* ── Real trade via Deriv WebSocket ── */
      var sd = window.SESSION_DATA;
      var currency =
        (sd && sd.activeAccount && sd.activeAccount.currency) || "USD";

      window.DerivWS.buyContract(
        {
          tradeType: botState.tradeType,
          selection: botState.selection,
          stake: botState.currentStake,
          duration: botState.duration,
          symbol: symbol,
          digit: botState.digit,
          currency: currency,
        },
        function (result) {
          /* Called when the contract settles */
          resolveTrade(trade.id, entryPrice, result);
        },
      ).catch(function (err) {
        var msg = err && err.message ? err.message : "Trade failed";
        window.showToast &&
          window.showToast("Trade error: " + msg, "red", 4000);
        /* Remove from active on error */
        var idx = botState.activePositions.findIndex(function (t) {
          return t.id === trade.id;
        });
        if (idx !== -1) botState.activePositions.splice(idx, 1);
        updatePositionsPanel();
      });
    } else {
      /* ── Simulation fallback (no WS / virtual test mode) ── */
      var resolveDelay = Math.max(1500, trade.duration * 1500);
      setTimeout(function () {
        resolveTrade(trade.id, entryPrice, null);
      }, resolveDelay);
    }
  }

  function resolveTrade(tradeId, entryPrice, realResult) {
    var idx = botState.activePositions.findIndex(function (t) {
      return t.id === tradeId;
    });
    if (idx === -1) return;
    var trade = botState.activePositions[idx];

    var priceEl = document.getElementById("current-price");
    var exitPrice = priceEl
      ? parseFloat(priceEl.textContent.replace(/,/g, "")) || trade.entry
      : trade.entry;

    var won, pl;
    if (realResult) {
      /* Real result from Deriv */
      won = realResult.won;
      pl = parseFloat(realResult.pl) || 0;
      if (realResult.exitSpot)
        exitPrice = parseFloat(realResult.exitSpot) || exitPrice;
      if (realResult.entrySpot && !trade.entry)
        trade.entry = parseFloat(realResult.entrySpot);
    } else {
      /* Simulated outcome */
      won = determineOutcome(trade, trade.entry, exitPrice);
      pl = won ? +(trade.stake * 0.955).toFixed(2) : -trade.stake;
    }

    trade.pl = pl;
    trade.exit = exitPrice;
    trade.status = won ? "won" : "lost";
    trade.resolvedTime = Date.now();

    // Update session
    botState.sessionPL += pl;
    botState.sessionTrades += 1;
    if (won) {
      botState.sessionWins++;
      botState.streak = Math.max(0, botState.streak) + 1;
      botState.currentStake = botState.stake; // reset stake
      if (pl > botState.bestTrade) botState.bestTrade = pl;
    } else {
      botState.streak = Math.min(0, botState.streak) - 1;
      botState.currentStake = +(
        botState.currentStake * botState.martingale
      ).toFixed(2);
      // cap stake at $5000
      if (botState.currentStake > 5000) botState.currentStake = 5000;
    }

    // Add to history
    botState.tradeHistory.unshift({
      type: formatType(trade.type),
      selection: trade.selection,
      entry: trade.entry.toFixed(2),
      exit: exitPrice.toFixed(2),
      stake: trade.stake.toFixed(2),
      pl: pl,
      time: new Date(trade.startTime).toLocaleTimeString(),
    });

    // Save to localStorage
    saveTradeHistory();

    // Show last trade
    var lastEl = $id("bot-last-trade");
    var lastRes = $id("bot-last-result");
    if (lastEl && lastRes) {
      lastEl.style.display = "";
      lastRes.className = "bot-last-result " + (won ? "win" : "loss");
      lastRes.textContent =
        (won ? "+" : "") +
        pl.toFixed(2) +
        " USD (" +
        (won ? "WIN" : "LOSS") +
        ")";
    }

    /* Toast notification for trade result */
    window.showToast &&
      window.showToast(
        (won ? "WIN +" : "LOSS -") + "$" + Math.abs(pl).toFixed(2) + " USD",
        won ? "green" : "red",
        2200,
      );

    updatePositionsPanel();
    updateSessionStats();
    updateReportsIfOpen();

    /* Notify chart / UI so winning trades can highlight the resolving digit */
    var resolvedDigit = Math.abs(Math.round(exitPrice * 100)) % 10;
    document.dispatchEvent(
      new CustomEvent("tradeResolved", {
        detail: {
          won: won,
          pl: pl,
          type: trade.type,
          selection: trade.selection,
          digit: resolvedDigit,
          exit: exitPrice,
          entry: trade.entry,
          symbol: trade.symbol,
        },
      }),
    );

    /* Keep settled position visible in panel for 3 seconds, then remove */
    setTimeout(function () {
      var stillIdx = botState.activePositions.findIndex(function (t) {
        return t.id === tradeId;
      });
      if (stillIdx !== -1) {
        botState.activePositions.splice(stillIdx, 1);
        updatePositionsPanel();
      }

      /* Auto-close positions panel if empty (desktop only) */
      if (window.isDesktop()) {
        var panel = document.getElementById("positions-panel");
        if (panel && botState.activePositions.length === 0) {
          panel.classList.remove("open");
        }
      }
    }, 3000);

    // Check TP / SL
    if (!botState.running) return;
    if (botState.sessionPL >= botState.tp) {
      stopBot("tp");
      return;
    }
    if (botState.sessionPL <= -botState.sl) {
      stopBot("sl");
      return;
    }

    // Chain next trade — small delay to avoid hammering the API
    setTimeout(function () {
      if (botState.running) placeTrade();
    }, 600);
  }

  /* ══ Outcome determination (simulated) ══ */
  function determineOutcome(trade, entry, exit) {
    var diff = exit - entry;
    var type = trade.type;
    var sel = trade.selection;
    var lastDigit = Math.abs(Math.round(exit * 100)) % 10;

    if (type === "rise-fall") {
      return sel === "rise" ? diff > 0 : diff < 0;
    }
    if (type === "even-odd") {
      var isEven = lastDigit % 2 === 0;
      return sel === "even" ? isEven : !isEven;
    }
    if (type === "match-differ") {
      var matches = lastDigit === trade.digit;
      return sel === "match" ? matches : !matches;
    }
    if (type === "over-under") {
      return sel === "over" ? lastDigit > trade.digit : lastDigit < trade.digit;
    }
    // fallback ~50%
    return Math.random() > 0.5;
  }

  function formatType(type) {
    var map = {
      "rise-fall": "Rise/Fall",
      "even-odd": "Even/Odd",
      "match-differ": "Match/Differ",
      "over-under": "Over/Under",
    };
    return map[type] || type;
  }

  /* ═══════════════════════════ POSITIONS PANEL ═══════════════════════════ */
  function updatePositionsPanel() {
    var container = $id("positions-container");
    var empty = $id("positions-empty");
    var footer = $id("positions-footer");
    var badge = $id("positions-badge");
    var count = botState.activePositions.length;

    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? "" : "none";
    }

    /* Auto-open positions panel when first trade goes live (desktop only) */
    var panel = document.getElementById("positions-panel");
    if (panel && window.isDesktop()) {
      if (count > 0 && !panel.classList.contains("open"))
        panel.classList.add("open");
      else if (count === 0 && panel.classList.contains("open")) {
        // Fade out after 2.5 seconds
        setTimeout(function () {
          if (botState.activePositions.length === 0) {
            panel.classList.remove("open");
          }
        }, 2500);
      }
    }

    if (!container) return;

    if (count === 0) {
      container.innerHTML = "";
      if (empty) empty.style.display = "";
      if (footer) footer.style.display = "none";
      return;
    }

    if (empty) empty.style.display = "none";
    if (footer) footer.style.display = "";

    // Get current price for live P&L
    var priceEl = document.getElementById("current-price");
    var cur = priceEl
      ? parseFloat(priceEl.textContent.replace(/,/g, ""))
      : null;

    /* Map raw symbol codes to human-readable names */
    var SYMBOL_NAMES = {
      "1HZ100V": "Volatility 100 (1s) Index",
      "1HZ10V": "Volatility 10 (1s) Index",
      "1HZ25V": "Volatility 25 (1s) Index",
      "1HZ50V": "Volatility 50 (1s) Index",
      "1HZ75V": "Volatility 75 (1s) Index",
      R_100: "Volatility 100 Index",
      R_10: "Volatility 10 Index",
      R_25: "Volatility 25 Index",
      R_50: "Volatility 50 Index",
      R_75: "Volatility 75 Index",
    };

    var html = "";
    var totalPL = 0;

    // Render positions in reverse order (newest first)
    var positions = botState.activePositions.slice().reverse();

    positions.forEach(function (t) {
      var isSettled = t.status === "won" || t.status === "lost";
      var isWon = t.status === "won";
      var statusText = isSettled ? (isWon ? "WON" : "LOST") : "Running...";
      var statusDot = isSettled ? "" : '<span class="status-dot"></span>';
      var statusClass = isSettled ? t.status : "running";

      // Calculate P&L
      var pl = t.pl;
      if (!isSettled && cur) {
        // For running trades, estimate live P&L
        if (t.type === "rise-fall") {
          var diff = cur - t.entry;
          pl = t.selection === "rise" ? diff * 0.01 : -diff * 0.01;
        } else {
          pl = (Math.random() - 0.5) * t.stake * 0.2;
        }
        pl = Math.max(-t.stake, Math.min(t.stake * 0.95, pl));
      }

      if (!isSettled) totalPL += pl;

      var plClass = pl >= 0 ? "profit" : "loss";
      var tradeTypeClass = t.selection;
      /* Show friendly name — prefer the name stored when trade was placed, else map from symbol */
      var displayName = t.symbolName || SYMBOL_NAMES[t.symbol] || t.symbol;

      html +=
        '<div class="position-item ' +
        (isSettled ? "settled " + t.status : "") +
        '">' +
        '<div class="position-item-header">' +
        '<div class="position-symbol-group">' +
        '<span class="position-symbol" title="' +
        t.symbol +
        '">' +
        displayName +
        "</span>" +
        '<span class="position-trade-type ' +
        tradeTypeClass +
        '">' +
        t.selection.toUpperCase() +
        "</span>" +
        "</div>" +
        '<span class="position-status-badge ' +
        statusClass +
        '">' +
        statusDot +
        statusText +
        "</span>" +
        "</div>" +
        '<div class="position-info-row">' +
        '<span class="position-info-label">Stake</span>' +
        '<span class="position-info-value">$' +
        t.stake.toFixed(2) +
        "</span>" +
        "</div>" +
        '<div class="position-pnl-display">' +
        '<span class="position-pnl-label">P/L</span>' +
        '<span class="position-pnl-amount ' +
        plClass +
        '">' +
        (pl >= 0 ? "+" : "") +
        pl.toFixed(2) +
        "</span>" +
        "</div>" +
        "</div>";
    });

    container.innerHTML = html;

    // Total P&L in footer
    var totalEl = $id("positions-total-pl");
    if (totalEl) {
      totalEl.textContent =
        (totalPL >= 0 ? "+" : "") + "$" + totalPL.toFixed(2);
      totalEl.className =
        "positions-total-pl " + (totalPL >= 0 ? "profit" : "loss");
    }
  }

  /* ═══════════════════════════ SESSION STATS ═══════════════════════════ */
  function updateSessionStats() {
    var pl = $id("bot-session-pl");
    var trds = $id("bot-session-trades");
    var wr = $id("bot-session-wr");
    var strk = $id("bot-session-streak");

    if (pl) {
      pl.textContent =
        (botState.sessionPL >= 0 ? "+" : "") +
        "$" +
        botState.sessionPL.toFixed(2);
      pl.className =
        "bot-stat-value " + (botState.sessionPL >= 0 ? "profit" : "loss");
    }
    if (trds) trds.textContent = botState.sessionTrades;
    if (wr) {
      var rate =
        botState.sessionTrades > 0
          ? ((botState.sessionWins / botState.sessionTrades) * 100).toFixed(1) +
            "%"
          : "—";
      wr.textContent = rate;
    }
    if (strk) {
      var s = botState.streak;
      strk.textContent =
        s === 0 ? "—" : s > 0 ? "+" + s + "W" : Math.abs(s) + "L";
      strk.className =
        "bot-stat-value " + (s > 0 ? "profit" : s < 0 ? "loss" : "");
    }
  }

  /* ═══════════════════════════ REPORTS ═══════════════════════════ */
  function updateReportsIfOpen() {
    var page = $id("reports-page");
    if (!page || page.style.display === "none") return;
    renderReports();
  }

  window.renderReports = function () {
    var history = botState.tradeHistory;
    var total = history.length;
    var wins = history.filter(function (t) {
      return t.pl > 0;
    }).length;
    var losses = total - wins;
    var totalPL = history.reduce(function (s, t) {
      return s + t.pl;
    }, 0);
    var totalSt = history.reduce(function (s, t) {
      return s + parseFloat(t.stake);
    }, 0);
    var best =
      total > 0
        ? Math.max.apply(
            null,
            history.map(function (t) {
              return t.pl;
            }),
          )
        : 0;
    var winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";

    function setText(id, val) {
      var el = $id(id);
      if (el) el.textContent = val;
    }

    setText(
      "rpt-total-pl",
      (totalPL >= 0 ? "+" : "") + "$" + totalPL.toFixed(2),
    );
    setText("rpt-win-rate", winRate + "%");
    setText("rpt-total-trades", total);
    setText("rpt-total-staked", "$" + totalSt.toFixed(2));
    setText("rpt-wins-losses", wins + " / " + losses);
    setText("rpt-best-trade", best > 0 ? "+$" + best.toFixed(2) : "$0.00");
    setText("rpt-count", total + " trade" + (total !== 1 ? "s" : ""));

    // Color total P&L
    var plEl = $id("rpt-total-pl");
    if (plEl)
      plEl.className = "reports-stat-value " + (totalPL >= 0 ? "green" : "red");

    // Table
    var tbody = $id("reports-tbody");
    if (!tbody) return;

    if (history.length === 0) {
      tbody.innerHTML =
        '<tr class="reports-empty-row"><td colspan="7">No trades yet — start the bot to begin trading</td></tr>';
      return;
    }

    var rows = history
      .slice(0, 200)
      .map(function (t) {
        var plClass = t.pl >= 0 ? "pl-profit" : "pl-loss";
        var plStr = (t.pl >= 0 ? "+" : "") + "$" + Math.abs(t.pl).toFixed(2);
        return (
          "<tr>" +
          '<td><span class="badge-type">' +
          escHtml(t.type) +
          "</span></td>" +
          "<td>" +
          escHtml(t.selection) +
          "</td>" +
          "<td>" +
          escHtml(t.entry) +
          "</td>" +
          "<td>" +
          escHtml(t.exit) +
          "</td>" +
          "<td>$" +
          escHtml(t.stake) +
          "</td>" +
          '<td class="' +
          plClass +
          '">' +
          plStr +
          "</td>" +
          "<td>" +
          escHtml(t.time) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    tbody.innerHTML = rows;
  };

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* Expose for positions live tick update */
  window._botUpdatePositions = updatePositionsPanel;
  window._botState = botState;

  // Tick positions panel live P&L every 1.5s
  setInterval(function () {
    if (botState.activePositions.length > 0) updatePositionsPanel();
  }, 1500);
})();
