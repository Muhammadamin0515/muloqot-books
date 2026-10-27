/* Achievements for readers and authors. The server decides what is unlocked; this module shows it and announces new ones. */
export function initAchievements(x){
  const {SCREENS,ACT,go,api,net,toast,esc,ico,tr,refresh,NAV,L,tg}=x;
  const A={data:null,tab:'reader',err:false};
  let timer,busy=false;
  const date=ts=>new Date(ts).toLocaleDateString(x.S.lang==='uz'?'uz-UZ':'ru-RU',{day:'numeric',month:'long'});

  /* Ask the server whether anything was unlocked just now. Debounced so the reading/review state has time to sync first. */
  x.checkAch=(delay=3200)=>{
    if(!net.online)return;clearTimeout(timer);
    timer=setTimeout(async()=>{
      if(busy)return;busy=true;
      try{
        const {fresh}=await api('/api/achievements?mode=check');
        if(fresh&&fresh.length){
          A.data=null;
          const a=fresh[0];
          toast('🏆 '+tr('Достижение: ','Yutuq: ')+L(a.title)+(fresh.length>1?' +'+(fresh.length-1):''));
          try{tg.notify("success")}catch(e){}
        }
      }catch(e){}
      busy=false;
    },delay);
  };

  const load=async()=>{
    try{A.data=await api('/api/achievements');A.err=false}catch(e){A.err=true}
    if(NAV.cur.name==='achievements')refresh();
  };
  ACT.openAch=()=>{A.data=null;A.err=false;go('achievements');load()};

  const badge=a=>{
    const pct=Math.round(a.current/a.target*100);
    return `<div class="ach ${a.unlocked?'got':''}">
      <div class="ach-i">${ico(a.icon,26)}</div>
      <b>${esc(L(a.title))}${a.isNew?` <span class="tag acc">${tr('новое','yangi')}</span>`:''}</b>
      <span class="ach-d">${esc(L(a.desc))}</span>
      ${a.unlocked?`<small class="ach-t">${a.ts?date(a.ts):''}</small>`:`<div class="bar ach-b"><i style="width:${pct}%"></i></div><small class="ach-t">${a.current} / ${a.target}</small>`}
    </div>`;
  };

  SCREENS.achievements=()=>{
    const head=`<header class="topbar px"><button class="iconbtn" data-a="back" aria-label="${tr('Назад','Orqaga')}">${ico('back')}</button><div class="grow"><h2 class="display" style="font-size:22px">${tr('Достижения','Yutuqlar')}</h2></div></header>`;
    if(A.err)return head+`<div class="px">${x.empty('info',tr('Не удалось загрузить','Yuklab bo‘lmadi'),tr('Достижения доступны при подключении к интернету.','Yutuqlar internet bilan ishlaydi.'),`<button class="btn" data-a="openAch">${tr('Повторить','Qayta urinish')}</button>`)}</div>`;
    if(!A.data)return head+`<div class="px"><div class="sk" style="height:110px;border-radius:20px;margin-bottom:14px"></div><div class="sk" style="height:220px;border-radius:20px"></div></div>`;
    const list=A.data.list,mine=list.filter(a=>a.group===A.tab),got=list.filter(a=>a.unlocked).length;
    const mg=mine.filter(a=>a.unlocked).length;
    return `${head}<div class="px">
      <div class="card ach-sum"><div class="ach-big">${got}<small> / ${list.length}</small></div><div class="grow"><b>${tr('Открыто достижений','Ochilgan yutuqlar')}</b><div class="bar" style="margin-top:8px"><i style="width:${Math.round(got/list.length*100)}%"></i></div></div></div>
      <div class="seg" style="margin:16px 0"><button class="${A.tab==='reader'?'on':''}" data-a="achTab" data-v="reader">${tr('Читатель','O‘quvchi')}</button><button class="${A.tab==='author'?'on':''}" data-a="achTab" data-v="author">${tr('Автор','Muallif')}</button></div>
      <div class="mute" style="font-size:12.5px;margin-bottom:12px">${mg} ${tr('из','/')} ${mine.length}</div>
      <div class="ach-grid">${mine.map(badge).join('')}</div>
      ${A.tab==='author'&&!mine.some(a=>a.unlocked)?`<button class="btn block" style="margin-top:18px" data-a="openStudio">${ico('pen',18)} ${tr('Опубликовать книгу','Kitob nashr etish')}</button>`:''}
    </div>`;
  };
  ACT.achTab=el=>{A.tab=el.dataset.v;refresh()};
}
