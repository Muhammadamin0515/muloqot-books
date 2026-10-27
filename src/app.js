import {GENRES,AUTHORS,BOOKS,COLLECTIONS,SEED_REVIEWS,SEED_THREADS,WEEKLY,SEED_QUOTES} from './data.js';
import {I18N} from './i18n.js';
import {esc,ico,cover,portrait,onbArt,authorOf} from './art.js';
import * as tg from './telegram.js';
import {api,net} from './api.js';

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
  myQuotes:[],qLikes:{},reader:{size:19,lh:1.7,theme:'dark',font:'serif'},
  notif:{chapters:true,replies:true,reminder:false,authors:true},goal:20,
  subs:[]});
let S;
function load(){try{const raw=localStorage.getItem(KEY);S=Object.assign(DEFAULT(),raw?JSON.parse(raw):{})}catch(e){S=DEFAULT()}}
const SHARED=['reviews','threads','subs','reacts','qLikes','follows','ratings','me'];
const persistable=()=>{const o={...S};SHARED.forEach(k=>delete o[k]);return o};
let saveT,syncT;function save(){clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}},250);
  if(net.online){clearTimeout(syncT);syncT=setTimeout(()=>api('/api/state','PUT',persistable()).catch(()=>{}),1200)}}
const bg=(p)=>p.catch(()=>toast(tr('Нет связи с сервером','Server bilan aloqa yo‘q')));
load();
if(!S.onboarded){const u=tg.user();if(u){if(u.first_name)S.name=u.first_name.slice(0,24);if(tg.langCode()==='uz')S.lang='uz'}}

