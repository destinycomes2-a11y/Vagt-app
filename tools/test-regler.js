/* Regler og visning. Kun syntetiske vagter. node tools/test-regler.js */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const start=html.indexOf("'use strict'"),end=html.lastIndexOf('\ninit();');
const js=html.slice(start,end);
const context={console,URL,encodeURIComponent};
context.window=context;context.globalThis=context;
vm.createContext(context);
vm.runInContext(js+'\nthis.API={dayMark,dayWarnings,planBucket,rulStats,rulSpan,notesSorted,notesText,notesCsv,upsertNote,UNCLEAR,shiftKind,typeOf,S,applyState,normFor,backupObj,mergeShiftRecords,parseIcs,icsToRecords,invalidate};',context);
const API=context.API;
let failed=0;
function assert(c,m){if(!c){failed++;console.error('FAIL:',m);}else console.log('ok:',m);}

assert(API.typeOf('Planlagt Fridøgn').k==='fridogn','fridøgn stays a free day');
assert(API.typeOf('PF').k==='fridogn','PF-titel bliver fridøgn');
assert(API.typeOf('Søgnehelligdagsfri').k==='fridogn','søgnehelligdagsfri bliver fridøgn');
assert(API.typeOf('Arbejdsfri dag').k==='arbfri','arbejdsfri dag stays arbfri');
assert(API.typeOf('AD').k==='arbfri','AD-titel bliver arbejdsfri');
assert(API.typeOf('Stregdag').k==='arbfri','stregdag bliver arbejdsfri');
assert(API.typeOf('Ferie').k==='ferie','ferie');
assert(API.typeOf('Afspadsering').k==='afspad','afspadsering');
assert(API.typeOf('Normal Tjeneste').k==='normal','normal tjeneste is still work');

function vagt(id,date,start,end,summary,type,extra){
  const all=extra&&extra.allDay;
  return Object.assign({id,date,summary,type:type||API.typeOf(summary).k,allDay:!!all,source:'ics',hours:all?0:8,start:all?'':start,end:all?'':end,part:false},extra||{});
}
API.S.shifts={
  d1:vagt('d1','2026-01-05','2026-01-05T07:30','2026-01-05T15:30','Normal Tjeneste'),
  d2:vagt('d2','2026-01-06','2026-01-06T08:00','2026-01-06T16:00','Normal Tjeneste'),
  a1:vagt('a1','2026-01-07','2026-01-07T15:30','2026-01-07T23:30','Normal Tjeneste'),
  n1:vagt('n1','2026-01-08','2026-01-08T22:45','2026-01-09T07:45','Normal Tjeneste',null,{hours:9}),
  pf:vagt('pf','2026-01-09','','','Planlagt Fridøgn','fridogn',{allDay:true}),
  ad:vagt('ad','2026-01-10','','','Arbejdsfri dag','arbfri',{allDay:true}),
  fe:vagt('fe','2026-01-11','','','Ferie','ferie',{allDay:true}),
  both:vagt('both','2026-01-12','2026-01-12T07:30','2026-01-12T15:30','Normal Tjeneste'),
  bothpf:vagt('bothpf','2026-01-12','','','PF','fridogn',{allDay:true})
};
API.S.devs={o1:{id:'o1',date:'2026-01-05',type:'Overarbejde',from:'15:30',to:'17:00',hours:null,sign:1}};
API.S.settings.norm=37;API.S.settings.rulWeeks=6;API.S.settings.rulStart='2026-01-05';API.S.settings.waiver={on:false,date:'',to:'',note:''};API.S.settings.nightFixed=false;API.S.settings.lokalWeekendAfsp=true;

assert(API.shiftKind(API.S.shifts.d1).k==='dag'&&API.shiftKind(API.S.shifts.d1).how==='praecis','exact 7:30-15:30 is Dag');
assert(API.shiftKind(API.S.shifts.d2).k==='dag'&&API.shiftKind(API.S.shifts.d2).how==='tid','08:00-16:00 is Dag by time');
assert(API.shiftKind(API.S.shifts.a1).k==='aften','15:30-23:30 is Aften');
assert(API.shiftKind(API.S.shifts.n1).k==='nat','22:45-07:45 is Nat');
assert(API.dayMark('2026-01-05').label==='Dag','month label Dag');
assert(API.dayMark('2026-01-09').label==='PF','month label PF');
assert(API.dayMark('2026-01-10').label==='Fri','month label Fri');
assert(API.dayMark('2026-01-11').label==='Ferie','month label Ferie');
assert(API.dayMark('2026-01-12').label==='Dag','work wins over PF on the same day');
assert(API.dayMark('2026-01-05').dev===true,'deviation shows as a dot flag');

