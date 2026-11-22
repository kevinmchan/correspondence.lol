// Online, every page and file is fetched from the network and revalidated, so a
// deploy shows up on the next load. The cache is only what the app falls back
// on when offline. Bump VERSION when the precache list changes.
const VERSION = 'v21';
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
  '/shared/profile.js',
  '/vendor/realtime.js',
  '/room/',
  '/room/room.js',
  '/postmarks/',
  '/postmarks/postmarks.css',
  '/postmarks/game.js',
  '/postmarks/howto.js',
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

  // Pages are cached by path, so /room/?id=… falls back to the room page.
  const key = request.mode === 'navigate' ? url.pathname : request;

  event.respondWith(
    // 'no-cache' makes the browser check with the server instead of trusting
    // its own HTTP cache, which GitHub Pages lets go ten minutes stale.
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(key, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cached = (await caches.match(key)) || (request.mode === 'navigate' && (await caches.match('/')));
        return cached || Response.error();
      })
  );
});
