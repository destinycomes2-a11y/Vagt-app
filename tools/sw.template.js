/* Vagt-app service worker: offline-cache + modtagelse af delte filer (Web Share Target) */
const VERSION='__VERSION__';
const CACHE='vagtapp-'+VERSION;
const SHARE='vagtapp-share';
const ASSETS=['./','index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/maskable-192.png','icons/maskable-512.png','icons/apple-touch-icon.png','icons/favicon-48.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS.map(a=>new Request(a,{cache:'reload'})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('vagtapp-')&&k!==CACHE&&k!==SHARE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  /* Andre domæner (Google Identity, Calendar API) må ikke caches – appen skal kunne åbne offline. */
  if(url.origin!==location.origin)return;
  if(req.method==='POST'&&url.pathname.endsWith('/share-target')){e.respondWith(takeShare(req));return;}
  if(req.method!=='GET')return;
  if(req.mode==='navigate'){
    /* netværk først (så opdateringer kommer med), ellers den gemte app */
    e.respondWith(fetch(req).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put('index.html',cp));}return r;}).catch(()=>caches.match('index.html',{ignoreSearch:true}).then(r=>r||caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req,{ignoreSearch:true}).then(r=>r||fetch(req).then(n=>{if(n.ok){const cp=n.clone();caches.open(CACHE).then(c=>c.put(req,cp));}return n;})));
});
async function takeShare(req){
  const scope=self.registration.scope;
  try{
    const fd=await req.formData();
    let f=fd.get('file');if(!(f&&typeof f!=='string'))f=[...fd.values()].find(v=>v&&typeof v!=='string')||null;
    const c=await caches.open(SHARE);
    if(f)await c.put(new URL('_share/file',scope).href,new Response(f,{headers:{'content-type':f.type||'text/plain','x-filename':encodeURIComponent(f.name||'vagtplan.ics')}}));
  }catch(err){}
  return Response.redirect(new URL('./?share=1',scope).href,303);
}
