/* Mobile screenshots of Måned, Rul, Hændelser and Overenskomst. Synthetic data only.
   node tools/test-ui-views.js */
'use strict';
const {spawn}=require('child_process');
const http=require('http');
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const artifacts='/opt/cursor/artifacts';
let failed=0;
function assert(c,m){if(!c){failed++;console.error('FAIL:',m);}else console.log('ok:',m);}
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
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  const server=await serve();
  const url='http://127.0.0.1:'+server.address().port+'/';
  const profile='/tmp/vagt-ui-'+Date.now();
  const chrome=spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-port=9334','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  let ws;
  try{
    let ver=null;
    for(let i=0;i<40&&!ver;i++){try{const r=await fetch('http://127.0.0.1:9334/json/version');if(r.ok)ver=await r.json();}catch(e){}if(!ver)await sleep(200);}
    if(!ver)throw new Error('Chrome debugging port did not open');
    const created=await fetch('http://127.0.0.1:9334/json/new?'+encodeURIComponent(url),{method:'PUT'});
    const target=created.ok?await created.json():(await (await fetch('http://127.0.0.1:9334/json')).json()).find(t=>t.type==='page');
    ws=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
    let seq=0;const pending=new Map();const events=[];
    ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.rej(new Error(JSON.stringify(m.error)));else p.res(m.result);}else if(m.method)events.push(m);});
    const send=(method,params={})=>new Promise((res,rej)=>{const id=++seq;pending.set(id,{res,rej});ws.send(JSON.stringify({id,method,params}));});
    await send('Page.enable');await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
    await send('Page.navigate',{url});
    for(let i=0;i<50;i++){const st=await send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});if(st.result&&st.result.value==='complete')break;await sleep(100);}
    await sleep(300);
    async function val(expr){
      const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
      if(r.exceptionDetails)throw new Error((r.exceptionDetails.exception&&r.exceptionDetails.exception.description)||r.exceptionDetails.text||expr);
      return r.result.value;
    }
    async function shot(name){
      const img=await send('Page.captureScreenshot',{format:'png'});
      const dest=path.join(artifacts,name);
      fs.writeFileSync(dest,Buffer.from(img.data,'base64'));
      console.log('shot',dest);
    }
    const seeded=await val(`(()=>{
      const S=VagtApp.S;
      S.shifts={};
      S.devs={};
      S.notes={};
      S.settings.norm=37;S.settings.rulWeeks=6;S.settings.rulStart='2026-10-26';S.settings.waiver={on:false,date:'',to:'',note:''};
      const add=(id,date,start,end,summary,allDay)=>{
        const type=summary.indexOf('Ferie')===0?'ferie':/Frid|PF|søgne/i.test(summary)?'fridogn':/Arbejdsfri|^Fri$|^AD$/.test(summary)?'arbfri':/Afspad/i.test(summary)?'afspad':'normal';
        S.shifts[id]={id,date,summary,type,allDay:!!allDay,source:'ics',hours:allDay?0:8,start:allDay?'':date+'T'+start,end:allDay?'':(end.length>5?end:date+'T'+end),part:false};
      };
      add('d','2026-10-26','07:30','15:30','Normal Tjeneste');
      add('a','2026-10-27','15:00','23:00','Normal Tjeneste');
      S.shifts.n={id:'n',date:'2026-10-28',summary:'Normal Tjeneste',type:'normal',allDay:false,source:'ics',hours:9,start:'2026-10-28T22:45',end:'2026-10-29T07:45',part:false};
      add('pf','2026-10-29','','','Planlagt Fridøgn',true);
      add('fri','2026-10-30','','','Arbejdsfri dag',true);
      add('fe','2026-10-31','','','Ferie',true);
      add('af','2026-11-01','','','Afspadsering',true);
      add('w','2026-11-02','07:30','15:30','Normal Tjeneste');
      add('wpf','2026-11-02','','','PF',true);
      S.devs={x:{id:'x',date:'2026-10-27',type:'Overarbejde',from:'23:00',to:'00:30',note:'ekstra time',sign:1,hours:null}};
      VagtApp.upsertNote('note:d','2026-10-26','Normal Tjeneste 07:30–15:30','Konflikt på stuen. Ingen navne.');
      VagtApp.save();
      VagtApp.setMonth(2026,10);
      VagtApp.showTab('oversigt');
      return document.querySelector('#ovTop').innerText;
    })()`);
    assert(seeded.includes('Dag')&&seeded.includes('PF')&&seeded.includes('Fri')&&seeded.includes('Ferie'),'month grid shows Dag, PF, Fri and Ferie');
    const cell30=await val(`JSON.stringify({cell:document.querySelector('[data-ovdate="2026-10-30"]').innerText, shift:VagtApp.S.shifts.fri, mark:VagtApp.dayMark('2026-10-30')})`);
    if(!String(cell30).includes('Fri'))console.log('CELL30',cell30);
    assert(String(cell30).includes('Fri'),'30 October cell is Fri');
    await shot('maaned_view.png');
    await val(`document.querySelector('[data-ovdate="2026-10-26"]').click()`);
    await sleep(150);
    const dag=await val(`({text:document.querySelector('#ovTop').innerText, note:(document.querySelector('#ovTop [data-hn]')||{}).value||''})`);
    if(!(dag&&dag.text&&dag.text.includes('Hændelsesnote')&&dag.note.includes('Konflikt')&&dag.text.includes('07:30')))console.log('DAG',JSON.stringify(dag).slice(0,800));
    assert(dag&&dag.text.includes('Hændelsesnote')&&dag.note.includes('Konflikt')&&dag.text.includes('07:30'),'tapping a day opens Dag with times and the note');
    await val(`VagtApp.showTab('rul')`);
    await sleep(150);
    const rul=await val(`document.querySelector('#sec-rul').innerText`);
    assert(rul.includes('§ 4 stk. 3')&&rul.includes('AD er de resterende dage')&&rul.includes('der er ikke et fast antal')&&!rul.includes('burde'),'rul is a plan-kontrol without an AD target');
    assert(rul.includes('Planen går')&&rul.includes('§ 4 stk. 7'),'conclusion and pause note are shown');
    await shot('rul_plan_kontrol.png');
    await val(`VagtApp.showTab('haendelser')`);
    await sleep(100);
    const hn=await val(`document.querySelector('#sec-haendelser').innerText`);
    assert(hn.includes('Skriv ikke navne eller CPR')&&hn.includes('Konflikt på stuen')&&hn.includes('26-10-2026'),'hændelser lists the note and the privacy hint');
    await shot('haendelser_tab.png');
    await val(`(()=>{VagtApp.showTab('overenskomst');document.getElementById('ok-omlaegning').open=true;document.getElementById('ok-bytte').open=true;return true;})()`);
    await sleep(100);
    const ok=await val(`document.querySelector('#sec-overenskomst').innerText`);
    assert(ok.includes('30,85 kr')&&ok.includes('79.01 § 7')&&ok.includes('Ikke afklaret')&&ok.includes('samme rul'),'overenskomst quotes § 7 and says vagtbytte is not settled');
    await shot('overenskomst_tab.png');
    const ex=events.filter(e=>e.method==='Runtime.exceptionThrown');
    assert(!ex.length,'no page exceptions');
  }finally{
    if(ws)try{ws.close();}catch(e){}
    chrome.kill('SIGKILL');
    server.close();
    await sleep(300);
    try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});}catch(e){}
  }
  if(failed){console.error('\n'+failed+' failed');process.exit(1);}
  console.log('\nui views passed');
}
main().catch(e=>{console.error(e);process.exit(1);});
