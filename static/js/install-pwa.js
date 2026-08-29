(function () {
  "use strict";

  var INSTALL_ACCEPTED_KEY = "autonix_pwa_installed";
  var FIRST_PROMPT_DELAY = 5000;
  var REPEAT_PROMPT_DELAY = 30000;

  var deferredPrompt = null;
  var loadDelayComplete = false;
  var repeatTimer = null;

  var promptEl = document.getElementById("installAppPrompt");
  var installBtn = document.getElementById("installAppBtn");
  var closeBtn = document.getElementById("installAppClose");
  var legacyInstallBtn = document.querySelector(".install-app-btn");

  if (legacyInstallBtn) {
    legacyInstallBtn.remove();
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function (err) {
        console.warn("SW registration failed:", err);
      });
    });
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || "");
  }

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function isInstalled() {
    return isStandalone() || localStorage.getItem(INSTALL_ACCEPTED_KEY) === "true";
  }

  function canShowPrompt() {
    return Boolean(
      promptEl &&
        installBtn &&
        deferredPrompt &&
        isAndroid() &&
        !isInstalled(),
    );
  }

  function hidePrompt() {
    if (!promptEl) return;
    promptEl.hidden = true;
    promptEl.classList.remove("is-visible");
  }

  function showPrompt() {
    if (!canShowPrompt()) return;
    promptEl.hidden = false;
    window.requestAnimationFrame(function () {
      promptEl.classList.add("is-visible");
    });
  }

  function clearRepeatTimer() {
    if (!repeatTimer) return;
    window.clearTimeout(repeatTimer);
    repeatTimer = null;
  }

  function scheduleRepeatPrompt() {
    clearRepeatTimer();
    if (!canShowPrompt()) return;
    repeatTimer = window.setTimeout(function () {
      repeatTimer = null;
      showPrompt();
    }, REPEAT_PROMPT_DELAY);
  }

  function markInstalled() {
    localStorage.setItem(INSTALL_ACCEPTED_KEY, "true");
    deferredPrompt = null;
    clearRepeatTimer();
    hidePrompt();
  }

  function maybeShowInitialPrompt() {
    if (loadDelayComplete && canShowPrompt()) {
      showPrompt();
    }
  }

  window.addEventListener("load", function () {
    window.setTimeout(function () {
      loadDelayComplete = true;
      maybeShowInitialPrompt();
    }, FIRST_PROMPT_DELAY);
  });

  window.addEventListener("beforeinstallprompt", function (event) {
    if (!isAndroid() || isInstalled()) return;
    event.preventDefault();
    deferredPrompt = event;
    maybeShowInitialPrompt();
  });

  window.addEventListener("appinstalled", markInstalled);

  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      hidePrompt();
      scheduleRepeatPrompt();
    });
  }

  if (installBtn) {
    installBtn.addEventListener("click", async function () {
      if (!canShowPrompt()) return;

      hidePrompt();
      var promptEvent = deferredPrompt;
      deferredPrompt = null;

      promptEvent.prompt();

      try {
        var choice = await promptEvent.userChoice;
        if (choice && choice.outcome === "accepted") {
          markInstalled();
          return;
        }
      } catch (_) {}

      deferredPrompt = null;
      scheduleRepeatPrompt();
    });
  }

  if (isInstalled()) {
    markInstalled();
  }
})();
