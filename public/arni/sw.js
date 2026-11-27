/**
 * Service worker for the Arni vs. Rex PWA.
 *
 * Lives in /arni/ so its scope is /superior-series/arni/ only: it never touches
 * Catan, and it takes priority over Catan's site-wide worker on Arni's pages.
 *
 * - Pages: network first, cached copy when offline.
 * - /_astro/ bundles: cache first (Astro puts a content hash in their names).
 * - Sprites, icons, manifest: served from cache, refreshed in the background
 *   (their names have no hash, so new art shows up on the next visit).
 */

const CACHE_NAME = "arni-v1";
const BASE = "/superior-series/";

const PRECACHE_URLS = [
  `${BASE}arni/`,
  `${BASE}arni/manifest.webmanifest`,
  `${BASE}arni/icons/icon.svg`,
  `${BASE}arni/icons/icon-192.png`,
  `${BASE}arni/icons/icon-512.png`,
  `${BASE}arni/icons/apple-touch-icon.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("arni-") && k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Servers may answer with "Vary: Origin". Module imports send an Origin header
// and plain fetches don't, so a strict match misses offline. Everything here is
// same-origin, so ignoring Vary is safe.
const MATCH = { ignoreVary: true };

function store(request, response) {
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  }
  return response;
}

// On the very first visit the page loads before this worker controls it, so its
// bundles and sprites never pass through "fetch". The page sends us that list.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "cache-loaded" || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter((u) => {
    try {
      const url = new URL(u);
      return url.origin === self.location.origin && url.pathname.startsWith(BASE);
    } catch {
      return false;
    }
  });
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        urls.map((u) =>
          cache.match(u, MATCH).then((hit) => hit ?? fetch(u).then((r) => (r.ok ? cache.put(u, r) : undefined))).catch(() => {}),
        ),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => store(request, response))
        .catch(() => caches.match(request, MATCH).then((hit) => hit ?? caches.match(`${BASE}arni/`, MATCH))),
    );
    return;
  }

  if (url.pathname.startsWith(`${BASE}_astro/`)) {
    event.respondWith(caches.match(request, MATCH).then((hit) => hit ?? fetch(request).then((r) => store(request, r))));
    return;
  }

  event.respondWith(
    caches.match(request, MATCH).then((hit) => {
      const fresh = fetch(request)
        .then((r) => store(request, r))
        .catch(() => hit);
      if (hit) event.waitUntil(fresh);
      return hit ?? fresh;
    }),
  );
});
