const CACHE_NAME = 'talenzo-v3';
const APP_SHELL = ['/', '/manifest.webmanifest', '/icons/talenzo-brand-mark.png', '/icons/app-icon-192.png', '/icons/app-icon-512.png'];

const cacheResponse = (event, request, response) => {
  if (!response.ok || response.type !== 'basic') return;

  // Clone before starting async cache work. The page may consume the original
  // response while caches.open() is pending.
  const cachedResponse = response.clone();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.put(request, cachedResponse))
      .catch(() => {})
  );
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => (key.startsWith('ipcs-student-portal-') || key.startsWith('talenzo-')) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cacheResponse(event, '/', response);
          return response;
        })
        .catch(async () => (await caches.match('/')) || Response.error())
    );
    return;
  }

  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cacheResponse(event, request, response);
          return response;
        })
        .catch(async () => (await caches.match(request)) || Response.error())
    );
  }
});
