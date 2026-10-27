// Scope-specific caches keep project sites on the same GitHub Pages origin separate.
const CACHE_PREFIX = 'ai-desk-hub:' + self.registration.scope + ':';
const CACHE_NAME = CACHE_PREFIX + 'v0.7.1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './projects-seed.json', './icon-192.png', './icon-512.png','./workspace.css','./desk-layout.css','./calendar.js','./return.js','./return.css','./radar.css','./timeline.css','./companion.css','./companion.js','./topics.js','./topics.css','./topics-feed.json','./wallpapers.js','./assets/wallpapers/wheat-field.jpg','./assets/wallpapers/montmartre.jpg','./assets/wallpapers/jalais-hill.jpg','./assets/wallpapers/heart-andes.jpg','./assets/wallpapers/rocky-mountains.jpg','./assets/wallpapers/forest.jpg','./assets/wallpapers/alpine-lake.jpg','./assets/wallpapers/misty-hills.jpg','./assets/wallpapers/sand-dunes.jpg','./assets/wallpapers/ocean.jpg','./THIRD_PARTY_NOTICES.md','./vendor/fullcalendar-6.1.19.min.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS.map(path => new Request(new URL(path,self.registration.scope),{cache:'reload'})))).then(() => self.skipWaiting()));
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
  // A release query bypasses the browser HTTP cache, but shares the offline shell key.
  const canonical = new URL(url);
  canonical.searchParams.delete('v');
  const asset = ASSETS.find(path => new URL(path, self.registration.scope).href === canonical.href);
  if (!asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request, {cache: 'no-cache'});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      await cache.put(canonical.href, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(canonical.href);
      if (cached) {
        if(asset==='./topics-feed.json'){const headers=new Headers(cached.headers);headers.set('X-Desk-Cache','offline');return new Response(cached.body,{status:cached.status,headers});}
        return cached;
      }
      throw error;
    }
  })());
});
