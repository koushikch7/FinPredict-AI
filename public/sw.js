/* FinPredict-AI service worker.
   Strategy:
   - Static assets (JS/CSS/images/fonts/icons) → cache-first, with network refresh.
   - HTML navigations → network-first, fall back to cached `/` shell when offline.
   - API requests (`/api/...`) → never intercepted (always live; data freshness wins).
   The cache name is bumped on every deploy via the build-injected version.
*/

const VERSION = self.__FINPREDICT_VERSION__ || 'v1';
const STATIC_CACHE = `finpredict-static-${VERSION}`;
const RUNTIME_CACHE = `finpredict-runtime-${VERSION}`;
const APP_SHELL = '/';

// Pre-cache the app shell + key icons so the first offline load works.
const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/logo.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

// Allow the page to trigger an update (used by the in-app "New version available" toast).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle same-origin (cross-origin CDN/font requests fall through to network).
  if (url.origin !== self.location.origin) return;

  // 1) NEVER cache API or auth — always live.
  if (url.pathname.startsWith('/api/')) return;

  // 2) Navigations → network-first, fall back to cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Stash the latest shell for offline.
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(APP_SHELL, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(APP_SHELL).then((r) => r || new Response('Offline', { status: 503 }))),
    );
    return;
  }

  // 3) Hashed JS/CSS chunks (`/assets/*`) → cache-first (immutable).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
    return;
  }

  // 4) Other static (icons / fonts / images) → stale-while-revalidate.
  event.respondWith(
    caches.open(RUNTIME_CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const networked = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || networked;
      }),
    ),
  );
});
