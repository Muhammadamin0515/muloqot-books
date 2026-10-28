/* Audio retelling of a book. Readers listen to a short spoken retelling: the text is read aloud with the voice of their device (Web Speech API).
   Administrators generate it with AI, edit and publish it (Admin → Каталог → book → Пересказ). */
const RATES=[0.8,0.9,1,1.1,1.25,1.5];
const NAMES={ru:'Русский',uz:'Oʻzbekcha'};
const LCODE={ru:'ru-RU',uz:'uz-UZ'};
const paras=text=>String(text||'').split(/\n\s*\n/).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
/** utterances stay short: long ones are cut off by some mobile engines */
const chunks=p=>{const out=[];let cur='';for(const s of p.split(/(?<=[.!?…])\s+/)){if(cur&&(cur+' '+s).length>220){out.push(cur);cur=s}else cur=cur?cur+' '+s:s}if(cur)out.push(cur);return out.flatMap(c=>c.length<=260?[c]:c.match(/.{1,240}(\s|$)/g)||[c])};

export function initRetell(x,adm){
  const {SCREENS,ACT,go,api,toast,esc,ico,tr,refresh,NAV,save,book,openSheet,setSheet}=x;
  const S=()=>x.S,synth=typeof window!=='undefined'&&window.speechSynthesis;
  const R={id:null,list:null,lang:'ru',ps:[],i:0,playing:false,rate:1,run:0};
  let voices=[];const loadVoices=()=>{voices=synth?synth.getVoices():[]};
  if(synth){loadVoices();synth.addEventListener?.('voiceschanged',loadVoices)}
  const voiceFor=l=>voices.find(v=>String(v.lang||'').toLowerCase().replace('_','-').startsWith(l));
  const ui=(id,v)=>{const n=document.getElementById(id);if(n)n.textContent=v};
  const posKey=()=>R.id+':'+R.lang;
  const pos=()=>{const s=S();s.retellPos=s.retellPos||{};return s.retellPos};
  const onScreen=()=>NAV.cur&&NAV.cur.name==='retell';

  /* ---------- speech ---------- */
  function mark(){
    document.querySelectorAll('[data-rp]').forEach(n=>n.classList.toggle('on',+n.dataset.rp===R.i));
    ui('rtCount',`${R.i+1} / ${R.ps.length}`);
    const b=document.getElementById('rtPlay');if(b)b.innerHTML=ico(R.playing?'pause':'play',30);
    const cur=document.querySelector(`[data-rp="${R.i}"]`);if(cur&&R.playing)cur.scrollIntoView({block:'center',behavior:'smooth'});
  }
  function stop(){R.run++;R.playing=false;if(synth)synth.cancel();if(onScreen())mark()}
  function speak(i){
    if(!synth||i>=R.ps.length){R.playing=false;if(i>=R.ps.length)R.i=0;if(onScreen())mark();return}
    R.i=i;const my=++R.run,parts=chunks(R.ps[i]),v=voiceFor(R.lang);synth.cancel();
    pos()[posKey()]={i,ts:Date.now()};save();mark();
    parts.forEach((t,k)=>{const u=new SpeechSynthesisUtterance(t);u.lang=LCODE[R.lang];if(v)u.voice=v;u.rate=R.rate;
      u.onend=()=>{if(my===R.run&&k===parts.length-1&&R.playing)speak(i+1)};
      u.onerror=e=>{if(my===R.run&&e.error!=='canceled'&&e.error!=='interrupted'){R.playing=false;if(onScreen())refresh()}};
      synth.speak(u)});
  }
  ACT.rtToggle=()=>{if(!synth){toast(tr('Озвучка не поддерживается на этом устройстве','Bu qurilmada ovozli o‘qish qo‘llab-quvvatlanmaydi'));return}
    if(R.playing){stop();return}
    if(x.audioPause)x.audioPause();R.playing=true;speak(R.i)};
  ACT.rtSkip=b=>{const i=Math.max(0,Math.min(R.ps.length-1,R.i+ +b.dataset.d));R.i=i;if(R.playing)speak(i);else{pos()[posKey()]={i,ts:Date.now()};save();mark()}};
  ACT.rtPara=b=>{R.playing=true;if(x.audioPause)x.audioPause();speak(+b.dataset.rp)};
  ACT.rtRate=()=>{R.rate=RATES[(RATES.indexOf(R.rate)+1)%RATES.length];ui('rtRateV',R.rate+'×');if(R.playing)speak(R.i)};
  ACT.rtLang=b=>{if(R.lang===b.dataset.v)return;stop();setLang(b.dataset.v);refresh()};
  /* leaving the screen (back, tabs) stops the voice */
  setInterval(()=>{if(R.playing&&!onScreen())stop()},700);
  window.addEventListener('pagehide',()=>{if(synth)synth.cancel()});

  function setLang(l){R.lang=l;const r=R.list.find(z=>z.lang===l);R.ps=paras(r?r.text:'');const p=pos()[posKey()];R.i=p&&p.i<R.ps.length?p.i:0}
  ACT.retellOpen=async b=>{
    const id=b.dataset.id;if(R.id!==id){stop();R.id=id;R.list=null}
    go('retell',{id});
    if(!R.list){try{R.list=(await api(`/api/books/${id}/retelling`)).retellings}catch(e){R.list=[];toast(tr('Не удалось загрузить пересказ','Qayta hikoyani yuklab bo‘lmadi'))}
      const want=S().lang,pick=R.list.find(z=>z.lang===want)||R.list[0];if(pick)setLang(pick.lang);if(onScreen())refresh()}
  };
  SCREENS.retell=({id})=>{
    const bk=book(id),head=`<header class="topbar px"><button class="iconbtn" data-a="back" aria-label="${tr('Назад','Orqaga')}">${ico('back')}</button><div class="grow"><h2 class="display" style="font-size:22px">${tr('Пересказ','Qayta hikoya')}</h2></div></header>`;
    if(!bk)return '';
    if(R.list===null||R.id!==id)return head+`<div class="px"><div class="sk" style="height:200px;border-radius:20px"></div></div>`;
    if(!R.list.length)return head+`<div class="px">${x.empty('headphones',tr('Пересказа пока нет','Qayta hikoya hozircha yo‘q'),'')}</div>`;
    const noVoice=synth&&!voiceFor(R.lang);
    return `${head}<div class="px aud"><h1 class="display" style="font-size:22px">${esc(bk.title)}</h1>
      ${R.list.length>1?`<div class="seg" style="margin-top:12px">${R.list.map(r=>`<button class="${R.lang===r.lang?'on':''}" data-a="rtLang" data-v="${r.lang}">${NAMES[r.lang]}</button>`).join('')}</div>`:''}
      ${!synth?`<p class="err" style="margin-top:12px">${tr('На этом устройстве нет озвучки. Можно прочитать текст ниже.','Bu qurilmada ovozli o‘qish yo‘q. Quyidagi matnni o‘qishingiz mumkin.')}</p>`
        :noVoice?`<p class="hint" style="margin-top:12px">${tr('На устройстве может не быть голоса для этого языка: тогда звучание будет неточным. Голос добавляется в настройках телефона (Язык и речь).','Qurilmada bu til uchun ovoz bo‘lmasligi mumkin, shunda talaffuz noaniq bo‘ladi. Ovozni telefon sozlamalaridan qo‘shing.')}</p>`:''}
      <div class="aud-time mono" style="justify-content:center;margin-top:14px"><span id="rtCount">${R.i+1} / ${R.ps.length}</span></div>
      <div class="aud-ctl"><button class="iconbtn" data-a="rtSkip" data-d="-1" aria-label="${tr('Назад','Orqaga')}">${ico('prev',24)}</button><button id="rtPlay" class="aud-play" data-a="rtToggle" aria-label="${tr('Играть/пауза','Ijro/pauza')}">${ico(R.playing?'pause':'play',30)}</button><button class="iconbtn" data-a="rtSkip" data-d="1" aria-label="${tr('Вперёд','Oldinga')}">${ico('next',24)}</button></div>
      <div class="row" style="justify-content:center;margin-top:6px"><button class="chip" data-a="rtRate" aria-label="${tr('Скорость','Tezlik')}"><span id="rtRateV">${R.rate}×</span></button></div>
      <div class="rt-text">${R.ps.map((p,i)=>`<p class="rt-p ${i===R.i?'on':''}" data-a="rtPara" data-rp="${i}">${esc(p)}</p>`).join('')}</div></div>`};

  /* ---------- administration (button "Пересказ" in the catalog list) ---------- */
  if(!adm)return;
  const {M}=adm;
  const G={id:null,list:[],busy:null,err:''};
  Object.assign(M,{rt_ru:'',rt_uz:''});
  const ERR={rights_required:'Пересказ можно делать только для книг с подтверждёнными правами на текст',no_text:'У книги нет текста',no_file:'Текст книги не загружен',no_models:'Не настроены модели ИИ: добавьте ключи и модели в «Настройки → ИИ»',ai_failed:'ИИ не ответил (лимит или сбой). Подождите минуту и нажмите «Продолжить»',short:'Текст слишком короткий (меньше 200 знаков)',generating:'Идёт создание: дождитесь окончания'};
  const errOf=e=>{const b=(e&&e.body)||{};return (ERR[b.error]||ERR[e&&e.detail]||'Не удалось выполнить')+(b.detail&&b.error==='ai_failed'?` (${b.detail})`:'')};
  const of=l=>G.list.find(r=>r.lang===l);
  const STATUS={generating:'создаётся',draft:'черновик',published:'опубликован'};
  const card=l=>{
    const r=of(l),busy=G.busy===l;
    const head=`<div class="row" style="justify-content:space-between;align-items:center"><b>${NAMES[l]}</b><span class="tag ${r&&r.status==='published'?'acc':''}">${r?STATUS[r.status]:'нет'}</span></div>`;
    if(!r)return `<div class="card" style="margin-bottom:12px">${head}<button class="btn block" style="margin-top:10px" data-a="rtGen" data-l="${l}" ${G.busy?'disabled':''}>Создать пересказ с помощью ИИ</button></div>`;
    if(r.status==='generating')return `<div class="card" style="margin-bottom:12px">${head}<p class="mute" style="font-size:13px;margin:10px 0 6px">${busy?'Идёт работа, не закрывайте окно':'Создание остановлено'}: ${r.progress<r.total-1?`глава ${r.progress+1} из ${r.total-1}`:'пишется итоговый текст'}</p><div class="bar"><i style="width:${Math.round(r.progress/r.total*100)}%"></i></div>${busy?'':`<button class="btn block" style="margin-top:10px" data-a="rtGen" data-l="${l}" data-resume="1">Продолжить</button>`}</div>`;
    return `<div class="card" style="margin-bottom:12px">${head}<textarea id="rt_${l}" class="in" data-m="adm:rt_${l}" style="min-height:220px;margin-top:10px;font-size:13px;line-height:1.5">${esc(M['rt_'+l])}</textarea>
      <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn sm ghost" data-a="rtSave" data-l="${l}" data-st="draft">Сохранить черновик</button><button class="btn sm" data-a="rtSave" data-l="${l}" data-st="published">${r.status==='published'?'Сохранить и оставить':'Опубликовать'}</button>${r.status==='published'?`<button class="btn sm ghost" data-a="rtSave" data-l="${l}" data-st="draft">Снять с публикации</button>`:''}<button class="btn sm ghost" data-a="rtGen" data-l="${l}" data-restart="1" ${G.busy?'disabled':''}>Создать заново</button><button class="btn sm ghost" data-a="rtDel" data-l="${l}">Удалить</button></div></div>`};
  const sheet=()=>`<h2>Пересказ: ${esc((book(G.id)||{}).title||'')}</h2><p class="mute" style="font-size:12.5px;margin-bottom:12px">ИИ перескажет главы и напишет связный текст для озвучки. Прочитайте, поправьте и опубликуйте: читатели услышат его голосом своего телефона. Создание занимает несколько минут: по одному вызову ИИ на главу.</p>${G.err?`<div class="demo-banner" style="margin-bottom:12px"><b>${esc(G.err)}</b></div>`:''}${card('ru')}${card('uz')}`;
  const draw=()=>{const s=document.getElementById('sheet');if(s&&s.classList.contains('on')&&G.id)setSheet(sheet())};
  ACT.ciRetell=async b=>{
    G.id=b.dataset.id;G.err='';G.busy=null;M.rt_ru='';M.rt_uz='';
    openSheet('<div class="sk" style="height:160px;border-radius:16px"></div>');
    try{const r=await api(`/api/admin/books/${G.id}/retelling`);G.list=r.retellings;for(const z of G.list)M['rt_'+z.lang]=z.text}catch(e){G.list=[];G.err=errOf(e)}
    setSheet(sheet())};
  ACT.rtGen=async b=>{
    const l=b.dataset.l;if(G.busy)return;G.err='';G.busy=l;
    try{
      const r=await api(`/api/admin/books/${G.id}/retelling/start`,'POST',{lang:l,restart:!!b.dataset.restart});M['rt_'+l]='';
      G.list=[...G.list.filter(z=>z.lang!==l),r.retelling];draw();
      let cur=r.retelling;
      for(let n=0;n<400&&cur.status==='generating';n++){
        let s;try{s=await api(`/api/admin/books/${G.id}/retelling/step`,'POST',{lang:l})}catch(e){G.err=errOf(e);break}
        cur=s.retelling;G.list=[...G.list.filter(z=>z.lang!==l),cur];draw()}
      if(cur.status!=='generating')M['rt_'+l]=cur.text;
    }catch(e){G.err=errOf(e)}
    G.busy=null;draw()};
  ACT.rtSave=async b=>{
    const l=b.dataset.l,st=b.dataset.st;
    try{const r=await api(`/api/admin/books/${G.id}/retelling`,'PUT',{lang:l,text:M['rt_'+l],status:st});G.list=[...G.list.filter(z=>z.lang!==l),r.retelling];await x.loadBoot();toast(st==='published'?'Опубликовано':'Сохранено');draw()}
    catch(e){G.err=errOf(e);draw()}};
  ACT.rtDel=async b=>{const l=b.dataset.l;try{await api(`/api/admin/books/${G.id}/retelling/delete`,'POST',{lang:l});G.list=G.list.filter(z=>z.lang!==l);M['rt_'+l]='';await x.loadBoot();draw()}catch(e){G.err=errOf(e);draw()}};
}
