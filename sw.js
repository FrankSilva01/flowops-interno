const CACHE_NAME = "flowops-v36";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/termos.html",
  "/privacidade.html",
  "/cancelamento.html",
  "/css/00-base.css",
  "/css/legal.css",
  "/css/01-settings-tags-leadfiles.css",
  "/css/02-nav-materials-dashboard-subscription.css",
  "/css/03-visual-refresh-v104.css",
  "/css/04-modern-shell-reports-v109.css",
  "/css/05-dense-dark-sidebar-v110.css",
  "/css/06-dense-operational-views.css",
  "/css/07-operational-polish-20260627.css",
  "/css/08-sora-redesign-20260706.css",
  "/css/10-modern-calendar.css",
  "/css/11-fiscal-forms.css",
  "/css/12-global-search.css",
  "/css/13-data-quality.css",
  "/css/16-order-shopee-workflows.css",
  "/assets/tabler-icons/tabler-icons.min.css",
  "/theme-init.js",
  "/supabase-config.js",
  "/js/app.js",
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
