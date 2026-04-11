// Your Deputy — Service Worker
// Network-first for HTML navigations (homepage must update after deploy).
// Cache-first for other same-origin GETs. Network-first for /api, /app, /admin.
const CACHE_NAME = 'deputy-v3';
// Do not precache '/' — it caused stale homepages until users cleared site data.
const STATIC_ASSETS = ['/privacy', '/terms'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/') || url.pathname === '/app' || url.pathname === '/admin') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  const accept = event.request.headers.get('accept') || '';
  const isHtmlNavigation =
    event.request.mode === 'navigate' ||
    (event.request.method === 'GET' && accept.includes('text/html'));

  if (isHtmlNavigation) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const copy = resp.clone();
          if (resp.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(resp => {
      const clone = resp.clone();
      if (resp.ok) {
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
      }
      return resp;
    }))
  );
});
