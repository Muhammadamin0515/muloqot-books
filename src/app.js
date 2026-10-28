import {GENRES,AUTHORS,BOOKS,COLLECTIONS,SEED_REVIEWS,SEED_THREADS,WEEKLY,SEED_QUOTES} from './data.js';
import {I18N} from './i18n.js';
import {esc,ico,cover,portrait,onbArt,authorOf} from './art.js';
import * as tg from './telegram.js';
import {api,net} from './api.js';
import {initAdmin} from './admin.js';
import {initDonate} from './donate.js';
import {initCatalogAdmin} from './catalog-admin.js';
import {initAiStudio} from './aistudio.js';
import {initStudio} from './studio.js';
import {initAchievements} from './achievements.js';
import {search as fuzzySearch,suggest as suggestWord,key as skey} from './search.js';
import {recommend} from './reco.js';
import {initAudio} from './audio.js';

const KEY='muloqot.proto.v1';
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const clone=o=>JSON.parse(JSON.stringify(o));
const book=id=>BOOKS.find(b=>b.id===id);
const author=id=>AUTHORS.find(a=>a.id===id);

/* ---------- state ---------- */
const DEFAULT=()=>({onboarded:false,lang:'ru',theme:'dark',name:'Читатель',
  progress:{},finished:[],saved:[],
  bookmarks:[],
  ratings:{},reviews:clone(SEED_REVIEWS),threads:clone(SEED_THREADS),reacts:{},follows:[],days:[],
  myQuotes:[],qLikes:{},reader:{size:19,lh:1.7,theme:'dark',family:'literata',align:'left',margin:'m',full:false},
  notif:{chapters:true,replies:true,reminder:false,authors:true},goal:20,
  subs:[],outbox:{p:{},b:{}}});
let S;
function load(){try{const raw=localStorage.getItem(KEY);S=Object.assign(DEFAULT(),raw?JSON.parse(raw):{})}catch(e){S=DEFAULT()}}
const SHARED=['reviews','threads','subs','reacts','qLikes','follows','ratings','me','donateGoal','donateOn','appLink'];
/* Reading progress and bookmarks are synced record by record (see syncReading), not inside the state blob. */
const persistable=()=>{const o={...S};SHARED.forEach(k=>delete o[k]);delete o.progress;delete o.bookmarks;delete o.outbox;return o};
let saveT,syncT;function save(){clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}},250);
  if(net.online){clearTimeout(syncT);syncT=setTimeout(()=>api('/api/state','PUT',persistable()).catch(()=>{}),1200)}}
const ERR={rate:['Слишком часто. Подождите минуту.','Juda tez-tez. Bir daqiqa kuting.'],links:['Ссылки в сообщениях запрещены.','Xabarlarda havolalar taqiqlangan.'],duplicate:['Такое сообщение уже отправлено.','Bunday xabar allaqachon yuborilgan.'],stopword:['Сообщение содержит запрещённые слова.','Xabarda taqiqlangan so‘zlar bor.'],banned:['Ваш аккаунт заблокирован.','Akkauntingiz bloklangan.']};
const errMsg=e=>{const m=ERR[e&&e.detail];if(m)return tr(m[0],m[1]);
  if(e&&e.status>=500)return tr('Ошибка сервера. Попробуйте ещё раз немного позже.','Server xatosi. Birozdan so‘ng qayta urinib ko‘ring.');
  if(e&&e.status)return tr('Не удалось отправить. Попробуйте ещё раз.','Yuborib bo‘lmadi. Qayta urinib ko‘ring.');
  return tr('Нет связи с сервером','Server bilan aloqa yo‘q')};
/* A rejected post is rolled back by reloading the server state, so no phantom copy stays on screen. */
const bg=(p)=>p.catch(e=>{toast(errMsg(e));if(e&&e.status&&e.status!==401&&e.status!==403)loadBoot().then(()=>refresh()).catch(()=>{})});
load();
if(!S.onboarded){const u=tg.user();if(u){if(u.first_name)S.name=u.first_name.slice(0,24);if(tg.langCode()==='uz')S.lang='uz'}}

