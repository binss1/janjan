'use strict';
const SIM=!!window.JJ_SIM, NS=SIM?'janjan-sim':'janjan', VERSION='1.0.0', BUILD='14ee99dc', KEY=NS+'.db';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const toStr=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)};
const add=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return toStr(d)};
const diff=(a,b)=>Math.round((parse(a)-parse(b))/864e5);
let simShift=0;
const today=()=>add(toStr(new Date()),simShift);
const nowHM=()=>{const d=new Date();return pad(d.getHours())+':'+pad(d.getMinutes())};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const WD=['일','월','화','수','목','금','토'];
const wday=s=>parse(s).getDay();
const fmtMD=s=>{const d=parse(s);return `${d.getMonth()+1}/${d.getDate()}`};
const fmtMDW=s=>`${fmtMD(s)}(${WD[wday(s)]})`;
const fmtLong=s=>{const d=parse(s);return `${d.getMonth()+1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`};
const fmtYMD=s=>{const d=parse(s);return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}`};
const won=n=>Math.round(Number(n)||0).toLocaleString('ko-KR')+'원';
const mmss=s=>{s=Math.max(0,Math.ceil(s));return `${Math.floor(s/60)}:${pad(s%60)}`};
const FREEZE_DAYS=90, AVO_G=120;

/* 분수 표기: 0.5 → 1/2, 1.5 → 1과 1/2 */
function fmtQ(x){const w=Math.floor(x+1e-9),k=Math.round((x-w)*8)/8;if(k>=1)return String(w+1);const F={0:'',.125:'1/8',.25:'1/4',.375:'3/8',.5:'1/2',.625:'5/8',.75:'3/4',.875:'7/8'};const f=F[k]||'';if(!f)return String(w);return w?`${w}과 ${f}`:f}
function ingLine(it,m){const q=it.q*m;if(it.u==='g'||it.u==='ml')return {n:it.n,a:`${Math.round(q)}${it.u}`};return {n:it.n,a:`${fmtQ(q)}${it.u}`+(it.g?` (${it.gl||'약'} ${it.gl?'약 ':''}${Math.round(it.g*m)}g)`.replace('(약 약','(약'):'')}}
const multLabel=(k,m)=>k==='beet'?`${m}개`:m===.5?'반 배치':m===1?'1배치':`${m}배치`;
const MULTS={ruby:[.5,1,2],green:[.5,1,2],beet:[1,2,3,4]};

let db=null,view='today',stack=[],sheetOpen=false,updReady=false;
const ui={shop:'list',month:null,sel:null,mk:null,recipe:'ruby',undo:null};

/* 아이콘 */
const sv=(p,w=24)=>`<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I={
 today:sv('<path d="M6 4h12l-1.6 15.2A2 2 0 0 1 14.4 21H9.6a2 2 0 0 1-2-1.8z"/><path d="M6.6 9.5h10.8"/>'),
 make:sv('<path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z"/><path d="M2.5 11h19"/><path d="M9 3.5c-.8 1 .8 2-.1 3.2M12.5 3.5c-.8 1 .8 2-.1 3.2M16 3.5c-.8 1 .8 2-.1 3.2"/>'),
 store:sv('<rect x="5" y="2.8" width="14" height="18.4" rx="2.2"/><path d="M5 9.5h14M8.5 5.6v1.6M8.5 12.4v3"/>'),
 shop:sv('<path d="M4 8h16l-1.4 10.4A2 2 0 0 1 16.6 20H7.4a2 2 0 0 1-2-1.6z"/><path d="M8.5 8 11 3.5M15.5 8 13 3.5"/>'),
 more:sv('<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>'),
 back:sv('<path d="M15 5l-7 7 7 7"/>'),
 chev:sv('<path d="M9 5l7 7-7 7"/>',20),
 check:sv('<path d="M5 12.5l4.2 4.2L19 7"/>',20),
 x:sv('<path d="M6 6l12 12M18 6 6 18"/>',20),
 play:sv('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',22),
 pause:sv('<path d="M8 5v14M16 5v14" stroke-width="3"/>',22),
 reset:sv('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4v4.2h4.2"/>',22),
 ext:sv('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',18)
};