const pfWarn=API.dayWarnings('2026-01-12');
assert(pfWarn.some(w=>w.ok==='fridoegn'&&w.text.includes('79.01 § 9')),'vagt on PF links to § 9 and does not invent a notice');
const late={id:'late',date:'2026-06-15',start:'2026-06-15T15:00',end:'2026-06-15T23:00',hours:8,allDay:false,type:'normal',summary:'Normal Tjeneste',source:'ics',planChangedAt:'2026-06-14T08:00:00.000Z'};
const early={id:'early',date:'2026-06-20',start:'2026-06-20T15:00',end:'2026-06-20T23:00',hours:8,allDay:false,type:'normal',summary:'Normal Tjeneste',source:'ics',planChangedAt:'2026-06-01T08:00:00.000Z'};
API.S.shifts.late=late;API.S.shifts.early=early;
API.S.shifts.r1=vagt('r1','2026-06-16','2026-06-16T07:30','2026-06-16T15:30','Normal Tjeneste');
API.S.shifts.r2=vagt('r2','2026-06-16','2026-06-16T22:00','2026-06-17T06:00','Normal Tjeneste',null,{hours:8});
API.invalidate();
assert(API.dayWarnings('2026-06-15').some(w=>w.ok==='omlaegning'&&w.text.includes('79.01 § 7')&&w.text.includes('30,85')),'change inside 4 døgn points at § 7 and the 31/3 2000 amount');
assert(!API.dayWarnings('2026-06-20').some(w=>w.ok==='omlaegning'),'change more than 4 døgn before does not claim a tillæg');
const hv=API.dayWarnings('2026-06-16');
assert(hv.some(w=>w.ok==='hviletid'&&w.level==='warn'),'under 11 hours without a waiver is a warning');

const span=API.rulSpan(0);
assert(span.from==='2026-01-05'&&span.weeks===6,'rul starts on the entered Monday and lasts 6 weeks');
const st=API.rulStats(span);
assert(st.pfTarget===12,'PF target is 2 per week, 12 in a 6-week rul (79.01 § 4 stk. 3)');
assert(st.adTarget===undefined,'AD has no target number');
assert(st.pf>=1&&st.ad>=1&&st.ferie>=1,'PF, AD and ferie in the plan are counted');
assert(st.dag>=1&&st.aften>=1&&st.nat>=1,'dag, aften and nat are counted');
assert(Math.abs(st.norm.norm-37*6)<0.01,'6 weeks at 37 t is 222 t when the period has no søgnehelligdag');
assert(st.devs['Overarbejde']>0,'overarbejde-afvigelse is kept separate');
assert(API.UNCLEAR.some(u=>u.id==='ad-antal')&&API.UNCLEAR.some(u=>u.id==='vagtbytte')&&API.UNCLEAR.some(u=>u.id==='kroen-nu'),'unclear points are listed, not guessed');

API.upsertNote('note:d1','2026-01-05','Normal Tjeneste 07:30–15:30','Konflikt på stuen. Ingen navne.');
API.upsertNote('note:a1','2026-01-07','Aften','Kort note');
const list=API.notesSorted('2026-01-01','2026-01-31');
assert(list.length===2&&list[0].date==='2026-01-07','notes are newest date first');
assert(API.notesText(list).includes('Ingen navne')&&!API.notesText(list).includes('CPR'),'export text has the note and no CPR field');
assert(API.notesCsv(list).includes('Konflikt på stuen'),'csv export includes the note');
API.upsertNote('note:a1','2026-01-07','Aften','   ');
assert(API.notesSorted('','') .length===1,'empty note is removed');

const snap=JSON.parse(JSON.stringify(API.S));
API.applyState({shifts:{},devs:{},notes:{},settings:{norm:37},meta:{}});
assert(Object.keys(API.S.notes).length===0,'applyState can clear notes');
API.applyState(snap);
assert(API.S.notes['note:d1'].text.includes('Konflikt'),'notes round-trip in saved state');
(async()=>{
  const o=await API.backupObj(false);
  assert(o.data.notes['note:d1']&&o.data.notes['note:d1'].text.includes('Konflikt'),'backup includes hændelsesnoter and no other store');
  assert(!JSON.stringify(o).includes('Robert')&&!JSON.stringify(o).includes('CPR'),'backup fixture has no personal identifiers');
  if(failed){console.error('\n'+failed+' failed');process.exit(1);}
  console.log('\nregel tests passed');
})().catch(e=>{console.error(e);process.exit(1);});