const t=k=>(I18N[S.lang]&&I18N[S.lang][k])||I18N.ru[k]||k;
const L=o=>(o&&typeof o==='object')?(o[S.lang]||o.ru):o;
const gl=g=>t('g_'+g);
const fold=s=>String(s).toLowerCase().replace(/[ʻʼ‘’`']/g,'').replace(/ё/g,'е');
const tr=(ru,uz)=>S.lang==='ru'?ru:uz;

/* ---------- helpers ---------- */
function stat(b){if(net.online)return{avg:Math.round(b.rating*10)/10,n:b.count};const u=S.ratings[b.id];const n=b.count+(u?1:0);const avg=u?(b.rating*b.count+u)/n:b.rating;return{avg:Math.round(avg*10)/10,n}}
function pctRaw(id){const pr=S.progress[id];if(!pr)return 0;if(pr.pct!=null)return Math.min(100,Math.round(pr.pct));const n=book(id).chapters.length;if(!n)return 0;return Math.min(100,Math.round(100*(pr.ch+pr.p)/n))}
function pctOf(id){return S.finished.includes(id)?100:Math.min(99,pctRaw(id))}
const readingIds=()=>Object.keys(S.progress).filter(id=>!S.finished.includes(id)&&book(id)).sort((a,b)=>(S.progress[b].ts||0)-(S.progress[a].ts||0));
const stars=(v,s=14)=>`<span class="stars" role="img" aria-label="${v}/5">${[1,2,3,4,5].map(i=>ico('star',s,i<=Math.round(v)?'f':'e')).join('')}</span>`;
const AVC=['#a2431f','#2f6672','#7a5a22','#6a3346','#3a5d4a','#4a4f7a'];
function avatar(name,sm){name=String(name||'');let h=0;for(const c of name)h=(h*7+c.charCodeAt(0))%AVC.length;const ini=name.trim().split(/\s+/).map(w=>(w.match(/[\p{L}\p{N}]/u)||[''])[0]).filter(Boolean).slice(0,2).join('').toUpperCase();return `<span class="avatar ${sm?'sm':''}" style="background:${AVC[h]}">${ini?esc(ini):ico('user',sm?15:19)}</span>`}
let toastT;function toast(m){const el=$('#toast');el.textContent=m;el.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('on'),2300)}
async function copyText(txt,msg){try{await navigator.clipboard.writeText(txt);toast(msg||t('copied'))}catch(e){const ta=document.createElement('textarea');ta.value=txt;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(_){}ta.remove();toast(msg||t('copied'))}}
const skelGrid=n=>`<div class="grid2">${Array.from({length:n},()=>`<div><div class="sk" style="aspect-ratio:2/3;border-radius:8px"></div><div class="sk" style="height:12px;margin-top:12px;width:80%"></div><div class="sk" style="height:10px;margin-top:8px;width:50%"></div></div>`).join('')}</div>`;
const skelList=n=>`<div style="display:flex;flex-direction:column;gap:20px">${Array.from({length:n},()=>`<div class="sk" style="height:110px;border-radius:16px"></div>`).join('')}</div>`;
const empty=(ic,title,desc,btn)=>`<div class="empty"><div class="ring">${ico(ic,28)}</div><b>${title}</b><span>${desc}</span>${btn||''}</div>`;
const LOADED={};
const MODEL={};const ONINPUT={};const CHG={};const FORMS={};const ACT={};const SCREENS={};const AFTER={};

/* ---------- routing ---------- */
const TABS=['home','catalog','library','community','profile'];
const NAV={cur:null,stack:[],tab:'home'};
const OB={i:0};
function leave(){const sc=$('#screen');if(NAV.cur&&sc)NAV.cur.scroll=sc.scrollTop;if(NAV.cur&&NAV.cur.name==='reader'&&S.reader.full)tg.fullscreen(false)}
function go(name,p={}){leave();if(TABS.includes(name)){NAV.stack=[];NAV.tab=name}else NAV.stack.push(NAV.cur);NAV.cur={name,p};render(true)}
function replace(name,p={}){NAV.cur={name,p};render(true)}
function back(){if(!NAV.stack.length){go('home');return}NAV.cur=NAV.stack.pop();render(true)}
function refresh(){const sc=$('#screen');NAV.cur.scroll=sc.scrollTop;render(false)}
const NAVI=[['home','home'],['catalog','grid'],['library','lib'],['community','chat'],['profile','user']];
function navHtml(){return NAVI.map(([k,i])=>`<button data-a="tab" data-id="${k}" class="${NAV.tab===k?'on':''}" aria-label="${t('nav_'+k)}" ${NAV.tab===k?'aria-current="page"':''}>${ico(i,22)}<span>${t('nav_'+k)}</span></button>`).join('')}
function render(anim){
  const app=$('#app'),sc=$('#screen'),{name,p}=NAV.cur;
  const full=name==='reader'||name==='onboarding';
  app.dataset.mt=name==='onboarding'?'dark':S.theme;
  sc.classList.toggle('noscroll',full);
  $('#nav').hidden=name==='reader'||name==='onboarding';
  $('#nav').innerHTML=navHtml();
  document.documentElement.lang=S.lang==='ru'?'ru':'uz';
  sc.innerHTML=`<div class="view${anim?' enter':''}">${SCREENS[name](p)}</div>`;
  sc.scrollTop=full?0:(NAV.cur.scroll||0);
  if(AFTER[name])AFTER[name](p);
  tg.sync({canBack:name!=='onboarding'&&(NAV.stack.length>0||name==='reader'),theme:app.dataset.mt});
}

/* ---------- sheets ---------- */
function openSheet(html){const s=$('#sheet');s.dataset.mt=NAV.cur.name==='reader'?S.reader.theme:S.theme;s.innerHTML=`<div class="grab"></div>${html}`;s.classList.add('on');$('#scrim').classList.add('on')}
function setSheet(html){const s=$('#sheet');s.dataset.mt=NAV.cur.name==='reader'?S.reader.theme:S.theme;s.innerHTML=`<div class="grab"></div>${html}`}
function closeSheet(){$('#sheet').classList.remove('on');$('#scrim').classList.remove('on')}
ACT.closeSheet=closeSheet;

/* =====================================================================
   ONBOARDING
   ===================================================================== */
const langSeg=(cls='')=>`<div class="seg mini ${cls}" role="group" aria-label="${t('language')}"><button class="${S.lang==='ru'?'on':''}" data-a="setLang" data-v="ru">RU</button><button class="${S.lang==='uz'?'on':''}" data-a="setLang" data-v="uz">UZ</button></div>`;
const OB_STEPS=[0,3];
SCREENS.onboarding=()=>{const n=OB_STEPS.length,pos=OB.i,i=OB_STEPS[pos],last=pos===n-1;
  return `<div class="onb"><div class="onb-art ${i>1?'paper':''}">${onbArt(i)}<div class="onb-top px">${pos>0?`<button class="iconbtn flat" data-a="obBack" aria-label="${t('back')}">${ico('back')}</button>`:'<span style="width:42px"></span>'}${langSeg()}${!last?`<button class="link" data-a="obSkip">${t('skip')}</button>`:'<span style="width:42px"></span>'}</div></div>
  <div class="onb-panel px"><h1 class="display">${t('ob'+(i+1)+'_t')}</h1><p class="lede">${t('ob'+(i+1)+'_d')}</p>
  <div class="onb-foot"><span class="mono" style="color:#a79c90">0${pos+1}</span><div class="bar" role="progressbar" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${pos+1}"><i style="width:${(pos+1)/n*100}%"></i></div><span class="mono" style="color:#7a7068">0${n}</span>
  ${last?`<button class="btn" data-a="obNext">${t('start')}</button>`:`<button class="roundgo" data-a="obNext" aria-label="${t('next')}">${ico('arrow',22)}</button>`}</div></div></div>`};
function finishOnb(){S.onboarded=true;save();OB.i=0;go('home')}
ACT.obNext=()=>{if(OB.i<OB_STEPS.length-1){OB.i++;render(true)}else finishOnb()};
ACT.obBack=()=>{if(OB.i>0){OB.i--;render(true)}};
ACT.obSkip=finishOnb;

/* =====================================================================
   HOME
   ===================================================================== */
/* No rating is shown until someone has actually rated the book. */
const rateBit=st=>st.n>0?`${ico('star',13,'f')}<b style="color:var(--fg)">${st.avg}</b>`:`<span class="mute">${tr('Нет оценок','Baho yo‘q')}</span>`;
const kindBit=b=>`${b.audio>0?`<span class="kind">${ico('headphones',13)}</span>`:''}${b.fullText===false?`<span class="kind dim" title="${tr('Только описание','Faqat tavsif')}">${ico('info',13)}</span>`:''}`;
const bkCard=(b,badge)=>{const st=stat(b);return `<button class="bk" data-a="openBook" data-id="${b.id}">${badge?`<span class="newtag">${badge}</span>`:''}${cover(b)}<span class="t">${esc(b.title)}</span><span class="a">${esc(authorOf(b).name)}</span><span class="meta">${rateBit(st)}<span class="tag">${b.lang.toUpperCase()}</span>${kindBit(b)}</span></button>`};
const colCard=c=>{const bs=c.ids.slice(0,3).map(book);return `<button class="col" data-a="openCollection" data-id="${c.id}" style="background:linear-gradient(135deg,${c.pal[0]},${c.pal[1]})"><div class="stack">${bs.map((b,i)=>`<div style="position:absolute;left:${i*28}px;top:${i*9}px;width:62px;z-index:${3-i}">${cover(b,'sm')}</div>`).join('')}</div><div class="tx"><b>${esc(L(c.t))}</b><small>${c.ids.length} ${t('books_n')}</small></div></button>`};
const donCard=()=>{const g=S.donateGoal,pct=g?Math.min(100,Math.round(g.raised/g.target*100)):0;
  return `<div class="px" style="margin-top:30px"><button class="don-card cine" data-a="openDonate"><span class="don-ico">${ico('heart',22)}</span><div class="grow" style="min-width:0;text-align:left"><span class="eyebrow" style="color:#f4a07c">${tr('Поддержать проект','Loyihani qo‘llab-quvvatlash')}</span><b class="don-t">${g?esc(L(g.title)):tr('Помогите создавать новые книги','Yangi kitoblar yaratishga yordam bering')}</b>${g?`<div class="bar" style="margin:9px 0 5px"><i style="width:${pct}%"></i></div><span class="mono" style="font-size:12px;color:#c8bcae">⭐ ${g.raised} / ${g.target}</span>`:''}</div>${ico('chev',18)}</button></div>`};
SCREENS.home=()=>{
  const h=new Date().getHours(),g=h<5?'g_night':h<12?'g_morning':h<18?'g_day':'g_evening';
  const rd=readingIds(),cb=rd.length?book(rd[0]):null;
  const cont=cb?`<button class="cont cine" data-a="read" data-id="${cb.id}"><div class="bgc">${cover(cb,'sm')}</div><div class="fade"></div><div class="in-"><div class="cv">${cover(cb)}</div><div class="grow" style="display:flex;flex-direction:column;justify-content:center;min-width:0"><span class="eyebrow" style="color:#f4a07c">${t('continue')}</span><h3>${esc(cb.title)}</h3><span style="color:#c8bcae;font-size:13px">${esc(authorOf(cb).name)}</span><div class="bar"><i style="width:${pctOf(cb.id)}%"></i></div><div class="row" style="justify-content:space-between;gap:8px"><span class="mono" style="font-size:12px;color:#c8bcae;white-space:nowrap">${pctOf(cb.id)}% · ${S.progress[cb.id].ch+1}/${cb.chapters.length}</span><span class="btn sm">${t('resume')} ${ico('arrow',15)}</span></div></div></div></button>`
   :`<div class="card">${empty('lib',t('empty_cont'),t('empty_cont_d'),`<button class="btn sm" data-a="tab" data-id="catalog">${t('pick_book')}</button>`)}</div>`;
  /* Popular = real activity (reads, finishes, views, ratings of the last 30 days). With no activity yet the block is simply not shown. */
  const pop=BOOKS.slice().sort((a,b)=>(b.pop||0)-(a.pop||0)||stat(b).n-stat(a).n).filter(b=>!net.online||b.pop>0||b.count>0).slice(0,8);
  const recs=recommend({books:BOOKS,progress:S.progress,finished:S.finished,saved:S.saved,ratings:S.ratings,follows:S.follows,limit:8});
  const why=r=>r.why.book?(r.why.kind==='author'?tr('Тот же автор, что «','Muallif bir xil: «'):tr('Похоже на «','O‘xshash: «'))+r.why.book.title+'»':'';
  const nw=BOOKS.slice().sort((a,b)=>b.added-a.added).slice(0,8);
  const gc=g=>BOOKS.filter(b=>b.genre===g).length;
  const head=(title,link)=>`<div class="sec-h px"><h2>${title}</h2>${link||''}</div>`;
  return `<header class="hello px"><div class="grow"><p class="eyebrow">${t(g)}</p><h1 class="display">${esc(dispName())}</h1><span class="streak">${ico('flame',14)} ${streak()?`${streak()} ${tr('дн. подряд','kun ketma-ket')}`:tr('Начните серию сегодня','Bugun boshlang')}</span></div><button class="avatar" data-a="tab" data-id="profile" aria-label="${t('nav_profile')}" style="background:${AVC[0]}">${hasName()?esc(S.name[0].toUpperCase()):ico('user',20)}</button></header>
  <div class="px" style="margin-top:18px"><button class="fakesearch" data-a="openSearch">${ico('search',20)}<span>${t('search_ph')}</span></button></div>
  ${BOOKS.length?'':`<div class="px" style="margin-top:20px"><div class="card">${empty('lib',tr('Каталог пока пуст','Katalog hozircha bo‘sh'),tr('Книги появятся здесь после добавления администратором или авторами.','Kitoblar administrator yoki mualliflar qo‘shgach shu yerda paydo bo‘ladi.'))}</div></div>`}
  <div class="px" style="margin-top:20px">${cont}</div>
  ${COLLECTIONS.length?`<section class="sec">${head(t('collections'))}<div class="hs px">${COLLECTIONS.map(colCard).join('')}</div></section>`:''}
  ${recs.length?`<section class="sec">${head(tr('Для вас','Siz uchun'))}<div class="hs px">${recs.map(r=>`<div class="recw">${bkCard(r.book)}<small class="why">${esc(why(r))}</small></div>`).join('')}</div></section>`:''}
  ${pop.length?`<section class="sec">${head(t('popular'),`<button class="link acc" data-a="tab" data-id="catalog">${t('all')}</button>`)}<div class="hs px">${pop.map(b=>bkCard(b)).join('')}</div></section>`:''}
  ${net.online&&S.donateOn?donCard():''}
  <section class="sec">${head(t('new_rel'),`<button class="link acc" data-a="openNew">${t('all')}</button>`)}<div class="hs px">${nw.map(b=>bkCard(b,t('new'))).join('')}</div></section>
  <section class="sec">${head(t('genres'))}<div class="hs px">${GENRES.filter(g=>gc(g)>0).map(g=>`<button class="chip" data-a="genreFilter" data-id="${g}">${gl(g)} <span class="mute">${gc(g)}</span></button>`).join('')}</div></section>
  <section class="sec">${head(t('authors'))}<div class="hs px">${AUTHORS.filter(a=>BOOKS.some(b=>b.a===a.id)).slice(0,10).map(a=>`<button class="au" data-a="openAuthor" data-id="${a.id}"><div class="pt">${portrait(a)}</div><b>${esc(a.name)}</b><small>${esc(L(a.city))}</small></button>`).join('')}</div></section>`;
};
ACT.tab=el=>{if(NAV.tab===el.dataset.id&&NAV.cur.name===el.dataset.id){$('#screen').scrollTo({top:0,behavior:'smooth'});return}go(el.dataset.id)};
ACT.openBook=el=>{BK.tab='about';BK.syn=false;go('book',{id:el.dataset.id});loadText(el.dataset.id).catch(()=>{});track(el.dataset.id,'view')};
ACT.openAuthor=el=>go('author',{id:el.dataset.id});
ACT.openSearch=()=>{resetCat();CAT.focus=true;go('catalog')};
ACT.openNew=()=>{resetCat();CAT.sort='new';go('catalog')};
ACT.genreFilter=el=>{resetCat();CAT.genres=[el.dataset.id];go('catalog')};
ACT.openCollection=el=>{const c=COLLECTIONS.find(x=>x.id===el.dataset.id);resetCat();CAT.ids=c.ids;CAT.coll=c.id;go('catalog')};
ACT.back=back;
ACT.tgClose=()=>tg.close();

/* =====================================================================
   CATALOG & SEARCH
   ===================================================================== */
const PAGE=24;
const CAT={q:'',lang:'all',genres:[],sort:'pop',ids:null,coll:null,focus:false,only:'all',shown:PAGE};
MODEL.cat=CAT;
function resetCat(){Object.assign(CAT,{q:'',lang:'all',genres:[],sort:'pop',ids:null,coll:null,focus:false,only:'all',shown:PAGE})}
/* Search index: one small document per book, built once and reused while typing. */
const DOCS=new Map();
const docOf=b=>{const key=b.title+'|'+b.a+'|'+b.series,d=DOCS.get(b.id);if(d&&d.k===key)return d;
  const nd={k:key,id:b.id,title:b.title,author:authorOf(b).name,extra:[I18N.ru['g_'+b.genre],I18N.uz['g_'+b.genre],b.series||'',b.originalTitle||'',b.lang==='ru'?'русский russian':'oʻzbekcha uzbek ozbek'].join(' ')};DOCS.set(b.id,nd);return nd};
let lastSuggest=null;
function catList(){
  let l=BOOKS.slice();
  if(CAT.ids)l=l.filter(b=>CAT.ids.includes(b.id));
  if(CAT.lang!=='all')l=l.filter(b=>b.lang===CAT.lang);
  if(CAT.genres.length)l=l.filter(b=>CAT.genres.includes(b.genre));
  if(CAT.only==='text')l=l.filter(b=>b.fullText!==false);
  if(CAT.only==='audio')l=l.filter(b=>b.audio>0);
  const q=CAT.q.trim();lastSuggest=null;
  if(q){
    const docs=l.map(docOf),hits=fuzzySearch(q,docs),rank=new Map(hits.map((h,i)=>[h.id,i]));
    l=l.filter(b=>rank.has(b.id)).sort((a,b)=>rank.get(a.id)-rank.get(b.id));
    if(!l.length)lastSuggest=suggestWord(q,BOOKS.map(docOf));
    return l;
  }
  const pop=b=>(b.pop||0);
  const byName=(a,b)=>authorOf(a).name.localeCompare(authorOf(b).name,'ru')||a.title.localeCompare(b.title,'ru');
  const cmp={pop:(a,b)=>pop(b)-pop(a)||stat(b).n-stat(a).n||byName(a,b),rating:(a,b)=>stat(b).avg-stat(a).avg||stat(b).n-stat(a).n,new:(a,b)=>b.added-a.added,az:(a,b)=>a.title.localeCompare(b.title,S.lang==='ru'?'ru':'uz')};
  return l.sort(cmp[CAT.sort]);
}
const cardBk=b=>{const st=stat(b),sv=S.saved.includes(b.id);return `<div class="cardwrap"><button class="fab ${sv?'on':''}" data-a="toggleSave" data-id="${b.id}" aria-label="${t('add_lib')}" aria-pressed="${sv}">${ico('bookmark',17)}</button><button class="cardbk" data-a="openBook" data-id="${b.id}">${cover(b)}<span class="t">${esc(b.title)}</span><span class="a">${esc(authorOf(b).name)}</span><span class="meta">${rateBit(st)}<span class="tag">${b.lang.toUpperCase()}</span><span>${gl(b.genre)}</span>${kindBit(b)}</span></button></div>`};
function catResults(l){return l.length?`<div class="grid2">${l.slice(0,CAT.shown).map(cardBk).join('')}</div>${l.length>CAT.shown?`<button class="btn block ghost" style="margin-top:18px" data-a="catMore">${tr('Показать ещё','Yana ko‘rsatish')} (${l.length-CAT.shown})</button>`:''}`:empty('search',t('nothing'),t('nothing_d'),`${lastSuggest?`<button class="btn sm" style="margin-bottom:10px" data-a="useSuggest" data-v="${esc(lastSuggest)}">${tr('Искать','Qidirish')}: «${esc(lastSuggest)}»</button>`:''}<button class="btn sm ghost" data-a="resetFilters">${t('reset')}</button>`)}
ACT.catMore=()=>{CAT.shown+=PAGE;const l=catList(),r=$('#catRes');if(r)r.innerHTML=catResults(l)};
ACT.useSuggest=el=>{CAT.q=el.dataset.v;const q=$('#q');if(q)q.value=CAT.q;const x=$('.searchbox .x');if(x)x.hidden=false;updateCatalog()};
ACT.catOnly=el=>{CAT.only=CAT.only===el.dataset.v?'all':el.dataset.v;$$('[data-a="catOnly"]').forEach(b=>b.classList.toggle('on',b.dataset.v===CAT.only));updateCatalog()};
let catT;
function updateCatalog(keep){
  if(!keep)CAT.shown=PAGE;
  const res=$('#catRes');if(!res)return;
  res.innerHTML=skelGrid(4);clearTimeout(catT);
  catT=setTimeout(()=>{const l=catList();const r=$('#catRes');if(!r)return;r.innerHTML=catResults(l);const c=$('#catCount');if(c)c.textContent=`${t('found')}: ${l.length}`},300);
}
SCREENS.catalog=()=>{const l=catList();
  const seg=[['all',t('all')],['ru','Русский'],['uz','Oʻzbekcha']];
  return `<header class="topbar px"><h2 class="display" style="font-size:26px">${t('catalog')}</h2></header>
  <div class="px"><div class="searchbox">${ico('search',20)}<input id="q" class="in" type="search" data-m="cat:q" value="${esc(CAT.q)}" placeholder="${t('search_ph')}" autocomplete="off" enterkeyhint="search" aria-label="${t('search_ph')}"><button class="iconbtn flat x" data-a="clearQ" aria-label="${t('close')}" ${CAT.q?'':'hidden'}>${ico('x',18)}</button></div>
  ${CAT.coll?`<div style="margin-top:12px"><button class="chip on" data-a="clearColl">${esc(L(COLLECTIONS.find(c=>c.id===CAT.coll).t))} ${ico('x',14)}</button></div>`:''}
  <div class="seg" style="margin-top:14px" role="group" aria-label="${t('language')}">${seg.map(([k,n])=>`<button class="${CAT.lang===k?'on':''}" data-a="catLang" data-v="${k}">${n}</button>`).join('')}</div></div>
  <div class="hs px" style="margin-top:14px"><button class="chip ${CAT.only==='text'?'on':''}" data-a="catOnly" data-v="text">${ico('text',15)} ${tr('Читать целиком','To‘liq o‘qish')}</button>${BOOKS.some(b=>b.audio>0)?`<button class="chip ${CAT.only==='audio'?'on':''}" data-a="catOnly" data-v="audio">${ico('headphones',15)} ${tr('Аудио','Audio')}</button>`:''}${GENRES.filter(g=>BOOKS.some(b=>b.genre===g)).map(g=>`<button class="chip ${CAT.genres.includes(g)?'on':''}" data-a="catGenre" data-id="${g}" aria-pressed="${CAT.genres.includes(g)}">${gl(g)}</button>`).join('')}</div>
  <div class="px"><div class="sortrow"><span id="catCount" class="mute" style="font-size:13px;font-weight:600">${t('found')}: ${l.length}</span><select class="in" data-chg="catSort" aria-label="${t('sort')}">${[['pop','s_pop'],['rating','s_rating'],['new','s_new'],['az','s_az']].map(([k,n])=>`<option value="${k}" ${CAT.sort===k?'selected':''}>${t(n)}</option>`).join('')}</select></div>
  <div id="catRes">${catResults(l)}</div></div>`};
AFTER.catalog=()=>{if(CAT.focus){CAT.focus=false;const q=$('#q');if(q)q.focus()}};
let qT;ONINPUT['cat:q']=el=>{const x=$('.searchbox .x');if(x)x.hidden=!CAT.q;clearTimeout(qT);qT=setTimeout(updateCatalog,160)};
CHG.catSort=el=>{CAT.sort=el.value;updateCatalog()};
ACT.clearQ=()=>{CAT.q='';const q=$('#q');if(q){q.value='';q.focus()}const x=$('.searchbox .x');if(x)x.hidden=true;updateCatalog()};
ACT.clearColl=()=>{CAT.ids=null;CAT.coll=null;refresh();updateCatalog()};
ACT.catLang=el=>{CAT.lang=el.dataset.v;$$('[data-a="catLang"]').forEach(b=>b.classList.toggle('on',b.dataset.v===CAT.lang));updateCatalog()};
ACT.catGenre=el=>{const g=el.dataset.id,i=CAT.genres.indexOf(g);if(i<0)CAT.genres.push(g);else CAT.genres.splice(i,1);el.classList.toggle('on',i<0);el.setAttribute('aria-pressed',i<0);updateCatalog()};
ACT.resetFilters=()=>{const k=CAT.focus;resetCat();refresh();updateCatalog()};
ACT.toggleSave=el=>{const id=el.dataset.id,i=S.saved.indexOf(id);if(i<0){S.saved.push(id);toast(t('added_lib'))}else{S.saved.splice(i,1);toast(t('removed_lib'))}save();
  if(NAV.cur.name==='book')refresh();else $$(`.fab[data-id="${id}"]`).forEach(f=>{f.classList.toggle('on',S.saved.includes(id));f.setAttribute('aria-pressed',S.saved.includes(id))})};

/* =====================================================================
   BOOK DETAILS
   ===================================================================== */
const BK={tab:'about',syn:false};
const starInput=(cur,act,id)=>`<div class="rate-in" role="group" aria-label="${t('your_rating')}">${[1,2,3,4,5].map(i=>`<button data-a="${act}" data-v="${i}" data-id="${id}" aria-label="${i}">${ico('star',34,i<=cur?'f':'')}</button>`).join('')}</div>`;
const rcnt=(r,k,on)=>net.online?r[k]:r[k]+(on?1:0);
function reviewCard(r,showBook){
  const b=book(r.bookId),rc=S.reacts[r.id]||{};
  const side=[net.online&&!r.mine?`<button class="react ico-only" data-a="report" data-k="review" data-id="${r.id}" aria-label="${tr('Пожаловаться','Shikoyat')}">${ico('flag',15)}</button>`:'',S.me&&S.me.admin?`<button class="react ico-only" data-a="admDelReview" data-id="${r.id}" aria-label="Удалить">${ico('trash',15)}</button>`:''].join('');
  return `<article class="rev" id="rev_${r.id}"><div class="rev-h">${avatar(r.user)}<div class="grow" style="min-width:0"><b>${esc(r.user)}${r.patron?' <span class="tag acc" style="margin-left:4px">⭐</span>':''}</b><small>${esc(L(r.date))}</small></div>${stars(r.rating,14)}</div>
  ${showBook&&b?`<button class="revbook" data-a="openBook" data-id="${b.id}">${cover(b,'xs')}<span class="grow" style="min-width:0;text-align:left">${esc(b.title)}<small style="display:block;font-weight:500;color:var(--mute);font-size:11.5px">${esc(authorOf(b).name)} · ${b.lang.toUpperCase()}</small></span>${ico('chev',16)}</button>`:''}
  <p class="tx">${esc(r.text)}</p>
  <div class="rev-f"><button class="react ${rc.heart?'on':''}" data-a="react" data-id="${r.id}" data-k="heart" aria-pressed="${!!rc.heart}">${ico('heart',16)} ${rcnt(r,'likes',rc.heart)}</button><button class="react ${rc.insight?'on':''}" data-a="react" data-id="${r.id}" data-k="insight" aria-pressed="${!!rc.insight}">${ico('spark',16)} ${rcnt(r,'insight',rc.insight)}</button><button class="react" data-a="toggleReply" data-id="${r.id}">${ico('reply',16)} ${t('reply')}</button><span class="sp"></span>${side}</div>
  ${r.replies.length?`<div class="replies">${r.replies.map(x=>`<div class="r"><b>${esc(x.user)}</b>${x.author?` <span class="tag acc">${t('author_label')}</span>`:''}<p>${esc(x.text)}</p></div>`).join('')}</div>`:''}
  <form class="replybox" id="rb_${r.id}" data-f="reviewReply" data-id="${r.id}" hidden><input class="in" name="t" placeholder="${t('write_ph')}" aria-label="${t('reply')}" autocomplete="off"><button class="iconbtn" aria-label="${t('send')}" style="background:var(--acc);color:#fff;border:0">${ico('send',18)}</button></form></article>`;
}
function threadBody(th){
  return `<div class="cmt">${th.comments.map((c,i)=>`<div class="c"><div class="row" style="gap:8px">${avatar(c.user,1)}<b style="font-size:13px">${esc(c.user)}</b><span style="flex:1"></span>${net.online&&c.id&&!c.mine?`<button class="link" data-a="report" data-k="comment" data-id="${c.id}" aria-label="${tr('Пожаловаться','Shikoyat')}">${ico('flag',13)}</button>`:''}${S.me&&S.me.admin&&c.id?`<button class="link" data-a="admDelComment" data-t="${th.id}" data-id="${c.id}" aria-label="Удалить">${ico('trash',13)}</button>`:''}</div><p style="margin-top:6px">${esc(c.text)}</p>
  ${c.replies.length?`<div class="replies">${c.replies.map(x=>`<div class="r"><b>${esc(x.user)}</b><p>${esc(x.text)}</p></div>`).join('')}</div>`:''}
  <button class="link acc" data-a="toggleCReply" data-t="${th.id}" data-c="${i}">${ico('reply',13)} ${t('reply')}</button>
  <form class="replybox" id="cr_${th.id}_${i}" data-f="cReply" data-t="${th.id}" data-c="${i}" hidden><input class="in" name="t" placeholder="${t('write_ph')}" aria-label="${t('reply')}" autocomplete="off"><button class="iconbtn" aria-label="${t('send')}" style="background:var(--acc);color:#fff;border:0">${ico('send',18)}</button></form></div>`).join('')}
  <form class="replybox" data-f="cNew" data-t="${th.id}"><input class="in" name="t" placeholder="${t('write_ph')}" aria-label="${t('write_ph')}" autocomplete="off"><button class="iconbtn" aria-label="${t('send')}" style="background:var(--acc);color:#fff;border:0">${ico('send',18)}</button></form></div>`;
}
const CM={tab:'reviews',qv:'all',sort:'new',open:{t1:true}};
ACT.revSort=el=>{CM.sort=el.dataset.v;refresh()};
function threadCard(th){
  const b=th.bookId?book(th.bookId):null,open=!!CM.open[th.id],n=th.comments.reduce((s,c)=>s+1+c.replies.length,0);
  return `<article class="thread"><button class="th" data-a="toggleThread" data-id="${th.id}" aria-expanded="${open}"><div class="row" style="margin-bottom:8px;flex-wrap:wrap">${avatar(th.user,1)}<span class="mute" style="font-size:12.5px">${esc(th.user)}</span>${b?`<span class="tag acc">${esc(b.title)}</span>`:''}</div><h3>${esc(th.title)}</h3>${th.text?`<p class="mute" style="margin-top:6px;font-size:14px">${esc(th.text)}</p>`:''}<div class="meta">${ico('chat',14)} ${n} ${t('replies')}</div></button><div class="th-f">${net.online&&!th.mine?`<button class="link" data-a="report" data-k="thread" data-id="${th.id}">${ico('flag',13)} ${tr('Пожаловаться','Shikoyat')}</button>`:''}${S.me&&S.me.admin?`<button class="link" data-a="admDelThread" data-id="${th.id}">${ico('trash',13)} ${tr('Удалить','O‘chirish')}</button>`:''}</div>${open?threadBody(th):''}</article>`;
}
const topicForm=bid=>`<form class="replybox" data-f="topicNew" data-book="${bid||''}" style="margin:0 0 6px"><input class="in" name="t" placeholder="${t('topic_ph')}" aria-label="${t('new_topic')}" autocomplete="off"><button class="btn sm" style="height:42px">${t('post')}</button></form>`;
const RIGHTS_LABEL={public_domain:['Общественное достояние','Ommaviy mulk'],author:['Публикует автор','Muallif nashr etgan'],licensed:['По лицензии','Litsenziya asosida'],permission:['С разрешения правообладателя','Huquq egasi ruxsati bilan'],demo:['Тестовые данные','Test ma’lumotlari'],unverified:['Права не подтверждены','Huquqlar tasdiqlanmagan']};
const rightsText=b=>{const r=b.rights;if(!r)return '';const l=RIGHTS_LABEL[r.status];return l?tr(l[0],l[1]):''};
/** Facts about the work, only the ones that are known. */
/* ~1800 characters per "page" is about 1.5 minutes of reading. */
const readTime=p=>{const m=Math.round(p*1.5);return m<60?m+' '+tr('мин','daq'):Math.floor(m/60)+' '+tr('ч','soat')+(m%60?' '+m%60+' '+tr('мин','daq'):'')};
function detailRows(b){
  const r=[[t('d_lang'),t(b.lang)],[t('d_genre'),gl(b.genre)]];
  if(b.series)r.push([tr('Серия','Seriya'),esc(b.series)+(b.seriesNo?` · №${b.seriesNo}`:'')]);
  if(b.originalTitle)r.push([tr('Оригинал','Asl nomi'),esc(b.originalTitle)]);
  if(b.translator)r.push([tr('Перевод','Tarjimon'),esc(b.translator)]);
  if(b.pages>=3)r.push([tr('Время чтения','O‘qish vaqti'),'≈'+readTime(b.pages)]);
  if(b.year)r.push([t('d_year'),b.year]);
  if(b.nch>1)r.push([t('d_chapters'),b.nch]);
  if(b.publisher)r.push([tr('Издатель','Nashriyot'),esc(b.publisher)]);
  if(b.isbn)r.push(['ISBN',esc(b.isbn)]);
  if(b.ai)r.push([tr('Автор','Muallif'),esc(authorOf(b).name||'Muloqot Books')]);
  r.push([tr('Формат','Format'),[b.fullText?tr('Текст','Matn'):tr('Только описание','Faqat tavsif'),b.audio?tr('Аудио','Audio'):''].filter(Boolean).join(' + ')]);
  return r;
}
const availability=b=>b.fullText!==false?'':`<section class="px sec" style="margin-top:18px"><div class="card avail">${ico('info',20)}<div><b>${tr('Полный текст недоступен','To‘liq matn mavjud emas')}</b><p>${tr('Мы публикуем книги целиком только при подтверждённых правах на распространение. Здесь пока только описание. Книгу можно добавить в библиотеку, чтобы не потерять.','Kitoblarni faqat tarqatish huquqi tasdiqlangan bo‘lsagina to‘liq e’lon qilamiz. Hozircha faqat tavsif. Kitobni kutubxonaga qo‘shib qo‘yishingiz mumkin.')}</p></div></div></section>`;
SCREENS.book=({id})=>{
  const b=book(id),a=authorOf(b),st=stat(b),sv=S.saved.includes(id),pr=S.progress[id],fin=S.finished.includes(id);
  const cta=fin?t('read_again'):pr?`${t('resume')} · ${pctLabel(pctOf(id))}`:t('read_now'),canRead=b.fullText!==false;
  const revs=S.reviews.filter(r=>r.bookId===id);
  /* The distribution is counted from real ratings. Only the offline demo catalog, which has no ratings table, uses a sample. */
  const dsum=b.dist?b.dist.reduce((x,y)=>x+y,0):0;
  const dist=b.dist?[4,3,2,1,0].map(i=>dsum?Math.round(b.dist[i]/dsum*100):0):(st.avg>=4.6?[64,24,8,3,1]:st.avg>=4.4?[54,28,12,4,2]:[42,32,16,7,3]);
  const rel=BOOKS.filter(x=>x.id!==id&&(x.genre===b.genre||x.lang===b.lang||x.a===b.a)).sort((x,y)=>((y.genre===b.genre)*2+(y.lang===b.lang))-((x.genre===b.genre)*2+(x.lang===b.lang))||stat(y).n-stat(x).n).slice(0,6);
  const my=S.ratings[id]||0;
  let body='';
  if(BK.tab==='about')body=`${b.desc?`<section class="px sec" style="margin-top:6px"><h2 class="display" style="font-size:20px;margin-bottom:12px">${t('synopsis')}</h2><p class="syn ${BK.syn?'':'clamp'}">${esc(b.desc)}</p><button class="link acc" data-a="toggleSyn">${BK.syn?t('less'):t('more')}</button></section>`:''}
   <section class="px sec" style="margin-top:22px"><div class="card" style="text-align:center"><b style="font-size:14px">${t('your_rating')}</b>${starInput(my,'rate',id)}<span class="mute" style="font-size:12.5px">${my?`${my}/5`:t('tap_rate')}</span></div></section>
   <section class="px sec" style="margin-top:22px"><h2 class="display" style="font-size:20px;margin-bottom:6px">${t('details')}</h2><div class="kv">${detailRows(b).map(([k,v])=>`<div>${k}</div><div>${v}</div>`).join('')}</div></section>${availability(b)}
   <section class="sec"><div class="sec-h px"><h2>${t('related')}</h2></div><div class="hs px">${rel.map(bkCard).join('')}</div></section>`;
  if(BK.tab==='reviews')body=`<section class="px sec" style="margin-top:6px"><div class="row" style="gap:22px;align-items:flex-start"><div style="text-align:center"><div class="big-r">${st.n>0?st.avg:'–'}</div>${st.n>0?stars(st.avg,15):''}<div class="mute" style="font-size:12px;margin-top:6px">${st.n} ${t('ratings_n')}</div></div>
   <div class="dist grow">${[5,4,3,2,1].map((n,i)=>`<span>${n}</span><div class="bar"><i style="width:${dist[i]}%"></i></div><span>${dist[i]}%</span>`).join('')}</div></div>
   <button class="btn block ghost" style="margin:20px 0 6px" data-a="openReview" data-id="${id}">${ico('pen',18)} ${t('write_review')}</button>
   ${revs.length?revs.map(r=>reviewCard(r,false)).join(''):empty('chat',t('no_reviews'),t('no_reviews_d'))}</section>`;
  if(BK.tab==='discussion'){const ths=S.threads.filter(x=>x.bookId===id);body=`<section class="px sec" style="margin-top:6px">${topicForm(id)}${ths.length?ths.map(threadCard).join(''):empty('chat',t('first_discuss'),t('topic_ph'))}</section>`}
  return `<div class="bhero"><div class="bgc">${cover(b,'sm')}</div><div class="fade"></div>
  <div class="topline px"><button class="iconbtn" data-a="back" aria-label="${t('back')}">${ico('back')}</button><button class="iconbtn" data-a="shareBook" data-id="${id}" aria-label="${t('share')}">${ico('share',20)}</button></div>
  <div class="px" style="padding-top:62px"><div class="cv">${cover(b)}</div><h1 class="display">${esc(b.title)}</h1><button class="au-link" data-a="openAuthor" data-id="${a.id}">${esc(a.name)}</button>
  ${b.series?`<button class="au-link" style="margin-top:2px;font-size:13px" data-a="openSeries" data-v="${esc(b.series)}">${tr('Серия','Seriya')}: ${esc(b.series)}${b.seriesNo?` · №${b.seriesNo}`:''}</button>`:''}
  <div class="facts"><span class="tag acc">${b.lang.toUpperCase()}</span><span class="tag">${gl(b.genre)}</span>${b.pages>0?`<span class="tag">${b.pages} ${t('pages')}</span>`:''}${b.year?`<span class="tag">${b.year}</span>`:''}<span class="tag ${canRead?'':'dim'}">${canRead?tr('Текст полностью','Matn to‘liq'):tr('Только описание','Faqat tavsif')}</span>${b.audio?`<span class="tag acc">${tr('Аудио','Audio')}</span>`:''}</div>
  <div class="row" style="justify-content:center;margin-top:14px;gap:8px">${st.n>0?`${stars(st.avg,17)}<b>${st.avg}</b><span class="mute" style="font-size:12.5px">· ${st.n} ${t('ratings_n')}</span>`:`<span class="mute" style="font-size:13px">${tr('Оценок пока нет. Будьте первым!','Hali baho yo‘q. Birinchi bo‘ling!')}</span>`}</div>
  <div class="cta">${canRead?`<button class="btn" data-a="read" data-id="${id}">${cta} ${ico('arrow',18)}</button>`:''}${b.audio?`<button class="btn ${canRead?'ghost':''}" data-a="audioOpen" data-id="${id}">${ico('headphones',18)} ${tr('Слушать','Tinglash')}</button>`:''}<button class="btn ghost" data-a="toggleSave" data-id="${id}" aria-pressed="${sv}">${ico(sv?'check':'plus',18)} ${sv?t('in_lib'):t('add_lib')}</button></div></div></div>
  <div class="px" style="margin:2px 0 18px"><div class="seg" role="tablist">${[['about',t('about')],['reviews',`${t('reviews')} ${revs.length}`],['discussion',t('discussion')]].map(([k,n])=>`<button role="tab" aria-selected="${BK.tab===k}" class="${BK.tab===k?'on':''}" data-a="bookTab" data-v="${k}">${n}</button>`).join('')}</div></div>${body}`;
};
ACT.bookTab=el=>{BK.tab=el.dataset.v;refresh()};
ACT.openSeries=el=>{resetCat();CAT.q=el.dataset.v;go('catalog')};
ACT.toggleSyn=()=>{BK.syn=!BK.syn;refresh()};
ACT.rate=el=>{tg.notify('success');const id=el.dataset.id;S.ratings[id]=+el.dataset.v;save();toast(tr('Оценка сохранена','Baho saqlandi'));
  if(net.online)bg(api(`/api/books/${id}/rate`,'POST',{value:S.ratings[id]}).then(r=>{Object.assign(book(id),r);refresh()}));else refresh()};
ACT.shareBook=async el=>{const id=el.dataset.id,b=book(id),st=stat(b);
  /* Preferred: a rich card prepared by the bot (title, author, rating, description, "Read" button). */
  if(net.online&&tg.canShareMessage()){try{const r=await api(`/api/books/${id}/prepared`,'POST',{lang:S.lang});if(tg.shareMessage(r.id))return}catch(e){}}
  /* Fallback for older clients: a link with a readable caption. */
  const txt=`📖 ${b.title}\n${authorOf(b).name} · ⭐ ${st.avg}`,link=S.appLink?`${S.appLink}?startapp=book_${b.id}`:'';
  if(!tg.share(txt,link))copyText(link?`${txt}\n${link}`:txt,t('share_copied'))};

/* =====================================================================
   REVIEWS / COMMUNITY actions
   ===================================================================== */
ACT.react=el=>{const id=el.dataset.id,k=el.dataset.k;const rc=S.reacts[id]=S.reacts[id]||{};rc[k]=!rc[k];save();const r=S.reviews.find(x=>x.id===id);const fk=k==='heart'?'likes':'insight';el.classList.toggle('on',rc[k]);el.setAttribute('aria-pressed',!!rc[k]);el.lastChild.textContent=' '+rcnt(r,fk,rc[k]);
  if(net.online)bg(api(`/api/reviews/${id}/react`,'POST',{kind:k,on:!!rc[k]}).then(x=>{r.likes=x.likes;r.insight=x.insight;el.lastChild.textContent=' '+r[fk]}))};
const REASONS=[['spam','Спам или реклама','Spam yoki reklama'],['abuse','Оскорбления','Haqorat'],['inappropriate','Неприемлемое содержание','Nomaqbul mazmun'],['other','Другое','Boshqa']];
ACT.report=el=>openSheet(`<h2>${tr('На что жалоба?','Shikoyat sababi?')}</h2><div class="list">${REASONS.map(([k,ru,uz])=>`<button class="li" data-a="reportGo" data-k="${el.dataset.k}" data-id="${esc(el.dataset.id)}" data-r="${k}"><span class="grow">${tr(ru,uz)}</span>${ico('chev',16)}</button>`).join('')}</div>`);
ACT.reportGo=el=>{closeSheet();bg(api('/api/reports','POST',{kind:el.dataset.k,targetId:el.dataset.id,reason:el.dataset.r}).then(()=>toast(tr('Спасибо, жалоба отправлена','Rahmat, shikoyat yuborildi'))))};
ACT.toggleReply=el=>{const f=$('#rb_'+el.dataset.id);f.hidden=!f.hidden;if(!f.hidden)f.querySelector('input').focus()};
ACT.toggleThread=el=>{const id=el.dataset.id;CM.open[id]=!CM.open[id];refresh()};
ACT.toggleCReply=el=>{const f=$(`#cr_${el.dataset.t}_${el.dataset.c}`);f.hidden=!f.hidden;if(!f.hidden)f.querySelector('input').focus()};
FORMS.reviewReply=f=>{const v=f.t.value.trim();if(!v)return;const r=S.reviews.find(r=>r.id===f.dataset.id);r.replies.push({user:S.name,text:v});save();refresh();toast(tr('Ответ опубликован','Javob e’lon qilindi'));
  if(net.online)bg(api(`/api/reviews/${r.id}/replies`,'POST',{text:v}).then(x=>{Object.assign(r,x.review);refresh()}))};
const upThread=(th,p)=>p.then(x=>{Object.assign(th,x.thread);refresh()});
FORMS.cReply=f=>{const v=f.t.value.trim();if(!v)return;const th=S.threads.find(x=>x.id===f.dataset.t),c=th.comments[+f.dataset.c];c.replies.push({user:S.name,text:v});save();refresh();
  if(net.online)bg(upThread(th,api(`/api/threads/${th.id}/comments`,'POST',{text:v,parentId:c.id})))};
FORMS.cNew=f=>{const v=f.t.value.trim();if(!v)return;const th=S.threads.find(x=>x.id===f.dataset.t);th.comments.push({user:S.name,text:v,replies:[]});save();refresh();
  if(net.online)bg(upThread(th,api(`/api/threads/${th.id}/comments`,'POST',{text:v})))};
FORMS.topicNew=f=>{const v=f.t.value.trim();if(!v)return;const id='t'+Date.now();S.threads.unshift({id,bookId:f.dataset.book||null,title:v,user:S.name,text:'',comments:[]});CM.open[id]=true;save();refresh();toast(tr('Тема создана','Mavzu yaratildi'));
  if(net.online){const th=S.threads[0];bg(api('/api/threads','POST',{title:v,bookId:th.bookId}).then(x=>{CM.open[x.thread.id]=true;Object.assign(th,x.thread);refresh()}))}};
const REV={bookId:'b1',rating:0,text:'',err:false};MODEL.rev=REV;
function reviewSheet(){return `<h2>${t('rv_title')}</h2><div class="field"><label for="rvBook">${t('rv_book')}</label><select id="rvBook" class="in" data-chg="rvBook">${BOOKS.map(b=>`<option value="${b.id}" ${b.id===REV.bookId?'selected':''}>${esc(b.title)}</option>`).join('')}</select></div>
  <div class="field"><label>${t('rv_stars')}</label>${starInput(REV.rating,'revStar',REV.bookId)}</div>
  <div class="field"><label for="rvText">${t('rv_text')}</label><textarea id="rvText" class="in" data-m="rev:text" placeholder="${t('rv_ph')}">${esc(REV.text)}</textarea></div>${REV.err?`<p class="err">${t('rv_err')}</p>`:''}<button class="btn block" data-a="revSubmit">${t('post')}</button>`}
ACT.openReview=el=>{REV.bookId=(el&&el.dataset.id)||REV.bookId;REV.rating=S.ratings[REV.bookId]||0;REV.text='';REV.err=false;openSheet(reviewSheet())};
CHG.rvBook=el=>{REV.bookId=el.value;REV.rating=S.ratings[el.value]||0;setSheet(reviewSheet())};
ACT.revStar=el=>{REV.rating=+el.dataset.v;setSheet(reviewSheet())};
ACT.revSubmit=()=>{if(REV.text.trim().length<10||!REV.rating){REV.err=true;setSheet(reviewSheet());return}
  S.reviews.unshift({id:'ur'+Date.now(),bookId:REV.bookId,user:S.name,rating:REV.rating,date:{ru:'сегодня',uz:'bugun'},likes:0,insight:0,text:REV.text.trim(),replies:[]});
  S.ratings[REV.bookId]=REV.rating;save();closeSheet();toast(t('rv_done'));softRefresh();
  if(net.online){const mine=S.reviews[0],bid=REV.bookId;bg(api('/api/reviews','POST',{bookId:bid,rating:REV.rating,text:mine.text}).then(x=>{Object.assign(mine,x.review);Object.assign(book(bid),{rating:x.rating,count:x.count});softRefresh()}))}};

/* ---------- community screen ---------- */
function quoteCard(q,mine){
  const b=book(q.bookId),lk=!!S.qLikes[q.id];
  return `<article class="qcard" style="background:linear-gradient(150deg,${b.pal[0]},${b.pal[1]})"><div><span class="qm" aria-hidden="true">“</span><blockquote>${esc(q.text)}</blockquote></div>
  <footer><small>${esc(authorOf(b).name)}<br>${esc(b.title)}</small><div class="row" style="gap:6px"><button class="react ${lk?'on':''}" data-a="likeQuote" data-id="${q.id}" aria-pressed="${lk}">${ico('heart',16)} ${net.online?(q.likes||0):(q.likes||0)+(lk?1:0)}</button><button class="react" data-a="shareQuote" data-id="${q.id}" aria-label="${t('share')}">${ico('share',16)}</button>${mine?`<button class="react" data-a="delQuote" data-id="${q.id}" aria-label="${t('remove')}">${ico('trash',16)}</button>`:''}</div></footer></article>`;
}
SCREENS.community=()=>{
  const tabs=[['reviews',t('tab_reviews')],['discuss',t('tab_discuss')],['quotes',t('tab_quotes')]];
  let body='';
  if(!LOADED.community){setTimeout(()=>{LOADED.community=true;if(NAV.cur.name==='community')refresh()},650);body=skelList(4)}
  else if(CM.tab==='reviews'){const list=S.reviews.slice();if(CM.sort==='top')list.sort((a,b)=>(b.likes+b.insight)-(a.likes+a.insight));
    body=`<button class="compose" data-a="openReview">${avatar(S.name,1)}<span>${t('compose_ph')}</span></button>
    <div class="fchips" style="margin-top:16px;align-items:center"><span class="lbl" style="margin-right:4px">${tr('Отзывы','Sharhlar')} ${list.length}</span><span class="sp"></span>${[['new',tr('Новые','Yangi')],['top',tr('Популярные','Mashhur')]].map(([k,n])=>`<button class="chip ${CM.sort===k?'on':''}" data-a="revSort" data-v="${k}">${n}</button>`).join('')}</div>
    <div>${list.map(r=>reviewCard(r,true)).join('')}</div>`}
  else if(CM.tab==='discuss'){body=`${WEEKLY.bookId&&book(WEEKLY.bookId)?`<div class="weekly cine"><span class="eyebrow" style="color:#f4a07c">${t('weekly')}</span><h3>${esc(L(WEEKLY.q))}</h3><button class="btn sm" data-a="weeklyTopic">${t('discuss_this')} ${ico('arrow',15)}</button></div>`:''}
    <div class="card" style="margin-top:16px"><div class="lbl" style="margin-bottom:10px">${t('new_topic')}</div>${topicForm('')}</div>
    <div class="lbl" style="margin:22px 0 12px">${tr('Обсуждения','Muhokamalar')} ${S.threads.length}</div><div>${S.threads.map(threadCard).join('')}</div>`}
  else{const mine=CM.qv==='mine';const all=mine?S.myQuotes:SEED_QUOTES;
    body=`<div class="seg" style="margin-bottom:18px">${[['all',t('from_books')],['mine',`${t('my_quotes')} ${S.myQuotes.length}`]].map(([k,n])=>`<button class="${CM.qv===k?'on':''}" data-a="quoteView" data-v="${k}">${n}</button>`).join('')}</div>
    ${all.length?`<div style="display:flex;flex-direction:column;gap:16px">${all.map(q=>quoteCard(q,mine)).join('')}</div>`:empty('quote',t('empty_quotes'),t('empty_quotes_d'),`<button class="btn sm" data-a="tab" data-id="library">${t('nav_library')}</button>`)}`}
  return `<header class="topbar px"><h2 class="display" style="font-size:26px">${t('community')}</h2></header><div class="px"><div class="seg" role="tablist">${tabs.map(([k,n])=>`<button role="tab" aria-selected="${CM.tab===k}" class="${CM.tab===k?'on':''}" data-a="commTab" data-v="${k}">${n}</button>`).join('')}</div><div style="margin-top:20px">${body}</div></div>`;
};
ACT.commTab=el=>{CM.tab=el.dataset.v;refresh()};
ACT.quoteView=el=>{CM.qv=el.dataset.v;refresh()};
/* The weekly question lives in a normal discussion thread, created the first time somebody opens it. */
ACT.weeklyTopic=()=>{const q=L(WEEKLY.q),ex=S.threads.find(x=>x.title===q);
  if(ex){ACT.openThread({dataset:{id:ex.id}});return}
  const f={t:{value:q},dataset:{book:WEEKLY.bookId}};FORMS.topicNew(f)};
ACT.openThread=el=>{CM.open[el.dataset.id]=true;CM.tab='discuss';refresh();setTimeout(()=>{const x=$('.thread');if(x)x.scrollIntoView({behavior:'smooth',block:'start'})},60)};
ACT.likeQuote=el=>{const id=el.dataset.id;S.qLikes[id]=!S.qLikes[id];save();
  const q=findQuote(id);if(net.online&&SEED_QUOTES.some(x=>x.id===id)){q.likes+=S.qLikes[id]?1:-1;refresh();bg(api(`/api/quotes/${id}/like`,'POST',{on:!!S.qLikes[id]}).then(x=>{q.likes=x.likes;refresh()}))}else refresh()};
ACT.delQuote=el=>{S.myQuotes=S.myQuotes.filter(q=>q.id!==el.dataset.id);save();refresh()};
function findQuote(id){return SEED_QUOTES.find(q=>q.id===id)||S.myQuotes.find(q=>q.id===id)}
ACT.shareQuote=el=>{const q=findQuote(el.dataset.id),b=book(q.bookId);
  openSheet(`<h2>${t('share')}</h2><article class="qcard" style="background:linear-gradient(150deg,${b.pal[0]},${b.pal[1]});margin-bottom:16px"><div><span class="qm" aria-hidden="true">“</span><blockquote>${esc(q.text)}</blockquote></div><footer><small>${esc(authorOf(b).name)} · ${esc(b.title)}</small><span class="tag" style="color:#e9dcc3;border-color:rgba(255,236,214,.3)">Muloqot Books</span></footer></article>
  <button class="btn block" data-a="copyQuote" data-id="${q.id}">${ico('share',18)} ${t('copy')}</button>`)};
ACT.copyQuote=el=>{const q=findQuote(el.dataset.id),b=book(q.bookId);copyText(`«${q.text}» — ${authorOf(b).name}, «${b.title}»`);closeSheet()};

/* =====================================================================
   AUTHOR PROFILE
   ===================================================================== */
SCREENS.author=({id})=>{
  const a=author(id),bs=BOOKS.filter(b=>b.a===id),fl=S.follows.includes(id);
  const revs=S.reviews.filter(r=>bs.some(b=>b.id===r.bookId));
  const avg=Math.round(bs.reduce((s,b)=>s+stat(b).avg,0)/bs.length*10)/10;
  return `<div class="ahero cine"><div class="bg" style="background:linear-gradient(160deg,${a.pal[0]},${a.pal[1]})"></div><div class="fade"></div>
  <div class="topbar px" style="background:none"><button class="iconbtn" data-a="back" aria-label="${t('back')}" style="background:rgba(12,10,9,.5);color:#f3ece1;border-color:rgba(255,236,214,.2)">${ico('back')}</button></div>
  <div class="px"><div class="pt">${portrait(a)}</div><h1 class="display">${esc(a.name)}</h1><p style="color:#c8bcae;font-size:13px;margin-top:6px">${esc(L(a.city))} · ${t('gen_label').toLowerCase()}</p></div></div>
  <div class="px"><button class="btn block ${fl?'ghost':''}" data-a="follow" data-id="${id}" aria-pressed="${fl}">${ico(fl?'check':'plus',18)} ${fl?t('following'):t('follow')}</button>
  <div class="stats"><div><b>${bs.length}</b><small>${t('books')}</small></div><div><b>${(net.online?a.followers:a.followers+(fl?1:0)).toLocaleString(S.lang==='ru'?'ru-RU':'uz-UZ')}</b><small>${t('followers')}</small></div><div><b>${avg}</b><small>${t('avg')}</small></div></div>
  <p class="syn" style="margin-top:22px;font-size:15px">${esc(L(a.bio))}</p></div>
  <section class="sec"><div class="sec-h px"><h2>${t('author_books')}</h2></div><div class="hs px">${bs.map(bkCard).join('')}</div></section>
  <section class="sec px"><div class="sec-h"><h2>${t('reader_reviews')}</h2></div>${revs.length?revs.map(r=>reviewCard(r,true)).join(''):empty('chat',t('no_reviews'),t('no_reviews_d'))}</section>`;
};
ACT.follow=el=>{const id=el.dataset.id,i=S.follows.indexOf(id),on=i<0;if(on){S.follows.push(id);toast(t('following'))}else S.follows.splice(i,1);save();
  if(net.online)bg(api(`/api/authors/${id}/follow`,'POST',{on}).then(r=>{author(id).followers=r.followers;refresh()}));else refresh()};

/* =====================================================================
   LIBRARY
   ===================================================================== */
const LB={tab:'reading'};
function libRow(b,mode){
  const a=authorOf(b),pr=S.progress[b.id];
  return `<div class="lrow"><button data-a="openBook" data-id="${b.id}" style="background:none;border:0;padding:0;width:68px;flex:none" aria-label="${esc(b.title)}">${cover(b,'sm')}</button><div class="grow"><h3>${esc(b.title)}</h3><div class="mute" style="font-size:12.5px;margin-top:2px">${esc(a.name)}</div>
  ${mode==='reading'?`<div class="bar"><i style="width:${pctOf(b.id)}%"></i></div><div class="mono mute" style="font-size:12px">${pctOf(b.id)}% · ${t('chapter')} ${pr.ch+1}/${b.chapters.length}</div>`:''}
  <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
  ${mode==='reading'?`<button class="btn sm" data-a="read" data-id="${b.id}">${t('resume')}</button>`:''}
  ${mode==='finished'?`<button class="btn sm ghost" data-a="read" data-id="${b.id}">${t('read_again')}</button>`:''}
  ${mode==='saved'?`<button class="btn sm" data-a="read" data-id="${b.id}">${t('read_now')}</button><button class="btn sm ghost" data-a="toggleSaveLib" data-id="${b.id}">${t('remove')}</button>`:''}
  ${mode==='finished'?stars(S.ratings[b.id]||Math.round(b.rating),13):''}</div></div></div>`;
}
SCREENS.library=()=>{
  const tabs=[['reading',t('l_reading')],['finished',t('l_finished')],['saved',t('l_saved')],['bookmarks',t('l_bookmarks')]];
  const rd=readingIds(),fin=S.finished.filter(book),sv=S.saved.filter(book),bm=S.bookmarks.filter(x=>book(x.bookId));
  let body='';
  if(LB.tab==='reading')body=rd.length?rd.map(id=>libRow(book(id),'reading')).join(''):empty('lib',t('e_reading'),t('e_reading_d'),`<button class="btn sm" data-a="tab" data-id="catalog">${t('go_catalog')}</button>`);
  if(LB.tab==='finished')body=fin.length?fin.map(id=>libRow(book(id),'finished')).join(''):empty('check',t('e_finished'),t('e_finished_d'));
  if(LB.tab==='saved')body=sv.length?sv.map(id=>libRow(book(id),'saved')).join(''):empty('bookmark',t('e_saved'),t('e_saved_d'),`<button class="btn sm" data-a="tab" data-id="catalog">${t('go_catalog')}</button>`);
  if(LB.tab==='bookmarks')body=bm.length?bm.map(x=>{const b=book(x.bookId);return `<div class="bmrow"><div class="row" style="gap:12px"><div style="width:34px;flex:none">${cover(b,'xs')}</div><div class="grow"><b style="font-size:14px">${esc(b.title)}</b><div class="mute" style="font-size:12px">${t('chapter')} ${x.ch+1} · ${esc((b.chapters[x.ch]||{}).t||'')}</div></div></div><q>${esc(x.snip)}…</q><div class="row" style="gap:8px"><button class="btn sm" data-a="openBm" data-id="${x.id}">${t('open')}</button><button class="btn sm ghost" data-a="delBm" data-id="${x.id}">${ico('trash',15)} ${t('remove')}</button></div></div>`}).join(''):empty('bookmark',t('e_bm'),t('e_bm_d'));
  return `<header class="topbar px"><h2 class="display" style="font-size:26px">${t('library')}</h2></header>
  <div class="px"><div class="stat3"><div><b>${rd.length}</b><small>${t('l_reading')}</small></div><div><b>${fin.length}</b><small>${t('l_finished')}</small></div><div><b>${bm.length}</b><small>${t('l_bookmarks')}</small></div></div>
  <div class="seg" style="margin:20px 0 4px" role="tablist">${tabs.map(([k,n])=>`<button role="tab" aria-selected="${LB.tab===k}" class="${LB.tab===k?'on':''}" data-a="libTab" data-v="${k}" style="padding:0 6px;font-size:12px">${n}</button>`).join('')}</div>${body}</div>`;
};
ACT.libTab=el=>{LB.tab=el.dataset.v;refresh()};
ACT.toggleSaveLib=el=>{S.saved=S.saved.filter(x=>x!==el.dataset.id);save();toast(t('removed_lib'));refresh()};
ACT.delBm=el=>{S.bookmarks=S.bookmarks.filter(x=>x.id!==el.dataset.id);save();refresh()};
ACT.openBm=el=>{const x=S.bookmarks.find(b=>b.id===el.dataset.id);openReader(x.bookId,{bm:x})};

/* =====================================================================
   READER
   ===================================================================== */
const R={id:null,ch:0,startP:0,startPara:null,sel:null,fresh:false};
const bmFind=(id,ch,para)=>S.bookmarks.find(x=>x.bookId===id&&x.ch===ch&&x.para===para);
const TEXT={},LOADING={},TOC={};
const track=(id,type)=>{if(net.online)api(`/api/books/${id}/event`,'POST',{type}).catch(()=>{})};
const hasText=b=>b.lazy?!!b.tocLoaded:(b.chapters.length>0&&b.chapters.every(c=>Array.isArray(c.p)));
/* Collections (lazy books) are read chapter by chapter; the catalog carries no chapter list at all. Other books load their whole text once. */
function loadText(id){
  const b=book(id);if(!b||hasText(b))return Promise.resolve();
  if(b.lazy)return LOADING[id]||(LOADING[id]=api(`/api/books/${id}/toc?v=${book(id).ver}`).then(r=>{const bb=book(id);bb.chapters=r.chapters.map(c=>({t:c.t,n:c.n,...(c.s?{s:1}:{})}));bb.ver=r.ver||bb.ver;bb.tocLoaded=true}).finally(()=>{delete LOADING[id]}));
  if(TEXT[id]){b.chapters=TEXT[id];return Promise.resolve()}
  return LOADING[id]||(LOADING[id]=api(`/api/books/${id}/text`).then(r=>{TEXT[id]=r.chapters;book(id).chapters=r.chapters}).finally(()=>{delete LOADING[id]}));
}
const CHLOAD={},CHKEEP=[];
/** Makes sure the paragraphs of chapter n are in memory (lazy books only); at most 8 chapters stay loaded. */
async function ensureChapter(id,n){
  const b=book(id),ch=b&&b.chapters[n];if(!ch||!b.lazy||Array.isArray(ch.p))return;
  const k=id+':'+n;
  await (CHLOAD[k]||(CHLOAD[k]=api(`/api/books/${id}/chapter/${n}?v=${b.ver}`).then(r=>{ch.p=r.p;CHKEEP.push([id,n]);while(CHKEEP.length>8){const [i2,n2]=CHKEEP.shift();if(!(i2===R.id&&n2===R.ch)){const c2=book(i2)&&book(i2).chapters[n2];if(c2)delete c2.p}}}).finally(()=>{delete CHLOAD[k]})));
}
/** Weighted by chapter length when the table of contents has sizes; always an estimate, shown with "≈". */
function approxPct(b,ch,p){
  const cs=b.chapters;if(!cs.length)return 0;
  const tot=cs.reduce((n,c)=>n+(c.n||0),0);
  if(tot>0){let before=0;for(let i=0;i<ch&&i<cs.length;i++)before+=cs[i].n||0;return Math.min(100,(before+(cs[ch]?.n||0)*p)/tot*100)}
  return Math.min(100,100*(ch+p)/cs.length);
}
const pctLabel=v=>'≈'+v+'%';

/* ---------- reading sync: one record per book / bookmark, with a revision against stale writes ---------- */
function setProgress(id,ch,p,para){
  const b=book(id)||{chapters:[]},old=S.progress[id]||{};
  S.progress[id]={ch,p,para:para??null,ts:Date.now(),ver:b.ver||'',rev:old.rev||0,pct:Math.round(approxPct(b,ch,p)*10)/10};
  S.outbox.p[id]=1;save();kickSync(4000);
}
function queueBookmark(id,op){S.outbox.b[id]=op;save();kickSync(1200)}
let syncTimer=0,syncDelay=4000,syncBusy=false;
function kickSync(ms){if(!net.online)return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncReading(),ms)}
const fromServer=st=>({ch:st.locator.ch,p:st.locator.p||0,para:st.locator.para,ts:st.ts,ver:st.ver||'',rev:st.rev,pct:st.percent});
async function syncReading(keepalive){
  if(!net.online||syncBusy)return;syncBusy=true;let failed=false;const ob=S.outbox;
  try{
    for(const id of Object.keys(ob.p)){
      const pr=S.progress[id];if(!pr){delete ob.p[id];continue}
      const rev=(pr.rev||0)+1,ts=pr.ts;
      try{
        await api(`/api/progress/${id}`,'PUT',{ver:pr.ver||'',locator:{ch:pr.ch,para:pr.para,p:pr.p},percent:pr.pct??null,rev},{keepalive});
        pr.rev=rev;if((pr.ts||0)<=ts)delete ob.p[id];
      }catch(e){
        const st=e.body&&e.body.stored;
        if(e.status===409&&st){if(st.ts>=(pr.ts||0)){S.progress[id]=fromServer(st);delete ob.p[id]}else pr.rev=st.rev}
        else if(e.status===404||e.status===422)delete ob.p[id];
        else failed=true;
      }
    }
    for(const id of Object.keys(ob.b)){
      const op=ob.b[id],bm=S.bookmarks.find(x=>x.id===id);
      try{
        if(op==='del')await api(`/api/bookmarks/${id}`,'DELETE',undefined,{keepalive});
        else if(bm){await api('/api/bookmarks','POST',{id,bookId:bm.bookId,ver:bm.ver||'',ch:bm.ch,para:bm.para,snip:bm.snip},{keepalive});bm.sy=1}
        delete ob.b[id];
      }catch(e){if(e.status===404||e.status===422)delete ob.b[id];else failed=true}
    }
  }finally{syncBusy=false}
  save();
  if(failed){syncDelay=Math.min(syncDelay*2,300000);kickSync(syncDelay)}else syncDelay=4000;
}
/** Merges what the server knows (progress rows and bookmarks of THIS user) with what this device has. Revisions decide; unsent local changes stay queued. */
function adoptReading(d){
  const sp=d.progress||{},loc=S.progress||{};S.outbox=S.outbox||{p:{},b:{}};
  for(const [id,sv] of Object.entries(sp)){
    const l=loc[id],lrev=l?(l.rev||0):0;
    if(!l||lrev<sv.rev&&(l.ts||0)<=sv.ts||lrev===sv.rev&&sv.ts>=(l.ts||0))loc[id]=fromServer(sv);
    else{if(lrev<sv.rev)l.rev=sv.rev;S.outbox.p[id]=1}
  }
  for(const id of Object.keys(loc))if(!sp[id]&&book(id))S.outbox.p[id]=1;
  S.progress=loc;
  const sv=new Map((d.bookmarks||[]).map(x=>[x.id,x])),out=[];
  for(const l of S.bookmarks||[]){
    if(S.outbox.b[l.id]==='del')continue;
    if(sv.has(l.id)){out.push({...l,...sv.get(l.id),sy:1});sv.delete(l.id)}
    else if(l.sy){/* removed on another device */}
    else{out.push(l);S.outbox.b[l.id]='add'}
  }
  for(const x of sv.values())if(S.outbox.b[x.id]!=='del')out.push({...x,sy:1});
  S.bookmarks=out;
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)syncReading(true)});
window.addEventListener('pagehide',()=>syncReading(true));
window.addEventListener('online',()=>kickSync(500));
async function openReader(id,opts){
  const b=book(id);if(!b)return;
  const noText=()=>{b.fullText=false;toast(tr('Полный текст этой книги недоступен','Bu kitobning to‘liq matni mavjud emas'));refresh()};
  if(b.fullText===false){toast(tr('Полный текст этой книги недоступен','Bu kitobning to‘liq matni mavjud emas'));return}
  opts=opts||{};const pr=S.progress[id],fin=S.finished.includes(id);
  try{
    if(!hasText(b)){toast(t('opening'));await loadText(id)}
    const nch=b.chapters.length;if(!nch){noText();return}
    /* A position belongs to one version of the text. After the text was replaced we only keep the chapter. */
    const stale=!!(pr&&pr.ver&&b.ver&&pr.ver!==b.ver);
    if(pr&&pr.ch>=nch){pr.ch=Math.max(0,nch-1);pr.p=0;pr.para=null}
    let bm=opts.bm;if(bm&&bm.ch>=nch)bm={...bm,ch:Math.max(0,nch-1),para:0};
    if(bm){R.ch=bm.ch;R.startP=0;R.startPara=bm.ver&&b.ver&&bm.ver!==b.ver?null:bm.para}
    else if(fin||!pr){R.ch=0;R.startP=0;R.startPara=null}
    else{R.ch=pr.ch;R.startP=stale?0:pr.p;R.startPara=stale?null:(pr.para!=null?pr.para:null)}
    if(stale&&!bm){toast(tr('Текст книги обновился: место чтения восстановлено только до главы','Kitob matni yangilangan: o‘qish joyi faqat bobgacha tiklandi'))}
    await ensureChapter(id,R.ch);
    if(R.ch+1<nch)ensureChapter(id,R.ch+1).catch(()=>{});
  }catch(e){
    if(e&&e.detail==='rights')noText();else toast(tr('Не удалось загрузить книгу. Проверьте соединение.','Kitobni yuklab bo‘lmadi. Aloqani tekshiring.'));
    return;
  }
  track(id,'read');R.id=id;R.sel=null;R.fresh=true;markDay();
  if((!pr||pr.ver!==b.ver)&&!fin&&!opts.bm)setProgress(id,R.ch,R.startP||0,R.startPara);
  if(NAV.cur.name==='reader')replace('reader',{id});else go('reader',{id});
}
const today=()=>new Date().toISOString().slice(0,10);
function markDay(){const d=today();if(!S.days.includes(d)){S.days.push(d);S.days=S.days.slice(-400);save()}}
function streak(){let n=0;const d=new Date();if(!S.days.includes(d.toISOString().slice(0,10)))d.setDate(d.getDate()-1);
  while(S.days.includes(d.toISOString().slice(0,10))){n++;d.setDate(d.getDate()-1)}return n}
