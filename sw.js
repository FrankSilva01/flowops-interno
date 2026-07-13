const CACHE_NAME = "flowops-v9";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/00-base.css",
  "/css/01-variables.css",
  "/css/02-layouts.css",
  "/css/03-forms.css",
  "/css/04-components.css",
  "/css/05-dashboard.css",
  "/js/core/state.js",
  "/js/core/dom.js",
  "/js/core/router.js",
];

// Install: cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Caching static assets");
      return cache.addAll(STATIC_ASSETS).catch(() => {
        console.warn("Some assets could not be cached");
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network-first for API, Cache-first for static
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network-first
  if (url.pathname.includes("/api") || url.pathname.includes("functions")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            try {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
            } catch (e) {
              console.warn("Cache put failed:", e);
            }
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((response) => {
      if (response) return response;
      return fetch(request).then((res) => {
        try {
          if (res.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, res.clone()));
          }
        } catch (e) {
          console.warn("Static asset cache failed:", e);
        }
        return res;
      });
    }).catch(() => new Response("Offline", { status: 503 }))
  );
});
