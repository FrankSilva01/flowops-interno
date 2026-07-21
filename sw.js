const CACHE_NAME = "flowops-v60";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/termos.html",
  "/privacidade.html",
  "/cancelamento.html",
  "/tracking.html",
  "/css/legal.css",
  "/css/flowops.css",
  "/assets/flowops-logo-mark.svg",
  "/assets/flowops-logo-full.svg",
  "/assets/tabler-icons/tabler-icons.min.css",
  "/theme-init.js",
  "/supabase-config.js",
  "/js/app.js",
  "/js/tracking.js",
  "/js/core/state.js",
  "/js/core/dom.js",
  "/js/core/router.js",
  "/js/features/shopee-template-export.js",
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

// Fetch: network-first for live app shell/assets so new deploys do not keep old modules hidden.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Never cache API responses: authenticated payloads must not survive logout
  // or be reused by another account on a shared browser.
  if (url.pathname.includes("/api") || url.pathname.includes("functions")) {
    event.respondWith(
      fetch(request)
        .catch(() => new Response(JSON.stringify({ error: "Serviço indisponível sem conexão." }), {
          status: 503,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        }))
    );
    return;
  }

  if (
    request.mode === "navigate"
    || url.pathname.endsWith(".html")
    || url.pathname.endsWith(".js")
    || url.pathname.endsWith(".css")
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request).then((response) => response || new Response("Offline", { status: 503 })))
    );
    return;
  }

  // Other static assets: cache-first
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
