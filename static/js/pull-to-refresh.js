(function () {
  "use strict";

  var startY = 0;
  var distance = 0;
  var tracking = false;
  var refreshing = false;
  var threshold = 72;
  var indicator = null;
  var owner = null;

  function isScrollable(element) {
    if (!element || element === document.body || element === document.documentElement) return false;
    var style = window.getComputedStyle(element);
    return /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
  }

  function getMainScrollContainer() {
    var workspace = document.querySelector(".bots-workspace");
    return isScrollable(workspace) ? workspace : document.scrollingElement;
  }

  function getScrollableAncestor(target) {
    var element = target && target.nodeType === 1 ? target : null;
    while (element && element !== document.body) {
      if (isScrollable(element)) return element;
      element = element.parentElement;
    }
    return getMainScrollContainer();
  }

  function getIndicator() {
    if (indicator) return indicator;
    indicator = document.createElement("div");
    indicator.className = "pull-refresh-indicator";
    indicator.setAttribute("aria-live", "polite");
    indicator.innerHTML = "<span class=\"pull-refresh-spinner\" aria-hidden=\"true\"></span><span class=\"pull-refresh-label\">Pull to refresh</span>";
    document.body.appendChild(indicator);
    return indicator;
  }

  function setIndicator(value, message) {
    var element = getIndicator();
    element.style.setProperty("--pull-distance", Math.min(value, threshold) + "px");
    element.classList.toggle("is-ready", value >= threshold);
    element.classList.toggle("is-refreshing", refreshing);
    var label = element.querySelector(".pull-refresh-label");
    if (label) label.textContent = message || (value >= threshold ? "Release to refresh" : "Pull to refresh");
  }

  function reset() {
    tracking = false;
    owner = null;
    distance = 0;
    if (indicator) {
      indicator.classList.remove("is-visible", "is-ready", "is-refreshing");
      indicator.style.setProperty("--pull-distance", "0px");
    }
  }

  document.addEventListener("touchstart", function (event) {
    if (refreshing || event.touches.length !== 1) return;
    var target = event.target;
    if (target.closest && target.closest("input, select, textarea, button, a, [contenteditable=\"true\"]")) return;
    var main = getMainScrollContainer();
    owner = getScrollableAncestor(target);
    if (!main || main.scrollTop > 1 || owner !== main) {
      owner = null;
      return;
    }
    startY = event.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  document.addEventListener("touchmove", function (event) {
    if (!tracking || refreshing || event.touches.length !== 1) return;
    var main = getMainScrollContainer();
    if (!main || owner !== main || main.scrollTop > 1) { reset(); return; }
    distance = event.touches[0].clientY - startY;
    if (distance <= 0) return;
    event.preventDefault();
    var element = getIndicator();
    element.classList.add("is-visible");
    setIndicator(distance);
  }, { passive: false });

  document.addEventListener("touchend", function () {
    if (!tracking) return;
    if (distance >= threshold) {
      refreshing = true;
      setIndicator(threshold, "Refreshing...");
      setTimeout(function () { window.location.reload(); }, 180);
    } else {
      reset();
    }
  }, { passive: true });

  document.addEventListener("touchcancel", reset, { passive: true });
})();