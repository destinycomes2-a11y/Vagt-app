/* Synthetic fixtures only – no real shift plans. Run: node tools/test-google-sync.js */
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const tmpl=fs.readFileSync(path.join(root,'tools','sw.template.js'),'utf8');

let failed=0;
function assert(cond,msg){if(!cond){failed++;console.error('FAIL:',msg);}else console.log('ok:',msg);}
function eq(a,b,msg){const as=JSON.stringify(a),bs=JSON.stringify(b);if(as!==bs){failed++;console.error('FAIL:',msg,'\n got ',as,'\n want',bs);}else console.log('ok:',msg);}

const start=html.indexOf("'use strict'");
const end=html.lastIndexOf('\ninit();');
if(start<0||end<0){console.error('could not slice app script');process.exit(1);}
const js=html.slice(start,end);
const context={console,URL,encodeURIComponent};
context.window=context;
context.globalThis=context;
vm.createContext(context);
try{
  vm.runInContext(js+'\nthis.API={parseIcs,icsToRecords,googleEventsToIcs,googleEventsToRecords,mergeShiftRecords,googleConfigured,pickDefaultCalendar,fetchGoogleEvents,googleApiList,googleFixOpts,GOOGLE_CLIENT_ID,GOOGLE_CALENDAR_SCOPE,S,shiftContentKey};',context);
}catch(e){console.error('script failed to evaluate',e);process.exit(1);}
const API=context.API;

