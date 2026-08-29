/* ═══════════════════════════════════════════
   Autonix Trader — Main App Init
   ═══════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── Hard redirect helper (no-cache) ─────── */
  function hardRedirect(url) {
    if (window.DerivWS) {
      try {
        window.DerivWS.disconnect();
      } catch (e) {}
    }
    window._realTickActive = false;
    var sep = url.indexOf("?") === -1 ? "?" : "&";
    window.location.replace(url + sep + "_t=" + Date.now());
  }

  /* ── Toast utility ─────────────────────── */
  var _AudioCtx = window.AudioContext || window.webkitAudioContext;
  var _audioCtx = null;
  var _lastSoundAt = 0;

  function soundsEnabled() {
    try {
      return localStorage.getItem("at_sounds") !== "0";
    } catch (e) {
      return true;
    }
  }

  function getAudioCtx() {
    if (!_AudioCtx || !soundsEnabled()) return null;
    if (!_audioCtx) {
      try {
        _audioCtx = new _AudioCtx();
      } catch (e) {
        return null;
      }
    }
    if (_audioCtx.state === "suspended") {
      try {
        _audioCtx.resume();
      } catch (e) {}
    }
    return _audioCtx;
  }

  function playTone(kind) {
    var now = Date.now();
    if (now - _lastSoundAt < 140) return;
    _lastSoundAt = now;
    var ctx = getAudioCtx();
    if (!ctx) return;
    try {
      var t = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (kind === "win" || kind === "success") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, t);
        osc.frequency.setValueAtTime(659.25, t + 0.08);
        osc.frequency.setValueAtTime(783.99, t + 0.18);
        gain.gain.setValueAtTime(0.0, t);
        gain.gain.linearRampToValueAtTime(0.24, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.62);
        osc.start(t);
        osc.stop(t + 0.62);
        return;
      }
      if (kind === "loss" || kind === "error") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(330, t);
        osc.frequency.linearRampToValueAtTime(200, t + 0.4);
        gain.gain.setValueAtTime(0.0, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        osc.start(t);
        osc.stop(t + 0.55);
        return;
      }
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.setValueAtTime(554.37, t + 0.08);
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    } catch (e) {}
  }

  function inferSoundKind(msg, type) {
    var text = String(msg || "").toLowerCase();
    if (text.indexOf("win") !== -1 || text.indexOf("profit") !== -1) return "win";
    if (text.indexOf("loss") !== -1 || text.indexOf("lost") !== -1 || text.indexOf("stop loss") !== -1) return "loss";
    if (type === "red" || type === "error" || text.indexOf("error") !== -1 || text.indexOf("failed") !== -1 || text.indexOf("not connected") !== -1) return "error";
    if (type === "green" || type === "success" || text.indexOf("opened") !== -1 || text.indexOf("placed") !== -1 || text.indexOf("switched") !== -1 || text.indexOf("connected") !== -1) return "success";
    if (text.indexOf("trade") !== -1 || text.indexOf("bot") !== -1 || text.indexOf("alert") !== -1) return "alert";
    return null;
  }

  window.AutonixSounds = {
    play: playTone,
    enabled: soundsEnabled,
  };

  document.addEventListener("click", function unlockAudio() {
    getAudioCtx();
    document.removeEventListener("click", unlockAudio);
  }, { once: true });

  window.showToast = function (msg, type, duration) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "toast show" + (type ? " " + type : "");
    var soundKind = inferSoundKind(msg, type);
    if (soundKind) playTone(soundKind);
    clearTimeout(el._timer);
    el._timer = setTimeout(function () {
      el.className = "toast";
    }, duration || 2800);
  };

  /* ── Device detection utility ─────────────────────── */
  window.isDesktop = function () {
    return window.innerWidth >= 768 && !("ontouchstart" in window);
  };

  /* ── Deriv OAuth callback (server-side primary; client-side fallback) ── */
  function handleDerivCallback() {
    var params = new URLSearchParams(window.location.search);
    if (!params.has("acct1")) return;

    /* Server-side redirect already handles this on page load.
       If we still have query params here it means the redirect didn't fire
       (e.g. already authenticated). Just clean the URL. */
    window.history.replaceState({}, "", "/");
  }

  /* ── Initialize Deriv WebSocket connection ─────────────────── */
  var currentTickSymbol = null;

  function initDerivWS() {
    var sd = window.SESSION_DATA;
    var appId = window.DERIV_APP_ID;
    var token =
      sd && sd.isAuthenticated && sd.activeAccount
        ? sd.activeAccount.token || null
        : null;
    var account =
      sd && sd.isAuthenticated && sd.activeAccount
        ? sd.activeAccount.account
        : null;
    var currency =
      sd && sd.isAuthenticated && sd.activeAccount
        ? sd.activeAccount.currency || null
        : null;

    /* New OIDC accounts have no API token (blanked server-side) but a wsUrl.
       The wsUrl stored at login time can expire quickly — fetch a fresh one
       just before opening the WebSocket so it is guaranteed valid. */
    var needsFreshOtp = !!(
      sd &&
      sd.isAuthenticated &&
      sd.activeAccount &&
      !token &&
      sd.activeAccount.wsUrl
    );

    function doConnect(wsUrl) {
      window.DerivWS.connect(
        appId,
        token,
        account,
        function (bal, cur) {
          var balEl = document.querySelector(".account-balance");
          if (balEl) {
            balEl.textContent = cur + " " + parseFloat(bal).toFixed(2);
          }
        },
        wsUrl,
        currency,
      );

      var initialSymbol = window._selectedAssetSymbol || "1HZ100V";
      waitForConnection(function () {
        subscribeSymbolTicks(initialSymbol);
      });

      document.addEventListener("assetChanged", function (e) {
        if (e.detail && e.detail.symbol) {
          waitForConnection(function () {
            subscribeSymbolTicks(e.detail.symbol);
          });
        }
      });
    }

    if (needsFreshOtp) {
      /* Fetch a fresh OTP WebSocket URL from the server, then connect */
      fetch("/auth/otp-url", { credentials: "include" })
        .then(function (r) {
          return r.ok ? r.json() : Promise.reject(r.status);
        })
        .then(function (data) {
          doConnect(data.wsUrl || null);
        })
        .catch(function () {
          /* If the server call fails, fall back to anonymous tick streaming */
          doConnect(null);
        });
    } else {
      var wsUrl =
        sd && sd.isAuthenticated && sd.activeAccount
          ? sd.activeAccount.wsUrl || null
          : null;
      doConnect(wsUrl);
    }
  }

  function waitForConnection(cb) {
    var s = window.DerivWS && window.DerivWS.getState();
    if (s && s.connected) {
      cb();
      return;
    }
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var st = window.DerivWS && window.DerivWS.getState();
      if (st && st.connected) {
        clearInterval(iv);
        cb();
      } else if (tries > 60) {
        clearInterval(iv);
      }
    }, 250);
  }

  function subscribeSymbolTicks(symbol) {
    if (!symbol || !window.DerivWS) return;
    if (currentTickSymbol === symbol) return;

    /* Immediately drop the previous symbol's stream so no stray ticks leak through */
    if (currentTickSymbol) {
      window.DerivWS.unsubscribeTicks(currentTickSymbol);
    }
    currentTickSymbol = symbol;

    window.DerivWS.subscribeTicks(symbol, function (tick) {
      if (
        !tick ||
        typeof tick !== "object" ||
        tick.quote === undefined ||
        tick.quote === null
      )
        return;

      /* STRICT: only process if this tick is for the currently bound symbol */
      if (tick.symbol !== currentTickSymbol) return;
      if (tick.symbol !== window._selectedAssetSymbol) return;

      var price = parseFloat(tick.quote);
      if (!Number.isFinite(price) || price <= 0) return;

      var priceEl = document.getElementById("current-price");
      if (priceEl) {
        priceEl.textContent = price.toFixed(price < 100 ? 5 : 2);
      }

      if (window._onDerivTick) window._onDerivTick(tick);
    });
  }

  /* ── Login button ─────────────────────── */
  function initLogin() {
    var btn = document.getElementById("login-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      window.showToast &&
        window.showToast("Connecting to Deriv...", "neutral", 3500);
      window.location.href = "/auth/login";
    });
  }

  /* ── Dynamic account switching (no page reload) ─────────────────────── */
  function switchAccountDynamic(accountId) {
    fetch("/auth/switch-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ accountId: accountId }),
    })
      .then(function (r) {
        return r.ok ? r.json() : Promise.reject(r.status);
      })
      .then(function (data) {
        if (data.error) {
          window.showToast &&
            window.showToast("Failed to switch account", "red", 3000);
          return;
        }

        /* Update SESSION_DATA with new active account */
        var sd = window.SESSION_DATA;
        if (sd && sd.accounts) {
          var newActive = sd.accounts.find(function (a) {
            return a.account === accountId;
          });
          if (newActive) {
            sd.activeAccount = newActive;
            /* Update UI: account chip */
            var chip = document.getElementById("account-chip");
            if (chip) {
              var avatar = chip.querySelector(".account-avatar");
              var balance = chip.querySelector(".account-balance");
              if (avatar)
                avatar.textContent = newActive.account.substring(0, 2);
              if (balance)
                balance.textContent =
                  newActive.currency +
                  " " +
                  parseFloat(newActive.balance || 0).toFixed(2);
            }

            /* Update bots page account display if present */
            var botsDisplay = document.getElementById("bots-balance-display");
            if (botsDisplay) {
              var demoTag = newActive.isVirtual ? " • Demo" : "";
              botsDisplay.textContent = newActive.account + demoTag;
            }

            /* Update left rail account display if present */
            var railAvatar = document.querySelector(
              ".rail-item[id*=account] .rail-avatar",
            );
            var railLabel = document.querySelector(
              ".rail-item[id*=account] .rail-label",
            );
            if (railAvatar) {
              railAvatar.textContent = newActive.account.substring(0, 2);
            }
            if (railLabel) {
              railLabel.textContent = newActive.account.substring(0, 7);
            }

            /* Update account dropdown markers (both top nav and left rail) */
            document
              .querySelectorAll(".account-option")
              .forEach(function (opt) {
                opt.classList.toggle(
                  "active",
                  opt.textContent.includes(accountId),
                );
              });
            document
              .querySelectorAll(".rail-account-option")
              .forEach(function (opt) {
                var hasCheckmark = opt.querySelector("svg");
                var isActive = opt.textContent.includes(accountId);

                /* Remove old checkmark if present */
                if (hasCheckmark && !isActive) {
                  hasCheckmark.remove();
                } else if (isActive && !hasCheckmark) {
                /* Add checkmark if this is the new active account */
                  var checkmark = document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "svg",
                  );
                  checkmark.setAttribute("width", "12");
                  checkmark.setAttribute("height", "12");
                  checkmark.setAttribute("viewBox", "0 0 24 24");
                  checkmark.setAttribute("fill", "none");
                  checkmark.setAttribute("stroke", "currentColor");
                  checkmark.setAttribute("stroke-width", "2.5");
                  checkmark.innerHTML = "<polyline points='20 6 9 17 4 12'/>";
                  opt.appendChild(checkmark);
                }

                opt.classList.toggle("active", isActive);
              });

            /* Close dropdowns */
            var accountChip = document.getElementById("account-chip");
            if (accountChip) accountChip.classList.remove("open");
            var railDropdown = document.getElementById("rail-account-dropdown");
            if (railDropdown) railDropdown.classList.remove("open");
            var railBtn = document.getElementById("rail-account-btn");
            if (railBtn) railBtn.setAttribute("aria-expanded", "false");

            /* Reconnect WebSocket with new account */
            if (window.DerivWS) {
              try {
                window.DerivWS.disconnect();
              } catch (e) {}
            }
            initDerivWS();

            window.showToast &&
              window.showToast("Switched to " + accountId, "green", 2500);
          }
        }
      })
      .catch(function (err) {
        window.showToast &&
          window.showToast("Error switching account", "red", 3000);
      });
  }

  window.switchAccountDynamic = switchAccountDynamic;

  /* ── Account chip ─────────────────────── */
  function initAccountChip() {
    var chip = document.getElementById("account-chip");
    if (!chip) return;

    chip.addEventListener("click", function (e) {
      if (e.target.closest(".account-option")) return;
      chip.classList.toggle("open");
    });
    document.addEventListener("click", function (e) {
      if (!chip.contains(e.target)) chip.classList.remove("open");
    });

    /* Account switching: prevent default nav and use dynamic switch */
    document
      .querySelectorAll(".account-switcher-dropdown .account-option")
      .forEach(function (link) {
        link.addEventListener("click", function (e) {
          // Allow logout and reset-demo buttons to navigate naturally
          if (
            this.classList.contains("logout-btn") ||
            this.classList.contains("reset-demo-btn")
          ) {
            return;
          }
          e.preventDefault();
          var accountSpan = this.querySelector(".account-option-id");
          if (accountSpan) {
            switchAccountDynamic(accountSpan.textContent.trim());
          }
        });
      });

    /* Reset demo balance */
    document
      .querySelectorAll(
        ".reset-demo-btn, #reset-demo-btn, #rail-reset-demo-btn",
      )
      .forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (chip) chip.classList.remove("open");
          if (!window.DerivWS || !window.DerivWS.isAuthorized()) {
            window.showToast &&
              window.showToast("Not connected to Deriv", "red", 3000);
            return;
          }
          /* Call Deriv topup_virtual API via WebSocket */
          var ws = window.DerivWS.getState().ws;
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            window.showToast &&
              window.showToast("WebSocket not ready", "red", 3000);
            return;
          }
          var reqId = Date.now() % 100000;
          var handler = function (evt) {
            var msg;
            try {
              msg = JSON.parse(evt.data);
            } catch (e) {
              return;
            }
            if (msg.req_id !== reqId) return;
            ws.removeEventListener("message", handler);
            if (msg.error) {
              window.showToast &&
                window.showToast(
                  "Reset failed: " + msg.error.message,
                  "red",
                  3500,
                );
            } else {
              window.showToast &&
                window.showToast(
                  "Demo balance reset to $10,000!",
                  "green",
                  3000,
                );
              /* Balance will update via the existing balance subscription */
            }
          };
          ws.addEventListener("message", handler);
          ws.send(JSON.stringify({ topup_virtual: 1, req_id: reqId }));
        });
      });
  }

  /* ── Sidebar account dropdown ─────────── */
  function initRailAccount() {
    var wrap = document.getElementById("rail-account-wrap");
    var btn = document.getElementById("rail-account-btn");
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

    /* Account switching in left rail: prevent default nav and use dynamic switch */
    document.querySelectorAll(".rail-account-option").forEach(function (link) {
      link.addEventListener("click", function (e) {
        if (
          this.classList.contains("reset-demo-btn") ||
          this.classList.contains("rail-logout-btn")
        ) {
          return;
        }
        e.preventDefault();
        var accountSpan = this.querySelector(".rail-acc-id");
        if (accountSpan) {
          switchAccountDynamic(accountSpan.textContent.trim());
        }
      });
    });
  }

  /* ── Theme toggle ─────────────────────── */
  function initThemeToggle() {
    var btn = document.getElementById("rail-theme-btn");
    if (!btn) return;
    var html = document.documentElement;
    var iconDark = btn.querySelector(".theme-icon-dark");
    var iconLight = btn.querySelector(".theme-icon-light");

    var STORAGE_KEY = "at_theme";

    function applyTheme(theme) {
      html.setAttribute("data-theme", theme);
      localStorage.setItem(STORAGE_KEY, theme);
      document.dispatchEvent(
        new CustomEvent("themeChanged", { detail: { theme: theme } }),
      );
    }

    /* Restore saved preference */
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved !== "dark") applyTheme(saved);

    btn.addEventListener("click", function () {
      var current = html.getAttribute("data-theme") || "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }

  /* ── Left rail navigation ──────────────── */
  function initRailNav() {
    var railItems = document.querySelectorAll(".rail-item[data-view]");
    var mainWs = document.getElementById("main-workspace");
    var reportsPage = document.getElementById("reports-page");
    var posPanel = document.getElementById("positions-panel");
    var tradePanel = document.getElementById("trade-panel");
    var botPanelFab = document.getElementById("bot-panel-fab");

    railItems.forEach(function (item) {
      item.addEventListener("click", function () {
        var view = item.dataset.view;

        if (view === "reports") {
          // Show reports, hide main workspace and the Bot Control Panel —
          // the Report page is dedicated solely to analytics/history.
          if (mainWs) mainWs.style.display = "none";
          if (reportsPage) reportsPage.style.display = "";
          if (tradePanel) tradePanel.style.display = "none";
          if (botPanelFab) botPanelFab.style.display = "none";
          railItems.forEach(function (i) {
            i.classList.remove("active");
          });
          item.classList.add("active");
          if (window.renderReports) window.renderReports();
          return;
        }

        if (view === "positions") {
          // Toggle positions panel
          if (posPanel) posPanel.classList.toggle("open");
          return;
        }

        if (view === "home") {
          // Show main workspace + Bot Control Panel again, hide reports
          if (mainWs) mainWs.style.display = "";
          if (reportsPage) reportsPage.style.display = "none";
          if (tradePanel) tradePanel.style.display = "";
          if (botPanelFab) botPanelFab.style.display = "";
          railItems.forEach(function (i) {
            i.classList.remove("active");
          });
          item.classList.add("active");
          return;
        }

        // Generic: set active
        railItems.forEach(function (i) {
          i.classList.remove("active");
        });
        item.classList.add("active");
      });
    });

    // Positions close button
    var closeBtn = document.getElementById("positions-close-btn");
    if (closeBtn && posPanel) {
      closeBtn.addEventListener("click", function () {
        posPanel.classList.remove("open");
      });
    }

    // Reports back button
    var backBtn = document.getElementById("reports-back-btn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        if (mainWs) mainWs.style.display = "";
        if (tradePanel) tradePanel.style.display = "";
        if (botPanelFab) botPanelFab.style.display = "";
        if (reportsPage) reportsPage.style.display = "none";
        railItems.forEach(function (i) {
          i.classList.remove("active");
        });
        var homeBtn = document.querySelector('.rail-item[data-view="home"]');
        if (homeBtn) homeBtn.classList.add("active");
      });
    }
  }

  /* ── Nav search → open markets panel ──── */
  function initNavSearch() {
    var input = document.getElementById("nav-search-input");
    if (!input) return;
    input.addEventListener("keydown", function (e) {
      if (
        e.key === "Enter" ||
        (e.key.length === 1 && !e.ctrlKey && !e.metaKey)
      ) {
        // open markets panel and populate search
        var marketsSearch = document.getElementById("markets-search");
        var assetBtn = document.getElementById("asset-selector-btn");
        if (assetBtn) assetBtn.click();
        if (marketsSearch) {
          marketsSearch.value = input.value;
          marketsSearch.dispatchEvent(new Event("input"));
        }
      }
    });
  }

  /* ── Mobile drawer navigation ─────────── */
  function initMobileDrawer() {
    var rail = document.getElementById("left-rail");
    var atBtn = document.getElementById("at-logo-btn");
    var closeBtn = document.getElementById("rail-close-btn");
    var backdrop = document.getElementById("drawer-backdrop");
    if (!rail || !atBtn) return;

    function openDrawer() {
      rail.classList.add("open");
      if (backdrop) backdrop.classList.add("show");
      document.body.classList.add("drawer-open");
    }
    function closeDrawer() {
      rail.classList.remove("open");
      if (backdrop) backdrop.classList.remove("show");
      document.body.classList.remove("drawer-open");
    }
    function toggleDrawer() {
      if (rail.classList.contains("open")) closeDrawer();
      else openDrawer();
    }

    atBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleDrawer();
    });

    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);

    /* Close drawer when tapping a nav item */
    rail.querySelectorAll(".rail-item[data-view]").forEach(function (item) {
      item.addEventListener("click", closeDrawer);
    });

    /* Close drawer when clicking nav links */
    rail.querySelectorAll("a.rail-item").forEach(function (link) {
      link.addEventListener("click", closeDrawer);
    });

    /* Escape key closes */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeDrawer();
    });

    /* Close on resize to desktop */
    window.addEventListener("resize", function () {
      if (window.innerWidth >= 768) closeDrawer();
    });
  }

  /* ── Mobile bot panel FAB ─────────────── */
  function initMobileBotPanel() {
    var BREAKPOINT = 768;
    var fab = document.getElementById("bot-panel-fab");
    var backdrop = document.getElementById("bot-panel-backdrop");
    var panel = document.querySelector(".bot-panel");
    if (!fab || !panel) return;

    var isMobile = function () {
      return window.innerWidth <= BREAKPOINT;
    };

    function openPanel() {
      panel.classList.add("mobile-open");
      if (backdrop) {
        backdrop.style.display = "block";
        backdrop.classList.add("show");
      }
      fab.style.display = "none";
      document.body.classList.add("bot-panel-expanded");
    }
    function closePanel() {
      panel.classList.remove("mobile-open");
      if (backdrop) {
        backdrop.classList.remove("show");
        backdrop.style.display = "";
      }
      if (isMobile()) fab.style.display = "";
      document.body.classList.remove("bot-panel-expanded");
    }

    /* Show/hide FAB based on viewport */
    function syncFab() {
      if (isMobile()) {
        fab.style.display = panel.classList.contains("mobile-open")
          ? "none"
          : "";
      } else {
        fab.style.display = "none";
        closePanel();
      }
    }

    fab.addEventListener("click", openPanel);
    if (backdrop) backdrop.addEventListener("click", closePanel);

    /* Allow swipe-down on the panel handle to close */
    var touchStartY = 0;
    panel.addEventListener(
      "touchstart",
      function (e) {
        touchStartY = e.touches[0].clientY;
      },
      { passive: true },
    );
    panel.addEventListener(
      "touchend",
      function (e) {
        var dy = e.changedTouches[0].clientY - touchStartY;
        if (dy > 60) closePanel();
      },
      { passive: true },
    );

    window.addEventListener("resize", syncFab);
    syncFab();
  }

  /* ── Legacy-link banner (new accounts that returned a JWT) ───── */
  function initLegacyLinkBanner() {
    var sd = window.SESSION_DATA;
    if (!sd || !sd.needsLegacyLink) return;

    var banner = document.createElement("div");
    banner.id = "legacy-link-banner";
    banner.innerHTML =
      '<span class="llb-icon">&#9888;</span>' +
      '<span class="llb-text">Your account needs one final step to enable trading.</span>' +
      '<a href="/auth/login/legacy" class="llb-btn">Connect Now &rarr;</a>' +
      '<button class="llb-close" aria-label="Dismiss">&times;</button>';

    banner.querySelector(".llb-close").addEventListener("click", function () {
      banner.remove();
    });

    document.body.insertAdjacentElement("afterbegin", banner);

    /* Inject styles inline so no stylesheet change is needed */
    var style = document.createElement("style");
    style.textContent = [
      "#legacy-link-banner{display:flex;align-items:center;gap:12px;padding:10px 18px;",
      "background:linear-gradient(90deg,#1a3a2a,#0f2d1f);border-bottom:1px solid #2dbb6e44;",
      "font-size:13px;color:#e0ffe8;position:sticky;top:0;z-index:9999;flex-wrap:wrap;}",
      ".llb-icon{font-size:16px;color:#2dbb6e;flex-shrink:0;}",
      ".llb-text{flex:1;min-width:160px;}",
      ".llb-btn{background:#2dbb6e;color:#000;font-weight:700;font-size:12px;",
      "padding:6px 14px;border-radius:6px;text-decoration:none;white-space:nowrap;",
      "transition:background .2s;}",
      ".llb-btn:hover{background:#25a85e;}",
      ".llb-close{background:none;border:none;color:#aaa;font-size:18px;",
      "cursor:pointer;padding:0 4px;margin-left:auto;line-height:1;}",
    ].join("");
    document.head.appendChild(style);
  }

  /* ── Init ─────────────────────────────── */
  document.addEventListener("DOMContentLoaded", function () {
    handleDerivCallback();
    initThemeToggle();
    initDerivWS();
    initLogin();
    initLegacyLinkBanner();
    initAccountChip();
    initRailAccount();
    initRailNav();
    initNavSearch();
    initMobileDrawer();
    initMobileBotPanel();
  });
})();