/* 저장: 기록은 폰 안(IndexedDB와 localStorage)에만 둡니다. 시뮬레이션은 메모리에만 둡니다 */
const Store=SIM?{async get(){return null},async put(){return true},async clear(){}}:{
 idb(){return new Promise((ok,no)=>{try{const r=indexedDB.open(NS,1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}catch(e){no(e)}})},
 async get(){let a=null,b=null;
  try{const d=await this.idb();a=await new Promise(ok=>{const q=d.transaction('kv').objectStore('kv').get('db');q.onsuccess=()=>ok(q.result||null);q.onerror=()=>ok(null)})}catch(e){}
  try{const t=localStorage.getItem(KEY);if(t)b=JSON.parse(t)}catch(e){}
  if(a&&b)return (a.updatedAt||0)>=(b.updatedAt||0)?a:b;return a||b},
 async put(v){let okAny=false;
  try{localStorage.setItem(KEY,JSON.stringify(v));okAny=true}catch(e){}
  try{const d=await this.idb();await new Promise((ok,no)=>{const t=d.transaction('kv','readwrite');t.objectStore('kv').put(v,'db');t.oncomplete=ok;t.onerror=()=>no(t.error)});okAny=true}catch(e){}
  return okAny},
 async clear(){try{localStorage.removeItem(KEY)}catch(e){}try{const d=await this.idb();await new Promise(ok=>{const t=d.transaction('kv','readwrite');t.objectStore('kv').delete('db');t.oncomplete=ok;t.onerror=ok})}catch(e){}}
};
async function save(){db.updatedAt=Date.now();const ok=await Store.put(db);if(!ok)toast('저장하지 못했습니다. 저장 공간을 확인하고 백업해 주세요.')}

const ALARM_DEF=[
 {k:'drink',t:'한 잔 마시기',rep:'매일',time:'08:00',desc:'잔잔을 열어 한 잔을 기록하세요.'},
 {k:'supp',t:'영양제 챙기기',rep:'매일',time:'08:00',desc:'잔잔을 열어 영양제 복용을 체크하세요.'},
 {k:'thaw',t:'해동 확인',rep:'매일',time:'21:30',desc:'내일 마실 병이 냉장실에 없으면 냉동 1병을 냉장실로 옮기세요.'},
 {k:'avo',t:'아보카도 확인',rep:'buyDay',time:'19:00',desc:'연두를 만들 계획이면 아보카도를 사서 상온에 두세요.'},
 {k:'order',t:'장보기 주문',rep:'orderDay',time:'21:00',desc:'잔잔의 장보기 목록으로 새벽배송을 주문하세요.'},
 {k:'make',t:'스무디 만들기',rep:'makeDay',time:'10:00',desc:'잔잔의 만들기 탭에서 단계별로 진행하세요.'}
];

function emptyDb(){const t=today();const al={};ALARM_DEF.forEach(a=>al[a.k]={on:a.k!=='supp',t:a.time});
 return{v:1,updatedAt:0,
  profile:{name:'',makeDay:0,orderDay:6,buyDay:3,fridgeDays:3,supp:false,suppName:'엽산',sound:true,fontLarge:false,theme:'system',started:t,alarms:al},
  plan:{ruby:1,green:0},shopChecks:{},
  pantry:{avo:[],avoFrozenG:0,beetFrozen:0,lemonMl:0},
  bottles:[],batches:[],cook:null,intake:{},supp:{},done:{},purchases:[],calExport:null,lastBackup:''}}
function migrate(){const e=emptyDb();db.profile=Object.assign({},e.profile,db.profile);db.profile.alarms=Object.assign({},e.profile.alarms,db.profile.alarms||{});for(const k of Object.keys(e))if(db[k]==null)db[k]=e[k];db.pantry=Object.assign({},e.pantry,db.pantry)}

/* 병 */
const K=k=>KINDS[k]||KINDS.ruby;
const kTag=k=>`<span class="tag k-${k}">${K(k).name}</span>`;
const kDot=(k,half)=>`<i class="kd k-${k}${half?' half':''}" aria-hidden="true"></i>`;
function lastDayOf(b){if(b.state==='freezer')return add(b.made,FREEZE_DAYS);if(b.thawedAt)return add(b.thawedAt,1);return add(b.made,db.profile.fridgeDays)}
const fridge=()=>db.bottles.filter(b=>b.state==='fridge');
const freezer=()=>db.bottles.filter(b=>b.state==='freezer');
const thawingOn=(b,d)=>b.state==='fridge'&&b.thawedAt===d;
const readyOn=(b,d)=>b.state==='fridge'&&b.made<=d&&(!b.thawedAt||b.thawedAt<d);
const byLast=(a,b)=>lastDayOf(a).localeCompare(lastDayOf(b))||a.made.localeCompare(b.made);
const expired=(b,d=today())=>lastDayOf(b)<d;
function pickBottle(d=today()){return fridge().filter(b=>readyOn(b,d)&&!expired(b,d)).sort(byLast)[0]||null}
function bottleStatus(b,d=today()){
 if(b.state==='freezer'){const l=lastDayOf(b);return l<d?{t:`냉동 기한 지남 (${fmtMD(l)})`,c:'bad'}:{t:`${fmtMD(l)}까지 냉동`,c:''}}
 if(thawingOn(b,d))return{t:'오늘 해동 시작 · 내일 마시기',c:'info'};
 const l=lastDayOf(b),n=diff(l,d);
 if(n<0)return{t:`기한 지남 ${-n}일 · 확인 후 버리기`,c:'bad'};
 if(n===0)return{t:'오늘까지 마시기',c:'warn'};
 return{t:`${fmtMD(l)}까지 · ${n}일 남음`,c:''}}
function bottleOrigin(b){return b.thawedAt?`${fmtMD(b.made)} 제조 · ${fmtMD(b.thawedAt)} 해동`:`${fmtMD(b.made)} 제조`}

/* 섭취 */
function drink(d,{bottle=null,kind=null,at=nowHM(),half=false}={}){
 const prev=db.intake[d]?JSON.parse(JSON.stringify(db.intake[d])):null;
 const prevB=prev&&prev.bottle?db.bottles.find(x=>x.id===prev.bottle):null;
 const prevBState=prevB?{state:prevB.state,endAt:prevB.endAt}:null;
 const b=bottle?db.bottles.find(x=>x.id===bottle):null;const bState=b?{state:b.state,endAt:b.endAt}:null;
 if(prevB&&prevB!==b){prevB.state='fridge';prevB.endAt=''}
 if(b){b.state='drunk';b.endAt=d}
 db.intake[d]={at,kind:b?b.kind:kind,bottle:b?b.id:null,half:!!half};
 return()=>{if(b){b.state=bState.state;b.endAt=bState.endAt}if(prevB){prevB.state=prevBState.state;prevB.endAt=prevBState.endAt}if(prev)db.intake[d]=prev;else delete db.intake[d]}}
function undrink(d){const it=db.intake[d];if(!it)return;if(it.bottle){const b=db.bottles.find(x=>x.id===it.bottle);if(b&&b.state==='drunk'){b.state='fridge';b.endAt=''}}delete db.intake[d]}
function streak(d=today()){let n=0,x=db.intake[d]?d:add(d,-1);while(db.intake[x]){n++;x=add(x,-1)}return n}
function bestStreak(){const ds=Object.keys(db.intake).sort();let best=0,cur=0,prev='';for(const d of ds){cur=prev&&diff(d,prev)===1?cur+1:1;best=Math.max(best,cur);prev=d}return best}
function thawOne(id){const t=today();let b=id?db.bottles.find(x=>x.id===id):null;if(!b)b=freezer().sort((a,c)=>a.made.localeCompare(c.made))[0];if(!b)return null;b.state='fridge';b.thawedAt=t;return b}

/* 제조일과 재고 전망 */
function nextMake(d=today()){for(let i=0;i<15;i++){const x=add(d,i);if(wday(x)===Number(db.profile.makeDay)){if(i===0&&db.batches.some(b=>b.date===x&&b.kind!=='beet'))continue;return x}}return add(d,7)}
function outlook(d=today()){const nm=nextMake(d),drunk=!!db.intake[d];
 const need=Math.max(0,diff(nm,d)-(drunk?1:0));
 const usable=db.bottles.filter(b=>(b.state==='fridge'&&!expired(b,d))||(b.state==='freezer'&&!expired(b,d))).length;
 return{nm,need,usable,short:Math.max(0,need-usable)}}
function readyTomorrow(d=today()){const t1=add(d,1);let n=fridge().filter(b=>!expired(b,t1)&&(b.made<=t1)&&(!b.thawedAt||b.thawedAt<t1)).length;if(!db.intake[d]&&pickBottle(d))n--;return Math.max(0,n)}

/* 장보기 */
const avoHave=()=>db.pantry.avo.reduce((s,a)=>s+Number(a.n||0),0);
function shopItems(){const P=db.plan,pn=db.pantry,out=[],r=Number(P.ruby)||0,g=Number(P.green)||0;
 if(r){const need=Math.ceil(r),have=Math.min(pn.beetFrozen,need),buy=need-have;
  out.push({key:'beet',grp:'ruby',pick:'beet',label:'비트',amt:`${need}개`,have:!buy?`냉동 찐 비트 ${have}회분 있음`:'',note:have&&buy?`냉동 찐 비트 ${have}회분이 있어 ${buy}개만 사면 됩니다`:''});
  out.push({key:'zucchini',grp:'ruby',pick:'zucchini',label:'애호박',amt:`${Math.ceil(r)}개`});
  out.push({key:'napa',grp:'ruby',pick:'napa',label:'알배추',amt:`${Math.ceil(r)}통`});
  out.push({key:'bokchoy',grp:'ruby',pick:'bokchoy',label:'청경채',amt:`${Math.round(150*r)}g`})}
 if(g){out.push({key:'cabbage',grp:'green',pick:'cabbage',label:'양배추',amt:`${fmtQ(g/4)}통 (약 ${Math.round(300*g)}g)`});
  out.push({key:'broccoli',grp:'green',pick:'broccoli',label:'브로콜리',amt:`${Math.ceil(g)}개 (약 ${Math.round(200*g)}g)`});
  const need=Math.ceil(3*g),fresh=avoHave(),fro=Math.floor(pn.avoFrozenG/AVO_G),buy=Math.max(0,need-fresh-fro);
  const hv=[fresh?`후숙 중 ${fresh}개`:'',fro?`냉동 ${pn.avoFrozenG}g`:''].filter(Boolean).join(', ');
  out.push({key:'avocado',grp:'green',pick:'avocado',label:'아보카도',amt:`${buy||need}개`,have:!buy?`${hv} 있음`:'',note:buy&&hv?`${hv}이 있어 ${buy}개만 사면 됩니다`:`냉동 아보카도라면 ${Math.round(AVO_G*buy||360*g)}g`,avoBuy:buy})}
 if(r||g){const ml=Math.round(60*r+90*g),left=Math.max(0,ml-pn.lemonMl);
  out.push({key:'lemon',grp:'common',pick:'lemon',label:'레몬',amt:`${Math.ceil((left||ml)/30)}개 (즙 ${left||ml}ml)`,have:!left?`레몬즙 ${pn.lemonMl}ml 있음`:'',note:left?(pn.lemonMl?`필요한 ${ml}ml 중 레몬즙 ${pn.lemonMl}ml가 있어 나머지만 삽니다`:'또는 100% 레몬즙 1병'):''});
  out.push({key:'ice',grp:'common',label:'얼음',amt:'1봉지',note:'찐 채소 식히기용'});
  out.push({key:'fruit',grp:'common',label:'바나나 또는 파인애플',amt:'선택',note:'단맛을 낼 때'})}
 return out}
const shopKey=(it)=>nextMake()+'|'+it.key;
function shopText(){const nm=nextMake(),L=[`[잔잔 장보기] ${fmtMDW(nm)} 제조`];const its=shopItems().filter(x=>!x.have);for(const g of ['ruby','green','common']){const a=its.filter(x=>x.grp===g);if(!a.length)continue;L.push(g==='common'?'· 공통':`· ${K(g).name}`);a.forEach(x=>L.push(`- ${x.label} ${x.amt}${x.note?` (${x.note})`:''}`))}return L.join('\n')}

/* 오늘 할 일 */
function tasks(d=today()){const p=db.profile,out=[],w=wday(d),nm=nextMake(d),done=k=>!!db.done[k+':'+d];
 if(db.cook)return out;
 const isMake=nm===d;
 if(isMake){const pl=planText();out.push({k:'make',t:'스무디 만들기',s:pl||'만들 스무디를 고르세요',act:'goMake',done:false})}
 if(w===Number(p.orderDay)&&(db.plan.ruby||db.plan.green))out.push({k:'order',t:'새벽배송 주문하기',s:`${fmtMDW(nm)} 제조분. 컬리는 밤 11시 전에 주문`,act:'goShop',done:done('order')});
 const ab=(shopItems().find(x=>x.key==='avocado')||{}).avoBuy||0;
 if(db.plan.green&&(ab>0||done('avo'))&&diff(nm,d)<=7&&w===Number(p.buyDay))out.push({k:'avo',t:ab>0?`아보카도 ${ab}개 사기`:'아보카도 준비됨',s:'상온에서 4~5일 후숙해야 해서 제조일 전에 미리 삽니다',act:'goShop',done:done('avo')});
 for(const a of db.pantry.avo){if(!a.ripe&&add(a.bought,4)<=d&&(!a.recheck||a.recheck<=d))out.push({k:'ripe',id:a.id,t:'아보카도 익었는지 확인',s:`${fmtMD(a.bought)}에 산 ${a.n}개. 살짝 눌러 부드럽게 들어가면 냉장고로`,act:'ripeSheet',done:false})}
 if(db.plan.ruby&&db.pantry.beetFrozen>0&&add(d,1)===nm)out.push({k:'beet',t:'냉동 찐 비트 냉장실로 옮기기',s:'내일 루비를 만들 때 쓸 비트를 미리 녹입니다',act:'',done:done('beet')});
 const fr=freezer().length;
 if(fr&&(readyTomorrow(d)===0||done('thaw')))out.push({k:'thaw',t:'자기 전에 냉동 1병 냉장실로',s:done('thaw')?'옮겼습니다. 내일 아침에 마시면 됩니다':'내일 아침 마실 병이 냉장실에 없습니다',act:'thawTask',done:done('thaw')});
 return out}
function planText(){const P=db.plan,a=[];if(P.ruby)a.push(`루비 ${multLabel('ruby',P.ruby)}`);if(P.green)a.push(`연두 ${multLabel('green',P.green)}`);return a.join(', ')}

/* 통계 */
function monthStats(ym){const pre=ym+'-',t=today();const days=Object.keys(db.intake).filter(d=>d.startsWith(pre));
 const k={ruby:0,green:0,other:0};let half=0;days.forEach(d=>{const it=db.intake[d];k[it.kind==='ruby'||it.kind==='green'?it.kind:'other']++;if(it.half)half++});
 const bats=db.batches.filter(b=>b.date.startsWith(pre)&&b.kind!=='beet');const made=bats.reduce((s,b)=>s+(b.bottles||0),0);
 const disc=db.bottles.filter(b=>b.state==='discarded'&&(b.endAt||'').startsWith(pre)).length;
 const cost=db.purchases.filter(p=>p.date.startsWith(pre)).reduce((s,p)=>s+(Number(p.amount)||0),0);
 const [y,m]=ym.split('-').map(Number);const dim=new Date(y,m,0).getDate();const isCur=t.startsWith(pre);const span=isCur?Number(t.slice(8)):dim;
 return{days:days.length,span,k,half,batches:bats.length,made,disc,cost,perCup:made?cost/made:0}}

/* 제작 진행 */
const defTotal=(k,m)=>k==='beet'?m:Math.max(1,Math.round(K(k).cups*m));
function steamDef(c){return STEAM[c.kind==='ruby'&&c.fb?'rubyFB':c.kind]}
function cookSteps(c){return STEPS[c.kind]}
function cookVars(c){const R=RECIPE[c.kind]||[],q=k=>(R.find(x=>x.k===k)||{}).q||0,m=c.mult;
 return{mult:m,bottles:c.total,date:fmtMD(today()),w2:Math.round(q('water')*m/2),l2:Math.round(q('lemon')*m/2),avoG:Math.round(360*m)}}
const fill=(s,v)=>s.replace(/\{(\w+)\}/g,(_,k)=>v[k]!=null?v[k]:'');
function stepItems(c,s){const v=cookVars(c);return(s.items||[]).filter(x=>!(x.startsWith('!fb')&&c.fb)&&!(x.startsWith('?fb')&&!c.fb)).map(x=>fill(x.replace(/^[!?]fb/,''),v))}
function readyLists(c,s){const v=cookVars(c);const tools=s.tools.map(x=>fill(x,v));let ing;
 if(c.kind==='beet')ing=[`비트 ${c.mult}개`];
 else{ing=RECIPE[c.kind].filter(it=>!(it.k==='beet'&&c.fb)).map(it=>{const l=ingLine(it,c.mult);return `${l.n} ${l.a}`});if(c.fb)ing.unshift(`냉동해 둔 찐 비트 ${Math.ceil(c.mult)}회분 (전날 밤 냉장실에서 해동)`)}
 return{tools,ing}}
function stepTitle(c,s){if(s.type==='steam')return `찜 ${Math.round(steamDef(c).total/60)}분`;return s.title}
function startCook(kind,mult,fb){db.cook={kind,mult,fb:!!fb&&kind==='ruby',step:0,ck:{},t:{},taste:'',total:defTotal(kind,mult),fridge:Math.min(defTotal(kind,mult),Number(db.profile.fridgeDays)||3),startedAt:Date.now(),memo:''};if(kind==='beet')db.cook.fridge=0}

/* 타이머: 시작 시각 기준이라 앱을 잠시 닫아도 흘러갑니다 */
const SPEED=()=>SIM?(window.__simSpeed||1):1;
function tEl(t){if(!t||!t.s)return 0;const now=t.p||Date.now();return Math.max(0,(now-t.s-(t.o||0))/1000*SPEED())}
function tObj(id){const c=db.cook;return c.t[id]=c.t[id]||{s:0,p:0,o:0,f:[]}}
function timerSec(c,id){if(id==='steam')return steamDef(c).total;if(id==='cool')return 120;return 90}
function timerMsg(c,id){if(id==='cool')return '식히기 끝. 채반에 밭쳐 물기를 빼세요';if(id==='b0')return '1차 블렌딩 끝. 2차를 준비하세요';if(id==='b1')return '2차 블렌딩 끝. 큰 볼에 합쳐 섞으세요';return ''}
function tStart(id){audioUnlock();const t=tObj(id);if(!t.s){t.s=Date.now();t.p=0;t.o=0;t.f=id==='steam'?[0]:[]}else if(t.p){t.o+=Date.now()-t.p;t.p=0}}
function tPause(id){const t=tObj(id);if(t.s&&!t.p)t.p=Date.now()}
function tReset(id){db.cook.t[id]={s:0,p:0,o:0,f:[]}}
const running=t=>!!(t&&t.s&&!t.p);

let lastTick=0;
function tick(){if(!db||!db.cook)return;const c=db.cook,msgs=[];
 const st=c.t.steam;if(running(st)){const S=steamDef(c),el=tEl(st);S.ev.forEach((e,i)=>{if(i>0&&el>=e[0]&&!st.f.includes(i)){st.f.push(i);msgs.push(e[1])}})}
 for(const id of ['cool','b0','b1']){const t=c.t[id];if(running(t)&&tEl(t)>=timerSec(c,id)&&!t.f.includes('end')){t.f.push('end');msgs.push(timerMsg(c,id))}}
 if(msgs.length){save();ring(msgs)}
 liveTimers()}
function liveTimers(){if(!db||!db.cook)return;const c=db.cook;
 const st=c.t.steam,box=$('#stBox');if(box&&st){const S=steamDef(c),el=Math.min(tEl(st),S.total),nx=S.ev.findIndex((e,i)=>i>0&&e[0]>el);
  const set=(id,v)=>{const e=document.getElementById(id);if(e&&e.textContent!==v)e.textContent=v};
  set('stClock',st.s?(nx>0?mmss(S.ev[nx][0]-el):'0:00'):mmss(S.ev[1]?S.ev[1][0]:S.total));
  set('stNext',!st.s?`시작하면 바로: ${S.ev[0][1]}`:nx>0?`다음: ${S.ev[nx][1]}`:'찜이 끝났습니다');
  set('stEl',`${mmss(el)} / ${mmss(S.total)}`);
  const bar=$('#stBar');if(bar)bar.style.width=(st.s?el/S.total*100:0)+'%';
  $$('#stBox [data-ev]').forEach(r=>{const i=Number(r.dataset.ev),e=S.ev[i],on=st.s&&el>=e[0];r.classList.toggle('done',!!on&&(i<S.ev.length-1?S.ev[i+1][0]<=el:true));r.classList.toggle('now',!!on&&i<S.ev.length-1&&S.ev[i+1][0]>el)})}
 for(const id of ['cool','b0','b1']){const t=c.t[id],e=document.getElementById('tc-'+id);if(!e||!t)continue;const sec=timerSec(c,id),el=Math.min(tEl(t),sec);const v=t.s?mmss(sec-el):mmss(sec);if(e.textContent!==v)e.textContent=v;const b=document.getElementById('tb-'+id);if(b)b.style.width=(t.s?el/sec*100:0)+'%'}}

/* 알림: 소리, 진동, 전체 화면 */
let actx=null,ringT=null;
function audioUnlock(){try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch(e){}try{if(!actx){const A=window.AudioContext||window.webkitAudioContext;if(A)actx=new A()}if(actx&&actx.state!=='running')actx.resume()}catch(e){}}
function beep(){if(!db||db.profile.sound===false||!actx)return;try{const t0=actx.currentTime+.02;[0,.3,.6].forEach((d,i)=>{const o=actx.createOscillator(),g=actx.createGain();o.type='sine';o.frequency.value=i===2?1175:880;g.gain.setValueAtTime(.0001,t0+d);g.gain.exponentialRampToValueAtTime(.6,t0+d+.02);g.gain.exponentialRampToValueAtTime(.0001,t0+d+.24);o.connect(g);g.connect(actx.destination);o.start(t0+d);o.stop(t0+d+.26)})}catch(e){}}
function buzz(){try{if(navigator.vibrate)navigator.vibrate([320,140,320])}catch(e){}}
function ring(msgs,kind){const k=kind||(db.cook?db.cook.kind:'ruby');let el=$('#ring');if(!el){el=document.createElement('div');el.id='ring';document.body.appendChild(el)}
 el.className='ring k-'+k;el.innerHTML=`<div class="ringbox" role="alertdialog" aria-modal="true" aria-label="지금 할 일"><div class="ringk">${msgs.length>1?'지나간 시점이 있습니다':'지금 할 일'}</div>${msgs.map(m=>`<div class="ringm">${esc(m)}</div>`).join('')}<button class="btn ringok" data-a="ringOk">확인</button></div>`;
 let n=0;clearInterval(ringT);const go=()=>{beep();buzz();if(++n>=10)clearInterval(ringT)};go();ringT=setInterval(go,2400);
 const b=$('#ring .ringok');if(b)b.focus()}
function ringStop(){clearInterval(ringT);const el=$('#ring');if(el)el.remove()}

/* 만드는 동안 화면 켜짐 유지 */
let wl=null,wlState='';
async function wakeOn(){if(wl)return;if(!('wakeLock'in navigator)){wlState='none';return}try{wl=await navigator.wakeLock.request('screen');wlState='on';wl.addEventListener('release',()=>{wl=null;if(document.visibilityState==='visible'&&db&&db.cook&&view==='make')wakeOn()})}catch(e){wlState='fail'}}
function wakeOff(){if(wl){const w=wl;wl=null;try{w.release()}catch(e){}}}

function finishCook(){const c=db.cook,t=today(),id=uid();
 const b={id,kind:c.kind,mult:c.mult,date:t,start:c.startedAt,end:Date.now(),bottles:c.kind==='beet'?0:c.total,fridge:c.kind==='beet'?0:c.fridge,freezer:c.kind==='beet'?0:Math.max(0,c.total-c.fridge),taste:c.taste||'',memo:($('#cookMemo')||{}).value||c.memo||'',fb:!!c.fb,portions:c.kind==='beet'?c.total:0};
 db.batches.push(b);
 if(c.kind==='beet'){db.pantry.beetFrozen+=c.total}
 else for(let i=0;i<c.total;i++)db.bottles.push({id:uid(),kind:c.kind,made:t,batch:id,state:i<c.fridge?'fridge':'freezer',thawedAt:'',endAt:''});
 for(const u of usePlan(c)){const el=document.getElementById('use-'+u.k);if(el&&!el.checked)continue;u.apply()}
 db.cook=null;return b}
/* 끝낼 때 재고에서 뺄 것 */
function usePlan(c){const out=[],pn=db.pantry;
 if(c.kind==='green'){let need=Math.ceil(3*c.mult);const fresh=avoHave();
  if(fresh){const n=Math.min(fresh,need);need-=n;out.push({k:'avo',t:`후숙한 아보카도 ${n}개 빼기`,apply:()=>{let r=n;const L=pn.avo.slice().sort((a,b)=>(b.ripe?1:0)-(a.ripe?1:0)||a.bought.localeCompare(b.bought));for(const a of L){if(!r)break;const x=Math.min(r,a.n);a.n-=x;r-=x}pn.avo=pn.avo.filter(a=>a.n>0)}})}
  if(need&&pn.avoFrozenG>0){const g=Math.min(pn.avoFrozenG,need*AVO_G);out.push({k:'avof',t:`냉동 아보카도 ${g}g 빼기`,apply:()=>{pn.avoFrozenG=Math.max(0,pn.avoFrozenG-g)}})}}
 if(c.kind==='ruby'&&c.fb&&pn.beetFrozen>0){const n=Math.min(pn.beetFrozen,Math.ceil(c.mult));out.push({k:'beet',t:`냉동 찐 비트 ${n}회분 빼기`,apply:()=>{pn.beetFrozen=Math.max(0,pn.beetFrozen-n)}})}
 if(c.kind!=='beet'&&pn.lemonMl>0){const ml=Math.min(pn.lemonMl,Math.round((c.kind==='ruby'?60:90)*c.mult));out.push({k:'lemon',t:`레몬즙 ${ml}ml 빼기`,apply:()=>{pn.lemonMl=Math.max(0,pn.lemonMl-ml)}})}
 return out}

/* 공통 조각 */
const head=t=>`<div class="row"><button class="icb" data-a="back" aria-label="뒤로" style="margin-left:-10px">${I.back}</button><div class="ptitle grow">${t}</div></div>`;
const liBtn=(a,t,s,extra='')=>`<button class="li" data-a="${a}" ${extra}><span class="grow"><span class="t">${t}</span>${s?`<br><span class="s">${s}</span>`:''}</span><span class="chev">${I.chev}</span></button>`;
const fld=(id,l,type,v,at='')=>`<div class="fld"><label for="${id}">${l}</label><input id="${id}" type="${type}" value="${esc(v)}" ${at}></div>`;
const sel=(id,l,v,o)=>`<div class="fld"><label for="${id}">${l}</label><select id="${id}">${o.map(([k,t])=>`<option value="${esc(k)}" ${String(k)===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select></div>`;
const seg=(a,cur,o,extra='')=>`<div class="seg" role="group">${o.map(([k,t])=>`<button class="${String(k)===String(cur)?'on':''}" data-a="${a}" data-v="${k}" ${extra} aria-pressed="${String(k)===String(cur)}">${t}</button>`).join('')}</div>`;
const stepper=(a,v,label,unit='')=>`<div class="stepper"><button data-a="${a}" data-v="-1" aria-label="${label} 줄이기">−</button><span class="num" aria-live="polite">${v}${unit}</span><button data-a="${a}" data-v="1" aria-label="${label} 늘리기">+</button></div>`;
const wdOpts=()=>[1,2,3,4,5,6,0].map(d=>[d,WD[d]+'요일']);
const chk=(id,on,label,cls='')=>`<label class="check ${cls}${on?' on':''}"><input type="checkbox" data-c="ck" data-v="${id}" ${on?'checked':''}><span>${label}</span></label>`;

/* 오늘 */
function vToday(){const t=today(),p=db.profile,it=db.intake[t],notes=[];
 if(updReady)notes.push(`<button class="note info" data-a="updateNow" style="text-align:left"><b>새 버전이 준비되었습니다</b><span>눌러서 바로 적용하세요. 기록은 그대로 유지됩니다.</span></button>`);
 if(db.cook){const c=db.cook,S=cookSteps(c);notes.push(`<button class="note info cookon k-${c.kind}" data-a="tab" data-v="make" style="text-align:left"><b>${K(c.kind).full} 만드는 중</b><span>${c.step+1}/${S.length}단계 ${esc(stepTitle(c,S[c.step]))}. 눌러서 이어서 하기</span></button>`)}
 const ex=fridge().filter(b=>expired(b,t)&&!thawingOn(b,t));if(ex.length)notes.push(`<button class="note bad" data-a="tab" data-v="store" style="text-align:left"><b>냉장 기한이 지난 병 ${ex.length}개</b><span>냄새와 맛을 확인하고 버리기를 눌러 정리하세요.</span></button>`);
 const fx=freezer().filter(b=>expired(b,t));if(fx.length)notes.push(`<button class="note warn" data-a="tab" data-v="store" style="text-align:left"><b>냉동 3개월이 지난 병 ${fx.length}개</b><span>보관에서 확인하세요.</span></button>`);
 if(!SIM&&diff(t,p.started)>=14&&(!db.lastBackup||diff(t,db.lastBackup)>=14))notes.push(`<button class="note warn" data-a="go" data-v="backup" style="text-align:left"><b>백업할 때가 되었습니다</b><span>${db.lastBackup?`마지막 백업 ${fmtYMD(db.lastBackup)}.`:'아직 백업한 적이 없습니다.'} 기록은 이 폰에만 있습니다.</span></button>`);
 const st=streak(t),ms=monthStats(t.slice(0,7));
 const hero=`<div class="hero"><div class="date">${fmtLong(t)}${SIM?' · 시뮬레이션':''}</div><div class="row between" style="align-items:flex-end"><div class="htitle">${p.name?esc(p.name)+'님의 ':''}오늘 한 잔</div><button class="streak" data-a="go" data-v="cal" aria-label="기록 달력 열기"><b class="num">${st}</b><span>일 연속</span></button></div></div>`;
 return `<div class="stack">${hero}${notes.join('')}${cupCard(t,it)}${p.supp?suppRow(t):''}${taskSec(t)}${weekStrip(t)}${stockCard(t)}<div class="small faint">이번 달 ${ms.days}잔${ms.k.ruby||ms.k.green?` · 루비 ${ms.k.ruby} · 연두 ${ms.k.green}`:''}. 기록은 이 폰 안에만 저장됩니다.</div></div>`}
function cupCard(t,it){
 if(it){const k=it.kind||'other';return `<div class="cup done k-${k}"><div class="row"><span class="cupok">${I.check}</span><div class="grow"><div class="cupt">오늘 한 잔 마셨어요</div><div class="s">${esc(it.at||'')}${it.kind?' · '+K(it.kind).full:''}${it.half?' · 반 잔':''}</div></div><button class="btn sm sec2" data-a="intakeSheet" data-d="${t}">고치기</button></div></div>`}
 const b=pickBottle(t);
 if(b){const s=bottleStatus(b,t);return `<div class="cup k-${b.kind}"><div class="row between"><div>${kTag(b.kind)} <b>${K(b.kind).full}</b></div><span class="s">${bottleOrigin(b)}</span></div><div class="s ${s.c}">${esc(s.t)}</div><button class="btn big" data-a="drinkNow" data-v="${b.id}">한 잔 마셨어요</button><button class="btn ghost sm" data-a="intakeSheet" data-d="${t}" style="width:100%">다른 병 · 반 잔 · 시간 고치기</button><div class="small faint">식사 10~15분 전에 반 잔을 먼저 마시면 좋습니다.</div></div>`}
 const th=fridge().filter(x=>thawingOn(x,t)),fr=freezer().length;
 const msg=th.length?`<b>오늘 옮긴 병은 아직 녹는 중입니다</b><span>다 녹았는지 흔들어 보고 마셔도 됩니다. 마셨다면 아래에서 기록하세요.</span>`:fr?`<b>냉장실에 마실 병이 없습니다</b><span>냉동 병을 냉장실로 옮겨 두면 다음 날 마실 수 있습니다.</span>`:`<b>보관 중인 스무디가 없습니다</b><span>만들기 탭에서 루비나 연두를 만들어 주세요.</span>`;
 return `<div class="cup empty"><div class="note info">${msg}</div>${!th.length&&fr?`<button class="btn sec2" data-a="thawNow">냉동 1병 냉장실로 옮기기</button>`:''}${!th.length&&!fr?`<button class="btn sec2" data-a="tab" data-v="make">만들기로 가기</button>`:''}<button class="btn ghost sm" data-a="intakeSheet" data-d="${t}" style="width:100%">${th.length?'이 병 마셨어요 기록하기':'병 없이 기록만 남기기'}</button></div>`}
function suppRow(t){const on=db.supp[t];return `<div class="list"><button class="li supp ${on?'ok':''}" data-a="suppTog" aria-pressed="${!!on}"><span class="ring2">${on?I.check:''}</span><span class="grow"><span class="t">${esc(db.profile.suppName||'영양제')}</span><br><span class="s">${on?`${esc(on)} 복용`:'눌러서 복용 체크'}</span></span></button></div>`}
function taskSec(t){const L=tasks(t);if(!L.length)return '';
 return `<section class="sec"><div class="sech"><h2>오늘 할 일</h2><span class="small muted num">${L.filter(x=>x.done).length}/${L.length}</span></div><div class="list">${L.map(x=>`<div class="task ${x.done?'ok':''}"><button class="tick" data-a="taskDone" data-k="${x.k}" data-id="${x.id||''}" aria-label="${esc(x.t)} ${x.done?'완료 취소':'완료'}" ${x.k==='make'||x.k==='ripe'?'tabindex="-1" aria-hidden="true" style="visibility:hidden"':''}><span>${x.done?I.check:''}</span></button><button class="body" ${x.act?`data-a="${x.act}" data-id="${x.id||''}"`:'data-a="taskDone" data-k="'+x.k+'"'}><span class="t">${esc(x.t)}</span><br><span class="s">${esc(x.s)}</span></button></div>`).join('')}</div></section>`}
function weekStrip(t){const w=wday(t),mon=add(t,-((w+6)%7));let h='';
 for(let i=0;i<7;i++){const d=add(mon,i),it=db.intake[d],fut=d>t;h+=`<div class="wd ${d===t?'today':''} ${fut?'fut':''}"><span class="n">${WD[wday(d)]}</span>${it?kDot(it.kind||'other',it.half):`<i class="kd empty"></i>`}<span class="dd num">${parse(d).getDate()}</span></div>`}
 return `<button class="week" data-a="go" data-v="cal" aria-label="이번 주 기록, 눌러서 달력 보기">${h}</button>`}
function stockCard(t){const fr=fridge(),fz=freezer(),o=outlook(t);const rk=k=>db.bottles.filter(b=>(b.state==='fridge'||b.state==='freezer')&&b.kind===k).length;
 const msg=o.nm===t?`오늘이 제조일입니다. 만들기를 끝내면 병이 보관에 등록됩니다`:o.short?`<span class="bad">${fmtMDW(o.nm)} 제조일까지 ${o.short}잔 모자랍니다</span>`:`${fmtMDW(o.nm)} 제조일까지 ${o.need}잔 필요, 충분합니다`;
 return `<button class="li stock" data-a="tab" data-v="store"><span class="grow"><span class="t">보관 중 냉장 ${fr.length} · 냉동 ${fz.length}</span><br><span class="s">${rk('ruby')?`루비 ${rk('ruby')}`:''}${rk('ruby')&&rk('green')?' · ':''}${rk('green')?`연두 ${rk('green')}`:''}${rk('ruby')||rk('green')?'. ':''}${msg}</span></span><span class="chev">${I.chev}</span></button>`}

/* 만들기 */
function vMake(){if(db.cook)return vCook();
 const m=ui.mk=ui.mk||{kind:db.plan.green&&!db.plan.ruby?'green':'ruby',mult:null,fb:false},k=m.kind,mult=m.mult||(k==='beet'?1:(db.plan[k]||1)),KD=K(k);
 const last=db.batches.filter(b=>b.kind===k&&b.memo).slice(-1)[0];
 const ing=k==='beet'?[{n:'비트',a:`${mult}개`}]:RECIPE[k].filter(it=>!(it.k==='beet'&&m.fb)).map(it=>ingLine(it,mult));
 const info=k==='beet'?`<div class="kinfo k-beet"><div class="s">루비 제조일에 비트 손질과 10분 찜을 건너뛸 수 있도록, 비트만 미리 쪄서 1회 제조분씩 냉동해 둡니다.</div></div>`:`<div class="kinfo k-${k}"><div class="row between"><b class="kname">${KD.full}</b><span class="s">${KD.base}</span></div><div class="kgrid"><span>원문 용도</span><b>${KD.use}</b><span>대상</span><b>${KD.who}</b><span>만드는 양</span><b>${KD.liters}, ${KD.cupsTxt} (1배치)</b><span>걸리는 시간</span><b>${KD.mins}</b></div></div>`;
 return `<div class="stack"><div class="ptitle">만들기</div>${seg('mkKind',k,[['ruby','루비'],['green','연두'],['beet','찐 비트 미리']])}${info}
 <section class="sec"><div class="sech"><h2>${k==='beet'?'비트 개수':'만들 양'}</h2></div>${seg('mkMult',mult,MULTS[k].map(x=>[x,multLabel(k,x)+(k==='beet'?'':` · ${defTotal(k,x)}잔`)]))}
 ${k==='ruby'&&db.pantry.beetFrozen>0?`<label class="check"><input type="checkbox" data-c="mkFb" ${m.fb?'checked':''}><span>냉동해 둔 찐 비트 쓰기 (${db.pantry.beetFrozen}회분 있음). 찜이 5분으로 줄어듭니다</span></label>`:''}</section>
 <section class="sec"><div class="sech"><h2>재료</h2><span class="small muted">${k==='beet'?'':multLabel(k,mult)+' 기준'}</span></div><div class="list">${ing.map(x=>`<div class="li"><span class="grow t">${esc(x.n)}</span><span class="num">${esc(x.a)}</span></div>`).join('')}${m.fb&&k==='ruby'?`<div class="li"><span class="grow t">냉동 찐 비트</span><span class="num">${Math.ceil(mult)}회분</span></div>`:''}</div></section>
 ${last?`<div class="note info"><b>지난번 메모 (${fmtMD(last.date)})</b><span>${esc(last.memo)}</span></div>`:''}
 <button class="btn big" data-a="cookStart" data-v="${mult}">${k==='beet'?'비트 찌기 시작':'단계별로 시작하기'}</button>
 <div class="small faint">시작하면 화면이 꺼지지 않게 하고, 찜 시점마다 소리와 화면으로 알려 드립니다. 소리는 설정에서 미리 시험해 보세요.</div>
 ${k!=='beet'?`<button class="btn ghost" data-a="openRecipe" data-v="${k}">${KD.name} 레시피 전체 보기</button>`:''}
 ${recentBatches()}</div>`}
function recentBatches(){const L=db.batches.slice(-3).reverse();if(!L.length)return '';return `<section class="sec"><div class="sech"><h2>최근 제조</h2><button class="link" data-a="go" data-v="batches">전체 보기</button></div><div class="list">${L.map(batchRow).join('')}</div></section>`}
function batchRow(b){const min=b.end&&b.start?Math.round((b.end-b.start)/6e4):0;return `<button class="li" data-a="batchSheet" data-v="${b.id}">${kDot(b.kind==='beet'?'beet':b.kind)}<span class="grow"><span class="t">${fmtMDW(b.date)} ${K(b.kind).name} ${multLabel(b.kind,b.mult)}</span><br><span class="s">${b.kind==='beet'?`냉동 ${b.portions}회분`:`${b.bottles}병 (냉장 ${b.fridge}, 냉동 ${b.freezer})`}${min?` · ${min}분`:''}${b.memo?' · 메모 있음':''}</span></span><span class="chev">${I.chev}</span></button>`}

function vCook(){const c=db.cook,S=cookSteps(c),s=S[c.step],v=cookVars(c);
 const top=`<div class="cooktop k-${c.kind}"><div class="row between"><div class="row" style="gap:8px">${kTag(c.kind==='beet'?'beet':c.kind)}<span class="small muted num">${c.step+1} / ${S.length}단계 · ${multLabel(c.kind,c.mult)}</span></div><button class="btn sm sec2" data-a="cookMenu">나가기</button></div><div class="bar"><i style="width:${(c.step)/(S.length-1)*100}%"></i></div></div>`;
 const wlNote=!SIM&&(wlState==='none'||wlState==='fail')?`<div class="note warn wlnote"><span>이 폰은 화면 꺼짐 방지를 지원하지 않습니다. 설정에서 자동 잠금 시간을 늘려 주세요.</span></div>`:'';
 let body='';const ck=(i,txt,pre=s.id)=>chk(`${pre}:${i}`,c.ck[`${pre}:${i}`],esc(txt),'big');
 if(s.type==='ready'){const L=readyLists(c,s);body=`<section class="sec"><h3 class="h3">도구</h3><div class="cks">${L.tools.map((x,i)=>ck('t'+i,x)).join('')}</div></section><section class="sec"><h3 class="h3">재료</h3><div class="cks">${L.ing.map((x,i)=>ck('i'+i,x)).join('')}</div></section>`}
 else if(s.type==='checks'){body=`<div class="cks">${stepItems(c,s).map((x,i)=>ck(i,x)).join('')}</div>`}
 else if(s.type==='steam')body=steamBox(c);
 else if(s.type==='timer')body=`<div class="cks">${stepItems(c,s).map((x,i)=>ck(i,x)).join('')}</div>${timerBox(c,'cool','1~2분 담그기')}`;
 else if(s.type==='blend'){const r=s.round.map(x=>fill(x,v));body=[0,1].map(n=>`<section class="sec round"><h3 class="h3">${n+1}차</h3><div class="cks">${r.map((x,i)=>ck(`${n}-${i}`,x)).join('')}</div>${timerBox(c,'b'+n,s.secLabel)}</section>`).join('')+`<div class="cks">${ck('last',s.last)}</div>`}
 else if(s.type==='taste'){body=`<div class="chips">${s.opts.map(o=>`<button class="chip ${c.taste===o?'on':''}" data-a="taste" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>${fixBox(c.kind)}`}
 else if(s.type==='portion'){const fz=Math.max(0,c.total-c.fridge);body=`<div class="pgrid"><div><div class="lbl">전체 병</div>${stepper('pTotal',c.total,'전체 병','병')}</div><div><div class="lbl">냉장</div>${stepper('pFridge',c.fridge,'냉장 병','병')}</div><div><div class="lbl">냉동</div><div class="pz num">${fz}병</div></div></div><div class="small muted">냉장은 ${db.profile.fridgeDays}일 안에 마실 만큼만 넣고 나머지는 냉동합니다. 실제로 담은 병 수로 맞춰 주세요.</div><div class="cks">${stepItems(c,s).map((x,i)=>ck(i,x)).join('')}</div>`}
 else if(s.type==='done')body=doneBox(c);
 const lead=s.type==='steam'?s.lead:s.lead;
 return `<div class="stack cook">${top}${wlNote}<div><div class="steptitle">${esc(stepTitle(c,s))}</div>${s.time?`<div class="small muted">${esc(s.time)}</div>`:''}</div>${lead?`<p class="lead">${esc(lead)}</p>`:''}${s.warn?`<div class="note warn"><span>${esc(s.warn)}</span></div>`:''}${body}</div>`}
function steamBox(c){const S=steamDef(c),st=c.t.steam||{},on=running(st),paused=st.s&&st.p;
 return `<div class="steam k-${c.kind}" id="stBox"><div class="stnext" id="stNext"></div><div class="stclock num" id="stClock">0:00</div><div class="bar thick"><i id="stBar"></i></div><div class="small muted num" id="stEl"></div>
 <div class="evs">${S.ev.map((e,i)=>`<div class="ev" data-ev="${i}"><span class="evt num">${Math.round(e[0]/60)}분</span><span class="grow">${esc(e[1])}</span><span class="evc">${I.check}</span></div>`).join('')}</div>
 <div class="row tbtns">${!st.s?`<button class="btn big" data-a="tGo" data-v="steam">${I.play}찜 시작</button>`:on?`<button class="btn sec2" data-a="tPause" data-v="steam">${I.pause}일시정지</button>`:`<button class="btn" data-a="tGo" data-v="steam">${I.play}계속</button>`}${st.s?`<button class="btn sec2 sq" data-a="tReset" data-v="steam" aria-label="처음부터">${I.reset}</button>`:''}</div>
 <div class="small faint">${esc(S.note)}.${paused?' 일시정지 중입니다.':''} 앱을 열어 둔 채 폰을 옆에 두세요.</div></div>`}
function timerBox(c,id,label){const t=c.t[id]||{},on=running(t),sec=timerSec(c,id),endd=t.f&&t.f.includes('end');
 return `<div class="tbox"><div class="row between"><span class="small muted">${esc(label)}</span><span class="tclock num ${endd?'ok':''}" id="tc-${id}">${mmss(sec)}</span></div><div class="bar"><i id="tb-${id}"></i></div><div class="row tbtns">${!t.s?`<button class="btn sm" data-a="tGo" data-v="${id}">${I.play}타이머</button>`:endd?`<span class="small ok">끝났습니다</span>`:on?`<button class="btn sm sec2" data-a="tPause" data-v="${id}">${I.pause}일시정지</button>`:`<button class="btn sm" data-a="tGo" data-v="${id}">${I.play}계속</button>`}${t.s?`<button class="btn sm sec2" data-a="tReset" data-v="${id}" aria-label="타이머 처음부터">${I.reset}</button>`:''}</div></div>`}
function fixBox(k){const L=FIX[k];if(!L)return '';return `<details><summary>맛과 질감이 이상할 때</summary><div>${L.map(([a,b])=>`<p><b>${esc(a)}</b><br>${esc(b)}</p>`).join('')}</div></details>`}
function doneBox(c){const min=Math.max(1,Math.round((Date.now()-c.startedAt)/6e4)),U=usePlan(c);
 const sum=c.kind==='beet'?`<div class="pgrid one"><div><div class="lbl">냉동한 회분</div>${stepper('pTotal',c.total,'냉동한 회분','회분')}</div></div><div class="small muted">재고의 냉동 찐 비트에 더해집니다. 루비를 만들 때 "냉동해 둔 찐 비트 쓰기"를 고르면 찜이 5분으로 줄어듭니다.</div>`:`<div class="list"><div class="li"><span class="grow">${K(c.kind).full} ${multLabel(c.kind,c.mult)}</span><span class="num">${c.total}병</span></div><div class="li"><span class="grow">냉장 · 냉동</span><span class="num">${c.fridge} · ${Math.max(0,c.total-c.fridge)}병</span></div><div class="li"><span class="grow">걸린 시간</span><span class="num">약 ${min}분</span></div>${c.taste&&c.taste!=='그대로'?`<div class="li"><span class="grow">맛 조절</span><span>${esc(c.taste)}</span></div>`:''}</div>`;
 return `${sum}${U.length?`<section class="sec"><h3 class="h3">재고에서 빼기</h3><div class="cks">${U.map(u=>`<label class="check"><input type="checkbox" id="use-${u.k}" checked><span>${esc(u.t)}</span></label>`).join('')}</div></section>`:''}<div class="fld"><label for="cookMemo">메모 (맛, 다음에 바꿀 점)</label><textarea id="cookMemo" placeholder="예: 물을 조금 더 넣으면 좋겠다">${esc(c.memo||'')}</textarea></div><button class="btn big" data-a="cookFinish">${c.kind==='beet'?'끝내기 (재고에 더하기)':'끝내기 (보관에 병 등록)'}</button>`}

/* 보관 */
function vStore(){const t=today(),fr=fridge().sort(byLast),fz=freezer().sort((a,b)=>a.made.localeCompare(b.made));
 const th=fr.filter(b=>thawingOn(b,t)),rd=fr.filter(b=>!thawingOn(b,t));
 const row=b=>{const s=bottleStatus(b,t);return `<button class="li" data-a="bottleSheet" data-v="${b.id}">${kDot(b.kind)}<span class="grow"><span class="t">${K(b.kind).name} · ${bottleOrigin(b)}</span><br><span class="s ${s.c}">${esc(s.t)}</span></span><span class="chev">${I.chev}</span></button>`};
 const G={};fz.forEach(b=>{const k=b.kind+'|'+b.made;(G[k]=G[k]||[]).push(b)});
 const grp=Object.values(G).map(L=>{const b=L[0],s=bottleStatus(b,t);return `<div class="li">${kDot(b.kind)}<button class="grow" data-a="freezeSheet" data-v="${b.kind}|${b.made}" style="text-align:left"><span class="t">${K(b.kind).name} · ${fmtMD(b.made)} 제조 × ${L.length}병</span><br><span class="s ${s.c}">${esc(s.t)}</span></button><button class="btn sm sec2" data-a="thawBtn" data-v="${b.id}">해동</button></div>`}).join('');
 const past=db.bottles.filter(b=>(b.state==='drunk'||b.state==='discarded')&&b.endAt>=add(t,-6)).length;
 return `<div class="stack"><div class="ptitle">보관</div><div class="chips3"><div><b class="num">${rd.length}</b><span>냉장</span></div><div><b class="num">${th.length}</b><span>해동 중</span></div><div><b class="num">${fz.length}</b><span>냉동</span></div></div>
 <section class="sec"><div class="sech"><h2>냉장</h2><span class="small muted">기한이 가까운 순</span></div><div class="list">${rd.map(row).join('')||'<div class="li"><span class="s">냉장실에 병이 없습니다.</span></div>'}</div></section>
 ${th.length?`<section class="sec"><div class="sech"><h2>해동 중</h2><span class="small muted">내일 마시기</span></div><div class="list">${th.map(row).join('')}</div></section>`:''}
 <section class="sec"><div class="sech"><h2>냉동</h2><span class="small muted">오래된 순</span></div><div class="list">${grp||'<div class="li"><span class="s">냉동실에 병이 없습니다.</span></div>'}</div><div class="small faint">해동을 누르면 냉장실로 옮긴 것으로 기록됩니다. 그날 밤 옮긴 병은 다음 날 마십니다.</div></section>
 <button class="btn sec2" data-a="addBottles">병 직접 추가</button>
 <section class="sec"><div class="sech"><h2>보관 기준</h2></div><div class="list">${STORE_RULES.map(([a,b,c])=>`<div class="li rule"><b class="rk">${a}</b><span class="grow"><span class="t">${esc(b)}</span><br><span class="s">${esc(c)}</span></span></div>`).join('')}</div><div class="note warn"><b>이런 신호가 있으면 버립니다</b><span>${DISCARD_SIGNS.map(esc).join(', ')}</span></div><details><summary>냉장 기간을 짧게 잡은 이유</summary><div><p>${esc(STORE_NOTE)}</p><p class="small muted">냉장 기간은 더보기의 주간 루틴과 보관에서 2일 또는 3일로 바꿀 수 있습니다.</p></div></details></section>
 ${past?`<div class="small faint">최근 7일 동안 마시거나 버린 병 ${past}개. 기록 달력에서 볼 수 있습니다.</div>`:''}</div>`}

/* 장보기 */
function vShop(){return `<div class="stack"><div class="ptitle">장보기</div>${seg('shopTab',ui.shop,[['list','장보기'],['pantry','재고'],['where','구입처'],['cost','비용']])}${{list:shopList,pantry:pantryView,where:whereView,cost:costView}[ui.shop]()}</div>`}
function shopList(){const nm=nextMake(),t=today(),its=shopItems(),P=db.plan;
 const pl=`<div class="plan"><div class="row between"><div><div class="small muted">다음 제조일</div><div class="pdate">${fmtLong(nm)}</div></div><span class="dday num">${diff(nm,t)?'D-'+diff(nm,t):'오늘'}</span></div>
 <div class="prow"><span class="pk">${kTag('ruby')}</span>${seg('planSet',P.ruby,[[0,'안 함'],[.5,'반'],[1,'1배치'],[2,'2배치']],'data-k="ruby"')}</div>
 <div class="prow"><span class="pk">${kTag('green')}</span>${seg('planSet',P.green,[[0,'안 함'],[.5,'반'],[1,'1배치'],[2,'2배치']],'data-k="green"')}</div>
 <div class="small muted">${P.ruby||P.green?(()=>{const n=(P.ruby?defTotal('ruby',P.ruby):0)+(P.green?defTotal('green',P.green):0);return `이 목록으로 약 ${n}잔을 만듭니다. 하루 한 잔이면 ${n}일 분량입니다.`})():'만들 스무디를 고르면 목록이 나옵니다.'}</div></div>`;
 if(!its.length)return pl;
 const ab=its.find(x=>x.key==='avocado');const late=P.green&&ab&&ab.avoBuy>0&&diff(nm,t)<4;
 const grp=g=>{const a=its.filter(x=>x.grp===g);if(!a.length)return '';return `<section class="sec"><div class="sech"><h2>${g==='common'?'공통':K(g).full}</h2></div><div class="list">${a.map(x=>{const on=!!db.shopChecks[shopKey(x)];return `<div class="shopi ${on||x.have?'ok':''}"><label class="tick"><input type="checkbox" data-c="shopCk" data-v="${x.key}" ${on||x.have?'checked':''} ${x.have?'disabled':''} aria-label="${esc(x.label)} 샀음"><span>${on||x.have?I.check:''}</span></label><button class="body" ${x.pick?`data-a="pickSheet" data-v="${x.pick}"`:'tabindex="-1"'}><span class="t">${esc(x.label)} <span class="amt num">${esc(x.amt)}</span></span>${x.have?`<br><span class="s good">${esc(x.have)}</span>`:x.note?`<br><span class="s">${esc(x.note)}</span>`:''}</button>${x.pick?`<span class="chev">${I.chev}</span>`:''}</div>`}).join('')}</div></section>`};
 return `${pl}${late?`<div class="note warn"><b>아보카도 후숙 시간이 부족합니다</b><span>제조일까지 ${diff(nm,t)}일 남았습니다. 이미 익은 아보카도나 냉동 아보카도(${Math.round(360*P.green)}g)를 사세요.</span></div>`:''}${grp('ruby')}${grp('green')}${grp('common')}
 <div class="row"><button class="btn sec2" data-a="shopCopy">목록 복사</button><button class="btn ghost" data-a="shopReset">체크 모두 해제</button></div>
 <div class="small faint">품목 이름을 누르면 고르는 법이 나옵니다. 아보카도를 체크하면 재고에 들어가고 4일 뒤 익었는지 확인하라고 알려 드립니다.</div>`}
function pantryView(){const pn=db.pantry,t=today();
 const av=pn.avo.map(a=>`<div class="li">${kDot('green')}<span class="grow"><span class="t">아보카도 ${a.n}개</span><br><span class="s ${a.ripe?'good':''}">${fmtMD(a.bought)} 구입 · ${a.ripe?'익음, 냉장 보관 중':`${fmtMD(add(a.bought,4))}~${fmtMD(add(a.bought,5))}쯤 익음`}</span></span><button class="btn sm sec2" data-a="avoSheet" data-v="${a.id}">관리</button></div>`).join('');
 return `<section class="sec"><div class="sech"><h2>후숙 중인 아보카도</h2><button class="link" data-a="avoAdd">추가</button></div><div class="list">${av||'<div class="li"><span class="s">없습니다. 장보기에서 아보카도를 체크하면 들어옵니다.</span></div>'}</div></section>
 <section class="sec"><div class="sech"><h2>냉동·보관 재료</h2></div><div class="list">
 <div class="li"><span class="grow"><span class="t">냉동 아보카도</span><br><span class="s">${pn.avoFrozenG?`약 ${Math.floor(pn.avoFrozenG/AVO_G)}개분. 연두 1배치에 360g`:'연두 1배치에 360g'}</span></span>${stepper('pan" data-k="avoFrozenG',pn.avoFrozenG,'냉동 아보카도','g')}</div>
 <div class="li"><span class="grow"><span class="t">냉동 찐 비트</span><br><span class="s">루비 1배치에 1회분</span></span>${stepper('pan" data-k="beetFrozen',pn.beetFrozen,'냉동 찐 비트','회분')}</div>
 <div class="li"><span class="grow"><span class="t">100% 레몬즙</span><br><span class="s">루비 60ml, 연두 90ml</span></span>${stepper('pan" data-k="lemonMl',pn.lemonMl,'레몬즙','ml')}</div></div>
 <div class="small faint">재고는 장보기 목록에서 빠지고, 만들기를 끝낼 때 쓴 만큼 줄어듭니다. 냉동 아보카도는 60g, 레몬즙은 30ml씩 바뀝니다.</div></section>`}
function whereView(){return `<div class="note info"><span>배송 조건은 2026년 11월 조사 기준입니다. 자주 바뀌므로 주문 전에 앱에서 확인하세요. 새벽배송은 지역에 따라 안 될 수 있습니다.</span></div><div class="list">${SHOPS.map(s=>`<div class="li shop"><span class="grow"><span class="t">${esc(s.n)}</span><br><span class="s">${esc(s.d)}</span><br><span class="s faint">${esc(s.fit)}</span></span>${s.u?`<a class="btn sm sec2" href="${s.u}" target="_blank" rel="noopener">열기${I.ext}</a>`:''}</div>`).join('')}</div>
 <section class="sec"><div class="sech"><h2>주문 순서</h2></div><ol class="steps">${[[db.profile.buyDay,'아보카도를 사서 상온 후숙 시작 (연두를 만들 때)'],[db.profile.orderDay,'밤에 나머지 채소를 새벽배송으로 주문'],[db.profile.makeDay,'아침에 받아서 바로 만들고 소분']].map(([d,t])=>`<li><b>${WD[d]}요일</b> ${esc(t)}</li>`).join('')}</ol><div class="small muted">요일은 더보기의 주간 루틴에서 바꿉니다. 목록 복사로 장보기 목록을 쇼핑 앱 메모에 붙여넣을 수 있습니다.</div></section>`}
function costView(){const t=today(),ym=ui.costM||t.slice(0,7),ms=monthStats(ym),L=db.purchases.filter(p=>p.date.startsWith(ym)).sort((a,b)=>b.date.localeCompare(a.date));const [y,m]=ym.split('-').map(Number);
 return `<div class="calh"><button class="icb" data-a="costM" data-v="-1" aria-label="이전 달">${I.back}</button><div class="m">${y}년 ${m}월</div><button class="icb" data-a="costM" data-v="1" aria-label="다음 달" style="transform:scaleX(-1)">${I.back}</button></div>
 <div class="chips3"><div><b class="num">${won(ms.cost)}</b><span>장보기</span></div><div><b class="num">${ms.made}잔</b><span>만든 양</span></div><div><b class="num">${ms.made?won(ms.perCup):'-'}</b><span>한 잔당</span></div></div>
 <section class="sec"><div class="sech"><h2>장보기 기록 추가</h2></div><div class="grid2">${fld('pDate','날짜','date',t)}${sel('pStore','구입처','컬리',STORE_LIST.map(x=>[x,x]))}</div><div class="grid2">${fld('pAmt','금액(원)','number','','inputmode="numeric" min="0" placeholder="예: 32000"')}${fld('pMemo','메모','text','','placeholder="선택"')}</div><button class="btn sec2" data-a="costAdd">추가</button></section>
 <section class="sec"><div class="sech"><h2>이번 달 기록</h2><span class="small muted">${L.length}건</span></div><div class="list">${L.map(p=>`<button class="li" data-a="costSheet" data-v="${p.id}"><span class="grow"><span class="t">${fmtMDW(p.date)} ${esc(p.store)}</span>${p.memo?`<br><span class="s">${esc(p.memo)}</span>`:''}</span><span class="num">${won(p.amount)}</span></button>`).join('')||'<div class="li"><span class="s">기록이 없습니다.</span></div>'}</div><div class="small faint">한 잔당 비용은 그달 장보기 금액을 그달 만든 병 수로 나눈 값입니다.</div></section>`}

/* 더보기 */
function vMore(){const m=[['cal','기록 달력과 통계','마신 날, 연속 일수, 이번 달 요약'],['routine','주간 루틴과 보관','제조·주문·아보카도 요일, 냉장 기간, 영양제 체크'],['alarm','캘린더 알림','앱을 닫아도 정한 시간에 알림 받기'],['recipe','레시피와 도구','루비·연두 전체 레시피, 재료 고르는 법, 블렌더'],['evidence','근거와 주의사항','원문 주장의 근거 수준, 먼저 챙길 것, 주의할 경우'],['batches','제조 기록','만든 날짜, 병 수, 메모'],['backup','백업과 복원','폰을 바꿀 때를 대비해 기록 보관'],['settings','설정','이름, 소리, 글씨 크기, 화면'],['help','도움말','설치와 사용 방법'],['sources','참고 자료','설명서와 근거의 출처']];
 return `<div class="stack"><div class="ptitle">더보기</div><div class="list">${m.map(([k,t,s])=>liBtn('go" data-v="'+k,t,s)).join('')}</div>${SIM?'':`<div class="list">${liBtn(updReady?'updateNow':'updateCheck',updReady?'새 버전 적용':'업데이트 확인',updReady?'눌러서 바로 적용합니다. 기록은 유지됩니다':`현재 잔잔 ${VERSION} · ${BUILD}`)}</div>`}<div class="small faint">잔잔 ${VERSION}${SIM?' · 시뮬레이션':''}. 레시피는 「닥터라이블리 건강 스무디 완벽 가이드」 기준이며, 진단이나 처방을 대신하지 않습니다.</div></div>`}

function vCal(){const t=today(),cur=ui.month||t.slice(0,7),[y,m]=cur.split('-').map(Number),first=`${cur}-01`,dim=new Date(y,m,0).getDate(),lead=wday(first),sel=ui.sel||t;let cells='';
 for(let i=0;i<lead;i++)cells+='<div class="cell other"></div>';
 for(let d=1;d<=dim;d++){const ds=`${cur}-${pad(d)}`,it=db.intake[ds],w=wday(ds),mk=db.batches.filter(b=>b.date===ds);cells+=`<button class="cell ${ds===t?'today':''} ${ds===sel?'sel':''} ${w===0?'sun':w===6?'sat':''} ${ds>t?'fut':''}" data-a="calSel" data-v="${ds}" aria-label="${m}월 ${d}일${it?' 마심':''}${mk.length?' 제조':''}"><span class="d">${d}</span>${it?kDot(it.kind||'other',it.half):'<i class="kd none"></i>'}${mk.length?`<span class="mk k-${mk[0].kind}">제조</span>`:db.supp[ds]&&db.profile.supp?'<span class="sp">·</span>':''}</button>`}
 const ms=monthStats(cur);
 return `<div class="stack">${head('기록 달력')}<div class="calh"><button class="icb" data-a="calM" data-v="-1" aria-label="이전 달">${I.back}</button><div class="m">${y}년 ${m}월</div><button class="icb" data-a="calM" data-v="1" aria-label="다음 달" style="transform:scaleX(-1)">${I.back}</button></div>
 <div class="cal">${WD.map((w,i)=>`<div class="wd ${i===0?'sun':i===6?'sat':''}">${w}</div>`).join('')}${cells}</div>
 <div class="legend"><span>${kDot('ruby')}루비</span><span>${kDot('green')}연두</span><span>${kDot('other')}기타</span><span>${kDot('ruby',1)}반 잔</span><span><span class="mk k-ruby">제조</span>만든 날</span></div>
 ${daySec(sel)}
 <section class="sec"><div class="sech"><h2>${m}월 요약</h2></div><div class="chips3"><div><b class="num">${ms.days}/${ms.span}</b><span>마신 날</span></div><div><b class="num">${streak(t)}</b><span>지금 연속</span></div><div><b class="num">${bestStreak()}</b><span>최고 연속</span></div></div>
 <div class="list"><div class="li"><span class="grow">루비 · 연두 · 기타</span><span class="num">${ms.k.ruby} · ${ms.k.green} · ${ms.k.other}</span></div><div class="li"><span class="grow">반 잔으로 기록한 날</span><span class="num">${ms.half}일</span></div><div class="li"><span class="grow">제조</span><span class="num">${ms.batches}번, ${ms.made}병</span></div><div class="li"><span class="grow">버린 병</span><span class="num">${ms.disc}병</span></div><div class="li"><span class="grow">장보기 비용</span><span class="num">${won(ms.cost)}${ms.made?` · 한 잔당 ${won(ms.perCup)}`:''}</span></div></div></section></div>`}
function daySec(d){const it=db.intake[d],t=today(),mk=db.batches.filter(b=>b.date===d),ds=db.bottles.filter(b=>b.state==='discarded'&&b.endAt===d),sp=db.supp[d];
 return `<section class="sec"><div class="sech"><h2>${fmtLong(d)}</h2></div><div class="list">${it?`<button class="li" data-a="intakeSheet" data-d="${d}">${kDot(it.kind||'other',it.half)}<span class="grow"><span class="t">${it.kind?K(it.kind).full:'기록만'}${it.half?' 반 잔':' 한 잔'}</span><br><span class="s">${esc(it.at||'')} · 눌러서 고치기</span></span><span class="chev">${I.chev}</span></button>`:d<=t?`<button class="li" data-a="intakeSheet" data-d="${d}"><span class="grow"><span class="t">마신 기록 없음</span><br><span class="s">눌러서 이 날 기록 추가</span></span><span class="chev">${I.chev}</span></button>`:'<div class="li"><span class="s">앞으로의 날짜입니다.</span></div>'}
 ${db.profile.supp&&d<=t?`<button class="li" data-a="suppTog" data-d="${d}"><span class="grow"><span class="t">${esc(db.profile.suppName)}</span><br><span class="s">${sp?`${esc(sp)} 복용`:'복용 기록 없음, 눌러서 체크'}</span></span></button>`:''}
 ${mk.map(batchRow).join('')}${ds.length?`<div class="li"><span class="grow"><span class="t">버린 병 ${ds.length}개</span><br><span class="s">${ds.map(b=>K(b.kind).name+(b.why?` (${esc(b.why)})`:'')).join(', ')}</span></span></div>`:''}</div></section>`}

function vRoutine(){const p=db.profile;return `<div class="stack">${head('주간 루틴과 보관')}<div class="note info"><span>요일에 맞춰 오늘 화면에 할 일이 나옵니다. 기본은 수요일 아보카도 구매, 토요일 밤 주문, 일요일 제조입니다.</span></div>
 <section class="sec"><div class="grid2">${sel('rMake','제조 요일',p.makeDay,wdOpts())}${sel('rOrder','새벽배송 주문 요일',p.orderDay,wdOpts())}</div>${sel('rBuy','아보카도 사는 요일',p.buyDay,wdOpts())}<div class="small muted">아보카도는 상온에서 4~5일 후숙해야 하니 제조 4~5일 전 요일이 좋습니다.</div></section>
 <section class="sec"><div class="sech"><h2>냉장 보관 기간</h2></div>${seg('fridgeDays',p.fridgeDays,[[2,'2일'],[3,'3일']])}<div class="small muted">제조일로부터 이 기간이 지나면 기한 지남으로 표시하고, 소분할 때 냉장에 넣을 병 수의 기본값이 됩니다. 해동한 병은 옮긴 다음 날까지, 냉동은 3개월입니다.</div></section>
 <section class="sec"><div class="sech"><h2>영양제 체크</h2></div><label class="check"><input type="checkbox" id="rSupp" ${p.supp?'checked':''}><span>오늘 화면에서 영양제 복용도 함께 체크</span></label>${fld('rSuppName','영양제 이름','text',p.suppName,'placeholder="예: 엽산"')}<div class="small muted">임신을 계획하는 여성은 최소 3개월 전부터 엽산 400μg을 매일 복용하도록 권고됩니다. 스무디는 보충제를 대신하지 못합니다.</div></section>
 <button class="btn" data-a="routineSave">저장</button></div>`}

function vAlarm(){const p=db.profile,ios=isIOS(),L=alarmList(),sig=alarmSig(),ce=db.calExport;
 const stat=!ce?`<div class="note info"><b>앱을 닫아도 알림을 받을 수 있습니다</b><span>캘린더 파일을 한 번 넣으면 정한 시간에 캘린더 알림이 뜹니다.</span></div>`:ce.sig===sig?`<div class="note info"><b>캘린더 알림 ${L.length}개를 넣었습니다</b><span>${fmtYMD(ce.date)}에 넣은 일정과 지금 설정이 같습니다.</span></div>`:`<div class="note warn"><b>알림 설정이 바뀌었습니다</b><span>캘린더 앱에서 기존 잔잔 일정을 지우고 새 파일을 넣어 주세요.</span></div>`;
 return `<div class="stack">${head('캘린더 알림')}${stat}<section class="sec"><div class="list">${ALARM_DEF.filter(a=>a.k!=='supp'||p.supp).map(a=>{const s=p.alarms[a.k];return `<div class="li alarm"><label class="check grow"><input type="checkbox" data-c="alOn" data-v="${a.k}" ${s.on?'checked':''}><span><span class="t">${esc(a.t)}</span><br><span class="s">${a.rep==='매일'?'매일':WD[p[a.rep]]+'요일마다'}</span></span></label><input type="time" aria-label="${esc(a.t)} 시간" data-c="alT" data-v="${a.k}" value="${esc(s.t)}" style="width:118px;flex:none"></div>`}).join('')}</div></section>
 <button class="btn" data-a="calMake" ${L.length?'':'disabled'}>${ce?'캘린더 파일 다시 만들기':'캘린더 파일 만들기'}</button>${ios?`<a class="btn ghost" href="./#cal=${L.map(calToken).join(',')}" target="_blank" rel="noopener">공유 창이 안 열리면 Safari에서 파일 받기</a>`:''}
 <div class="small faint">일정 제목은 "잔잔 한 잔 마시기"처럼 들어갑니다. 요일을 바꾸면 이 화면에서 파일을 다시 만들어 주세요.</div>
 <section class="sec"><h2 class="h3">캘린더에 넣는 방법</h2>${calHelp(ios)}</section>
 <button class="btn sec2" data-a="calDone" ${L.length?'':'disabled'}>캘린더에 넣었습니다</button></div>`}
const CAL_IOS=['캘린더 파일 만들기를 누릅니다.','공유 창에서 메일을 고르고, 받는 사람에 본인 메일 주소를 넣어 보냅니다.','아이폰 기본 메일 앱에서 받은 메일을 엽니다.','첨부된 janjan-alarm.ics 파일을 누릅니다.','모두 추가를 누르고 저장할 캘린더를 고른 뒤 완료를 누릅니다.','잔잔으로 돌아와 캘린더에 넣었습니다를 누릅니다.'];
const CAL_AND=['캘린더 파일 만들기를 누릅니다.','다운로드 알림이나 파일 앱의 다운로드 폴더에서 janjan-alarm.ics를 누릅니다.','Samsung 캘린더 또는 Google 캘린더를 고릅니다.','저장 또는 가져오기를 누릅니다.','잔잔으로 돌아와 캘린더에 넣었습니다를 누릅니다.'];
function calHelp(ios){const o=l=>`<ol>${l.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`;return `<details ${ios?'open':''}><summary>아이폰</summary><div>${o(CAL_IOS)}</div></details><details ${ios?'':'open'}><summary>안드로이드</summary><div>${o(CAL_AND)}</div></details><details><summary>꼭 알아둘 점</summary><div><ul><li>새 파일을 넣기 전에 기존 잔잔 일정을 지우세요. 일정을 열고 이벤트 삭제 → 이후 모든 이벤트 삭제를 고릅니다.</li><li>캘린더 알림은 잔잔과 연결되어 있지 않습니다. 알림을 받은 뒤 잔잔을 열어 기록하세요.</li><li>무음 모드나 집중 모드에서는 알림이 숨겨질 수 있습니다.</li><li>처음 넣은 날에는 다음 알림이 뜨는지 확인하세요.</li></ul></div></details>`}

function vRecipe(){const k=ui.recipe,KD=K(k),S=STEAM[k];
 return `<div class="stack">${head('레시피와 도구')}${seg('recipeK',k,[['ruby','루비'],['green','연두'],['tools','도구'],['pick','고르는 법']])}${k==='tools'?toolsView():k==='pick'?pickView():`
 <div class="kinfo k-${k}"><div class="row between"><b class="kname">${KD.full}</b><span class="s">${KD.base}</span></div><div class="kgrid"><span>원문 용도</span><b>${KD.use}</b><span>대상</span><b>${KD.who}</b><span>하루 용량</span><b>1잔, 250~300ml</b><span>만드는 양</span><b>${KD.liters}, ${KD.cupsTxt}</b><span>걸리는 시간</span><b>${KD.mins}</b></div></div>
 <section class="sec"><div class="sech"><h2>재료 (1배치)</h2></div><div class="list">${RECIPE[k].map(it=>{const l=ingLine(it,1);return `<div class="li"><span class="grow"><span class="t">${esc(l.n)} <span class="amt num">${esc(l.a)}</span></span><br><span class="s">${esc(it.prep)}</span></span></div>`}).join('')}</div></section>
 <section class="sec"><div class="sech"><h2>찜 시간표</h2></div><div class="list">${S.ev.map(e=>`<div class="li"><span class="num" style="width:44px;flex:none;font-weight:700">${Math.round(e[0]/60)}분</span><span class="grow">${esc(e[1])}</span></div>`).join('')}</div><div class="small muted">원문은 재료별 찜 시간(${esc(S.note)})만 제시합니다. 위 시간표는 그 시간을 찜기 하나에서 맞추도록 배치한 것입니다.</div>
 ${k==='green'?`<details><summary>찜 시간은 출처마다 조금 다릅니다</summary><div><table class="tbl"><tr><th>출처</th><th>양배추</th><th>브로콜리</th></tr>${STEAM_CMP.map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</table><p class="small">세 출처 모두 5분을 넘기지 않는다는 원칙은 같습니다. 양배추가 두껍거나 식감이 거칠면 1분씩 늘려도 범위 안입니다.</p></div></details>`:''}</section>
 <section class="sec"><div class="sech"><h2>순서</h2></div><ol class="steps">${STEPS[k].filter(s=>s.type!=='done'&&s.type!=='ready').map(s=>`<li><b>${esc(s.type==='steam'?`찜 ${Math.round(S.total/60)}분`:s.title)}</b>${s.lead?` ${esc(s.lead)}`:''}</li>`).join('')}</ol></section>${fixBox(k)}<button class="btn" data-a="mkFrom" data-v="${k}">이 레시피로 만들기</button>`}</div>`}
function toolsView(){return `<div class="list">${TOOLS.map(([a,b,c])=>`<div class="li"><span class="grow"><span class="t">${esc(a)}</span><br><span class="s">${esc(b)}</span><br><span class="s faint">${esc(c)}</span></span></div>`).join('')}</div><section class="sec"><div class="sech"><h2>블렌더를 새로 산다면</h2></div><div class="note info"><span>한 배치가 약 2L라서 2L 용기에도 한 번에 넣으면 넘칩니다. 어떤 제품이든 절반씩 두 번 나눠 가세요.</span></div><div class="list">${BLENDERS.map(([a,b,c])=>`<div class="li"><span class="grow"><span class="t">${esc(a)}</span><br><span class="s">${esc(c)}</span></span><span class="small num">${esc(b)}</span></div>`).join('')}</div><div class="small faint">가격대와 평가는 노써치의 2026년 추천 기준이며 판매처와 시기에 따라 달라집니다.</div></section>`}
function pickView(){return `<div class="list">${Object.values(PICK).map(p=>`<div class="li"><span class="grow"><span class="t">${esc(p.n)}</span><br><span class="s">${esc(p.how)}</span><br><span class="s faint">${esc(p.more)}</span></span></div>`).join('')}</div>`}

function vEvidence(){const src=a=>a&&a.length?`<div class="small faint">출처: ${a.map(i=>`<a href="${esc(SOURCES[i][1])}" target="_blank" rel="noopener">${esc(SOURCES[i][0].split(',')[0])}</a>`).join(', ')}</div>`:'';
 return `<div class="stack">${head('근거와 주의사항')}<div class="note info"><b>먼저 알아둘 점</b><span>이 스무디는 채소 섭취를 늘리는 좋은 방법입니다. 다만 임신 가능성을 높인다는 점이 사람 대상 연구로 확인된 것은 아니며, 엽산 보충제와 임신 전 검사를 대신하지 못합니다. 아래는 공개 자료를 정리한 것으로 진료를 대신하지 않습니다.</span></div>
 <section class="sec"><div class="sech"><h2>원문 주장별 근거 수준</h2></div>${CLAIMS.map(c=>`<div class="claim"><div class="cq">“${esc(c.q)}”</div><p class="small">${esc(c.f)}</p><div class="cv">판단: ${esc(c.v)}</div>${src(c.s)}</div>`).join('')}</section>
 <section class="sec"><div class="sech"><h2>스무디보다 먼저 챙길 세 가지</h2></div>${FIRST.map(([a,b,s],i)=>`<div class="claim first"><div class="cq">${i+1}. ${esc(a)}</div><p class="small">${esc(b)}</p>${src(s)}</div>`).join('')}</section>
 <section class="sec"><div class="sech"><h2>먼저 의사와 상의할 경우</h2></div><div class="list">${CAUTIONS.map(([a,b,s])=>`<div class="li"><span class="grow"><span class="t">${esc(a)}</span><br><span class="s">${esc(b)}</span>${src(s)}</span></div>`).join('')}</div>${EV_NOTES.map(n=>`<p class="small muted">${esc(n)}</p>`).join('')}</section></div>`}

function vBatches(){const L=db.batches.slice().reverse();return `<div class="stack">${head('제조 기록')}<div class="list">${L.map(batchRow).join('')||'<div class="li"><span class="s">아직 만든 기록이 없습니다.</span></div>'}</div><div class="small faint">기록을 누르면 메모를 고치거나 기록을 지울 수 있습니다. 기록을 지워도 보관 중인 병은 그대로입니다.</div></div>`}

function vBackup(){const t=db.lastBackup;return `<div class="stack">${head('백업과 복원')}<div class="note info"><span>기록은 이 폰에만 있습니다. 2주에 한 번 백업 파일을 만들어 폰의 파일 앱에 보관하세요.${t?` 마지막 백업 ${fmtYMD(t)}.`:''}</span></div>
 <section class="sec"><h2 class="h3">내보내기</h2>${SIM?'':'<button class="btn" data-a="exportFile">백업 파일 만들기</button>'}<button class="btn sec2" data-a="exportCopy">백업 내용 복사</button><textarea id="bkOut" hidden readonly aria-label="백업 내용"></textarea></section>
 <section class="sec"><h2 class="h3">복원</h2><p class="small muted">복원하면 지금 폰의 기록이 백업 내용으로 바뀝니다.</p><div class="fld"><label for="bkFile">백업 파일 선택</label><input id="bkFile" type="file" accept=".json,application/json"></div><div class="fld"><label for="bkText">또는 백업 내용 붙여넣기</label><textarea id="bkText"></textarea></div><button class="btn sec2" data-a="restoreAsk">복원하기</button></section></div>`}

function vSettings(){const p=db.profile;return `<div class="stack">${head('설정')}<section class="sec">${fld('sName','이름 (선택)','text',p.name,'placeholder="오늘 화면에 표시"')}</section>
 <section class="sec"><h2 class="h3">알림 소리</h2><label class="check"><input type="checkbox" id="sSound" ${p.sound!==false?'checked':''}><span>찜 타이머 알림에 소리 내기</span></label><button class="btn sec2" data-a="soundTest">알림 소리 시험</button><div class="small muted">아이폰은 진동이 되지 않고, 무음 모드에서는 소리가 작거나 안 날 수 있습니다. 화면 알림은 항상 나옵니다.</div></section>
 <section class="sec"><h2 class="h3">화면</h2><label class="check"><input type="checkbox" id="sLarge" ${p.fontLarge?'checked':''}><span>글씨 크게</span></label>${sel('sTheme','화면 모드',p.theme,[['system','폰 설정 따르기'],['light','밝게'],['dark','어둡게']])}</section>
 <button class="btn" data-a="settingsSave">저장</button>
 <section class="sec"><h2 class="h3">초기화</h2><button class="btn danger" data-a="resetAsk">모든 기록 지우기</button><div class="small muted">지우기 전에 백업 파일을 만들어 두세요.</div></section></div>`}

function vHelp(){return `<div class="stack">${head('도움말')}${HELP.map((s,i)=>`<details ${i===0?'open':''}><summary>${esc(s[0])}</summary><div>${s[1]}</div></details>`).join('')}</div>`}
function vSources(){return `<div class="stack">${head('참고 자료')}<div class="list">${SOURCES.map(([t,u])=>`<a class="li" href="${esc(u)}" target="_blank" rel="noopener"><span class="grow t" style="font-weight:500">${esc(t)}</span>${I.chev}</a>`).join('')}</div><p class="small muted">레시피의 재료, 용량, 재료별 찜 시간은 「닥터라이블리 건강 스무디 완벽 가이드」 PDF 기준입니다. 제조량, 소요 시간, 찜 시간표, 도구, 구입처는 2026년 11월에 추가로 조사하거나 계산한 내용입니다. 잔잔은 진단이나 처방을 하지 않습니다.</p></div>`}

/* 첫 설정 */
function installHint(){const ua=navigator.userAgent,iOS=isIOS(),inapp=/KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(ua),stand=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 if(stand||SIM)return'';if(inapp)return `<div class="note warn"><b>지금은 앱 안 브라우저입니다</b><span>주소를 복사해 ${iOS?'Safari':'Chrome'}에서 열어주세요. 이 화면에서는 설치할 수 없습니다.</span></div>`;
 if(iOS)return `<div class="note warn"><b>먼저 홈 화면에 추가하세요</b><span>Safari 아래쪽 공유 버튼 → 홈 화면에 추가 → 웹 앱으로 열기 켜기 → 추가. 그다음 홈 화면의 잔잔 아이콘에서 시작하세요. Safari에서 입력한 내용은 홈 화면 앱으로 넘어가지 않습니다.</span></div>`;
 return `<div class="note info"><b>홈 화면에 설치하세요</b><span>Chrome 오른쪽 위 ⋮ → 앱 설치 또는 홈 화면에 추가.</span>${window.__bip?'<button class="btn sm" data-a="pwaInstall" style="margin-top:6px">지금 설치</button>':''}</div>`}
function vSetup(){if(ui.setupHelp)return `<div class="stack"><div class="row"><button class="icb" data-a="setupBack" aria-label="뒤로" style="margin-left:-10px">${I.back}</button><div class="ptitle grow">도움말</div></div>${HELP.map((s,i)=>`<details ${i===0?'open':''}><summary>${esc(s[0])}</summary><div>${s[1]}</div></details>`).join('')}</div>`;
 return `<div class="stack"><div class="hero"><div class="logo" aria-hidden="true"><i class="k-ruby"></i><i class="k-green"></i></div><div class="ptitle" style="font-size:2.4rem">잔잔</div><div class="muted">하루 한 잔, 루비와 연두 스무디 루틴. 만들기, 보관, 장보기, 마신 기록을 한곳에서 챙깁니다. 기록은 이 폰 안에만 저장됩니다.</div></div>${installHint()}
 <section class="sec">${fld('fName','이름 (선택)','text','','placeholder="오늘 화면에 표시"')}${sel('fMake','스무디 만드는 요일',0,wdOpts())}<div class="small muted">주문은 전날, 아보카도 구매는 4일 전 요일로 정해집니다. 나중에 바꿀 수 있습니다.</div></section>
 <section class="sec"><label class="check"><input type="checkbox" id="fSupp"><span>영양제(엽산 등) 복용도 함께 체크</span></label></section>
 <button class="btn big" data-a="setupDone">시작하기</button><button class="btn ghost" data-a="setupHelp">사용 방법 보기</button></div>`}

/* 시트와 이동 */
let navArmed=false;
function pushNav(){if(!navArmed){try{history.pushState({jj:1},'')}catch(e){}navArmed=true}}
const shh=t=>`<div class="shh"><h2>${t}</h2><button class="icb" data-a="close" aria-label="닫기">${I.x}</button></div>`;
function openSheet(html){$('#sheet').innerHTML=`<div class="scrim" data-a="scrim"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;sheetOpen=true;pushNav();const f=$('#sheet .sheet');if(f)f.scrollTop=0}
function closeSheet(){$('#sheet').innerHTML='';sheetOpen=false}
function go(v){stack.push(v);pushNav();render();scrollTo(0,0)}
let toastT;function toast(msg,undo){const old=$('.toast');if(old)old.remove();const el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.innerHTML=`<span>${esc(msg)}</span>${undo?'<button data-a="undo">되돌리기</button>':''}`;document.body.appendChild(el);ui.undo=undo||null;clearTimeout(toastT);toastT=setTimeout(()=>{el.remove();ui.undo=null},undo?5200:3200)}
async function copyText(t){try{await navigator.clipboard.writeText(t);return true}catch(e){const a=document.createElement('textarea');a.value=t;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();let ok=false;try{ok=document.execCommand('copy')}catch(x){}a.remove();return ok}}
const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

function intakeSheet(d){const t=today(),it=db.intake[d],isT=d===t;ui.is={d,kind:it?it.kind||'':(pickBottle(d)||{}).kind||'ruby',bottle:it?it.bottle:(isT?(pickBottle(d)||{}).id||'':''),half:it?it.half:false};
 const bs=isT?fridge().filter(b=>b.made<=d).sort(byLast).concat(it&&it.bottle?db.bottles.filter(b=>b.id===it.bottle&&b.state==='drunk'):[]):[];
 const bopts=bs.map(b=>{const s=bottleStatus(b,d);return `<label class="check radio"><input type="radio" name="isB" value="${b.id}" ${ui.is.bottle===b.id?'checked':''}><span>${kDot(b.kind)} ${K(b.kind).name} · ${bottleOrigin(b)}<br><span class="s ${s.c}">${b.state==='drunk'?'이 기록의 병':esc(s.t)}</span></span></label>`}).join('');
 openSheet(`${shh(`${fmtLong(d)} 기록`)}${isT&&bs.length?`<section class="sec"><h3 class="h3">마신 병</h3><div class="cks">${bopts}<label class="check radio"><input type="radio" name="isB" value="" ${!ui.is.bottle?'checked':''}><span>병 없이 기록 (밖에서 마심 등)</span></label></div></section>`:''}
 <section class="sec" id="isKindSec" ${isT&&ui.is.bottle?'hidden':''}><h3 class="h3">종류</h3>${seg('isKind',ui.is.kind,[['ruby','루비'],['green','연두'],['other','기타']])}</section>
 <div class="grid2">${fld('isAt','마신 시각','time',it?it.at:(isT?nowHM():'08:00'))}<label class="check" style="align-self:end"><input type="checkbox" id="isHalf" ${ui.is.half?'checked':''}><span>반 잔만</span></label></div>
 <button class="btn" data-a="isSave">저장</button>${it?'<button class="btn ghost" data-a="isDel">이 날 기록 지우기</button>':''}${it&&it.bottle?'<div class="small faint">기록을 지우면 병이 다시 냉장으로 돌아갑니다.</div>':''}`)}

function bottleSheet(id){const b=db.bottles.find(x=>x.id===id);if(!b)return;const t=today(),s=bottleStatus(b,t);
 openSheet(`${shh(`${K(b.kind).full}`)}<div class="list"><div class="li"><span class="grow">제조일</span><span>${fmtYMD(b.made)}</span></div>${b.thawedAt?`<div class="li"><span class="grow">해동 시작</span><span>${fmtYMD(b.thawedAt)}</span></div>`:''}<div class="li"><span class="grow">상태</span><span class="${s.c}">${esc(s.t)}</span></div></div>
 ${b.state==='fridge'?`<button class="btn" data-a="drinkNow" data-v="${b.id}">${db.intake[t]?'오늘 기록을 이 병으로 바꾸기':'이 병 마셨어요 (오늘)'}</button>`:`<button class="btn" data-a="thawBtn" data-v="${b.id}">해동 시작 (냉장실로 옮김)</button>`}
 <section class="sec"><h3 class="h3">버리기</h3><div class="chips">${['기한 지남','냄새·맛 이상','기포·거품','기타'].map(w=>`<button class="chip" data-a="discard" data-v="${b.id}" data-w="${w}">${w}</button>`).join('')}</div></section>`)}
function freezeSheet(key){const [k,m]=key.split('|'),L=freezer().filter(b=>b.kind===k&&b.made===m);if(!L.length)return;
 openSheet(`${shh(`냉동 ${K(k).name} · ${fmtMD(m)} 제조`)}<div class="small muted">${L.length}병 · ${fmtMD(add(m,FREEZE_DAYS))}까지</div><button class="btn" data-a="thawBtn" data-v="${L[0].id}">1병 해동 시작</button><section class="sec"><h3 class="h3">1병 버리기</h3><div class="chips">${['기한 지남','냄새·맛 이상','기타'].map(w=>`<button class="chip" data-a="discard" data-v="${L[0].id}" data-w="${w}">${w}</button>`).join('')}</div></section>`)}
function addBottlesSheet(){ui.ab={kind:'ruby',n:1,place:'fridge'};const t=today();
 openSheet(`${shh('병 직접 추가')}<div class="small muted">앱을 쓰기 전에 만들어 둔 병을 넣습니다.</div><section class="sec"><h3 class="h3">종류</h3>${seg('abKind','ruby',[['ruby','루비'],['green','연두']])}</section>${fld('abMade','제조일','date',t,`max="${t}"`)}<section class="sec"><h3 class="h3">보관 위치</h3>${seg('abPlace','fridge',[['fridge','냉장'],['freezer','냉동']])}</section><section class="sec"><h3 class="h3">병 수</h3><div id="abN">${stepper('abN',1,'병 수','병')}</div></section><button class="btn" data-a="abSave">추가</button>`)}
function pickSheet(k){const p=PICK[k];if(!p)return;openSheet(`${shh(`${esc(p.n)} 고르는 법`)}<p>${esc(p.how)}</p><p class="small muted">${esc(p.more)}</p>`)}
function avoSheet(id){const a=db.pantry.avo.find(x=>x.id===id);if(!a)return;
 openSheet(`${shh(`아보카도 ${a.n}개`)}<div class="small muted">${fmtYMD(a.bought)} 구입 · ${a.ripe?'익음':'후숙 중'}</div><p class="small">${esc(PICK.avocado.how)}</p><section class="sec"><h3 class="h3">개수</h3>${stepper('avoN" data-id="'+a.id,a.n,'아보카도 개수','개')}</section>${a.ripe?'':`<button class="btn" data-a="avoRipe" data-v="${a.id}">익었어요 (냉장고로 옮김)</button><button class="btn sec2" data-a="avoLater" data-v="${a.id}">아직 단단해요 (내일 다시 확인)</button>`}<button class="btn ghost" data-a="avoDel" data-v="${a.id}">재고에서 지우기</button>`)}
function batchSheet(id){const b=db.batches.find(x=>x.id===id);if(!b)return;const min=b.end&&b.start?Math.round((b.end-b.start)/6e4):0;
 openSheet(`${shh(`${fmtYMD(b.date)} ${K(b.kind).name}`)}<div class="list"><div class="li"><span class="grow">양</span><span>${multLabel(b.kind,b.mult)}${b.kind==='beet'?` · 냉동 ${b.portions}회분`:` · ${b.bottles}병`}</span></div>${min?`<div class="li"><span class="grow">걸린 시간</span><span>약 ${min}분</span></div>`:''}${b.taste?`<div class="li"><span class="grow">맛 조절</span><span>${esc(b.taste)}</span></div>`:''}${b.fb?'<div class="li"><span class="grow">냉동 찐 비트 사용</span><span>예</span></div>':''}</div><div class="fld"><label for="bMemo">메모</label><textarea id="bMemo">${esc(b.memo||'')}</textarea></div><button class="btn" data-a="batchSave" data-v="${b.id}">메모 저장</button><button class="btn ghost" data-a="batchDel" data-v="${b.id}">이 제조 기록 지우기</button>`)}
function cookMenu(){openSheet(`${shh('만들기 나가기')}<button class="btn" data-a="cookLeave">잠시 나가기 (이어서 하기)</button><button class="btn sec2" data-a="cookRestart">처음 단계로</button><button class="btn danger" data-a="cookAbort">만들기 그만두기</button><div class="small muted">그만두면 진행 내용이 지워지고 병은 등록되지 않습니다.</div>`)}
function ripeSheet(id){avoSheet(id)}

/* 캘린더 파일 */
function alarmList(){const p=db.profile;return ALARM_DEF.filter(a=>(a.k!=='supp'||p.supp)&&p.alarms[a.k]&&p.alarms[a.k].on).map(a=>({k:a.k,t:a.t,time:p.alarms[a.k].t,day:a.rep==='매일'?null:Number(p[a.rep]),desc:a.desc}))}
const alarmSig=()=>alarmList().map(a=>a.k+a.time+(a.day==null?'':a.day)).join(',');
const calToken=a=>a.k+a.time.replace(':','')+(a.day==null?'':a.day);
const ICSD=['SU','MO','TU','WE','TH','FR','SA'];
function buildIcs(list){const crlf='\r\n',stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z'),t=today();
 const out=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Janjan//Smoothie Routine//KO','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
 for(const a of list){let d=t;if(a.day!=null)for(let i=0;i<7;i++){const x=add(t,i);if(wday(x)===a.day){d=x;break}}const hm=a.time.replace(':','');
  out.push('BEGIN:VEVENT',`UID:janjan-${a.k}@janjan.app`,`DTSTAMP:${stamp}`,`DTSTART:${d.replace(/-/g,'')}T${hm}00`,'DURATION:PT10M',a.day==null?'RRULE:FREQ=DAILY':`RRULE:FREQ=WEEKLY;BYDAY=${ICSD[a.day]}`,`SUMMARY:잔잔 ${a.t}`,`DESCRIPTION:${a.desc}`,'TRANSP:TRANSPARENT','BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:잔잔 ${a.t}`,'TRIGGER:PT0M','END:VALARM','END:VEVENT')}
 out.push('END:VCALENDAR');return out.join(crlf)+crlf}