const t=k=>(I18N[S.lang]&&I18N[S.lang][k])||I18N.ru[k]||k;
const L=o=>(o&&typeof o==='object')?(o[S.lang]||o.ru):o;
const gl=g=>t('g_'+g);
const fold=s=>String(s).toLowerCase().replace(/[ʻʼ‘’`']/g,'').replace(/ё/g,'е');
const tr=(ru,uz)=>S.lang==='ru'?ru:uz;

/* ---------- helpers ---------- */
function stat(b){if(net.online)return{avg:Math.round(b.rating*10)/10,n:b.count};const u=S.ratings[b.id];const n=b.count+(u?1:0);const avg=u?(b.rating*b.count+u)/n:b.rating;return{avg:Math.round(avg*10)/10,n}}
function pctRaw(id){const pr=S.progress[id];if(!pr)return 0;const n=book(id).chapters.length;return Math.min(100,Math.round(100*(pr.ch+pr.p)/n))}
function pctOf(id){return S.finished.includes(id)?100:Math.min(99,pctRaw(id))}
const readingIds=()=>Object.keys(S.progress).filter(id=>!S.finished.includes(id)&&book(id)).sort((a,b)=>(S.progress[b].ts||0)-(S.progress[a].ts||0));
const stars=(v,s=14)=>`<span class="stars" role="img" aria-label="${v}/5">${[1,2,3,4,5].map(i=>ico('star',s,i<=Math.round(v)?'f':'e')).join('')}</span>`;
const AVC=['#a2431f','#2f6672','#7a5a22','#6a3346','#3a5d4a','#4a4f7a'];
function avatar(name,sm){let h=0;for(const c of name)h=(h*7+c.charCodeAt(0))%AVC.length;const ini=name.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();return `<span class="avatar ${sm?'sm':''}" style="background:${AVC[h]}">${esc(ini)}</span>`}
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
function leave(){const sc=$('#screen');if(NAV.cur&&sc)NAV.cur.scroll=sc.scrollTop}
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
SCREENS.onboarding=()=>{const i=OB.i,last=i===3;
  return `<div class="onb"><div class="onb-art ${i>1?'paper':''}">${onbArt(i)}<div class="onb-top px">${i>0?`<button class="iconbtn flat" data-a="obBack" aria-label="${t('back')}">${ico('back')}</button>`:'<span style="width:42px"></span>'}${langSeg()}${!last?`<button class="link" data-a="obSkip">${t('skip')}</button>`:'<span style="width:42px"></span>'}</div></div>
  <div class="onb-panel px"><h1 class="display">${t('ob'+(i+1)+'_t')}</h1><p class="lede">${t('ob'+(i+1)+'_d')}</p>
  <div class="onb-foot"><span class="mono" style="color:#a79c90">0${i+1}</span><div class="bar" role="progressbar" aria-valuemin="1" aria-valuemax="4" aria-valuenow="${i+1}"><i style="width:${(i+1)*25}%"></i></div><span class="mono" style="color:#7a7068">04</span>
  ${last?`<button class="btn" data-a="obNext">${t('start')}</button>`:`<button class="roundgo" data-a="obNext" aria-label="${t('next')}">${ico('arrow',22)}</button>`}</div></div></div>`};
function finishOnb(){S.onboarded=true;save();OB.i=0;go('home')}
ACT.obNext=()=>{if(OB.i<3){OB.i++;render(true)}else finishOnb()};
ACT.obBack=()=>{if(OB.i>0){OB.i--;render(true)}};
ACT.obSkip=finishOnb;

/* =====================================================================
   HOME
   ===================================================================== */
const bkCard=b=>{const st=stat(b);return `<button class="bk" data-a="openBook" data-id="${b.id}">${cover(b)}<span class="t">${esc(b.title)}</span><span class="a">${esc(authorOf(b).name)}</span><span class="meta">${ico('star',13,'f')}<b style="color:var(--fg)">${st.avg}</b><span class="tag">${b.lang.toUpperCase()}</span></span></button>`};
const colCard=c=>{const bs=c.ids.slice(0,3).map(book);return `<button class="col" data-a="openCollection" data-id="${c.id}" style="background:linear-gradient(135deg,${c.pal[0]},${c.pal[1]})"><div class="stack">${bs.map((b,i)=>`<div style="position:absolute;left:${i*28}px;top:${i*9}px;width:62px;z-index:${3-i}">${cover(b,'sm')}</div>`).join('')}</div><div class="tx"><b>${esc(L(c.t))}</b><small>${c.ids.length} ${t('books_n')}</small></div></button>`};
SCREENS.home=()=>{
  const h=new Date().getHours(),g=h<5?'g_night':h<12?'g_morning':h<18?'g_day':'g_evening';
  const rd=readingIds(),cb=rd.length?book(rd[0]):null;
  const cont=cb?`<button class="cont cine" data-a="read" data-id="${cb.id}"><div class="bgc">${cover(cb,'sm')}</div><div class="fade"></div><div class="in-"><div class="cv">${cover(cb)}</div><div class="grow" style="display:flex;flex-direction:column;justify-content:center;min-width:0"><span class="eyebrow" style="color:#f4a07c">${t('continue')}</span><h3>${esc(cb.title)}</h3><span style="color:#c8bcae;font-size:13px">${esc(authorOf(cb).name)}</span><div class="bar"><i style="width:${pctOf(cb.id)}%"></i></div><div class="row" style="justify-content:space-between;gap:8px"><span class="mono" style="font-size:12px;color:#c8bcae;white-space:nowrap">${pctOf(cb.id)}% · ${S.progress[cb.id].ch+1}/${cb.chapters.length}</span><span class="btn sm">${t('resume')} ${ico('arrow',15)}</span></div></div></div></button>`
   :`<div class="card">${empty('lib',t('empty_cont'),t('empty_cont_d'),`<button class="btn sm" data-a="tab" data-id="catalog">${t('pick_book')}</button>`)}</div>`;
  const pop=BOOKS.slice().sort((a,b)=>stat(b).n-stat(a).n).slice(0,8);
  const nw=BOOKS.filter(b=>b.added>=9).sort((a,b)=>b.added-a.added);
  const gc=g=>BOOKS.filter(b=>b.genre===g).length;
  return `<header class="hello px"><div class="grow"><p class="eyebrow">${t(g)}</p><h1 class="display">${esc(S.name)}</h1><span class="streak">${ico('flame',14)} ${streak()?`${streak()} ${tr('дн. подряд','kun ketma-ket')}`:tr('Начните серию сегодня','Bugun boshlang')}</span></div><button class="avatar" data-a="tab" data-id="profile" aria-label="${t('nav_profile')}" style="background:${AVC[0]}">${esc((S.name||'?')[0].toUpperCase())}</button></header>
  <div class="px" style="margin-top:18px"><button class="fakesearch" data-a="openSearch">${ico('search',20)}<span>${t('search_ph')}</span></button></div>
  <div class="px" style="margin-top:20px">${cont}</div>
  <section class="sec"><div class="sec-h px"><h2>${t('collections')}</h2></div><div class="hs px">${COLLECTIONS.map(colCard).join('')}</div></section>
  <section class="sec"><div class="sec-h px"><h2>${t('popular')}</h2><button class="link acc" data-a="tab" data-id="catalog">${t('all')}</button></div><div class="hs px">${pop.map(bkCard).join('')}</div></section>
  <section class="sec px"><div class="sec-h"><h2>${t('new_rel')}</h2></div>${nw.map(b=>`<button class="nb" data-a="openBook" data-id="${b.id}">${cover(b,'sm')}<div class="grow"><span class="tag acc">${t('new')}</span><h3 style="margin-top:8px">${esc(b.title)}</h3><div class="meta">${esc(authorOf(b).name)} · ${b.lang.toUpperCase()}</div><p>${esc(b.desc)}</p></div></button>`).join('')}</section>
  <section class="sec px"><div class="sec-h"><h2>${t('genres')}</h2></div><div class="gen">${GENRES.map(g=>`<button class="chip" data-a="genreFilter" data-id="${g}">${gl(g)} <span class="mute">${gc(g)}</span></button>`).join('')}</div></section>
  <section class="sec"><div class="sec-h px"><h2>${t('authors')}</h2></div><div class="hs px">${AUTHORS.slice(0,10).map(a=>`<button class="au" data-a="openAuthor" data-id="${a.id}"><div class="pt">${portrait(a)}</div><b>${esc(a.name)}</b><small>${esc(L(a.city))}</small></button>`).join('')}</div></section>`;
};
ACT.tab=el=>{if(NAV.tab===el.dataset.id&&NAV.cur.name===el.dataset.id){$('#screen').scrollTo({top:0,behavior:'smooth'});return}go(el.dataset.id)};
ACT.openBook=el=>{BK.tab='about';BK.syn=false;go('book',{id:el.dataset.id})};
ACT.openAuthor=el=>go('author',{id:el.dataset.id});
ACT.openSearch=()=>{resetCat();CAT.focus=true;go('catalog')};
ACT.genreFilter=el=>{resetCat();CAT.genres=[el.dataset.id];go('catalog')};
ACT.openCollection=el=>{const c=COLLECTIONS.find(x=>x.id===el.dataset.id);resetCat();CAT.ids=c.ids;CAT.coll=c.id;go('catalog')};
ACT.back=back;

/* =====================================================================
   CATALOG & SEARCH
   ===================================================================== */
const CAT={q:'',lang:'all',genres:[],sort:'pop',ids:null,coll:null,focus:false};
MODEL.cat=CAT;
function resetCat(){Object.assign(CAT,{q:'',lang:'all',genres:[],sort:'pop',ids:null,coll:null,focus:false})}
function catList(){
  let l=BOOKS.slice();
  if(CAT.ids)l=l.filter(b=>CAT.ids.includes(b.id));
  if(CAT.lang!=='all')l=l.filter(b=>b.lang===CAT.lang);
  if(CAT.genres.length)l=l.filter(b=>CAT.genres.includes(b.genre));
  const q=fold(CAT.q.trim());
  if(q)l=l.filter(b=>fold([b.title,authorOf(b).name,I18N.ru['g_'+b.genre],I18N.uz['g_'+b.genre],b.lang==='ru'?'русский russian':'oʻzbekcha uzbek'].join(' ')).includes(q));
  const cmp={pop:(a,b)=>stat(b).n-stat(a).n,rating:(a,b)=>stat(b).avg-stat(a).avg||stat(b).n-stat(a).n,new:(a,b)=>b.added-a.added,az:(a,b)=>a.title.localeCompare(b.title,S.lang==='ru'?'ru':'uz')};
  return l.sort(cmp[CAT.sort]);
}
const cardBk=b=>{const st=stat(b),sv=S.saved.includes(b.id);return `<div class="cardwrap"><button class="fab ${sv?'on':''}" data-a="toggleSave" data-id="${b.id}" aria-label="${t('add_lib')}" aria-pressed="${sv}">${ico('bookmark',17)}</button><button class="cardbk" data-a="openBook" data-id="${b.id}">${cover(b)}<span class="t">${esc(b.title)}</span><span class="a">${esc(authorOf(b).name)}</span><span class="meta">${ico('star',13,'f')}<b style="color:var(--fg)">${st.avg}</b><span class="tag">${b.lang.toUpperCase()}</span><span>${gl(b.genre)}</span></span></button></div>`};
function catResults(l){return l.length?`<div class="grid2">${l.map(cardBk).join('')}</div>`:empty('search',t('nothing'),t('nothing_d'),`<button class="btn sm ghost" data-a="resetFilters">${t('reset')}</button>`)}
let catT;
function updateCatalog(){
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
  <div class="hs px" style="margin-top:14px">${GENRES.map(g=>`<button class="chip ${CAT.genres.includes(g)?'on':''}" data-a="catGenre" data-id="${g}" aria-pressed="${CAT.genres.includes(g)}">${gl(g)}</button>`).join('')}</div>
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
  return `<article class="rev" id="rev_${r.id}"><div class="rev-h">${avatar(r.user)}<div class="grow"><b>${esc(r.user)}</b><small>${esc(L(r.date))}</small></div>${stars(r.rating)}</div>
  ${showBook&&b?`<button class="revbook" data-a="openBook" data-id="${b.id}">${cover(b,'xs')}<span>${esc(b.title)}</span></button>`:''}
  <p class="tx">${esc(r.text)}</p>
  <div class="rev-f"><button class="react ${rc.heart?'on':''}" data-a="react" data-id="${r.id}" data-k="heart" aria-pressed="${!!rc.heart}">${ico('heart',16)} ${rcnt(r,'likes',rc.heart)}</button><button class="react ${rc.insight?'on':''}" data-a="react" data-id="${r.id}" data-k="insight" aria-pressed="${!!rc.insight}">${ico('spark',16)} ${rcnt(r,'insight',rc.insight)}</button><button class="react" data-a="toggleReply" data-id="${r.id}">${ico('reply',16)} ${t('reply')}</button></div>
  ${r.replies.length?`<div class="replies">${r.replies.map(x=>`<div class="r"><b>${esc(x.user)}</b>${x.author?` <span class="tag acc">${t('author_label')}</span>`:''}<p>${esc(x.text)}</p></div>`).join('')}</div>`:''}
  <form class="replybox" id="rb_${r.id}" data-f="reviewReply" data-id="${r.id}" hidden><input class="in" name="t" placeholder="${t('write_ph')}" aria-label="${t('reply')}" autocomplete="off"><button class="iconbtn" aria-label="${t('send')}" style="background:var(--acc);color:#fff;border:0">${ico('send',18)}</button></form></article>`;
}
function threadBody(th){
  return `<div class="cmt">${th.comments.map((c,i)=>`<div class="c">${avatar(c.user,1)} <b style="margin-left:6px">${esc(c.user)}</b><p>${esc(c.text)}</p>
  ${c.replies.length?`<div class="replies">${c.replies.map(x=>`<div class="r"><b>${esc(x.user)}</b><p>${esc(x.text)}</p></div>`).join('')}</div>`:''}
  <button class="link acc" data-a="toggleCReply" data-t="${th.id}" data-c="${i}">${ico('reply',13)} ${t('reply')}</button>
  <form class="replybox" id="cr_${th.id}_${i}" data-f="cReply" data-t="${th.id}" data-c="${i}" hidden><input class="in" name="t" placeholder="${t('write_ph')}" aria-label="${t('reply')}" autocomplete="off"><button class="iconbtn" aria-label="${t('send')}" style="background:var(--acc);color:#fff;border:0">${ico('send',18)}</button></form></div>`).join('')}
  <form class="replybox" data-f="cNew" data-t="${th.id}"><input class="in" name="t" placeholder="${t('write_ph')}" aria-label="${t('write_ph')}" autocomplete="off"><button class="iconbtn" aria-label="${t('send')}" style="background:var(--acc);color:#fff;border:0">${ico('send',18)}</button></form></div>`;
}
const CM={tab:'reviews',qv:'all',open:{t1:true}};
function threadCard(th){
  const b=th.bookId?book(th.bookId):null,open=!!CM.open[th.id],n=th.comments.reduce((s,c)=>s+1+c.replies.length,0);
  return `<article class="thread"><button class="th" data-a="toggleThread" data-id="${th.id}" aria-expanded="${open}"><div class="row" style="margin-bottom:8px;flex-wrap:wrap">${avatar(th.user,1)}<span class="mute" style="font-size:12.5px">${esc(th.user)}</span>${b?`<span class="tag acc">${esc(b.title)}</span>`:''}</div><h3>${esc(th.title)}</h3>${th.text?`<p class="mute" style="margin-top:6px;font-size:14px">${esc(th.text)}</p>`:''}<div class="meta">${ico('chat',14)} ${n} ${t('replies')}</div></button>${open?threadBody(th):''}</article>`;
}
const topicForm=bid=>`<form class="replybox" data-f="topicNew" data-book="${bid||''}" style="margin:0 0 6px"><input class="in" name="t" placeholder="${t('topic_ph')}" aria-label="${t('new_topic')}" autocomplete="off"><button class="btn sm" style="height:42px">${t('post')}</button></form>`;
SCREENS.book=({id})=>{
  const b=book(id),a=authorOf(b),st=stat(b),sv=S.saved.includes(id),pr=S.progress[id],fin=S.finished.includes(id);
  const cta=fin?t('read_again'):pr?`${t('resume')} · ${pctOf(id)}%`:t('read_now');
  const revs=S.reviews.filter(r=>r.bookId===id);
  const dist=st.avg>=4.6?[64,24,8,3,1]:st.avg>=4.4?[54,28,12,4,2]:[42,32,16,7,3];
  const rel=BOOKS.filter(x=>x.id!==id).sort((x,y)=>((y.genre===b.genre)*2+(y.lang===b.lang))-((x.genre===b.genre)*2+(x.lang===b.lang))||stat(y).n-stat(x).n).slice(0,6);
  const my=S.ratings[id]||0;
  let body='';
  if(BK.tab==='about')body=`<section class="px sec" style="margin-top:6px"><h2 class="display" style="font-size:20px;margin-bottom:12px">${t('synopsis')}</h2><p class="syn ${BK.syn?'':'clamp'}">${esc(b.desc)}</p><button class="link acc" data-a="toggleSyn">${BK.syn?t('less'):t('more')}</button></section>
   <section class="px sec" style="margin-top:22px"><div class="card" style="text-align:center"><b style="font-size:14px">${t('your_rating')}</b>${starInput(my,'rate',id)}<span class="mute" style="font-size:12.5px">${my?`${my}/5`:t('tap_rate')}</span></div></section>
   <section class="px sec" style="margin-top:22px"><h2 class="display" style="font-size:20px;margin-bottom:6px">${t('details')}</h2><div class="kv"><div>${t('d_lang')}</div><div>${t(b.lang)}</div><div>${t('d_genre')}</div><div>${gl(b.genre)}</div><div>${t('d_pages')}</div><div>${b.pages}</div><div>${t('d_year')}</div><div>${b.year}</div><div>${t('d_chapters')}</div><div>${b.chapters.length}</div></div></section>
   <section class="sec"><div class="sec-h px"><h2>${t('related')}</h2></div><div class="hs px">${rel.map(bkCard).join('')}</div></section>`;
  if(BK.tab==='reviews')body=`<section class="px sec" style="margin-top:6px"><div class="row" style="gap:22px;align-items:flex-start"><div style="text-align:center"><div class="big-r">${st.avg}</div>${stars(st.avg,15)}<div class="mute" style="font-size:12px;margin-top:6px">${st.n} ${t('ratings_n')}</div></div>
   <div class="dist grow">${[5,4,3,2,1].map((n,i)=>`<span>${n}</span><div class="bar"><i style="width:${dist[i]}%"></i></div><span>${dist[i]}%</span>`).join('')}</div></div>
   <button class="btn block ghost" style="margin:20px 0 6px" data-a="openReview" data-id="${id}">${ico('pen',18)} ${t('write_review')}</button>
   ${revs.length?revs.map(r=>reviewCard(r,false)).join(''):empty('chat',t('no_reviews'),t('no_reviews_d'))}</section>`;
  if(BK.tab==='discussion'){const ths=S.threads.filter(x=>x.bookId===id);body=`<section class="px sec" style="margin-top:6px">${topicForm(id)}${ths.length?ths.map(threadCard).join(''):empty('chat',t('first_discuss'),t('topic_ph'))}</section>`}
  return `<div class="bhero"><div class="bgc">${cover(b,'sm')}</div><div class="fade"></div>
  <div class="topline px"><button class="iconbtn" data-a="back" aria-label="${t('back')}">${ico('back')}</button><button class="iconbtn" data-a="shareBook" data-id="${id}" aria-label="${t('share')}">${ico('share',20)}</button></div>
  <div class="px" style="padding-top:62px"><div class="cv">${cover(b)}</div><h1 class="display">${esc(b.title)}</h1><button class="au-link" data-a="openAuthor" data-id="${a.id}">${esc(a.name)}</button>
  <div class="facts"><span class="tag acc">${b.lang.toUpperCase()}</span><span class="tag">${gl(b.genre)}</span><span class="tag">${b.pages} ${t('pages')}</span><span class="tag">${b.year}</span></div>
  <div class="row" style="justify-content:center;margin-top:14px;gap:8px">${stars(st.avg,17)}<b>${st.avg}</b><span class="mute" style="font-size:12.5px">· ${st.n} ${t('ratings_n')}</span></div>
  <div class="cta"><button class="btn" data-a="read" data-id="${id}">${cta} ${ico('arrow',18)}</button><button class="btn ghost" data-a="toggleSave" data-id="${id}" aria-pressed="${sv}">${ico(sv?'check':'plus',18)} ${sv?t('in_lib'):t('add_lib')}</button></div></div></div>
  <div class="px" style="margin:2px 0 18px"><div class="seg" role="tablist">${[['about',t('about')],['reviews',`${t('reviews')} ${revs.length}`],['discussion',t('discussion')]].map(([k,n])=>`<button role="tab" aria-selected="${BK.tab===k}" class="${BK.tab===k?'on':''}" data-a="bookTab" data-v="${k}">${n}</button>`).join('')}</div></div>${body}`;
};
ACT.bookTab=el=>{BK.tab=el.dataset.v;refresh()};
ACT.toggleSyn=()=>{BK.syn=!BK.syn;refresh()};
ACT.rate=el=>{tg.notify('success');const id=el.dataset.id;S.ratings[id]=+el.dataset.v;save();toast(tr('Оценка сохранена','Baho saqlandi'));
  if(net.online)bg(api(`/api/books/${id}/rate`,'POST',{value:S.ratings[id]}).then(r=>{Object.assign(book(id),r);refresh()}));else refresh()};
ACT.shareBook=el=>{const b=book(el.dataset.id);{const txt=`${b.title} — ${authorOf(b).name}`;if(!tg.share(txt))copyText(txt,t('share_copied'))}};

/* =====================================================================
   REVIEWS / COMMUNITY actions
   ===================================================================== */
ACT.react=el=>{const id=el.dataset.id,k=el.dataset.k;const rc=S.reacts[id]=S.reacts[id]||{};rc[k]=!rc[k];save();const r=S.reviews.find(x=>x.id===id);const fk=k==='heart'?'likes':'insight';el.classList.toggle('on',rc[k]);el.setAttribute('aria-pressed',!!rc[k]);el.lastChild.textContent=' '+rcnt(r,fk,rc[k]);
  if(net.online)bg(api(`/api/reviews/${id}/react`,'POST',{kind:k,on:!!rc[k]}).then(x=>{r.likes=x.likes;r.insight=x.insight;el.lastChild.textContent=' '+r[fk]}))};
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
  S.ratings[REV.bookId]=REV.rating;save();closeSheet();toast(t('rv_done'));refresh();
  if(net.online){const mine=S.reviews[0],bid=REV.bookId;bg(api('/api/reviews','POST',{bookId:bid,rating:REV.rating,text:mine.text}).then(x=>{Object.assign(mine,x.review);Object.assign(book(bid),{rating:x.rating,count:x.count});refresh()}))}};

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
  else if(CM.tab==='reviews')body=`<button class="compose" data-a="openReview">${avatar(S.name,1)}<span>${t('compose_ph')}</span></button><div style="margin-top:14px">${S.reviews.map(r=>reviewCard(r,true)).join('')}</div>`;
  else if(CM.tab==='discuss'){const wb=book(WEEKLY.bookId);body=`<div class="weekly cine"><span class="eyebrow" style="color:#f4a07c">${t('weekly')}</span><h3>${esc(L(WEEKLY.q))}</h3><button class="btn sm" data-a="openThread" data-id="t1">${t('discuss_this')} ${ico('arrow',15)}</button></div>
    <div style="margin-top:20px"><div class="lbl" style="margin-bottom:8px">${t('new_topic')}</div>${topicForm('')}</div><div style="margin-top:6px">${S.threads.map(threadCard).join('')}</div>`}
  else{const mine=CM.qv==='mine';const all=mine?S.myQuotes:SEED_QUOTES;
    body=`<div class="seg" style="margin-bottom:18px">${[['all',t('from_books')],['mine',`${t('my_quotes')} ${S.myQuotes.length}`]].map(([k,n])=>`<button class="${CM.qv===k?'on':''}" data-a="quoteView" data-v="${k}">${n}</button>`).join('')}</div>
    ${all.length?`<div style="display:flex;flex-direction:column;gap:16px">${all.map(q=>quoteCard(q,mine)).join('')}</div>`:empty('quote',t('empty_quotes'),t('empty_quotes_d'),`<button class="btn sm" data-a="tab" data-id="library">${t('nav_library')}</button>`)}`}
  return `<header class="topbar px"><h2 class="display" style="font-size:26px">${t('community')}</h2></header><div class="px"><div class="seg" role="tablist">${tabs.map(([k,n])=>`<button role="tab" aria-selected="${CM.tab===k}" class="${CM.tab===k?'on':''}" data-a="commTab" data-v="${k}">${n}</button>`).join('')}</div><div style="margin-top:20px">${body}</div></div>`;
};
ACT.commTab=el=>{CM.tab=el.dataset.v;refresh()};
ACT.quoteView=el=>{CM.qv=el.dataset.v;refresh()};
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
  if(LB.tab==='bookmarks')body=bm.length?bm.map(x=>{const b=book(x.bookId);return `<div class="bmrow"><div class="row" style="gap:12px"><div style="width:34px;flex:none">${cover(b,'xs')}</div><div class="grow"><b style="font-size:14px">${esc(b.title)}</b><div class="mute" style="font-size:12px">${t('chapter')} ${x.ch+1} · ${esc(b.chapters[x.ch].t)}</div></div></div><q>${esc(x.snip)}…</q><div class="row" style="gap:8px"><button class="btn sm" data-a="openBm" data-id="${x.id}">${t('open')}</button><button class="btn sm ghost" data-a="delBm" data-id="${x.id}">${ico('trash',15)} ${t('remove')}</button></div></div>`}).join(''):empty('bookmark',t('e_bm'),t('e_bm_d'));
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
function openReader(id,opts){
  opts=opts||{};const pr=S.progress[id],fin=S.finished.includes(id);
  if(opts.bm){R.ch=opts.bm.ch;R.startP=0;R.startPara=opts.bm.para}
  else if(fin||!pr){R.ch=0;R.startP=0;R.startPara=null}
  else{R.ch=pr.ch;R.startP=pr.p;R.startPara=null}
  R.id=id;R.sel=null;R.fresh=true;markDay();
  if(!pr&&!fin){S.progress[id]={ch:R.ch,p:0,ts:Date.now()};save()}
  if(NAV.cur.name==='reader')replace('reader',{id});else go('reader',{id});
}
const today=()=>new Date().toISOString().slice(0,10);
function markDay(){const d=today();if(!S.days.includes(d)){S.days.push(d);S.days=S.days.slice(-400);save()}}
function streak(){let n=0;const d=new Date();if(!S.days.includes(d.toISOString().slice(0,10)))d.setDate(d.getDate()-1);
  while(S.days.includes(d.toISOString().slice(0,10))){n++;d.setDate(d.getDate()-1)}return n}
ACT.read=el=>openReader(el.dataset.id);
SCREENS.reader=({id})=>{
  const b=book(id),ch=b.chapters[R.ch],rs=S.reader,last=R.ch===b.chapters.length-1;
  const paras=ch.p.map((tx,i)=>`<p class="rp${bmFind(id,R.ch,i)?' bm':''}" data-i="${i}" data-a="rSel">${esc(tx)}</p>`).join('');
  const end=last?`<div class="rend"><b>${t('end_demo')}</b><p>${t('end_demo_d')}</p><div class="row" style="justify-content:center;gap:10px;flex-wrap:wrap"><button class="btn sm" data-a="rFinish">${ico('check',16)} ${t('mark_finished')}</button><button class="btn sm ghost" data-a="toBook">${t('to_book')}</button></div></div>`
   :`<div class="rend"><b>${esc(b.chapters[R.ch+1].t)}</b><p>${t('chapter')} ${R.ch+2}</p><button class="btn sm" data-a="rNext">${t('next_ch')} ${ico('arrow',16)}</button></div>`;
  return `<div class="reader" data-mt="${rs.theme}" style="--rs:${rs.size}px;--rlh:${rs.lh};--rf:${rs.font==='sans'?'var(--ui)':'var(--read)'}">
  <header class="rhead px"><button class="iconbtn" data-a="toBook" aria-label="${t('to_book')}">${ico('back')}</button><div class="ttl"><b>${esc(b.title)}</b><small>${t('chapter')} ${R.ch+1} · ${esc(ch.t)}</small></div><button id="bmBtn" class="iconbtn" data-a="rBm" aria-label="${t('bm_added')}">${ico('bookmark',21)}</button><button class="iconbtn" data-a="rToc" aria-label="${t('toc')}">${ico('list',21)}</button><button class="iconbtn" data-a="rSet" aria-label="${t('text_settings')}">${ico('text',22)}</button></header>
  <div class="rwrap"><div id="rbody"><div class="chhead"><span class="eyebrow">${t('chapter')} ${R.ch+1} / ${b.chapters.length}</span><h2>${esc(ch.t)}</h2></div>${paras}${end}</div>
  ${R.fresh?`<div id="rload" class="rload" aria-label="${t('opening')}"><div class="sk" style="height:14px;width:36%"></div><div class="sk" style="height:34px;width:78%;margin-bottom:12px"></div>${Array.from({length:9},(_,i)=>`<div class="sk" style="height:12px;width:${i%4===3?'60%':'100%'}"></div>`).join('')}</div>`:''}
  <div id="qbar" class="qbar" hidden><button data-a="rQuote">${ico('quote',16)} ${t('save_quote')}</button><button data-a="rCopy">${ico('share',16)} ${t('copy')}</button></div></div>
  <footer class="rfoot px"><button class="iconbtn" data-a="rPrev" aria-label="${t('prev_ch')}" ${R.ch===0?'disabled':''}>${ico('back',20)}</button><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="rbar" style="width:${pctRaw(id)}%"></i></div><span id="rpc" class="pc mono">${pctRaw(id)}%</span><button class="iconbtn" data-a="rNext" aria-label="${t('next_ch')}" ${last?'disabled':''}>${ico('chev',20)}</button></footer></div>`;
};
AFTER.reader=()=>{
  const body=$('#rbody');if(!body)return;
  const max=body.scrollHeight-body.clientHeight;
  if(R.startPara!=null){const p=body.querySelector(`.rp[data-i="${R.startPara}"]`);if(p)body.scrollTop=Math.max(0,p.offsetTop-32)}
  else if(R.startP>0)body.scrollTop=R.startP*max;
  R.startP=0;R.startPara=null;
  body.addEventListener('scroll',onRScroll,{passive:true});
  if(R.fresh){R.fresh=false;setTimeout(()=>{const l=$('#rload');if(l)l.remove()},380)}
  updateBm();
};
let rraf=0;
function onRScroll(){if(rraf)return;rraf=requestAnimationFrame(()=>{rraf=0;const body=$('#rbody');if(!body||NAV.cur.name!=='reader')return;const max=body.scrollHeight-body.clientHeight;const p=max>0?Math.min(1,body.scrollTop/max):1;S.progress[R.id]={ch:R.ch,p,ts:Date.now()};save();const v=pctRaw(R.id);const bar=$('#rbar'),pc=$('#rpc');if(bar)bar.style.width=v+'%';if(pc)pc.textContent=v+'%';updateBm()})}
function curPara(){const body=$('#rbody');if(!body)return 0;const top=body.getBoundingClientRect().top;const ps=$$('.rp',body);for(const p of ps){if(p.getBoundingClientRect().bottom>top+60)return +p.dataset.i}return Math.max(0,ps.length-1)}
function updateBm(){const b=$('#bmBtn');if(b)b.classList.toggle('on',!!bmFind(R.id,R.ch,curPara()))}
function markBm(){$$('#rbody .rp').forEach(p=>p.classList.toggle('bm',!!bmFind(R.id,R.ch,+p.dataset.i)));updateBm()}
ACT.rBm=()=>{const i=curPara(),ex=bmFind(R.id,R.ch,i);
  if(ex){S.bookmarks=S.bookmarks.filter(x=>x!==ex);toast(t('bm_removed'))}
  else{const tx=book(R.id).chapters[R.ch].p[i];S.bookmarks.push({id:'bm'+Date.now(),bookId:R.id,ch:R.ch,para:i,snip:tx.split(/(?<=[.!?…»])\s/)[0].slice(0,110)});toast(t('bm_added'))}
  save();markBm()};
ACT.rSel=el=>{const was=el.classList.contains('sel');$$('#rbody .rp.sel').forEach(p=>p.classList.remove('sel'));R.sel=null;if(!was){el.classList.add('sel');R.sel=+el.dataset.i}const q=$('#qbar');if(q)q.hidden=R.sel==null};
function selText(){return book(R.id).chapters[R.ch].p[R.sel]}
function clearSel(){$$('#rbody .rp.sel').forEach(p=>p.classList.remove('sel'));R.sel=null;const q=$('#qbar');if(q)q.hidden=true}
ACT.rQuote=()=>{if(R.sel==null)return;const tx=selText();const sent=tx.split(/(?<=[.!?…»])\s/).slice(0,2).join(' ');if(!S.myQuotes.some(q=>q.text===sent&&q.bookId===R.id)){const q={id:'mq'+Date.now(),bookId:R.id,text:sent,likes:0};S.myQuotes.unshift(q);
    if(net.online)api('/api/quotes','POST',{bookId:R.id,text:sent}).then(x=>{q.id=x.quote.id;SEED_QUOTES.unshift(x.quote);save()}).catch(()=>{})}
  save();clearSel();toast(t('quote_saved'))};
ACT.rCopy=()=>{if(R.sel==null)return;const b=book(R.id);copyText(`«${selText()}» — ${authorOf(b).name}, «${b.title}»`);clearSel()};
function gotoChapter(n){const b=book(R.id);if(n<0||n>=b.chapters.length)return;R.ch=n;R.startP=0;R.startPara=null;R.fresh=false;R.sel=null;S.progress[R.id]={ch:n,p:0,ts:Date.now()};save();render(false)}
ACT.rNext=()=>gotoChapter(R.ch+1);ACT.rPrev=()=>gotoChapter(R.ch-1);
ACT.rCh=el=>{closeSheet();gotoChapter(+el.dataset.i)};
ACT.toBook=()=>{const id=R.id;BK.tab='about';BK.syn=false;const top=NAV.stack[NAV.stack.length-1];if(top&&top.name==='book'&&top.p.id===id){back();return}replace('book',{id})};
ACT.rFinish=()=>{if(!S.finished.includes(R.id))S.finished.push(R.id);save();toast(t('finished_toast'));ACT.openReview({dataset:{id:R.id}})};
ACT.rToc=()=>{const b=book(R.id);openSheet(`<h2>${t('toc')}</h2><div class="toc">${b.chapters.map((c,i)=>`<button class="${i===R.ch?'on':''}" data-a="rCh" data-i="${i}"><small>${i+1}</small><span>${esc(c.t)}</span></button>`).join('')}</div>`)};
function setHtml(){const rs=S.reader;const seg=(arr,cur,act)=>`<div class="seg">${arr.map(([k,n])=>`<button class="${String(cur)===String(k)?'on':''}" data-a="${act}" data-v="${k}">${n}</button>`).join('')}</div>`;
  return `<div class="rset"><h2>${t('text_settings')}</h2><h3>${t('font_size')}</h3><div class="stepper"><button data-a="rSize" data-d="-1" aria-label="A−">A−</button><div class="v" aria-live="polite">${rs.size}</div><button data-a="rSize" data-d="1" aria-label="A+">A+</button></div>
  <h3>${t('line_height')}</h3>${seg([[1.5,t('lh_tight')],[1.7,t('lh_normal')],[1.95,t('lh_airy')]],rs.lh,'rLh')}<h3>${t('theme')}</h3>${seg([['dark',t('t_dark')],['light',t('t_light')],['paper',t('t_paper')]],rs.theme,'rTheme')}<h3>${t('font')}</h3>${seg([['serif',t('f_serif')],['sans',t('f_sans')]],rs.font,'rFont')}</div>`}
function applyReader(){const rd=$('.reader'),rs=S.reader;if(rd){rd.dataset.mt=rs.theme;rd.style.setProperty('--rs',rs.size+'px');rd.style.setProperty('--rlh',rs.lh);rd.style.setProperty('--rf',rs.font==='sans'?'var(--ui)':'var(--read)')}setSheet(setHtml());save()}
ACT.rSet=()=>openSheet(setHtml());
ACT.rSize=el=>{S.reader.size=Math.max(15,Math.min(28,S.reader.size+ +el.dataset.d));applyReader()};
ACT.rLh=el=>{S.reader.lh=+el.dataset.v;applyReader()};
ACT.rTheme=el=>{S.reader.theme=el.dataset.v;applyReader()};
ACT.rFont=el=>{S.reader.font=el.dataset.v;applyReader()};

/* =====================================================================
   AUTHOR STUDIO
   ===================================================================== */
const ST={mode:'home',step:0,title:'',author:'',lang:'ru',genre:'novel',desc:'',tags:'',cover:null,coverName:'',fileName:'',fileSize:'',body:'',err:null,sending:false,sent:false};MODEL.st=ST;
const AD={list:null};
const subLabel={draft:'status_draft',moderation:'status_mod',approved:'status_ok',rejected:'status_no'};
const draftBook=()=>({id:'draft',title:ST.title.trim()||t('f_title'),authorName:ST.author.trim()||S.name,motif:'ornament',pal:['#2a1a14','#7a2e17','#e8742f','#140c09','#f0dfc6'],img:ST.cover});
SCREENS.studio=()=>{
  let body='';
  if(ST.mode==='home'){
    body=`<div class="sec" style="margin-top:8px"><div class="sec-h"><h2>${t('my_subs')}</h2></div>${S.subs.length?`<div class="list">${S.subs.map(s=>`<div class="li"><div class="grow"><b>${esc(s.title)}</b></div><span class="status ${s.status==='moderation'||s.status==='approved'?'m':''}">${t(subLabel[s.status]||'status_draft')}</span></div>`).join('')}</div>`:''}</div>
    <button class="btn block" style="margin-top:20px" data-a="stNew">${ico('plus',18)} ${t('add_title')}</button>`;
  }else{
    const steps=[t('st1'),t('st2'),t('st3'),t('st4')];
    let inner='';
    if(ST.step===0)inner=`<div class="field"><label for="stTitle">${t('f_title')}</label><input id="stTitle" class="in" data-m="st:title" value="${esc(ST.title)}" autocomplete="off"></div>
     <div class="field"><label for="stAuthor">${t('f_author')}</label><input id="stAuthor" class="in" data-m="st:author" value="${esc(ST.author||S.name)}" autocomplete="off"></div>
     <div class="row" style="gap:12px;align-items:flex-start"><div class="field grow"><label for="stLang">${t('f_lang')}</label><select id="stLang" class="in" data-chg="stLang"><option value="ru" ${ST.lang==='ru'?'selected':''}>Русский</option><option value="uz" ${ST.lang==='uz'?'selected':''}>Oʻzbekcha</option></select></div>
     <div class="field grow"><label for="stGenre">${t('f_genre')}</label><select id="stGenre" class="in" data-chg="stGenre">${GENRES.map(g=>`<option value="${g}" ${ST.genre===g?'selected':''}>${gl(g)}</option>`).join('')}</select></div></div>
     <div class="field"><label for="stDesc">${t('f_desc')}</label><textarea id="stDesc" class="in" data-m="st:desc" placeholder="${t('f_desc_ph')}">${esc(ST.desc)}</textarea></div>
     <div class="field"><label for="stTags">${t('f_tags')}</label><input id="stTags" class="in" data-m="st:tags" value="${esc(ST.tags)}" autocomplete="off"></div>${ST.err?`<p class="err">${esc(ST.err)}</p>`:''}`;
    if(ST.step===1)inner=`<div class="field"><span class="lbl">${t('up_cover')}</span><label class="drop" for="stCover"><div style="width:54px;flex:none">${cover(draftBook(),'sm')}</div><div class="grow"><b>${ST.coverName?esc(ST.coverName):t('up_cover')}</b><div class="mute" style="font-size:12.5px;font-weight:500;margin-top:3px">${t('cover_auto')}</div></div>${ico('upload',22)}</label><input id="stCover" class="vh" type="file" accept="image/*" data-chg="stCover" style="position:absolute;opacity:0;width:1px;height:1px"></div>
     <div class="field"><span class="lbl">${t('up_file')}</span><label class="drop" for="stFile">${ico('file',26)}<div class="grow"><b>${ST.fileName?esc(ST.fileName):t('up_file')}</b><div class="mute" style="font-size:12.5px;font-weight:500;margin-top:3px">${ST.fileName?esc(ST.fileSize):'.txt · .md'}</div></div>${ico('upload',22)}</label><input id="stFile" type="file" accept=".txt,.md,text/plain" data-chg="stFile" style="position:absolute;opacity:0;width:1px;height:1px"><p class="mute" style="font-size:12px;margin-top:2px">${t('file_demo')}</p>${ST.err?`<p class="err">${esc(ST.err)}</p>`:''}</div>`;
    if(ST.step===2){const d=draftBook();inner=`<div class="card" style="text-align:center"><div style="width:130px;margin:6px auto 16px">${cover(d)}</div><h2 class="display" style="font-size:22px">${esc(d.title)}</h2><div style="color:var(--acc-t);font-weight:700;font-size:13.5px;margin:6px 0 12px">${esc(d.authorName)}</div><div class="facts"><span class="tag acc">${ST.lang.toUpperCase()}</span><span class="tag">${gl(ST.genre)}</span></div><p class="syn" style="text-align:left;margin-top:16px;font-size:14.5px">${esc(ST.desc.trim()||'—')}</p></div><button class="btn block ghost" style="margin-top:14px" data-a="stPage">${ico('text',18)} ${t('preview_page')}</button>`}
    if(ST.step===3){
      if(ST.sent)inner=`<div class="empty" style="padding-top:10px"><div class="ring" style="border-style:solid;border-color:var(--acc);color:var(--acc-t)">${ico('check',30)}</div><b>${t('sent')}</b><span>${t('sent_d')}</span></div><div class="stages"><div class="on"><span class="dot">${ico('check',14)}</span>${t('s_received')}</div><div><span class="dot"></span>${t('s_review')}</div><div><span class="dot"></span>${t('s_decision')}</div></div><button class="btn block" data-a="stNew">${t('new_book')}</button><button class="btn block ghost" style="margin-top:10px" data-a="stHome">${t('my_subs')}</button>`;
      else inner=`<div class="card"><div class="row" style="gap:14px"><div style="width:64px;flex:none">${cover(draftBook(),'sm')}</div><div class="grow"><b>${esc(draftBook().title)}</b><div class="mute" style="font-size:12.5px">${esc(draftBook().authorName)} · ${ST.lang.toUpperCase()} · ${gl(ST.genre)}</div>${ST.fileName?`<div class="mute" style="font-size:12px;margin-top:6px">${ico('file',13)} ${esc(ST.fileName)}</div>`:''}</div></div></div>
       ${ST.sending?`<div style="margin:22px 0"><div class="bar"><i id="stBar" style="width:0%;transition:width .25s"></i></div><p class="mute" style="font-size:13px;margin-top:10px">${t('sending')}</p></div>`:`<p class="mute" style="font-size:13px;margin:16px 0">${t('demo_banner')}</p><button class="btn block" data-a="stSubmit">${t('submit_mod')}</button>`}`}
    const nav=(ST.step===3&&(ST.sent||ST.sending))?'':`<div class="row" style="gap:10px;margin-top:24px">${ST.step>0?`<button class="btn ghost" data-a="stPrev">${t('back')}</button>`:`<button class="btn ghost" data-a="stHome">${t('cancel')}</button>`}${ST.step<3?`<button class="btn grow" data-a="stNext">${t('next')}</button>`:''}</div>`;
    body=`<div class="steps" aria-label="${steps[ST.step]}">${steps.map((s,i)=>`<i class="${i<=ST.step?'on':''}"></i>`).join('')}</div><div class="eyebrow" style="margin-bottom:16px">${ST.step+1} / 4 · ${steps[ST.step]}</div>${inner}${nav}`;
  }
  return `<header class="topbar px"><button class="iconbtn" data-a="back" aria-label="${t('back')}">${ico('back')}</button><div class="grow"><h2 class="display" style="font-size:22px">${t('studio')}</h2></div></header>
  <div class="px"><div class="demo-banner">${ico('info',18)}<span>${t('demo_banner')}</span></div>${S.me&&S.me.admin?adminBlock():''}${body}</div>`;
};
ACT.stNew=()=>{Object.assign(ST,{mode:'form',step:0,title:'',author:S.name,lang:'ru',genre:'novel',desc:'',tags:'',cover:null,coverName:'',fileName:'',fileSize:'',body:'',err:null,sending:false,sent:false});refresh();$('#screen').scrollTop=0};
ACT.stHome=()=>{ST.mode='home';ST.sending=false;ST.sent=false;refresh()};
ACT.stPrev=()=>{ST.step=Math.max(0,ST.step-1);ST.err=null;refresh();$('#screen').scrollTop=0};
ACT.stNext=()=>{if(ST.step===0){if(ST.title.trim().length<2){ST.err=t('err_title');refresh();return}if(ST.desc.trim().length<20){ST.err=t('err_desc');refresh();return}}if(ST.step===1&&net.online&&ST.body.trim().length<500){ST.err=t('err_file');refresh();return}ST.err=null;ST.step=Math.min(3,ST.step+1);refresh();$('#screen').scrollTop=0};
CHG.stLang=el=>{ST.lang=el.value};CHG.stGenre=el=>{ST.genre=el.value};
CHG.stCover=el=>{const f=el.files&&el.files[0];if(!f)return;if(f.size>600*1024){toast(tr('Обложка больше 600 КБ','Muqova 600 KB dan katta'));return}const fr=new FileReader();fr.onload=()=>{ST.cover=fr.result;ST.coverName=f.name;refresh()};fr.readAsDataURL(f)};
CHG.stFile=el=>{const f=el.files&&el.files[0];if(!f)return;if(f.size>1100*1024){toast(tr('Файл больше 1 МБ','Fayl 1 MB dan katta'));return}
  const fr=new FileReader();fr.onload=()=>{ST.body=String(fr.result);ST.fileName=f.name;ST.fileSize=(f.size/1024).toFixed(0)+' KB';refresh()};fr.readAsText(f)};
ACT.stPage=()=>{const d=draftBook();openSheet(`<h2>${t('preview_page')}</h2><div class="reader" style="background:transparent;height:auto;--rs:18px;--rlh:1.7"><div class="chhead"><span class="eyebrow">${t('chapter')} 1</span><h2>${esc(d.title)}</h2></div><p class="rp" style="font-family:var(--read)">${esc(ST.desc.trim()||'—')}</p></div>`)};
const subDone=sub=>{ST.sending=false;ST.sent=true;S.subs.unshift(sub);save();if(NAV.cur.name==='studio')refresh()};
ACT.stSubmit=()=>{ST.sending=true;refresh();
  if(net.online){const bar=()=>$('#stBar');setTimeout(()=>{const b=bar();if(b)b.style.width='70%'},30);
    api('/api/submissions','POST',{title:ST.title,author:ST.author,lang:ST.lang,genre:ST.genre,desc:ST.desc,tags:ST.tags,cover:ST.cover,fileName:ST.fileName,body:ST.body}).then(x=>subDone(x.sub)).catch(()=>{ST.sending=false;toast(t('err_send'));if(NAV.cur.name==='studio')refresh()});return}
  let v=0;const iv=setInterval(()=>{v+=14;const bar=$('#stBar');if(bar)bar.style.width=Math.min(100,v)+'%';if(v>=100){clearInterval(iv);setTimeout(()=>subDone({id:'s'+Date.now(),title:ST.title.trim(),status:'moderation'}),300)}},220)};
/* ---------- moderation (admins) ---------- */
function adminBlock(){
  if(!AD.list||!AD.list.length)return AD.list?`<div class="sec" style="margin:0 0 22px"><div class="sec-h"><h2>${t('moderation')}</h2></div><p class="mute">${t('mod_empty')}</p></div>`:'';
  return `<div class="sec" style="margin:0 0 22px"><div class="sec-h"><h2>${t('moderation')}</h2></div>${AD.list.map(x=>`<div class="card" style="margin-bottom:10px"><b>${esc(x.title)}</b><div class="mute" style="font-size:12.5px;margin:4px 0 8px">${esc(x.author)} · ${x.lang.toUpperCase()} · ${gl(x.genre)} · ${Math.round(x.chars/1000)}k</div><p style="font-size:13.5px;margin-bottom:12px">${esc(x.desc)}</p><div class="row" style="gap:8px"><button class="btn sm" data-a="adApprove" data-id="${x.id}">${t('approve')}</button><button class="btn sm ghost" data-a="adReject" data-id="${x.id}">${t('reject')}</button></div></div>`).join('')}</div>`;
}
const loadAdmin=()=>{if(net.online&&S.me&&S.me.admin)api('/api/admin/submissions').then(l=>{AD.list=l;if(NAV.cur.name==='studio')refresh()}).catch(()=>{})};
ACT.adApprove=el=>bg(api(`/api/admin/submissions/${el.dataset.id}/approve`,'POST',{}).then(()=>{toast(t('approved_toast'));loadAdmin();return loadBoot().then(()=>refresh())}));
ACT.adReject=el=>bg(api(`/api/admin/submissions/${el.dataset.id}/reject`,'POST',{}).then(()=>{loadAdmin()}));

/* =====================================================================
   PROFILE & SETTINGS
   ===================================================================== */
SCREENS.profile=()=>{
  const fin=S.finished.length;let pages=0;S.finished.forEach(id=>{const b=book(id);if(b)pages+=b.pages});readingIds().forEach(id=>{pages+=Math.round(book(id).pages*pctRaw(id)/100)});
  const sw=(k,label)=>`<div class="li"><span class="grow" style="font-weight:600">${label}</span><button class="sw ${S.notif[k]?'on':''}" role="switch" aria-checked="${!!S.notif[k]}" aria-label="${label}" data-a="toggleN" data-k="${k}"></button></div>`;
  const seg=(arr,cur,act)=>`<div class="seg">${arr.map(([k,n])=>`<button class="${String(cur)===String(k)?'on':''}" data-a="${act}" data-v="${k}">${n}</button>`).join('')}</div>`;
  return `<header class="topbar px"><h2 class="display" style="font-size:26px">${t('profile')}</h2></header>
  <div class="px"><div class="row" style="gap:16px;margin-bottom:22px"><span class="avatar" style="width:68px;height:68px;font-size:26px;background:${AVC[0]}">${esc((S.name||'?')[0].toUpperCase())}</span><div class="field grow" style="margin:0"><label for="pname">${t('reader_name')}</label><input id="pname" class="in" value="${esc(S.name)}" maxlength="24" autocomplete="off"></div></div>
  <div class="stat3"><div><b>${fin}</b><small>${t('stat_read')}</small></div><div><b>${pages}</b><small>${t('stat_pages')}</small></div><div><b>${S.bookmarks.length}</b><small>${t('stat_bm')}</small></div></div>
  <button class="li card" style="margin-top:18px;width:100%;border:1px solid var(--line2)" data-a="openStudio"><span class="iconbtn" style="background:var(--acc-soft);color:var(--acc-t);border:0">${ico('pen',20)}</span><div class="grow"><b>${t('open_studio')}</b><div class="mute" style="font-size:12.5px">${t('studio_desc')}</div></div>${ico('chev',18)}</button>
  <section class="sec" style="margin-top:28px"><div class="lbl" style="margin-bottom:10px">${t('ui_lang')}</div>${seg([['ru','Русский'],['uz','Oʻzbekcha']],S.lang,'setLang')}</section>
  <section class="sec" style="margin-top:22px"><div class="lbl" style="margin-bottom:10px">${t('app_theme')}</div>${seg([['dark',t('t_dark')],['light',t('t_light')],['paper',t('t_paper')]],S.theme,'setTheme')}</section>
  <section class="sec" style="margin-top:22px"><div class="lbl" style="margin-bottom:10px">${t('read_prefs')}</div><div class="card" style="display:flex;flex-direction:column;gap:16px">
   <div><div class="row" style="justify-content:space-between;margin-bottom:8px"><span style="font-weight:600">${t('font_size')}</span><b class="mono">${S.reader.size}</b></div><input type="range" min="15" max="28" value="${S.reader.size}" data-chg="pSize" aria-label="${t('font_size')}" style="width:100%;accent-color:var(--acc)"></div>
   <div><div style="font-weight:600;margin-bottom:8px">${t('line_height')}</div>${seg([[1.5,t('lh_tight')],[1.7,t('lh_normal')],[1.95,t('lh_airy')]],S.reader.lh,'pLh')}</div>
   <div><div style="font-weight:600;margin-bottom:8px">${t('theme')}</div>${seg([['dark',t('t_dark')],['light',t('t_light')],['paper',t('t_paper')]],S.reader.theme,'pRTheme')}</div>
   <div><div style="font-weight:600;margin-bottom:8px">${t('day_goal')}</div>${seg([[10,'10 '+t('min')],[20,'20 '+t('min')],[30,'30 '+t('min')]],S.goal,'setGoal')}</div></div></section>
  <section class="sec" style="margin-top:22px"><div class="lbl" style="margin-bottom:10px">${t('notifs')}</div><div class="list">${sw('chapters',t('n_chapters'))}${sw('replies',t('n_replies'))}${sw('reminder',t('n_reminder'))}${sw('authors',t('n_authors'))}</div></section>
  <section class="sec" style="margin-top:22px"><div class="lbl" style="margin-bottom:10px">${t('about_proto')}</div><div class="list"><div class="li" style="align-items:flex-start;flex-direction:column;gap:4px"><span class="mute" style="font-size:13px">${t('about_text')}</span></div><button class="li" data-a="showOnb"><span class="grow">${t('show_onb')}</span>${ico('chev',18)}</button><button class="li" data-a="resetAsk"><span class="grow" style="color:var(--acc-t);font-weight:700">${t('reset_demo')}</span></button></div></section></div>`;
};
ACT.setLang=el=>{S.lang=el.dataset.v;save();refresh()};
ACT.setTheme=el=>{S.theme=el.dataset.v;save();refresh()};
ACT.pLh=el=>{S.reader.lh=+el.dataset.v;save();refresh()};
ACT.pRTheme=el=>{S.reader.theme=el.dataset.v;save();refresh()};
ACT.setGoal=el=>{S.goal=+el.dataset.v;save();refresh()};
CHG.pSize=el=>{S.reader.size=+el.value;save();refresh()};
ACT.toggleN=el=>{const k=el.dataset.k;S.notif[k]=!S.notif[k];save();el.classList.toggle('on',S.notif[k]);el.setAttribute('aria-checked',S.notif[k])};
ACT.openStudio=()=>{ST.mode='home';ST.sent=false;ST.sending=false;go('studio');loadAdmin();if(net.online)api('/api/bootstrap').then(d=>{S.subs=d.subs;if(NAV.cur.name==='studio')refresh()}).catch(()=>{})};
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
function applyBoot(d,first){
  swap(BOOKS,d.books);swap(AUTHORS,d.authors);swap(COLLECTIONS,d.collections);swap(SEED_QUOTES,d.quotes);Object.assign(WEEKLY,d.weekly);
  S.reviews=d.reviews;S.threads=d.threads;S.ratings=d.ratings;S.follows=d.follows;S.subs=d.subs;S.me=d.me;
  S.reacts={};d.reviews.forEach(r=>{if(r.my&&(r.my.heart||r.my.insight))S.reacts[r.id]=r.my});
  S.qLikes={};d.quotes.forEach(q=>{if(q.mine)S.qLikes[q.id]=true});
  if(first&&d.state&&Object.keys(d.state).length){const loc=S;S=Object.assign(DEFAULT(),d.state);['reviews','threads','ratings','follows','subs','me','reacts','qLikes'].forEach(k=>S[k]=loc[k])}
  else if(first)api('/api/state','PUT',persistable()).catch(()=>{});
  if(first&&!(d.state&&d.state.name)&&!localStorage.getItem(KEY)&&d.me.name)S.name=d.me.name.slice(0,24);
}
function loadBoot(first){return api('/api/bootstrap').then(d=>{net.online=true;applyBoot(d,first)})}
try{await loadBoot(true)}catch(e){net.online=false}

/* ---------- boot ---------- */
NAV.cur=S.onboarded?{name:'home',p:{}}:{name:'onboarding',p:{}};

render(true);
