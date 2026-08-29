/* ═══════════════════════════════════════════════════════════════
   Autonix — Bots Page v3  (Free Bot · Basic Bot · Expert Bot)
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  if (!document.getElementById("bots-grid")) return;

  /* ─── Audio ──────────────────────────────────────────────────── */
  var _AudioCtx = window.AudioContext || window.webkitAudioContext;
  var _audioCtx = null;
  var soundsEnabled = (function () {
    try { return localStorage.getItem("at_sounds") !== "0"; } catch (e) { return true; }
  })();
  function getAudioCtx() {
    if (!_AudioCtx) return null;
    if (!_audioCtx) { try { _audioCtx = new _AudioCtx(); } catch (e) { return null; } }
    if (_audioCtx.state === "suspended") { try { _audioCtx.resume(); } catch (e) {} }
    return _audioCtx;
  }
  function playWinSound() {
    if (!soundsEnabled) return;
    var ctx = getAudioCtx(); if (!ctx) return;
    try {
      var t = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination); osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, t); osc.frequency.setValueAtTime(659.25, t + .08); osc.frequency.setValueAtTime(783.99, t + .18);
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.28, t + .02); gain.gain.exponentialRampToValueAtTime(.001, t + .65);
      osc.start(t); osc.stop(t + .65);
    } catch (e) {}
  }
  function playLossSound() {
    if (!soundsEnabled) return;
    var ctx = getAudioCtx(); if (!ctx) return;
    try {
      var t = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination); osc.type = "sawtooth";
      osc.frequency.setValueAtTime(330, t); osc.frequency.linearRampToValueAtTime(200, t + .4);
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.22, t + .02); gain.gain.exponentialRampToValueAtTime(.001, t + .55);
      osc.start(t); osc.stop(t + .55);
    } catch (e) {}
  }
  function setSoundsEnabled(on) {
    soundsEnabled = on;
    try { localStorage.setItem("at_sounds", on ? "1" : "0"); } catch (e) {}
    var btn = document.getElementById("bots-sound-toggle");
    if (btn) {
      btn.classList.toggle("sounds-off", !on);
      btn.title = on ? "Sounds ON — click to mute" : "Sounds OFF — click to enable";
      var iconOn = btn.querySelector(".sound-icon-on");
      var iconOff = btn.querySelector(".sound-icon-off");
      if (iconOn) iconOn.style.display = on ? "" : "none";
      if (iconOff) iconOff.style.display = on ? "none" : "";
    }
  }
  document.addEventListener("click", function unlockAudio() {
    getAudioCtx(); document.removeEventListener("click", unlockAudio);
  }, { once: true });

  /* ─── Connection state ───────────────────────────────────────── */
  var connState = "unknown";
  var _connTimeoutId = null;
  function isAuthed() { return !!(window.DerivWS && window.DerivWS.isAuthorized()); }
  function setConnState(s) {
    if (connState === s) return;
    connState = s;
    updateConnUI();
  }
  function updateConnUI() {
    var pill = document.getElementById("bots-mode-pill");
    var label = document.getElementById("bots-mode-label");
    var sub = document.getElementById("bots-mode-sub");
    var connectBtn = document.getElementById("bots-connect-btn");
    if (pill) {
      pill.className = "bots-mode-pill " + (
        connState === "connected" ? "live" : connState === "connecting" ? "connecting" : "demo"
      );
    }
    if (connState === "connecting") {
      if (label) label.textContent = "Connecting to Deriv\u2026";
      if (sub) sub.textContent = "Please wait";
      if (connectBtn) connectBtn.style.display = "none";
    } else if (connState === "connected") {
      var sd = window.SESSION_DATA, acct = sd && sd.activeAccount;
      if (label) label.textContent = (acct && acct.isVirtual) ? "Demo account" : "Live trading";
      if (sub) sub.textContent = (acct && acct.account) || "";
      if (connectBtn) connectBtn.style.display = "none";
    } else {
      if (label) label.textContent = "Not connected";
      if (sub) sub.textContent = "Login required to trade";
      if (connectBtn) connectBtn.style.display = "";
    }
    BOT_DEFS.forEach(function (def) {
      var btn = document.getElementById("start-" + def.id);
      var s = states && states[def.id];
      if (!btn) return;
      var isActivated = def.requiresActivation ? activationState[def.id] : true;
      btn.disabled = !isActivated || (connState !== "connected" && !(s && s.running));
    });
  }

  /* ─── Bot definitions ────────────────────────────────────────── */
  var BOT_DEFS = [
    {
      id: "freeBot",
      name: "Free Bot",
      tier: "free",
      martingaleOverUnder: 4.5,
      martingaleDiffers: 12,
      maxMartStepsOverUnder: 6,
      maxMartStepsDiffers: 3,
      duration: 1,
      defaults: { stake: 10, tp: 5, sl: 100 },
      accent: "#00E5A0",
      requiresActivation: false,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
    },
    {
      id: "basicBot",
      name: "Basic Bot",
      tier: "basic",
      martingale: 12,
      maxMartSteps: 3,
      duration: 1,
      tradeType: "match-differ",
      defaults: { stake: 10, tp: 5, sl: 100 },
      accent: "#5b9dff",
      requiresActivation: true,
      activationTier: "basic",
      price: 50,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z"/></svg>',
    },
    {
      id: "expertBot",
      name: "Expert Bot",
      tier: "expert",
      martingale: 4.5,
      maxMartSteps: 6,
      duration: 1,
      tradeType: "over-under",
      defaults: { stake: 10, tp: 5, sl: 100 },
      accent: "#F59E0B",
      requiresActivation: true,
      activationTier: "expert",
      price: 100,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    },
  ];

  /* ─── Activation state (session-only, no localStorage) ───────── */
  var activationState = { freeBot: true, basicBot: false, expertBot: false };

  /* ─── Symbol options ─────────────────────────────────────────── */
  var DEFAULT_SYMBOL = "1HZ100V";
  var SYMBOL_OPTIONS = [
    { v: "1HZ10V", l: "Volatility 10 (1s)" },
    { v: "1HZ25V", l: "Volatility 25 (1s)" },
    { v: "1HZ50V", l: "Volatility 50 (1s)" },
    { v: "1HZ75V", l: "Volatility 75 (1s)" },
    { v: "1HZ100V", l: "Volatility 100 (1s)" },
    { v: "R_10", l: "Volatility 10" },
    { v: "R_25", l: "Volatility 25" },
    { v: "R_50", l: "Volatility 50" },
    { v: "R_75", l: "Volatility 75" },
    { v: "R_100", l: "Volatility 100" },
  ];

  /* ─── Per-bot state ──────────────────────────────────────────── */
  function makeState(def) {
    return {
      def: def,
      running: false,
      symbol: DEFAULT_SYMBOL,
      stake: def.defaults.stake,
      tp: def.defaults.tp,
      sl: def.defaults.sl,
      martingale: def.martingale || def.martingaleOverUnder || 4.5,
      maxMartSteps: def.maxMartSteps || def.maxMartStepsOverUnder || 6,
      currentStake: def.defaults.stake,
      martStep: 0,
      consecutiveLosses: 0,
      sessionPL: 0,
      trades: 0,
      wins: 0,
      losses: 0,
      lastResult: null,
      cooldownUntil: 0,
      awaitingSettle: false,
      activeContractId: null,
      history: [],
      latencySafeguard: true,
      currentSignal: null,
      tickWindow: 100,
      tradeMode: "over-under",    // freeBot only: "over-under" | "differs"
      analysisStatus: "idle",
    };
  }
  var states = {};
  BOT_DEFS.forEach(function (d) { states[d.id] = makeState(d); });

  var LATEST_BALANCE = null;

  /* ─── Tick buffers ───────────────────────────────────────────── */
  var tickBuffers = {};
  var TICK_WINDOW = 1000;

  function ensureSymbolStream(symbol) {
    if (tickBuffers[symbol]) return;
    tickBuffers[symbol] = [];
    function doSeed() {
      if (!window.DerivWS) return;
      var st = window.DerivWS.getState();
      if (!st || !st.connected) { setTimeout(doSeed, 400); return; }
      window.DerivWS.getHistory(symbol, TICK_WINDOW)
        .then(function (hist) { tickBuffers[symbol] = hist.slice(-TICK_WINDOW); })
        .catch(function () {});
      window.DerivWS.subscribeTicks(symbol, function (tick) {
        var price = parseFloat(tick.quote);
        if (!isFinite(price)) return;
        var buf = tickBuffers[symbol];
        buf.push({ price: price, time: tick.epoch * 1000 });
        if (buf.length > TICK_WINDOW) buf.shift();
      });
    }
    doSeed();
  }

  function reseedAllStreams() {
    var symbols = {};
    BOT_DEFS.forEach(function (d) { symbols[states[d.id].symbol] = true; });
    Object.keys(tickBuffers).forEach(function (k) { delete tickBuffers[k]; });
    Object.keys(symbols).forEach(function (sym) { ensureSymbolStream(sym); });
  }

  function lastDigit(price) {
    var s = price.toFixed(2);
    return parseInt(s.charAt(s.length - 1), 10);
  }

  function countDigits(buf, range) {
    var slice = buf.slice(-range);
    var counts = new Array(10).fill(0);
    for (var i = 0; i < slice.length; i++) counts[lastDigit(slice[i].price)]++;
    return counts;
  }

  /* ─────────────────────────────────────────────────────────────
     SHARED UTILITY — Shannon entropy (0 = fully predictable,
     1 = perfectly uniform/random). Used by Basic and Expert.
  ───────────────────────────────────────────────────────────── */
  function shannonEntropy(buf, window) {
    var size   = Math.min(buf.length, window);
    var counts = countDigits(buf, window);
    var ent    = 0;
    for (var d = 0; d <= 9; d++) {
      if (counts[d] > 0) {
        var p = counts[d] / size;
        ent -= p * Math.log(p) / Math.LN2;
      }
    }
    return ent / (Math.log(10) / Math.LN2); // normalised to [0, 1]
  }

  /* ─────────────────────────────────────────────────────────────
     STRATEGY 1 — Free Bot: Pure Transition-Matrix Over 1 / Under 8
     Determines which contract has the lower probability of hitting
     its losing digits by analysing historical digit transitions.

     Architecture:
     • 10×10 one-step matrix  — P(next | current)
     • bigram matrix          — P(next | prev, current)  [confirmation]
     • Ring buffer (300 pairs) — recency weighting
         last 100 transitions: 70 %
         prev 200 transitions: 20 %
         older counts:         10 %
     • Signal requires 3 consecutive cycles in the same direction.

     OVER 1 loses on 0 or 1.  UNDER 8 loses on 8 or 9.
     Martingale: 4.5 (hidden)
  ───────────────────────────────────────────────────────────── */

  /* Helper — allocate/reset a 10×10 matrix stored as a flat array */
  function _tmMake10x10() {
    var m = new Array(100);
    for (var i = 0; i < 100; i++) m[i] = 0;
    return m;
  }
  function _tmGet(m, r, c) { return m[r * 10 + c]; }
  function _tmSet(m, r, c, v) { m[r * 10 + c] = v; }
  function _tmInc(m, r, c) { m[r * 10 + c]++; }

  /* Helper — allocate/reset a bigram store (100 keys × 10 counts) */
  function _bgMake() {
    var b = new Array(1000);
    for (var i = 0; i < 1000; i++) b[i] = 0;
    return b;
  }
  function _bgInc(b, prev, cur, nxt) { b[prev * 100 + cur * 10 + nxt]++; }
  function _bgRow(b, prev, cur) { return b.slice(prev * 100 + cur * 10, prev * 100 + cur * 10 + 10); }

  /* Initialise (or re-initialise on symbol change) the persistent tm state */
  function _tmInit(symbol) {
    var buf = tickBuffers[symbol] || [];
    var tm = {
      symbol:       symbol,
      matrix:       _tmMake10x10(),   // full lifetime counts
      bigram:       _bgMake(),        // full lifetime bigram counts
      ring:         new Array(300),   // ring buffer of {f,t} pairs
      ringPos:      0,
      ringFill:     0,                // how many slots are actually filled (max 300)
      processedLen: 0,                // how many ticks consumed from buf so far
      confirmBuf:   { dir: null, count: 0 },
    };

    // Seed from existing tick buffer
    for (var i = 1; i < buf.length; i++) {
      var f = lastDigit(buf[i - 1].price);
      var t = lastDigit(buf[i].price);
      _tmInc(tm.matrix, f, t);
      if (i >= 2) {
        var p = lastDigit(buf[i - 2].price);
        _bgInc(tm.bigram, p, f, t);
      }
      // Fill ring buffer with the most recent 300 transitions
      var slot = (i - 1) % 300;         // wrap into 0..299
      tm.ring[slot] = { f: f, t: t };
    }
    // After seeding, ringPos should point to where the next write goes
    var filled = Math.min(buf.length - 1, 300);
    tm.ringFill  = filled;
    tm.ringPos   = filled < 300 ? filled : (buf.length - 1) % 300;
    tm.processedLen = buf.length;
    return tm;
  }

  /* Incrementally update the tm state with any new ticks in buf */
  function _tmUpdate(tm, buf) {
    for (var i = tm.processedLen; i < buf.length; i++) {
      if (i < 1) continue;
      var f = lastDigit(buf[i - 1].price);
      var t = lastDigit(buf[i].price);

      // Update full lifetime matrix
      _tmInc(tm.matrix, f, t);

      // Update bigram
      if (i >= 2) {
        var p = lastDigit(buf[i - 2].price);
        _bgInc(tm.bigram, p, f, t);
      }

      // Update ring buffer
      tm.ring[tm.ringPos] = { f: f, t: t };
      tm.ringPos = (tm.ringPos + 1) % 300;
      if (tm.ringFill < 300) tm.ringFill++;
    }
    tm.processedLen = buf.length;
  }

  /* Compute weighted risk for one digit (row) from ring + lifetime matrix.
     Returns a 10-element probability array [P(next=0)..P(next=9)].
     Weights: last 100 transitions → 70 %, prior 200 → 20 %, older → 10 %. */
  function _tmWeightedProbs(tm, fromDigit) {
    // Walk ring from most-recent backwards, collecting per-bucket counts
    var recent  = new Array(10).fill(0); // last 100
    var mid     = new Array(10).fill(0); // next 200
    var n = tm.ringFill;
    var pos = (tm.ringPos + 300 - 1) % 300; // most-recent slot

    for (var k = 0; k < n; k++) {
      var entry = tm.ring[(pos - k + 300) % 300];
      if (!entry || entry.f !== fromDigit) continue;
      if (k < 100) recent[entry.t]++;
      else         mid[entry.t]++;
    }

    // Older counts = lifetime matrix minus ring entries
    var older = new Array(10);
    var ringTotal = new Array(10).fill(0);
    for (var k2 = 0; k2 < n; k2++) {
      var e2 = tm.ring[(pos - k2 + 300) % 300];
      if (e2 && e2.f === fromDigit) ringTotal[e2.t]++;
    }
    for (var d = 0; d <= 9; d++) {
      older[d] = Math.max(0, _tmGet(tm.matrix, fromDigit, d) - ringTotal[d]);
    }

    // Weighted counts
    var wt = new Array(10);
    var wtTotal = 0;
    for (var d2 = 0; d2 <= 9; d2++) {
      wt[d2] = recent[d2] * 0.70 + mid[d2] * 0.20 + older[d2] * 0.10;
      wtTotal += wt[d2];
    }

    if (wtTotal === 0) return null;  // no data for this digit

    var probs = new Array(10);
    for (var d3 = 0; d3 <= 9; d3++) probs[d3] = wt[d3] / wtTotal;
    return probs;
  }

  function decideFreeOverUnder(state) {
    var buf = tickBuffers[state.symbol] || [];

    // Minimum 300 ticks required
    if (buf.length < 300) { state.currentSignal = null; return null; }

    /* ── Initialise / update persistent transition state ───────── */
    if (!state._tm || state._tm.symbol !== state.symbol) {
      state._tm = _tmInit(state.symbol);
    } else {
      _tmUpdate(state._tm, buf);
    }
    var tm = state._tm;

    /* ── Current and previous digit ────────────────────────────── */
    var curDigit  = lastDigit(buf[buf.length - 1].price);
    var prevDigit = buf.length >= 2 ? lastDigit(buf[buf.length - 2].price) : -1;

    /* ── Gate: current digit must have at least 20 transitions ─── */
    var lifetimeRowTotal = 0;
    for (var d = 0; d <= 9; d++) lifetimeRowTotal += _tmGet(tm.matrix, curDigit, d);
    if (lifetimeRowTotal < 20) { state.currentSignal = null; return null; }

    /* ── 1-STEP: weighted probability from current digit ────────── */
    var probs1 = _tmWeightedProbs(tm, curDigit);
    if (!probs1) { state.currentSignal = null; return null; }

    // Flat-distribution guard: if the distribution is almost perfectly uniform
    // (max probability within 2 % of 10 %) there is no usable signal
    var maxP = 0;
    for (var d2 = 0; d2 <= 9; d2++) if (probs1[d2] > maxP) maxP = probs1[d2];
    if (maxP < 0.12) { state.currentSignal = null; return null; }

    var overRisk1  = probs1[0] + probs1[1];
    var underRisk1 = probs1[8] + probs1[9];

    /* ── 2-STEP: bigram confirmation ────────────────────────────── */
    var overRisk2 = overRisk1, underRisk2 = underRisk1; // fallback to 1-step
    var bigramAvailable = false;
    if (prevDigit >= 0) {
      var bgRow = _bgRow(tm.bigram, prevDigit, curDigit);
      var bgTotal = 0;
      for (var d3 = 0; d3 <= 9; d3++) bgTotal += bgRow[d3];
      if (bgTotal >= 10) {
        overRisk2  = (bgRow[0] + bgRow[1]) / bgTotal;
        underRisk2 = (bgRow[8] + bgRow[9]) / bgTotal;
        bigramAvailable = true;
      }
    }

    /* ── Combine 1-step and 2-step ──────────────────────────────── */
    // If bigram is available: 60 % one-step + 40 % bigram
    // Agreement between the two boosts signal; disagreement weakens it.
    var overRiskFinal, underRiskFinal;
    if (bigramAvailable) {
      var oneStepDir = overRisk1 < underRisk1 ? "over" : "under";
      var twoStepDir = overRisk2 < underRisk2 ? "over" : "under";
      if (oneStepDir !== twoStepDir) {
        // Models disagree — no trade
        state.currentSignal = null;
        return null;
      }
      overRiskFinal  = overRisk1  * 0.60 + overRisk2  * 0.40;
      underRiskFinal = underRisk1 * 0.60 + underRisk2 * 0.40;
    } else {
      overRiskFinal  = overRisk1;
      underRiskFinal = underRisk1;
    }

    /* ── Signal validation ──────────────────────────────────────── */
    var riskDiff = Math.abs(overRiskFinal - underRiskFinal);
    // Require at least 5 % risk difference for a clear advantage
    if (riskDiff < 0.05) { state.currentSignal = null; return null; }

    var direction = overRiskFinal < underRiskFinal ? "over" : "under";

    // Require 3 consecutive analysis cycles in the same direction
    if (!tm.confirmBuf) tm.confirmBuf = { dir: null, count: 0 };
    if (tm.confirmBuf.dir !== direction) {
      tm.confirmBuf.dir   = direction;
      tm.confirmBuf.count = 1;
    } else {
      tm.confirmBuf.count++;
    }

    if (tm.confirmBuf.count < 3) {
      state.currentSignal = (direction === "over" ? "OVER 1" : "UNDER 8") +
        " \u2014 confirming (" + tm.confirmBuf.count + "/3)";
      return null;
    }

    /* ── Trade decision ─────────────────────────────────────────── */
    var pctDiff = (riskDiff * 100).toFixed(1);
    if (direction === "over") {
      state.currentSignal = "OVER 1  \u0394" + pctDiff + "%";
      return { selection: "over", digit: 1, tradeType: "over-under" };
    }
    state.currentSignal = "UNDER 8  \u0394" + pctDiff + "%";
    return { selection: "under", digit: 8, tradeType: "over-under" };
  }

  /* ─────────────────────────────────────────────────────────────
     STRATEGY 2 — Free Bot: Matches / Differs
     Requires BOTH frequency AND pattern signals to agree.
     Deliberately simpler and stricter than Basic Bot.
     Martingale: 12 (hidden)
  ───────────────────────────────────────────────────────────── */
  function decideFreeDiffers(state) {
    var buf = tickBuffers[state.symbol] || [];
    var tickWindow = state.tickWindow || 100;
    var sampleSize = Math.min(buf.length, tickWindow);
    if (sampleSize < 20) return null;           // 20 ticks minimum — fast entry

    // ── Frequency: digit must be ≥18% over-expected ──
    var counts  = countDigits(buf, sampleSize);
    var expected = sampleSize / 10;
    var maxExcess = -Infinity, bestDigit = -1;
    for (var d = 0; d <= 9; d++) {
      var excess = (counts[d] - expected) / expected;
      if (excess > maxExcess) { maxExcess = excess; bestDigit = d; }
    }
    var hasFreqSignal = maxExcess > 0.18;

    // ── Streak: last 2+ consecutive ticks on same digit ──
    var tail = buf.slice(-8);
    var lastD = tail.length ? lastDigit(tail[tail.length - 1].price) : -1;
    var streak = 0;
    for (var i = tail.length - 1; i >= 0; i--) {
      if (lastDigit(tail[i].price) === lastD) streak++; else break;
    }

    // ── Cluster: digit appears 3+ times in last 10 ticks ──
    var last10 = buf.slice(-Math.min(10, buf.length));
    var clusterCounts = new Array(10).fill(0);
    for (var i = 0; i < last10.length; i++) clusterCounts[lastDigit(last10[i].price)]++;
    var clusterDigit = -1, clusterMax = 0;
    for (var d = 0; d <= 9; d++) {
      if (clusterCounts[d] > clusterMax) { clusterMax = clusterCounts[d]; clusterDigit = d; }
    }
    var hasPatternSignal = streak >= 2 || clusterMax >= 3;

    // Need EITHER a strong frequency signal OR a pattern signal, but prefer both
    if (!hasFreqSignal && !hasPatternSignal) {
      state.currentSignal = null;
      return null;
    }

    // If only frequency signal: bestDigit leads clearly
    // If only pattern signal: use clustered/streak digit
    // If both: prefer agreement
    var targetDigit;
    if (hasFreqSignal && hasPatternSignal) {
      targetDigit = (streak >= 2 && lastD === bestDigit) ? bestDigit
                  : (clusterDigit === bestDigit)          ? bestDigit
                  : bestDigit; // frequency wins on disagreement
    } else if (hasFreqSignal) {
      targetDigit = bestDigit;
    } else {
      targetDigit = streak >= 2 ? lastD : clusterDigit;
    }

    if (targetDigit < 0) { state.currentSignal = null; return null; }

    state.currentSignal = "DIFFER " + targetDigit;
    return { selection: "differ", digit: targetDigit, tradeType: "match-differ" };
  }

  /* ─────────────────────────────────────────────────────────────
     STRATEGY 3 — Basic Bot: Tick-Based Differs Engine
     Reads the last digit of the previous tick and immediately
     predicts Differs on that digit. Three lightweight market-health
     checks guard against unusual conditions.  Fast, responsive,
     and continuous — trades on every qualifying tick.
     Martingale: 12 (hidden)
   ───────────────────────────────────────────────────────────── */
  function decideBasicDiffers(state) {
    var buf = tickBuffers[state.symbol] || [];
    if (buf.length < 10) return null;

    /* Prediction: the next tick is more likely to differ from the
       current tick's digit than to repeat it. */
    var prevDigit = lastDigit(buf[buf.length - 1].price);
    var last10    = buf.slice(-10);

    /* Check 1: Excessive repetition.
       If the target digit appeared 4+ times in the last 10 ticks
       it may be stuck in a repeating cycle — skip and retry. */
    var prevCount = 0;
    for (var i = 0; i < last10.length; i++) {
      if (lastDigit(last10[i].price) === prevDigit) prevCount++;
    }
    if (prevCount >= 4) { state.currentSignal = null; return null; }

    /* Check 2: Extreme clustering.
       Fewer than 4 distinct digits in last 15 ticks signals an
       abnormally locked market — skip. */
    var last15 = buf.slice(-Math.min(15, buf.length));
    var seen = {};
    for (var i = 0; i < last15.length; i++) seen[lastDigit(last15[i].price)] = true;
    if (Object.keys(seen).length <= 3) { state.currentSignal = null; return null; }

    /* Check 3: Short-term stability.
       Variance too low = stuck; too high = erratic. */
    var mean = 0;
    for (var i = 0; i < last10.length; i++) mean += lastDigit(last10[i].price);
    mean /= last10.length;
    var variance = 0;
    for (var i = 0; i < last10.length; i++) {
      var dv = lastDigit(last10[i].price) - mean;
      variance += dv * dv;
    }
    variance /= last10.length;
    if (variance < 2.0 || variance > 22.0) { state.currentSignal = null; return null; }

    /* All checks passed — trade Differs on the previous tick's digit */
    state.currentSignal = "DIFFER " + prevDigit;
    return { selection: "differ", digit: prevDigit, tradeType: "match-differ" };
  }

  /* ─────────────────────────────────────────────────────────────
     STRATEGY 4 — Expert Bot: Dominant-Group Over / Under Engine
     Evaluates the last tick's digit against the dominant digit
     group from the last 100 ticks (low 0-4 vs high 5-9).

     Over 1:  last digit 0-4 AND dominant group is 5-9.
              High digits dominate; last tick briefly low ->
              strong expectation next tick reverts high.

     Under 8: last digit 5-9 AND dominant group is 0-4.
              Low digits dominate; last tick briefly high ->
              strong expectation next tick reverts low.

     Requires clear dominance (>52%) so balanced markets are
     skipped.  Decisive, readable, and fast.
     Martingale: 4.5 (hidden)
   ───────────────────────────────────────────────────────────── */
  function decideExpertOverUnder(state) {
    var buf = tickBuffers[state.symbol] || [];
    if (buf.length < 20) return null;

    /* Last digit of the most recent completed tick */
    var lastD = lastDigit(buf[buf.length - 1].price);

    /* Dominant digit group from the last 100 ticks */
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
      state.currentSignal = null; return null; // perfectly balanced
    }

    /* Require clear dominance — skip balanced markets */
    if (dominantPct < 0.52) { state.currentSignal = null; return null; }

    /* Over 1: last digit low (0-4), market dominated by high (5-9) */
    if (lastD <= 4 && dominantGroup === "high") {
      state.currentSignal = "OVER 1  " + (dominantPct * 100).toFixed(0) + "%";
      return { selection: "over", digit: 1, tradeType: "over-under" };
    }

    /* Under 8: last digit high (5-9), market dominated by low (0-4) */
    if (lastD >= 5 && dominantGroup === "low") {
      state.currentSignal = "UNDER 8  " + (dominantPct * 100).toFixed(0) + "%";
      return { selection: "under", digit: 8, tradeType: "over-under" };
    }

    /* Last digit aligns with dominant group — no counter-signal */
    state.currentSignal = null;
    return null;
  }

  /* ─── Strategy router ────────────────────────────────────────── */
  function getDecision(state) {
    var id = state.def.id;
    if (id === "freeBot") {
      return state.tradeMode === "differs" ? decideFreeDiffers(state) : decideFreeOverUnder(state);
    }
    if (id === "basicBot")  return decideBasicDiffers(state);
    if (id === "expertBot") return decideExpertOverUnder(state);
    return null;
  }

  /* ─── Signal stability confirmation requirements per tier ────── */
  // Free bot: fires immediately on first valid signal (1 confirmation).
  // Basic bot: requires 2 consecutive ticks with the same signal direction.
  // Expert bot: requires 3 consecutive ticks with the same signal direction.
  // This prevents entering on a single spike that may not persist.
  var SIGNAL_CONFIRM_REQUIRED = { freeBot: 1, basicBot: 1, expertBot: 2 };

  /* ─── Trade loop ─────────────────────────────────────────────── */
  function botTick(state) {
    if (!state.running || state.awaitingSettle) return;
    if (Date.now() < state.cooldownUntil) return;

    var sig = getDecision(state);
    if (!sig) {
      // Clear the confirmation buffer whenever the signal disappears
      state._sigConfirmBuf = [];
      state.analysisStatus = "analyzing";
      renderBot(state);
      return;
    }

    // Build a fingerprint for the signal direction so we can check stability
    var sigKey = sig.selection + "|" + sig.digit;
    if (!state._sigConfirmBuf) state._sigConfirmBuf = [];

    // If direction changed, restart the buffer
    if (state._sigConfirmBuf.length > 0 && state._sigConfirmBuf[0] !== sigKey) {
      state._sigConfirmBuf = [];
    }
    state._sigConfirmBuf.push(sigKey);

    var required = SIGNAL_CONFIRM_REQUIRED[state.def.id] || 1;
    if (state._sigConfirmBuf.length < required) {
      // Signal is forming — show it but don't trade yet
      state.analysisStatus = "analyzing";
      state.currentSignal  = (sig.selection.toUpperCase() +
        (sig.digit !== undefined ? " " + sig.digit : "") +
        " \u2014 confirming (" + state._sigConfirmBuf.length + "/" + required + ")");
      renderBot(state);
      return;
    }

    // Signal confirmed across required consecutive ticks — execute trade
    state._sigConfirmBuf = [];
    state.analysisStatus = "signal";
    placeBotTrade(state, sig);
  }

  function placeBotTrade(state, sig) {
    if (!isAuthed()) { stopBot(state, "auth"); return; }
    state.awaitingSettle = true;

    if (state._settleTimer) clearTimeout(state._settleTimer);
    state._settleTimer = setTimeout(function () {
      if (state.awaitingSettle) {
        state.awaitingSettle = false;
        window.showToast && window.showToast(state.def.name + ": settlement timeout — retrying", "neutral", 3000);
      }
    }, 45000);

    var sd = window.SESSION_DATA;
    var currency = (sd && sd.activeAccount && sd.activeAccount.currency) || "USD";
    var stake = Math.min(+state.currentStake.toFixed(2), 5000);

    var opts = {
      tradeType: sig.tradeType || state.def.tradeType || "over-under",
      selection: sig.selection,
      stake: stake,
      duration: state.def.duration,
      symbol: state.symbol,
      digit: sig.digit,
      currency: currency,
    };

    window.DerivWS.buyContract(opts, function (result) {
      handleSettlement(state, sig, stake, result);
    }).catch(function (err) {
      var msg = err && err.message ? err.message : "Trade failed";
      console.error("[Autonix] " + state.def.name + " trade error:", msg);
      window.showToast && window.showToast(state.def.name + ": " + msg, "red", 4500);
      state.awaitingSettle = false;
      if (state.latencySafeguard) state.cooldownUntil = Date.now() + 4000;
    });

    renderBot(state);
  }

  function handleSettlement(state, sig, stake, result) {
    state.awaitingSettle = false;
    if (state._settleTimer) { clearTimeout(state._settleTimer); state._settleTimer = null; }

    var won = !!result.won;
    var pl  = parseFloat(result.pl) || 0;

    state.sessionPL = +(state.sessionPL + pl).toFixed(2);
    state.trades += 1;
    if (won) { state.wins += 1; playWinSound(); }
    else     { state.losses += 1; playLossSound(); }

    state.lastResult = { won: won, pl: pl, selection: sig.selection, digit: sig.digit };
    var tradeTime = new Date().toLocaleTimeString();

    pushGlobalHistory({
      time: tradeTime,
      botName: state.def.name,
      botId: state.def.id,
      tradeType: sig.selection.toUpperCase() + (sig.digit !== undefined ? " " + sig.digit : ""),
      stake: stake,
      pl: pl,
      won: won,
    });

    window.showToast && window.showToast(
      state.def.name + (won ? " WIN +" : " LOSS -") + "$" + Math.abs(pl).toFixed(2),
      won ? "green" : "red", 2400
    );

    // Martingale logic
    if (won) {
      state.currentStake = state.stake;
      state.martStep = 0;
      state.consecutiveLosses = 0;
    } else {
      state.consecutiveLosses += 1;
      state.martStep += 1;
      if (state.martStep >= state.maxMartSteps) {
        stopBot(state, "martCap");
        return;
      }
      state.currentStake = Math.min(+(state.currentStake * state.martingale).toFixed(2), 5000);
    }

    // Per-bot cooldowns — tiered by quality level:
    //   Free Bot:   any loss → 5 s;  2+ consecutive losses → 10 s
    //   Basic Bot:  any loss → 8 s;  2+ consecutive losses → 14 s; win → 2 s gap
    //   Expert Bot: any loss → 12 s; 2+ consecutive losses → 20 s; win → 5 s gap
    if (state.def.id === "freeBot") {
      if (!won) {
        state.cooldownUntil = Date.now() + (state.consecutiveLosses >= 2 ? 10000 : 5000);
      }
    }
    if (state.def.id === "basicBot") {
      if (!won) {
        state.cooldownUntil = Date.now() + (state.consecutiveLosses >= 2 ? 14000 : 8000);
      } else {
        state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + 2000);
      }
    }
    if (state.def.id === "expertBot") {
      if (!won) {
        state.cooldownUntil = Date.now() + (state.consecutiveLosses >= 2 ? 20000 : 12000);
      } else {
        state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + 5000);
      }
    }

    renderBot(state);
    renderSummary();

    if (!state.running) return;
    if (state.sessionPL >= state.tp)  { stopBot(state, "tp"); return; }
    if (state.sessionPL <= -state.sl) { stopBot(state, "sl"); return; }
  }

  /* ─── Start / Stop / Reset ───────────────────────────────────── */
  function startBot(state) {
    if (state.running) return;
    if (connState !== "connected") {
      window.showToast && window.showToast(
        connState === "connecting"
          ? "Still connecting to Deriv — please wait"
          : "Connect your Deriv account to start " + state.def.name,
        connState === "connecting" ? "neutral" : "red", 3500
      );
      return;
    }

    var stakeEl  = document.getElementById("input-stake-" + state.def.id);
    var tpEl     = document.getElementById("input-tp-"    + state.def.id);
    var slEl     = document.getElementById("input-sl-"    + state.def.id);
    var twEl     = document.getElementById("tickwin-"     + state.def.id);
    state.stake      = parseFloat(stakeEl && stakeEl.value) || state.def.defaults.stake;
    state.tp         = parseFloat(tpEl    && tpEl.value)    || state.def.defaults.tp;
    state.sl         = parseFloat(slEl    && slEl.value)    || state.def.defaults.sl;
    if (twEl) state.tickWindow = parseInt(twEl.value, 10)   || state.tickWindow || 100;
    if (state.stake < 0.35) state.stake = 0.35;
    state.currentStake = state.stake;
    state.martStep = 0;
    state.consecutiveLosses = 0;
    state.cooldownUntil = 0;
    state.running = true;
    state.awaitingSettle = false;
    state.analysisStatus = "analyzing";
    state.currentSignal = null;

    ensureSymbolStream(state.symbol);
    window.showToast && window.showToast(state.def.name + " started", "green", 2000);
    renderBot(state);
    renderSummary();

    var _attempts = 0;
    var _poll = setInterval(function () {
      _attempts++;
      if (!state.running) { clearInterval(_poll); return; }
      var buf = tickBuffers[state.symbol] || [];
      if (buf.length >= 10 || _attempts > 25) {
        clearInterval(_poll);
        if (state.running && !state.awaitingSettle) botTick(state);
      }
    }, 200);
  }

  function stopBot(state, reason) {
    if (!state.running) return;
    state.running = false;
    state.awaitingSettle = false;
    state.analysisStatus = "idle";
    state.currentSignal = null;

    var msgs = {
      tp: state.def.name + ": Take Profit reached \u2714",
      sl: state.def.name + ": Stop Loss triggered",
      manual: state.def.name + " stopped",
      martCap: state.def.name + ": Max recovery steps reached — bot halted",
      connection: state.def.name + ": Connection lost — bot halted",
      auth: state.def.name + ": Login required — bot halted",
    };
    var color = reason === "tp" ? "green" : reason === "manual" ? "neutral" : "red";
    window.showToast && window.showToast(msgs[reason] || msgs.manual, color, 3500);

    if (reason === "tp" && window.showTPCelebration) {
      window.showTPCelebration(state.sessionPL);
    }

    renderBot(state);
    renderSummary();

    // Paid bots: session ends on stop → return to activation screen
    if (state.def.requiresActivation) {
      activationState[state.def.id] = false;
      setTimeout(function () { renderCardContent(state.def.id); }, 600);
    }
  }

  function resetBot(state) {
    if (state.running) stopBot(state, "manual");
    state.sessionPL = 0;
    state.trades = 0;
    state.wins = 0;
    state.losses = 0;
    state.history = [];
    state.lastResult = null;
    state.currentStake = state.stake;
    state.martStep = 0;
    state.consecutiveLosses = 0;
    state.cooldownUntil = 0;
    state.currentSignal = null;
    window.showToast && window.showToast(state.def.name + " session reset", "neutral", 1800);
    renderBot(state);
    renderSummary();
  }

  /* ─── Activation ─────────────────────────────────────────────── */
  function validateActivation(botId, code, callback) {
    var def = BOT_DEFS.find(function (d) { return d.id === botId; });
    if (!def || !def.activationTier) { callback(false, "Unknown bot"); return; }
    fetch("/api/validate-activation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: def.activationTier, code: code.trim() }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) { callback(data.valid, data.error); })
      .catch(function () { callback(false, "Network error — please try again."); });
  }

  /* ─── Payment modal ──────────────────────────────────────────── */
  var WALLET_ADDRESS = "0x3391130f64cb8a135b304b778a7e8523a1f4916d";

  function openPaymentModal(price, tierLabel) {
    var existing = document.getElementById("payment-modal-overlay");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = "payment-modal-overlay";
    overlay.className = "payment-modal-overlay";
    overlay.innerHTML =
      '<div class="payment-modal">' +
        '<button class="payment-modal-close" id="payment-modal-close">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
        '<div class="payment-modal-icon">' +
          '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>' +
        '</div>' +
        '<h2 class="payment-modal-title">Get Your Activation Code</h2>' +
        '<p class="payment-modal-desc">To unlock <strong>' + tierLabel + '</strong>, send exactly <strong>' + price + ' USDT (BEP20)</strong> to the address below. Once payment is confirmed, you will receive your activation code — enter it on the bot card to unlock trading.</p>' +
        '<div class="payment-modal-details">' +
          '<div class="payment-detail-row"><span class="payment-detail-label">Network</span><span class="payment-detail-val">BEP20 (Binance Smart Chain)</span></div>' +
          '<div class="payment-detail-row"><span class="payment-detail-label">Token</span><span class="payment-detail-val">USDT</span></div>' +
          '<div class="payment-detail-row"><span class="payment-detail-label">Amount</span><span class="payment-detail-val">' + price + ' USDT</span></div>' +
        '</div>' +
        '<div class="payment-address-box">' +
          '<div class="payment-address-label">Wallet Address</div>' +
          '<div class="payment-address-value" id="pay-addr">' + WALLET_ADDRESS + '</div>' +
          '<button class="payment-copy-btn" id="payment-copy-btn">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
            'Copy Address' +
          '</button>' +
        '</div>' +
        '<div class="payment-verify-note">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
          'Payments are typically verified <strong>immediately</strong>. Your activation code will be sent to you right after confirmation. If verification is delayed, contact our WhatsApp support at the link below and we\'ll assist you promptly.' +
        '</div>' +
        '<a href="https://wa.me/254776685670" target="_blank" rel="noopener" class="payment-wa-btn">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.117 1.534 5.849L0 24l6.335-1.512A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.6a9.545 9.545 0 0 1-4.878-1.336l-.35-.208-3.628.866.9-3.536-.228-.364A9.557 9.557 0 0 1 2.4 12C2.4 6.698 6.698 2.4 12 2.4c5.302 0 9.6 4.298 9.6 9.6 0 5.302-4.298 9.6-9.6 9.6z"/></svg>' +
          'Contact Support on WhatsApp' +
        '</a>' +
      '</div>';

    document.body.appendChild(overlay);

    document.getElementById("payment-modal-close").addEventListener("click", function () {
      overlay.remove();
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.remove();
    });
    document.getElementById("payment-copy-btn").addEventListener("click", function () {
      var addrEl = document.getElementById("pay-addr");
      if (navigator.clipboard) {
        navigator.clipboard.writeText(WALLET_ADDRESS).then(function () {
          window.showToast && window.showToast("Address copied!", "green", 2000);
        });
      } else {
        var ta = document.createElement("textarea");
        ta.value = WALLET_ADDRESS; document.body.appendChild(ta); ta.select(); document.execCommand("copy");
        ta.remove();
        window.showToast && window.showToast("Address copied!", "green", 2000);
      }
    });
  }

  /* ─── Rendering helpers ──────────────────────────────────────── */
  var TICK_WINDOW_OPTIONS = [25, 50, 75, 100, 150, 200, 300, 500];

  function tickWindowSelectHTML(botId, selected) {
    var sel = selected || 100;
    return '<select id="tickwin-' + botId + '" class="bot-select">' +
      TICK_WINDOW_OPTIONS.map(function (n) {
        return '<option value="' + n + '"' + (n === sel ? " selected" : "") + '>' + n + ' ticks</option>';
      }).join("") +
    '</select>';
  }

  function symbolSelectHTML(botId, selected) {
    return '<select id="symbol-' + botId + '" class="bot-select">' +
      SYMBOL_OPTIONS.map(function (s) {
        return '<option value="' + s.v + '"' + (s.v === (selected || DEFAULT_SYMBOL) ? " selected" : "") + '>' + s.l + '</option>';
      }).join("") +
    '</select>';
  }

  function tierBadgeHTML(tier) {
    var labels = { free: "FREE", basic: "BASIC", expert: "EXPERT" };
    return '<span class="bot-tier-badge bot-tier-' + tier + '">' + (labels[tier] || tier.toUpperCase()) + '</span>';
  }

  /* ─── Card content rendering (supports live re-render) ───────── */
  function renderCardContent(botId) {
    var def = BOT_DEFS.find(function (d) { return d.id === botId; });
    if (!def) return;
    var card = document.getElementById("card-" + botId);
    if (!card) return;
    var s = states[botId];
    var isActivated = activationState[botId];

    card.innerHTML = buildCardHTML(def, s, isActivated);
    wireCardEvents(def, s);
    renderBot(s);
    renderDigitFreq(s);
  }

  function buildCardHTML(def, s, isActivated) {
    var optsHTML = symbolSelectHTML(def.id, s.symbol);
    var tickwinRow =
      '<div class="bot-trade-type-row">' +
        '<label class="bot-input-label" for="tickwin-' + def.id + '">Analysis Window</label>' +
        tickWindowSelectHTML(def.id, s.tickWindow) +
      '</div>';
    var inputsHTML =
      tickwinRow +
      '<div class="bot-inputs-grid">' +
        '<label class="bot-input-field">' +
          '<span class="bot-input-label">Symbol</span>' +
          optsHTML +
        '</label>' +
        '<label class="bot-input-field">' +
          '<span class="bot-input-label">Stake (USD)</span>' +
          '<input type="number" min="0.35" step="0.5" value="' + s.def.defaults.stake + '" id="input-stake-' + def.id + '" />' +
        '</label>' +
        '<label class="bot-input-field">' +
          '<span class="bot-input-label">Take Profit</span>' +
          '<input type="number" min="0.5" step="0.5" value="' + s.def.defaults.tp + '" id="input-tp-' + def.id + '" />' +
        '</label>' +
        '<label class="bot-input-field">' +
          '<span class="bot-input-label">Stop Loss</span>' +
          '<input type="number" min="0.5" step="0.5" value="' + s.def.defaults.sl + '" id="input-sl-' + def.id + '" />' +
        '</label>' +
      '</div>';

    var actionsHTML =
      '<div class="bot-actions">' +
        '<button class="bot-start-btn" id="start-' + def.id + '" disabled>' +
          '<svg class="ico-start" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>' +
          '<svg class="ico-stop" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>' +
          '<span class="bot-start-label">Start Bot</span>' +
        '</button>' +
        '<button class="bot-reset-btn" id="reset-' + def.id + '">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>' +
          'Reset' +
        '</button>' +
      '</div>';

    var statsHTML =
      '<div class="bot-stats-grid">' +
        '<div class="bot-stat"><span class="bot-stat-label">P / L</span><span class="bot-stat-val" id="pl-' + def.id + '">$0.00</span></div>' +
        '<div class="bot-stat"><span class="bot-stat-label">Trades</span><span class="bot-stat-val" id="trades-' + def.id + '">0</span></div>' +
        '<div class="bot-stat"><span class="bot-stat-label">Wins</span><span class="bot-stat-val" id="wins-' + def.id + '">0</span></div>' +
        '<div class="bot-stat"><span class="bot-stat-label">Losses</span><span class="bot-stat-val" id="losses-' + def.id + '">0</span></div>' +
        '<div class="bot-stat"><span class="bot-stat-label">Win Rate</span><span class="bot-stat-val" id="wr-' + def.id + '">\u2014</span></div>' +
      '</div>';

    var signalHTML =
      '<div class="bot-signal-row" id="signal-row-' + def.id + '" style="display:none">' +
        '<span class="bot-signal-label">Signal</span>' +
        '<span class="bot-signal-val" id="signal-' + def.id + '">\u2014</span>' +
      '</div>';

    var lastHTML =
      '<div class="bot-last-trade" id="last-' + def.id + '" style="display:none">' +
        '<span class="bot-last-label">Last contract</span>' +
        '<span class="bot-last-result" id="last-res-' + def.id + '"></span>' +
      '</div>';

    var digitFreqHTML =
      '<div class="digit-freq-section">' +
        '<div class="digit-freq-header">' +
          '<span class="digit-freq-title">Live Digit Frequency</span>' +
          '<span class="digit-freq-hint" id="dfreq-hint-' + def.id + '">Loading\u2026</span>' +
        '</div>' +
        '<div class="digit-freq-cells" id="digit-freq-' + def.id + '">' +
          [0,1,2,3,4,5,6,7,8,9].map(function (d) {
            return '<div class="df-cell" id="dfc-' + def.id + '-' + d + '">' +
              '<span class="df-digit">' + d + '</span>' +
              '<div class="df-bar-wrap"><div class="df-bar" id="dfbar-' + def.id + '-' + d + '" style="width:10%"></div></div>' +
              '<span class="df-count" id="dfcount-' + def.id + '-' + d + '">—</span>' +
              '<span class="df-pct" id="dfpct-' + def.id + '-' + d + '">—</span>' +
            '</div>';
          }).join("") +
        '</div>' +
      '</div>';

    // ── Free Bot ─────────────────────────────────────────────────
    if (def.tier === "free") {
      return (
        '<div class="bot-card-header">' +
          '<div class="bot-card-icon">' + def.icon + '</div>' +
          '<div class="bot-card-title-wrap">' +
            tierBadgeHTML("free") +
            '<h2 class="bot-card-name">' + def.name + '</h2>' +
          '</div>' +
          '<span class="bot-status-pill stopped" id="status-' + def.id + '">' +
            '<span class="bot-status-dot"></span>' +
            '<span class="bot-status-text">Stopped</span>' +
          '</span>' +
        '</div>' +
        '<div class="bot-trade-type-row">' +
          '<label class="bot-input-label" for="tradetype-' + def.id + '">Trade Strategy</label>' +
          '<select id="tradetype-' + def.id + '" class="bot-select bot-trade-type-select">' +
            '<option value="over-under"' + (s.tradeMode === "over-under" ? " selected" : "") + '>Over / Under</option>' +
            '<option value="differs"' + (s.tradeMode === "differs" ? " selected" : "") + '>Matches / Differs</option>' +
          '</select>' +
        '</div>' +
        inputsHTML +
        actionsHTML +
        statsHTML +
        signalHTML +
        lastHTML +
        digitFreqHTML
      );
    }

    // ── Paid Bot — LOCKED ─────────────────────────────────────────
    if (!isActivated) {
      return (
        '<div class="bot-card-header">' +
          '<div class="bot-card-icon">' + def.icon + '</div>' +
          '<div class="bot-card-title-wrap">' +
            tierBadgeHTML(def.tier) +
            '<h2 class="bot-card-name">' + def.name + '</h2>' +
            '<p class="bot-card-tagline">' + (def.tier === "basic" ? "Advanced Differs strategy · Multi-window analysis" : "Full Over/Under engine · Maximum precision") + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="bot-activation-panel">' +
          '<div class="bot-lock-wrap">' +
            '<div class="bot-lock-icon">' +
              '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
            '</div>' +
            '<p class="bot-activation-prompt">Enter your activation code to unlock</p>' +
          '</div>' +
          '<div class="bot-activation-form">' +
            '<input type="text" class="bot-activation-input" id="actcode-' + def.id + '" placeholder="e.g. ' + def.activationTier + '@001" autocomplete="off" />' +
            '<button class="bot-validate-btn" id="validate-' + def.id + '">Validate</button>' +
          '</div>' +
          '<div class="bot-activation-error" id="acterr-' + def.id + '" style="display:none"></div>' +
        '</div>' +
        '<div class="bot-purchase-panel">' +
          '<button class="bot-purchase-btn" id="purchase-' + def.id + '">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>' +
            (def.tier === 'basic' ? 'Get Basic Activation Code' : 'Get Expert Activation Code') +
          '</button>' +
          '<a href="https://wa.me/254776685670" target="_blank" rel="noopener" class="bot-wa-btn">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.117 1.534 5.849L0 24l6.335-1.512A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.6a9.545 9.545 0 0 1-4.878-1.336l-.35-.208-3.628.866.9-3.536-.228-.364A9.557 9.557 0 0 1 2.4 12C2.4 6.698 6.698 2.4 12 2.4c5.302 0 9.6 4.298 9.6 9.6 0 5.302-4.298 9.6-9.6 9.6z"/></svg>' +
            'Contact Support on WhatsApp' +
          '</a>' +
        '</div>'
      );
    }

    // ── Paid Bot — UNLOCKED ───────────────────────────────────────
    return (
      '<div class="bot-card-header">' +
        '<div class="bot-card-icon">' + def.icon + '</div>' +
        '<div class="bot-card-title-wrap">' +
          tierBadgeHTML(def.tier) +
          '<h2 class="bot-card-name">' + def.name + '</h2>' +
          '<div class="bot-activated-row">' +
            '<span class="bot-activated-badge">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
              'Activated' +
            '</span>' +
          '</div>' +
        '</div>' +
        '<span class="bot-status-pill stopped" id="status-' + def.id + '">' +
          '<span class="bot-status-dot"></span>' +
          '<span class="bot-status-text">Stopped</span>' +
        '</span>' +
      '</div>' +
      inputsHTML +
      actionsHTML +
      statsHTML +
      signalHTML +
      lastHTML
    );
  }

  /* ─── Wire card event listeners ──────────────────────────────── */
  function wireCardEvents(def, s) {
    var startBtn = document.getElementById("start-" + def.id);
    if (startBtn) {
      startBtn.addEventListener("click", function () {
        if (s.running) stopBot(s, "manual"); else startBot(s);
      });
    }
    var resetBtn = document.getElementById("reset-" + def.id);
    if (resetBtn) resetBtn.addEventListener("click", function () { resetBot(s); });

    var symbolSel = document.getElementById("symbol-" + def.id);
    if (symbolSel) {
      symbolSel.addEventListener("change", function (e) {
        s.symbol = e.target.value;
        ensureSymbolStream(s.symbol);
      });
    }

    // All bots: tick window selector
    var twSel = document.getElementById("tickwin-" + def.id);
    if (twSel) {
      twSel.addEventListener("change", function (e) {
        s.tickWindow = parseInt(e.target.value, 10) || 100;
      });
    }

    // Free Bot: trade type toggle
    var ttSel = document.getElementById("tradetype-" + def.id);
    if (ttSel) {
      ttSel.addEventListener("change", function (e) {
        s.tradeMode = e.target.value;
        // Adjust internal martingale and steps
        if (s.tradeMode === "differs") {
          s.martingale = def.martingaleDiffers || 12;
          s.maxMartSteps = def.maxMartStepsDiffers || 3;
        } else {
          s.martingale = def.martingaleOverUnder || 4.5;
          s.maxMartSteps = def.maxMartStepsOverUnder || 6;
        }
        if (s.running) stopBot(s, "manual");
      });
    }

    // Paid bots: validate button
    var validateBtn = document.getElementById("validate-" + def.id);
    if (validateBtn) {
      validateBtn.addEventListener("click", function () {
        var input = document.getElementById("actcode-" + def.id);
        var errEl  = document.getElementById("acterr-"  + def.id);
        var code = input ? input.value.trim() : "";
        if (!code) {
          if (errEl) { errEl.textContent = "Please enter an activation code."; errEl.style.display = ""; }
          return;
        }
        validateBtn.disabled = true;
        validateBtn.textContent = "Validating\u2026";
        validateActivation(def.id, code, function (valid, errMsg) {
          validateBtn.disabled = false;
          validateBtn.textContent = "Validate";
          if (valid) {
            activationState[def.id] = true;
            renderCardContent(def.id);
          } else {
            if (errEl) { errEl.textContent = errMsg || "Invalid activation code."; errEl.style.display = ""; }
            if (input) { input.classList.add("input-error"); setTimeout(function () { input.classList.remove("input-error"); }, 2000); }
          }
        });
      });
      // Allow Enter key in code input
      var codeInput = document.getElementById("actcode-" + def.id);
      if (codeInput) {
        codeInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter") validateBtn.click();
        });
      }
    }

    // Paid bots: purchase button
    var purchaseBtn = document.getElementById("purchase-" + def.id);
    if (purchaseBtn) {
      purchaseBtn.addEventListener("click", function () {
        openPaymentModal(def.price, def.name);
      });
    }
  }

  /* ─── Render bot live state ──────────────────────────────────── */
  function renderBot(state) {
    var def = state.def;

    var pill = document.getElementById("status-" + def.id);
    var statusText = pill && pill.querySelector(".bot-status-text");
    if (pill) {
      pill.className = "bot-status-pill " + (
        state.running ? (state.awaitingSettle ? "waiting" : "running") : "stopped"
      );
      if (statusText) {
        if (state.running) {
          statusText.textContent = state.awaitingSettle ? "In Trade" :
            state.analysisStatus === "signal" ? "Signal found\u2026" : "Scanning\u2026";
        } else {
          statusText.textContent = "Stopped";
        }
      }
    }

    var startBtn = document.getElementById("start-" + def.id);
    if (startBtn) {
      var isActivated = def.requiresActivation ? activationState[def.id] : true;
      startBtn.disabled = !isActivated || (connState !== "connected" && !state.running);
      startBtn.classList.toggle("running", state.running);
      var icoStart = startBtn.querySelector(".ico-start");
      var icoStop  = startBtn.querySelector(".ico-stop");
      var lbl      = startBtn.querySelector(".bot-start-label");
      if (icoStart) icoStart.style.display = state.running ? "none" : "";
      if (icoStop)  icoStop.style.display  = state.running ? "" : "none";
      if (lbl)      lbl.textContent        = state.running ? "Stop Bot" : "Start Bot";
    }

    var plEl = document.getElementById("pl-" + def.id);
    if (plEl) {
      plEl.textContent = (state.sessionPL >= 0 ? "+$" : "-$") + Math.abs(state.sessionPL).toFixed(2);
      plEl.className = "bot-stat-val " + (state.sessionPL >= 0 ? "pos" : "neg");
    }
    var trEl = document.getElementById("trades-"  + def.id); if (trEl) trEl.textContent = state.trades;
    var wiEl = document.getElementById("wins-"    + def.id); if (wiEl) wiEl.textContent = state.wins;
    var loEl = document.getElementById("losses-"  + def.id); if (loEl) loEl.textContent = state.losses;
    var wrEl = document.getElementById("wr-"      + def.id);
    if (wrEl) wrEl.textContent = state.trades ? ((state.wins / state.trades) * 100).toFixed(1) + "%" : "\u2014";

    // Signal
    var sigRow = document.getElementById("signal-row-" + def.id);
    var sigEl  = document.getElementById("signal-"     + def.id);
    if (sigRow && sigEl) {
      if (state.running && state.currentSignal) {
        sigRow.style.display = "";
        sigEl.textContent = state.currentSignal;
        sigEl.className = "bot-signal-val active";
      } else if (state.running) {
        sigRow.style.display = "";
        sigEl.textContent = "Analyzing\u2026";
        sigEl.className = "bot-signal-val";
      } else {
        sigRow.style.display = "none";
      }
    }

    // Last result
    var lastWrap = document.getElementById("last-"     + def.id);
    var lastRes  = document.getElementById("last-res-" + def.id);
    if (lastWrap && lastRes) {
      if (state.lastResult) {
        lastWrap.style.display = "";
        lastRes.className = "bot-last-result " + (state.lastResult.won ? "win" : "loss");
        lastRes.textContent =
          (state.lastResult.won ? "WIN +" : "LOSS -") + "$" + Math.abs(state.lastResult.pl).toFixed(2) +
          " \u00b7 " + state.lastResult.selection.toUpperCase() +
          (state.lastResult.digit !== undefined ? " " + state.lastResult.digit : "");
      } else {
        lastWrap.style.display = "none";
      }
    }
  }

  function renderSummary() {
    var active = 0, total = 0;
    BOT_DEFS.forEach(function (d) {
      var s = states[d.id];
      if (s.running) active++;
      total += s.sessionPL;
    });
    if (window.AutonixSuite && window.AutonixSuite.systems) {
      Object.keys(window.AutonixSuite.systems).forEach(function (id) {
        var system = window.AutonixSuite.systems[id];
        if (!BOT_DEFS.some(function (d) { return d.id === id; })) {
          if (system.running) active++;
          total += Number(system.sessionPL) || 0;
        }
      });
    }
    var ac = document.getElementById("bots-active-count");
    if (ac) ac.textContent = active + " / 5";
    var tp = document.getElementById("bots-total-pl");
    if (tp) {
      tp.textContent = (total >= 0 ? "+$" : "-$") + Math.abs(total).toFixed(2);
      tp.className = "bots-summary-value " + (total >= 0 ? "pos" : "neg");
    }
  }

  window.AutonixSuite = {
    systems: {
      aiTrader: { running: false, sessionPL: 0 },
      bulkTrader: { running: false, sessionPL: 0 },
    },
    update: function (id, running, sessionPL) {
      if (!this.systems[id]) this.systems[id] = { running: false, sessionPL: 0 };
      this.systems[id].running = !!running;
      this.systems[id].sessionPL = Number(sessionPL) || 0;
      renderSummary();
    },
  };

  /* ─── Enhanced Digit Frequency Display ──────────────────────── */
  function renderDigitFreq(state) {
    var container = document.getElementById("digit-freq-" + state.def.id);
    if (!container) return;
    var buf  = tickBuffers[state.symbol] || [];
    var range = Math.min(buf.length, 100);
    var hintEl = document.getElementById("dfreq-hint-" + state.def.id);

    if (range < 5) {
      if (hintEl) hintEl.textContent = "Waiting for data\u2026";
      return;
    }

    var counts = countDigits(buf, range);
    var total  = counts.reduce(function (a, b) { return a + b; }, 0);
    var minCount = Math.min.apply(null, counts);
    var maxCount = Math.max.apply(null, counts);
    if (hintEl) hintEl.textContent = range + " ticks";

    for (var d = 0; d <= 9; d++) {
      var cell    = document.getElementById("dfc-" + state.def.id + "-" + d);
      var bar     = document.getElementById("dfbar-" + state.def.id + "-" + d);
      var countEl = document.getElementById("dfcount-" + state.def.id + "-" + d);
      var pctEl   = document.getElementById("dfpct-" + state.def.id + "-" + d);
      if (!cell) continue;

      var count = counts[d];
      var pct   = total > 0 ? (count / total) * 100 : 0;
      var barW  = maxCount > 0 ? Math.round((count / maxCount) * 100) : 10;

      var isHot  = count === maxCount;
      var isCold = count === minCount;

      cell.className = "df-cell" + (isHot ? " df-hot" : isCold ? " df-cold" : "");
      if (bar)     { bar.style.width = barW + "%"; bar.className = "df-bar" + (isHot ? " df-bar-hot" : isCold ? " df-bar-cold" : ""); }
      if (countEl) countEl.textContent = count;
      if (pctEl)   pctEl.textContent   = pct.toFixed(1) + "%";
    }
  }

  /* ─── Global history ─────────────────────────────────────────── */
  var globalHistory = [];
  function pushGlobalHistory(entry) {
    globalHistory.unshift(entry);
    if (globalHistory.length > 500) globalHistory.length = 500;
    renderHistoryCard();
  }
  function renderHistoryCard() {
    var emptyEl   = document.getElementById("bots-history-empty");
    var tableWrap = document.getElementById("bots-history-table-wrap");
    var tbody     = document.getElementById("bots-history-tbody");
    var countEl   = document.getElementById("bots-history-count");
    if (!tbody) return;
    var t = globalHistory.length;
    if (countEl) countEl.textContent = t + " trade" + (t !== 1 ? "s" : "");
    if (t === 0) {
      if (emptyEl) emptyEl.style.display = "";
      if (tableWrap) tableWrap.style.display = "none";
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";
    if (tableWrap) tableWrap.style.display = "";
    var ACCENT = { freeBot: "#00E5A0", basicBot: "#5b9dff", expertBot: "#F59E0B" };
    tbody.innerHTML = globalHistory.slice(0, 200).map(function (h) {
      var plStr = (h.pl >= 0 ? "+" : "") + "$" + Math.abs(h.pl).toFixed(2);
      return (
        '<tr class="' + (h.won ? "hrow-win" : "hrow-loss") + '">' +
        '<td><span class="h-bot-dot" style="background:' + (ACCENT[h.botId] || "#aaa") + '"></span>' + h.botName + '</td>' +
        '<td>' + h.tradeType + '</td>' +
        '<td>$' + h.stake.toFixed(2) + '</td>' +
        '<td><span class="h-result-badge ' + (h.won ? "h-win" : "h-loss-badge") + '">' + (h.won ? "WIN" : "LOSS") + '</span></td>' +
        '<td class="' + (h.pl >= 0 ? "h-profit" : "h-loss") + '">' + plStr + '</td>' +
        '<td class="h-time">' + h.time + '</td>' +
        '</tr>'
      );
    }).join("");
  }

  /* ─── Initial render ─────────────────────────────────────────── */
  function renderAll() {
    var grid = document.getElementById("bots-grid");
    if (!grid) return;
    grid.innerHTML = "";
    BOT_DEFS.forEach(function (def) {
      var article = document.createElement("article");
      article.className = "bot-card" + (def.requiresActivation ? " bot-card-premium" : "");
      article.id = "card-" + def.id;
      article.style.setProperty("--bot-accent", def.accent);
      grid.appendChild(article);
      renderCardContent(def.id);
    });
    renderSummary();
    renderHistoryCard();

    var soundBtn = document.getElementById("bots-sound-toggle");
    if (soundBtn && !soundBtn._wired) {
      soundBtn._wired = true;
      soundBtn.classList.toggle("sounds-off", !soundsEnabled);
      soundBtn.title = soundsEnabled ? "Sounds ON — click to mute" : "Sounds OFF — click to enable";
      soundBtn.addEventListener("click", function () { setSoundsEnabled(!soundsEnabled); });
    }
    var clearBtn = document.getElementById("bots-history-clear");
    if (clearBtn && !clearBtn._wired) {
      clearBtn._wired = true;
      clearBtn.addEventListener("click", function () {
        globalHistory = [];
        renderHistoryCard();
        window.showToast && window.showToast("Trade history cleared", "neutral", 1800);
      });
    }
  }

  /* ─── Connection watcher ─────────────────────────────────────── */
  function watchConnection() {
    if (!window.DerivWS) return;
    var isAuth = !!(window.SESSION_DATA && window.SESSION_DATA.isAuthenticated);
    if (isAuth) {
      setConnState("connecting");
      _connTimeoutId = setTimeout(function () {
        if (connState === "connecting") {
          setConnState("disconnected");
          window.showToast && window.showToast("Could not connect to Deriv — please try logging in again", "red", 4000);
        }
      }, 10000);
    } else {
      setConnState("disconnected");
    }
    var lastAuthed = false;
    setInterval(function () {
      var st = window.DerivWS.getState();
      var authed = !!(st && st.authorized);
      if (lastAuthed && !authed) {
        BOT_DEFS.forEach(function (d) { if (states[d.id].running) stopBot(states[d.id], "connection"); });
        setConnState(isAuth ? "connecting" : "disconnected");
      }
      lastAuthed = authed;
    }, 2500);
  }

  /* ─── Balance event ──────────────────────────────────────────── */
  document.addEventListener("derivBalance", function (e) {
    var wasConnecting = (connState !== "connected");
    if (wasConnecting) {
      if (_connTimeoutId) { clearTimeout(_connTimeoutId); _connTimeoutId = null; }
      setConnState("connected");
      reseedAllStreams();
    }
    if (isFinite(parseFloat(e.detail && e.detail.balance))) LATEST_BALANCE = parseFloat(e.detail.balance);
    var el = document.getElementById("bots-balance-display");
    if (!el || !e.detail) return;
    var bal = parseFloat(e.detail.balance);
    var cur = e.detail.currency || "USD";
    el.textContent = isFinite(bal) ? cur + " " + bal.toFixed(2) : "\u2014";
  });

  /* ─── Main loop (1s) ─────────────────────────────────────────── */
  setInterval(function () {
    BOT_DEFS.forEach(function (d) {
      var s = states[d.id];
      if (s.running) botTick(s);
      if (d.tier === "free") renderDigitFreq(s);
    });
  }, 1000);

  /* ─── Init ───────────────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", function () {
    renderAll();
    ensureSymbolStream(DEFAULT_SYMBOL);
    watchConnection();
  });

  /* ─── Shared core for Bulk Trader ────────────────────────────── */
  window.AutonixCore = {
    tickBuffers: tickBuffers,
    lastDigit: lastDigit,
    countDigits: countDigits,
    ensureSymbolStream: ensureSymbolStream,
    SYMBOL_OPTIONS: SYMBOL_OPTIONS,
    TICK_WINDOW_OPTIONS: TICK_WINDOW_OPTIONS,
    DEFAULT_SYMBOL: DEFAULT_SYMBOL,
  };
})();
