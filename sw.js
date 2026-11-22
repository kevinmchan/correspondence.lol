// Online, every page and file is fetched from the network and revalidated, so a
// deploy shows up on the next load. The cache is only what the app falls back
// on when offline. The version lives in version.js; bump it there.
importScripts('/version.js');
const CACHE = `correspondence-${self.APP_VERSION}`;

const PRECACHE = [
  '/',
  '/styles.css',
  '/app.js',
  '/version.js',
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
  '/shared/push.js',
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

// --- Push notifications ------------------------------------------------------
// The server sends { title, body, url, tag }. One notification per game: a
// newer one for the same game replaces the older.
self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data?.json() ?? {};
  } catch {
    message = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(message.title || 'correspondence.lol', {
      body: message.body || '',
      tag: message.tag,
      renotify: Boolean(message.tag),
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: message.url || '/' },
    })
  );
});

// Tapping a notification goes to its game, reusing an open window if there is one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url === url) || windows[0];
      if (!open) return self.clients.openWindow(url);
      return (open.url === url ? Promise.resolve(open) : open.navigate(url)).then((client) => (client || open).focus());
    })
  );
});