function parseCal(h){const m=h.match(/^#cal=(.+)$/);if(!m)return null;const out=[];for(const tk of decodeURIComponent(m[1]).split(',').slice(0,8)){const p=tk.match(/^(drink|supp|thaw|avo|order|make)(\d{2})(\d{2})([0-6])?$/);if(!p||Number(p[2])>23||Number(p[3])>59)return null;const a=ALARM_DEF.find(x=>x.k===p[1]);out.push({k:a.k,t:a.t,time:p[2]+':'+p[3],day:p[4]==null?null:Number(p[4]),desc:a.desc})}return out.length?out:null}
async function shareFile(data,name,type,title){if(SIM){toast('시뮬레이션에서는 파일을 만들지 않습니다');return false}const f=new File([data],name,{type});try{if(isIOS()&&navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title});return true}}catch(e){if(e&&e.name==='AbortError')return false}const blob=new Blob([data],{type:type+';charset=utf-8'}),u=URL.createObjectURL(blob),el=document.createElement('a');el.href=u;el.download=name;document.body.appendChild(el);el.click();el.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);return true}
function vCalPage(){const L=ui.calPage;return `<div class="stack"><div class="ptitle">캘린더 알림 파일</div><div class="note info"><span>이 화면은 파일을 받는 전용 화면입니다. 여기서 기록하지 마세요.</span></div><div class="list">${L.map(a=>`<div class="li"><span class="grow t">잔잔 ${esc(a.t)}</span><span class="num">${a.day==null?'매일':WD[a.day]+'요일'} ${esc(a.time)}</span></div>`).join('')}</div><button class="btn" data-a="calPageGet">파일 받기</button><ol><li>파일 받기를 누르고 다운로드를 허용합니다.</li><li>주소창 옆 다운로드 표시를 누릅니다.</li><li>janjan-alarm.ics를 누르고 모두 추가를 누릅니다.</li><li>저장할 캘린더를 고르고 완료를 누릅니다.</li><li>홈 화면의 잔잔으로 돌아가 캘린더에 넣었습니다를 누릅니다.</li></ol></div>`}

