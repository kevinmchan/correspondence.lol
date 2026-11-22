// Bump VERSION when the precache list changes shape; ordinary edits to the
// files below are picked up automatically (see fetch strategies).
const VERSION = 'v8';
const CACHE = `correspondence-${VERSION}`;

const PRECACHE = [
  '/',
  '/styles.css',
  '/app.js',
  '/home.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/shared/api.js',
  '/shared/chat.js',
  '/shared/config.js',
  '/shared/identity.js',
  '/shared/live.js',
  '/vendor/realtime.js',
  '/room/',
  '/room/room.js',
  '/postmarks/',
  '/postmarks/postmarks.css',
  '/postmarks/game.js',
  '/postmarks/ui.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: network first so deploys show up immediately; cached copy offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(url.pathname, copy)));
          }
          return response;
        })
        .catch(async () => (await caches.match(url.pathname)) || caches.match('/'))
    );
    return;
  }

  // Assets: serve from cache instantly, refresh the cache in the background.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }
      return refresh;
    })
  );
});
