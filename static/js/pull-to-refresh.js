(function () {
  "use strict";

  var startY = 0;
  var distance = 0;
  var tracking = false;
  var refreshing = false;
  var threshold = 72;
  var indicator = null;

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
    distance = 0;
    if (indicator) {
      indicator.classList.remove("is-visible", "is-ready", "is-refreshing");
      indicator.style.setProperty("--pull-distance", "0px");
    }
  }

  document.addEventListener("touchstart", function (event) {
    if (refreshing || event.touches.length !== 1 || window.scrollY > 0) return;
    var target = event.target;
    if (target.closest && target.closest("input, select, textarea, button, a, [contenteditable=\"true\"]")) return;
    startY = event.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  document.addEventListener("touchmove", function (event) {
    if (!tracking || refreshing || event.touches.length !== 1) return;
    if (window.scrollY > 0) { reset(); return; }
    distance = event.touches[0].clientY - startY;
    if (distance <= 0) { reset(); return; }
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