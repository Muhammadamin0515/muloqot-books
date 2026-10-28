import {search as fuzzy} from './search.js';
import {compressPhoto} from './image.js';
/* Admin panel + support chat. Wired into the app through initAdmin(ctx); all data comes from /api/admin/*. */
export function initAdmin(x){
  const {SCREENS,ACT,CHG,FORMS,AFTER,MODEL,go,api,toast,esc,ico,openSheet,closeSheet,setSheet,empty,avatar,NAV,$,BOOKS,COLLECTIONS,WEEKLY,loadBoot,tr}=x;
  const AUTH=id=>(x.AUTHORS||[]).find(a=>a.id===id)||{name:''};
  const M=MODEL.adm={nf:{support:'off',submissions:'silent',reports:'silent',donations:'silent'},bcText:'',bc_kind:'message',bc_photo:'',bc_photoData:'',bc_photoInfo:'',bc_btn:'app',bc_btnText:'',bc_url:'',bc_book:'',bc_opts:'',bc_lang:'all',bp_wq_book:'',bp_bc_book:'',col_q:'',uq:'',chatText:'',supText:'',wq_book:'',wq_ru:'',wq_uz:'',eb_title:'',eb_desc:'',col_ru:'',col_uz:'',admId:'',rejNote:'',stopwords:'',appLinkSaved:'',welcome:'',welcomeUz:'',appLink:''};
  const A={tab:'overview',fresh:{},stats:null,bc:null,run:null,subs:null,inbox:null,users:null,adbooks:null,chat:{uid:null,name:'',msgs:[]},sup:{msgs:[]},col:null,editId:null};
  const here=n=>NAV.cur.name===n;
  const bg=p=>p.catch(()=>toast('Ошибка запроса'));
  const T=[['overview','Обзор'],['broadcast','Рассылка'],['moderation','Модерация'],['reports','Жалобы'],['chat','Чат'],['users','Люди'],['content','Контент']];
  const ORDER=['overview','moderation','reports','chat','users','broadcast','donations','catalog','content'];
  const ICON={overview:'grid',moderation:'check',reports:'flag',chat:'chat',users:'user',broadcast:'bell',donations:'heart',catalog:'lib',content:'list'};
  const HINT={catalog:'Настоящий каталог: добавление книг с подтверждением прав, проверка прав на полный текст, аудио и тестовые данные.',overview:'Сводка по приложению: сколько людей, что популярно и что требует вашего внимания.',moderation:'Новые книги и обновления текста от авторов. Проверьте и опубликуйте или отклоните с причиной.',reports:'Жалобы читателей на отзывы, темы и комментарии. После трёх жалоб контент скрывается сам.',chat:'Сообщения от пользователей. Ваш ответ приходит им в бота и в приложение.',users:'Найдите человека, заблокируйте его или сделайте админом.',broadcast:'Сообщение всем, кто запускал бота. Сначала отправьте тест себе.',donations:'Деньги от Telegram Stars, цели сбора и настройки экрана донатов.',content:'Тексты бота, ссылка на приложение, подборки и книги.'};
  const ago=ms=>{if(!ms)return 'никогда';const m=Math.floor((Date.now()-ms)/6e4);if(m<2)return 'сейчас';if(m<60)return m+' мин назад';const h=Math.floor(m/60);if(h<24)return h+' ч назад';return Math.floor(h/24)+' дн. назад'};
  const hm=ms=>new Date(ms).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  const loading=()=>`<div class="sk" style="height:90px;border-radius:16px;margin-bottom:12px"></div><div class="sk" style="height:90px;border-radius:16px"></div>`;
  const badge=n=>n?`<span class="badge">${n}</span>`:'';
  const confirmSheet=(msg,act,id,label='Подтвердить')=>openSheet(`<h2>${esc(msg)}</h2><div class="row" style="gap:10px"><button class="btn ghost grow" data-a="closeSheet">Отмена</button><button class="btn grow" data-a="${act}" data-id="${esc(id)}">${label}</button></div>`);

  /* ---------- search-as-you-type book picker (a plain list of hundreds of books is unusable) ---------- */
  const bookDocs=()=>BOOKS.map(b=>({id:b.id,title:b.title,author:AUTH(b.a).name,extra:''}));
  const pickHtml=(key,ph='Начните вводить название или автора')=>{
    const b=BOOKS.find(y=>y.id===M[key]);
    if(b)return `<div class="bchosen"><div class="grow" style="min-width:0"><b>${esc(b.title)}</b><small>${esc(AUTH(b.a).name)}</small></div><button class="btn sm ghost" data-a="bpClear" data-k="${key}">Другая</button></div>`;
    return `<input class="in" data-m="adm:bp_${key}" value="${esc(M['bp_'+key]||'')}" placeholder="${ph}" autocomplete="off" aria-label="Поиск книги"><div class="bplist" id="bpl_${key}">${pickList(key)}</div>`;
  };
  const pickList=key=>{const q=(M['bp_'+key]||'').trim();if(!q)return `<div class="bpempty">${BOOKS.length} книг в каталоге: введите часть названия или имя автора</div>`;
    const hits=fuzzy(q,bookDocs()).slice(0,8),byId=new Map(BOOKS.map(b=>[b.id,b]));
    return hits.length?hits.map(h=>{const b=byId.get(h.id);return `<button class="bpitem" data-a="bpPick" data-k="${key}" data-id="${esc(b.id)}"><b>${esc(b.title)}</b><small>${esc(AUTH(b.a).name)}</small></button>`}).join(''):'<div class="bpempty">Ничего не найдено</div>'};
  ['wq_book','bc_book'].forEach(k=>{x.ONINPUT['adm:bp_'+k]=()=>{const l=$('#bpl_'+k);if(l)l.innerHTML=pickList(k)}});
  ACT.bpPick=el=>{M[el.dataset.k]=el.dataset.id;M['bp_'+el.dataset.k]='';x.refresh()};
  ACT.bpClear=el=>{M[el.dataset.k]='';x.refresh()};

  /* ---------- loading per tab ---------- */
  async function load(key,fn){try{A[key]=await fn()}catch(e){toast('Не удалось загрузить: '+(e.detail||e.status||'сеть'))}if(here('admin'))x.refresh()}
  const loaders={
    overview:()=>load('stats',()=>api('/api/admin/stats')),
    broadcast:()=>Promise.all([load('bc',()=>api('/api/admin/broadcasts')),A.stats?0:load('stats',()=>api('/api/admin/stats'))]),
    moderation:()=>load('subs',()=>api('/api/admin/submissions')),
    reports:()=>load('reps',()=>api('/api/admin/reports')).then(()=>{if(A.reps)M.stopwords=A.reps.stopwords.join(', ')}),
    chat:()=>load('inbox',()=>api('/api/admin/support')),
    users:()=>load('users',()=>api('/api/admin/users?q='+encodeURIComponent(M.uq))),
    content:()=>{api('/api/admin/notif-settings').then(n=>{M.nf=n;if(here('admin')&&A.tab==='content')x.refresh()}).catch(()=>{});api('/api/admin/welcome').then(w=>{M.welcome=w.text;M.welcomeUz=w.textUz;M.appLink=w.appLink;M.appLinkSaved=w.appLink;if(here('admin')&&A.tab==='content')x.refresh()}).catch(()=>{});M.wq_book=WEEKLY.bookId;M.wq_ru=WEEKLY.q.ru||'';M.wq_uz=WEEKLY.q.uz||'';return load('adbooks',()=>api('/api/admin/books'))}
  };
  const bodies={overview:tabOverview,broadcast:tabBroadcast,moderation:tabModeration,reports:tabReports,chat:tabChat,users:tabUsers,content:tabContent};
  AFTER.admin=()=>{
    if(!A.fresh.stats){A.fresh.stats=true;api('/api/admin/stats').then(s=>{A.stats=s;if(here('admin'))x.refresh()}).catch(()=>{})}
    if(!A.fresh[A.tab]){A.fresh[A.tab]=true;loaders[A.tab]()}
    const on=document.querySelector('.admbar .chip.on');if(on)on.scrollIntoView({inline:'center',block:'nearest'});
  };
  const reload=k=>{A.fresh[k]=false;x.refresh()};

  /* ---------- screen ---------- */
  SCREENS.admin=()=>{
    const s=A.stats||{};
    const num={moderation:s.pending,reports:s.reports,chat:s.supportUnread};
    const tabs=[...T].sort((a,b)=>ORDER.indexOf(a[0])-ORDER.indexOf(b[0])).map(([k,n])=>`<button class="chip ${A.tab===k?'on':''}" data-a="admTab" data-v="${k}">${ICON[k]?ico(ICON[k],15):''} ${n}${badge(num[k])}</button>`).join('');
    const body=bodies[A.tab]();
    return `<div class="admhead"><header class="topbar px"><button class="iconbtn" data-a="back" aria-label="Назад">${ico('back')}</button><div class="grow"><h2 class="display" style="font-size:22px">Админ-панель</h2></div></header><div class="admbar px">${tabs}</div></div>
    <div class="px adm" style="margin-top:8px"><p class="pagehint">${HINT[A.tab]||''}</p>${body}</div>`;
  };
  ACT.topMore=()=>{A.topAll=!A.topAll;x.refresh()};
  ACT.openAdmin=()=>{A.fresh={};A.tab='overview';go('admin')};
  ACT.admTab=el=>{A.tab=el.dataset.v;A.fresh[A.tab]=false;x.refresh();$('#screen').scrollTop=0};

  /* ---------- overview ---------- */
  const tile=(n,label,sub)=>`<div class="tile"><b>${n}</b><span>${label}</span>${sub?`<small>${sub}</small>`:''}</div>`;
  function signupChart(s){
    const days=[];for(let i=13;i>=0;i--){const d=new Date(Date.now()-i*864e5).toISOString().slice(0,10);days.push({d,n:(s.signups.find(x=>x.d===d)||{n:0}).n})}
    const total=days.reduce((a,b)=>a+b.n,0),max=Math.max(1,...days.map(d=>d.n)),fmt=d=>d.slice(8)+'.'+d.slice(5,7);
    return `<div class="card"><div class="row" style="justify-content:space-between;align-items:baseline"><div><b class="bignum">${total}</b> <span class="mute" style="font-size:13px">новых за 14 дней</span></div><span class="mute" style="font-size:12px">макс. ${max} в день</span></div>
      <div class="chart">${days.map(d=>`<i class="${d.n?'':'z'}" title="${fmt(d.d)}: ${d.n}" style="height:${d.n?Math.max(10,d.n/max*100):4}%"></i>`).join('')}</div>
      <div class="chart-x"><span>${fmt(days[0].d)}</span><span>${fmt(days[13].d)}</span></div></div>`;
  }
  function tabOverview(){
    const s=A.stats;if(!s)return loading();
    const max=Math.max(1,...s.signups.map(d=>d.n));
    const alert=(tab,text,n)=>`<button class="alert" data-a="admTab" data-v="${tab}"><b>${text}</b>${badge(n)}${ico('chev',18)}</button>`;
    const alerts=[s.pending?alert('moderation','Заявки ждут проверки',s.pending):'',s.reports?alert('reports','Жалобы ждут решения',s.reports):'',s.supportUnread?alert('chat','Непрочитанные сообщения',s.supportUnread):''].join('');
    return `${alerts?`<div class="sec"><div class="sec-h"><h2>Требует внимания</h2></div>${alerts}</div>`:''}
    <div class="sec"><div class="sec-h"><h2>Пользователи</h2></div><div class="tiles">${tile(s.users,'Всего',`+${s.new24} за сутки`)}${tile(s.active24,'Активны сегодня',`${s.active7} за неделю`)}${tile(s.new7,'Новых за неделю','')}${tile(s.reachable,'Доступны боту','получат рассылку')}</div>
      <p class="hint" style="margin-top:10px">Заблокировано: ${s.banned} · остановили бота: ${s.blocked}</p></div>
    <div class="sec"><div class="sec-h"><h2>Контент</h2></div><div class="tiles">${tile(s.books,'Книг',[s.hidden?`скрыто: ${s.hidden}`:'',s.drafts?`черновиков: ${s.drafts}`:'',s.demoBooks?`тестовых: ${s.demoBooks}`:''].filter(Boolean).join(' · '))}${tile(s.reviews,'Отзывов','')}${tile(s.threads,'Обсуждений','')}${tile(s.comments,'Комментариев','')}</div></div>
    <div class="sec"><div class="sec-h"><h2>Регистрации за 14 дней</h2></div>${signupChart(s)}</div>
    ${s.top&&s.top.length?`<div class="sec"><div class="sec-h"><h2>Популярные книги недели</h2></div><div class="list toplist">${s.top.slice(0,A.topAll?15:5).map((b,i)=>`<div class="toprow"><i>${i+1}</i><div class="grow"><b>${esc(b.title)}</b><small>${b.views} просм. · ${b.reads} читают · ${b.finishes} дочитали</small></div></div>`).join('')}${s.top.length>5?`<button class="btn ghost block" data-a="topMore" style="margin-top:8px">${A.topAll?'Свернуть':'Показать ещё '+(s.top.length-5)}</button>`:''}</div></div>`:''}
    ${s.errors&&s.errors.length?`<div class="demo-banner" style="margin-top:14px;flex-direction:column"><b>Часть данных не загрузилась</b>${s.errors.map(e=>`<span>${esc(e)}</span>`).join('')}</div>`:''}`;
  }

  /* ---------- broadcast ---------- */
  function bcPreview(){
    const poll=M.bc_kind==='poll',opts=M.bc_opts.split('\n').map(o=>o.trim()).filter(Boolean).slice(0,6);
    let btns=[];
    if(poll)btns=opts.length?opts:['Вариант 1','Вариант 2'];
    else if(M.bc_btn==='app')btns=['📖 Открыть приложение'];
    else if(M.bc_btn==='link')btns=[M.bc_btnText||'Текст кнопки'];
    else if(M.bc_btn==='book')btns=[M.bc_btnText||'📖 Читать'];
    return `${M.bc_photoData?`<img src="${M.bc_photoData}" alt="" style="width:100%;border-radius:12px;margin-bottom:8px;display:block">`:M.bc_photo?`<div class="bcphoto">${ico('upload',22)} картинка по ссылке</div>`:''}<div>${esc(M.bcText)||'Здесь появится ваше сообщение'}</div>${btns.map(b=>`<div class="bcbtn">${esc(b)}</div>`).join('')}`;
  }
  function tabBroadcast(){
    if(!A.bc)return loading();
    const r=A.run,reach=A.stats?A.stats.reachable:'…',poll=M.bc_kind==='poll';
    const prog=r?`<div class="card" style="margin-bottom:14px"><b>Идёт рассылка…</b><div class="bar" style="margin:12px 0 8px"><i id="bcBar" style="width:${r.total?Math.round((r.sent+r.failed)/r.total*100):0}%"></i></div><span id="bcTxt" class="mute" style="font-size:13px">Отправлено ${r.sent} из ${r.total}, ошибок ${r.failed}</span></div>`:'';
    const seg=(key,list)=>`<div class="seg">${list.map(([v,n])=>`<button class="${M[key]===v?'on':''}" data-a="bcSet" data-k="${key}" data-v="${v}">${n}</button>`).join('')}</div>`;
    const btnFields=poll?'':`<div class="step" style="margin-top:18px"><i>4</i><b>Кнопка под сообщением</b></div>
      <select class="in" data-chg="bcSel" data-k="bc_btn" aria-label="Кнопка">${[['app','Открыть приложение'],['link','Своя ссылка (реклама, сайт, канал)'],['book','Открыть конкретную книгу'],['none','Без кнопки']].map(([v,n])=>`<option value="${v}" ${M.bc_btn===v?'selected':''}>${n}</option>`).join('')}</select>
      ${M.bc_btn==='link'?`<div class="field" style="margin-top:12px"><label for="bcBt">Текст на кнопке</label><input id="bcBt" class="in" data-m="adm:bc_btnText" value="${esc(M.bc_btnText)}" maxlength="30" placeholder="Например: Подробнее"></div><div class="field"><label for="bcUrl">Ссылка (https://…)</label><input id="bcUrl" class="in" data-m="adm:bc_url" value="${esc(M.bc_url)}" placeholder="https://t.me/ваш_канал" autocomplete="off"></div>`:''}
      ${M.bc_btn==='book'?`<div class="field" style="margin-top:12px"><label>Книга</label>${pickHtml('bc_book')}</div><div class="field"><label for="bcBt2">Текст на кнопке</label><input id="bcBt2" class="in" data-m="adm:bc_btnText" value="${esc(M.bc_btnText)}" maxlength="30" placeholder="📖 Читать"></div>`:''}`;
    return `${A.bc.bot?'':'<div class="demo-banner">Бот не подключён: добавьте секрет BOT_TOKEN в настройках Worker, и рассылка заработает.</div>'}${prog}
    <div class="card">
      <div class="step"><i>1</i><b>Что отправляем</b></div>
      ${seg('bc_kind',[['message','Сообщение'],['poll','Опрос (кнопки-ответы)']])}
      <div class="step" style="margin-top:18px"><i>2</i><b>${poll?'Вопрос':'Текст сообщения'}</b></div>
      <textarea id="bcText" class="in" data-m="adm:bcText" maxlength="${M.bc_photo||M.bc_photoData?1000:3500}" placeholder="${poll?'Например: Какие книги вам добавить?':'Что хотите сообщить читателям?'}" style="min-height:120px">${esc(M.bcText)}</textarea>
      <div class="counter"><span id="bcCount">${M.bcText.length} / ${M.bc_photo||M.bc_photoData?1000:3500}</span></div>
      ${poll?`<div class="field" style="margin-top:12px"><label for="bcOpts">Варианты ответа (каждый с новой строки, от 2 до 6)</label><textarea id="bcOpts" class="in" data-m="adm:bc_opts" style="min-height:96px" placeholder="Узбекская классика&#10;Современные романы&#10;Детективы">${esc(M.bc_opts)}</textarea></div>`:''}
      <div class="field" style="margin-top:12px"><label>Картинка (необязательно)</label>
        ${M.bc_photoData?`<div class="bchosen"><img src="${M.bc_photoData}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:10px"><div class="grow" style="min-width:0"><b>Картинка загружена</b><small>${esc(M.bc_photoInfo)}</small></div><button class="btn sm ghost" data-a="bcPhotoClear">Убрать</button></div>`
        :`<label class="drop" for="bcFile">${ico('upload',24)}<div class="grow"><b>Загрузить с телефона</b><div class="mute" style="font-size:12.5px;font-weight:500">Любое фото: размер подгоним сами</div></div></label><input id="bcFile" type="file" accept="image/*" data-chg="bcPhotoFile" style="position:absolute;opacity:0;width:1px;height:1px">
        <input id="bcPhoto" class="in" data-m="adm:bc_photo" value="${esc(M.bc_photo)}" placeholder="или ссылка https://…/banner.jpg" autocomplete="off" style="margin-top:10px">`}
        <p class="hint">С картинкой текст до 1000 знаков.</p></div>
      <div class="step" style="margin-top:18px"><i>3</i><b>Кому</b></div>
      ${seg('bc_lang',[['all','Всем'],['ru','Русский язык'],['uz','Узбекский язык']])}
      ${btnFields}
      <div class="lbl" style="margin:18px 0 8px">Так увидит читатель</div>
      <div class="bubble them" id="bcPrev" style="max-width:100%">${bcPreview()}</div>
      <div class="step" style="margin-top:18px"><i>${poll?4:5}</i><b>Проверьте на себе</b></div>
      <button class="btn block ghost" data-a="bcTest" ${r?'disabled':''}>Отправить тест мне</button>
      <div class="step" style="margin-top:18px"><i>${poll?5:6}</i><b>Отправьте</b></div>
      <button class="btn block" data-a="bcAll" ${r?'disabled':''}>Отправить (${M.bc_lang==='all'?reach:'выбранной аудитории'})</button>
      <p class="hint">Получат те, кто запускал бота и не блокировал его.${poll?' Ответы подсчитываются: результат виден в истории рассылок.':''}</p>
    </div>
    <div class="sec"><div class="sec-h"><h2>История рассылок</h2></div>${A.bc.list.length?`<div class="list">${A.bc.list.map(b=>`<div class="li" style="align-items:flex-start;flex-direction:column;gap:4px"><div class="row" style="width:100%;justify-content:space-between"><b style="font-size:13px">${hm(b.created)}</b><span class="status ${b.status==='done'?'m':''}">${{done:'Отправлена',running:'Идёт',cancelled:'Отменена'}[b.status]||b.status}${b.audience==='test'?' · тест':''}${b.kind==='poll'?' · опрос':''}</span></div><span style="font-size:13.5px">${esc(b.text.slice(0,140))}</span><span class="mute" style="font-size:12px">${b.sent} доставлено · ${b.failed} ошибок${b.lang&&b.lang!=='all'?' · '+b.lang.toUpperCase():''}</span>
        ${b.kind==='poll'&&b.votes?`<div style="width:100%;margin-top:6px">${b.options.map((o,i)=>{const tot=b.votes.reduce((n,y)=>n+y,0)||1;return `<div class="vrow"><span>${esc(o)}</span><div class="bar"><i style="width:${Math.round(b.votes[i]/tot*100)}%"></i></div><b>${b.votes[i]}</b></div>`}).join('')}<span class="mute" style="font-size:12px">Всего ответов: ${b.votes.reduce((n,y)=>n+y,0)}</span></div>`:''}</div>`).join('')}</div>`:'<p class="mute">Рассылок пока не было</p>'}</div>`;
  }
  const bcRefreshPrev=()=>{const p=$('#bcPrev'),c=$('#bcCount');if(p)p.innerHTML=bcPreview();if(c)c.textContent=M.bcText.length+' / '+(M.bc_photo||M.bc_photoData?1000:3500)};
  ['bcText','bc_opts','bc_photo','bc_btnText','bc_url'].forEach(k=>{x.ONINPUT['adm:'+k]=bcRefreshPrev});
  CHG.bcPhotoFile=async el=>{const f=el.files&&el.files[0];el.value='';if(!f)return;
    try{const r=await compressPhoto(f);M.bc_photoData=r.dataUrl;M.bc_photo='';M.bc_photoInfo=`${r.w}×${r.h}, ${Math.round(r.bytes/1024)} КБ`;x.refresh()}
    catch(e){toast('Не удалось открыть картинку: выберите JPG или PNG')}};
  ACT.bcPhotoClear=()=>{M.bc_photoData='';M.bc_photoInfo='';x.refresh()};
  ACT.bcSet=el=>{M[el.dataset.k]=el.dataset.v;x.refresh()};
  CHG.bcSel=el=>{M[el.dataset.k]=el.value;x.refresh()};
  const paintProg=()=>{const r=A.run;if(!r)return;const b=$('#bcBar'),t=$('#bcTxt');if(b)b.style.width=(r.total?Math.round((r.sent+r.failed)/r.total*100):0)+'%';if(t)t.textContent=`Отправлено ${r.sent} из ${r.total}, ошибок ${r.failed}`};
  async function runBc(b){
    A.run=b;if(here('admin'))x.refresh();
    while(A.run&&A.run.status==='running'){try{A.run=(await api(`/api/admin/broadcasts/${b.id}/step`,'POST',{})).broadcast}catch(e){toast('Сбой отправки, нажмите ещё раз');break}paintProg()}
    const d=A.run;A.run=null;if(d)toast(`Готово: ${d.sent} доставлено, ${d.failed} ошибок`);A.fresh.stats=false;A.fresh.broadcast=false;if(here('admin'))x.refresh();
  }
  const BCERR={text:'Введите текст (от 2 знаков)',caption_long:'С картинкой текст не длиннее 1000 знаков',options:'Для опроса нужно от 2 до 6 вариантов ответа',button:'Для кнопки-ссылки нужны текст и адрес https://…',photo:'Картинка не подошла: выберите другую',book:'Выберите книгу из каталога'};
  const bcBody=audience=>({text:M.bcText,audience,kind:M.bc_kind,photo:M.bc_photo.trim(),photoData:M.bc_photoData,lang:M.bc_lang,options:M.bc_opts.split('\n'),button:{type:M.bc_btn,text:M.bc_btnText,url:M.bc_url.trim(),bookId:M.bc_book}});
  const bcValid=()=>{if(M.bcText.trim().length<2){toast(BCERR.text);return false}
    if(M.bc_kind==='poll'&&M.bc_opts.split('\n').map(o=>o.trim()).filter(Boolean).length<2){toast(BCERR.options);return false}
    if(M.bc_kind==='message'&&M.bc_btn==='link'&&(!/^https:\/\//i.test(M.bc_url.trim())||!M.bc_btnText.trim())){toast(BCERR.button);return false}
    if(M.bc_kind==='message'&&M.bc_btn==='book'&&!M.bc_book){toast(BCERR.book);return false}return true};
  const bcStart=audience=>{if(!bcValid())return;closeSheet();api('/api/admin/broadcasts','POST',bcBody(audience)).then(r=>runBc(r.broadcast)).catch(e=>toast(BCERR[e.detail]||'Не удалось отправить'))};
  ACT.bcTest=()=>bcStart('test');
  ACT.bcAll=()=>{if(!bcValid())return;confirmSheet(`Отправить ${M.bc_lang==='all'&&A.stats?A.stats.reachable+' пользователям':'выбранной аудитории'}?`,'bcAllGo','','Отправить')};
  ACT.bcAllGo=()=>bcStart('all');

  /* ---------- moderation ---------- */
  function subCard(s){
    const up=!!s.update,kb=n=>Math.round(n/1000)+'k';
    return `<div class="card" style="margin-bottom:12px${up?';border-color:var(--acc)':''}">
      <div class="row" style="justify-content:space-between;gap:8px;margin-bottom:8px"><span class="tag acc">${up?'Обновление текста':'Новая книга'}</span><span class="mute" style="font-size:12px">${kb(s.chars)} знаков</span></div>
      <b style="font-size:15.5px">${esc(s.title)}</b>
      <div class="mute" style="font-size:12.5px;margin:3px 0 10px">${esc(s.author)}${up?'':` · ${s.lang.toUpperCase()} · ${x.gl(s.genre)}`}</div>
      ${up&&s.update?`<div class="tiles" style="grid-template-columns:repeat(3,1fr);margin-bottom:10px"><div class="tile" style="padding:10px"><b style="font-size:20px">${s.update.oldChapters}→${s.update.newChapters}</b><small>глав</small></div><div class="tile" style="padding:10px"><b style="font-size:20px">${kb(s.update.oldChars)}→${kb(s.chars)}</b><small>знаков</small></div><div class="tile" style="padding:10px"><b style="font-size:20px">${s.chars>=s.update.oldChars?'+':'−'}${kb(Math.abs(s.chars-s.update.oldChars))}</b><small>разница</small></div></div>`:''}
      ${(up?(s.update&&s.update.note):s.desc)?`<p style="font-size:13.5px;line-height:1.5;margin-bottom:10px">${up?'«'+esc(s.update.note)+'»':esc(s.desc)}</p>`:''}
      <details class="howto" style="margin-bottom:0"><summary>Начало текста</summary><p class="syn" style="font-size:13.5px;margin-top:8px;white-space:pre-wrap">${esc(s.preview)}…</p></details>
      <div class="mrow"><button class="btn sm" data-a="subApprove" data-id="${esc(s.id)}">${up?'Заменить текст':'Опубликовать'}</button><button class="btn sm ghost" data-a="subReject" data-id="${esc(s.id)}">Отклонить</button><button class="btn sm ghost" data-a="openChatWith" data-id="${esc(s.userId)}">Написать автору</button></div></div>`;
  }
  function tabModeration(){
    if(!A.subs)return loading();
    if(!A.subs.length)return empty('check','Всё проверено','Новые книги и обновления текста от авторов появятся здесь.');
    return A.subs.map(subCard).join('');
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
    return `${list}<div class="sec"><div class="sec-h"><h2>Защита от спама</h2></div>
      <details class="dgroup"><summary><b>Стоп-слова</b><span>сообщения с такими словами не публикуются</span></summary><div class="dbody"><div class="field"><label for="stw">Слова через запятую</label><textarea id="stw" class="in" data-m="adm:stopwords" style="min-height:90px" placeholder="слово1, слово2">${esc(M.stopwords)}</textarea><p class="hint">Ссылки и повторы одного сообщения блокируются автоматически. Писать чаще 6 сообщений в минуту нельзя (админов это не касается).</p></div><button class="btn block" data-a="stwSave">Сохранить стоп-слова</button></div></details></div>`;
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
  const UF=[['all','Все'],['admin','Админы'],['banned','Заблокированные'],['blocked','Бот остановлен']];
  ACT.uFilter=el=>{A.uf=el.dataset.v;x.refresh()};
  function tabUsers(){
    const u=A.users,f=A.uf||'all';
    const list=u?u.list.filter(r=>f==='all'||(f==='admin'&&r.admin)||(f==='banned'&&r.banned)||(f==='blocked'&&r.blocked)):[];
    return `<div class="searchbox" style="margin-bottom:12px">${ico('search',20)}<input id="uq" class="in" type="search" data-m="adm:uq" value="${esc(M.uq)}" placeholder="Имя или Telegram ID" autocomplete="off"></div>
    <div class="fchips">${UF.map(([k,n])=>`<button class="chip ${f===k?'on':''}" data-a="uFilter" data-v="${k}">${n}</button>`).join('')}</div>
    ${!u?loading():list.length?`<div class="list">${list.map(r=>`<div class="li" style="align-items:flex-start">${avatar(r.name||'?',1)}<div class="grow" style="min-width:0"><b style="font-size:14px">${esc(r.name||'Без имени')}</b>${r.root?' <span class="tag acc">главный админ</span>':r.admin?' <span class="tag acc">админ</span>':''}${r.banned?' <span class="tag">заблокирован</span>':''}${r.blocked?' <span class="tag">бот остановлен</span>':''}
      <div class="mute" style="font-size:12px">ID ${esc(r.id)} · был(а) ${ago(r.last_seen||r.created)}</div>
      ${r.root?'':`<div class="mrow" style="margin-top:8px"><button class="btn sm ghost" data-a="uBan" data-id="${esc(r.id)}" data-on="${r.banned?0:1}">${r.banned?'Разблокировать':'Заблокировать'}</button><button class="btn sm ghost" data-a="uAdmin" data-id="${esc(r.id)}" data-on="${r.admin?0:1}">${r.admin?'Снять админа':'Сделать админом'}</button><button class="btn sm ghost" data-a="openChatWith" data-id="${esc(r.id)}">Написать</button></div>`}</div></div>`).join('')}</div>${u.more?`<button class="btn block ghost" style="margin-top:12px" data-a="uMore">Показать ещё</button>`:''}`:empty('user','Никого не нашли',f==='all'?'Измените запрос.':'В загруженном списке нет подходящих. Попробуйте «Все» или уточните поиск.')}
    <div class="sec"><div class="sec-h"><h2>Администраторы</h2></div><details class="dgroup"><summary><b>Добавить админа по ID</b><span>человеку не нужно предварительно открывать приложение</span></summary><div class="dbody"><form class="replybox" data-f="admAdd"><input class="in" name="t" data-m="adm:admId" value="${esc(M.admId)}" inputmode="numeric" placeholder="Telegram ID, например 123456789" autocomplete="off"><button class="btn sm" style="height:42px">Добавить</button></form><p class="hint">Свой ID узнают у бота @userinfobot. Главных админов (из настроек сервера) снять нельзя.</p></div></details></div>`;
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
    const g=(title,sub,body,open)=>`<details class="dgroup" ${open?'open':''}><summary><b>${title}</b><span>${sub}</span></summary><div class="dbody">${body}</div></details>`;
    const origin=esc(location.origin);
    return `<div class="sec" style="margin-top:0"><div class="sec-h"><h2>Бот</h2></div>
    ${g('Ссылка на мини-апп',M.appLinkSaved?'<i class="dot ok"></i>задана':'<i class="dot warn"></i>не задана: «Поделиться» не открывает книги',`<div class="field"><label for="appL">Ссылка на приложение в Telegram</label><input id="appL" class="in" data-m="adm:appLink" value="${esc(M.appLink)}" placeholder="https://t.me/muloqotbooksbot/app" autocomplete="off"><p class="hint">Друг, получивший ссылку на книгу, сразу попадает в неё. Нужна и для inline-поиска.</p></div>
      <details class="howto"><summary>Где взять ссылку?</summary><ol><li>В Telegram откройте @BotFather и отправьте <b>/newapp</b>, выберите бота.</li><li>Адрес приложения: <b>${origin}</b></li><li>Короткое имя: например <b>app</b>.</li><li>BotFather пришлёт ссылку вида <b>https://t.me/muloqotbooksbot/app</b>. Вставьте её сюда.</li></ol></details>
      <button class="btn block" data-a="linkSave">Сохранить ссылку</button>`,!M.appLinkSaved)}
    ${g('Уведомления администратору','что бот присылает вам в чат',`${[['support','Сообщения от пользователей'],['submissions','Заявки на модерацию'],['reports','Жалобы'],['donations','Новые донаты']].map(([k,label])=>`<div class="field" style="margin-bottom:12px"><label for="nf_${k}">${label}</label><select id="nf_${k}" class="in" data-chg="nfSel" data-k="${k}">${[['off','Не присылать'],['silent','Тихо, без звука'],['on','Со звуком']].map(([v,n])=>`<option value="${v}" ${M.nf[k]===v?'selected':''}>${n}</option>`).join('')}</select></div>`).join('')}
      <p class="hint">Сообщения пользователей всегда видны в «Админ-панель → Чат» и в счётчиках, поэтому по умолчанию они не дублируются в бота. Под уведомлением нет кнопки открытия, чтобы не засорять чат.</p>
      <button class="btn block" style="margin-top:12px" data-a="nfSave">Сохранить</button>`)}
    ${g('Приветствие бота','сообщение на команду /start',`<div class="field"><label for="wlc">По-русски</label><textarea id="wlc" class="in" data-m="adm:welcome" style="min-height:110px">${esc(M.welcome)}</textarea></div>
      <div class="field"><label for="wlcU">O‘zbekcha</label><textarea id="wlcU" class="in" data-m="adm:welcomeUz" style="min-height:110px">${esc(M.welcomeUz)}</textarea></div>
      <p class="hint">Русский текст получают пользователи с русским Telegram, узбекский с узбекским. Пустое поле вернёт текст по умолчанию. Кнопку «Открыть приложение» бот добавляет сам.</p>
      <button class="btn block" style="margin-top:12px" data-a="wlcSave">Сохранить приветствие</button>`)}</div>
    <div class="sec"><div class="sec-h"><h2>Приложение</h2></div>
    ${g('Вопрос недели','показывается в «Сообщество → Обсуждения»',`<div class="field"><label>О какой книге</label>${pickHtml('wq_book')}</div>
      <div class="field"><label for="wqRu">Вопрос (русский)</label><textarea id="wqRu" class="in" data-m="adm:wq_ru" style="min-height:80px">${esc(M.wq_ru)}</textarea></div>
      <div class="field"><label for="wqUz">Savol (o‘zbekcha)</label><textarea id="wqUz" class="in" data-m="adm:wq_uz" style="min-height:80px">${esc(M.wq_uz)}</textarea></div><button class="btn block" data-a="wqSave">Сохранить вопрос</button>`)}
    ${g('Подборки',`${COLLECTIONS.length} шт. на главной`,`<div class="list" style="margin-bottom:12px">${cols||'<div class="li mute">Подборок нет</div>'}</div><button class="btn block ghost" data-a="colNew">+ Новая подборка</button>`)}
    ${g('Книги',`${A.adbooks.list.length} шт.: править, скрыть, удалить, история текста`,`<div class="list">${books}</div><p class="hint">Отзывы и обсуждения удаляются в «Сообществе»: у админа рядом с ними есть значок корзины.</p>`)}</div>`;
  }
  CHG.nfSel=el=>{M.nf[el.dataset.k]=el.value};
  ACT.nfSave=()=>bg(api('/api/admin/notif-settings','POST',M.nf).then(n=>{M.nf=n;toast('Сохранено')}));
  ACT.wlcSave=()=>bg(api('/api/admin/welcome','POST',{text:M.welcome,textUz:M.welcomeUz}).then(()=>toast('Приветствие сохранено')));
  ACT.linkSave=()=>{const v=M.appLink.trim();
    api('/api/admin/welcome','POST',{appLink:v}).then(r=>{M.appLink=r.appLink||'';M.appLinkSaved=M.appLink;x.S.appLink=M.appLink;toast(M.appLink?'Ссылка сохранена':'Ссылка удалена');x.refresh()})
     .catch(e=>toast(e.detail==='badlink'?'Неверный формат. Нужно: https://t.me/имя_бота/имя_приложения':'Не удалось сохранить, попробуйте ещё раз'))};
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
    <div class="lbl" style="margin-bottom:8px">Книги в подборке: выбрано ${c.size}</div><input class="in" id="colQ" data-m="adm:col_q" placeholder="Найти книгу в списке" autocomplete="off" style="margin-bottom:10px"><div class="list" id="colList" style="max-height:240px;overflow:auto;margin-bottom:14px">${BOOKS.map(b=>`<label class="li" data-t="${esc((b.title+' '+AUTH(b.a).name).toLowerCase())}" style="cursor:pointer"><input type="checkbox" data-chg="colBook" data-id="${esc(b.id)}" ${c.has(b.id)?'checked':''}><span class="grow">${esc(b.title)}</span></label>`).join('')}</div>
    <button class="btn block" data-a="colSave">Сохранить</button>${A.editId?`<button class="btn block ghost" style="margin-top:10px" data-a="colDel">Удалить подборку</button>`:''}`};
  ACT.colEdit=el=>{const c=COLLECTIONS.find(y=>y.id===el.dataset.id);A.editId=c.id;A.col=new Set(c.ids);M.col_ru=c.t.ru;M.col_uz=c.t.uz;M.col_q='';openSheet(colSheet())};
  ACT.colNew=()=>{A.editId=null;A.col=new Set();M.col_ru='';M.col_uz='';M.col_q='';openSheet(colSheet())};
  CHG.colBook=el=>{el.checked?A.col.add(el.dataset.id):A.col.delete(el.dataset.id)};
  x.ONINPUT['adm:col_q']=()=>{const q=(M.col_q||'').toLowerCase().trim();document.querySelectorAll('#colList label').forEach(l=>l.hidden=!!q&&!l.dataset.t.includes(q))};
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
