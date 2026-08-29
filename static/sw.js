/* Autonix service worker */
const CACHE = "autonix-v10";
const PRECACHE = [
  "/",
  "/autonix",
  "/invest",
  "/terms",
  "/bots",
  "/static/css/styles.css",
  "/static/css/tokens.css",
  "/static/css/autonix.css",
  "/static/js/main.js",
  "/static/js/autonix.js",
  "/static/js/chart.js",
  "/static/js/markets-panel.js",
  "/static/js/trade-ticket.js",
  "/static/js/bot.js",
  "/static/js/deriv-ws.js",
  "/static/js/theme-toggle.js",
  "/static/icons/icon-192x192.png",
  "/static/icons/icon-512x512.png",
  "/static/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {})),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Network-first for everything (with cache fallback) so updates roll out immediately
  const isStatic = url.pathname.startsWith("/static/");
  if (isStatic) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((c) => c.put(req, copy))
              .catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (
          res.ok &&
          req.headers.get("accept") &&
          req.headers.get("accept").includes("text/html")
        ) {
          const copy = res.clone();
          caches
            .open(CACHE)
            .then((c) => c.put(req, copy))
            .catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match("/autonix")),
      ),
  );
});
