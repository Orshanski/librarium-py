const CACHE_NAME = "librarium-shell-v2";

self.addEventListener("install", () => {
  // No pre-cache — Vite uses hashed filenames that we can't predict
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API requests — network only
  if (url.pathname.startsWith("/api/")) return;

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    // Navigation: network-first with cache fallback
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/index.html"))),
    );
  } else {
    // Static assets: cache-first with network fallback, opportunistic caching
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      }),
    );
  }
});
