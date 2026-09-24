(function () {
  "use strict";
  var state = { type: "over-under", selection: "over", digit: 1, busy: false };
  var selections = {
    "rise-fall": [["RISE", "rise"], ["FALL", "fall"]],
    "even-odd": [["EVEN", "even"], ["ODD", "odd"]],
    "match-differ": [["MATCH", "match"], ["DIFFER", "differ"]],
    "over-under": [["OVER", "over"], ["UNDER", "under"]]
  };
  function id(name) { return document.getElementById(name); }
  function money(value) { var amount = Math.abs(Number(value) || 0); return (Number(value) >= 0 ? "+" : "-") + (window.AutonixCurrency ? window.AutonixCurrency.format(amount) : "$" + amount.toFixed(2)); }
  function setMode(mode) {
    var manual = id("manual-panel"); var bot = id("trade-panel");
    document.body.classList.toggle("bot-mode", mode === "bot");
    document.body.classList.toggle("manual-mode", mode === "manual");
    if (manual) manual.style.display = mode === "manual" ? "flex" : "none";
    if (bot) bot.style.display = mode === "bot" ? "flex" : "none";
    document.querySelectorAll("[data-trading-mode]").forEach(function (button) { button.classList.toggle("active", button.dataset.tradingMode === mode); });
    if (window.innerWidth < 768) { if (manual) manual.classList.toggle("mobile-open", mode === "manual"); if (bot) bot.classList.toggle("mobile-open", mode === "bot"); }
  }
  function renderActions() {
    var group = id("manual-action-grid"); var digitGroup = id("manual-digit-group");
    if (!group) return;
    group.innerHTML = "";
    if (digitGroup) digitGroup.style.display = (state.type === "match-differ" || state.type === "over-under") ? "" : "none";
    (selections[state.type] || []).forEach(function (item) { var button = document.createElement("button"); button.type = "button"; button.className = "manual-action-btn " + item[1]; button.textContent = item[0]; button.addEventListener("click", function () { submit(item[1], button); }); group.appendChild(button); });
  }
  function setLatestResult(value, status) {
    var el = id("manual-achieved-profit");
    if (!el) return;
    el.textContent = status || money(value);
    el.className = "bot-stat-value " + (status ? "pending" : (Number(value) >= 0 ? "profit" : "loss"));
  }
  function submit(selection, button) {
    if (state.busy) return;
    var sd = window.SESSION_DATA;
    if (!sd || !sd.isAuthenticated || !window.DerivWS || !window.DerivWS.isAuthorized()) { window.showToast && window.showToast("Connect an authorized account before trading.", "red", 3500); return; }
    var stake = parseFloat(id("manual-stake").value) || 0; var duration = parseInt(id("manual-duration").value, 10) || 1;
    if (stake <= 0) return;
    state.busy = true; button.disabled = true;
    setLatestResult(null, "Pending...");
    var symbol = window._selectedAssetSymbol || "1HZ100V"; var account = sd.activeAccount || {};
    var asset = id("selected-asset-name");
    var trade = { id: Date.now(), type: state.type, selection: selection, digit: state.digit, stake: stake, duration: duration, symbol: symbol, symbolName: asset ? asset.textContent : symbol, entry: 0, startTime: Date.now(), status: "active", pl: 0, source: "manual" };
    window._botState.activePositions.push(trade); window._botUpdatePositions && window._botUpdatePositions();
    window.DerivWS.buyContract({ tradeType: state.type, selection: selection, stake: stake, duration: duration, symbol: symbol, digit: state.digit, currency: account.currency || "USD" }, function (result) {
      window._botResolveExternalTrade && window._botResolveExternalTrade(trade.id, 0, result);
      setLatestResult(result.pl);
      state.busy = false; button.disabled = false;
    }).catch(function (error) {
      var index = window._botState.activePositions.findIndex(function (item) { return item.id === trade.id; }); if (index !== -1) window._botState.activePositions.splice(index, 1);
      window._botUpdatePositions && window._botUpdatePositions(); setLatestResult(null, "Trade failed"); state.busy = false; button.disabled = false; window.showToast && window.showToast("Trade error: " + (error.message || "request failed"), "red", 4000);
    });
  }
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-trading-mode]").forEach(function (button) { button.addEventListener("click", function () { setMode(button.dataset.tradingMode); }); });
    document.querySelectorAll("#trade-type-buttons .trade-type-btn").forEach(function (button) { button.addEventListener("click", function () { state.type = button.dataset.type; renderActions(); }); });
    var digits = id("manual-digit-row"); if (digits) digits.addEventListener("click", function (event) { var button = event.target.closest("[data-digit]"); if (!button) return; state.digit = parseInt(button.dataset.digit, 10); digits.querySelectorAll(".bot-digit-btn").forEach(function (item) { item.classList.toggle("active", item === button); }); });
    renderActions(); setMode("manual");
  });
})();