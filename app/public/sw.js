/*
 * MBA-Vault service worker — offline browse shell.
 *
 * Strategy:
 *  - Precache a tiny app shell on install ("/" and "/offline").
 *  - Navigations: network-first, fall back to cache, then the offline page.
 *  - Static assets: stale-while-revalidate (fast, self-healing).
 *  - The Ask API and auth routes are never cached — they must hit the network.
 *
 * Bump VERSION to roll out a new cache and evict the old ones.
 */
const VERSION = "v1";
const SHELL_CACHE = `mbav-shell-${VERSION}`;
const RUNTIME_CACHE = `mbav-runtime-${VERSION}`;
const APP_SHELL = ["/", "/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // only handle our own origin

  // Never serve the Ask API or auth from cache — they need the live network.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ask")) return;

  // Navigations: try the network, fall back to cache, then the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/offline")),
        ),
    );
    return;
  }

  // Everything else (JS/CSS/images): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