ACT.read=el=>openReader(el.dataset.id);
const hasMyReview=id=>S.reviews.some(r=>r.bookId===id&&(r.mine||String(r.id).startsWith('ur')));
/* End of a chapter / of the book. Once the book is marked as read, the card stops asking for it again. */
function endCard(b,last){
  if(!last)return `<div class="rend"><b>${esc(b.chapters[R.ch+1].t)}</b><p>${t('chapter')} ${R.ch+2}</p><div class="rend-actions"><button class="btn" data-a="rNext">${t('next_ch')} ${ico('arrow',16)}</button></div></div>`;
  const done=S.finished.includes(b.id),reviewed=hasMyReview(b.id);
  const donate=net.online&&S.donateOn?`<button class="btn ghost" data-a="openDonate">${ico('heart',16)} ${tr('Поддержать','Qo‘llab-quvvatlash')}</button>`:'';
  const toBook=`<button class="btn ghost" data-a="toBook">${t('to_book')}</button>`;
  let primary,rowBtns;
  if(!done){primary=`<button class="btn" data-a="rFinish">${ico('check',16)} ${t('mark_finished')}</button>`;rowBtns=[toBook,donate]}
  else if(!reviewed){primary=`<button class="btn" data-a="openReview" data-id="${esc(b.id)}">${ico('pen',16)} ${tr('Оставить отзыв','Sharh qoldirish')}</button>`;rowBtns=[toBook,donate]}
  else{primary=`<button class="btn" data-a="toBook">${t('to_book')}</button>`;rowBtns=[donate]}
  const row=rowBtns.filter(Boolean);
  return `<div class="rend"><b>${done?tr('Вы прочитали эту книгу','Siz bu kitobni o‘qib chiqdingiz'):t('end_demo')}</b><p>${done?(reviewed?tr('Спасибо за отзыв!','Sharhingiz uchun rahmat!'):tr('Поделитесь впечатлением: это помогает другим читателям.','Taassurotingiz bilan o‘rtoqlashing: bu boshqa o‘quvchilarga yordam beradi.')):t('end_demo_d')}</p>
    <div class="rend-actions">${primary}${row.length?`<div class="rend-row ${row.length===1?'one':''}">${row.join('')}</div>`:''}</div></div>`;
}
const redrawEnd=()=>{const el=$('.rend');if(el&&R.id&&NAV.cur.name==='reader'){const b=book(R.id);el.outerHTML=endCard(b,R.ch===b.chapters.length-1)}};
const softRefresh=()=>NAV.cur.name==='reader'?redrawEnd():refresh();
/* ---------- reader appearance ---------- */
const RTHEMES=[['dark',['Тёмная','Qorong‘i'],'#0c0a09','#f3ece1'],['black',['Чёрная','Qora'],'#000','#cfc9bf'],['gray',['Серая','Kulrang'],'#2b2d31','#d6d6d9'],['white',['Белая','Oq'],'#fff','#111'],['light',['Светлая','Yorug‘'],'#f5f2ec','#1e1913'],
  ['sepia',['Сепия','Sepiya'],'#f4ecd8','#5b4636'],['paper',['Бумага','Qog‘oz'],'#eee2c6','#3a2d20'],['parchment',['Старая бумага','Eski qog‘oz'],'#e6d3a2','#33220f','var(--paper)'],['cardboard',['Картон','Karton'],'#c4a67c','#241709','var(--paper)'],['green',['Зелёная','Yashil'],'#d3e8d3','#1f3a2a']];
