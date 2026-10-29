// Scope-specific caches keep project sites on the same GitHub Pages origin separate.
const CACHE_PREFIX = 'ai-desk-hub:' + self.registration.scope + ':';
const CACHE_NAME = CACHE_PREFIX + 'v0.10.2';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './projects-seed.json', './icon-192.png', './icon-512.png','./workspace.css','./desk-layout.css','./calendar.js','./return.js','./return.css','./radar.css','./timeline.css','./companion.css','./companion.js','./desk-media.js','./desk-media.css','./attention.js','./attention.css','./push-config.json','./feishu.js','./feishu-config.json','./topics.js','./topics.css','./topics-feed.json','./radar-feed.json','./wallpapers.js','./assets/wallpapers/wheat-field.jpg','./assets/wallpapers/montmartre.jpg','./assets/wallpapers/jalais-hill.jpg','./assets/wallpapers/heart-andes.jpg','./assets/wallpapers/rocky-mountains.jpg','./assets/wallpapers/forest.jpg','./assets/wallpapers/alpine-lake.jpg','./assets/wallpapers/misty-hills.jpg','./assets/wallpapers/sand-dunes.jpg','./assets/wallpapers/ocean.jpg','./THIRD_PARTY_NOTICES.md','./vendor/fullcalendar-6.1.19.min.js'];
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
        if(asset==='./topics-feed.json'||asset==='./radar-feed.json'){const headers=new Headers(cached.headers);headers.set('X-Desk-Cache','offline');return new Response(cached.body,{status:cached.status,headers});}
        return cached;
      }
      throw error;
    }
  })());
});

self.addEventListener('push',event=>{
 let data;try{data=event.data.json();}catch{data={};}
 const kind=data.type==='test'?'test':'reminder';
 // Every push displays a visible notification, including messages received in foreground.
 event.waitUntil(self.registration.showNotification('AI Desk Hub',{
 body:kind==='test'?'后台通知测试，请返回 APP 确认。':Date.now()>data.expiresAt?'你有一条日程提醒，请查看工作台。':'重要日程即将开始，请查看全天安排。',
 icon:new URL('./icon-192.png',self.registration.scope).href,
 tag:'desk-'+String(data.key||'reminder').slice(0,90),data:{page:'today'}
 }).then(()=>self.clients.matchAll({type:'window',includeUncontrolled:true})).then(clients=>{for(const client of clients)client.postMessage({type:'desk-push',kind});}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});const client=clients.find(c=>c.url.startsWith(self.registration.scope));if(client){await client.focus();client.postMessage({type:'desk-open'});}else await self.clients.openWindow(self.registration.scope);})());
});
