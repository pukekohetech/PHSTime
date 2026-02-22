// Basic cache-first PWA service worker for GitHub Pages.
const CACHE_NAME = "timetable-screen-v10";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./noise.html",
  "./activities.css",
  "./activities.js",
  "./brainbreak.js",
  "./timer.html",
  "./manifest.webmanifest",
  "./favicon.ico",
  "./apple-touch-icon.png",
  "./sw.js",
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png",
  "./icons/icon-192x192-maskable.png",
  "./icons/icon-512x512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          const url = new URL(req.url);
          if (url.origin === self.location.origin && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          if (req.mode === "navigate") return caches.match("./index.html");
          return cached;
        });
    })
  );
});