const rThemeName=k=>{const t0=RTHEMES.find(x=>x[0]===k);return t0?tr(t0[1][0],t0[1][1]):k};
/* Open-licence (OFL) fonts with Cyrillic; Google Fonts loads each one only when it is used */
const RFONTS=[['literata','Literata',"'Literata',Georgia,serif"],['ptserif','PT Serif',"'PT Serif',Georgia,serif"],['lora','Lora',"'Lora',Georgia,serif"],['merri','Merriweather',"'Merriweather',Georgia,serif"],['garamond','EB Garamond',"'EB Garamond',Georgia,serif"],['ptsans','PT Sans',"'PT Sans',system-ui,sans-serif"],['manrope','Manrope','var(--ui)']];
const rFamily=rs=>(RFONTS.find(f=>f[0]===rs.family)||RFONTS.find(f=>f[0]===(rs.font==='sans'?'ptsans':'literata')))[2];
const RMARGIN={s:'16px',m:'26px',l:'42px'};
const rVars=rs=>`--rs:${rs.size}px;--rlh:${rs.lh};--rf:${rFamily(rs)};--ralign:${rs.align==='justify'?'justify':'left'};--rpad:${RMARGIN[rs.margin]||RMARGIN.m}`;
SCREENS.reader=({id})=>{
  const b=book(id),ch=b.chapters[R.ch],rs=S.reader,last=R.ch===b.chapters.length-1;
  const paras=ch.p.map((tx,i)=>`<p class="rp${bmFind(id,R.ch,i)?' bm':''}" data-i="${i}" data-a="rSel">${esc(tx)}</p>`).join('');
  return `<div class="reader${rs.full?' full':''}" data-mt="${rs.theme}" style="${rVars(rs)}">
  <header class="rhead px"><button class="iconbtn" data-a="toBook" aria-label="${t('to_book')}">${ico('back')}</button><div class="ttl"><b>${esc(b.title)}</b><small>${t('chapter')} ${R.ch+1} · ${esc(ch.t)}</small></div><button id="bmBtn" class="iconbtn" data-a="rBm" aria-label="${t('bm_added')}">${ico('bookmark',21)}</button>${b.chapters.length>1&&!b.chapters.every(c=>c.s)?`<button class="iconbtn" data-a="rToc" aria-label="${t('toc')}">${ico('list',21)}</button>`:''}<button class="iconbtn" data-a="rSet" aria-label="${t('text_settings')}">${ico('text',22)}</button></header>
  <div class="rfloat"><button id="bmBtn2" class="iconbtn" data-a="rBm" aria-label="${t('bm_added')}">${ico('bookmark',21)}</button><button class="iconbtn" data-a="rSet" aria-label="${t('text_settings')}">${ico('text',22)}</button><button class="iconbtn" data-a="rFull" aria-label="${tr('Выйти из полного экрана','To‘liq ekrandan chiqish')}">${ico('x',20)}</button></div>
  <div class="rwrap"><div id="rbody"><div class="chhead"><span class="eyebrow">${t('chapter')} ${R.ch+1} / ${b.chapters.length}</span><h2>${esc(ch.t)}</h2></div>${paras}${endCard(b,last)}</div>
  ${R.fresh?`<div id="rload" class="rload" aria-label="${t('opening')}"><div class="sk" style="height:14px;width:36%"></div><div class="sk" style="height:34px;width:78%;margin-bottom:12px"></div>${Array.from({length:9},(_,i)=>`<div class="sk" style="height:12px;width:${i%4===3?'60%':'100%'}"></div>`).join('')}</div>`:''}
  <div id="qbar" class="qbar" hidden><button data-a="rQuote">${ico('quote',16)} ${t('save_quote')}</button><button data-a="rCopy">${ico('share',16)} ${t('copy')}</button></div></div>
  <footer class="rfoot px"><button class="iconbtn" data-a="rPrev" aria-label="${t('prev_ch')}" ${R.ch===0?'disabled':''}>${ico('back',20)}</button><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="rbar" style="width:${pctRaw(id)}%"></i></div><span id="rpc" class="pc mono" title="${tr('Приблизительно','Taxminan')}">${pctLabel(pctRaw(id))}</span><button class="iconbtn" data-a="rNext" aria-label="${t('next_ch')}" ${last?'disabled':''}>${ico('chev',20)}</button></footer></div>`;
};
AFTER.reader=()=>{
  const body=$('#rbody');if(!body)return;
  if(S.reader.full)tg.fullscreen(true);
  const max=body.scrollHeight-body.clientHeight;
  if(R.startPara!=null){const p=body.querySelector(`.rp[data-i="${R.startPara}"]`);if(p)body.scrollTop=Math.max(0,p.offsetTop-32)}
  else if(R.startP>0)body.scrollTop=R.startP*max;
  R.startP=0;R.startPara=null;
  body.addEventListener('scroll',onRScroll,{passive:true});
  if(R.fresh){R.fresh=false;setTimeout(()=>{const l=$('#rload');if(l)l.remove()},380)}
  updateBm();
};
let rraf=0;
function onRScroll(){if(rraf)return;rraf=requestAnimationFrame(()=>{rraf=0;const body=$('#rbody');if(!body||NAV.cur.name!=='reader')return;const max=body.scrollHeight-body.clientHeight;const p=max>0?Math.min(1,body.scrollTop/max):1;setProgress(R.id,R.ch,p,curPara());const v=pctRaw(R.id);const bar=$('#rbar'),pc=$('#rpc');if(bar)bar.style.width=v+'%';if(pc)pc.textContent=pctLabel(v);updateBm()})}
function curPara(){const body=$('#rbody');if(!body)return 0;const top=body.getBoundingClientRect().top;const ps=$$('.rp',body);for(const p of ps){if(p.getBoundingClientRect().bottom>top+60)return +p.dataset.i}return Math.max(0,ps.length-1)}
function updateBm(){const on=!!bmFind(R.id,R.ch,curPara());['#bmBtn','#bmBtn2'].forEach(q=>{const b=$(q);if(b)b.classList.toggle('on',on)})}
function markBm(){$$('#rbody .rp').forEach(p=>p.classList.toggle('bm',!!bmFind(R.id,R.ch,+p.dataset.i)));updateBm()}
ACT.rBm=()=>{const i=curPara(),ex=bmFind(R.id,R.ch,i);
  if(ex){S.bookmarks=S.bookmarks.filter(x=>x!==ex);queueBookmark(ex.id,'del');toast(t('bm_removed'))}
  else{const tx=book(R.id).chapters[R.ch].p[i],bm={id:'bm'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),bookId:R.id,ch:R.ch,para:i,ver:book(R.id).ver||'',snip:tx.split(/(?<=[.!?…»])\s/)[0].slice(0,110)};S.bookmarks.push(bm);queueBookmark(bm.id,'add');toast(t('bm_added'))}
  save();markBm()};
