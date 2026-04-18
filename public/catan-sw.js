/**
 * catan-sw.js — Service Worker for Catan: Cities & Knights PWA
 *
 * Network-first for HTML navigation and PeerJS CDN.
 * Cache-first for hashed assets (JS, CSS, images).
 */

const CACHE_NAME = "catan-v1";

const PRECACHE_URLS = [
  "/superior-series/catan/",
  "/superior-series/catan-manifest.json",
  "/superior-series/catan-icons/icon-192.png",
  "/superior-series/catan-icons/icon-512.png",
  "/superior-series/catan-icons/icon-192.svg",
  "/superior-series/catan-icons/icon-512.svg",
];

// Install: precache shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

// Activate: delete old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

// Fetch: cache-first for own assets, network-first for CDN
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Network-first for PeerJS CDN
  if (url.hostname === "unpkg.com") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  // Own origin
  if (url.origin === self.location.origin) {
    // Network-first for navigation (HTML pages) so Cmd+R always gets fresh content
    if (event.request.mode === "navigate") {
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            const clone = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, clone));
            return response;
          })
          .catch(() => caches.match(event.request)),
      );
      return;
    }
    // Cache-first for hashed assets (JS, CSS, images) — safe since Astro content-hashes filenames
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      }),
    );
  }
});
