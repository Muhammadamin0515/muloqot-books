/* Admin panel + support chat. Wired into the app through initAdmin(ctx); all data comes from /api/admin/*. */
export function initAdmin(x){
  const {SCREENS,ACT,CHG,FORMS,AFTER,MODEL,go,api,toast,esc,ico,openSheet,closeSheet,setSheet,empty,avatar,NAV,$,BOOKS,COLLECTIONS,WEEKLY,loadBoot,tr}=x;
  const M=MODEL.adm={bcText:'',uq:'',chatText:'',supText:'',wq_book:'',wq_ru:'',wq_uz:'',eb_title:'',eb_desc:'',col_ru:'',col_uz:'',admId:'',rejNote:'',stopwords:'',welcome:'',welcomeUz:'',appLink:''};
  const A={tab:'overview',fresh:{},stats:null,bc:null,run:null,subs:null,inbox:null,users:null,adbooks:null,chat:{uid:null,name:'',msgs:[]},sup:{msgs:[]},col:null,editId:null};
  const here=n=>NAV.cur.name===n;
  const bg=p=>p.catch(()=>toast('Ошибка запроса'));
  const T=[['overview','Обзор'],['broadcast','Рассылка'],['moderation','Модерация'],['reports','Жалобы'],['chat','Чат'],['users','Люди'],['content','Контент']];
  const ago=ms=>{if(!ms)return 'никогда';const m=Math.floor((Date.now()-ms)/6e4);if(m<2)return 'сейчас';if(m<60)return m+' мин назад';const h=Math.floor(m/60);if(h<24)return h+' ч назад';return Math.floor(h/24)+' дн. назад'};
  const hm=ms=>new Date(ms).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  const loading=()=>`<div class="sk" style="height:90px;border-radius:16px;margin-bottom:12px"></div><div class="sk" style="height:90px;border-radius:16px"></div>`;
  const badge=n=>n?`<span class="badge">${n}</span>`:'';
  const confirmSheet=(msg,act,id,label='Подтвердить')=>openSheet(`<h2>${esc(msg)}</h2><div class="row" style="gap:10px"><button class="btn ghost grow" data-a="closeSheet">Отмена</button><button class="btn grow" data-a="${act}" data-id="${esc(id)}">${label}</button></div>`);

  /* ---------- loading per tab ---------- */
  async function load(key,fn){try{A[key]=await fn()}catch(e){toast('Не удалось загрузить: '+(e.detail||e.status||'сеть'))}if(here('admin'))x.refresh()}
  const loaders={
    overview:()=>load('stats',()=>api('/api/admin/stats')),
    broadcast:()=>Promise.all([load('bc',()=>api('/api/admin/broadcasts')),A.stats?0:load('stats',()=>api('/api/admin/stats'))]),
    moderation:()=>load('subs',()=>api('/api/admin/submissions')),
    reports:()=>load('reps',()=>api('/api/admin/reports')).then(()=>{if(A.reps)M.stopwords=A.reps.stopwords.join(', ')}),
    chat:()=>load('inbox',()=>api('/api/admin/support')),
    users:()=>load('users',()=>api('/api/admin/users?q='+encodeURIComponent(M.uq))),
    content:()=>{api('/api/admin/welcome').then(w=>{M.welcome=w.text;M.welcomeUz=w.textUz;M.appLink=w.appLink;if(here('admin')&&A.tab==='content')x.refresh()}).catch(()=>{});M.wq_book=WEEKLY.bookId;M.wq_ru=WEEKLY.q.ru||'';M.wq_uz=WEEKLY.q.uz||'';return load('adbooks',()=>api('/api/admin/books'))}
  };
  const bodies={overview:tabOverview,broadcast:tabBroadcast,moderation:tabModeration,reports:tabReports,chat:tabChat,users:tabUsers,content:tabContent};
  AFTER.admin=()=>{
    if(!A.fresh.stats){A.fresh.stats=true;api('/api/admin/stats').then(s=>{A.stats=s;if(here('admin'))x.refresh()}).catch(()=>{})}
    if(!A.fresh[A.tab]){A.fresh[A.tab]=true;loaders[A.tab]()}
  };
  const reload=k=>{A.fresh[k]=false;x.refresh()};

  /* ---------- screen ---------- */
  SCREENS.admin=()=>{
    const s=A.stats||{};
    const tabs=T.map(([k,n])=>`<button class="chip ${A.tab===k?'on':''}" data-a="admTab" data-v="${k}">${n}${k==='moderation'?badge(s.pending):k==='reports'?badge(s.reports):k==='chat'?badge(s.supportUnread):''}</button>`).join('');
    const body=bodies[A.tab]();
    return `<header class="topbar px"><button class="iconbtn" data-a="back" aria-label="Назад">${ico('back')}</button><div class="grow"><h2 class="display" style="font-size:22px">Админ-панель</h2></div></header>
    <div class="hs px" style="margin-top:4px">${tabs}</div><div class="px" style="margin-top:18px">${body}</div>`;
  };
  ACT.openAdmin=()=>{A.fresh={};A.tab='overview';go('admin')};
  ACT.admTab=el=>{A.tab=el.dataset.v;A.fresh[A.tab]=false;x.refresh();$('#screen').scrollTop=0};

  /* ---------- overview ---------- */
  function tabOverview(){
    const s=A.stats;if(!s)return loading();
    const cards=[[s.users,'Пользователей'],[s.new24,'Новых за сутки'],[s.new7,'Новых за неделю'],[s.active24,'Активны за сутки'],[s.active7,'Активны за неделю'],[s.reachable,'Доступны боту'],[s.books,'Книг'],[s.reviews,'Отзывов'],[s.threads,'Обсуждений']];
    const max=Math.max(1,...s.signups.map(d=>d.n));
    const alerts=[s.pending?`<button class="li card" style="margin-bottom:10px" data-a="admTab" data-v="moderation"><div class="grow"><b>Заявок на проверке: ${s.pending}</b></div>${ico('chev',18)}</button>`:'',s.reports?`<button class="li card" style="margin-bottom:10px" data-a="admTab" data-v="reports"><div class="grow"><b>Жалоб на проверке: ${s.reports}</b></div>${ico('chev',18)}</button>`:'',s.supportUnread?`<button class="li card" style="margin-bottom:10px" data-a="admTab" data-v="chat"><div class="grow"><b>Непрочитанных диалогов: ${s.supportUnread}</b></div>${ico('chev',18)}</button>`:''].join('');
    return `${alerts}<div class="stat3" style="grid-template-columns:repeat(3,1fr)">${cards.map(([n,l])=>`<div><b>${n}</b><small>${l}</small></div>`).join('')}</div>
    <div class="card" style="margin-top:16px"><div class="lbl" style="margin-bottom:12px">Новые пользователи за 14 дней</div>${s.signups.length?`<div class="bars">${s.signups.map(d=>`<div><i style="height:${Math.max(6,d.n/max*100)}%"></i><small>${d.n}</small><em>${esc(d.d.slice(8))}</em></div>`).join('')}</div>`:'<p class="mute">Пока нет данных</p>'}</div>
    ${s.top&&s.top.length?`<div class="card" style="margin-top:16px"><div class="lbl" style="margin-bottom:10px">Популярные книги за неделю</div>${s.top.map(b=>`<div class="row" style="justify-content:space-between;gap:8px;padding:6px 0"><span style="font-size:14px">${esc(b.title)}</span><span class="mute mono" style="font-size:12px;white-space:nowrap">👁 ${b.views} · 📖 ${b.reads} · ✅ ${b.finishes}</span></div>`).join('')}</div>`:''}
    ${s.errors&&s.errors.length?`<div class="demo-banner" style="margin-top:14px;flex-direction:column"><b>Часть данных не загрузилась</b>${s.errors.map(e=>`<span>${esc(e)}</span>`).join('')}</div>`:''}
    <p class="mute" style="font-size:12.5px;margin-top:14px">Заблокировано: ${s.banned} · Остановили бота: ${s.blocked} · Скрытых книг: ${s.hidden} · Комментариев: ${s.comments}</p>`;
  }

  /* ---------- broadcast ---------- */
  function tabBroadcast(){
    if(!A.bc)return loading();
    const r=A.run,reach=A.stats?A.stats.reachable:'…';
    const prog=r?`<div class="card" style="margin-bottom:14px"><b>Идёт рассылка…</b><div class="bar" style="margin:12px 0 8px"><i id="bcBar" style="width:${r.total?Math.round((r.sent+r.failed)/r.total*100):0}%"></i></div><span id="bcTxt" class="mute" style="font-size:13px">Отправлено ${r.sent} из ${r.total}, ошибок ${r.failed}</span></div>`:'';
    return `${A.bc.bot?'':'<div class="demo-banner">Бот не подключён: добавьте секрет BOT_TOKEN в настройках Worker, и рассылка заработает.</div>'}${prog}
    <div class="field"><label for="bcText">Текст сообщения</label><textarea id="bcText" class="in" data-m="adm:bcText" maxlength="3500" placeholder="Что хотите сообщить читателям?" style="min-height:150px">${esc(M.bcText)}</textarea></div>
    <div class="row" style="gap:10px"><button class="btn ghost grow" data-a="bcTest" ${r?'disabled':''}>Тест себе</button><button class="btn grow" data-a="bcAll" ${r?'disabled':''}>Отправить всем (${reach})</button></div>
    <p class="mute" style="font-size:12px;margin-top:10px">Получат только те, кто открывал бота и не блокировал его. К сообщению добавляется кнопка открытия приложения.</p>
    <div class="sec"><div class="sec-h"><h2>История</h2></div>${A.bc.list.length?`<div class="list">${A.bc.list.map(b=>`<div class="li" style="align-items:flex-start;flex-direction:column;gap:4px"><div class="row" style="width:100%;justify-content:space-between"><b style="font-size:13px">${hm(b.created)}</b><span class="status ${b.status==='done'?'m':''}">${{done:'Отправлена',running:'Идёт',cancelled:'Отменена'}[b.status]||b.status}${b.audience==='test'?' · тест':''}</span></div><span style="font-size:13.5px">${esc(b.text.slice(0,140))}</span><span class="mute" style="font-size:12px">${b.sent} доставлено · ${b.failed} ошибок · из ${b.total}</span></div>`).join('')}</div>`:'<p class="mute">Рассылок ещё не было</p>'}</div>`;
  }
  const paintProg=()=>{const r=A.run;if(!r)return;const b=$('#bcBar'),t=$('#bcTxt');if(b)b.style.width=(r.total?Math.round((r.sent+r.failed)/r.total*100):0)+'%';if(t)t.textContent=`Отправлено ${r.sent} из ${r.total}, ошибок ${r.failed}`};
  async function runBc(b){
    A.run=b;if(here('admin'))x.refresh();
    while(A.run&&A.run.status==='running'){try{A.run=(await api(`/api/admin/broadcasts/${b.id}/step`,'POST',{})).broadcast}catch(e){toast('Сбой отправки, нажмите ещё раз');break}paintProg()}
    const d=A.run;A.run=null;if(d)toast(`Готово: ${d.sent} доставлено, ${d.failed} ошибок`);A.fresh.stats=false;A.fresh.broadcast=false;if(here('admin'))x.refresh();
  }
  const bcStart=audience=>{if(M.bcText.trim().length<2){toast('Введите текст');return}closeSheet();bg(api('/api/admin/broadcasts','POST',{text:M.bcText,audience}).then(r=>runBc(r.broadcast)))};
  ACT.bcTest=()=>bcStart('test');
  ACT.bcAll=()=>{if(M.bcText.trim().length<2){toast('Введите текст');return}confirmSheet(`Отправить ${A.stats?A.stats.reachable:''} пользователям?`,'bcAllGo','','Отправить')};
  ACT.bcAllGo=()=>bcStart('all');

  /* ---------- moderation ---------- */
  function tabModeration(){
    if(!A.subs)return loading();
    if(!A.subs.length)return empty('check','Заявок нет','Новые книги от авторов появятся здесь.');
    return A.subs.map(s=>s.update?`<div class="card" style="margin-bottom:12px;border-color:var(--acc)"><span class="tag acc">↻ Обновление текста</span><b style="display:block;margin-top:8px">${esc(s.title)}</b><div class="mute" style="font-size:12.5px;margin:4px 0 8px">${esc(s.author)}</div>
      ${s.update?`<div class="stat3" style="margin:10px 0"><div><b>${s.update.oldChapters}→${s.update.newChapters}</b><small>Глав</small></div><div><b>${Math.round(s.update.oldChars/1000)}k→${Math.round(s.chars/1000)}k</b><small>Знаков</small></div><div><b>${s.chars>=s.update.oldChars?'+':''}${Math.round((s.chars-s.update.oldChars)/1000)}k</b><small>Разница</small></div></div>`:''}
      ${s.update&&s.update.note?`<p style="font-size:13.5px;margin-bottom:10px">«${esc(s.update.note)}»</p>`:''}
      <details style="margin-bottom:12px"><summary class="mute" style="font-size:13px;cursor:pointer">Начало нового текста</summary><p class="syn" style="font-size:13.5px;margin-top:8px;white-space:pre-wrap">${esc(s.preview)}…</p></details>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-a="subApprove" data-id="${esc(s.id)}">Заменить текст</button><button class="btn sm ghost" data-a="subReject" data-id="${esc(s.id)}">Отклонить</button><button class="btn sm ghost" data-a="openChatWith" data-id="${esc(s.userId)}">Написать</button></div></div>`
    :`<div class="card" style="margin-bottom:12px"><b>${esc(s.title)}</b><div class="mute" style="font-size:12.5px;margin:4px 0 8px">${esc(s.author)} · ${s.lang.toUpperCase()} · ${x.gl(s.genre)} · ${Math.round(s.chars/1000)}k знаков</div><p style="font-size:13.5px;margin-bottom:10px">${esc(s.desc)}</p>
      <details style="margin-bottom:12px"><summary class="mute" style="font-size:13px;cursor:pointer">Начало текста</summary><p class="syn" style="font-size:13.5px;margin-top:8px;white-space:pre-wrap">${esc(s.preview)}…</p></details>
      <div class="row" style="gap:8px"><button class="btn sm" data-a="subApprove" data-id="${esc(s.id)}">Опубликовать</button><button class="btn sm ghost" data-a="subReject" data-id="${esc(s.id)}">Отклонить</button><button class="btn sm ghost" data-a="openChatWith" data-id="${esc(s.userId)}">Написать</button></div></div>`).join('');
  }
  ACT.subApprove=el=>{el.disabled=true;bg(api(`/api/admin/submissions/${el.dataset.id}/approve`,'POST',{}).then(async()=>{toast('Книга опубликована');await loadBoot();A.fresh.stats=false;reload('moderation')}))};
  ACT.subReject=el=>{M.rejNote='';openSheet(`<h2>Отклонить заявку</h2><div class="field"><label for="rejNote">Причина (увидит автор)</label><textarea id="rejNote" class="in" data-m="adm:rejNote" placeholder="Например: слишком короткий текст"></textarea></div><button class="btn block" data-a="subRejectGo" data-id="${esc(el.dataset.id)}">Отклонить</button>`)};
  ACT.subRejectGo=el=>{closeSheet();bg(api(`/api/admin/submissions/${el.dataset.id}/reject`,'POST',{note:M.rejNote}).then(()=>{toast('Заявка отклонена');A.fresh.stats=false;reload('moderation')}))};


  /* ---------- reports ---------- */
  const KIND={review:'Отзыв',thread:'Тема',comment:'Комментарий'},WHY={spam:'Спам',abuse:'Оскорбления',inappropriate:'Неприемлемое',other:'Другое'};
  function tabReports(){
    const r=A.reps;if(!r)return loading();
    const list=r.list.length?r.list.map(g=>`<div class="card" style="margin-bottom:12px"><div class="row" style="justify-content:space-between;gap:8px"><b style="font-size:14px">${KIND[g.kind]} · жалоб: ${g.count}</b>${g.hidden?'<span class="tag">скрыто</span>':''}</div>
      <div class="row" style="gap:6px;flex-wrap:wrap;margin:8px 0">${Object.entries(g.reasons).map(([k,n])=>`<span class="tag">${WHY[k]||k}: ${n}</span>`).join('')}</div>
      ${g.gone?'<p class="mute">Контент уже удалён</p>':`<p class="mute" style="font-size:12px;margin-bottom:4px">Автор: ${esc(g.author||'—')}</p><p style="font-size:14px;margin-bottom:12px;white-space:pre-wrap">${esc(g.text)}</p>`}
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-a="repKeep" data-id="${esc(g.kind+'|'+g.target)}">Оставить</button>${g.gone?'':`<button class="btn sm ghost" data-a="repDel" data-id="${esc(g.kind+'|'+g.target)}">Удалить</button><button class="btn sm ghost" data-a="repBan" data-id="${esc(g.kind+'|'+g.target)}">Удалить и заблокировать автора</button>`}</div></div>`).join(''):empty('check','Жалоб нет','Если читатели пожалуются на отзыв, тему или комментарий, они появятся здесь. После трёх жалоб контент скрывается автоматически.');
    return `${list}<div class="sec"><div class="sec-h"><h2>Стоп-слова</h2></div><div class="card"><p class="hint" style="margin:0 0 10px">Сообщения с этими словами не публикуются. Перечислите через запятую. Ссылки и повторы одного и того же сообщения блокируются автоматически, чаще 6 сообщений в минуту писать нельзя.</p><textarea id="stw" class="in" data-m="adm:stopwords" style="min-height:90px" placeholder="слово1, слово2">${esc(M.stopwords)}</textarea><button class="btn block" style="margin-top:12px" data-a="stwSave">Сохранить</button></div></div>`;
  }
  const resolve=(id,action,msg)=>{const [kind,target]=id.split('|');bg(api('/api/admin/reports/resolve','POST',{kind,target,action}).then(async()=>{toast(msg);A.fresh.stats=false;await x.loadBoot();reload('reports')}))};
  ACT.repKeep=el=>resolve(el.dataset.id,'keep','Оставлено');
  ACT.repDel=el=>confirmSheet('Удалить этот контент?','repDelGo',el.dataset.id,'Удалить');
  ACT.repDelGo=el=>{closeSheet();resolve(el.dataset.id,'delete','Удалено')};
  ACT.repBan=el=>confirmSheet('Удалить контент и заблокировать автора?','repBanGo',el.dataset.id,'Удалить и заблокировать');
  ACT.repBanGo=el=>{closeSheet();resolve(el.dataset.id,'ban','Удалено, автор заблокирован')};
  ACT.stwSave=()=>bg(api('/api/admin/stopwords','POST',{list:M.stopwords.split(/[,\n]/)}).then(()=>toast('Сохранено')));

  /* ---------- chat (shared view) ---------- */
  const bubbles=msgs=>msgs.length?msgs.map(m=>`<div class="bubble ${m.mine?'me':'them'}">${esc(m.text)}<small>${hm(m.at)}</small></div>`).join(''):'<p class="mute" style="text-align:center;margin:30px 0">Сообщений пока нет</p>';
  const chatForm=(name,model,ph)=>`<form class="chatform" data-f="${name}"><input id="chatIn" class="in" name="t" data-m="adm:${model}" value="${esc(M[model])}" placeholder="${ph}" autocomplete="off" maxlength="2000"><button class="roundgo" style="width:46px;height:46px" aria-label="Отправить">${ico('send',20)}</button></form>`;
  let pollT=0;
  function poll(screen,fetchFn,get,set){
    clearInterval(pollT);
    pollT=setInterval(async()=>{
      if(!here(screen)){clearInterval(pollT);return}
      try{const r=await fetchFn();const old=get();if(r.messages.length!==old.length||(r.messages.at(-1)||{}).id!==(old.at(-1)||{}).id){const f=document.activeElement&&document.activeElement.id==='chatIn';set(r);x.refresh();if(f){const i=$('#chatIn');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}}}}catch(e){}
    },6000);
  }
  const toBottom=()=>{const sc=$('#screen');if(sc)sc.scrollTop=sc.scrollHeight};

  function tabChat(){
    if(!A.inbox)return loading();
    if(!A.inbox.list.length)return empty('chat','Сообщений нет','Когда пользователь напишет в поддержку, диалог появится здесь.');
    return `<div class="list">${A.inbox.list.map(c=>`<button class="li" data-a="openChatWith" data-id="${esc(c.userId)}">${avatar(c.name,1)}<div class="grow" style="min-width:0"><b style="font-size:14px">${esc(c.name)}</b><div class="mute" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.last)}</div></div><div style="text-align:right"><small class="mute">${ago(c.at)}</small><div>${badge(c.unread)}</div></div></button>`).join('')}</div>`;
  }
  ACT.openChatWith=async el=>{closeSheet();A.chat={uid:el.dataset.id,name:'',msgs:[]};M.chatText='';go('adminchat');
    try{const r=await api('/api/admin/support/'+encodeURIComponent(A.chat.uid));A.chat.name=r.name;A.chat.msgs=r.messages;A.fresh.stats=false;if(here('adminchat')){x.refresh();toBottom()}}catch(e){toast('Не удалось открыть диалог')}};
  SCREENS.adminchat=()=>`<header class="topbar px"><button class="iconbtn" data-a="back" aria-label="Назад">${ico('back')}</button><div class="grow"><h2 class="display" style="font-size:20px">${esc(A.chat.name||'Диалог')}</h2><span class="mute" style="font-size:12px">ID ${esc(A.chat.uid||'')}</span></div></header><div class="px chatbox">${bubbles(A.chat.msgs)}</div>${chatForm('adChatSend','chatText','Ответ…')}`;
  AFTER.adminchat=()=>{toBottom();poll('adminchat',()=>api('/api/admin/support/'+encodeURIComponent(A.chat.uid)),()=>A.chat.msgs,r=>{A.chat.msgs=r.messages;A.chat.name=r.name})};
  FORMS.adChatSend=f=>{const v=f.t.value.trim();if(!v)return;M.chatText='';f.t.value='';
    bg(api('/api/admin/support/'+encodeURIComponent(A.chat.uid),'POST',{text:v}).then(async()=>{const r=await api('/api/admin/support/'+encodeURIComponent(A.chat.uid));A.chat.msgs=r.messages;x.refresh();toBottom();$('#chatIn')&&$('#chatIn').focus()}))};

  /* user-side support */
  SCREENS.support=()=>`<header class="topbar px"><button class="iconbtn" data-a="back" aria-label="${tr('Назад','Orqaga')}">${ico('back')}</button><div class="grow"><h2 class="display" style="font-size:22px">${tr('Поддержка','Yordam')}</h2></div></header><div class="px chatbox"><p class="mute" style="font-size:13px;margin-bottom:14px">${tr('Напишите нам: вопрос, ошибка или предложение. Ответ придёт сюда и в бота.','Bizga yozing: savol, xato yoki taklif. Javob shu yerga va botga keladi.')}</p>${bubbles(A.sup.msgs)}</div>${chatForm('supSend','supText',tr('Сообщение…','Xabar…'))}`;
  ACT.openSupport=async()=>{M.supText='';A.sup.msgs=[];go('support');try{A.sup.msgs=(await api('/api/support')).messages;if(x.S.me)x.S.me.supportUnread=0;if(here('support')){x.refresh();toBottom()}}catch(e){}};
  AFTER.support=()=>{toBottom();poll('support',()=>api('/api/support'),()=>A.sup.msgs,r=>{A.sup.msgs=r.messages})};
  FORMS.supSend=f=>{const v=f.t.value.trim();if(!v)return;M.supText='';f.t.value='';
    bg(api('/api/support','POST',{text:v}).then(async()=>{A.sup.msgs=(await api('/api/support')).messages;x.refresh();toBottom();$('#chatIn')&&$('#chatIn').focus()}))};

  /* ---------- users ---------- */
  function tabUsers(){
    const u=A.users;
    return `<div class="searchbox" style="margin-bottom:14px">${ico('search',20)}<input id="uq" class="in" type="search" data-m="adm:uq" value="${esc(M.uq)}" placeholder="Имя или Telegram ID" autocomplete="off"></div>
    ${!u?loading():u.list.length?`<div class="list">${u.list.map(r=>`<div class="li" style="align-items:flex-start">${avatar(r.name||'?',1)}<div class="grow" style="min-width:0"><b style="font-size:14px">${esc(r.name||'Без имени')}</b>${r.root?' <span class="tag acc">главный админ</span>':r.admin?' <span class="tag acc">админ</span>':''}${r.banned?' <span class="tag">заблокирован</span>':''}${r.blocked?' <span class="tag">бот остановлен</span>':''}
      <div class="mute" style="font-size:12px">ID ${esc(r.id)} · был(а) ${ago(r.last_seen||r.created)}</div>
      ${r.root?'':`<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn sm ghost" data-a="uBan" data-id="${esc(r.id)}" data-on="${r.banned?0:1}">${r.banned?'Разблокировать':'Заблокировать'}</button><button class="btn sm ghost" data-a="uAdmin" data-id="${esc(r.id)}" data-on="${r.admin?0:1}">${r.admin?'Снять админа':'Сделать админом'}</button><button class="btn sm ghost" data-a="openChatWith" data-id="${esc(r.id)}">Написать</button></div>`}</div></div>`).join('')}</div>${u.more?`<button class="btn block ghost" style="margin-top:12px" data-a="uMore">Показать ещё</button>`:''}`:empty('user','Никого не нашли','Измените запрос.')}
    <div class="sec"><div class="sec-h"><h2>Добавить админа по ID</h2></div><form class="replybox" data-f="admAdd"><input class="in" name="t" data-m="adm:admId" value="${esc(M.admId)}" inputmode="numeric" placeholder="Telegram ID" autocomplete="off"><button class="btn sm" style="height:42px">Добавить</button></form></div>`;
  }
  let uqT;
  x.ONINPUT['adm:uq']=()=>{clearTimeout(uqT);uqT=setTimeout(async()=>{try{A.users=await api('/api/admin/users?q='+encodeURIComponent(M.uq));if(here('admin')&&A.tab==='users'){const f=document.activeElement&&document.activeElement.id==='uq';x.refresh();if(f){const i=$('#uq');i.focus();i.setSelectionRange(i.value.length,i.value.length)}}}catch(e){}},350)};
  ACT.uMore=async()=>{try{const r=await api(`/api/admin/users?q=${encodeURIComponent(M.uq)}&offset=${A.users.list.length}`);A.users.list.push(...r.list);A.users.more=r.more;x.refresh()}catch(e){}};
  ACT.uBan=el=>bg(api(`/api/admin/users/${el.dataset.id}/ban`,'POST',{on:el.dataset.on==='1'}).then(()=>{toast(el.dataset.on==='1'?'Заблокирован':'Разблокирован');reload('users')}));
  ACT.uAdmin=el=>bg(api(`/api/admin/users/${el.dataset.id}/admin`,'POST',{on:el.dataset.on==='1'}).then(()=>{toast('Готово');reload('users')}));
  FORMS.admAdd=f=>{const v=f.t.value.replace(/\D/g,'');if(!v){toast('Введите числовой Telegram ID');return}M.admId='';bg(api('/api/admin/admins','POST',{id:v}).then(()=>{toast('Админ добавлен');reload('users')}))};

  /* ---------- content ---------- */
  function tabContent(){
    if(!A.adbooks)return loading();
    const cols=COLLECTIONS.map(c=>`<div class="li"><div class="grow"><b style="font-size:14px">${esc(c.t.ru)}</b><div class="mute" style="font-size:12px">${c.ids.length} книг</div></div><button class="btn sm ghost" data-a="colEdit" data-id="${esc(c.id)}">Править</button></div>`).join('');
    const books=A.adbooks.list.map(b=>`<div class="li" style="align-items:flex-start"><div class="grow" style="min-width:0"><b style="font-size:14px">${esc(b.title)}</b>${b.hidden?' <span class="tag">скрыта</span>':''}<div class="mute" style="font-size:12px">${b.lang.toUpperCase()} · глав: ${b.chapters}</div><div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn sm ghost" data-a="bEdit" data-id="${esc(b.id)}">Править</button><button class="btn sm ghost" data-a="bVers" data-id="${esc(b.id)}">История текста</button><button class="btn sm ghost" data-a="bHide" data-id="${esc(b.id)}" data-on="${b.hidden?0:1}">${b.hidden?'Показать':'Скрыть'}</button><button class="btn sm ghost" data-a="bDel" data-id="${esc(b.id)}">Удалить</button></div></div></div>`).join('');
    return `<div class="sec" style="margin-top:0"><div class="sec-h"><h2>Бот</h2></div><div class="card"><p class="mute" style="font-size:12.5px;margin-bottom:12px">Приветствие, которое бот отправляет на /start. Русский вариант получают пользователи с русским Telegram, узбекский с узбекским. Пустое поле вернёт текст по умолчанию.</p>
      <div class="field"><label for="wlc">Приветствие (русский)</label><textarea id="wlc" class="in" data-m="adm:welcome" style="min-height:170px">${esc(M.welcome)}</textarea></div>
      <div class="field"><label for="wlcU">Salomlashish (o‘zbekcha)</label><textarea id="wlcU" class="in" data-m="adm:welcomeUz" style="min-height:170px">${esc(M.welcomeUz)}</textarea></div>
      <div class="field"><label for="appL">Ссылка на мини-апп</label><input id="appL" class="in" data-m="adm:appLink" value="${esc(M.appLink)}" placeholder="https://t.me/muloqotbooksbot/app">${'<p class="hint">Нужна для кнопки «Поделиться»: друг получает ссылку и сразу попадает в книгу. Формат: https://t.me/имя_бота/короткое_имя_приложения (короткое имя вы задали в @BotFather при /newapp).</p>'}</div>
      <button class="btn block" data-a="wlcSave">Сохранить</button></div></div>
    <div class="sec"><div class="sec-h"><h2>Вопрос недели</h2></div><div class="card"><div class="field"><label for="wqBook">Книга</label><select id="wqBook" class="in" data-chg="wqBook">${BOOKS.map(b=>`<option value="${esc(b.id)}" ${b.id===M.wq_book?'selected':''}>${esc(b.title)}</option>`).join('')}</select></div>
      <div class="field"><label for="wqRu">Вопрос (русский)</label><textarea id="wqRu" class="in" data-m="adm:wq_ru" style="min-height:80px">${esc(M.wq_ru)}</textarea></div>
      <div class="field"><label for="wqUz">Savol (o‘zbekcha)</label><textarea id="wqUz" class="in" data-m="adm:wq_uz" style="min-height:80px">${esc(M.wq_uz)}</textarea></div><button class="btn block" data-a="wqSave">Сохранить</button></div></div>
    <div class="sec"><div class="sec-h"><h2>Подборки</h2><button class="link acc" data-a="colNew">+ Новая</button></div><div class="list">${cols||'<div class="li mute">Подборок нет</div>'}</div></div>
    <div class="sec"><div class="sec-h"><h2>Книги</h2></div><div class="list">${books}</div><p class="mute" style="font-size:12.5px;margin-top:10px">Отзывы и обсуждения удаляются прямо в разделе «Сообщество»: у админа рядом с ними есть значок корзины.</p></div>`;
  }
  CHG.wqBook=el=>{M.wq_book=el.value};
  ACT.wlcSave=()=>bg(api('/api/admin/welcome','POST',{text:M.welcome,textUz:M.welcomeUz,appLink:M.appLink}).then(()=>toast('Сохранено')));
  ACT.wqSave=()=>bg(api('/api/admin/weekly','POST',{bookId:M.wq_book,ru:M.wq_ru,uz:M.wq_uz}).then(async()=>{await loadBoot();toast('Вопрос недели обновлён')}));
  ACT.bHide=el=>bg(api(`/api/admin/books/${el.dataset.id}/hide`,'POST',{on:el.dataset.on==='1'}).then(async()=>{await loadBoot();toast('Готово');reload('content')}));
  ACT.bDel=el=>confirmSheet('Удалить книгу вместе с отзывами?','bDelGo',el.dataset.id,'Удалить');
  ACT.bDelGo=el=>{closeSheet();bg(api(`/api/admin/books/${el.dataset.id}/delete`,'POST',{}).then(async()=>{await loadBoot();toast('Удалено');A.fresh.stats=false;reload('content')}))};
  ACT.bEdit=el=>{const b=A.adbooks.list.find(y=>y.id===el.dataset.id);M.eb_title=b.title;M.eb_desc=b.desc;
    openSheet(`<h2>Правка книги</h2><div class="field"><label for="ebT">Название</label><input id="ebT" class="in" data-m="adm:eb_title" value="${esc(b.title)}"></div><div class="field"><label for="ebD">Аннотация</label><textarea id="ebD" class="in" data-m="adm:eb_desc" style="min-height:130px">${esc(b.desc)}</textarea></div><button class="btn block" data-a="bEditGo" data-id="${esc(b.id)}">Сохранить</button>`)};
  ACT.bVers=async el=>{
    try{const r=await api(`/api/admin/books/${el.dataset.id}/versions`);
      openSheet(`<h2>История текста</h2>${r.list.length?`<p class="mute" style="font-size:12.5px;margin-bottom:12px">Прежние версии сохраняются при замене текста (последние 5). Вернув версию, вы замените текущий текст; текущий тоже сохранится.</p><div class="list">${r.list.map(v=>`<div class="li"><div class="grow"><b style="font-size:14px">${hm(v.created)}</b><div class="mute" style="font-size:12px">глав: ${v.chapters} · ${Math.round(v.chars/1000)}k знаков</div></div><button class="btn sm ghost" data-a="bRestore" data-id="${esc(el.dataset.id)}" data-v="${v.id}">Вернуть</button></div>`).join('')}</div>`:'<p class="mute">Версий пока нет. Они появятся, когда автор заменит текст и вы одобрите замену.</p>'}`)}
    catch(e){toast('Не удалось загрузить историю')}};
  ACT.bRestore=el=>{closeSheet();bg(api(`/api/admin/books/${el.dataset.id}/restore`,'POST',{versionId:+el.dataset.v}).then(async()=>{toast('Версия возвращена');reload('content')}))};
  ACT.bEditGo=el=>{closeSheet();bg(api(`/api/admin/books/${el.dataset.id}/edit`,'POST',{title:M.eb_title,desc:M.eb_desc}).then(async()=>{await loadBoot();toast('Сохранено');reload('content')}))};

  const colSheet=()=>{const c=A.col;return `<h2>${A.editId?'Правка подборки':'Новая подборка'}</h2><div class="field"><label for="colRu">Название (русский)</label><input id="colRu" class="in" data-m="adm:col_ru" value="${esc(M.col_ru)}"></div><div class="field"><label for="colUz">Nomi (o‘zbekcha)</label><input id="colUz" class="in" data-m="adm:col_uz" value="${esc(M.col_uz)}"></div>
    <div class="lbl" style="margin-bottom:8px">Книги в подборке</div><div class="list" style="max-height:240px;overflow:auto;margin-bottom:14px">${BOOKS.map(b=>`<label class="li" style="cursor:pointer"><input type="checkbox" data-chg="colBook" data-id="${esc(b.id)}" ${c.has(b.id)?'checked':''}><span class="grow">${esc(b.title)}</span></label>`).join('')}</div>
    <button class="btn block" data-a="colSave">Сохранить</button>${A.editId?`<button class="btn block ghost" style="margin-top:10px" data-a="colDel">Удалить подборку</button>`:''}`};
  ACT.colEdit=el=>{const c=COLLECTIONS.find(y=>y.id===el.dataset.id);A.editId=c.id;A.col=new Set(c.ids);M.col_ru=c.t.ru;M.col_uz=c.t.uz;openSheet(colSheet())};
  ACT.colNew=()=>{A.editId=null;A.col=new Set();M.col_ru='';M.col_uz='';openSheet(colSheet())};
  CHG.colBook=el=>{el.checked?A.col.add(el.dataset.id):A.col.delete(el.dataset.id)};
  const saveCols=list=>{closeSheet();bg(api('/api/admin/collections','POST',{list}).then(async()=>{await loadBoot();toast('Подборки сохранены');x.refresh()}))};
  ACT.colSave=()=>{if(!M.col_ru.trim()||!A.col.size){toast('Нужно название и хотя бы одна книга');return}
    const item={id:A.editId||'',ids:[...A.col],t:{ru:M.col_ru,uz:M.col_uz}};
    const base=COLLECTIONS.map(c=>c.id===A.editId?{...c,...item}:c);if(!A.editId)base.push(item);saveCols(base)};
  ACT.colDel=()=>saveCols(COLLECTIONS.filter(c=>c.id!==A.editId));

  /* ---------- delete community content (buttons appear on cards for admins) ---------- */
  const delGo=(path,after)=>{closeSheet();bg(api(path,'POST',{}).then(()=>{after();toast('Удалено');x.refresh()}))};
  ACT.admDelReview=el=>confirmSheet('Удалить отзыв?','admDelReviewGo',el.dataset.id,'Удалить');
  ACT.admDelReviewGo=el=>delGo(`/api/admin/reviews/${el.dataset.id}/delete`,()=>{x.S.reviews=x.S.reviews.filter(r=>r.id!==el.dataset.id)});
  ACT.admDelThread=el=>confirmSheet('Удалить тему со всеми комментариями?','admDelThreadGo',el.dataset.id,'Удалить');
  ACT.admDelThreadGo=el=>delGo(`/api/admin/threads/${el.dataset.id}/delete`,()=>{x.S.threads=x.S.threads.filter(t=>t.id!==el.dataset.id)});
  ACT.admDelComment=el=>confirmSheet('Удалить комментарий?','admDelCommentGo',`${el.dataset.t}:${el.dataset.id}`,'Удалить');
  ACT.admDelCommentGo=el=>{const [tid,cid]=el.dataset.id.split(':');delGo(`/api/admin/comments/${cid}/delete`,()=>{const th=x.S.threads.find(t=>t.id===tid);if(th)th.comments=th.comments.filter(c=>String(c.id)!==cid)})};

  /* lets other modules (donations) plug their own tab into the panel */
  return {A,M,T,bodies,loaders,load,here,reload,ago,hm,badge,loading,confirmSheet,bg};
}
