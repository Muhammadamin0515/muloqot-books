/* Podcasts: a section of the Catalog. Readers pick a show and listen to its episodes (audio links added by an administrator);
   the position of each show is stored in the reader's synced state. Administrators manage shows in Admin → Книги → Подкасты. */
const SPEEDS=[0.75,1,1.25,1.5,1.75,2];
const fmt=s=>{s=Math.max(0,Math.floor(s||0));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(r).padStart(2,'0')};
const hue=s=>{let h=0;for(const ch of String(s))h=(h*31+ch.charCodeAt(0))%360;return h};
/** "90", "1:30" and "1:02:03" all mean a length; empty means unknown */
const parseLen=v=>{const p=String(v||'').trim().split(':').map(Number);if(!p.length||p.some(n=>!Number.isFinite(n)))return 0;return p.reduce((a,n)=>a*60+n,0)};

export function initPodcasts(x,adm){
  const {SCREENS,ACT,CHG,go,api,toast,esc,ico,tr,refresh,NAV,save,openSheet,closeSheet}=x;
  const S=()=>x.S;
  const P={list:null,lang:'all',cur:null,loading:false,err:false};
  const A={id:null,eps:null,i:0,playing:false,cur:0,dur:0,speed:1,err:false};
  const el=new Audio();el.preload='metadata';
  let lastSave=0;
  const onPod=()=>NAV.cur.name==='podcast';
  const ui=(id,v)=>{const n=document.getElementById(id);if(n)n.textContent=v};
  const pos=()=>{const s=S();s.podPos=s.podPos||{};return s.podPos};
  const savePos=force=>{if(!A.id)return;const now=Date.now();if(!force&&now-lastSave<5000)return;lastSave=now;pos()[A.id]={ep:A.i,t:Math.floor(el.currentTime||0),speed:A.speed,ts:now};save()};

  /* ---------- player ---------- */
  el.addEventListener('timeupdate',()=>{A.cur=el.currentTime;const r=document.getElementById('pSeek');if(r&&!r.matches(':active')){r.max=Math.floor(A.dur||0);r.value=Math.floor(A.cur)}ui('pCur',fmt(A.cur));ui('pLeft','-'+fmt(Math.max(0,A.dur-A.cur)));savePos(false)});
  el.addEventListener('loadedmetadata',()=>{A.dur=el.duration||0;A.err=false;const r=document.getElementById('pSeek');if(r)r.max=Math.floor(A.dur);ui('pLeft','-'+fmt(A.dur-A.cur))});
  el.addEventListener('play',()=>{A.playing=true;setBtn();if(x.audioPause)x.audioPause()});
  el.addEventListener('pause',()=>{A.playing=false;setBtn();savePos(true)});
  el.addEventListener('error',()=>{A.err=true;A.playing=false;if(onPod())refresh()});
  el.addEventListener('ended',()=>{if(A.eps&&A.i<A.eps.length-1)load(A.i+1,0,true);else{A.playing=false;savePos(true);setBtn()}});
  const setBtn=()=>{const b=document.getElementById('pPlay');if(b)b.innerHTML=ico(A.playing?'pause':'play',30);document.querySelectorAll('[data-pe]').forEach(n=>n.classList.toggle('on',+n.dataset.pe===A.i&&A.playing))};
  x.podPause=()=>el.pause();
  function mediaSession(){
    if(!('mediaSession' in navigator)||!A.id||!P.cur)return;
    try{navigator.mediaSession.metadata=new MediaMetadata({title:A.eps[A.i].title,artist:P.cur.podcast.host||'Muloqot Books',album:P.cur.podcast.title});
      navigator.mediaSession.setActionHandler('play',()=>el.play());navigator.mediaSession.setActionHandler('pause',()=>el.pause());
      navigator.mediaSession.setActionHandler('seekbackward',()=>skip(-15));navigator.mediaSession.setActionHandler('seekforward',()=>skip(30));
      navigator.mediaSession.setActionHandler('previoustrack',()=>load(Math.max(0,A.i-1),0,true));navigator.mediaSession.setActionHandler('nexttrack',()=>load(Math.min(A.eps.length-1,A.i+1),0,true))}catch(e){}
  }
  function load(i,t,play){
    A.i=i;A.cur=t||0;A.dur=A.eps[i].duration||0;A.err=false;el.src=A.eps[i].url;el.playbackRate=A.speed;
    if(t)el.addEventListener('loadedmetadata',()=>{el.currentTime=t},{once:true});
    if(play)el.play().catch(()=>{A.err=true;if(onPod())refresh()});
    mediaSession();if(onPod())refresh();
  }
  const skip=d=>{el.currentTime=Math.max(0,Math.min(el.duration||1e9,el.currentTime+d))};
  ACT.pToggle=()=>{if(!A.eps||!A.eps.length)return;if(!el.src)return load(A.i,A.cur,true);if(el.paused){A.err=false;el.play().catch(()=>{A.err=true;refresh()})}else el.pause()};
  ACT.pSkip=b=>skip(+b.dataset.d);
  ACT.pPrev=()=>{if(el.currentTime>5)skip(-el.currentTime);else if(A.i>0)load(A.i-1,0,A.playing)};
  ACT.pNext=()=>{if(A.i<A.eps.length-1)load(A.i+1,0,A.playing)};
  ACT.pEp=b=>{const i=+b.dataset.pe;if(i===A.i&&el.src){ACT.pToggle();return}load(i,0,true)};
  ACT.pSpeed=()=>{const k=(SPEEDS.indexOf(A.speed)+1)%SPEEDS.length;A.speed=SPEEDS[k];el.playbackRate=A.speed;ui('pSpd',A.speed+'×');savePos(true)};
  document.addEventListener('input',e=>{if(e.target&&e.target.id==='pSeek'){el.currentTime=+e.target.value;ui('pCur',fmt(+e.target.value))}});
  window.addEventListener('pagehide',()=>savePos(true));

  /* ---------- reader screens ---------- */
  async function loadList(){
    if(P.loading)return;P.loading=true;P.err=false;
    try{P.list=(await api('/api/podcasts')).podcasts}catch(e){P.list=[];P.err=true}
    P.loading=false;if(NAV.cur.name==='podcasts')refresh();
  }
  const art=(p,size)=>p.cover?`<img class="pcv" src="${esc(p.cover)}" alt="" loading="lazy" style="${size?`width:${size}px;height:${size}px`:''}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'pcv ph',innerHTML:''}))">`
    :`<div class="pcv ph" style="${size?`width:${size}px;height:${size}px;`:''}--h:${hue(p.id+p.title)}">${ico('headphones',size?Math.round(size/3):26)}</div>`;
  const switcher=books=>`<div class="seg" role="group" aria-label="${tr('Раздел','Bo‘lim')}"><button class="${books?'on':''}" data-a="podToBooks">${tr('Книги','Kitoblar')}</button><button class="${books?'':'on'}" data-a="${books?'podOpen':'podNoop'}">${tr('Подкасты','Podkastlar')}</button></div>`;
  ACT.podOpen=()=>{go('podcasts');loadList()};
  ACT.podNoop=()=>{};
  ACT.podToBooks=()=>go('catalog');
  ACT.podLang=b=>{P.lang=b.dataset.v;refresh()};
  x.podcastSwitch=()=>switcher(true);
  SCREENS.podcasts=()=>{
    if(!P.list&&!P.loading)loadList();
    const seg=[['all',tr('Все','Hammasi')],['ru','Русский'],['uz','Oʻzbekcha']];
    const list=(P.list||[]).filter(p=>P.lang==='all'||p.lang===P.lang);
    return `<header class="topbar px"><button class="iconbtn" data-a="back" aria-label="${tr('Назад','Orqaga')}">${ico('back')}</button><div class="grow"><h2 class="display" style="font-size:26px">${tr('Подкасты','Podkastlar')}</h2></div></header>
    <div class="px">${switcher(false)}<div class="seg" style="margin-top:12px" role="group" aria-label="${tr('Язык','Til')}">${seg.map(([k,n])=>`<button class="${P.lang===k?'on':''}" data-a="podLang" data-v="${k}">${n}</button>`).join('')}</div>
    <div style="margin-top:16px">${P.list===null?`<div class="sk" style="height:84px;border-radius:16px;margin-bottom:10px"></div><div class="sk" style="height:84px;border-radius:16px"></div>`
      :P.err?x.empty('headphones',tr('Не удалось загрузить','Yuklab bo‘lmadi'),tr('Проверьте соединение и попробуйте ещё раз.','Aloqani tekshirib, qayta urinib ko‘ring.'),`<button class="btn sm" data-a="podReload">${tr('Повторить','Qayta urinish')}</button>`)
      :list.length?`<div class="list">${list.map(p=>`<button class="li pc" data-a="podShow" data-id="${esc(p.id)}">${art(p,64)}<span class="grow" style="min-width:0;text-align:left"><b class="pct">${esc(p.title)}</b><small class="mute">${esc(p.host||'')}${p.host?' · ':''}${p.episodes} ${tr('вып.','son')}</small></span>${ico('chev',18)}</button>`).join('')}</div>`
      :x.empty('headphones',tr('Подкастов пока нет','Hozircha podkastlar yo‘q'),tr('Скоро здесь появятся выпуски.','Tez orada bu yerda epizodlar paydo bo‘ladi.'))}</div></div>`};
  ACT.podReload=()=>{P.list=null;refresh()};
  ACT.podShow=async b=>{
    const id=b.dataset.id;
    if(A.id!==id){el.pause();A.id=id;A.eps=null;A.err=false;P.cur=null;go('podcast',{id});
      try{P.cur=await api('/api/podcasts/'+id);A.eps=P.cur.episodes;
        const p=pos()[id];A.speed=p&&p.speed||1;
        if(A.eps.length){const i=p&&p.ep<A.eps.length?p.ep:0;A.i=i;A.cur=p?p.t:0;A.dur=A.eps[i].duration||0;el.removeAttribute('src');mediaSession()}
      }catch(e){A.eps=[];toast(tr('Не удалось загрузить подкаст','Podkastni yuklab bo‘lmadi'))}
      if(onPod())refresh();
    }else go('podcast',{id});
  };
  SCREENS.podcast=({id})=>{
    const head=`<header class="topbar px"><button class="iconbtn" data-a="back" aria-label="${tr('Назад','Orqaga')}">${ico('back')}</button><div class="grow"><h2 class="display" style="font-size:22px">${tr('Подкаст','Podkast')}</h2></div></header>`;
    if(!P.cur||A.id!==id||A.eps===null)return head+`<div class="px"><div class="sk" style="height:260px;border-radius:20px"></div></div>`;
    const p=P.cur.podcast;
    if(!A.eps.length)return head+`<div class="px">${x.empty('headphones',tr('Выпусков пока нет','Hozircha epizodlar yo‘q'),'')}</div>`;
    const e=A.eps[A.i];
    return `${head}<div class="px aud"><div class="aud-cv pod-cv">${art(p,0)}</div><h1 class="display" style="font-size:22px;margin-top:18px">${esc(p.title)}</h1><div class="mute" style="font-size:13.5px">${esc(p.host||'')}</div>
      ${p.desc?`<p class="mute" style="font-size:13px;margin:10px 0 0;text-align:left">${esc(p.desc)}</p>`:''}
      <div class="aud-t">${esc(e.title)}</div>
      ${A.err?`<p class="err" style="text-align:center">${tr('Не удалось загрузить аудио. Проверьте соединение.','Audioni yuklab bo‘lmadi. Aloqani tekshiring.')}</p>`:''}
      <input id="pSeek" class="aud-seek" type="range" min="0" max="${Math.floor(A.dur||0)}" value="${Math.floor(A.cur)}" aria-label="${tr('Позиция','Joylashuv')}">
      <div class="aud-time mono"><span id="pCur">${fmt(A.cur)}</span><span id="pLeft">-${fmt(Math.max(0,A.dur-A.cur))}</span></div>
      <div class="aud-ctl"><button class="iconbtn" data-a="pPrev" aria-label="${tr('Назад','Orqaga')}">${ico('prev',24)}</button><button class="iconbtn" data-a="pSkip" data-d="-15" aria-label="-15">${ico('back15',26)}</button>
        <button id="pPlay" class="aud-play" data-a="pToggle" aria-label="${tr('Играть/пауза','Ijro/pauza')}">${ico(A.playing?'pause':'play',30)}</button>
        <button class="iconbtn" data-a="pSkip" data-d="30" aria-label="+30">${ico('fwd30',26)}</button><button class="iconbtn" data-a="pNext" aria-label="${tr('Вперёд','Oldinga')}" ${A.i>=A.eps.length-1?'disabled':''}>${ico('next',24)}</button></div>
      <div class="row" style="justify-content:center;margin-top:6px"><button class="chip" data-a="pSpeed" aria-label="${tr('Скорость','Tezlik')}"><span id="pSpd">${A.speed}×</span></button></div>
      <div class="list" style="margin-top:22px;text-align:left">${A.eps.map((x2,i)=>`<button class="li ${i===A.i&&A.playing?'on':''}" data-a="pEp" data-pe="${i}"><span class="grow" style="text-align:left">${i+1}. ${esc(x2.title)}</span><span class="mono mute">${x2.duration?fmt(x2.duration):''}</span></button>`).join('')}</div></div>`};

  /* ---------- administration ---------- */
  if(!adm)return;
  const {A:AD,M,T,bodies,loaders,confirmSheet,here}=adm;
  Object.assign(M,{pd_id:'',pd_title:'',pd_host:'',pd_lang:'ru',pd_cover:'',pd_desc:'',pd_eps:''});
  const ERR={title:'Укажите название',lang:'Язык: ru или uz',cover:'Обложка: ссылка должна начинаться с https://',url:'У каждого выпуска нужна ссылка, начинающаяся с https://'};
  const reloadAdmin=async()=>{try{AD.pods=(await api('/api/admin/podcasts')).podcasts}catch(e){AD.pods=AD.pods||[];toast('Не удалось загрузить подкасты')}if(here('admin'))refresh()};
  T.push(['podcasts','Подкасты']);loaders.podcasts=reloadAdmin;
  bodies.podcasts=()=>{
    if(!AD.pods)return adm.loading();
    return `<button class="btn block" data-a="pdNew">${ico('plus',18)} Новый подкаст</button>
      <p class="hint">Подкасты видны читателям в Каталоге → «Подкасты». Читатель видит подкаст, когда в нём есть хотя бы один выпуск.</p>
      <div class="sec"><div class="sec-h"><h2>Подкасты · ${AD.pods.length}</h2></div>${AD.pods.length?`<div class="list">${AD.pods.map(p=>`<div class="li" style="align-items:flex-start;flex-direction:column;gap:8px"><div class="row" style="width:100%;gap:12px;align-items:center">${art(p,48)}<div class="grow" style="min-width:0"><b style="font-size:14px">${esc(p.title)}</b>${p.hidden?' <span class="tag">скрыт</span>':''}<div class="mute" style="font-size:12.5px">${p.lang==='uz'?'Oʻzbekcha':'Русский'} · выпусков: ${p.episodes}${p.host?' · '+esc(p.host):''}</div></div></div>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-a="pdEps" data-id="${esc(p.id)}">Выпуски</button><button class="btn sm ghost" data-a="pdEdit" data-id="${esc(p.id)}">Править</button><button class="btn sm ghost" data-a="pdHide" data-id="${esc(p.id)}">${p.hidden?'Показать':'Скрыть'}</button><button class="btn sm ghost" data-a="pdDel" data-id="${esc(p.id)}">Удалить</button></div></div>`).join('')}</div>`:'<p class="mute">Подкастов пока нет. Нажмите «Новый подкаст».</p>'}</div>`};
  const podOf=id=>(AD.pods||[]).find(p=>p.id===id);
  const form=p=>{Object.assign(M,{pd_id:p?p.id:'',pd_title:p?p.title:'',pd_host:p?p.host:'',pd_lang:p?p.lang:'ru',pd_cover:p?p.cover:'',pd_desc:p?p.desc:''});
    openSheet(`<h2>${p?'Править подкаст':'Новый подкаст'}</h2>
      <div class="field"><label for="pdT">Название</label><input id="pdT" class="in" data-m="adm:pd_title" value="${esc(M.pd_title)}" maxlength="120" autocomplete="off"></div>
      <div class="field"><label for="pdH">Автор или ведущий</label><input id="pdH" class="in" data-m="adm:pd_host" value="${esc(M.pd_host)}" maxlength="120" autocomplete="off"></div>
      <div class="field"><label for="pdL">Язык подкаста</label><select id="pdL" class="in" data-chg="pdSel" data-k="pd_lang"><option value="ru" ${M.pd_lang==='ru'?'selected':''}>Русский</option><option value="uz" ${M.pd_lang==='uz'?'selected':''}>Oʻzbekcha</option></select></div>
      <div class="field"><label for="pdC">Обложка: ссылка https (необязательно)</label><input id="pdC" class="in" data-m="adm:pd_cover" value="${esc(M.pd_cover)}" inputmode="url" autocomplete="off" placeholder="https://…/cover.jpg"></div>
      <div class="field"><label for="pdD">Описание</label><textarea id="pdD" class="in" data-m="adm:pd_desc" maxlength="2000" style="min-height:90px">${esc(M.pd_desc)}</textarea></div>
      <button class="btn block" data-a="pdSave">Сохранить</button>`)};
  CHG.pdSel=e=>{M[e.dataset.k]=e.value};
  ACT.pdNew=()=>form(null);
  ACT.pdEdit=b=>form(podOf(b.dataset.id));
  ACT.pdSave=async()=>{
    if(!M.pd_title.trim()){toast(ERR.title);return}
    const body={title:M.pd_title,host:M.pd_host,lang:M.pd_lang,cover:M.pd_cover.trim(),desc:M.pd_desc,...(M.pd_id?{id:M.pd_id}:{})};
    try{const r=await api('/api/admin/podcasts','POST',body);closeSheet();toast('Сохранено');await reloadAdmin();P.list=null;if(!M.pd_id)ACT.pdEps({dataset:{id:r.podcast.id}})}
    catch(e){toast(ERR[e.detail]||'Не удалось сохранить')}};
  ACT.pdHide=async b=>{const p=podOf(b.dataset.id);if(!p)return;try{await api('/api/admin/podcasts','POST',{id:p.id,hidden:!p.hidden});P.list=null;await reloadAdmin();toast(p.hidden?'Подкаст показан':'Подкаст скрыт')}catch(e){toast('Не удалось изменить')}};
  ACT.pdDel=b=>confirmSheet('Удалить подкаст вместе с выпусками?','pdDelGo',b.dataset.id,'Удалить');
  ACT.pdDelGo=async b=>{closeSheet();try{await api(`/api/admin/podcasts/${b.dataset.id}/delete`,'POST',{});P.list=null;await reloadAdmin();toast('Подкаст удалён')}catch(e){toast('Не удалось удалить')}};
  ACT.pdEps=async b=>{
    const p=podOf(b.dataset.id);if(!p)return;
    try{const r=await api('/api/podcasts/'+p.id);M.pd_eps=r.episodes.map(e=>`${e.title} | ${e.url} | ${e.duration?fmt(e.duration):''}`.replace(/ \| $/,'')).join('\n')}catch(e){M.pd_eps=''}
    openSheet(`<h2>Выпуски: ${esc(p.title)}</h2><p class="mute" style="font-size:12.5px;margin-bottom:12px">Один выпуск в строке: <b>Название | https-ссылка на аудиофайл | длительность</b> (например 45:30 или секунды; можно не указывать). Порядок строк — порядок в приложении. Файлы должны быть ваши или с разрешением на распространение. Пустой список убирает все выпуски.</p>
      <div class="field"><textarea id="pdE" class="in" data-m="adm:pd_eps" style="min-height:180px;font-size:12.5px" placeholder="Выпуск 1. Знакомство | https://…/ep1.mp3 | 32:10">${esc(M.pd_eps)}</textarea></div><button class="btn block" data-a="pdEpsGo" data-id="${esc(p.id)}">Сохранить выпуски</button>`)};
  ACT.pdEpsGo=async b=>{
    const episodes=M.pd_eps.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{const [title,url,d]=l.split('|').map(s=>s.trim());return{title,url,duration:parseLen(d)}});
    try{await api(`/api/admin/podcasts/${b.dataset.id}/episodes`,'POST',{episodes});closeSheet();toast(episodes.length?`Сохранено выпусков: ${episodes.length}`:'Выпуски убраны');P.list=null;A.id=null;await reloadAdmin()}
    catch(e){toast(ERR[e.detail]||'Не удалось сохранить')}};
}
