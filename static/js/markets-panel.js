/* ═══════════════════════════════════════════
   Markets Panel
   ═══════════════════════════════════════════ */

(function () {
  "use strict";

  let marketsData = null;
  let activeCategory = "derived";
  let favorites = JSON.parse(localStorage.getItem("at_favorites") || "[]");

  /* ── Fetch markets ─────────────────────── */
  async function fetchMarkets() {
    if (marketsData) return marketsData;
    try {
      const res = await fetch("/markets", { credentials: "include" });
      marketsData = await res.json();
      return marketsData;
    } catch (e) {
      console.error("Failed to load markets", e);
      return null;
    }
  }

  /* ── Render instruments ────────────────── */
  function renderInstruments(instruments, searchQuery) {
    const content = document.getElementById("markets-content");
    if (!content) return;

    if (!instruments || instruments.length === 0) {
      content.innerHTML =
        '<div class="markets-empty">No instruments found</div>';
      return;
    }

    let filtered = instruments;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = instruments.filter(
        (i) =>
          i.displayName.toLowerCase().includes(q) ||
          i.symbol.toLowerCase().includes(q),
      );
    }

    if (filtered.length === 0) {
      content.innerHTML =
        '<div class="markets-empty">No results for "' + searchQuery + '"</div>';
      return;
    }

    // Group by subcategory
    const groups = {};
    filtered.forEach((inst) => {
      const sub = inst.subcategory || "Other";
      if (!groups[sub]) groups[sub] = [];
      groups[sub].push(inst);
    });

    let html = "";
    for (const [subcat, insts] of Object.entries(groups)) {
      html +=
        '<div class="market-subcategory-label">' + escHtml(subcat) + "</div>";
      insts.forEach((inst) => {
        const isFav = favorites.includes(inst.symbol);
        const isSelected = window._selectedAssetSymbol === inst.symbol;
        html += `
          <div class="market-instrument-row${isSelected ? " selected" : ""}"
               data-symbol="${escHtml(inst.symbol)}"
               data-name="${escHtml(inst.displayName)}"
               tabindex="0"
               role="option"
               aria-selected="${isSelected}">
            <div>
              <div class="instrument-name">${escHtml(inst.displayName)}</div>
              <div class="instrument-symbol">${escHtml(inst.symbol)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              ${inst.isClosed ? '<span class="closed-badge">CLOSED</span>' : ""}
              <button class="favorite-star${isFav ? " active" : ""}"
                      data-sym="${escHtml(inst.symbol)}"
                      aria-label="${isFav ? "Remove from favorites" : "Add to favorites"}"
                      title="${isFav ? "Remove from favorites" : "Add to favorites"}">
                <svg width="15" height="15" viewBox="0 0 24 24"
                     fill="${isFav ? "#F59E0B" : "none"}" stroke="${isFav ? "#F59E0B" : "currentColor"}" stroke-width="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </button>
            </div>
          </div>`;
      });
    }

    content.innerHTML = html;

    // Instrument click → select asset
    content.querySelectorAll(".market-instrument-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest(".favorite-star")) return;
        selectAsset(row.dataset.symbol, row.dataset.name);
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectAsset(row.dataset.symbol, row.dataset.name);
        }
      });
    });

    // Favorite star click
    content.querySelectorAll(".favorite-star").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFavorite(btn.dataset.sym, btn);
      });
    });
  }

  /* ── Render favorites tab ──────────────── */
  function renderFavorites(searchQuery) {
    const content = document.getElementById("markets-content");
    if (!content) return;

    if (!marketsData || favorites.length === 0) {
      content.innerHTML =
        '<div class="markets-empty">No favorites yet. Star instruments to add them here.</div>';
      return;
    }

    const all = marketsData.categories.flatMap((c) => c.instruments);
    const favInsts = all.filter((i) => favorites.includes(i.symbol));
    renderInstruments(favInsts, searchQuery);
  }

  /* ── Toggle favorite ───────────────────── */
  function toggleFavorite(symbol, btn) {
    const idx = favorites.indexOf(symbol);
    if (idx === -1) {
      favorites.push(symbol);
    } else {
      favorites.splice(idx, 1);
    }
    localStorage.setItem("at_favorites", JSON.stringify(favorites));

    const isFav = favorites.includes(symbol);
    const svg = btn.querySelector("svg");
    if (svg) {
      svg.setAttribute("fill", isFav ? "#F59E0B" : "none");
      svg.setAttribute("stroke", isFav ? "#F59E0B" : "currentColor");
    }
    btn.classList.toggle("active", isFav);
    btn.setAttribute(
      "aria-label",
      isFav ? "Remove from favorites" : "Add to favorites",
    );
  }

  /* ── Select asset ──────────────────────── */
  function selectAsset(symbol, name) {
    window._selectedAssetSymbol = symbol;

    const nameEl = document.getElementById("selected-asset-name");
    const symEl = document.getElementById("selected-asset-symbol");
    if (nameEl) nameEl.textContent = name;
    if (symEl) symEl.textContent = symbol;

    closePanel();

    // Reinit chart with new asset
    if (window.initChart) window.initChart(symbol);

    document.dispatchEvent(
      new CustomEvent("assetChanged", { detail: { symbol, name } }),
    );
  }

  /* ── Open / close panel ─────────────────── */
  function openPanel() {
    const panel = document.getElementById("markets-panel");
    const overlay = document.getElementById("markets-overlay");
    const btn = document.getElementById("asset-selector-btn");
    if (panel) {
      panel.classList.add("open");
      panel.setAttribute("aria-hidden", "false");
    }
    if (overlay) overlay.classList.add("open");
    if (btn) btn.setAttribute("aria-expanded", "true");
    loadActiveTab();
  }

  function closePanel() {
    const panel = document.getElementById("markets-panel");
    const overlay = document.getElementById("markets-overlay");
    const btn = document.getElementById("asset-selector-btn");
    if (panel) {
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
    }
    if (overlay) overlay.classList.remove("open");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  /* ── Load active tab ───────────────────── */
  async function loadActiveTab(searchQuery) {
    const content = document.getElementById("markets-content");
    if (!content) return;

    if (activeCategory === "favorites") {
      await fetchMarkets();
      renderFavorites(searchQuery);
      return;
    }

    content.innerHTML = '<div class="markets-loading">Loading...</div>';
    const data = await fetchMarkets();
    if (!data) {
      content.innerHTML =
        '<div class="markets-empty">Failed to load markets.</div>';
      return;
    }

    const cat = data.categories.find((c) => c.id === activeCategory);
    if (!cat) {
      content.innerHTML =
        '<div class="markets-empty">Category not found.</div>';
      return;
    }

    renderInstruments(cat.instruments, searchQuery);
  }

  /* ── Tab switching ─────────────────────── */
  function initTabs() {
    const tabBar = document.querySelector(".markets-tabs");
    if (!tabBar) return;

    tabBar.addEventListener("click", (e) => {
      const tab = e.target.closest(".markets-tab");
      if (!tab) return;

      tabBar.querySelectorAll(".markets-tab").forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      activeCategory = tab.dataset.tab;
      const search = document.getElementById("markets-search");
      loadActiveTab(search ? search.value.trim() : "");
    });
  }

  /* ── Search ──────────────────────────────── */
  function initSearch() {
    const input = document.getElementById("markets-search");
    if (!input) return;
    let debounce;
    input.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => loadActiveTab(input.value.trim()), 200);
    });
  }

  /* ── HTML escaping ──────────────────────── */
  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ── Init ─────────────────────────────── */
  document.addEventListener("DOMContentLoaded", function () {
    window._selectedAssetSymbol = "1HZ100V";

    // Open on asset selector click
    const btn = document.getElementById("asset-selector-btn");
    if (btn) btn.addEventListener("click", openPanel);

    // Close
    const closeBtn = document.getElementById("markets-close-btn");
    if (closeBtn) closeBtn.addEventListener("click", closePanel);

    const overlay = document.getElementById("markets-overlay");
    if (overlay) overlay.addEventListener("click", closePanel);

    // Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });

    initTabs();
    initSearch();
  });
})();
