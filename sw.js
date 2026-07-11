const CACHE_NAME = "ad-smashers-manager-v1.0";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest?v=1.0",
  "./styles.css?v=1.0",
  "./js/config.js?v=1.0",
  "./js/core.js?v=1.0",
  "./js/data.js?v=1.0",
  "./js/sessions.js?v=1.0",
  "./js/payments.js?v=1.0",
  "./js/session-stage.js?v=1.0",
  "./js/render-shell.js?v=1.0",
  "./js/render-dashboard.js?v=1.0",
  "./js/render-sessions.js?v=1.0",
  "./js/render-directories.js?v=1.0",
  "./js/render-payments.js?v=1.0",
  "./js/render-settings-modals.js?v=1.0",
  "./js/messages.js?v=1.0",
  "./js/firebase-rest.js?v=1.0",
  "./js/browser-runtime.js?v=1.0",
  "./js/events.js?v=1.0",
  "./app.js?v=1.0",
  "./assets/ad-smashers-logo.png",
  "./assets/ad-smashers-logo.png?v=1.0"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "CLEAR_CACHES") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    }))
  );
});