ACT.rSel=el=>{const was=el.classList.contains('sel');$$('#rbody .rp.sel').forEach(p=>p.classList.remove('sel'));R.sel=null;if(!was){el.classList.add('sel');R.sel=+el.dataset.i}const q=$('#qbar');if(q)q.hidden=R.sel==null};
function selText(){return book(R.id).chapters[R.ch].p[R.sel]}
function clearSel(){$$('#rbody .rp.sel').forEach(p=>p.classList.remove('sel'));R.sel=null;const q=$('#qbar');if(q)q.hidden=true}
ACT.rQuote=()=>{if(R.sel==null)return;const tx=selText();const sent=tx.split(/(?<=[.!?…»])\s/).slice(0,2).join(' ');if(!S.myQuotes.some(q=>q.text===sent&&q.bookId===R.id)){const q={id:'mq'+Date.now(),bookId:R.id,text:sent,likes:0};S.myQuotes.unshift(q);
    if(net.online)api('/api/quotes','POST',{bookId:R.id,text:sent}).then(x=>{q.id=x.quote.id;SEED_QUOTES.unshift(x.quote);save()}).catch(()=>{})}
  save();clearSel();toast(t('quote_saved'))};
ACT.rCopy=()=>{if(R.sel==null)return;const b=book(R.id);copyText(`«${selText()}» — ${authorOf(b).name}, «${b.title}»`);clearSel()};
async function gotoChapter(n){
  const b=book(R.id);if(n<0||n>=b.chapters.length)return;
  try{await ensureChapter(R.id,n)}catch(e){toast(tr('Не удалось загрузить главу. Проверьте соединение.','Bobni yuklab bo‘lmadi. Aloqani tekshiring.'));return}
  R.ch=n;R.startP=0;R.startPara=null;R.fresh=false;R.sel=null;setProgress(R.id,n,0,0);render(false);
  if(n+1<b.chapters.length)ensureChapter(R.id,n+1).catch(()=>{});
}
ACT.rNext=()=>gotoChapter(R.ch+1);ACT.rPrev=()=>gotoChapter(R.ch-1);
ACT.rCh=el=>{closeSheet();gotoChapter(+el.dataset.i)};
ACT.toBook=()=>{const id=R.id;BK.tab='about';BK.syn=false;const top=NAV.stack[NAV.stack.length-1];if(top&&top.name==='book'&&top.p.id===id){back();return}replace('book',{id})};
ACT.rFinish=()=>{track(R.id,'finish');if(!S.finished.includes(R.id))S.finished.push(R.id);save();toast(t('finished_toast'));redrawEnd();if(!hasMyReview(R.id))ACT.openReview({dataset:{id:R.id}})};
ACT.rToc=()=>{const b=book(R.id);openSheet(`<h2>${t('toc')}</h2><div class="toc">${b.chapters.map((c,i)=>`<button class="${i===R.ch?'on':''}" data-a="rCh" data-i="${i}"><small>${i+1}</small><span>${esc(c.t)}</span></button>`).join('')}</div>`)};
function setHtml(){
  const rs=S.reader,seg=(arr,cur,act)=>`<div class="seg">${arr.map(([k,n])=>`<button class="${String(cur)===String(k)?'on':''}" data-a="${act}" data-v="${k}">${n}</button>`).join('')}</div>`;
  const fam=(RFONTS.find(f=>f[0]===rs.family)||RFONTS[0])[0];
  return `<div class="rset"><h2>${t('text_settings')}</h2>
  <h3>${t('theme')}</h3><div class="rthemes">${RTHEMES.map(([k,n,bg,fg,img])=>`<button class="rt ${rs.theme===k?'on':''}" data-a="rTheme" data-v="${k}" aria-pressed="${rs.theme===k}" style="--sb:${bg};--sf:${fg};${img?`--si:${img}`:''}"><span>Аа</span>${tr(n[0],n[1])}</button>`).join('')}</div>
  <h3>${t('font')}</h3><div class="rfonts">${RFONTS.map(([k,n,css])=>`<button class="${fam===k?'on':''}" data-a="rFont" data-v="${k}" style="font-family:${css}">${n}</button>`).join('')}</div>
  <h3>${t('font_size')}</h3><div class="stepper"><button data-a="rSize" data-d="-1" aria-label="A−">A−</button><div class="v" aria-live="polite">${rs.size}</div><button data-a="rSize" data-d="1" aria-label="A+">A+</button></div>
  <h3>${t('line_height')}</h3>${seg([[1.5,t('lh_tight')],[1.7,t('lh_normal')],[1.95,t('lh_airy')]],rs.lh,'rLh')}
  <h3>${tr('Поля','Chekkalar')}</h3>${seg([['s',tr('Узкие','Tor')],['m',tr('Обычные','Oddiy')],['l',tr('Широкие','Keng')]],rs.margin||'m','rMargin')}
  <h3>${tr('Выравнивание','Tekislash')}</h3>${seg([['left',tr('По левому краю','Chap')],['justify',tr('По ширине','Kenglik')]],rs.align||'left','rAlign')}
  <button class="tgl" data-a="rFull"><span>${tr('Читать во весь экран','To‘liq ekranda o‘qish')}</span><span class="tag ${rs.full?'acc':''}">${rs.full?tr('вкл','yoq'):tr('выкл','o‘ch')}</span></button></div>`}
