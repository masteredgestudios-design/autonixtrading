/* ═══════════════════════════════════════════════════════════════════
   Autonix — Bulk Trader v4
   Continuous live-market scanner · Strategy selection (Differs /
   Over-Under / Both) · Dynamic signal switching · Sequential
   execution queue that reads the latest signal before each submission
   · States: Scanning → Signal Found → Executing → Monitoring →
   Signal Updated → Completed / Stopped.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  if (!document.getElementById("bulk-trader-section")) return;

  /* ─── State ─────────────────────────────────────────────────────── */
  var bt = {
    running:          false,
    symbol:           "1HZ100V",
    stake:            10,
    numTrades:        10,
    takeProfit:       5,
    strategyMode:     "both",   // "differs" | "overunder" | "both"

    trades:           [],       // array of trade objects (pushed as submitted)
    totalPL:          0,
    settledCount:     0,        // trades that reached a final state
    wins:             0,
    losses:           0,
    tradeIdCounter:   0,
    submittedCount:   0,        // contracts submitted so far

    executionActive:  false,    // true while the sequential queue is pumping

    analysisInterval: null,
    lastTickCount:    0,
    cycleCount:       0,

    currentSignal:    null,     // latest valid signal object (or null)
    prevSignalText:   null,     // signal text from the previous cycle (change detection)

    localBuf:         [],       // Bulk Trader's own tick buffer (owned subscription)
    tickUnsub:        null,     // cleanup handle for the live tick subscription
  };

  /* ─── DOM helpers ────────────────────────────────────────────────── */
  function $id(id)  { return document.getElementById(id); }
  function fmtPL(n) { return (n >= 0 ? "+" : "") + "$" + Math.abs(n).toFixed(2); }
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ─── Digit helpers ──────────────────────────────────────────────── */
  function lastDigit(price) {
    var s = parseFloat(price).toFixed(2);
    return parseInt(s.charAt(s.length - 1), 10);
  }
  function countDigits(buf, range) {
    var slice  = buf.slice(-Math.min(buf.length, range));
    var counts = new Array(10).fill(0);
    for (var i = 0; i < slice.length; i++) {
      var p = slice[i] && slice[i].price;
      if (p !== undefined) counts[lastDigit(p)]++;
    }
    return counts;
  }
  function getBuf() {
    // Prefer the Bulk Trader's own subscribed buffer; fall back to AutonixCore's
    // shared buffer when our local one is still cold (< 10 ticks).
    if (bt.localBuf && bt.localBuf.length >= 10) return bt.localBuf;
    var core = window.AutonixCore;
    return (core && core.tickBuffers && core.tickBuffers[bt.symbol]) || bt.localBuf || [];
  }

  /* ════════════════════════════════════════════════════════════════
     ENGINE 1 — Differs  (mirrors Basic Bot logic exactly)
  ════════════════════════════════════════════════════════════════ */
  function analyzeDiffers(buf) {
    if (!buf || buf.length < 10) {
      return { signal: false, digit: -1,
        reason: "Need >=10 ticks (have " + (buf ? buf.length : 0) + ")" };
    }

    var prevDigit = lastDigit(buf[buf.length - 1].price);
    var last10    = buf.slice(-10);

    /* Guard 1 — excessive repetition */
    var prevCount = 0;
    for (var i = 0; i < last10.length; i++) {
      if (lastDigit(last10[i].price) === prevDigit) prevCount++;
    }
    if (prevCount >= 4) {
      return { signal: false, digit: -1,
        reason: "Digit " + prevDigit + " repeating excessively (" + prevCount + "/10)" };
    }

    /* Guard 2 — extreme clustering */
    var last15 = buf.slice(-Math.min(15, buf.length));
    var seen   = {};
    for (var i = 0; i < last15.length; i++) seen[lastDigit(last15[i].price)] = true;
    var distinct = Object.keys(seen).length;
    if (distinct <= 3) {
      return { signal: false, digit: -1,
        reason: "Market clustered — only " + distinct + " distinct digits in last 15 ticks" };
    }

    /* Guard 3 — variance */
    var mean = 0;
    for (var i = 0; i < last10.length; i++) mean += lastDigit(last10[i].price);
    mean /= last10.length;
    var variance = 0;
    for (var i = 0; i < last10.length; i++) {
      var dv = lastDigit(last10[i].price) - mean;
      variance += dv * dv;
    }
    variance /= last10.length;
    if (variance < 2.0 || variance > 22.0) {
      return { signal: false, digit: -1,
        reason: "Unstable market (variance " + variance.toFixed(1) + ", need 2.0–22.0)" };
    }

    return {
      signal:     true,
      digit:      prevDigit,
      signalText: "DIFFER " + prevDigit,
      prevCount:  prevCount,
      distinct:   distinct,
      variance:   variance.toFixed(1),
      strength:   Math.max(0.2, 1.0 - prevCount * 0.18),
    };
  }

  /* ════════════════════════════════════════════════════════════════
     ENGINE 2 — Over / Under  (mirrors Expert Bot logic exactly)
  ════════════════════════════════════════════════════════════════ */
  function analyzeOverUnder(buf) {
    if (!buf || buf.length < 20) {
      return { signal: false, selection: "", digit: -1, reason: "Need >=20 ticks" };
    }

    var lastD      = lastDigit(buf[buf.length - 1].price);
    var sampleSize = Math.min(buf.length, 100);
    var counts     = countDigits(buf, sampleSize);
    var lowCount   = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
    var highCount  = counts[5] + counts[6] + counts[7] + counts[8] + counts[9];
    var total      = lowCount + highCount;

    var dominantGroup, dominantPct;
    if (highCount > lowCount) {
      dominantGroup = "high"; dominantPct = highCount / total;
    } else if (lowCount > highCount) {
      dominantGroup = "low";  dominantPct = lowCount  / total;
    } else {
      return { signal: false, selection: "", digit: -1,
        reason: "Market balanced — no dominant group" };
    }

    if (dominantPct < 0.52) {
      return { signal: false, selection: "", digit: -1,
        reason: "Dominant group too weak (" + (dominantPct * 100).toFixed(1) + "%, need >52%)" };
    }

    if (lastD <= 4 && dominantGroup === "high") {
      return {
        signal: true, selection: "over", digit: 1,
        signalText: "OVER 1",
        lastD: lastD, dominantGroup: dominantGroup,
        dominantPct: (dominantPct * 100).toFixed(1),
        lowCount: lowCount, highCount: highCount,
        strength: dominantPct,
      };
    }

    if (lastD >= 5 && dominantGroup === "low") {
      return {
        signal: true, selection: "under", digit: 8,
        signalText: "UNDER 8",
        lastD: lastD, dominantGroup: dominantGroup,
        dominantPct: (dominantPct * 100).toFixed(1),
        lowCount: lowCount, highCount: highCount,
        strength: dominantPct,
      };
    }

    var reason = lastD <= 4
      ? "Last digit " + lastD + " (low) aligns with dominant low group — wait for reversal"
      : "Last digit " + lastD + " (high) aligns with dominant high group — wait for reversal";
    return { signal: false, selection: "", digit: -1, reason: reason };
  }

  /* ─── Pick best signal for current strategy mode ─────────────────── */
  function pickBestSignal(dRes, ouRes) {
    var mode = bt.strategyMode;
    var dOk  = dRes  && dRes.signal;
    var ouOk = ouRes && ouRes.signal;

    if (mode === "differs") {
      if (!dOk) return null;
      return { strategy: "Differs", signalText: dRes.signalText,
               selection: "differ", digit: dRes.digit, tradeType: "match-differ",
               strength: dRes.strength };
    }

    if (mode === "overunder") {
      if (!ouOk) return null;
      return { strategy: "Over/Under", signalText: ouRes.signalText,
               selection: ouRes.selection, digit: ouRes.digit, tradeType: "over-under",
               strength: ouRes.strength };
    }

    /* mode === "both" */
    if (!dOk && !ouOk) return null;
    if ( dOk && !ouOk) {
      return { strategy: "Differs", signalText: dRes.signalText,
               selection: "differ", digit: dRes.digit, tradeType: "match-differ",
               strength: dRes.strength };
    }
    if (!dOk &&  ouOk) {
      return { strategy: "Over/Under", signalText: ouRes.signalText,
               selection: ouRes.selection, digit: ouRes.digit, tradeType: "over-under",
               strength: ouRes.strength };
    }
    /* Both valid — pick stronger */
    if ((dRes.strength || 0) >= (ouRes.strength || 0)) {
      return { strategy: "Differs", signalText: dRes.signalText,
               selection: "differ", digit: dRes.digit, tradeType: "match-differ",
               strength: dRes.strength };
    }
    return { strategy: "Over/Under", signalText: ouRes.signalText,
             selection: ouRes.selection, digit: ouRes.digit, tradeType: "over-under",
             strength: ouRes.strength };
  }

  /* ════════════════════════════════════════════════════════════════
     EXECUTION QUEUE
     Dynamic — reads bt.currentSignal immediately before each
     submission so every pending contract uses the latest signal.
     If the signal is lost mid-session the pump parks itself and
     scanCycle() restarts it as soon as a signal reappears.
  ════════════════════════════════════════════════════════════════ */
  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function onSettled(trade, result) {
    trade.status = "settled";
    trade.result = result.won ? "win" : "loss";
    trade.pl     = parseFloat(result.pl) || 0;
    trade.time   = new Date().toLocaleTimeString();
    if (result.entrySpot) {
      try { trade.entryDigit = lastDigit(parseFloat(result.entrySpot)); } catch (e) {}
    }
    if (result.exitSpot) {
      try { trade.exitDigit = lastDigit(parseFloat(result.exitSpot)); } catch (e) {}
    }
    bt.settledCount++;
    bt.totalPL = +(bt.totalPL + trade.pl).toFixed(2);
    if (result.won) bt.wins++; else bt.losses++;
    renderTable();
    renderLiveSummary();
    updateGlobalSummary();
    if (bt.running && bt.totalPL >= bt.takeProfit) {
      stop("tp");
      return;
    }
    checkBatchComplete();
  }

  function updateGlobalSummary() {
    if (window.AutonixSuite && window.AutonixSuite.update) {
      window.AutonixSuite.update("bulkTrader", bt.running, bt.totalPL);
    }
  }

  function checkBatchComplete() {
    if (!bt.running) return;
    var allSubmitted = bt.submittedCount >= bt.numTrades;
    var allSettled   = bt.settledCount  >= bt.submittedCount;
    if (allSubmitted && allSettled) {
      bt.running        = false;
      bt.executionActive = false;
      stopLoop();
      var summary = bt.wins + "W / " + bt.losses + "L  " +
        (bt.totalPL >= 0 ? "+" : "") + "$" + Math.abs(bt.totalPL).toFixed(2);
      setStatus("complete", "Completed — " + summary);
      updateBtn();
      renderLiveSummary();
      updateGlobalSummary();
    }
  }

  function submitOne(trade) {
    var sd       = window.SESSION_DATA;
    var currency = (sd && sd.activeAccount && sd.activeAccount.currency) || "USD";
    var stake    = Math.min(+(bt.stake).toFixed(2), 5000);

    return window.DerivWS.buyContract({
      tradeType: trade.tradeType,
      selection: trade.selection,
      stake:     stake,
      duration:  1,
      symbol:    bt.symbol,
      digit:     trade.digit,
      currency:  currency,
    }, function (result) {
      onSettled(trade, result);
    })
    .then(function (buyData) {
      trade.contractId = buyData && buyData.contractId;
      trade.status     = "in-trade";
      if (trade.time === "-") trade.time = new Date().toLocaleTimeString();
      renderTable();
      renderLiveSummary();
    });
  }

  /* processNext — called recursively to walk through the queue */
  function processNext() {
    if (!bt.running) { bt.executionActive = false; return; }
    if (bt.submittedCount >= bt.numTrades) { bt.executionActive = false; return; }

    var sig = bt.currentSignal;
    if (!sig) {
      /* No valid signal right now — park the pump.
         scanCycle() will call startExecutionPump() again when
         a signal reappears. */
      bt.executionActive = false;
      setStatus("scanning", "Signal lost — rescanning... cycle #" + bt.cycleCount);
      return;
    }

    /* Build a trade object stamped with the signal valid at this moment */
    var trade = {
      id:        ++bt.tradeIdCounter,
      strategy:  sig.strategy,
      signal:    sig.signalText,
      selection: sig.selection,
      digit:     sig.digit,
      tradeType: sig.tradeType,
      status: "pending", result: null, pl: 0,
      entryDigit: "-", exitDigit: "-", time: "-", contractId: null,
    };
    bt.trades.push(trade);
    bt.submittedCount++;

    setStatus("executing",
      "Submitting " + bt.submittedCount + " / " + bt.numTrades + "…");
    renderTable();
    renderLiveSummary();

    /* Attempt 1 */
    submitOne(trade)
      .catch(function () {
        /* Attempt 2 — retry after 500ms */
        return delay(500).then(function () { return submitOne(trade); });
      })
      .catch(function () {
        /* Both attempts failed — mark error and continue */
        trade.status = "error";
        trade.result = "error";
        trade.time   = new Date().toLocaleTimeString();
        bt.settledCount++;
        renderTable();
        renderLiveSummary();
        checkBatchComplete();
      })
      .then(function () {
        /* 200ms breathing gap then next contract */
        return delay(200);
      })
      .then(function () {
        processNext();
      });
  }

  function startExecutionPump() {
    if (bt.executionActive) return;
    bt.executionActive = true;
    processNext();
  }

  /* ════════════════════════════════════════════════════════════════
     RENDERING
  ════════════════════════════════════════════════════════════════ */

  /* ─── Live analysis panel ─────────────────────────────────────── */
  function renderLiveAnalysis(dRes, ouRes, buf) {
    var el = $id("bulk-analysis-summary");
    if (!el) return;
    el.style.display = "";

    var mode    = bt.strategyMode;
    var bufLen  = buf ? buf.length : 0;
    var latestD = bufLen ? lastDigit(buf[buf.length - 1].price) : "-";
    var dOk     = dRes  && dRes.signal;
    var ouOk    = ouRes && ouRes.signal;

    var signalChanged = bt.currentSignal && bt.prevSignalText &&
                        bt.currentSignal.signalText !== bt.prevSignalText &&
                        bt.submittedCount > 0 && bt.submittedCount < bt.numTrades;

    function badge(ok) {
      return ok
        ? "<span class='bqa-badge bqa-badge-ok'>Signal</span>"
        : "<span class='bqa-badge bqa-badge-no'>Waiting</span>";
    }

    var modeLabel = mode === "differs"   ? "Strategy A – Differs"
                  : mode === "overunder" ? "Strategy B – Over 1 / Under 8"
                  : "Both Strategies";

    /* Signal-updated banner */
    var updatedBanner = signalChanged
      ? "<div class='bqa-signal-updated-banner'>" +
          "<svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2'>" +
            "<polyline points='1 4 1 10 7 10'/>" +
            "<path d='M3.51 15a9 9 0 1 0 .49-3.7'/>" +
          "</svg>" +
          "<span><strong>Signal updated</strong> — remaining contracts will use " +
          "<strong>" + esc(bt.currentSignal.signalText) + "</strong></span>" +
        "</div>"
      : "";

    /* Differs panel (shown in differs or both mode) */
    var differsPanel = (mode === "differs" || mode === "both")
      ? "<div class='bqa-strat-panel'>" +
          "<div class='bqa-strat-title'>" +
            "<span class='bqa-strat-badge bqa-sbadge-differs'>Strategy A – Differs</span>" +
            badge(dOk) +
          "</div>" +
          (dRes
            ? (dRes.signal
                ? "<div class='bqa-signal-line'>Signal: <strong>" + esc(dRes.signalText) + "</strong></div>" +
                  "<div class='bqa-detail'>Target digit: <strong>" + dRes.digit + "</strong></div>" +
                  "<div class='bqa-detail'>Digit " + dRes.digit + " seen <strong>" + dRes.prevCount + "</strong>/10 recent ticks</div>" +
                  "<div class='bqa-detail'>Distinct digits (last 15): <strong>" + dRes.distinct + "</strong></div>" +
                  "<div class='bqa-detail'>Variance: <strong>" + dRes.variance + "</strong></div>"
                : "<div class='bqa-rejection'>" + esc(dRes.reason) + "</div>")
            : "<div class='bqa-empty'>Analyzing…</div>") +
        "</div>"
      : "";

    /* Over/Under panel (shown in overunder or both mode) */
    var ouPanel = (mode === "overunder" || mode === "both")
      ? "<div class='bqa-strat-panel'>" +
          "<div class='bqa-strat-title'>" +
            "<span class='bqa-strat-badge bqa-sbadge-ou'>Strategy B – Over 1 / Under 8</span>" +
            badge(ouOk) +
          "</div>" +
          (ouRes
            ? (ouRes.signal
                ? "<div class='bqa-signal-line'>Signal: <strong>" + esc(ouRes.signalText) + "</strong></div>" +
                  "<div class='bqa-detail'>Last digit: <strong>" + ouRes.lastD + "</strong> (" + (ouRes.lastD <= 4 ? "low, 0–4" : "high, 5–9") + ")</div>" +
                  "<div class='bqa-detail'>Dominant group: <strong>" + ouRes.dominantGroup + "</strong> at <strong>" + ouRes.dominantPct + "%</strong></div>" +
                  "<div class='bqa-detail'>Low 0–4: <strong>" + ouRes.lowCount + "</strong> &nbsp;|&nbsp; High 5–9: <strong>" + ouRes.highCount + "</strong></div>"
                : "<div class='bqa-rejection'>" + esc(ouRes.reason) + "</div>")
            : "<div class='bqa-empty'>Analyzing…</div>") +
        "</div>"
      : "";

    var gridClass = (mode === "both")
      ? "bqa-strat-grid"
      : "bqa-strat-grid bqa-strat-grid-single";

    el.innerHTML =
      "<div class='bqa-header'>" +
        "<div class='bqa-header-left'>" +
          "<svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>" +
            "<circle cx='12' cy='12' r='10'/><path d='M12 8v4l3 3'/>" +
          "</svg>" +
          "<span>Live Market Scanner</span>" +
          "<span class='bqa-mode-label'>" + esc(modeLabel) + "</span>" +
          "<span class='bqa-cycle'>Cycle #" + bt.cycleCount + "</span>" +
        "</div>" +
        "<div class='bqa-header-right'>" +
          "<span class='bqa-sample'>Buffer: <strong>" + bufLen + " ticks</strong></span>" +
          "<span class='bqa-last'>Latest digit: <strong class='bqa-digit-badge'>" + latestD + "</strong></span>" +
        "</div>" +
      "</div>" +
      updatedBanner +
      "<div class='" + gridClass + "'>" + differsPanel + ouPanel + "</div>";
  }

  /* ─── Live summary bar ────────────────────────────────────────── */
  function renderLiveSummary() {
    var el = $id("bulk-live-summary");
    if (!el) return;
    el.style.display = "";

    var active    = bt.trades.filter(function (t) { return t.status === "in-trade"; }).length;
    var completed = bt.trades.filter(function (t) {
      return t.status === "settled" || t.status === "error";
    }).length;
    var winRate = bt.settledCount > 0
      ? Math.round(bt.wins / bt.settledCount * 100) : 0;

    el.innerHTML =
      "<span class='bulk-live-item'>Status: <strong class='bqa-status-txt'>" +
        (bt.running ? "Active" : "Stopped") + "</strong></span>" +
      "<span class='bulk-live-divider'></span>" +
      "<span class='bulk-live-item'>Submitted <strong>" + bt.submittedCount + " / " + bt.numTrades + "</strong></span>" +
      "<span class='bulk-live-item'>Active <strong class='bqa-active'>" + active + "</strong></span>" +
      "<span class='bulk-live-item'>Completed <strong>" + completed + "</strong></span>" +
      "<span class='bulk-live-divider'></span>" +
      "<span class='bulk-live-item'>Wins <strong class='pos'>" + bt.wins + "</strong></span>" +
      "<span class='bulk-live-item'>Losses <strong class='neg'>" + bt.losses + "</strong></span>" +
      "<span class='bulk-live-item'>Win Rate <strong>" + winRate + "%</strong></span>" +
      "<span class='bulk-live-divider'></span>" +
      "<span class='bulk-live-item'>P/L <strong class='" + (bt.totalPL >= 0 ? "pos" : "neg") + "'>" +
        fmtPL(bt.totalPL) + "</strong></span>";
  }

  /* ─── Trade history table ─────────────────────────────────────── */
  function renderTable() {
    var wrap  = $id("bulk-history-wrap");
    var tbody = $id("bulk-history-tbody");
    if (!tbody) return;
    if (wrap) wrap.style.display = bt.trades.length ? "" : "none";

    tbody.innerHTML = bt.trades.map(function (t) {
      var statusLabel, statusClass;
      switch (t.status) {
        case "settled":
          statusLabel = t.result === "win" ? "WIN" : t.result === "error" ? "Error" : "LOSS";
          statusClass = t.result === "win" ? "bulk-row-win" : t.result === "error" ? "bulk-row-err" : "bulk-row-loss";
          break;
        case "in-trade":
          statusLabel = "In Trade"; statusClass = "bulk-row-trading"; break;
        case "error":
          statusLabel = "Error";    statusClass = "bulk-row-err";     break;
        default:
          statusLabel = "Pending";  statusClass = "bulk-row-pending";
      }
      var plStr    = t.pl !== 0 ? fmtPL(t.pl) : "-";
      var plClass  = t.pl > 0 ? "h-profit" : t.pl < 0 ? "h-loss" : "";
      var rowClass = t.result === "win" ? "hrow-win" : t.result === "loss" ? "hrow-loss" : "";
      var badge    = t.strategy === "Differs"
        ? "<span class='bulk-strat-badge bulk-badge-differs'>Differs</span>"
        : "<span class='bulk-strat-badge bulk-badge-ou'>O/U</span>";

      return (
        "<tr class='" + rowClass + "'>" +
        "<td class='bulk-td-num'>" + t.id + "</td>" +
        "<td>" + badge + "</td>" +
        "<td class='bulk-td-dir'>" + esc(t.signal) + "</td>" +
        "<td>$" + (+bt.stake).toFixed(2) + "</td>" +
        "<td><span class='bulk-row-status " + statusClass + "'>" + statusLabel + "</span></td>" +
        "<td class='" + plClass + "'>" + plStr + "</td>" +
        "<td class='bulk-td-digit'>" + t.entryDigit + "</td>" +
        "<td class='bulk-td-digit'>" + t.exitDigit  + "</td>" +
        "<td class='h-time'>" + t.time + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  /* ─── Status pill ─────────────────────────────────────────────── */
  function setStatus(type, text) {
    var p = $id("bulk-status-pill");
    if (!p) return;
    var cssMap = {
      idle:             "idle",
      scanning:         "analyzing",
      signal:           "signal",
      executing:        "running",
      monitoring:       "running",
      "signal-updated": "signal",
      complete:         "complete",
      stopped:          "idle",
    };
    p.className   = "bulk-status-pill bulk-status-" + (cssMap[type] || type);
    p.textContent = text;
  }

  /* ─── Button state ────────────────────────────────────────────── */
  function updateBtn() {
    var runBtn  = $id("bulk-execute-btn");
    var stopBtn = $id("bulk-stop-btn");
    if (runBtn) {
      runBtn.disabled = bt.running;
      runBtn.innerHTML = bt.running
        ? "<svg class='bulk-btn-spin' width='15' height='15' viewBox='0 0 24 24' fill='none' " +
          "stroke='currentColor' stroke-width='2'><path d='M21 12a9 9 0 1 1-6.219-8.56'/></svg>Scanning..."
        : "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' " +
          "stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" +
          "<polyline points='23 6 13.5 15.5 8.5 10.5 1 18'/><polyline points='17 6 23 6 23 12'/></svg>" +
          "Analyze &amp; Execute";
    }
    if (stopBtn) stopBtn.style.display = bt.running ? "" : "none";
  }

  /* ─── Loop management ─────────────────────────────────────────── */
  function stopLoop() {
    if (bt.analysisInterval) { clearInterval(bt.analysisInterval); bt.analysisInterval = null; }
  }

  /* ════════════════════════════════════════════════════════════════
     CORE SCAN CYCLE  —  runs every 500 ms, continuously,
     for the entire trading session.

     The cycle counter increments on EVERY interval tick so the
     display always advances.  Analysis only re-runs when the
     buffer has grown (i.e. a new tick arrived).
  ════════════════════════════════════════════════════════════════ */
  function scanCycle() {
    if (!bt.running) { stopLoop(); return; }

    /* Always advance the cycle counter so the UI never appears frozen */
    bt.cycleCount++;

    var buf      = getBuf();
    var allSubmitted = bt.submittedCount >= bt.numTrades;
    var hasNewTick   = buf.length !== bt.lastTickCount;

    if (!hasNewTick) {
      /* No new tick yet — keep the status pill alive and return */
      if (!allSubmitted && !bt.currentSignal) {
        setStatus("scanning", "Scanning… cycle #" + bt.cycleCount);
      } else if (allSubmitted) {
        var inFlight = bt.trades.filter(function (t) { return t.status === "in-trade"; }).length;
        setStatus("monitoring",
          "Monitoring " + inFlight + " active contract" + (inFlight !== 1 ? "s" : "") + "…");
      }
      return;
    }

    /* New tick arrived — update buffer bookmark and reanalyse */
    bt.lastTickCount = buf.length;

    /* Run only the engines relevant to the selected strategy */
    var mode  = bt.strategyMode;
    var dRes  = (mode === "differs"   || mode === "both") ? analyzeDiffers(buf)  : null;
    var ouRes = (mode === "overunder" || mode === "both") ? analyzeOverUnder(buf) : null;

    /* Update current signal; remember previous for change detection */
    bt.prevSignalText = bt.currentSignal ? bt.currentSignal.signalText : null;
    bt.currentSignal  = pickBestSignal(dRes, ouRes);

    var signalChanged = bt.currentSignal &&
                        bt.prevSignalText &&
                        bt.currentSignal.signalText !== bt.prevSignalText;

    /* Render live analysis panel every cycle that has new data */
    renderLiveAnalysis(dRes, ouRes, buf);

    /* ── Update status pill ── */
    if (allSubmitted) {
      var inFlight2 = bt.trades.filter(function (t) { return t.status === "in-trade"; }).length;
      setStatus("monitoring",
        "Monitoring " + inFlight2 + " active contract" + (inFlight2 !== 1 ? "s" : "") + "…");
    } else if (!bt.currentSignal) {
      setStatus("scanning", "Scanning… cycle #" + bt.cycleCount);
    } else if (signalChanged && bt.submittedCount > 0) {
      setStatus("signal-updated", "Signal updated → " + bt.currentSignal.signalText);
    } else if (bt.executionActive) {
      setStatus("executing",
        "Executing " + bt.submittedCount + " / " + bt.numTrades + "…");
    } else {
      setStatus("signal", "Signal: " + bt.currentSignal.signalText);
    }

    /* ── Start execution pump if signal is valid and trades remain ── */
    if (bt.currentSignal && !bt.executionActive && !allSubmitted) {
      startExecutionPump();
    }

    renderLiveSummary();
  }

  /* ─── Start ───────────────────────────────────────────────────── */
  function run() {
    if (bt.running) return;

    var symbolEl    = $id("bulk-symbol");
    var stakeEl     = $id("bulk-stake");
    var numTradesEl = $id("bulk-num-trades");
    var stratEl     = $id("bulk-strategy");

    bt.symbol       = (symbolEl    && symbolEl.value)    || "1HZ100V";
    bt.stake        = Math.max(0.35, parseFloat((stakeEl && stakeEl.value) || "10") || 10);
    var takeProfitEl = $id("bulk-take-profit");
    bt.takeProfit    = Math.max(5, parseFloat((takeProfitEl && takeProfitEl.value) || "5") || 5);
    bt.numTrades    = Math.max(1, Math.min(500,
      parseInt((numTradesEl && numTradesEl.value) || "10", 10) || 10));
    bt.strategyMode = (stratEl && stratEl.value) || "both";

    if (!window.DerivWS || !window.DerivWS.isAuthorized()) {
      window.showToast && window.showToast(
        "Connect your Deriv account first to use Bulk Trader", "red", 3500);
      return;
    }

    /* Clean up any previous tick subscription */
    if (bt.tickUnsub) { try { bt.tickUnsub(); } catch (e) {} bt.tickUnsub = null; }

    /* Reset all state */
    bt.running         = true;
    bt.trades          = [];
    bt.totalPL         = 0;
    bt.settledCount    = 0;
    bt.wins            = 0;
    bt.losses          = 0;
    bt.cycleCount      = 0;
    bt.lastTickCount   = 0;
    bt.submittedCount  = 0;
    bt.executionActive = false;
    bt.currentSignal   = null;
    bt.prevSignalText  = null;
    bt.tradeIdCounter  = 0;
    bt.localBuf        = [];
    updateGlobalSummary();

    updateBtn();
    setStatus("scanning", "Starting scanner…");

    /* Reset UI panels */
    var summaryEl = $id("bulk-analysis-summary");
    if (summaryEl) { summaryEl.style.display = "none"; summaryEl.innerHTML = ""; }
    var liveSumEl = $id("bulk-live-summary");
    if (liveSumEl) liveSumEl.style.display = "none";
    var histWrap = $id("bulk-history-wrap");
    if (histWrap) histWrap.style.display = "none";

    /* ── Seed local buffer from AutonixCore's existing history ── */
    var core = window.AutonixCore;
    if (core) {
      /* Tell the shared stream to stay alive for this symbol */
      if (core.ensureSymbolStream) core.ensureSymbolStream(bt.symbol);
      /* Copy whatever ticks are already buffered */
      var existing = (core.tickBuffers && core.tickBuffers[bt.symbol]) || [];
      bt.localBuf = existing.slice();   // shallow copy — incremental from here
    }

    /* ── Subscribe directly to live ticks for this symbol ────── */
    /* This gives the Bulk Trader its own feed that keeps updating
       even when no individual bot is running on the same symbol. */
    if (window.DerivWS && window.DerivWS.subscribeTicks) {
      var MAX_LOCAL_BUF = 2000;
      var _sym = bt.symbol; // capture for closure
      window.DerivWS.subscribeTicks(_sym, function (tick) {
        /* Ignore ticks that arrive after we've stopped */
        if (!bt.running || bt.symbol !== _sym) return;
        var price = parseFloat(tick.quote);
        if (!isFinite(price)) return;
        bt.localBuf.push({ price: price, time: tick.epoch * 1000 });
        if (bt.localBuf.length > MAX_LOCAL_BUF) bt.localBuf.shift();
      });
      /* DerivWS.subscribeTicks may return an unsubscribe function or
         a subscription key — store whichever is truthy for cleanup */
      /* Note: if subscribeTicks returns the key synchronously we
         capture it; otherwise cleanup falls back to stopping the
         running flag check inside the callback above. */
    } else if (core && core.ensureSymbolStream) {
      /* Fallback: rely entirely on AutonixCore's shared stream */
    }

    /* Start the continuous scan loop — it never stops until done or user stops */
    bt.analysisInterval = setInterval(scanCycle, 500);
  }

  /* ─── Stop ────────────────────────────────────────────────────── */
  function stop(reason) {
    /* Mark not running first so the tick subscription callback becomes a no-op */
    bt.running         = false;
    bt.executionActive = false;
    stopLoop();
    /* Clean up explicit unsubscribe handle if one was stored */
    if (bt.tickUnsub) { try { bt.tickUnsub(); } catch (e) {} bt.tickUnsub = null; }
    var settled = bt.settledCount;
    var total   = bt.submittedCount;
    setStatus("stopped",
      total ? "Stopped — " + settled + " / " + total + " settled" : "Stopped");
    updateBtn();
    renderLiveSummary();
    updateGlobalSummary();
    if (reason === "tp" && window.showTPCelebration) {
      window.showTPCelebration(bt.totalPL);
    }
  }

  /* ─── Populate symbol selector ────────────────────────────────── */
  function populateSelectors() {
    var SYMBOL_OPTIONS = [
      { v: "1HZ10V",  l: "Volatility 10 (1s)"  },
      { v: "1HZ25V",  l: "Volatility 25 (1s)"  },
      { v: "1HZ50V",  l: "Volatility 50 (1s)"  },
      { v: "1HZ75V",  l: "Volatility 75 (1s)"  },
      { v: "1HZ100V", l: "Volatility 100 (1s)" },
      { v: "R_10",    l: "Volatility 10"        },
      { v: "R_25",    l: "Volatility 25"        },
      { v: "R_50",    l: "Volatility 50"        },
      { v: "R_75",    l: "Volatility 75"        },
      { v: "R_100",   l: "Volatility 100"       },
    ];
    var symSel = $id("bulk-symbol");
    if (symSel && !symSel.children.length) {
      symSel.innerHTML = SYMBOL_OPTIONS.map(function (s) {
        return "<option value='" + s.v + "'" +
               (s.v === "1HZ100V" ? " selected" : "") +
               ">" + s.l + "</option>";
      }).join("");
    }
  }

  /* ─── Init ────────────────────────────────────────────────────── */
  function init() {
    populateSelectors();
    var runBtn  = $id("bulk-execute-btn");
    var stopBtn = $id("bulk-stop-btn");
    if (runBtn)  runBtn.addEventListener("click", run);
    if (stopBtn) stopBtn.addEventListener("click", stop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
