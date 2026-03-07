// Basic cache-first PWA service worker for GitHub Pages.
const CACHE_NAME = "timetable-screen-v19";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./noise.html",
  "./activities.css",
  "./activities.js",
  "./brainbreak.html",
  "./brainbreak.js",
  "./timer.html",
   "./timer.js",
  "./whiteboard.html",
  "./whiteboard.css",
  "./whiteboard.js",
   "./whiteboard.geometry.js",
   "./whiteboard.io.js",
   "./whiteboard.render.js",
   "./whiteboard.shared.js",
   "./whiteboard.ui.js",
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

  const url = new URL(req.url);

  // Only handle same-origin requests (your own files)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        // If network works, update cache
        if (networkRes && networkRes.ok) {
          const copy = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, copy);
          });
        }
        return networkRes;
      })
      .catch(() => {
        // If offline, fall back to cache
        return caches.match(req).then((cached) => {
          if (cached) return cached;

          // Fallback for navigation
          if (req.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
      })
  );
});
