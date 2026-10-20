// Scope-specific caches keep project sites on the same GitHub Pages origin separate.
const CACHE_PREFIX = 'ai-desk-hub:' + self.registration.scope + ':';
const CACHE_NAME = CACHE_PREFIX + 'v0.5.0';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './projects-seed.json', './icon-192.png', './icon-512.png','./workspace.css','./calendar.js','./return.js','./return.css','./vendor/fullcalendar-6.1.19.min.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // External APIs/catalogs stay network-only. The app handles its local catalog fallback.
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  // Only cache the explicit app shell, never unrelated pages or arbitrary responses.
  const asset = ASSETS.find(path => new URL(path, self.registration.scope).href === url.href);
  if (!asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request, {cache: 'no-cache'});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      await cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      throw error;
    }
  })());
});
