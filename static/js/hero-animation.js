/* ═══════════════════════════════════════════════════════
   Autonix Hero Terminal Animation
   ═══════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── Animated Counter (eased, no overshoot) ── */
  function animateCounter(el, target, duration) {
    var isFloat = String(target).includes(".");
    var decimals = isFloat ? 1 : 0;
    var startTime = null;
    function tick(ts) {
      if (!startTime) startTime = ts;
      var elapsed = ts - startTime;
      var progress = Math.min(elapsed / duration, 1);
      var ease = 1 - Math.pow(1 - progress, 3);
      var cur = target * ease;
      el.textContent = isFloat
        ? cur.toFixed(decimals)
        : Math.round(cur).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = isFloat ? target.toFixed(decimals) : target.toLocaleString();
    }
    requestAnimationFrame(tick);
  }

  function initCounters() {
    document.querySelectorAll(".htrust-num").forEach(function (el) {
      var target = parseFloat(el.dataset.target);
      if (!isNaN(target)) {
        setTimeout(function () {
          animateCounter(el, target, 1800);
        }, 400);
      }
    });
  }

  /* ── Nav active state ── */
  function initNavActive() {
    var links = document.querySelectorAll(".navbar-link");
    var hash = window.location.hash;
    links.forEach(function (a) {
      var href = a.getAttribute("href");
      if (href === "/autonix#hero" && (!hash || hash === "#hero")) {
        a.classList.add("active");
      } else if (hash && href && href.endsWith(hash)) {
        links.forEach(function (l) { l.classList.remove("active"); });
        a.classList.add("active");
      }
    });
    window.addEventListener("hashchange", function () {
      var h = window.location.hash;
      links.forEach(function (a) {
        a.classList.remove("active");
        if (a.getAttribute("href") && a.getAttribute("href").endsWith(h)) {
          a.classList.add("active");
        }
      });
    });
    // Scroll spy
    var sections = document.querySelectorAll("section[id], div[id]");
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          links.forEach(function (a) {
            var href = a.getAttribute("href") || "";
            a.classList.toggle("active", href.endsWith("#" + e.target.id));
          });
        }
      });
    }, { threshold: 0.35 });
    sections.forEach(function (s) { observer.observe(s); });
  }

  /* ── Hero Chart Canvas ── */
  var CHART_POINTS = 60;
  var chartData = [];
  var basePrice = 1247.83;
  var animFrame;

  function seedChart() {
    chartData = [];
    var price = basePrice;
    for (var i = 0; i < CHART_POINTS; i++) {
      price += (Math.random() - 0.48) * 1.4;
      chartData.push(price);
    }
  }

  function drawChart(canvas) {
    var ctx = canvas.getContext("2d");
    var W = canvas.width;
    var H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (chartData.length < 2) return;

    var min = Math.min.apply(null, chartData) - 0.5;
    var max = Math.max.apply(null, chartData) + 0.5;
    var range = max - min;
    var padT = 6, padB = 6;
    var drawH = H - padT - padB;

    function xOf(i) { return (i / (CHART_POINTS - 1)) * W; }
    function yOf(v) { return padT + drawH * (1 - (v - min) / range); }

    /* Grid lines */
    ctx.strokeStyle = "rgba(255,255,255,.05)";
    ctx.lineWidth = 1;
    for (var gi = 1; gi <= 3; gi++) {
      var gy = padT + (drawH / 4) * gi;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    /* Line */
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(chartData[0]));
    for (var i = 1; i < chartData.length; i++) {
      ctx.lineTo(xOf(i), yOf(chartData[i]));
    }
    ctx.strokeStyle = "#00E5A0";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    /* Fill gradient */
    var grad = ctx.createLinearGradient(0, padT, 0, H);
    grad.addColorStop(0, "rgba(0,229,160,.18)");
    grad.addColorStop(1, "rgba(0,229,160,.0)");
    ctx.lineTo(xOf(chartData.length - 1), H);
    ctx.lineTo(xOf(0), H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    /* Cursor dot */
    var last = chartData[chartData.length - 1];
    ctx.beginPath();
    ctx.arc(xOf(chartData.length - 1), yOf(last), 4, 0, Math.PI * 2);
    ctx.fillStyle = "#00E5A0";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(xOf(chartData.length - 1), yOf(last), 8, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,229,160,.25)";
    ctx.fill();

    /* Y-axis labels */
    var steps = [0, 1, 2, 3];
    var ids = ["hy1", "hy2", "hy3", "hy4"];
    steps.forEach(function (s, idx) {
      var el = document.getElementById(ids[idx]);
      if (el) {
        var v = min + (range / 3) * s;
        el.textContent = v.toFixed(2);
      }
    });
  }

  function resizeCanvas(canvas) {
    var wrap = canvas.parentElement;
    canvas.width = wrap.clientWidth - 36;
    canvas.height = wrap.clientHeight - 12;
  }

  function tickChart(canvas) {
    var last = chartData[chartData.length - 1];
    var newVal = last + (Math.random() - 0.47) * 1.2;
    chartData.shift();
    chartData.push(newVal);
    drawChart(canvas);

    /* Update price display */
    var priceEl = document.getElementById("heroPrice");
    var changeEl = document.getElementById("heroChange");
    if (priceEl) {
      priceEl.textContent = newVal.toFixed(2);
    }
    if (changeEl) {
      var delta = newVal - basePrice;
      var pct = (delta / basePrice) * 100;
      changeEl.textContent = (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
      changeEl.className = "hterm-change " + (pct >= 0 ? "green" : "red");
    }
  }

  /* ── Digit bars in hero terminal ── */
  var heroFreqs = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];

  function initHeroDigitBars() {
    var container = document.getElementById("heroDigitBars");
    if (!container) return;
    container.innerHTML = "";
    for (var d = 0; d <= 9; d++) {
      var wrap = document.createElement("div");
      wrap.className = "hterm-digit-bar-wrap";
      wrap.id = "hdb-" + d;
      var bar = document.createElement("div");
      bar.className = "hterm-digit-bar";
      bar.id = "hdb-bar-" + d;
      var num = document.createElement("span");
      num.className = "hterm-digit-num";
      num.textContent = d;
      wrap.appendChild(bar);
      wrap.appendChild(num);
      container.appendChild(wrap);
    }
    renderHeroDigitBars();
  }

  function renderHeroDigitBars() {
    var total = heroFreqs.reduce(function (a, b) { return a + b; }, 0);
    var maxF = Math.max.apply(null, heroFreqs);
    for (var d = 0; d <= 9; d++) {
      var bar = document.getElementById("hdb-bar-" + d);
      if (!bar) continue;
      var pct = total > 0 ? (heroFreqs[d] / maxF) * 100 : 10;
      bar.style.height = Math.max(pct * 0.36, 3) + "px";
      if (heroFreqs[d] === maxF) {
        bar.className = "hterm-digit-bar peak";
      } else if (heroFreqs[d] > 14) {
        bar.className = "hterm-digit-bar high";
      } else {
        bar.className = "hterm-digit-bar low";
      }
    }
  }

  function tickHeroDigits() {
    var d = Math.floor(Math.random() * 10);
    heroFreqs[d]++;
    renderHeroDigitBars();
  }

  /* ── Trade row cycling ── */
  var tradeTemplates = [
    { type: "over", label: "OVER 1", cls: "over", stakes: ["$50", "$100", "$200"], wins: true },
    { type: "under", label: "UNDER 8", cls: "under", stakes: ["$50", "$100", "$150"], wins: true },
    { type: "differ", label: "DIFFER 3", cls: "differ", stakes: ["$100", "$200"], wins: false },
    { type: "over", label: "OVER 4", cls: "over", stakes: ["$75", "$150"], wins: true },
    { type: "under", label: "UNDER 5", cls: "under", stakes: ["$100"], wins: true },
    { type: "differ", label: "DIFFER 7", cls: "differ", stakes: ["$50", "$100"], wins: false },
  ];
  var tradeIdx = 0;
  var rowIds = ["heroTradeRow1", "heroTradeRow2", "heroTradeRow3"];
  var typeIds = ["heroTR1", "heroTR2", "heroTR3"];
  var activeRow = 0;

  function cycleTrade() {
    var t = tradeTemplates[tradeIdx % tradeTemplates.length];
    tradeIdx++;
    var rowEl = document.getElementById(rowIds[activeRow]);
    var resEl = document.getElementById(typeIds[activeRow]);
    if (!rowEl || !resEl) return;

    var stake = t.stakes[Math.floor(Math.random() * t.stakes.length)];
    var isWin = Math.random() > 0.28;
    var stakeNum = parseInt(stake.replace("$", ""));
    var profit = (stakeNum * (0.8 + Math.random() * 0.2)).toFixed(2);
    var loss = stakeNum.toFixed(2);

    /* Update type pill */
    var typeEl = rowEl.querySelector(".hterm-trade-type");
    if (typeEl) {
      typeEl.className = "hterm-trade-type " + t.cls;
      typeEl.textContent = t.label;
    }
    var stakeEl = rowEl.querySelector(".hterm-trade-stake");
    if (stakeEl) stakeEl.textContent = stake;

    resEl.className = "hterm-trade-result " + (isWin ? "win" : "loss");
    resEl.textContent = (isWin ? "+" : "-") + "$" + (isWin ? profit : loss);

    /* Flash effect */
    rowEl.classList.add(isWin ? "flash-win" : "flash-loss");
    setTimeout(function () {
      rowEl.classList.remove("flash-win", "flash-loss");
    }, 600);

    activeRow = (activeRow + 1) % 3;
  }

  /* ── Live Trades Counter (continuously updating random number 2000-5000) ── */
  function initLiveTradesCounter() {
    var counterEl = document.getElementById("liveTradesCounter");
    if (!counterEl) return;

    /* Generate random number between 2000 and 5000 */
    function generateRandomTrades() {
      return Math.floor(Math.random() * 3001) + 2000; // 2000 to 5000
    }

    /* Update the counter with a new random value every 2 seconds */
    function updateCounter() {
      var randomValue = generateRandomTrades();
      counterEl.textContent = randomValue.toLocaleString();
    }

    /* Initial update */
    updateCounter();

    /* Update every 2 seconds */
    setInterval(updateCounter, 2000);
  }

  /* ── Init everything ── */
  function init() {
    initCounters();
    initNavActive();

    var canvas = document.getElementById("heroChartCanvas");
    if (!canvas) return;

    seedChart();
    resizeCanvas(canvas);
    drawChart(canvas);
    initHeroDigitBars();
    initLiveTradesCounter();

    /* Chart tick every 1.2s */
    setInterval(function () { tickChart(canvas); }, 1200);
    /* Digit tick every 800ms */
    setInterval(tickHeroDigits, 800);
    /* Trade cycle every 3s */
    setInterval(cycleTrade, 3000);

    /* Resize */
    window.addEventListener("resize", function () {
      resizeCanvas(canvas);
      drawChart(canvas);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
