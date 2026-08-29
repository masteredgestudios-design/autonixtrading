/* ═══════════════════════════════════════════════════
   Autonix — Global Theme Toggle  v2.0
   ═══════════════════════════════════════════════════ */

(function () {
  "use strict";

  var STORAGE_KEY = "at_theme";

  var MOON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  var SUN_SVG  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

  function getTheme() {
    var theme = localStorage.getItem(STORAGE_KEY);
    if (!theme) {
      theme = "light";
      localStorage.setItem(STORAGE_KEY, theme);
    }
    return theme;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
    updateAllButtons(theme);
  }

  function toggleTheme() {
    var current = getTheme();
    applyTheme(current === "dark" ? "light" : "dark");
  }

  function updateAllButtons(theme) {
    var isDark = theme === "dark";

    /* Floating toggle */
    var floating = document.getElementById("floating-theme-toggle");
    if (floating) {
      floating.innerHTML = isDark ? SUN_SVG : MOON_SVG;
      floating.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
      floating.title = isDark ? "Light mode" : "Dark mode";
    }

    /* Legacy rail button */
    var railBtn = document.getElementById("rail-theme-btn");
    if (railBtn) {
      var darkIcon = railBtn.querySelector(".theme-icon-dark");
      var lightIcon = railBtn.querySelector(".theme-icon-light");
      if (darkIcon)  darkIcon.style.display  = isDark  ? "block" : "none";
      if (lightIcon) lightIcon.style.display = isDark  ? "none"  : "block";
    }

    /* Any other toggle buttons */
    ["theme-toggle", "theme-toggle-mobile"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) {
        btn.innerHTML = isDark ? SUN_SVG : MOON_SVG;
        btn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
      }
    });
  }

  /* Apply saved theme immediately — before DOMContentLoaded to prevent flash */
  applyTheme(getTheme());

  document.addEventListener("DOMContentLoaded", function () {
    /* Wire up all known toggle button IDs */
    var buttonIds = [
      "floating-theme-toggle",
      "rail-theme-btn",
      "theme-toggle",
      "theme-toggle-mobile"
    ];

    buttonIds.forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener("click", toggleTheme);
    });

    /* Sync icons with current theme */
    updateAllButtons(getTheme());
  });
})();
