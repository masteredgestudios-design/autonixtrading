/* ═══════════════════════════════════════════
   Autonix Trader — Chart (candlestick + line + digit freq)
   - Rolling 1000-tick buffer per active symbol
   - Timeframe selector aggregates ticks → OHLC candles
   ═══════════════════════════════════════════ */

(function () {
  "use strict";

  var canvas, ctx, wrap;

  /* Tick storage: rolling window of last MAX_TICKS ticks for the active symbol */
  var MAX_TICKS = 1000;
  var ticks = []; /* [{ price, time }] sorted ascending by time */

  /* Derived candle series for the current timeframe */
  var candles = [];

  var chartType = "candle"; /* 'candle' | 'line' */
  var chartSymbol = null; /* the symbol the chart is currently bound to */
  var loadToken = 0; /* increments on every initChart; stale loads ignored */

  /* Timeframe controls aggregation. '1T' = 1 candle per tick (no time bucket). */
  var TF_SECONDS = {
    "1T": 0 /* tick mode */,
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "1D": 86400,
  };
  var currentTf = "1T";

  /* How many candles to render at once */
  function getVisibleCandles() {
    /* Tick mode = show last 200 ticks; time mode = last 80 candles */
    return currentTf === "1T" ? 200 : 80;
  }

  var PRICE_AXIS_W = 52;
  var CHART_RIGHT_PAD = 40; /* breathing room between newest candle and price axis */
  var TIME_AXIS_H = 22;
  var PADDING_TOP = 20;
  var PADDING_BOT = TIME_AXIS_H + 10;
  var CANDLE_W_RATIO = 0.62;

  /* ── Digit frequency (last 1000 ticks) ─────────────────────── */
  var digitCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  var digitTotal = 0;

  function recomputeDigits() {
    digitCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < ticks.length; i++) {
      var d = Math.abs(Math.round(ticks[i].price * 100)) % 10;
      digitCounts[d]++;
    }
    digitTotal = ticks.length;
  }

  function renderDigitFreq(lastDigit) {
    var max = Math.max.apply(null, digitCounts) || 1;
    var min = Math.min.apply(null, digitCounts) || 0;
    var avg = digitTotal / 10;

    /* Find indices of max and min digits */
    var maxDigit = -1,
      minDigit = -1;
    for (var i = 0; i < 10; i++) {
      if (digitCounts[i] === max && maxDigit === -1) maxDigit = i;
      if (digitCounts[i] === min && minDigit === -1) minDigit = i;
    }

    /* Responsive sizing based on viewport width */
    var viewport = window.innerWidth;
    var isMobile = viewport < 768;
    var isSmallPhone = viewport < 480;
    var minSize = isSmallPhone ? 14 : isMobile ? 16 : 20;
    var maxSize = isSmallPhone ? 20 : isMobile ? 24 : 30;
    var sizeRange = maxSize - minSize;

    for (var d = 0; d < 10; d++) {
      var circle = document.getElementById("dcircle-" + d);
      var cell = circle && circle.closest(".digit-cell");
      if (!circle || !cell) continue;
      var pct = (digitCounts[d] / max) * 100;
      var size = minSize + (pct / 100) * sizeRange;
      circle.style.width = size + "px";
      circle.style.height = size + "px";
      var pctLabel = circle.querySelector(".digit-pct");
      if (pctLabel) {
        pctLabel.textContent =
          digitTotal > 0
            ? ((digitCounts[d] / digitTotal) * 100).toFixed(1) + "%"
            : "—";
      }
      cell.classList.toggle("hot", digitCounts[d] > avg * 1.3);
      cell.classList.toggle("cold", digitCounts[d] < avg * 0.6);
      cell.classList.toggle("active-digit", d === lastDigit);
      cell.classList.toggle("highest-freq", d === maxDigit);
      cell.classList.toggle("lowest-freq", d === minDigit);
    }
  }

  /* ── Color helpers ─────────────────────────────────────────── */
  function cssVar(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }
  function getColors() {
    var isDark =
      document.documentElement.getAttribute("data-theme") !== "light";
    return {
      bg: isDark ? "#000000" : "#F8F9FA",
      grid: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)",
      dot: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
      green: cssVar("--color-green") || "#00E5A0",
      red: cssVar("--color-red") || "#FF4560",
      text: cssVar("--text-dim") || "#6B7280",
    };
  }

  function parsePrice(value) {
    var p = parseFloat(value);
    return Number.isFinite(p) && p > 0 ? p : null;
  }

  /* ── Tick → candles aggregation ────────────────────────────── */
  function rebuildCandles() {
    candles = [];
    if (!ticks.length) return;

    if (currentTf === "1T") {
      /* Tick mode: each tick is a tiny candle (open=prev close, close=tick) */
      var prev = ticks[0].price;
      for (var i = 0; i < ticks.length; i++) {
        var p = ticks[i].price;
        candles.push({
          open: prev,
          close: p,
          high: Math.max(prev, p),
          low: Math.min(prev, p),
          time: ticks[i].time,
        });
        prev = p;
      }
      return;
    }

    /* Time-bucket mode: group ticks by floor(time / bucket) */
    var bucketMs = TF_SECONDS[currentTf] * 1000;
    if (!bucketMs) return;
    var cur = null;
    for (var j = 0; j < ticks.length; j++) {
      var t = ticks[j];
      var bStart = Math.floor(t.time / bucketMs) * bucketMs;
      if (!cur || cur.time !== bStart) {
        if (cur) candles.push(cur);
        cur = {
          open: t.price,
          close: t.price,
          high: t.price,
          low: t.price,
          time: bStart,
        };
      } else {
        cur.close = t.price;
        if (t.price > cur.high) cur.high = t.price;
        if (t.price < cur.low) cur.low = t.price;
      }
    }
    if (cur) candles.push(cur);
  }

  /* Append a single tick (live or historical) to the rolling buffer */
  function pushTick(price, time) {
    price = parsePrice(price);
    if (price === null) return;
    ticks.push({ price: price, time: time || Date.now() });
    if (ticks.length > MAX_TICKS) ticks.splice(0, ticks.length - MAX_TICKS);
  }

  /* ── Resize canvas ─────────────────────────────────────────── */
  function resizeCanvas() {
    if (!canvas || !wrap) return;
    var dpr = window.devicePixelRatio || 1;
    var rect = wrap.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }

  /* ── Draw ──────────────────────────────────────────────────── */
  function draw() {
    if (!canvas || !ctx) return;
    var dpr = window.devicePixelRatio || 1;
    var W = canvas.width / dpr;
    var H = canvas.height / dpr;
    var colors = getColors();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    var chartW = W - PRICE_AXIS_W;
    var chartH = H - PADDING_TOP - PADDING_BOT;

    var visible = candles.slice(-getVisibleCandles());
    if (visible.length < 2) {
      ctx.fillStyle = colors.text;
      ctx.font = "12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      var msg = chartSymbol
        ? "Waiting for live " + chartSymbol + " data…"
        : "Select an asset";
      ctx.fillText(msg, W / 2, H / 2);
      return;
    }

    var minP = Infinity,
      maxP = -Infinity;
    visible.forEach(function (c) {
      if (!Number.isFinite(c.low) || !Number.isFinite(c.high)) return;
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
    });
    if (!Number.isFinite(minP) || !Number.isFinite(maxP)) return;
    var range = maxP - minP || 1;
    var pad = range * 0.12;
    minP -= pad;
    maxP += pad;
    range = maxP - minP;

    function yPos(price) {
      return PADDING_TOP + chartH - ((price - minP) / range) * chartH;
    }

    drawDotGrid(ctx, chartW, PADDING_TOP, chartH, colors.dot);

    var gridCount = 5;
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 6]);
    for (var gi = 0; gi <= gridCount; gi++) {
      var gY = PADDING_TOP + (gi / gridCount) * chartH;
      ctx.beginPath();
      ctx.moveTo(0, gY);
      ctx.lineTo(chartW, gY);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.fillStyle = colors.text;
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (var li = 0; li <= gridCount; li++) {
      var lP = maxP - (li / gridCount) * range;
      var lY = PADDING_TOP + (li / gridCount) * chartH;
      ctx.fillText(lP.toFixed(2), W - 4, lY);
    }

    var slotAreaW = Math.max(50, chartW - CHART_RIGHT_PAD);
    var slotW = slotAreaW / visible.length;
    if (chartType === "line")
      drawLineChart(ctx, visible, slotW, yPos, chartW, chartH, colors);
    else drawCandleChart(ctx, visible, slotW, yPos, colors);

    /* Current price line */
    var lastClose = visible[visible.length - 1].close;
    var priceY = yPos(lastClose);
    ctx.shadowColor = colors.green;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = colors.green;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(0, priceY);
    ctx.lineTo(chartW, priceY);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);

    /* Time axis */
    ctx.fillStyle = colors.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "10px Inter, sans-serif";
    var timeStep = Math.ceil(visible.length / 6);
    visible.forEach(function (c, i) {
      if (i % timeStep === 0 || i === visible.length - 1) {
        var tx = slotW * i + slotW / 2;
        var d = new Date(c.time);
        var lbl =
          d.getHours().toString().padStart(2, "0") +
          ":" +
          d.getMinutes().toString().padStart(2, "0") +
          ":" +
          d.getSeconds().toString().padStart(2, "0");
        ctx.fillText(lbl, tx, H - TIME_AXIS_H + 4);
      }
    });

    var priceLabel = document.getElementById("live-price-label");
    if (priceLabel) {
      priceLabel.style.top = priceY + "px";
      priceLabel.textContent = lastClose.toFixed(2);
    }

    updatePriceDisplay(lastClose, visible);
  }

  function drawCandleChart(ctx, visible, slotW, yPos, colors) {
    var bodyW = Math.max(slotW * CANDLE_W_RATIO, 2);
    var halfW = bodyW / 2;
    visible.forEach(function (c, i) {
      var x = slotW * i + slotW / 2;
      var isUp = c.close >= c.open;
      var col = isUp ? colors.green : colors.red;
      ctx.shadowColor = col;
      ctx.shadowBlur = 2;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, bodyW * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, yPos(c.high));
      ctx.lineTo(x, yPos(c.low));
      ctx.stroke();
      ctx.shadowBlur = 0;
      var bodyTop = Math.min(yPos(c.open), yPos(c.close));
      var bodyHt = Math.max(Math.abs(yPos(c.open) - yPos(c.close)), 1);
      ctx.fillStyle = col;
      ctx.fillRect(x - halfW, bodyTop, bodyW, bodyHt);
    });
  }

  function drawLineChart(ctx, visible, slotW, yPos, chartW, chartH, colors) {
    if (visible.length < 2) return;
    var grad = ctx.createLinearGradient(0, 0, 0, chartH + 40);
    grad.addColorStop(0, "rgba(0,229,160,0.18)");
    grad.addColorStop(1, "rgba(0,229,160,0)");
    ctx.beginPath();
    visible.forEach(function (c, i) {
      var x = slotW * i + slotW / 2;
      var y = yPos(c.close);
      if (i === 0) ctx.moveTo(x, y);
      else {
        var px = slotW * (i - 1) + slotW / 2;
        var py = yPos(visible[i - 1].close);
        var cpx = (px + x) / 2;
        ctx.bezierCurveTo(cpx, py, cpx, y, x, y);
      }
    });
    var lastX = slotW * (visible.length - 1) + slotW / 2;
    var firstX = slotW / 2;
    var bottom = yPos(0) + 999;
    ctx.lineTo(lastX, bottom);
    ctx.lineTo(firstX, bottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    visible.forEach(function (c, i) {
      var x = slotW * i + slotW / 2;
      var y = yPos(c.close);
      if (i === 0) ctx.moveTo(x, y);
      else {
        var px = slotW * (i - 1) + slotW / 2;
        var py = yPos(visible[i - 1].close);
        var cpx = (px + x) / 2;
        ctx.bezierCurveTo(cpx, py, cpx, y, x, y);
      }
    });
    ctx.strokeStyle = colors.green;
    ctx.lineWidth = 2;
    ctx.shadowColor = colors.green;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    var lx = slotW * (visible.length - 1) + slotW / 2;
    var ly = yPos(visible[visible.length - 1].close);
    ctx.beginPath();
    ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = colors.green;
    ctx.shadowColor = colors.green;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawDotGrid(ctx, w, top, h, color) {
    var step = 28;
    ctx.fillStyle = color;
    for (var x = step; x < w; x += step) {
      for (var y = top + step; y < top + h; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function updatePriceDisplay(price, cdls) {
    var el = document.getElementById("current-price");
    if (el) el.textContent = price.toFixed(2);
    var prev = cdls.length > 1 ? cdls[cdls.length - 2].close : price;
    var diff = price - prev;
    var pct = ((diff / prev) * 100).toFixed(3);
    var chEl = document.getElementById("price-change");
    if (chEl) {
      chEl.textContent =
        (diff >= 0 ? "+" : "") + diff.toFixed(2) + " (" + pct + "%)";
      chEl.className = "price-change " + (diff >= 0 ? "up" : "down");
    }
  }

  /* ── Chart type controls ───────────────────────────────────── */
  function initChartTypeControls() {
    var btnCandle = document.getElementById("btn-chart-candle");
    var btnLine = document.getElementById("btn-chart-line");
    if (!btnCandle || !btnLine) return;
    function setType(type) {
      chartType = type;
      btnCandle.classList.toggle("active", type === "candle");
      btnLine.classList.toggle("active", type === "line");
      draw();
    }
    btnCandle.addEventListener("click", function () {
      setType("candle");
    });
    btnLine.addEventListener("click", function () {
      setType("line");
    });
  }

  /* ── Timeframe controls (functional) ───────────────────────── */
  function initTimeframeControls() {
    var group = document.getElementById("chart-tf-group");
    if (!group) return;
    group.addEventListener("click", function (e) {
      var btn = e.target.closest(".chart-tf-btn");
      if (!btn) return;
      var tf = btn.dataset.tf;
      if (!tf || !(tf in TF_SECONDS) || tf === currentTf) return;
      currentTf = tf;
      group.querySelectorAll(".chart-tf-btn").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      rebuildCandles();
      draw();
    });
  }

  /* ── Load real history from Deriv (1000 ticks) ─────────────── */
  function loadHistory(symbol, myToken) {
    if (!window.DerivWS || !window.DerivWS.getHistory) return;

    /* Wait for the WS to actually be open before requesting history,
       otherwise the chart starts empty and only fills tick-by-tick. */
    waitForWsConnected(function () {
      if (myToken !== loadToken || symbol !== chartSymbol) return;
      window.DerivWS.getHistory(symbol, MAX_TICKS)
        .then(function (prices) {
          if (myToken !== loadToken || symbol !== chartSymbol) return;
          if (!prices || !prices.length) return;
          /* Replace whatever ticks may have arrived during the wait */
          ticks = [];
          for (var i = 0; i < prices.length; i++) {
            pushTick(prices[i].price, prices[i].time);
          }
          recomputeDigits();
          rebuildCandles();
          draw();
          renderDigitFreq();
        })
        .catch(function () {
          /* live ticks may still arrive */
        });
    });
  }

  function waitForWsConnected(cb) {
    var s =
      window.DerivWS && window.DerivWS.getState && window.DerivWS.getState();
    if (s && s.connected) {
      cb();
      return;
    }
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var st =
        window.DerivWS && window.DerivWS.getState && window.DerivWS.getState();
      if (st && st.connected) {
        clearInterval(iv);
        cb();
      } else if (tries > 80) {
        clearInterval(iv);
      }
    }, 250);
  }

  /* ── Public API: Get the least frequent digit (for Match/Differ defaults) ── */
  window.getLowestFrequencyDigit = function () {
    if (digitTotal === 0) return 0; /* fallback if no data */
    var minCount = Math.min.apply(null, digitCounts);
    for (var i = 0; i < 10; i++) {
      if (digitCounts[i] === minCount) {
        return i; /* return the first digit with the lowest frequency */
      }
    }
    return 0; /* fallback */
  };

  /* ── Public init ───────────────────────────────────────────── */
  window.initChart = function (symbol) {
    canvas = document.getElementById("price-chart");
    wrap = canvas ? canvas.parentElement : null;
    if (!canvas || !wrap) return;
    ctx = canvas.getContext("2d");

    chartSymbol = symbol || null;
    loadToken++;
    var myToken = loadToken;

    /* CRITICAL: reset all state on symbol change */
    ticks = [];
    candles = [];
    digitCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    digitTotal = 0;

    resizeCanvas();
    draw(); /* renders waiting state */
    renderDigitFreq();

    if (chartSymbol) loadHistory(chartSymbol, myToken);
  };

  /* Called by deriv-ws.js / main.js when a real tick arrives */
  window._onDerivTick = function (tick) {
    if (!tick || typeof tick !== "object") return;
    if (tick.quote === undefined || tick.quote === null) return;
    if (!chartSymbol || tick.symbol !== chartSymbol) return;

    var price = parsePrice(tick.quote);
    if (price === null) return;

    var time = tick.epoch ? tick.epoch * 1000 : Date.now();
    pushTick(price, time);

    /* Update digit counts incrementally */
    var d = Math.abs(Math.round(price * 100)) % 10;
    if (digitTotal < ticks.length) {
      /* Just appended; if we trimmed the oldest, fully recompute (cheap at ≤1000) */
      if (ticks.length === MAX_TICKS) recomputeDigits();
      else {
        digitCounts[d]++;
        digitTotal++;
      }
    } else {
      recomputeDigits();
    }

    rebuildCandles();
    draw();
    renderDigitFreq(d);
  };

  /* ── DOM ready ─────────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", function () {
    window.initChart("1HZ100V");
    initChartTypeControls();
    initTimeframeControls();

    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resizeCanvas();
        draw();
      }, 120);
    });

    document.addEventListener("themeChanged", function () {
      draw();
    });
  });

  /* ── Win highlight: emphasize resolving digit when a trade wins ── */
  document.addEventListener("tradeResolved", function (e) {
    if (!e || !e.detail) return;
    var d = e.detail.digit;
    if (typeof d !== "number" || d < 0 || d > 9) return;
    var cell = document.querySelector('.digit-cell[data-d="' + d + '"]');
    if (!cell) return;
    var cls = e.detail.won ? "win-pulse" : "loss-pulse";
    /* Restart animation cleanly */
    cell.classList.remove("win-pulse", "loss-pulse");
    void cell.offsetWidth; /* force reflow so the animation can re-trigger */
    cell.classList.add(cls);
    setTimeout(function () {
      cell.classList.remove(cls);
    }, 1600);
  });

  /* assetChanged: markets-panel.js calls initChart directly; safety net here */
  document.addEventListener("assetChanged", function (e) {
    if (!e || !e.detail || !e.detail.symbol) return;
    if (chartSymbol === e.detail.symbol) return;
    if (window.initChart) window.initChart(e.detail.symbol);
  });
})();
