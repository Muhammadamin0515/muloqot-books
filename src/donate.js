/* Donations: reader-facing support screen (Telegram Stars + external links) and the admin "Донаты" tab. */
export function initDonate(x,adm){
  const {SCREENS,ACT,CHG,FORMS,go,api,net,toast,esc,ico,openSheet,closeSheet,empty,$,tr,tg,L}=x;
  const D={info:null,amount:50,custom:'',goal:'',anon:false,msg:'',busy:false};
  const M=x.MODEL.don={custom:'',msg:''};
  const star='⭐';
  const bar=(r,t)=>`<div class="bar" style="margin:10px 0 6px"><i style="width:${Math.min(100,Math.round(r/t*100))}%"></i></div><div class="row" style="justify-content:space-between;font-size:12.5px"><span class="mono">${star} ${r} / ${t}</span><span class="mute">${Math.min(100,Math.round(r/t*100))}%</span></div>`;
  const amount=()=>D.custom?Math.floor(+D.custom)||0:D.amount;

  async function loadInfo(){try{D.info=await api('/api/donate');if(x.NAV.cur.name==='donate')x.refresh()}catch(e){}}
  ACT.openDonate=()=>{D.custom='';M.custom='';M.msg='';D.msg='';go('donate');loadInfo()};

  SCREENS.donate=()=>{
    const i=D.info;
    const head=`<header class="topbar px"><button class="iconbtn" data-a="back" aria-label="${tr('Назад','Orqaga')}">${ico('back')}</button><div class="grow"><h2 class="display" style="font-size:22px">${tr('Поддержать проект','Loyihani qo‘llab-quvvatlash')}</h2></div></header>`;
    if(!i)return head+`<div class="px"><div class="sk" style="height:160px;border-radius:20px;margin-bottom:14px"></div><div class="sk" style="height:200px;border-radius:20px"></div></div>`;
    const st=i.settings,a=amount(),canPay=i.stars&&tg.isTelegram();
    const goals=i.goals.length?`<section class="sec" style="margin-top:24px"><div class="sec-h"><h2>${tr('На что собираем','Nimaga yig‘ilmoqda')}</h2></div>
      <button class="card goalopt ${D.goal===''?'sel':''}" data-a="dGoal" data-id="" style="width:100%;text-align:left;margin-bottom:10px"><b>${tr('Общее развитие','Umumiy rivojlanish')}</b><div class="mute" style="font-size:13px">${tr('Новые книги, авторы, улучшения приложения','Yangi kitoblar, mualliflar, ilovani yaxshilash')}</div></button>
      ${i.goals.map(g=>`<button class="card goalopt ${D.goal===g.id?'sel':''}" data-a="dGoal" data-id="${esc(g.id)}" style="width:100%;text-align:left;margin-bottom:10px"><b>${esc(L(g.title))}</b>${g.desc&&L(g.desc)?`<div class="mute" style="font-size:13px;margin-top:2px">${esc(L(g.desc))}</div>`:''}${bar(g.raised,g.target)}</button>`).join('')}</section>`:'';
    const links=st.links.length?`<section class="sec" style="margin-top:22px"><div class="lbl" style="margin-bottom:10px">${tr('Другие способы','Boshqa usullar')}</div>${st.links.map(l=>`<button class="btn block ghost" style="margin-bottom:8px" data-a="dLink" data-u="${esc(l.url)}">${esc(l.title)} ${ico('arrow',16)}</button>`).join('')}</section>`:'';
    const wall=i.top.length?`<section class="sec" style="margin-top:28px"><div class="sec-h"><h2>${tr('Наши меценаты','Homiylarimiz')}</h2></div><div class="list">${i.top.map((u,k)=>`<div class="li"><span style="width:26px;font-size:18px">${['🥇','🥈','🥉'][k]||star}</span><span class="grow" style="font-weight:600">${esc(u.name)}</span><span class="mono">${star} ${u.total}</span></div>`).join('')}</div></section>`:'';
    const notes=i.recent.length?`<section class="sec" style="margin-top:22px"><div class="lbl" style="margin-bottom:10px">${tr('Слова поддержки','Yaxshi so‘zlar')}</div>${i.recent.map(r=>`<div class="card" style="margin-bottom:8px"><b style="font-size:13.5px">${esc(r.name)}</b> <span class="mute" style="font-size:12px">${star} ${r.amount}</span><p style="font-size:14px;margin-top:4px">${esc(r.message)}</p></div>`).join('')}</section>`:'';
    return `${head}<div class="px">
      <div class="don-hero cine"><div style="font-size:34px;line-height:1">💛</div><h1 class="display" style="font-size:24px;margin:10px 0 8px">${tr('Помогите Muloqot Books расти','Muloqot Books o‘sishiga yordam bering')}</h1><p style="color:#e5d8c6;font-size:14.5px;line-height:1.55">${esc(L(st.intro))}</p>
      ${i.mine?`<div style="margin-top:14px"><span class="tag acc" style="background:rgba(255,255,255,.14);color:#fff">${star} ${tr('Вы поддержали на','Siz qo‘llab-quvvatladingiz:')} ${i.mine}</span></div>`:''}</div>
      ${goals}
      <section class="sec" style="margin-top:24px"><div class="sec-h"><h2>${tr('Сумма','Miqdor')}</h2></div><div class="gen">${st.presets.map(n=>`<button class="chip ${!D.custom&&D.amount===n?'on':''}" data-a="dAmt" data-v="${n}">${star} ${n}</button>`).join('')}</div>
      <div class="field" style="margin-top:14px"><label for="dCustom">${tr('Своя сумма (Stars)','O‘z miqdoringiz (Stars)')}</label><input id="dCustom" class="in" inputmode="numeric" data-m="don:custom" value="${esc(M.custom)}" placeholder="например, 150" autocomplete="off"></div>
      <div class="field"><label for="dMsg">${tr('Сообщение (необязательно)','Xabar (ixtiyoriy)')}</label><textarea id="dMsg" class="in" data-m="don:msg" maxlength="200" style="min-height:80px" placeholder="${tr('Пара тёплых слов команде','Jamoaga iliq so‘zlar')}">${esc(M.msg)}</textarea></div>
      <div class="li card" style="margin-bottom:16px"><span class="grow" style="font-weight:600">${tr('Скрыть моё имя','Ismimni yashirish')}</span><button class="sw ${D.anon?'on':''}" role="switch" aria-checked="${D.anon}" data-a="dAnon"></button></div>
      <button class="btn block" data-a="dPay" ${D.busy||a<1||!canPay?'disabled':''}>${D.busy?tr('Открываем оплату…','To‘lov ochilmoqda…'):`${star} ${tr('Поддержать на','Qo‘llab-quvvatlash:')} ${a||0}`}</button>
      ${!i.stars?`<p class="mute" style="font-size:12.5px;margin-top:10px">${tr('Оплата Stars пока не подключена администратором.','Stars orqali to‘lov hali ulanmagan.')}</p>`:!tg.isTelegram()?`<p class="mute" style="font-size:12.5px;margin-top:10px">${tr('Оплата доступна в приложении Telegram.','To‘lov faqat Telegram ilovasida mavjud.')}</p>`:`<p class="mute" style="font-size:12px;margin-top:10px">${tr('Оплата через Telegram Stars. Это добровольное пожертвование.','Telegram Stars orqali to‘lov. Bu ixtiyoriy xayriya.')}</p>`}</section>
      ${links}${wall}${notes}</div>`;
  };
  ACT.dGoal=el=>{D.goal=el.dataset.id;x.refresh()};
  ACT.dAmt=el=>{D.amount=+el.dataset.v;D.custom='';M.custom='';x.refresh()};
  ACT.dAnon=()=>{D.anon=!D.anon;x.refresh()};
  ACT.dLink=el=>tg.openLink(el.dataset.u);
  x.ONINPUT['don:custom']=el=>{D.custom=M.custom=el.value.replace(/\D/g,'').slice(0,6);if(el.value!==D.custom)el.value=D.custom;const b=$('[data-a="dPay"]');if(b&&!D.busy)b.textContent=`${star} ${tr('Поддержать на','Qo‘llab-quvvatlash:')} ${amount()||0}`};
  ACT.dPay=async()=>{
    const a=amount();if(a<1||D.busy)return;D.busy=true;x.refresh();
    try{
      const r=await api('/api/donate/invoice','POST',{amount:a,goalId:D.goal||null,anon:D.anon,message:M.msg});
      const opened=tg.openInvoice(r.link,async status=>{
        D.busy=false;
        if(status==='paid'){tg.notify('success');toast(tr('Спасибо за поддержку! 💛','Yordamingiz uchun rahmat! 💛'));setTimeout(loadInfo,1500);setTimeout(loadInfo,5000);if(x.S.me)x.S.me.donated=(x.S.me.donated||0)+a;M.msg='';D.msg=''}
        else if(status==='failed')toast(tr('Оплата не прошла','To‘lov amalga oshmadi'));
        x.refresh();
      });
      if(!opened){D.busy=false;toast(tr('Откройте приложение в Telegram','Ilovani Telegramda oching'));x.refresh()}
    }catch(e){D.busy=false;toast(tr('Не удалось создать платёж','To‘lov yaratib bo‘lmadi'));x.refresh()}
  };

  /* ---------- admin tab ---------- */
  if(!adm)return;
  const {A,M:AM,load,bg,ago,hm,loading,confirmSheet,reload}=adm;
  AM.d_presets='';AM.d_links='';AM.d_introRu='';AM.d_introUz='';AM.d_thanksRu='';AM.d_thanksUz='';AM.d_patron='';AM.m_amount='';AM.m_name='';AM.m_goal='';
  AM.g_ru='';AM.g_uz='';AM.g_dru='';AM.g_duz='';AM.g_target='';AM.g_active=true;
  let gid=null;
  const fillSettings=s=>{AM.d_presets=s.presets.join(', ');AM.d_links=s.links.map(l=>`${l.title} | ${l.url}`).join('\n');AM.d_introRu=s.intro.ru;AM.d_introUz=s.intro.uz;AM.d_thanksRu=s.thanks.ru;AM.d_thanksUz=s.thanks.uz;AM.d_patron=String(s.patronMin)};
  const hint=t=>`<p class="hint">${t}</p>`;
  const group=(title,sub,body,open)=>`<details class="dgroup" ${open?'open':''}><summary><b>${title}</b><span>${sub}</span></summary><div class="dbody">${body}</div></details>`;
  function tabDonations(){
    const d=A.dons;if(!d)return loading();
    const hookOk=d.hook&&/\/telegram\/webhook$/.test(d.hook.url);
    const setup=!d.bot?`<div class="demo-banner">Бот не подключён: добавьте секрет BOT_TOKEN в настройках Worker.</div>`
      :`<div class="card" style="margin-bottom:14px"><b>${hookOk?'✅ Платежи подключены':'⚠️ Платежи ещё не подключены'}</b><p class="mute" style="font-size:12.5px;margin:6px 0 10px">${hookOk?`Всё работает. Ожидают обработки: ${d.hook.pending}${d.hook.error?` · последняя ошибка: ${esc(d.hook.error)}`:''}`:'Нажмите кнопку, и бот начнёт принимать Stars.'}</p><button class="btn sm ${hookOk?'ghost':''}" data-a="dHook">${hookOk?'Обновить настройки бота':'Подключить платежи'}</button></div>`;
    const goals=d.goals.map(g=>`<div class="li" style="align-items:flex-start;flex-direction:column;gap:4px"><div class="row" style="width:100%;justify-content:space-between"><b style="font-size:14px">${esc(g.title.ru)}</b>${g.active?'':'<span class="tag">закрыта</span>'}</div>${bar(g.raised,g.target)}<div class="row" style="gap:8px;margin-top:6px"><button class="btn sm ghost" data-a="gEdit" data-id="${esc(g.id)}">Править</button><button class="btn sm ghost" data-a="gDel" data-id="${esc(g.id)}">Удалить</button></div></div>`).join('');
    const rows=d.list.map(r=>`<div class="li" style="align-items:flex-start"><div class="grow" style="min-width:0"><b style="font-size:14px">${star} ${r.amount}</b> <span class="mute" style="font-size:12.5px">${r.anon?'аноним':esc(r.user_name||'—')}${r.source==='manual'?' · вручную':''}</span>${r.status==='refunded'?' <span class="tag">возврат</span>':''}${r.message?`<div style="font-size:13px;margin-top:2px">«${esc(r.message)}»</div>`:''}${r.note?`<div class="mute" style="font-size:12px">${esc(r.note)}</div>`:''}<div class="mute" style="font-size:11.5px">${hm(r.paid_at||r.created)}</div></div>${r.status==='paid'&&r.source==='stars'?`<button class="btn sm ghost" data-a="dRefund" data-id="${esc(r.id)}">Вернуть</button>`:''}</div>`).join('');
    const where=[['🏠','Главная','баннер «Поддержать проект» (со шкалой цели, если она есть)'],['👤','Профиль','кнопка «Поддержать проект»'],['📖','Конец книги','кнопка «💛 Поддержать» после прочтения'],['💛','Экран доната','текст, цели, суммы, стена меценатов и слова поддержки'],['⭐','Отзывы','значок ⭐ рядом с именем мецената (от '+(d.settings.patronMin)+' Stars)']];
    const tile=(n,l,sub)=>`<div class="tile"><b>${n}</b><span>${l}</span>${sub?`<small>${sub}</small>`:''}</div>`;
    const settings=[group('Суммы на кнопках','какие суммы предложить читателю',`<div class="field"><label for="dsP">Суммы в Stars через запятую</label><input id="dsP" class="in" data-m="adm:d_presets" value="${esc(AM.d_presets)}" placeholder="25, 50, 100, 250">${hint('Кнопки выбора суммы на экране доната. Читатель также может ввести свою сумму.')}</div>`),
      group('Текст на экране доната','что написано вверху',`<div class="field"><label for="dsIR">По-русски</label><textarea id="dsIR" class="in" data-m="adm:d_introRu" style="min-height:100px">${esc(AM.d_introRu)}</textarea></div><div class="field"><label for="dsIU">O‘zbekcha</label><textarea id="dsIU" class="in" data-m="adm:d_introUz" style="min-height:100px">${esc(AM.d_introUz)}</textarea>${hint('Объясните, на что идут деньги. Читатель видит текст на своём языке интерфейса.')}</div>`),
      group('Сообщение «Спасибо» от бота','после успешной оплаты',`<div class="field"><label for="dsTR">По-русски</label><input id="dsTR" class="in" data-m="adm:d_thanksRu" value="${esc(AM.d_thanksRu)}"></div><div class="field"><label for="dsTU">O‘zbekcha</label><input id="dsTU" class="in" data-m="adm:d_thanksUz" value="${esc(AM.d_thanksUz)}">${hint('Бот отправляет это в личные сообщения сразу после платежа.')}</div>`),
      group('Другие способы оплаты','Click, Payme, карта и т. д.',`<div class="field"><label for="dsL">Кнопки со ссылками</label><textarea id="dsL" class="in" data-m="adm:d_links" style="min-height:90px" placeholder="Click | https://my.click.uz/...&#10;Payme | https://payme.uz/...">${esc(AM.d_links)}</textarea>${hint('По одной на строку: название, чёрточка |, ссылка (https). Появятся кнопками под суммой. Такие платежи Telegram не видит, записывайте их ниже в «Записать перевод вручную».')}</div>`),
      group('Значок мецената','⭐ рядом с именем в отзывах',`<div class="field"><label for="dsM">С какой суммы выдавать значок (Stars)</label><input id="dsM" class="in" inputmode="numeric" data-m="adm:d_patron" value="${esc(AM.d_patron)}" placeholder="50">${hint('Кто пожертвовал в сумме не меньше этого, получает ⭐ в отзывах и подпись «меценат» в профиле.')}</div>`)].join('');
    return `<div class="tiles">${tile(d.total+' ⭐','Всего собрано',`${d.count} платежей`)}${tile(d.last30+' ⭐','За 30 дней','')}${tile(d.donors,'Доноров','')}${tile(d.balance!=null?d.balance+' ⭐':'—','Баланс бота',d.balance!=null?'доступно к выводу в Telegram':'обновится позже')}</div>
    <p class="hint" style="margin:10px 0 18px">Как вывести: Telegram → ваш бот → Баланс → вывод через Fragment в TON.</p>
    ${setup}
    <div class="sec"><div class="sec-h"><h2>Цели сбора</h2><button class="link acc" data-a="gNew">+ Новая</button></div>${hint('Цель показывается читателям шкалой: «Новая книга ⭐ 600 / 1000». Донор выбирает, на что пойдёт поддержка.')}${goals?`<div class="list" style="margin-top:10px">${goals}</div>`:'<p class="mute" style="margin-top:10px">Целей пока нет. Нажмите «+ Новая».</p>'}</div>
    <div class="sec"><div class="sec-h"><h2>Последние платежи</h2></div>${rows?`<div class="list">${rows}</div>`:'<p class="mute">Платежей пока нет</p>'}</div>
    <div class="sec"><div class="sec-h"><h2>Настройки экрана донатов</h2></div>${settings}<button class="btn block" style="margin-top:12px" data-a="dSaveSettings">Сохранить настройки</button></div>
    <div class="sec"><div class="sec-h"><h2>Другое</h2></div>
    ${group('Записать перевод вручную','для карты и Click: попадёт в цель и в список',`${hint('Вам перевели деньги другим способом? Запишите сумму, и она попадёт в шкалу цели и в список платежей.')}
      <div class="row" style="gap:10px;align-items:flex-start;margin-top:12px"><div class="field grow"><label for="mA">Сколько Stars</label><input id="mA" class="in" inputmode="numeric" data-m="adm:m_amount" value="${esc(AM.m_amount)}" placeholder="100"></div><div class="field grow"><label for="mN">Кто (необязательно)</label><input id="mN" class="in" data-m="adm:m_name" value="${esc(AM.m_name)}" placeholder="Имя"></div></div>
      <div class="field"><label for="mG">На какую цель</label><select id="mG" class="in" data-chg="mGoal"><option value="">Общее развитие</option>${d.goals.map(g=>`<option value="${esc(g.id)}" ${AM.m_goal===g.id?'selected':''}>${esc(g.title.ru)}</option>`).join('')}</select></div>
      <button class="btn block ghost" data-a="dManual">Записать</button>`)}
    ${group('Где читатели видят донаты','главная, профиль, конец книги, экран доната',`<div class="list" style="margin-bottom:12px">${where.map(([i,a,b])=>`<div class="li" style="align-items:flex-start"><span style="font-size:20px;width:28px">${i}</span><div class="grow"><b style="font-size:14px">${a}</b><div class="mute" style="font-size:12.5px">${b}</div></div></div>`).join('')}</div><button class="btn block ghost" data-a="dPreview">👁 Посмотреть как читатель</button>`)}</div>`;
  }
  ACT.dPreview=()=>{D.info=null;go('donate');loadInfo()};
  adm.T.push(['donations','Донаты']);
  adm.bodies.donations=tabDonations;
  adm.loaders.donations=()=>load('dons',()=>api('/api/admin/donations')).then(()=>{if(A.dons){fillSettings(A.dons.settings);if(adm.here('admin'))x.refresh()}});
  CHG.mGoal=el=>{AM.m_goal=el.value};
  ACT.dHook=el=>{el.disabled=true;bg(api('/api/admin/webhook/setup','POST',{}).then(r=>{toast(r.ok?(r.bot?'Бот и платежи настроены':'Платежи подключены, команды бота не применились'):'Ошибка: '+r.description);reload('donations')}))};
  ACT.dSaveSettings=()=>{
    const links=AM.d_links.split('\n').map(l=>l.split('|').map(s=>s.trim())).filter(p=>p.length>=2).map(([title,url])=>({title,url}));
    bg(api('/api/admin/donate-settings','POST',{presets:AM.d_presets.split(/[,\s]+/).filter(Boolean),links,introRu:AM.d_introRu,introUz:AM.d_introUz,thanksRu:AM.d_thanksRu,thanksUz:AM.d_thanksUz,patronMin:AM.d_patron}).then(()=>{toast('Сохранено');reload('donations')}))};
  ACT.dManual=()=>{const a=Math.floor(+AM.m_amount);if(!(a>=1)){toast('Введите сумму');return}
    bg(api('/api/admin/donations/manual','POST',{amount:a,name:AM.m_name,goalId:AM.m_goal}).then(()=>{AM.m_amount='';AM.m_name='';toast('Добавлено');reload('donations')}))};
  ACT.dRefund=el=>confirmSheet('Вернуть Stars донору?','dRefundGo',el.dataset.id,'Вернуть');
  ACT.dRefundGo=el=>{closeSheet();bg(api(`/api/admin/donations/${el.dataset.id}/refund`,'POST',{}).then(()=>{toast('Возврат выполнен');reload('donations')}))};
  const goalSheet=()=>`<h2>${gid?'Правка цели':'Новая цель'}</h2><div class="field"><label for="gR">Название (русский)</label><input id="gR" class="in" data-m="adm:g_ru" value="${esc(AM.g_ru)}" placeholder="Новая книга"></div><div class="field"><label for="gU">Nomi (o‘zbekcha)</label><input id="gU" class="in" data-m="adm:g_uz" value="${esc(AM.g_uz)}"></div>
    <div class="field"><label for="gDR">Описание (русский)</label><textarea id="gDR" class="in" data-m="adm:g_dru" style="min-height:70px">${esc(AM.g_dru)}</textarea></div><div class="field"><label for="gDU">Tavsif (o‘zbekcha)</label><textarea id="gDU" class="in" data-m="adm:g_duz" style="min-height:70px">${esc(AM.g_duz)}</textarea></div>
    <div class="field"><label for="gT">Цель, Stars</label><input id="gT" class="in" inputmode="numeric" data-m="adm:g_target" value="${esc(AM.g_target)}"></div>
    <label class="li card" style="margin-bottom:14px;cursor:pointer"><input type="checkbox" data-chg="gActive" ${AM.g_active?'checked':''}><span class="grow">Сбор активен</span></label><button class="btn block" data-a="gSave">Сохранить</button>`;
  CHG.gActive=el=>{AM.g_active=el.checked};
  ACT.gNew=()=>{gid=null;Object.assign(AM,{g_ru:'',g_uz:'',g_dru:'',g_duz:'',g_target:'',g_active:true});openSheet(goalSheet())};
  ACT.gEdit=el=>{const g=A.dons.goals.find(y=>y.id===el.dataset.id);gid=g.id;Object.assign(AM,{g_ru:g.title.ru,g_uz:g.title.uz,g_dru:g.desc.ru,g_duz:g.desc.uz,g_target:String(g.target),g_active:g.active});openSheet(goalSheet())};
  ACT.gSave=()=>{if(!AM.g_ru.trim()||!(+AM.g_target>=1)){toast('Нужно название и сумма');return}closeSheet();
    bg(api('/api/admin/goals','POST',{id:gid,titleRu:AM.g_ru,titleUz:AM.g_uz,descRu:AM.g_dru,descUz:AM.g_duz,target:AM.g_target,active:AM.g_active}).then(async()=>{toast('Сохранено');await x.loadBoot();reload('donations')}))};
  ACT.gDel=el=>confirmSheet('Удалить цель? Донаты останутся в общем зачёте.','gDelGo',el.dataset.id,'Удалить');
  ACT.gDelGo=el=>{closeSheet();bg(api(`/api/admin/goals/${el.dataset.id}/delete`,'POST',{}).then(async()=>{await x.loadBoot();reload('donations')}))};
}
