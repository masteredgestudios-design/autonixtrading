/*
  Autonix AI Trader — Digit-frequency strategy.
  Default symbol: Volatility 25 (1s) Index.
  Trade types: Over 1 and Under 8 only.
  Money management: risk amount -> automatic stake -> dynamic profit growth.
  Recovery: loss ÷ payout rate, no fixed recovery amounts.
*/
(function () {
  "use strict";

  if (!document.getElementById("ai-trader-section")) return;

  var ai = {
    running: false,
    state: null,
    symbol: "1HZ25V",
    tickBuffer: [],
    tickSubscription: null,
    tickSubscriptionSymbol: null,
    tradeTimer: null,
    lastTradeId: 0,
    analysis: null,
    logEntries: []
  };

  var AI_SYMBOL_LABELS = {
    "1HZ10V": "Volatility 10 (1s)",
    "1HZ25V": "Volatility 25 (1s)",
    "1HZ50V": "Volatility 50 (1s)",
    "1HZ75V": "Volatility 75 (1s)",
    "1HZ100V": "Volatility 100 (1s)",
    R_10: "Volatility 10",
    R_25: "Volatility 25",
    R_50: "Volatility 50",
    R_75: "Volatility 75",
    R_100: "Volatility 100"
  };

  var DEFAULT_PAYOUT_RATE = 0.1876;
  var RISK_MULTIPLIER = 1 + (1 / DEFAULT_PAYOUT_RATE);
  var MIN_STAKE = 0.35;

  function $id(id) { return document.getElementById(id); }
  function fmtMoney(n) {
    var value = Number(n || 0);
    return window.AutonixCurrency ? window.AutonixCurrency.format(value) : "$" + value.toFixed(2);
  }
  function fmtSignedMoney(n) {
    var value = Number(n || 0);
    return (value >= 0 ? "+" : "-") + fmtMoney(Math.abs(value));
  }
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
  function lastDigit(price) {
    var numeric = Number(price);
    if (!isFinite(numeric)) return 0;
    var text = numeric.toFixed(2);
    return parseInt(text.charAt(text.length - 1), 10);
  }
  function esc(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }
  function getPayoutRate(value) {
    var payout = Number(value !== undefined && value !== null ? value : DEFAULT_PAYOUT_RATE);
    return isFinite(payout) && payout > 0 ? payout : DEFAULT_PAYOUT_RATE;
  }
  function calculateStake(riskAmount, payoutRate) {
    var risk = Number(riskAmount || 0);
    var payout = getPayoutRate(payoutRate);
    if (!isFinite(risk) || risk <= 0) return 0;
    if (payout <= 0) return 0;
    var stake = risk / (1 + (1 / payout));
    return Number(stake.toFixed(2));
  }
  function calculateProfit(stake, payoutRate) {
    var amount = Number(stake || 0);
    var payout = getPayoutRate(payoutRate);
    return Number((amount * payout).toFixed(2));
  }
  function calculateRecoveryStake(loss, payoutRate) {
    var amount = Number(loss || 0);
    var payout = getPayoutRate(payoutRate);
    if (!isFinite(amount) || amount <= 0) return 0;
    return Number((amount / payout).toFixed(2));
  }
  function formatContractLabel(selection) {
    return selection === "over" ? "OVER 1" : selection === "under" ? "UNDER 8" : "—";
  }
  function setButtons() {
    var startBtn = $id("ai-start-btn");
    var stopBtn = $id("ai-stop-btn");
    var strategyInput = $id("ai-strategy");
    var riskInput = $id("ai-risk-amount");
    var stakeInput = $id("ai-stake-amount");
    var takeProfitInput = $id("ai-take-profit");
    var symbolInput = $id("ai-symbol");
    var locked = !!ai.running;
    if (startBtn) startBtn.disabled = locked;
    if (stopBtn) stopBtn.style.display = ai.running ? "" : "none";
    if (strategyInput) strategyInput.disabled = locked;
    if (riskInput) riskInput.disabled = locked;
    if (stakeInput) stakeInput.disabled = locked;
    if (takeProfitInput) takeProfitInput.disabled = locked;
    if (symbolInput) symbolInput.disabled = locked;
  }
  function appendLog(type, message) {
    ai.logEntries.push({ type: type, message: message, time: new Date().toLocaleTimeString() });
    renderLog();
  }
  function renderLog() {
    var wrap = $id("ai-log-list");
    if (!wrap) return;
    wrap.innerHTML = ai.logEntries.map(function (entry) {
      var badge = entry.type === "win" ? "win" : entry.type === "loss" ? "loss" : entry.type === "warning" ? "warn" : "info";
      return "<li class='ai-log-item ai-log-" + badge + "'><span class='ai-log-time'>" + esc(entry.time) + "</span><span class='ai-log-text'>" + esc(entry.message) + "</span></li>";
    }).join("");
    wrap.scrollTop = wrap.scrollHeight;
  }
  function notify(message, kind, duration) {
    if (window.showToast && typeof window.showToast === "function") {
      window.showToast(message, kind, duration || 3000);
    }
  }
  function updateGlobalSummary() {
    if (window.AutonixSuite && window.AutonixSuite.update && ai.state) {
      window.AutonixSuite.update("aiTrader", ai.running, ai.state.accumulatedProfit);
    }
  }
  function setLiveStatus(message, keepState) {
    var text = message || "Analyzing market...";
    if (ai.state && keepState) {
      ai.state.liveStatus = text;
    }
    var statusText = $id("ai-status-text");
    if (statusText) {
      statusText.textContent = text;
    }
    updateStatusPill();
  }
  function renderAnalysis(context) {
    var panel = $id("ai-analysis-summary");
    if (!panel) return;
    var ticks = ai.tickBuffer || [];
    var latest = ticks.length ? lastDigit(ticks[ticks.length - 1].price) : "-";
    var symbol = getSymbolLabel(ai.state ? ai.state.symbol : ai.symbol);
    var reason = context && context.reason ? context.reason : "Waiting for market data.";
    var direction = context && context.selection ? formatContractLabel(context.selection) : "NO SIGNAL";
    var active = !!(context && context.selection);
    panel.innerHTML = [
      "<div class='ai-analysis-header'><span>Live Analysis</span><strong>" + esc(symbol) + "</strong></div>",
      "<div class='ai-analysis-grid'>",
      "<div class='ai-analysis-item'><span>Latest Digit</span><strong>" + latest + "</strong></div>",
      "<div class='ai-analysis-item'><span>Ticks Checked</span><strong>" + ticks.length + " / 100</strong></div>",
      "<div class='ai-analysis-item'><span>Direction</span><strong class='" + (active ? "active" : "") + "'>" + direction + "</strong></div>",
      "</div>",
      "<div class='ai-analysis-reason'><span class='bot-signal-label'>Check</span><strong>" + esc(reason) + "</strong></div>"
    ].join("");
  }
  function getSelectedStrategy() {
    var strategyInput = $id("ai-strategy");
    var value = strategyInput ? strategyInput.value : "risk-recovery";
    return value === "stake-stop-loss" ? "stake-stop-loss" : "risk-recovery";
  }
  function getSelectedSymbol() {
    var symbolInput = $id("ai-symbol");
    var value = symbolInput ? symbolInput.value : ai.symbol;
    return AI_SYMBOL_LABELS[value] ? value : ai.symbol;
  }
  function getSymbolLabel(symbol) {
    return AI_SYMBOL_LABELS[symbol] || symbol;
  }
  function refreshStrategyFields() {
    var strategy = getSelectedStrategy();
    var riskField = $id("ai-risk-field");
    var stakeField = $id("ai-stake-field");
    if (riskField) riskField.style.display = strategy === "risk-recovery" ? "" : "none";
    if (stakeField) stakeField.style.display = strategy === "stake-stop-loss" ? "" : "none";
  }
  function updateSummary() {
    var summary = $id("ai-summary");
    var stats = $id("ai-stats");
    if (!summary || !stats) return;
    if (!ai.state) {
      summary.innerHTML = "<div class='ai-empty-state'>Set risk and profit targets, then start the AI to begin managing a session.</div>";
      stats.innerHTML = "";
      return;
    }

    var profitLeft = Math.max(0, ai.state.takeProfit - ai.state.accumulatedProfit);
    var strategyLabel = ai.state.strategy === "stake-stop-loss" ? "Stake" : "Risk";
    var strategyValue = ai.state.strategy === "stake-stop-loss" ? fmtMoney(ai.state.currentStake || 0) : fmtMoney(ai.state.currentRiskAmount);
    summary.innerHTML = [
      "<div class='ai-summary-grid'>",
      "<div class='ai-pill'><span>Symbol</span><strong>" + esc(getSymbolLabel(ai.state.symbol)) + "</strong></div>",
      "<div class='ai-pill'><span>Strategy</span><strong>" + (ai.state.strategy === "stake-stop-loss" ? "Stake & Stop on Loss" : "Risk & Recovery") + "</strong></div>",
      "<div class='ai-pill'><span>" + strategyLabel + "</span><strong>" + strategyValue + "</strong></div>",
      "<div class='ai-pill'><span>Stake</span><strong>" + fmtMoney(ai.state.currentStake || 0) + "</strong></div>",
      "<div class='ai-pill'><span>Profit</span><strong>" + fmtSignedMoney(ai.state.accumulatedProfit) + "</strong></div>",
      "<div class='ai-pill'><span>Take Profit</span><strong>" + fmtMoney(ai.state.takeProfit) + "</strong></div>",
      "<div class='ai-pill'><span>Target Left</span><strong>" + fmtMoney(profitLeft) + "</strong></div>",
      "</div>"
    ].join("");

    stats.innerHTML = [
      "<div class='ai-stat-card'><span>Status</span><strong>" + (ai.state.liveStatus || (ai.running ? "Analyzing market..." : "Idle")) + "</strong></div>",
      "<div class='ai-stat-card'><span>Trades</span><strong>" + ai.state.tradeCount + "</strong></div>",
      "<div class='ai-stat-card'><span>Wins</span><strong>" + ai.state.wins + "</strong></div>",
      "<div class='ai-stat-card'><span>Losses</span><strong>" + ai.state.losses + "</strong></div>",
      "<div class='ai-stat-card'><span>Recovery</span><strong>" + fmtMoney(ai.state.pendingRecovery || 0) + "</strong></div>",
      "<div class='ai-stat-card'><span>Risk Limit</span><strong>" + fmtMoney(ai.state.maxLossLimit || 0) + "</strong></div>"
    ].join("");

    var status = $id("ai-status-text");
    if (status) {
      status.textContent = ai.state.liveStatus || (!ai.running ? "Idle" : ai.state.accumulatedProfit >= ai.state.takeProfit ? "Take Profit reached" : "Analyzing market...");
    }
    updateStatusPill();
  }
  function updateStatusPill() {
    var pill = $id("ai-status-pill");
    if (!pill) return;
    var label = "Idle";
    var className = "bulk-status-idle";
    if (ai.state && ai.running) {
      if (ai.state.accumulatedProfit >= ai.state.takeProfit) {
        label = "Target reached";
        className = "bulk-status-complete";
      } else if (ai.state.pendingRecovery > 0) {
        label = "Recovery active";
        className = "bulk-status-recovery";
      } else {
        label = "Running";
        className = "bulk-status-running";
      }
    }
    pill.className = "bulk-status-pill ai-status-pill " + className;
    pill.textContent = label;
  }
  function makeTransitionMatrix() {
    var matrix = new Array(100);
    for (var i = 0; i < matrix.length; i++) matrix[i] = 0;
    return matrix;
  }
  function makeBigramMatrix() {
    var matrix = new Array(1000);
    for (var i = 0; i < matrix.length; i++) matrix[i] = 0;
    return matrix;
  }
  function updateTransitionState(tm, ticks, start) {
    var latest = ticks[ticks.length - 1];
    var latestKey = latest ? String(latest.time || "") + "|" + String(latest.price) : "";
    if (!latestKey || latestKey === tm.lastTickKey) return;
    var first = tm.processedLength >= ticks.length ? Math.max(1, ticks.length - 1) : start;
    for (var i = first; i < ticks.length; i++) {
      if (i < 1) continue;
      var from = lastDigit(ticks[i - 1].price);
      var to = lastDigit(ticks[i].price);
      tm.matrix[from * 10 + to] += 1;
      if (i >= 2) {
        var previous = lastDigit(ticks[i - 2].price);
        tm.bigram[previous * 100 + from * 10 + to] += 1;
      }
      tm.ring[tm.ringPos] = { from: from, to: to };
      tm.ringPos = (tm.ringPos + 1) % 300;
      if (tm.ringFill < 300) tm.ringFill += 1;
    }
    tm.processedLength = ticks.length;
    tm.lastTickKey = latestKey;
  }
  function initializeTransitionState(ticks) {
    var tm = {
      matrix: makeTransitionMatrix(),
      bigram: makeBigramMatrix(),
      ring: new Array(300),
      ringPos: 0,
      ringFill: 0,
      processedLength: 0,
      confirmation: { direction: null, count: 0, tickKey: null }
    };
    updateTransitionState(tm, ticks, 0);
    return tm;
  }
  function weightedTransitionProbabilities(tm, fromDigit) {
    var recent = new Array(10).fill(0);
    var middle = new Array(10).fill(0);
    var ringTotal = new Array(10).fill(0);
    var position = (tm.ringPos + 299) % 300;
    for (var i = 0; i < tm.ringFill; i++) {
      var entry = tm.ring[(position - i + 300) % 300];
      if (!entry || entry.from !== fromDigit) continue;
      if (i < 100) recent[entry.to] += 1;
      else middle[entry.to] += 1;
      ringTotal[entry.to] += 1;
    }
    var weighted = new Array(10);
    var total = 0;
    for (var digit = 0; digit <= 9; digit++) {
      var older = Math.max(0, tm.matrix[fromDigit * 10 + digit] - ringTotal[digit]);
      weighted[digit] = recent[digit] * 0.7 + middle[digit] * 0.2 + older * 0.1;
      total += weighted[digit];
    }
    if (!total) return null;
    return weighted.map(function (value) { return value / total; });
  }
  function getMarketContext() {
    var ticks = ai.tickBuffer || [];
    if (ticks.length < 100) return { selection: null, reason: "Collecting tick data (" + ticks.length + "/100)..." };
    if (!ai.state._tm) ai.state._tm = initializeTransitionState(ticks);
    else updateTransitionState(ai.state._tm, ticks, ai.state._tm.processedLength);
    var tm = ai.state._tm;
    var current = lastDigit(ticks[ticks.length - 1].price);
    var previous = ticks.length > 1 ? lastDigit(ticks[ticks.length - 2].price) : -1;
    var rowTotal = 0;
    for (var digit = 0; digit <= 9; digit++) rowTotal += tm.matrix[current * 10 + digit];
    if (rowTotal < 8) return { selection: null, reason: "Building recent transition history..." };
    var oneStep = weightedTransitionProbabilities(tm, current);
    if (!oneStep || Math.max.apply(null, oneStep) < 0.12) return { selection: null, reason: "No clear transition signal." };
    var overRisk1 = oneStep[0] + oneStep[1];
    var underRisk1 = oneStep[8] + oneStep[9];
    var overRisk2 = overRisk1;
    var underRisk2 = underRisk1;
    var bigramTotal = 0;
    var bigramOffset = previous * 100 + current * 10;
    if (previous >= 0) {
      for (var next = 0; next <= 9; next++) bigramTotal += tm.bigram[bigramOffset + next];
    }
    var bigramAvailable = bigramTotal >= 10;
    if (bigramAvailable) {
      overRisk2 = (tm.bigram[bigramOffset] + tm.bigram[bigramOffset + 1]) / bigramTotal;
      underRisk2 = (tm.bigram[bigramOffset + 8] + tm.bigram[bigramOffset + 9]) / bigramTotal;
      if ((overRisk1 < underRisk1) !== (overRisk2 < underRisk2)) {
        tm.confirmation = { direction: null, count: 0 };
        return { selection: null, reason: "Transition models disagree." };
      }
    }
    var overRisk = bigramAvailable ? overRisk1 * 0.6 + overRisk2 * 0.4 : overRisk1;
    var underRisk = bigramAvailable ? underRisk1 * 0.6 + underRisk2 * 0.4 : underRisk1;
    var difference = Math.abs(overRisk - underRisk);
    if (difference < 0.04) return { selection: null, reason: "Comparing transition advantage..." };
    var direction = overRisk < underRisk ? "over" : "under";
    var latestTick = ticks[ticks.length - 1];
    var currentTickKey = String(latestTick.time || "") + "|" + String(latestTick.price);
    if (tm.confirmation.direction !== direction) {
      tm.confirmation = { direction: direction, count: 1, tickKey: currentTickKey };
    } else if (tm.confirmation.tickKey !== currentTickKey) {
      tm.confirmation.count += 1;
      tm.confirmation.tickKey = currentTickKey;
    }
    if (tm.confirmation.count < 2) return { selection: null, reason: formatContractLabel(direction) + " confirming (" + tm.confirmation.count + "/2 fresh ticks)" };
    return { selection: direction, reason: formatContractLabel(direction) + " transition edge " + (difference * 100).toFixed(1) + "%" };
  }
  function buildDecision(context) {
    context = context || getMarketContext();
    if (!context || !context.selection) {
      return null;
    }
    var state = ai.state;
    var payout = state.payoutRate;
    if (state.strategy === "stake-stop-loss") {
      var stake = Number((state.currentStake || 0).toFixed(2));
      if (!stake || stake <= 0) return null;
      return {
        type: "over-under",
        contractType: "over-under",
        selection: context.selection,
        digit: context.selection === "over" ? 1 : 8,
        stake: Number(stake.toFixed(2)),
        payout: payout,
        label: formatContractLabel(context.selection),
        reason: context.reason,
        lastDigitInfo: context,
        recovery: false,
        strategy: state.strategy
      };
    }

    var isRecovery = Number(state.pendingRecovery || 0) > 0;
    var stake = isRecovery ? calculateRecoveryStake(state.pendingRecovery, payout) : calculateStake(state.currentRiskAmount, payout);
    if (!stake || stake <= 0) return null;
    if (stake < MIN_STAKE) stake = MIN_STAKE;
    return {
      type: "over-under",
      contractType: "over-under",
      selection: context.selection,
      digit: context.selection === "over" ? 1 : 8,
      stake: Number(stake.toFixed(2)),
      payout: payout,
      label: formatContractLabel(context.selection),
      reason: context.reason,
      lastDigitInfo: context,
      recovery: isRecovery,
      strategy: state.strategy
    };
  }
  function updateStateFromSettlement(decision, result) {
    if (!ai.state) return;
    var state = ai.state;
    state.tradeInProgress = false;
    var pl = Number(result && result.pl ? result.pl : 0);
    var won = !!(result && result.won);
    state.tradeCount += 1;
    state.pendingRecovery = Math.max(0, state.pendingRecovery || 0);

    if (state.strategy === "stake-stop-loss") {
      if (won) {
        state.wins += 1;
        var profit = Math.max(0, pl);
        state.accumulatedProfit += profit;
        state.currentStake = Number((state.currentStake + profit).toFixed(2));
        setLiveStatus("Profit secured — updating stake...", true);
        appendLog("win", "Trade won\n" + fmtSignedMoney(profit) + " · Next stake " + fmtMoney(state.currentStake));
        notify("Winning trade — stake increased", "green", 2200);
      } else {
        state.losses += 1;
        var loss = Math.abs(pl) || decision.stake || state.currentStake || 0;
        state.accumulatedProfit -= loss;
        setLiveStatus("Loss detected — trading stopped", true);
        appendLog("loss", "Trade lost\nLoss: " + fmtMoney(loss) + " · Trading stopped");
        notify("Loss detected — strategy stopped", "warning", 2400);
        stopWithReason("Loss detected — trading stopped");
        return;
      }
    } else {
      if (!decision || !decision.recovery) {
        if (won) {
          state.wins += 1;
          var normalProfit = Math.max(0, pl);
          state.accumulatedProfit += normalProfit;
          state.currentRiskAmount = Number((state.currentRiskAmount + normalProfit).toFixed(2));
          state.pendingRecovery = 0;
          state.currentStake = calculateStake(state.currentRiskAmount, state.payoutRate);
          setLiveStatus("Profit secured — updating stake...", true);
          appendLog("win", "Trade won\n" + fmtSignedMoney(normalProfit) + " · Next stake " + fmtMoney(state.currentStake));
          notify("Winning trade — risk amount increased", "green", 2200);
        } else {
          state.losses += 1;
          var normalLoss = Math.abs(pl) || decision.stake || state.currentStake || 0;
          state.accumulatedProfit -= normalLoss;
          state.riskExposure = Number((state.riskExposure + normalLoss).toFixed(2));
          if (state.riskExposure >= state.maxLossLimit) {
            setLiveStatus("Risk limit reached — trading stopped", true);
            appendLog("loss", "Trade lost\nLoss: " + fmtMoney(normalLoss) + " · Risk limit reached");
            stopWithReason("Risk limit reached — trading stopped");
            return;
          }
          state.pendingRecovery = normalLoss;
          state.currentStake = calculateRecoveryStake(state.pendingRecovery, state.payoutRate);
          setLiveStatus("Recovery required — recalculating...", true);
          appendLog("loss", "Trade lost\nLoss: " + fmtMoney(normalLoss) + " · Recovery: " + fmtMoney(state.currentStake));
          notify("Loss detected — recovery stake calculated", "warning", 2400);
        }
      } else {
        if (won) {
          state.wins += 1;
          var recoveryProfit = Math.max(0, pl);
          state.accumulatedProfit += recoveryProfit;
          state.currentRiskAmount = Number((state.currentRiskAmount + recoveryProfit).toFixed(2));
          state.pendingRecovery = 0;
          state.currentStake = calculateStake(state.currentRiskAmount, state.payoutRate);
          setLiveStatus("Recovery completed — normal stake resumed", true);
          appendLog("win", "Recovery trade won\nRecovered loss · Next stake " + fmtMoney(state.currentStake));
          notify("Recovery trade won — session resumed", "green", 2200);
        } else {
          state.losses += 1;
          var recoveryLoss = Math.abs(pl) || decision.stake || state.currentStake || 0;
          state.accumulatedProfit -= recoveryLoss;
          state.riskExposure = Number((state.riskExposure + recoveryLoss).toFixed(2));
          if (state.riskExposure >= state.maxLossLimit) {
            setLiveStatus("Recovery limit reached — trading stopped", true);
            appendLog("loss", "Recovery trade lost\nOutstanding loss: " + fmtMoney(state.riskExposure) + " · Trading stopped");
            stopWithReason("Recovery limit reached — trading stopped");
            return;
          }
          state.pendingRecovery = Number((state.pendingRecovery + recoveryLoss).toFixed(2));
          state.currentStake = calculateRecoveryStake(state.pendingRecovery, state.payoutRate);
          setLiveStatus("Recovery failed — recalculating...", true);
          appendLog("loss", "Recovery trade lost\nOutstanding loss: " + fmtMoney(state.pendingRecovery) + " · Recovery stake " + fmtMoney(state.currentStake));
          notify("Recovery failed — new recovery required", "warning", 2400);
        }
      }
    }

    if (state.accumulatedProfit >= state.takeProfit) {
      setLiveStatus("Take Profit reached — trading stopped", true);
      appendLog("info", "Take Profit reached\nTrading stopped");
      stopWithReason("Take Profit reached — trading stopped");
      return;
    }

    setLiveStatus("Analyzing market...", true);
    updateSummary();
    updateGlobalSummary();
    scheduleNextTrade();
  }
  function executeTrade() {
    if (!ai.running || !ai.state) return;
    if (ai.state.tradeInProgress) return;
    if (!window.DerivWS || !window.DerivWS.buyContract || !window.DerivWS.isAuthorized()) {
      setLiveStatus("Analyzing market...", true);
      ai.tradeTimer = setTimeout(executeTrade, 500);
      return;
    }
    if (ai.state.accumulatedProfit >= ai.state.takeProfit) {
      setLiveStatus("Take Profit reached — trading stopped", true);
      stopWithReason("Take Profit reached — trading stopped");
      return;
    }

    var context = getMarketContext();
    ai.analysis = context;
    renderAnalysis(context);
    var decision = buildDecision(context);
    if (!decision) {
      setLiveStatus("Analyzing — " + (context.reason || "no signal yet; checking next tick"), true);
      scheduleNextTrade();
      return;
    }

    var latestTick = ai.tickBuffer[ai.tickBuffer.length - 1];
    var entryTickKey = latestTick ? String(latestTick.time || "") + "|" + String(latestTick.price) : "";
    if (entryTickKey && entryTickKey === ai.state.lastEntryTickKey) {
      setLiveStatus("Signal remains valid — waiting for a fresh tick", true);
      scheduleNextTrade();
      return;
    }
    ai.state.lastEntryTickKey = entryTickKey;

    ai.state.tradeInProgress = true;
    setLiveStatus("Calculating stake...", true);
    var minimumStake = Math.max(MIN_STAKE, 0.35);
    var effectiveStake = Number(decision.stake);
    if (effectiveStake < minimumStake) effectiveStake = minimumStake;
    decision.stake = effectiveStake;
    ai.state.currentStake = effectiveStake;

    var opts = {
      tradeType: decision.contractType,
      selection: decision.selection,
      stake: effectiveStake,
      duration: 1,
      symbol: ai.symbol,
      digit: decision.digit,
      currency: (window.SESSION_DATA && window.SESSION_DATA.activeAccount && window.SESSION_DATA.activeAccount.currency) || "USD"
    };

    setLiveStatus("Signal detected — " + decision.label, true);
    appendLog("info", "Trade submitted\n" + decision.label + " · Stake " + fmtMoney(effectiveStake));

    var buyRequest;
    try {
      buyRequest = window.DerivWS.buyContract(opts, function (result) {
        updateStateFromSettlement(decision, result);
      });
    } catch (error) {
      buyRequest = Promise.reject(error);
    }
    Promise.resolve(buyRequest)
      .then(function () {
        return undefined;
      })
      .catch(function (err) {
        ai.state.tradeInProgress = false;
        ai.state.submissionFailures = (ai.state.submissionFailures || 0) + 1;
        var message = err && err.message ? err.message : "Order was not accepted";
        setLiveStatus("Submission failed — retrying scan", true);
        appendLog("warning", "Trade was not submitted\n" + message + " · Market loss not recorded");
        notify("Trade submission failed — scanning will resume", "warning", 2400);
        scheduleNextTrade();
      });
  }
  function scheduleNextTrade() {
    if (!ai.running) return;
    clearTimeout(ai.tradeTimer);
    ai.tradeTimer = setTimeout(function () {
      executeTrade();
    }, 500);
  }
  function stopWithReason(reason) {
    var reachedTakeProfit = !!(ai.state && ai.state.accumulatedProfit >= ai.state.takeProfit && /Take Profit reached/i.test(reason || ""));
    ai.running = false;
    setButtons();
    if (reason) {
      setLiveStatus(reason, true);
    }
    updateSummary();
    updateGlobalSummary();
    if (reachedTakeProfit && window.showTPCelebration) {
      window.showTPCelebration(ai.state.accumulatedProfit);
    }
    clearTimeout(ai.tradeTimer);
    ai.tradeTimer = null;
  }
  function resetSession() {
    stopWithReason("AI session reset.");
    ai.logEntries = [];
    ai.tickBuffer = [];
    ai.analysis = null;
    ai.state = null;
    ai.lastTradeId = 0;
    updateSummary();
    renderAnalysis({ reason: "Waiting for market data." });
    if (window.AutonixSuite && window.AutonixSuite.update) {
      window.AutonixSuite.update("aiTrader", false, 0);
    }
    renderLog();
    var wrap = $id("ai-log-list");
    if (wrap) wrap.innerHTML = "<li class='ai-log-item ai-log-info'><span class='ai-log-time'>Reset</span><span class='ai-log-text'>The AI Trader has been reset to a fresh state.</span></li>";
    setButtons();
  }
  function attachEvents() {
    var startBtn = $id("ai-start-btn");
    if (startBtn) startBtn.addEventListener("click", startAiTrader);
    var stopBtn = $id("ai-stop-btn");
    if (stopBtn) stopBtn.addEventListener("click", function () {
      stopWithReason("AI trading session stopped manually.");
    });
    var resetBtn = $id("ai-reset-btn");
    if (resetBtn) resetBtn.addEventListener("click", resetSession);
    var symbolInput = $id("ai-symbol");
    if (symbolInput) symbolInput.addEventListener("change", function () {
      if (!ai.running) {
        ai.symbol = getSelectedSymbol();
        updateSummary();
      }
    });
  }
  function startAiTrader() {
    ai.symbol = getSelectedSymbol();
    var strategy = getSelectedStrategy();
    var takeProfit = parseFloat($id("ai-take-profit").value);
    if (!isFinite(takeProfit) || takeProfit <= 0) {
      appendLog("warning", "Enter a valid take-profit target before starting the AI.");
      return;
    }

    var riskInput = $id("ai-risk-amount");
    var stakeInput = $id("ai-stake-amount");
    var riskAmount = riskInput ? parseFloat(riskInput.value) : NaN;
    var startingStake = stakeInput ? parseFloat(stakeInput.value) : NaN;
    if (strategy === "risk-recovery") {
      if (!isFinite(riskAmount) || riskAmount <= 0) {
        appendLog("warning", "Enter a valid risk amount before starting the AI.");
        return;
      }
    } else {
      if (!isFinite(startingStake) || startingStake <= 0) {
        appendLog("warning", "Enter a valid starting stake before starting the AI.");
        return;
      }
    }

    ai.running = true;
    ai.state = {
      strategy: strategy,
      initialRiskAmount: riskAmount || 0,
      currentRiskAmount: riskAmount || 0,
      takeProfit: takeProfit,
      accumulatedProfit: 0,
      currentStake: strategy === "stake-stop-loss" ? startingStake : calculateStake(riskAmount, DEFAULT_PAYOUT_RATE),
      pendingRecovery: 0,
      payoutRate: DEFAULT_PAYOUT_RATE,
      maxLossLimit: strategy === "stake-stop-loss" ? null : riskAmount,
      riskExposure: 0,
      wins: 0,
      losses: 0,
      tradeCount: 0,
      startedAt: Date.now(),
      symbol: ai.symbol,
      liveStatus: "AI Trader Started",
      tradeInProgress: false,
      lastEntryTickKey: "",
      submissionFailures: 0
    };
    ai.state.currentStake = ai.state.pendingRecovery > 0 ? calculateRecoveryStake(ai.state.pendingRecovery, ai.state.payoutRate) : ai.state.currentStake;
    ai.tickBuffer = [];
    ai.analysis = null;
    ensureTickFeed();
    seedHistory();
    setButtons();
    ai.logEntries = [];
    appendLog("info", "AI Trader Started\n" + (strategy === "stake-stop-loss" ? "Strategy: Stake & Stop on Loss" : "Strategy: Risk & Recovery") + " · Take Profit: " + fmtMoney(takeProfit));
    updateGlobalSummary();
    appendLog("info", getSymbolLabel(ai.symbol));
    setLiveStatus("Analyzing market...", true);
    renderAnalysis({ reason: "Checking " + getSymbolLabel(ai.symbol) + " for a trade signal." });
    updateSummary();
    notify("AI Trader started", "green", 2200);

    if (!window.DerivWS || !window.DerivWS.isAuthorized()) {
      setLiveStatus("Analyzing market...", true);
      ai.tradeTimer = setTimeout(executeTrade, 500);
    } else {
      executeTrade();
    }
  }
  function ensureTickFeed() {
    if (!window.DerivWS || !window.DerivWS.subscribeTicks) return;
    if (ai.tickSubscription && ai.tickSubscriptionSymbol === ai.symbol) return;
    if (typeof ai.tickSubscription === "function") ai.tickSubscription();
    ai.tickSubscriptionSymbol = ai.symbol;
    ai.tickSubscription = window.DerivWS.subscribeTicks(ai.symbol, function (tick) {
      var price = parseFloat(tick && (tick.quote || tick.price));
      if (!isFinite(price)) return;
      ai.tickBuffer.push({ price: price, time: Date.now() });
      if (ai.tickBuffer.length > 500) ai.tickBuffer.shift();
      if (ai.running) {
        ai.analysis = getMarketContext();
        renderAnalysis(ai.analysis);
        updateSummary();
        if (ai.analysis.selection && ai.state && !ai.state.tradeInProgress) {
          clearTimeout(ai.tradeTimer);
          ai.tradeTimer = setTimeout(executeTrade, 0);
        }
      }
    });
  }
  function seedHistory() {
    if (!window.DerivWS || !window.DerivWS.getHistory) return;
    if (ai.tickBuffer.length >= 20) return;
    window.DerivWS.getHistory(ai.symbol, 300)
      .then(function (history) {
        if (history && history.length) {
          var merged = history.slice(-300);
          var knownTicks = {};
          merged.forEach(function (tick) {
            knownTicks[String(tick.time || "") + "|" + String(tick.price)] = true;
          });
          ai.tickBuffer.forEach(function (tick) {
            var key = String(tick.time || "") + "|" + String(tick.price);
            if (!knownTicks[key]) merged.push(tick);
          });
          ai.tickBuffer = merged.slice(-500);
          if (ai.state) ai.state._tm = null;
          if (ai.running) {
            ai.analysis = getMarketContext();
            renderAnalysis(ai.analysis);
          }
        }
      })
      .catch(function () {});
  }
  function initialize() {
    var wrap = $id("ai-log-list");
    var riskInput = $id("ai-risk-amount");
    var stakeInput = $id("ai-stake-amount");
    var profitInput = $id("ai-take-profit");
    var strategyInput = $id("ai-strategy");
    if (riskInput) riskInput.value = riskInput.value || "20";
    if (stakeInput) stakeInput.value = stakeInput.value || "3";
    if (profitInput) profitInput.value = profitInput.value || "5";
    if (strategyInput) {
      strategyInput.addEventListener("change", refreshStrategyFields);
    }
    refreshStrategyFields();
    if (wrap) wrap.innerHTML = "<li class='ai-log-item ai-log-info'><span class='ai-log-time'>Ready</span><span class='ai-log-text'>AI Trader is waiting for your inputs.</span></li>";
    ai.logEntries = [{ type: "info", message: "AI Trader is waiting for your inputs.", time: new Date().toLocaleTimeString() }];
    updateSummary();
    setButtons();
    attachEvents();
  }

  window.AutonixAITrader = {
    DEFAULT_PAYOUT_RATE: DEFAULT_PAYOUT_RATE,
    getPayoutRate: getPayoutRate,
    calculateStake: calculateStake,
    calculateProfit: calculateProfit,
    calculateRecoveryStake: calculateRecoveryStake,
    analyzeLastDigitFrequencies: function (ticks) {
      var normalized = Array.isArray(ticks) ? ticks : [];
      var digits = normalized.map(function (tick) {
        var price = parseFloat(tick && (tick.quote || tick.price));
        return isFinite(price) ? lastDigit(price) : null;
      }).filter(function (value) { return value !== null; });
      var low = 0;
      var high = 0;
      digits.forEach(function (digit) {
        if (digit >= 0 && digit <= 4) low += 1;
        if (digit >= 5 && digit <= 9) high += 1;
      });
      if (high > low) return { lowGroup: low, highGroup: high, selection: "over" };
      if (low > high) return { lowGroup: low, highGroup: high, selection: "under" };
      return { lowGroup: low, highGroup: high, selection: null };
    }
  };

  initialize();
})();
