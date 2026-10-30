/* Loads the PWA in headless Chrome: ICS import, placeholder message, offline reload.
   No real shift data. Run: node tools/test-offline-load.js */
'use strict';
const {spawn}=require('child_process');
const http=require('http');
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const artifacts='/opt/cursor/artifacts';
let failed=0;
function assert(cond,msg){if(!cond){failed++;console.error('FAIL:',msg);}else console.log('ok:',msg);}

function serve(){
  const types={'.html':'text/html;charset=utf-8','.js':'text/javascript','.webmanifest':'application/manifest+json','.png':'image/png'};
  return new Promise(res=>{
    const s=http.createServer((req,rep)=>{
      let p=decodeURIComponent((req.url||'/').split('?')[0]);
      if(p.endsWith('/'))p+='index.html';
      const fp=path.normalize(path.join(root,p));
      if(!fp.startsWith(root)){rep.writeHead(403);rep.end();return;}
      fs.readFile(fp,(err,buf)=>{
        if(err){rep.writeHead(404);rep.end('missing');return;}
        rep.writeHead(200,{'content-type':types[path.extname(fp)]||'application/octet-stream','cache-control':'no-store'});
        rep.end(buf);
      });
    });
    s.listen(0,'127.0.0.1',()=>res(s));
  });
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

async function main(){
  const server=await serve();
  const port=server.address().port;
  const url='http://127.0.0.1:'+port+'/';
  const profile='/tmp/vagt-chrome-'+Date.now();
  const chrome=spawn('google-chrome',[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--remote-debugging-port=9333','--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore'});
  let ws,pageWs;
  const shots=[];
  try{
    let ver=null;
    for(let i=0;i<40&&!ver;i++){
      try{const r=await fetch('http://127.0.0.1:9333/json/version');if(r.ok)ver=await r.json();}catch(e){}
      if(!ver)await sleep(200);
    }
    if(!ver)throw new Error('Chrome debugging port did not open');
    const created=await fetch('http://127.0.0.1:9333/json/new?'+encodeURIComponent(url),{method:'PUT'});
    let target;
    if(created.ok)target=await created.json();
    else{
      const listed=await (await fetch('http://127.0.0.1:9333/json')).json();
      target=listed.find(t=>t.type==='page');
    }
    if(!target||!target.webSocketDebuggerUrl)throw new Error('no page target '+JSON.stringify(target));
    pageWs=target.webSocketDebuggerUrl;
    ws=new WebSocket(pageWs);
    await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
    let seq=0;const pending=new Map();const events=[];
    ws.addEventListener('message',ev=>{
      const m=JSON.parse(ev.data);
      if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.rej(new Error(JSON.stringify(m.error)));else p.res(m.result);}
      else if(m.method)events.push(m);
    });
    const send=(method,params={})=>new Promise((res,rej)=>{const id=++seq;pending.set(id,{res,rej});ws.send(JSON.stringify({id,method,params}));});
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Page.navigate',{url});
    for(let i=0;i<50;i++){
      const st=await send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});
      if(st.result&&st.result.value==='complete')break;
      await sleep(100);
    }
    await sleep(300);
    const exceptions=events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails&&e.params.exceptionDetails.text);
    assert(!exceptions.length,'page load has no exceptions: '+(exceptions.join('; ')||'none'));
    async function val(expr){
      const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
      if(r.exceptionDetails)throw new Error(expr+' → '+(r.exceptionDetails.text||'')+' '+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||''));
      return r.result.value;
    }
    assert((await val('document.title'))==='Vagt-app','title is Vagt-app');
    assert((await val(`document.querySelector('#btnGoogleConnectStart').textContent`))==='Forbind Google Kalender','start card has Forbind Google Kalender');
    assert((await val(`document.querySelector('#btnQuick').textContent`)).includes('Hent vagtplan fra KMD'),'file import button is still there');
    assert((await val(`document.querySelector('#googleSetupStart').textContent`)).includes('INDSÆT')===false && (await val(`document.querySelector('#googleSetupStart').textContent`)).includes('GOOGLE_CLIENT_ID'),'setup hint names the constant');
    await shot(send,'start_google_and_kmd.png');
    assert((await val(`document.querySelector('#googleSetupStart').classList.contains('hide')`))===true,'setup hint is hidden when the client id is set');
    const imported=await val(`(async()=>{
      const ics='BEGIN:VCALENDAR\\nBEGIN:VEVENT\\nUID:test-summer@example.com\\nCREATED:20260115T100000Z\\nDTSTART:20261026T130000Z\\nDTEND:20261026T210000Z\\nSUMMARY:Normal Tjeneste\\nEND:VEVENT\\nEND:VCALENDAR\\n';
      const file=new File([ics],'vagtplan.ics',{type:'text/calendar'});
      const dt=new DataTransfer();dt.items.add(file);
      const input=document.querySelector('#quickFile');
      input.files=dt.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));
      for(let i=0;i<30&&!VagtApp.S.shifts['test-summer@example.com'];i++)await new Promise(r=>setTimeout(r,50));
      const s=VagtApp.S.shifts['test-summer@example.com'];
      return s?{start:s.start,end:s.end,corrected:s.corrected,type:s.type}:null;
    })()`);
    assert(imported&&imported.start==='2026-10-26T15:00'&&imported.end==='2026-10-26T23:00'&&imported.corrected===true&&imported.type==='normal','file import still applies the winter-time correction');
    const same=await val(`(()=>{
      const ev=[{iCalUID:'test-summer@example.com',status:'confirmed',summary:'Normal Tjeneste',created:'2026-01-15T10:00:00Z',start:{dateTime:'2026-10-26T14:00:00+01:00'},end:{dateTime:'2026-10-26T22:00:00+01:00'}}];
      VagtApp.S.devs={keep:{id:'keep',date:'2026-10-26',type:'Sygdom',note:'behold'}};
      const before=JSON.stringify(VagtApp.S.devs);
      const rec=VagtApp.googleEventsToRecords(ev,{fix:true,scope:'all',from:''}).records[0];
      const file=VagtApp.S.shifts['test-summer@example.com'];
      const m=VagtApp.mergeShiftRecords([rec],true);
      VagtApp.S.meta.google={calendarId:'shift@group.calendar.google.com',calendarSummary:'540_647360',lastSync:new Date().toISOString(),added:m.added,changed:m.changed,removed:m.removed};
      VagtApp.save();
      VagtApp.renderAll();
      const bar=document.querySelector('#googleStatusTop').textContent;
      const syncHidden=document.querySelector('#btnGoogleSyncTop').classList.contains('hide');
      const chip=(document.querySelector('#cal').innerText||'');
      return {start:rec.start,match:rec.start===file.start&&rec.end===file.end&&rec.type===file.type,devs:JSON.stringify(VagtApp.S.devs)===before,changed:m.changed,bar,syncHidden,chip:chip.includes('15:00')};
    })()`);
    assert(same&&same.match&&same.devs&&same.start==='2026-10-26T15:00','in-page mapping matches the imported ICS shift and keeps the deviation');
    assert(same.syncHidden===false&&same.bar.includes('Sidst opdateret')&&same.bar.includes('540_647360'),'connected state shows last sync and the update button');
    assert(same.chip,'calendar shows the corrected 15:00 time');
    await shot(send,'calendar_shift_corrected.png');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
    await sleep(200);
    await shot(send,'calendar_mobile.png');
    await send('Emulation.clearDeviceMetricsOverride');
    await sleep(100);
    await val(`document.querySelector('[data-tab="import"]').click()`);
    await sleep(150);
    const imp=await val(`document.querySelector('#btnGoogleConnect').textContent+'|'+(document.querySelector('#googleSetup')&&document.querySelector('#googleSetup').className)+'|'+document.querySelector('#btnGoogleSync').className`);
    assert(imp.startsWith('Forbind Google Kalender'),'import tab has the connect button');
    assert((await val(`document.querySelector('#googleSetup').classList.contains('hide')`))===true,'setup note is hidden when the client id is set');
    assert((await val(`document.querySelector('#btnGoogleSync').classList.contains('hide')`))===false,'update button is shown when a calendar is saved');
    await shot(send,'import_google_setup.png');
    const ready=await val(`(async()=>{
      if(!('serviceWorker' in navigator))return 'no-sw';
      await navigator.serviceWorker.ready;
      if(!navigator.serviceWorker.controller)location.reload();
      return navigator.serviceWorker.controller?'controlled':'registered';
    })()`);
    if(ready!=='controlled'){
      await sleep(500);
      for(let i=0;i<20;i++){const c=await val(`navigator.serviceWorker.controller?'yes':'no'`);if(c==='yes')break;await sleep(150);}
    }
    assert((await val(`navigator.serviceWorker.controller?'yes':'no'`))==='yes','service worker controls the page before offline reload');
    const cached=await val(`(async()=>{
      const names=await caches.keys();
      const urls=[];
      for(const n of names){const c=await caches.open(n);for(const req of await c.keys())urls.push(req.url);}
      return urls;
    })()`);
    assert(Array.isArray(cached)&&cached.some(u=>u.includes('index.html')),'app shell is in the cache');
    assert(!cached.some(u=>/google|gstatic|googleapis/i.test(u)),'cache does not contain Google URLs: '+cached.join(' '));
    await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await send('Page.reload',{ignoreCache:true});
    for(let i=0;i<50;i++){
      try{
        const st=await send('Runtime.evaluate',{expression:'document.readyState+" "+document.title',returnByValue:true});
        if(st.result&&st.result.value&&st.result.value.startsWith('complete')&&st.result.value.includes('Vagt-app'))break;
      }catch(e){}
      await sleep(150);
    }
    await sleep(400);
    const offEx=events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails&&(e.params.exceptionDetails.exception&&e.params.exceptionDetails.exception.description||e.params.exceptionDetails.text));
    assert((await val('document.title'))==='Vagt-app','offline reload still shows the app');
    assert((await val(`document.querySelector('#btnGoogleConnect')?document.querySelector('#btnGoogleConnect').textContent:''`))==='Forbind Google Kalender','offline reload still has the Google button');
    const still=await val(`VagtApp&&VagtApp.S&&VagtApp.S.shifts['test-summer@example.com']&&VagtApp.S.shifts['test-summer@example.com'].start`);
    assert(still==='2026-10-26T15:00','shift stored in the browser survives the offline reload');
    assert(!offEx.some(t=>/gsi|accounts\\.google/.test(String(t))),'offline reload does not throw from the Google script');
    await shot(send,'offline_app_still_open.png');
    console.log('cached',cached.length,'urls; offline exceptions',offEx);
  }finally{
    if(ws)try{ws.close();}catch(e){}
    chrome.kill('SIGKILL');
    server.close();
    await sleep(300);
    try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});}catch(e){console.warn('profile cleanup',e.message);}
  }
  if(failed){console.error('\n'+failed+' failed');process.exit(1);}
  console.log('\noffline and browser checks passed');
  async function shot(send,name){
    if(!process.env.SHOTS)return;
    const img=await send('Page.captureScreenshot',{format:'png'});
    const dest=path.join(artifacts,name);
    fs.writeFileSync(dest,Buffer.from(img.data,'base64'));
    shots.push(dest);
    console.log('shot',dest);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
