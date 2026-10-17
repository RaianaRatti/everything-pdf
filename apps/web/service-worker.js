// Offline support. The build fills in PRECACHE (every file the app is made of) and VERSION
// (a hash of that list), so each deploy gets a fresh cache and old ones are cleaned up.
const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const CACHE = `everything-pdf-${VERSION}`;
// The OCR engine and language data come from this CDN on first use; keep them for offline use.
const RUNTIME_CACHE = "everything-pdf-cdn";
const CDN = "https://cdn.jsdelivr.net/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
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
            .filter((key) => key !== CACHE && key !== RUNTIME_CACHE)
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

  // Pages: try the network for the latest version, fall back to the cached app shell. Every
  // route is the same single-page app.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }

  if (url.origin === self.location.origin || request.url.startsWith(CDN)) {
    const cacheName = url.origin === self.location.origin ? CACHE : RUNTIME_CACHE;
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(cacheName).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
