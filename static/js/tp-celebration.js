/* ═══════════════════════════════════════════════════════════════════
   tp-celebration.js — Take Profit celebration modal + confetti
   ES5 IIFE · no external deps · lightweight canvas confetti burst
   Exposes: window.showTPCelebration(profit [number])
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── Config ──────────────────────────────────────────────────────── */
  var AUTO_DISMISS_MS = 7000;
  var CONFETTI_COUNT  = 140;
  var CONFETTI_COLORS = [
    "#00E5A0", "#00c47a", "#BB86FC", "#f59e0b",
    "#38bdf8", "#f43f5e", "#facc15", "#4ade80"
  ];

  /* ── Confetti engine ──────────────────────────────────────────────── */
  function makeParticle(cx, cy) {
    var angle  = Math.random() * Math.PI * 2;
    var speed  = 3 + Math.random() * 7;
    return {
      x:    cx,
      y:    cy,
      vx:   Math.cos(angle) * speed,
      vy:   Math.sin(angle) * speed - (Math.random() * 4 + 2),
      size: 5 + Math.random() * 7,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rot:  Math.random() * 360,
      rspd: (Math.random() - 0.5) * 8,
      life: 1,
      decay: 0.012 + Math.random() * 0.01,
      shape: Math.random() > 0.5 ? "rect" : "circle"
    };
  }

  function runConfetti(canvas) {
    var ctx = canvas.getContext("2d");
    var W = canvas.width;
    var H = canvas.height;
    var cx = W / 2;
    var cy = H * 0.38;
    var particles = [];
    for (var i = 0; i < CONFETTI_COUNT; i++) {
      particles.push(makeParticle(cx, cy));
    }
    var raf;
    function tick() {
      ctx.clearRect(0, 0, W, H);
      var alive = false;
      for (var j = 0; j < particles.length; j++) {
        var p = particles[j];
        if (p.life <= 0) continue;
        alive = true;
        p.x  += p.vx;
        p.y  += p.vy;
        p.vy += 0.22;          /* gravity */
        p.vx *= 0.98;          /* drag */
        p.rot += p.rspd;
        p.life -= p.decay;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * Math.PI / 180);
        ctx.fillStyle = p.color;
        if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (alive) { raf = requestAnimationFrame(tick); }
    }
    tick();
    return function () {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, W, H);
    };
  }

  /* ── Modal builder ────────────────────────────────────────────────── */
  function buildModal(profit) {
    var overlay = document.createElement("div");
    overlay.id = "tp-celebration-overlay";
    overlay.className = "tpc-overlay";

    var canvas = document.createElement("canvas");
    canvas.className = "tpc-canvas";
    canvas.width  = window.innerWidth  || 800;
    canvas.height = window.innerHeight || 600;
    overlay.appendChild(canvas);

    var profitStr = (profit >= 0 ? "+" : "") + "$" +
      (Math.abs(profit)).toFixed(2);

    overlay.innerHTML += [
      '<div class="tpc-modal" role="dialog" aria-modal="true" aria-label="Take Profit Reached">',
        '<button class="tpc-close" id="tpc-close-btn" aria-label="Close">&#10005;</button>',
        '<div class="tpc-trophy-wrap">',
          '<div class="tpc-trophy-ring tpc-ring1"></div>',
          '<div class="tpc-trophy-ring tpc-ring2"></div>',
          '<div class="tpc-trophy-icon">&#127942;</div>',
        '</div>',
        '<div class="tpc-badge">Take Profit Reached</div>',
        '<h2 class="tpc-title">&#127881; Congratulations!</h2>',
        '<p class="tpc-sub">Your profit target has been achieved.<br>The bot has stopped automatically.</p>',
        '<div class="tpc-profit-box">',
          '<span class="tpc-profit-label">Session Profit</span>',
          '<span class="tpc-profit-value">' + profitStr + '</span>',
        '</div>',
        '<div class="tpc-progress-wrap"><div class="tpc-progress-bar" id="tpc-progress"></div></div>',
        '<p class="tpc-dismiss-hint">Dismissing automatically&hellip;</p>',
        '<button class="tpc-btn-close" id="tpc-btn-close">Continue Trading</button>',
      '</div>'
    ].join("");

    return overlay;
  }

  /* ── Main show function ───────────────────────────────────────────── */
  window.showTPCelebration = function (profit) {
    /* Remove any existing instance */
    var existing = document.getElementById("tp-celebration-overlay");
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    var overlay = buildModal(profit != null ? profit : 0);
    document.body.appendChild(overlay);

    /* Re-grab canvas (innerHTML += clones the node but not dynamic el) */
    var canvas  = overlay.querySelector(".tpc-canvas");
    var modal   = overlay.querySelector(".tpc-modal");
    var bar     = overlay.querySelector("#tpc-progress");
    var stopConfetti;

    /* Start confetti after modal entrance animation settles */
    requestAnimationFrame(function () {
      overlay.classList.add("tpc-visible");
      setTimeout(function () {
        if (canvas) { stopConfetti = runConfetti(canvas); }
      }, 300);
    });

    /* Progress bar drain */
    var start = null;
    var drain  = AUTO_DISMISS_MS;
    function animateBar(ts) {
      if (!start) start = ts;
      var elapsed = ts - start;
      var pct = Math.max(0, 100 - (elapsed / drain) * 100);
      if (bar) bar.style.width = pct + "%";
      if (elapsed < drain) {
        requestAnimationFrame(animateBar);
      }
    }
    requestAnimationFrame(animateBar);

    /* Auto-dismiss */
    var autoDismiss = setTimeout(function () { dismiss(); }, AUTO_DISMISS_MS);

    function dismiss() {
      clearTimeout(autoDismiss);
      if (typeof stopConfetti === "function") stopConfetti();
      overlay.classList.remove("tpc-visible");
      overlay.classList.add("tpc-leaving");
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 500);
    }

    /* Close buttons */
    var closeBtn   = overlay.querySelector("#tpc-close-btn");
    var continueBtn = overlay.querySelector("#tpc-btn-close");
    if (closeBtn)   closeBtn.addEventListener("click",   dismiss);
    if (continueBtn) continueBtn.addEventListener("click", dismiss);

    /* Click outside modal */
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) dismiss();
    });
  };

})();
