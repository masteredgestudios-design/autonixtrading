/* ═══════════════════════════════════════════
   Trade Ticket — Rise/Fall Panel
   ═══════════════════════════════════════════ */

(function () {
  "use strict";

  let direction = "rise";
  let stakeValue = 10;
  let durationValue = 5;
  let durationUnit = "min";

  /* ── Helpers ────────────────────────────── */
  function calcPayout(stake) {
    return (stake * 1.955).toFixed(2);
  }

  function displayMoney(value) {
    return window.AutonixCurrency ? window.AutonixCurrency.format(value) : Number(value).toFixed(2) + " USD";
  }

  function updateBuyBtn() {
    const btn = document.getElementById("buy-btn");
    const btnText = document.getElementById("buy-btn-text");
    const btnSub = document.getElementById("buy-btn-sub");
    const payoutEl = document.getElementById("payout-display");

    if (!btn) return;

    const payout = calcPayout(stakeValue);

    if (direction === "rise") {
      btn.className = "buy-btn rise";
      if (btnText) btnText.textContent = "Buy Rise";
    } else {
      btn.className = "buy-btn fall";
      if (btnText) btnText.textContent = "Buy Fall";
    }

    if (btnSub) btnSub.textContent = "Payout " + displayMoney(payout);
    if (payoutEl) payoutEl.textContent = displayMoney(payout);
  }

  function updateStakeDisplay() {
    const el = document.getElementById("stake-display");
    if (el) el.textContent = displayMoney(stakeValue);
  }

  function updateDurationDisplay() {
    const el = document.getElementById("duration-display");
    if (el) el.textContent = durationValue + " " + durationUnit;
  }

  /* ── Direction toggle ───────────────────── */
  function initDirectionToggle() {
    const riseBtn = document.getElementById("btn-rise");
    const fallBtn = document.getElementById("btn-fall");
    if (!riseBtn || !fallBtn) return;

    function setDirection(dir) {
      direction = dir;
      riseBtn.classList.toggle("active", dir === "rise");
      fallBtn.classList.toggle("active", dir === "fall");
      updateBuyBtn();
    }

    riseBtn.addEventListener("click", () => setDirection("rise"));
    fallBtn.addEventListener("click", () => setDirection("fall"));
  }

  /* ── Duration popover ───────────────────── */
  function initDurationPopover() {
    const btn = document.getElementById("duration-btn");
    const popover = document.getElementById("duration-popover");
    if (!btn || !popover) return;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllPopovers();
      popover.classList.toggle("open");
    });

    popover.querySelectorAll(".dur-opt").forEach((opt) => {
      opt.addEventListener("click", () => {
        popover
          .querySelectorAll(".dur-opt")
          .forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
        durationValue = parseInt(opt.dataset.value);
        durationUnit = opt.dataset.unit;
        updateDurationDisplay();
        popover.classList.remove("open");
      });
    });
  }

  /* ── Stake popover ──────────────────────── */
  function initStakePopover() {
    const btn = document.getElementById("stake-btn");
    const popover = document.getElementById("stake-popover");
    const input = document.getElementById("stake-input");
    const minus = document.getElementById("stake-minus");
    const plus = document.getElementById("stake-plus");

    if (!btn || !popover) return;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllPopovers();
      popover.classList.toggle("open");
      if (input && popover.classList.contains("open")) {
        input.focus();
        input.select();
      }
    });

    if (input) {
      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        if (!isNaN(v) && v > 0) {
          stakeValue = Math.min(v, 50000);
          updateStakeDisplay();
          updateBuyBtn();
        }
      });
    }

    if (minus) {
      minus.addEventListener("click", () => {
        stakeValue = Math.max(1, stakeValue - 1);
        if (input) input.value = stakeValue;
        updateStakeDisplay();
        updateBuyBtn();
      });
    }

    if (plus) {
      plus.addEventListener("click", () => {
        stakeValue = Math.min(50000, stakeValue + 1);
        if (input) input.value = stakeValue;
        updateStakeDisplay();
        updateBuyBtn();
      });
    }

    // Preset buttons
    popover.querySelectorAll(".stake-preset").forEach((btn) => {
      btn.addEventListener("click", () => {
        stakeValue = parseFloat(btn.dataset.value);
        if (input) input.value = stakeValue;
        updateStakeDisplay();
        updateBuyBtn();
      });
    });
  }

  /* ── Close all popovers ─────────────────── */
  function closeAllPopovers() {
    document
      .querySelectorAll(".field-popover.open")
      .forEach((p) => p.classList.remove("open"));
  }

  /* ── Allow Equals toggle ────────────────── */
  function initAllowEquals() {
    const toggle = document.getElementById("allow-equals-toggle");
    if (!toggle) return;
    toggle.addEventListener("change", () => {
      document.dispatchEvent(
        new CustomEvent("allowEqualsChanged", {
          detail: { value: toggle.checked },
        }),
      );
    });
  }

  /* ── Buy button ────────────────────────── */
  function initBuyButton() {
    const btn = document.getElementById("buy-btn");
    if (!btn) return;

    btn.addEventListener("click", () => {
      btn.classList.add("flash");
      setTimeout(() => btn.classList.remove("flash"), 400);

      const symbol = window._selectedAssetSymbol || "1HZ100V";
      const assetEl = document.getElementById("selected-asset-name");
      const asset = assetEl ? assetEl.textContent : symbol;
      const payout = calcPayout(stakeValue);

      window.showToast(
        (direction === "rise" ? "Rise" : "Fall") +
          " order placed — " +
          asset +
          " — Payout " +
          payout +
          "",
        direction === "rise" ? "green" : "red",
        3000,
      );
    });
  }

  /* ── Close popovers on outside click ──── */
  function initOutsideClick() {
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".trade-field")) {
        closeAllPopovers();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllPopovers();
    });
  }

  /* ── Init ─────────────────────────────── */
  document.addEventListener("DOMContentLoaded", function () {
    initDirectionToggle();
    initDurationPopover();
    initStakePopover();
    initAllowEquals();
    initBuyButton();
    initOutsideClick();
    updateBuyBtn();
    updateStakeDisplay();
    updateDurationDisplay();
  });
})();
