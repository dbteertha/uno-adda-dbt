const CORE_CACHE='dbt-games-core-v10';
const RUNTIME_CACHE='dbt-games-runtime-v10';
const CACHE_PREFIX='dbt-games-';
const MAX_RUNTIME_ENTRIES=104;
const CORE=[
  '/', '/flex/', '/manifest.webmanifest',
  '/style.css','/launcher.css','/flex-home.css','/premium.css','/live-hub.css',
  '/premium-core.css','/premium-gamefeel.css','/premium-effects.css','/premium-accessibility.css',
  '/premium-audio.js','/premium-audio-mixer.css','/premium-audio-mixer.js',
  '/premium-social.css','/premium-social.js','/premium-progression.css','/premium-progression.js',
  '/premium-rooms-v2.css','/premium-rooms-v2.js','/premium-multiplayer.css','/premium-multiplayer.js',
  '/classic-socket-hook.js','/app.js','/launcher.js','/classic-enhancements.js',
  '/premium-core.js','/premium-gamefeel.js','/premium-effects.js','/premium-accessibility.js',
  '/premium-reconnect.css','/premium-reconnect.js','/premium-multiplayer-loader.js',
  '/premium-match-story.css','/premium-match-story.js','/premium-modes.css','/premium-modes.js',
  '/premium-weekly-recent.css','/premium-weekly-recent.js','/premium-voice-lab.css','/premium-voice-lab.js',
  '/voice-chat.css','/voice-chat.js',
  '/flex/flex.css','/flex/flex-premium.css','/flex/socket-hook.js','/flex/flex.js','/flex/enhancements.js',
  '/dbt-app-icon.svg','/dbt-app-icon-maskable.svg'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CORE_CACHE);
    await Promise.allSettled(CORE.map(url=>cache.add(new Request(url,{cache:'reload'}))));
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    const keep=new Set([CORE_CACHE,RUNTIME_CACHE]);
    await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&!keep.has(key)).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  if(event.data?.type==='DBT_APPLY_UPDATE') self.skipWaiting();
});

async function trimRuntime(){
  const cache=await caches.open(RUNTIME_CACHE);
  const keys=await cache.keys();
  if(keys.length<=MAX_RUNTIME_ENTRIES) return;
  await Promise.all(keys.slice(0,keys.length-MAX_RUNTIME_ENTRIES).map(key=>cache.delete(key)));
}

async function storeRuntime(request,response){
  if(!response?.ok) return;
  const cache=await caches.open(RUNTIME_CACHE);
  await cache.put(request,response.clone()).catch(()=>{});
  await trimRuntime().catch(()=>{});
}

async function matchCached(request){
  return (await caches.match(request,{ignoreSearch:true})) || undefined;
}

async function networkFirst(request,fallback){
  try{
    const response=await fetch(request);
    if(response?.ok) storeRuntime(request,response).catch(()=>{});
    return response;
  }catch{
    return (await matchCached(request)) || (fallback ? await caches.match(fallback,{ignoreSearch:true}) : undefined) || Response.error();
  }
}

async function cacheFirst(request){
  const hit=await matchCached(request);
  if(hit){
    fetch(request).then(response=>{if(response?.ok) storeRuntime(request,response).catch(()=>{});}).catch(()=>{});
    return hit;
  }
  const response=await fetch(request);
  if(response?.ok) storeRuntime(request,response).catch(()=>{});
  return response;
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  if(url.pathname.startsWith('/socket.io/')||url.pathname.startsWith('/api/')||url.pathname==='/analytics') return;

  if(request.mode==='navigate'){
    const fallback=url.pathname.startsWith('/flex')?'/flex/':'/';
    event.respondWith(networkFirst(request,fallback));
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