/* 백업 */
const backupText=()=>JSON.stringify({app:'janjan',v:1,exportedAt:new Date().toISOString(),db});
async function restoreFrom(text){let o;try{o=JSON.parse(text)}catch(e){toast('백업 내용을 읽지 못했습니다');return}const d=o&&o.app==='janjan'&&o.db?o.db:(o&&o.profile&&o.bottles?o:null);if(!d){toast('잔잔 백업이 아닙니다');return}
 openSheet(`${shh('복원할까요?')}<p>지금 폰의 기록이 백업 내용으로 바뀝니다. 되돌릴 수 없습니다.</p><div class="small muted">백업 안 기록: 마신 날 ${Object.keys(d.intake||{}).length}일, 병 ${(d.bottles||[]).length}개, 제조 ${(d.batches||[]).length}번</div><button class="btn danger" data-a="restoreGo">복원하기</button><button class="btn sec2" data-a="close">취소</button>`);ui.restore=d}

/* 동작 */
const ACT={
 tab(d){view=d.v;stack=[];ui.sel=null;render();scrollTo(0,0)},
 go(d){go(d.v)},
 back(){history.back()},
 close(){history.back()},
 scrim(){history.back()},
 undo(){if(ui.undo){ui.undo();ui.undo=null;save();render();const o=$('.toast');if(o)o.remove()}},
 goMake(){view='make';stack=[];render();scrollTo(0,0)},
 goShop(){view='shop';ui.shop='list';stack=[];render();scrollTo(0,0)},
 /* 오늘 */
 async drinkNow(d){const t=today();if(sheetOpen)closeSheet();const u=drink(t,{bottle:d.v,at:nowHM()});await save();render();toast('한 잔 기록했습니다',u)},
 intakeSheet(d){intakeSheet(d.d||today())},
 async isSave(){const s=ui.is,t=today(),bEl=document.querySelector('input[name="isB"]:checked'),bottle=bEl?bEl.value:'',at=$('#isAt').value||nowHM(),half=$('#isHalf').checked;
  if(s.d>t){toast('앞으로의 날짜는 기록할 수 없습니다');return}
  drink(s.d,{bottle:s.d===t&&bottle?bottle:null,kind:s.kind==='other'?null:s.kind,at,half});await save();history.back();render();toast('기록했습니다')},
 async isDel(){const d=ui.is.d;undrink(d);await save();history.back();render();toast('기록을 지웠습니다')},
 isKind(d){ui.is.kind=d.v;$$('#isKindSec .seg button').forEach(b=>{b.classList.toggle('on',b.dataset.v===d.v);b.setAttribute('aria-pressed',b.dataset.v===d.v)})},
 async suppTog(d){const day=d.d||today();if(db.supp[day])delete db.supp[day];else db.supp[day]=nowHM();await save();render()},
 async taskDone(d){const k=d.k+':'+today();if(d.k==='thaw'&&!db.done[k]){return ACT.thawTask()}if(d.k==='avo'&&!db.done[k]){db.done[k]=true;await save();render();toast('아보카도를 사셨다면 장보기에서 체크해 재고에 넣으세요');return}db.done[k]=!db.done[k];await save();render()},
 async thawTask(){const t=today();if(db.done['thaw:'+t]){delete db.done['thaw:'+t];await save();render();return}const b=thawOne();if(!b){toast('냉동 병이 없습니다');return}db.done['thaw:'+t]=true;await save();render();toast(`냉동 ${K(b.kind).name} 1병을 냉장실로 옮겼습니다`,()=>{b.state='freezer';b.thawedAt='';delete db.done['thaw:'+t]})},
 async thawNow(){const b=thawOne();if(!b)return;await save();render();toast(`냉동 ${K(b.kind).name} 1병을 냉장실로 옮겼습니다`,()=>{b.state='freezer';b.thawedAt=''})},
 async thawBtn(d){const b=thawOne(d.v);if(!b)return;if(sheetOpen)history.back();await save();render();toast(`${K(b.kind).name} 1병 해동을 시작했습니다. 내일 마시세요`,()=>{b.state='freezer';b.thawedAt=''})},
 ripeSheet(d){avoSheet(d.id)},
 /* 만들기 */
 mkKind(d){ui.mk=ui.mk||{};ui.mk.kind=d.v;ui.mk.mult=null;ui.mk.fb=false;render()},
 mkMult(d){ui.mk.mult=Number(d.v);render()},
 mkFrom(d){ui.mk={kind:d.v,mult:null,fb:false};view='make';stack=[];render();scrollTo(0,0)},
 openRecipe(d){ui.recipe=d.v;go('recipe')},
 async cookStart(d){const m=ui.mk;audioUnlock();startCook(m.kind,Number(d.v),m.fb);await save();render();scrollTo(0,0)},
 async ck(){},
 async cookNext(){const c=db.cook,S=cookSteps(c);if(c.step<S.length-1){c.step++;await save();render();scrollTo(0,0)}},
 async cookPrev(){const c=db.cook;if(c.step>0){c.step--;await save();render();scrollTo(0,0)}},
 cookMenu(){cookMenu()},
 cookLeave(){history.back();view='today';render();scrollTo(0,0)},
 async cookRestart(){const c=db.cook;c.step=0;c.ck={};c.t={};await save();history.back();render()},
 async cookAbort(){db.cook=null;await save();wakeOff();history.back();render();toast('만들기를 그만뒀습니다')},
 async cookFinish(){const c=db.cook;const k=c.kind,n=c.total;finishCook();wakeOff();await save();if(k==='beet'){view='shop';ui.shop='pantry'}else view='store';render();scrollTo(0,0);toast(k==='beet'?`냉동 찐 비트 ${n}회분을 재고에 더했습니다`:`${K(k).name} ${n}병을 보관에 등록했습니다`)},
 async tGo(d){tStart(d.v);await save();render();tick()},
 async tPause(d){tPause(d.v);await save();render()},
 async tReset(d){tReset(d.v);await save();render()},
 async taste(d){db.cook.taste=d.v;await save();render()},
 async pTotal(d){const c=db.cook;c.total=Math.max(1,Math.min(40,c.total+Number(d.v)));if(c.kind!=='beet')c.fridge=Math.min(c.fridge,c.total);await save();render()},
 async pFridge(d){const c=db.cook;c.fridge=Math.max(0,Math.min(c.total,c.fridge+Number(d.v)));await save();render()},
 ringOk(){ringStop();render()},
 batchSheet(d){batchSheet(d.v)},
 async batchSave(d){const b=db.batches.find(x=>x.id===d.v);if(b)b.memo=$('#bMemo').value.trim();await save();history.back();render();toast('메모를 저장했습니다')},
 async batchDel(d){db.batches=db.batches.filter(x=>x.id!==d.v);await save();history.back();render();toast('제조 기록을 지웠습니다')},
 /* 보관 */
 bottleSheet(d){bottleSheet(d.v)},
 freezeSheet(d){freezeSheet(d.v)},
 async discard(d){const b=db.bottles.find(x=>x.id===d.v);if(!b)return;const prev={state:b.state,endAt:b.endAt};b.state='discarded';b.endAt=today();b.why=d.w;await save();history.back();render();toast('버린 병으로 기록했습니다',()=>{b.state=prev.state;b.endAt=prev.endAt;delete b.why})},
 addBottles(){addBottlesSheet()},
 abKind(d){ui.ab.kind=d.v;$$('#sheet .seg button[data-a="abKind"]').forEach(b=>b.classList.toggle('on',b.dataset.v===d.v))},
 abPlace(d){ui.ab.place=d.v;$$('#sheet .seg button[data-a="abPlace"]').forEach(b=>b.classList.toggle('on',b.dataset.v===d.v))},
 abN(d){ui.ab.n=Math.max(1,Math.min(30,ui.ab.n+Number(d.v)));$('#abN').innerHTML=stepper('abN',ui.ab.n,'병 수','병')},
 async abSave(){const a=ui.ab,m=$('#abMade').value||today();if(m>today()){toast('제조일이 앞으로의 날짜입니다');return}for(let i=0;i<a.n;i++)db.bottles.push({id:uid(),kind:a.kind,made:m,batch:'',state:a.place,thawedAt:'',endAt:''});await save();history.back();render();toast(`${K(a.kind).name} ${a.n}병을 추가했습니다`)},
 /* 장보기 */
 shopTab(d){ui.shop=d.v;render()},
 async planSet(d){db.plan[d.k]=Number(d.v);await save();render()},
 pickSheet(d){pickSheet(d.v)},
 async shopCopy(){const ok=await copyText(shopText());toast(ok?'장보기 목록을 복사했습니다':'복사하지 못했습니다')},
 async shopReset(){const nm=nextMake();for(const k of Object.keys(db.shopChecks))if(k.startsWith(nm+'|'))delete db.shopChecks[k];await save();render()},
 async pan(d){const pn=db.pantry,step={avoFrozenG:60,beetFrozen:1,lemonMl:30}[d.k];pn[d.k]=Math.max(0,(Number(pn[d.k])||0)+step*Number(d.v));await save();render()},
 avoSheet(d){avoSheet(d.v)},
 avoAdd(){db.pantry.avo.push({id:uid(),n:3,bought:today(),ripe:false});save();render();toast('아보카도 3개를 추가했습니다. 관리에서 개수를 바꿀 수 있습니다')},
 async avoN(d){const a=db.pantry.avo.find(x=>x.id===d.id);if(!a)return;a.n=Math.max(1,Math.min(20,a.n+Number(d.v)));await save();avoSheet(a.id);render()},
 async avoRipe(d){const a=db.pantry.avo.find(x=>x.id===d.v);if(a)a.ripe=true;await save();history.back();render();toast('익은 아보카도로 표시했습니다. 냉장고에 넣어 두세요')},
 async avoLater(d){const a=db.pantry.avo.find(x=>x.id===d.v);if(a)a.recheck=add(today(),1);await save();history.back();render();toast('내일 다시 알려 드립니다')},
 async avoDel(d){db.pantry.avo=db.pantry.avo.filter(x=>x.id!==d.v);await save();history.back();render()},
 costM(d){const t=today(),cur=ui.costM||t.slice(0,7);const [y,m]=cur.split('-').map(Number);const x=new Date(y,m-1+Number(d.v),1);ui.costM=`${x.getFullYear()}-${pad(x.getMonth()+1)}`;render()},
 async costAdd(){const a=Number($('#pAmt').value);if(!a||a<0){toast('금액을 입력해 주세요');return}db.purchases.push({id:uid(),date:$('#pDate').value||today(),store:$('#pStore').value,amount:Math.round(a),memo:$('#pMemo').value.trim()});await save();render();toast('장보기 비용을 기록했습니다')},
 costSheet(d){const p=db.purchases.find(x=>x.id===d.v);if(!p)return;openSheet(`${shh('장보기 기록')}<div class="list"><div class="li"><span class="grow">${fmtYMD(p.date)} ${esc(p.store)}</span><span class="num">${won(p.amount)}</span></div></div>${p.memo?`<p class="small">${esc(p.memo)}</p>`:''}<button class="btn danger" data-a="costDel" data-v="${p.id}">이 기록 지우기</button>`)},
 async costDel(d){db.purchases=db.purchases.filter(x=>x.id!==d.v);await save();history.back();render()},
 /* 달력 */
 calSel(d){ui.sel=d.v;render()},
 calM(d){const t=today(),cur=ui.month||t.slice(0,7);const [y,m]=cur.split('-').map(Number);const x=new Date(y,m-1+Number(d.v),1);ui.month=`${x.getFullYear()}-${pad(x.getMonth()+1)}`;ui.sel=null;render()},
 /* 설정 */
 async routineSave(){const p=db.profile;p.makeDay=Number($('#rMake').value);p.orderDay=Number($('#rOrder').value);p.buyDay=Number($('#rBuy').value);p.supp=$('#rSupp').checked;p.suppName=$('#rSuppName').value.trim()||'엽산';await save();toast('저장했습니다');history.back()},
 async fridgeDays(d){db.profile.fridgeDays=Number(d.v);await save();render()},
 async settingsSave(){const p=db.profile;p.name=$('#sName').value.trim();p.sound=$('#sSound').checked;p.fontLarge=$('#sLarge').checked;p.theme=$('#sTheme').value;await save();applyPrefs();toast('저장했습니다');history.back()},
 soundTest(){audioUnlock();setTimeout(()=>ring(['알림 소리 시험입니다. 소리가 들렸나요?'],'green'),120)},
 resetAsk(){openSheet(`${shh('모든 기록을 지울까요?')}<p>병, 마신 기록, 제조 기록, 재고, 설정이 모두 지워집니다. 되돌릴 수 없습니다.</p><button class="btn danger" data-a="resetGo">모두 지우기</button><button class="btn sec2" data-a="close">취소</button>`)},
 async resetGo(){await Store.clear();db=null;stack=[];view='today';closeSheet();render();toast('모든 기록을 지웠습니다')},
 /* 알림 */
 async calMake(){const L=alarmList();if(!L.length)return;const ok=await shareFile(buildIcs(L),'janjan-alarm.ics','text/calendar','잔잔 알림');if(ok&&!isIOS())toast('파일을 저장했습니다. 파일을 열어 캘린더에 추가하세요')},
 async calDone(){db.calExport={date:today(),sig:alarmSig()};await save();render();toast('캘린더 알림을 기록했습니다')},
 calPageGet(){const blob=new Blob([buildIcs(ui.calPage)],{type:'text/calendar;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='janjan-alarm.ics';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000)},
 recipeK(d){ui.recipe=d.v;render()},
 /* 백업 */
 async exportFile(){const ok=await shareFile(backupText(),`janjan-backup-${today().replace(/-/g,'')}.json`,'application/json','잔잔 백업');if(ok){db.lastBackup=today();await save();if(!isIOS())toast('백업 파일을 저장했습니다');render()}},
 async exportCopy(){const t=backupText(),ok=await copyText(t);const o=$('#bkOut');if(!ok&&o){o.hidden=false;o.value=t;o.select()}if(ok){db.lastBackup=today();await save()}toast(ok?'백업 내용을 복사했습니다. 메모 앱 등에 붙여넣어 보관하세요':'아래 내용을 길게 눌러 복사하세요')},
 async restoreAsk(){const f=$('#bkFile').files[0];if(f){restoreFrom(await f.text());return}const t=$('#bkText').value.trim();if(!t){toast('백업 파일을 고르거나 내용을 붙여넣어 주세요');return}restoreFrom(t)},
 async restoreGo(){db=Object.assign(emptyDb(),ui.restore);migrate();await save();closeSheet();stack=[];view='today';applyPrefs();render();toast('복원했습니다')},
 /* 시작 */
 setupHelp(){ui.setupHelp=true;render();scrollTo(0,0)},
 setupBack(){ui.setupHelp=false;render()},
 async setupDone(){db=emptyDb();const p=db.profile,mk=Number($('#fMake').value);p.name=$('#fName').value.trim();p.makeDay=mk;p.orderDay=(mk+6)%7;p.buyDay=(mk+3)%7;p.supp=$('#fSupp').checked;await save();try{if(navigator.storage&&navigator.storage.persist)await navigator.storage.persist()}catch(e){}applyPrefs();view='today';render();scrollTo(0,0);toast('시작했습니다')},
 async updateCheck(){toast('확인하고 있습니다');await checkUpdate(true)},
 async updateNow(){await save();try{sessionStorage.setItem(NS+'.upd','1')}catch(e){}location.reload()},
 async pwaInstall(){const p=window.__bip;if(p){p.prompt();await p.userChoice;window.__bip=null;render()}}
};

/* 입력 이벤트 */
addEventListener('click',e=>{const el=e.target.closest('[data-a]');if(!el)return;const a=ACT[el.dataset.a];if(!a)return;if(el.dataset.a==='scrim'&&e.target!==el)return;if(el.tagName==='A')return;e.preventDefault();a(el.dataset,el,e)});
document.addEventListener('change',async e=>{const el=e.target,c=el.dataset&&el.dataset.c,v=el.dataset&&el.dataset.v;
 if(el.name==='isB'){const s=$('#isKindSec');if(s)s.hidden=!!el.value;if(el.value){const b=db.bottles.find(x=>x.id===el.value);if(b)ui.is.kind=b.kind}return}
 if(!c)return;
 if(c==='ck'&&db.cook){db.cook.ck[v]=el.checked;el.closest('.check').classList.toggle('on',el.checked);$('#nav').innerHTML=cookBar();await save();return}
 if(c==='mkFb'){ui.mk.fb=el.checked;render();return}
 if(c==='shopCk'){const it=shopItems().find(x=>x.key===v);if(!it)return;const key=shopKey(it);
  if(el.checked){let val=true;if(v==='avocado'&&it.avoBuy>0){const a={id:uid(),n:it.avoBuy,bought:today(),ripe:false};db.pantry.avo.push(a);val=a.id;toast(`아보카도 ${it.avoBuy}개를 재고에 넣었습니다. ${fmtMD(add(today(),4))}쯤 익었는지 알려 드립니다`)}db.shopChecks[key]=val}
  else{const val=db.shopChecks[key];if(typeof val==='string')db.pantry.avo=db.pantry.avo.filter(a=>a.id!==val);delete db.shopChecks[key]}
  await save();render();return}
 if(c==='alOn'){db.profile.alarms[v].on=el.checked;await save();render();return}
 if(c==='alT'){if(el.value){db.profile.alarms[v].t=el.value;await save();render()}return}
});
window.addEventListener('popstate',()=>{navArmed=false;if(sheetOpen)closeSheet();else if(stack.length){stack.pop();render()}if(sheetOpen||stack.length)pushNav()});

/* 화면 */
function cookBar(){const c=db.cook,S=cookSteps(c),s=S[c.step],last=c.step===S.length-1;const L=s.type==='ready'?readyLists(c,s):null;
 const keys=s.type==='ready'?[...L.tools.map((_,i)=>'ready:t'+i),...L.ing.map((_,i)=>'ready:i'+i)]:['checks','timer','portion'].includes(s.type)?stepItems(c,s).map((_,i)=>s.id+':'+i):s.type==='blend'?[0,1].flatMap(n=>s.round.map((_,i)=>`${s.id}:${n}-${i}`)).concat(s.id+':last'):[];
 const left=keys.filter(k=>!c.ck[k]).length,stOn=s.type==='steam'&&running(c.t.steam)&&tEl(c.t.steam)<steamDef(c).total;
 return `<div class="cookbar"><button class="btn sec2" data-a="cookPrev" ${c.step?'':'disabled'}>이전</button>${last?'':`<button class="btn" data-a="cookNext">${stOn?'찜 진행 중 · ':''}다음${left?` <small>(${left}개 남음)</small>`:''}</button>`}</div>`}
function applyPrefs(){if(!db)return;const p=db.profile;document.documentElement.classList.toggle('large',!!p.fontLarge);if(p.theme==='system')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',p.theme)}
function render(){const root=$('#root'),nav=$('#nav');
 if(window.__simBar)window.__simBar();
 if(ui.calPage){root.innerHTML=vCalPage();nav.innerHTML='';return}
 if(!db){root.innerHTML=vSetup();nav.innerHTML='';document.body.classList.remove('cooking');return}
 const sub=stack[stack.length-1];
 const SUB={cal:vCal,routine:vRoutine,alarm:vAlarm,recipe:vRecipe,evidence:vEvidence,batches:vBatches,backup:vBackup,settings:vSettings,help:vHelp,sources:vSources};
 const V={today:vToday,make:vMake,store:vStore,shop:vShop,more:vMore};
 root.innerHTML=(sub&&SUB[sub]?SUB[sub]:V[view])();
 const cooking=!sub&&view==='make'&&!!db.cook;document.body.classList.toggle('cooking',cooking);
 if(cooking){nav.innerHTML=cookBar();
  wakeOn().then(()=>{if(!SIM&&(wlState==='none'||wlState==='fail')&&!$('.wlnote')&&db&&db.cook&&view==='make'&&!stack.length)render()});liveTimers()}
 else{wakeOff();const tabs=[['today','오늘',I.today],['make','만들기',I.make],['store','보관',I.store],['shop','장보기',I.shop],['more','더보기',I.more]];
  nav.innerHTML=`<div>${tabs.map(([k,l,i])=>`<button class="${view===k&&!sub?'on':''}" data-a="tab" data-v="${k}" ${view===k?'aria-current="page"':''}>${i}${l}${k==='make'&&db.cook?'<b class="nb" aria-label="진행 중"></b>':''}</button>`).join('')}</div>`}}
setInterval(()=>{tick()},250);
setInterval(()=>{if(db&&!sheetOpen&&!document.activeElement.matches('input,textarea,select')&&view==='today'&&!stack.length&&!$('#ring'))render()},60000);
let lastDay='';
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;tick();if(db&&db.cook&&view==='make'){wl=null;wakeOn()}if(db&&!sheetOpen&&lastDay!==today()){lastDay=today();ui.sel=null;ui.month=null;render()}if(!SIM&&Date.now()-lastCheck>6e5)checkUpdate(false)});

/* 업데이트 */
let lastCheck=0;
function markUpdate(){if(updReady)return;updReady=true;const typing=document.activeElement&&document.activeElement.matches('input,textarea,select');if(db&&!sheetOpen&&!stack.length&&!typing&&(view==='today'||view==='more'))render();toast('새 버전이 준비되었습니다')}
const swVer=w=>new Promise(ok=>{if(!w)return ok(null);const c=new MessageChannel();c.port1.onmessage=e=>ok(e.data);w.postMessage('ver',[c.port2]);setTimeout(()=>ok(null),1500)});
async function verCheck(r){const v=await swVer(r.active);if(v&&v!==BUILD){markUpdate();return true}return false}
async function checkUpdate(manual){lastCheck=Date.now();if(updReady)return;let r=null;try{if('serviceWorker'in navigator)r=await navigator.serviceWorker.getRegistration()}catch(e){}if(!r){if(manual)toast('이 환경에서는 업데이트를 확인할 수 없습니다');return}try{if(navigator.onLine===false)throw 0;await r.update()}catch(e){if(manual)toast('인터넷 연결을 확인하고 다시 시도해 주세요');return}const n=r.installing||r.waiting;if(n&&n.state!=='activated')await new Promise(ok=>{const f=()=>{if(n.state==='activated'||n.state==='redundant')ok()};n.addEventListener('statechange',f);setTimeout(ok,30000)});const found=await verCheck(r);if(manual&&!found)toast('최신 버전입니다')}

async function boot(){lastDay=today();if(SIM){await window.__simBoot();return}
 const cp=parseCal(location.hash);if(cp){ui.calPage=cp;render();return}
 db=await Store.get();if(db){db=Object.assign(emptyDb(),db);migrate();applyPrefs()}render();
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.__bip=e;if(!db)render()});
 try{if(sessionStorage.getItem(NS+'.upd')){sessionStorage.removeItem(NS+'.upd');toast('새 버전으로 업데이트했습니다')}}catch(e){}
 if('serviceWorker'in navigator){try{const r=await navigator.serviceWorker.register('./sw.js');lastCheck=Date.now();r.addEventListener('updatefound',()=>{const n=r.installing;if(n)n.addEventListener('statechange',()=>{if(n.state==='activated')verCheck(r)})});verCheck(r)}catch(e){}}
 try{if(db&&navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(e){}
 if(db&&db.cook)tick()}
setTimeout(boot,0);