function applyReader(){const rd=$('.reader'),rs=S.reader;if(rd){rd.dataset.mt=rs.theme;rd.style.cssText=rVars(rs);rd.classList.toggle('full',!!rs.full)}setSheet(setHtml());save()}
ACT.rSet=()=>openSheet(setHtml());
ACT.rSize=el=>{S.reader.size=Math.max(15,Math.min(28,S.reader.size+ +el.dataset.d));applyReader()};
ACT.rLh=el=>{S.reader.lh=+el.dataset.v;applyReader()};
ACT.rTheme=el=>{S.reader.theme=el.dataset.v;applyReader()};
ACT.rFont=el=>{S.reader.family=el.dataset.v;applyReader()};
ACT.rMargin=el=>{S.reader.margin=el.dataset.v;applyReader()};
ACT.rAlign=el=>{S.reader.align=el.dataset.v;applyReader()};
/* Full screen: hides the header and buttons (a small floating bar stays), and asks Telegram to hide its own header where supported. */
ACT.rFull=()=>{S.reader.full=!S.reader.full;tg.fullscreen(S.reader.full);closeSheet();applyReader();closeSheet()};

/* =====================================================================
   PROFILE & SETTINGS
   ===================================================================== */
const PROF={open:{}};
document.addEventListener('toggle',e=>{const d=e.target;if(d&&d.dataset&&d.dataset.pg)PROF.open[d.dataset.pg]=d.open},true);
/* A Telegram name like "." should not become the greeting. */
const hasName=()=>/[\p{L}\p{N}]/u.test(S.name||'');
const dispName=()=>hasName()?S.name:tr('Читатель','O‘quvchi');
SCREENS.profile=()=>{
  /* only books that exist in the catalog now: ids of removed or hidden (demo) books must not count as read */
  const finBooks=S.finished.filter(book),fin=finBooks.length;let pages=0;finBooks.forEach(id=>{pages+=book(id).pages||0});readingIds().forEach(id=>{pages+=Math.round(book(id).pages*pctRaw(id)/100)});
  const sw=(k,label)=>`<div class="li"><span class="grow" style="font-weight:600">${label}</span><button class="sw ${S.notif[k]?'on':''}" role="switch" aria-checked="${!!S.notif[k]}" aria-label="${label}" data-a="toggleN" data-k="${k}"></button></div>`;
  const seg=(arr,cur,act)=>`<div class="seg">${arr.map(([k,n])=>`<button class="${String(cur)===String(k)?'on':''}" data-a="${act}" data-v="${k}">${n}</button>`).join('')}</div>`;
  const grp=(id,title,sub,body)=>`<details class="dgroup" data-pg="${id}" ${PROF.open[id]?'open':''}><summary><b>${title}</b><span>${sub}</span></summary><div class="dbody">${body}</div></details>`;
  const rowBtn=(act,ic,title,sub,extra='')=>`<button class="li" data-a="${act}"><span class="aico">${ico(ic,20)}</span><div class="grow"><b>${title}</b><div class="mute" style="font-size:12.5px">${sub}</div></div>${extra}${ico('chev',18)}</button>`;
  const admin=S.me&&S.me.admin;
  const nOn=Object.keys(S.notif).filter(k=>S.notif[k]).length,themeName={dark:t('t_dark'),light:t('t_light'),paper:t('t_paper'),black:rThemeName('black')};
  const field=(label,body)=>`<div class="field" style="margin-bottom:18px"><label>${label}</label>${body}</div>`;
  const streakN=streak();
  return `<header class="topbar px"><h2 class="display" style="font-size:26px">${t('profile')}</h2></header>
  <div class="px">
  <div class="card" style="padding:18px">
    <div class="row" style="gap:16px"><span class="avatar" style="width:64px;height:64px;font-size:24px;background:${AVC[0]}">${hasName()?esc(S.name[0].toUpperCase()):ico('user',28)}</span>
    <div class="field grow" style="margin:0"><label for="pname">${t('reader_name')}</label><input id="pname" class="in" value="${esc(hasName()?S.name:'')}" placeholder="${tr('Как вас зовут?','Ismingiz nima?')}" maxlength="24" autocomplete="off"></div></div>
    <div class="stat3" style="grid-template-columns:repeat(4,1fr);gap:8px;margin-top:16px"><div style="padding:12px 8px"><b style="font-size:21px">${fin}</b><small>${t('stat_read')}</small></div><div style="padding:12px 8px"><b style="font-size:21px">${pages}</b><small>${t('stat_pages')}</small></div><div style="padding:12px 8px"><b style="font-size:21px">${S.bookmarks.length}</b><small>${t('stat_bm')}</small></div><div style="padding:12px 8px"><b style="font-size:21px">${streakN}</b><small>${tr('Серия','Seriya')}</small></div></div>
  </div>
  <div class="adm">
  <div class="sec" style="margin-top:24px"><div class="sec-h"><h2>${tr('Сервисы','Xizmatlar')}</h2></div>
    ${admin?`<button class="alert" data-a="openAdmin"><span class="aico" style="background:var(--acc);color:#fff">${ico('spark',20)}</span><div class="grow"><b>Админ-панель</b><div class="mute" style="font-size:12.5px;font-weight:500">Статистика, модерация, рассылка, чат</div></div>${ico('chev',18)}</button>`:''}
    <div class="list">
      ${rowBtn('openStudio','pen',t('open_studio'),t('studio_desc'))}
      ${net.online?rowBtn('openAch','star',tr('Достижения','Yutuqlar'),tr('Награды читателя и автора','O‘quvchi va muallif mukofotlari')):''}
      ${net.online&&S.donateOn?rowBtn('openDonate','heart',tr('Поддержать проект','Loyihani qo‘llab-quvvatlash'),S.me&&S.me.patron?tr('⭐ Вы меценат, спасибо!','⭐ Siz homiysiz, rahmat!'):tr('Новые книги и развитие платформы','Yangi kitoblar va platforma rivoji')):''}
      ${net.online?rowBtn('openSupport','chat',tr('Поддержка','Yordam'),tr('Написать администратору','Administratorga yozish'),S.me&&S.me.supportUnread?`<span class="badge">${S.me.supportUnread}</span>`:''):''}
    </div></div>
  <div class="sec"><div class="sec-h"><h2>${tr('Настройки','Sozlamalar')}</h2></div>
    ${grp('look',tr('Внешний вид','Tashqi ko‘rinish'),`${S.lang==='ru'?'Русский':'Oʻzbekcha'} · ${themeName[S.theme]}`,
      field(t('ui_lang'),seg([['ru','Русский'],['uz','Oʻzbekcha']],S.lang,'setLang'))+field(t('app_theme'),seg([['dark',t('t_dark')],['light',t('t_light')],['paper',t('t_paper')]],S.theme,'setTheme')))}
    ${grp('read',t('read_prefs'),`${tr('Шрифт','Shrift')} ${S.reader.size} · ${rThemeName(S.reader.theme)} · ${S.goal} ${t('min')}`,
      field(`${t('font_size')}: <b class="mono">${S.reader.size}</b>`,`<input type="range" min="15" max="28" value="${S.reader.size}" data-chg="pSize" aria-label="${t('font_size')}" style="width:100%;accent-color:var(--acc)">`)
      +field(t('line_height'),seg([[1.5,t('lh_tight')],[1.7,t('lh_normal')],[1.95,t('lh_airy')]],S.reader.lh,'pLh'))
      +field(t('theme'),`<select class="in" data-chg="pRTheme" aria-label="${t('theme')}">${RTHEMES.map(([k,n])=>`<option value="${k}" ${S.reader.theme===k?'selected':''}>${tr(n[0],n[1])}</option>`).join('')}</select><p class="mute" style="font-size:12px;margin-top:6px">${tr('Шрифт, поля и полный экран — кнопка Аа в читалке.','Shrift, chekka va to‘liq ekran — o‘qish ekranidagi Aa tugmasi.')}</p>`)
      +field(t('day_goal'),seg([[10,'10 '+t('min')],[20,'20 '+t('min')],[30,'30 '+t('min')]],S.goal,'setGoal')))}
    ${grp('notif',t('notifs'),`${tr('включено','yoqilgan')}: ${nOn} ${tr('из','/')} ${Object.keys(S.notif).length}`,
      `<div class="list" style="margin-bottom:14px">${sw('chapters',t('n_chapters'))}${sw('replies',t('n_replies'))}${sw('reminder',t('n_reminder'))}${sw('authors',t('n_authors'))}</div><p class="hint" style="margin-top:0">${tr('Все уведомления можно также настроить в боте командой /notifications.','Bildirishnomalarni botda /notifications buyrug‘i bilan ham sozlash mumkin.')}</p>`)}
  </div>
  <div class="sec"><div class="sec-h"><h2>${t('about_proto')}</h2></div><div class="list">
    <div class="li" style="align-items:flex-start;flex-direction:column;gap:4px"><span class="mute" style="font-size:13px">${t('about_text')}</span><span class="mute" style="font-size:11.5px">${tr('Версия','Versiya')}: ${typeof __BUILD__!=='undefined'?__BUILD__:'dev'}${S.appLink?'':' · '+tr('ссылка на приложение не задана','ilova havolasi o‘rnatilmagan')}</span></div>
    <button class="li" data-a="showOnb"><span class="grow">${t('show_onb')}</span>${ico('chev',18)}</button>
    <button class="li" data-a="resetAsk"><span class="grow" style="color:var(--acc-t);font-weight:700">${t('reset_demo')}</span></button>
  </div></div>
  </div></div>`;
};
ACT.setLang=el=>{S.lang=el.dataset.v;save();refresh()};
ACT.setTheme=el=>{S.theme=el.dataset.v;save();refresh()};
ACT.pLh=el=>{S.reader.lh=+el.dataset.v;save();refresh()};
CHG.pRTheme=el=>{S.reader.theme=el.value;save();refresh()};
ACT.setGoal=el=>{S.goal=+el.dataset.v;save();refresh()};
CHG.pSize=el=>{S.reader.size=+el.value;save();refresh()};
ACT.toggleN=el=>{const k=el.dataset.k;S.notif[k]=!S.notif[k];save();el.classList.toggle('on',S.notif[k]);el.setAttribute('aria-checked',S.notif[k])};
ACT.showOnb=()=>{OB.i=0;go('onboarding')};
ACT.resetAsk=()=>openSheet(`<h2>${t('reset_ask')}</h2><div class="row" style="gap:10px"><button class="btn ghost grow" data-a="closeSheet">${t('cancel')}</button><button class="btn grow" data-a="resetDo">${t('reset_yes')}</button></div>`);
ACT.resetDo=()=>{const lang=S.lang;try{localStorage.removeItem(KEY)}catch(e){}S=DEFAULT();S.lang=lang;S.onboarded=true;Object.keys(LOADED).forEach(k=>delete LOADED[k]);resetCat();closeSheet();toast(t('reset_done'));refresh();
  if(net.online)api('/api/state','PUT',persistable()).then(()=>loadBoot(false)).then(()=>refresh()).catch(()=>{})};
