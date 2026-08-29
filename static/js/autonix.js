/* ═══════════════════════════════════════════
   Autonix Page — Interactive Scripts
   ═══════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── Shooting stars effect ─────────────────────── */
  function initShootingStars() {
    var canvas = document.getElementById("shootingStarsCanvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    var stars = [];
    function Star() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height * 0.5;
      this.vx = 2 + Math.random() * 3;
      this.vy = 1 + Math.random() * 2;
      this.opacity = Math.random() * 0.5 + 0.5;
      this.size = Math.random() * 1.5;
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(0, 229, 160, 0.6)";

      for (var i = stars.length - 1; i >= 0; i--) {
        var star = stars[i];
        star.x += star.vx;
        star.y += star.vy;
        ctx.globalAlpha = star.opacity;
        ctx.fillRect(star.x, star.y, star.size, star.size);

        if (star.x > canvas.width || star.y > canvas.height) {
          stars.splice(i, 1);
        }
      }

      if (Math.random() < 0.1 && stars.length < 50) {
        stars.push(new Star());
      }

      requestAnimationFrame(animate);
    }

    animate();
    window.addEventListener("resize", function () {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });
  }

  /* ── Falling stairs effect (Enhanced) ─────────────────────── */
  function initFallingStairs() {
    var canvas = document.getElementById("fallingStairsCanvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    var stairs = [];
    var lastSpawnTime = 0;
    var spawnInterval = 60;

    function Stair() {
      this.x = Math.random() * canvas.width;
      this.y = -30;
      this.baseY = this.y;
      this.width = 25 + Math.random() * 50;
      this.height = 1.5 + Math.random() * 2;
      this.vy = 0.8 + Math.random() * 1.6;
      this.baseOpacity = Math.random() * 0.15 + 0.08;
      this.opacity = 0;
      this.rotation = (Math.random() - 0.5) * 0.4;
      this.rotationSpeed = (Math.random() - 0.5) * 0.02;
      this.age = 0;
      this.maxAge = 1.2 + Math.random() * 1.8;
      this.scale = 0.8 + Math.random() * 0.4;
      
      /* Color variation */
      var colors = [
        { r: 0, g: 229, b: 160 },   /* Green */
        { r: 91, g: 157, b: 255 },  /* Blue */
        { r: 187, g: 134, b: 252 }  /* Purple */
      ];
      this.color = colors[Math.floor(Math.random() * colors.length)];
    }

    function drawStairStep(x, y, width, height, opacity, color, scale) {
      var innerWidth = Math.max(2, width * 0.6);
      
      ctx.globalAlpha = opacity * 0.5;
      ctx.strokeStyle = "rgba(" + color.r + "," + color.g + "," + color.b + ", 1)";
      ctx.lineWidth = height * 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      
      ctx.beginPath();
      ctx.moveTo(-width / 2, -height);
      ctx.lineTo(-innerWidth / 2, 0);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(-innerWidth / 2, 0);
      ctx.lineTo(innerWidth / 2, 0);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(innerWidth / 2, 0);
      ctx.lineTo(width / 2, -height);
      ctx.stroke();
      
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = "rgba(" + color.r + "," + color.g + "," + color.b + ", 1)";
      ctx.lineWidth = height;
      
      ctx.beginPath();
      ctx.moveTo(-width / 2, 0);
      ctx.lineTo(width / 2, 0);
      ctx.stroke();
      
      /* Glow effect */
      ctx.globalAlpha = opacity * 0.3;
      ctx.shadowColor = "rgba(" + color.r + "," + color.g + "," + color.b + ", 0.8)";
      ctx.shadowBlur = 8 * scale;
      ctx.beginPath();
      ctx.moveTo(-width / 2, 0);
      ctx.lineTo(width / 2, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;

      /* Update and draw stairs */
      for (var i = stairs.length - 1; i >= 0; i--) {
        var stair = stairs[i];
        stair.age += 0.016;
        stair.y += stair.vy;
        stair.rotation += stair.rotationSpeed;
        
        /* Smooth opacity curve: fade in, hold, fade out */
        var fadeInDuration = 0.3;
        var fadeOutStart = stair.maxAge - 0.4;
        
        if (stair.age < fadeInDuration) {
          stair.opacity = stair.baseOpacity * (stair.age / fadeInDuration);
        } else if (stair.age > fadeOutStart) {
          var fadeProgress = (stair.age - fadeOutStart) / (stair.maxAge - fadeOutStart);
          stair.opacity = stair.baseOpacity * (1 - fadeProgress);
        } else {
          stair.opacity = stair.baseOpacity;
        }

        ctx.save();
        ctx.translate(stair.x, stair.y);
        ctx.rotate(stair.rotation);
        ctx.scale(stair.scale, stair.scale);
        
        drawStairStep(0, 0, stair.width, stair.height, stair.opacity, stair.color, stair.scale);
        
        ctx.restore();

        /* Remove when age exceeds max */
        if (stair.age > stair.maxAge || stair.y > canvas.height + 50) {
          stairs.splice(i, 1);
        }
      }

      /* Spawn new stairs at controlled rate */
      var now = performance.now();
      if (now - lastSpawnTime > spawnInterval && stairs.length < 40) {
        stairs.push(new Stair());
        lastSpawnTime = now;
      }

      requestAnimationFrame(animate);
    }

    animate();
    window.addEventListener("resize", function () {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });
  }

  /* ── Glow overlay ────────────────────────────────── */
  function initGlowOverlay() {
    var overlay = document.getElementById("glowOverlay");
    if (!overlay) return;
    var width = window.innerWidth;
    var height = window.innerHeight;

    function updateGlow() {
      var x = Math.sin(Date.now() / 5000) * width * 0.3 + width * 0.5;
      var y = Math.cos(Date.now() / 7000) * height * 0.3 + height * 0.3;
      overlay.style.background =
        "radial-gradient(circle at " +
        x +
        "px " +
        y +
        "px, rgba(0, 229, 160, 0.1) 0%, transparent 50%)";
      requestAnimationFrame(updateGlow);
    }
    updateGlow();
  }

  /* ── Market data (live) ─────────────────────────── */
  function fmtPrice(v) {
    if (v >= 1000)
      return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (v >= 1) return v.toFixed(4);
    return v.toFixed(6);
  }

  function renderMarketRows(items) {
    var tbody = document.getElementById("marketItems");
    var mobile = document.getElementById("marketItemsMobile");
    if (!tbody && !mobile) return;
    if (!items || !items.length) {
      if (tbody)
        tbody.innerHTML =
          '<tr><td colspan="5" style="text-align:center;padding:16px;opacity:.7">No data available</td></tr>';
      if (mobile)
        mobile.innerHTML =
          '<div class="market-mobile-card" style="text-align:center;opacity:.7">No data available</div>';
      return;
    }
    var rowsHtml = items
      .map(function (r) {
        var dir = r.change >= 0 ? "up" : "down";
        var arrow = r.change >= 0 ? "▲" : "▼";
        return (
          "<tr>" +
          '<td class="pair-cell">' +
          r.pair +
          "</td>" +
          '<td class="num">' +
          fmtPrice(r.price) +
          "</td>" +
          '<td class="num"><span class="change-pill ' +
          dir +
          '">' +
          arrow +
          " " +
          Math.abs(r.change).toFixed(2) +
          "%</span></td>" +
          '<td class="num">' +
          fmtPrice(r.high) +
          "</td>" +
          '<td class="num">' +
          fmtPrice(r.low) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    if (tbody) tbody.innerHTML = rowsHtml;

    var mobileHtml = items
      .map(function (r) {
        var dir = r.change >= 0 ? "up" : "down";
        var arrow = r.change >= 0 ? "▲" : "▼";
        return (
          '<div class="market-mobile-card">' +
          '<div class="mmc-top">' +
          '<span class="mmc-pair">' +
          r.pair +
          "</span>" +
          '<span class="change-pill ' +
          dir +
          '">' +
          arrow +
          " " +
          Math.abs(r.change).toFixed(2) +
          "%</span>" +
          "</div>" +
          '<div class="mmc-price">' +
          fmtPrice(r.price) +
          "</div>" +
          '<div class="mmc-meta">' +
          "<span>H <strong>" +
          fmtPrice(r.high) +
          "</strong></span>" +
          "<span>L <strong>" +
          fmtPrice(r.low) +
          "</strong></span>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");
    if (mobile) mobile.innerHTML = mobileHtml;
  }

  function loadMarket(category) {
    var tbody = document.getElementById("marketItems");
    if (tbody)
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;padding:16px;opacity:.6">Loading…</td></tr>';
    fetch("/market-data/" + category, { credentials: "same-origin" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        renderMarketRows(data.items || []);
      })
      .catch(function () {
        renderMarketRows([]);
      });
  }

  function initMarketTabs() {
    var tabBtns = document.querySelectorAll(".tab-btn");
    if (!tabBtns.length) return;
    tabBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        tabBtns.forEach(function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        loadMarket(btn.getAttribute("data-market"));
      });
    });
    // Initial load
    var active = document.querySelector(".tab-btn.active") || tabBtns[0];
    loadMarket(active.getAttribute("data-market"));
    // Refresh every 60s
    setInterval(function () {
      var cur = document.querySelector(".tab-btn.active");
      if (cur) loadMarket(cur.getAttribute("data-market"));
    }, 60000);
  }

  /* ── Live Market Pulse ───────────────────────────── */
  function renderPulse(items) {
    var ticker = document.getElementById("exchangeTicker");
    if (!ticker || !items || !items.length) return;
    ticker.innerHTML = items
      .map(function (it) {
        var cls = it.direction === "up" ? "price-up" : "price-down";
        var arrow = it.direction === "up" ? "▲" : "▼";
        return (
          '<div class="rate-item">' +
          '<span class="pair">' +
          it.pair +
          "</span>" +
          '<span class="rate">' +
          fmtPrice(it.rate) +
          "</span>" +
          '<span class="change ' +
          cls +
          '">' +
          arrow +
          " " +
          (it.change || 0).toFixed(2) +
          "%</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function loadPulse() {
    fetch("/market-pulse", { credentials: "same-origin" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        renderPulse(data.items || []);
      })
      .catch(function () {});
  }

  function initPulse() {
    if (!document.getElementById("exchangeTicker")) return;
    loadPulse();
    setInterval(loadPulse, 60000);
  }

  /* ── Mobile menu ────────────────────────────────── */
  function initMobileMenu() {
    var toggle = document.getElementById("navbarToggle");
    var menu = document.querySelector(".autonix-navbar .navbar-menu");
    if (!toggle || !menu) return;
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      menu.classList.toggle("is-open");
      toggle.classList.toggle("is-open");
    });
    document.addEventListener("click", function (e) {
      if (!menu.contains(e.target) && e.target !== toggle) {
        menu.classList.remove("is-open");
        toggle.classList.remove("is-open");
      }
    });
    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        menu.classList.remove("is-open");
        toggle.classList.remove("is-open");
      });
    });
  }

  /* ── Smooth scroll animations ────────────────────── */
  function initScrollAnimations() {
    var elementsToAnimate = document.querySelectorAll(
      ".step-card, .feature-card, .bot-showcase-card, .testimonial-card, .metric-card",
    );

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.style.opacity = "1";
            entry.target.style.transform = "translateY(0)";
          }
        });
      },
      { threshold: 0.1 },
    );

    elementsToAnimate.forEach(function (el) {
      el.style.opacity = "0";
      el.style.transform = "translateY(20px)";
      el.style.transition = "all 0.5s ease";
      observer.observe(el);
    });
  }

  /* ── Counter animations ────────────────────────── */
  function initCounterAnimations() {
    var metricValues = document.querySelectorAll(".metric-value");

    function animateCounter(element) {
      var target = parseFloat(element.getAttribute("data-value")) || 0;
      var duration = 2000;
      var start = 0;
      var startTime = Date.now();

      function update() {
        var elapsed = Date.now() - startTime;
        var progress = Math.min(elapsed / duration, 1);
        var current = Math.floor(start + (target - start) * progress);

        if (element.getAttribute("data-value") > 100) {
          element.textContent =
            current.toLocaleString() +
            (element.textContent.includes("%") ? "%" : "");
        } else {
          element.textContent =
            current + (element.textContent.includes("%") ? "%" : "");
        }

        if (progress < 1) {
          requestAnimationFrame(update);
        }
      }

      var observer = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting && element.textContent === "0%") {
          update();
          observer.unobserve(element);
        }
      });

      observer.observe(element);
    }

    metricValues.forEach(function (el) {
      animateCounter(el);
    });
  }

  /* ── FAQ interactions ────────────────────────────── */
  function initFAQ() {
    var faqItems = document.querySelectorAll(".faq-item details");
    faqItems.forEach(function (item) {
      item.addEventListener("toggle", function () {
        var summaryText = item.querySelector("summary").textContent;
        console.log(
          item.open ? "Opened: " + summaryText : "Closed: " + summaryText,
        );
      });
    });
  }

  /* ── Navbar account dropdown (landing page) ────────── */
  function initNavbarAccount() {
    var wrap = document.getElementById("navbar-account-wrap");
    var btn = document.getElementById("navbar-account-btn");
    if (!wrap || !btn) return;

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      wrap.classList.toggle("open");
      btn.setAttribute("aria-expanded", wrap.classList.contains("open"));
    });

    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) {
        wrap.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      }
    });

    var resetBtn = document.getElementById("navbar-reset-demo-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        wrap.classList.remove("open");
        if (!window.DerivWS || !window.DerivWS.isAuthorized()) {
          window.showToast && window.showToast("Connect to Deriv on the trading dashboard to reset balance", "neutral", 4000);
          return;
        }
        var ws = window.DerivWS.getState().ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          window.showToast && window.showToast("WebSocket not ready", "red", 3000);
          return;
        }
        var reqId = Date.now() % 100000;
        var handler = function (evt) {
          var msg;
          try { msg = JSON.parse(evt.data); } catch (ex) { return; }
          if (msg.req_id !== reqId) return;
          ws.removeEventListener("message", handler);
          if (msg.error) {
            window.showToast && window.showToast("Reset failed: " + msg.error.message, "red", 3500);
          } else {
            window.showToast && window.showToast("Demo balance reset to $10,000!", "green", 3000);
          }
        };
        ws.addEventListener("message", handler);
        ws.send(JSON.stringify({ topup_virtual: 1, req_id: reqId }));
      });
    }
  }

  /* ── Initialize everything ────────────────────────── */
  document.addEventListener("DOMContentLoaded", function () {
    initShootingStars();
    initFallingStairs();
    initGlowOverlay();
    initMarketTabs();
    initPulse();
    initMobileMenu();
    initScrollAnimations();
    initCounterAnimations();
    initFAQ();
    initNavbarAccount();

    /* ── Modal handling ────────────────────────────────── */
    var loginModal = document.getElementById("loginModalBox");
    var closeModal = document.getElementById("closeModal");

    if (closeModal && loginModal) {
      closeModal.addEventListener("click", function () {
        loginModal.style.display = "none";
      });

      window.addEventListener("click", function (e) {
        if (e.target === loginModal) {
          loginModal.style.display = "none";
        }
      });
    }

    /* ── CTA button handlers ──────────────────────────── */
    var demoBtn = document.getElementById("demoBtn");
    var demoBtn2 = document.getElementById("demoBtn2");
    var goToTradeBtn = document.getElementById("goToTradeBtn");

    if (goToTradeBtn) {
      goToTradeBtn.addEventListener("click", function (e) {
        if (!this.href || this.href === "#") {
          e.preventDefault();
          window.location.href = "/";
        }
      });
    }
  });

  /* ── Resize handler for canvas ────────────────────── */
  window.addEventListener("resize", function () {
    var shootingStars = document.getElementById("shootingStarsCanvas");
    var fallingStairs = document.getElementById("fallingStairsCanvas");
    if (shootingStars) {
      shootingStars.width = window.innerWidth;
      shootingStars.height = window.innerHeight;
    }
    if (fallingStairs) {
      fallingStairs.width = window.innerWidth;
      fallingStairs.height = window.innerHeight;
    }
  });
})();
