const CACHE='dbt-games-pwa-v6';
const CORE=[
  '/', '/flex/', '/manifest.webmanifest',
  '/style.css','/launcher.css','/flex-home.css','/premium.css','/live-hub.css',
  '/premium-core.css','/premium-gamefeel.css','/premium-effects.css','/premium-accessibility.css',
  '/classic-socket-hook.js','/app.js','/launcher.js','/classic-enhancements.js',
  '/premium-core.js','/premium-gamefeel.js','/premium-effects.js','/premium-accessibility.js',
  '/premium-reconnect.css','/premium-reconnect.js','/premium-multiplayer-loader.js',
  '/flex/flex.css','/flex/flex-premium.css','/flex/socket-hook.js','/flex/flex.js','/flex/enhancements.js',
  '/dbt-app-icon.svg','/dbt-app-icon-maskable.svg'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(CORE.map(url=>cache.add(new Request(url,{cache:'reload'}))));
    // Deliberately do not skipWaiting(): an active multiplayer tab keeps its current
    // worker until the session is naturally closed/reloaded, avoiding mixed asset versions.
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
  })());
});

async function networkFirst(request,fallback){
  const cache=await caches.open(CACHE);
  try{
    const response=await fetch(request);
    if(response && response.ok) cache.put(request,response.clone()).catch(()=>{});
    return response;
  }catch{
    return (await cache.match(request)) || (fallback ? await cache.match(fallback) : undefined) || Response.error();
  }
}

async function cacheFirst(request){
  const cache=await caches.open(CACHE);
  const hit=await cache.match(request);
  if(hit){
    fetch(request).then(response=>{if(response?.ok) cache.put(request,response.clone()).catch(()=>{});}).catch(()=>{});
    return hit;
  }
  const response=await fetch(request);
  if(response?.ok) cache.put(request,response.clone()).catch(()=>{});
  return response;
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  if(url.pathname.startsWith('/socket.io/')||url.pathname.startsWith('/api/')||url.pathname==='/analytics') return;

  if(request.mode==='navigate'){
    event.respondWith(networkFirst(request,'/'));
    return;
  }
  if(['script','style','worker'].includes(request.destination)){
    event.respondWith(networkFirst(request));
    return;
  }
  if(['image','audio','font','manifest'].includes(request.destination)){
    event.respondWith(cacheFirst(request));
  }
});