ONINPUT['x']=null;

document.addEventListener('input',e=>{const el=e.target;if(el.id==='pname'){S.name=el.value;save()}});

/* ---------- global events ---------- */
document.addEventListener('click',e=>{const el=e.target.closest('[data-a]');if(!el||el.disabled)return;const fn=ACT[el.dataset.a];if(fn){tg.tap();fn(el,e)}});
document.addEventListener('input',e=>{const m=e.target.dataset&&e.target.dataset.m;if(!m)return;const [o,k]=m.split(':');if(MODEL[o])MODEL[o][k]=e.target.value;if(ONINPUT[m])ONINPUT[m](e.target)});
document.addEventListener('change',e=>{const c=e.target.dataset&&e.target.dataset.chg;if(c&&CHG[c])CHG[c](e.target,e)});
document.addEventListener('submit',e=>{const f=e.target.closest('[data-f]');if(!f)return;e.preventDefault();if(FORMS[f.dataset.f])FORMS[f.dataset.f](f)});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet()});

tg.onBack(()=>{if(NAV.cur.name==='reader'&&$('#sheet').classList.contains('on')){closeSheet();return}ACT[NAV.cur.name==='reader'?'toBook':'back']?.()});

/* ---------- server sync ---------- */
const swap=(arr,v)=>arr.splice(0,arr.length,...v);
/* Reading on two devices: progress is per book (the newer one wins), lists are merged, so nothing read offline is lost. */
function mergeState(loc,rem){
  const out=rem,lp=loc.progress||{},rp=rem.progress||{};
  out.progress={...rp};for(const [id,v] of Object.entries(lp))if(!rp[id]||(v.ts||0)>(rp[id].ts||0))out.progress[id]=v;
  const uni=(a,b,k)=>{const seen=new Set((a||[]).map(k)),r=[...(a||[])];(b||[]).forEach(x=>{if(!seen.has(k(x))){seen.add(k(x));r.push(x)}});return r};
  out.finished=uni(rem.finished,loc.finished,x=>x);out.saved=uni(rem.saved,loc.saved,x=>x);out.days=uni(rem.days,loc.days,x=>x).sort().slice(-400);
  out.bookmarks=uni(rem.bookmarks,loc.bookmarks,x=>x.id);out.myQuotes=uni(rem.myQuotes,loc.myQuotes,x=>x.id);
  return out;
}
function applyBoot(d,first){
  swap(BOOKS,d.books);BOOKS.forEach(b=>{if(TEXT[b.id])b.chapters=TEXT[b.id]});swap(AUTHORS,d.authors);swap(COLLECTIONS,d.collections);swap(SEED_QUOTES,d.quotes);if(d.weekly)Object.assign(WEEKLY,d.weekly);else{WEEKLY.bookId=null}S.demo=!!d.demo;
  S.reviews=d.reviews;S.threads=d.threads;S.ratings=d.ratings;S.follows=d.follows;S.subs=d.subs;S.me=d.me;S.donateGoal=d.donateGoal;S.donateOn=d.donateOn;S.appLink=d.appLink;
  S.reacts={};d.reviews.forEach(r=>{if(r.my&&(r.my.heart||r.my.insight))S.reacts[r.id]=r.my});
  S.qLikes={};d.quotes.forEach(q=>{if(q.mine)S.qLikes[q.id]=true});
  if(first&&d.state&&Object.keys(d.state).length){const loc=S;S=mergeState(loc,Object.assign(DEFAULT(),d.state));SHARED.forEach(k=>S[k]=loc[k]);S.outbox=loc.outbox||S.outbox;if(net.online)save()}
  else if(first)api('/api/state','PUT',persistable()).catch(()=>{});
  adoptReading(d);kickSync(1500);
  if(first&&!(d.state&&d.state.name)&&!localStorage.getItem(KEY)&&d.me.name)S.name=d.me.name.slice(0,24);
}
function loadBoot(first){return api('/api/bootstrap').then(d=>{net.online=true;applyBoot(d,first)})}
$('#screen').innerHTML=`<div class="splash"><div class="display" style="font-size:30px">Muloqot Books</div><div class="bar" style="width:120px;margin-top:22px"><i style="width:40%;animation:splashbar 1.1s ease-in-out infinite alternate"></i></div></div>`;
let banned=false,stale=false;
try{await loadBoot(true)}catch(e){net.online=false;banned=e.status===403;stale=e.status===401&&tg.isTelegram()}