assert(API.GOOGLE_CLIENT_ID==='700335373262-6dlmv7b0m7shaj3ol5vp9nm83sba86ad.apps.googleusercontent.com','public web client id is set');
assert(API.GOOGLE_CALENDAR_SCOPE==='https://www.googleapis.com/auth/calendar.readonly','readonly calendar scope');
assert(API.googleConfigured()===true,'a real client id counts as configured');
assert(!/<script[^>]+src=["']https:\/\/accounts\.google\.com/.test(html),'Google script is not a static script tag');
assert(!/accounts\.google\.com/.test(sw),'service worker does not mention Google hosts');
assert(!/accounts\.google\.com/.test(tmpl),'service worker template does not mention Google hosts');
assert(/url\.origin!==location\.origin\)return/.test(sw),'cross-origin fetches are not cached by the service worker');
assert(/const VERSION='/.test(sw),'service worker cache version is set');

const ics=`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test-summer@example.com
CREATED:20260115T100000Z
DTSTART:20260615T110000Z
DTEND:20260615T190000Z
SUMMARY:Normal Tjeneste
END:VEVENT
BEGIN:VEVENT
UID:test-winter@example.com
CREATED:20260115T100000Z
DTSTART:20260115T130000Z
DTEND:20260115T210000Z
SUMMARY:Normal Tjeneste
END:VEVENT
BEGIN:VEVENT
UID:test-allday@example.com
CREATED:20260115T100000Z
DTSTART;VALUE=DATE:20260301
DTEND;VALUE=DATE:20260302
SUMMARY:Planlagt Fridøgn
DESCRIPTION:all day
END:VEVENT
END:VCALENDAR`;
const opt={fix:true,scope:'all',from:''};
function norm(records){
  return records.map(r=>({
    id:r.id,uid:r.uid,date:r.date,start:r.start,end:r.end,hours:r.hours,
    allDay:!!r.allDay,corrected:!!r.corrected,type:r.type,summary:r.summary,source:r.source,
    created:r.created||'',rawStart:r.rawStart||'',rawEnd:r.rawEnd||'',
    uncorrStart:r.uncorrStart||'',uncorrEnd:r.uncorrEnd||''
  })).sort((a,b)=>a.id.localeCompare(b.id));
}
const fromIcs=API.icsToRecords(API.parseIcs(ics),opt);
const golden=[
  {id:'test-summer@example.com',date:'2026-06-15',start:'2026-06-15T15:00',end:'2026-06-15T23:00',hours:8,allDay:false,corrected:true,type:'normal',summary:'Normal Tjeneste'},
  {id:'test-winter@example.com',date:'2026-01-15',start:'2026-01-15T15:00',end:'2026-01-15T23:00',hours:8,allDay:false,corrected:true,type:'normal',summary:'Normal Tjeneste'},
  {id:'test-allday@example.com#2026-03-01',date:'2026-03-01',start:'',end:'',hours:0,allDay:true,corrected:false,type:'fridogn',summary:'Planlagt Fridøgn'}
];
eq(norm(fromIcs.records).map(({id,date,start,end,hours,allDay,corrected,type,summary})=>({id,date,start,end,hours,allDay,corrected,type,summary})),golden.slice().sort((a,b)=>a.id.localeCompare(b.id)),'ICS importer golden times (summer +2h, winter +1h, all-day unchanged)');

const events=[
  {id:'summer1',iCalUID:'test-summer@example.com',status:'confirmed',summary:'Normal Tjeneste',created:'2026-01-15T10:00:00.000Z',start:{dateTime:'2026-06-15T13:00:00+02:00',timeZone:'Europe/Copenhagen'},end:{dateTime:'2026-06-15T21:00:00+02:00',timeZone:'Europe/Copenhagen'}},
  {id:'winter1',iCalUID:'test-winter@example.com',status:'confirmed',summary:'Normal Tjeneste',created:'2026-01-15T10:00:00.000Z',start:{dateTime:'2026-01-15T14:00:00+01:00',timeZone:'Europe/Copenhagen'},end:{dateTime:'2026-01-15T22:00:00+01:00',timeZone:'Europe/Copenhagen'}},
  {id:'all1',iCalUID:'test-allday@example.com',status:'confirmed',summary:'Planlagt Fridøgn',description:'all day',created:'2026-01-15T10:00:00.000Z',start:{date:'2026-03-01'},end:{date:'2026-03-02'}},
  {id:'gone',iCalUID:'cancelled@example.com',status:'cancelled',summary:'Normal Tjeneste',created:'2026-01-15T10:00:00Z',start:{dateTime:'2026-06-16T13:00:00+02:00'},end:{dateTime:'2026-06-16T21:00:00+02:00'}}
];
const icsText=API.googleEventsToIcs(events);
assert(icsText.includes('DTSTART:20260615T110000Z'),'summer API offset becomes the same UTC instant as the ICS feed');
assert(icsText.includes('DTSTART:20260115T130000Z'),'winter API offset becomes the same UTC instant as the ICS feed');
assert(icsText.includes('DTSTART;VALUE=DATE:20260301'),'all-day API date stays a DATE value');
assert(icsText.includes('STATUS:CANCELLED'),'cancelled API event is marked cancelled');
eq(norm(API.googleEventsToRecords(events,opt).records),norm(fromIcs.records),'API events and equivalent ICS produce the same shifts');

const zulu=[{iCalUID:'test-summer@example.com',status:'confirmed',summary:'Normal Tjeneste',created:'2026-01-15T10:00:00Z',start:{dateTime:'2026-06-15T11:00:00Z'},end:{dateTime:'2026-06-15T19:00:00Z'}}];
eq(norm(API.googleEventsToRecords(zulu,opt).records),norm(fromIcs.records).filter(r=>r.id==='test-summer@example.com'),'Zulu dateTime matches the ICS summer event');

const comma=[{iCalUID:'comma@example.com',summary:'Normal Tjeneste, ekstra',created:'2026-02-01T08:00:00Z',start:{dateTime:'2026-06-15T13:00:00.000+02:00'},end:{dateTime:'2026-06-15T21:00:00.000+02:00'}}];
const commaRec=API.googleEventsToRecords(comma,opt).records[0];
assert(commaRec&&commaRec.summary==='Normal Tjeneste, ekstra'&&commaRec.start==='2026-06-15T15:00','summary comma survives and fractional offset is corrected');

const oldNew=[
  {iCalUID:'old@example.com',summary:'Normal Tjeneste',created:'2025-12-01T10:00:00Z',start:{dateTime:'2026-06-15T13:00:00+02:00'},end:{dateTime:'2026-06-15T21:00:00+02:00'}},
  {iCalUID:'new@example.com',summary:'Normal Tjeneste',created:'2026-02-01T10:00:00Z',start:{dateTime:'2026-06-16T13:00:00+02:00'},end:{dateTime:'2026-06-16T21:00:00+02:00'}}
];
const scoped=API.googleEventsToRecords(oldNew,{fix:true,scope:'created',from:'2026-01-01'}).records;
const oldR=scoped.find(r=>r.uid==='old@example.com'),newR=scoped.find(r=>r.uid==='new@example.com');
assert(oldR&&oldR.corrected===false&&oldR.start==='2026-06-15T13:00','events created before fixFrom keep the uncorrected ICS time');
assert(newR&&newR.corrected===true&&newR.start==='2026-06-16T15:00','events created on/after fixFrom get the same correction as ICS');
const scopedIcs=`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:old@example.com
CREATED:20251201T100000Z
DTSTART:20260615T110000Z
DTEND:20260615T190000Z
SUMMARY:Normal Tjeneste
END:VEVENT
BEGIN:VEVENT
UID:new@example.com
CREATED:20260201T100000Z
DTSTART:20260616T110000Z
DTEND:20260616T190000Z
SUMMARY:Normal Tjeneste
END:VEVENT
END:VCALENDAR`;
eq(norm(scoped),norm(API.icsToRecords(API.parseIcs(scopedIcs),{fix:true,scope:'created',from:'2026-01-01'}).records),'fix scope matches the ICS importer');

assert(API.googleFixOpts().fix===true,'default settings still turn the time correction on');
const byDefault=API.googleEventsToRecords(events);
assert(byDefault.records.some(r=>r.id==='test-summer@example.com'&&r.corrected&&r.start==='2026-06-15T15:00'),'default options correct the 2026 summer event');

const series=[
  {iCalUID:'series@google.com',recurringEventId:'series',id:'series_a',originalStartTime:{dateTime:'2026-06-15T13:00:00+02:00'},summary:'Normal Tjeneste',created:'2026-01-15T10:00:00Z',start:{dateTime:'2026-06-15T13:00:00+02:00'},end:{dateTime:'2026-06-15T21:00:00+02:00'}},
  {iCalUID:'series@google.com',recurringEventId:'series',id:'series_b',originalStartTime:{dateTime:'2026-06-16T13:00:00+02:00'},summary:'Normal Tjeneste',created:'2026-01-15T10:00:00Z',start:{dateTime:'2026-06-16T13:00:00+02:00'},end:{dateTime:'2026-06-16T21:00:00+02:00'}}
];
assert(API.googleEventsToRecords(series,opt).records.length===2,'recurring instances are not collapsed onto one UID');

API.S.shifts={
  'test-summer@example.com':{id:'test-summer@example.com',source:'ics',date:'2026-06-15',start:'2026-06-15T13:00',end:'2026-06-15T21:00',hours:8,allDay:false,summary:'Normal Tjeneste',type:'normal',corrected:false},
  'old-ics@example.com':{id:'old-ics@example.com',source:'ics',date:'2026-04-02',start:'2026-04-02T15:00',end:'2026-04-02T23:00',hours:8,allDay:false,summary:'Normal Tjeneste',type:'normal',corrected:true},
  'keep-csv':{id:'keep-csv',source:'csv',date:'2026-06-15',start:'2026-06-15T07:30',end:'2026-06-15T15:30',hours:8,allDay:false,summary:'Normal Tjeneste',type:'normal',corrected:false},
  'outside@example.com':{id:'outside@example.com',source:'ics',date:'2020-01-01',start:'2020-01-01T15:00',end:'2020-01-01T23:00',hours:8,allDay:false,summary:'Normal Tjeneste',type:'normal',corrected:true}
};
API.S.devs={d1:{id:'d1',date:'2026-06-15',type:'Overarbejde',from:'15:00',to:'16:00',note:'behold mig'}};
const devJson=JSON.stringify(API.S.devs);
const merged=API.mergeShiftRecords(API.googleEventsToRecords(events,opt).records,true);
assert(merged.added===2,'merge counts new all-day and winter shifts as added (summer already existed)');
assert(merged.updated===1&&merged.changed===1,'existing summer shift is updated and counted as changed');
assert(merged.removed===1,'ics shift inside the period that disappeared is removed');
assert(API.S.shifts['keep-csv']&&API.S.shifts['outside@example.com'],'csv shifts and ics shifts outside the period stay');
assert(!API.S.shifts['old-ics@example.com'],'missing ics shift inside the period is removed');
assert(API.S.shifts['test-summer@example.com'].start==='2026-06-15T15:00','merged summer shift has the corrected time');
assert(JSON.stringify(API.S.devs)===devJson,'registered deviations are kept');
const again=API.mergeShiftRecords(API.googleEventsToRecords(events,opt).records,true);
assert(again.added===0&&again.changed===0&&again.removed===0,'a second sync does not duplicate or rewrite identical shifts');

const cals=[{id:'primary',summary:'Privat'},{id:'shift',summary:'Opus 540_647360 vagtplan'},{id:'other',summary:'Ferie'}];
eq(API.pickDefaultCalendar(cals),cals[1],'default calendar is the one whose summary contains 540_647360');
API.S.meta.google={calendarId:'other'};
eq(API.pickDefaultCalendar(cals),cals[2],'a remembered calendar wins over the default name');
API.S.meta.google={calendarId:'missing'};
eq(API.pickDefaultCalendar(cals),cals[1],'unknown remembered id falls back to 540_647360');

(async()=>{
  const seen=[];
  context.fetch=async(url,opts)=>{
    const u=new URL(url);
    seen.push({href:u.href,auth:opts.headers.Authorization,cache:opts.cache,params:Object.fromEntries(u.searchParams.entries())});
    const pt=u.searchParams.get('pageToken');
    if(!pt)return {ok:true,status:200,json:async()=>({items:[{id:'p1'}],nextPageToken:'next'})};
    return {ok:true,status:200,json:async()=>({items:[{id:'p2'}]})};
  };
  const items=await API.fetchGoogleEvents('abc@group.calendar.google.com','tok-123');
  eq(items.map(x=>x.id),['p1','p2'],'events.list follows nextPageToken');
  assert(seen.length===2,'two pages were requested');
  assert(seen[0].auth==='Bearer tok-123'&&seen[0].cache==='no-store','events request sends the bearer token and skips HTTP cache');
  assert(seen[0].href.includes('/calendars/'+encodeURIComponent('abc@group.calendar.google.com')+'/events'),'calendar id is encoded in the path');
  const p=seen[0].params;
  assert(p.singleEvents==='true'&&p.orderBy==='startTime','singleEvents and orderBy=startTime are set');
  const t0=Date.now();
  const min=Date.parse(p.timeMin),max=Date.parse(p.timeMax);
  assert(Math.abs(min-(t0-60*86400000))<5000,'timeMin is about 60 days back');
  assert(Math.abs(max-(t0+365*86400000))<5000,'timeMax is about 1 year ahead');
  assert(!seen.some(s=>s.href.includes('INDSÆT')||JSON.stringify(s).includes('Normal Tjeneste')),'the request does not upload shift data');
  if(failed){console.error('\n'+failed+' failed');process.exit(1);}
  console.log('\nall google sync tests passed');
})().catch(e=>{console.error(e);process.exit(1);});