/* ---------- boot ---------- */
const admApi=initAdmin({AUTHORS,SCREENS,ACT,CHG,FORMS,AFTER,MODEL,ONINPUT,go,api,net,toast,esc,ico,openSheet,closeSheet,setSheet,empty,avatar,NAV,$,BOOKS,COLLECTIONS,WEEKLY,loadBoot,tr,gl,refresh,get S(){return S}});
initDonate({SCREENS,ACT,CHG,FORMS,MODEL,ONINPUT,go,api,net,toast,esc,ico,openSheet,closeSheet,empty,NAV,$,tr,tg,L,refresh,loadBoot,get S(){return S}},admApi);
initCatalogAdmin({SCREENS,ACT,CHG,api,toast,esc,ico,openSheet,closeSheet,setSheet,loadBoot,refresh,tg},admApi);
initAiStudio({ACT,CHG,api,toast,esc,ico,openSheet,closeSheet,loadBoot,go,refresh},admApi);
const ctx2={SCREENS,ACT,CHG,FORMS,MODEL,ONINPUT,go,api,net,toast,esc,ico,openSheet,closeSheet,setSheet,empty,NAV,$,tr,t,L,gl,GENRES,book,bg,save,refresh,loadBoot,tg,get S(){return S}};
initAchievements(ctx2);
initAudio(ctx2);
initStudio(ctx2);
/* things that can unlock an achievement ask the server to re-check shortly after they happen */
['toggleSave','revSubmit','follow','rQuote','rFinish'].forEach(n=>{const f=ACT[n];if(f)ACT[n]=function(){const r=f.apply(this,arguments);ctx2.checkAch();return r}});
['cNew','cReply','topicNew'].forEach(n=>{const f=FORMS[n];if(f)FORMS[n]=function(){const r=f.apply(this,arguments);ctx2.checkAch();return r}});
ctx2.checkAch(6000);
if(stale)$('#screen').innerHTML=`<div class="empty" style="padding-top:120px"><b>${tr('Сессия устарела','Seans eskirgan')}</b><span>${tr('Закройте приложение и откройте его заново.','Ilovani yoping va qayta oching.')}</span><button class="btn" data-a="tgClose">${tr('Закрыть','Yopish')}</button></div>`;
else if(banned)$('#screen').innerHTML=`<div class="empty" style="padding-top:120px"><b>${tr('Доступ ограничен','Kirish cheklangan')}</b><span>${tr('Ваш аккаунт заблокирован администратором.','Akkauntingiz administrator tomonidan bloklangan.')}</span></div>`;
else{
  /* Deep links: ?open=library|donate|support|catalog|profile (bot buttons) or startapp=book_<id> (shared books) */
  const dl=new URLSearchParams(location.search).get('open')||tg.startParam()||'';
  const target=/^book_/.test(dl)&&book(dl.slice(5))?'book':/^read_/.test(dl)&&book(dl.slice(5))?'read':{library:'library',donate:'donate',support:'support',catalog:'catalog',profile:'profile'}[dl]||'';
  if(target&&!S.onboarded){S.onboarded=true;save()}
  NAV.cur=S.onboarded?{name:'home',p:{}}:{name:'onboarding',p:{}};
  render(true);
  if(target==='book')ACT.openBook({dataset:{id:dl.slice(5)}});
  else if(target==='read')ACT.read({dataset:{id:dl.slice(5)}});
  else if(target==='donate')ACT.openDonate();
  else if(target==='support')ACT.openSupport();
  else if(target)go(target);
  const rd0=readingIds();if(net.online&&rd0[0])loadText(rd0[0]).catch(()=>{});
}
