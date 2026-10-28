/* Admin → Каталог: adding real books, confirming the right to publish their text, audio files and the demo-data switch. */
import {readManuscriptFull,analyze,detectLang,titleFromFile,textBytes,MAX_TEXT_BYTES,MAX_FILE} from './manuscript.js';
import {compressImage} from './image.js';

const GENRE_RU={novel:'Роман',detective:'Детектив',historical:'Исторический',adventure:'Приключения',drama:'Драма',stories:'Рассказы',modern:'Современная проза',prose:'Проза',poetry:'Поэзия',publicism:'Публицистика'};
const STATUS=[['public_domain','Общественное достояние'],['permission','Разрешение правообладателя'],['licensed','Лицензия'],['author','Автор подтвердил права'],['unverified','Права не подтверждены (только карточка)']];
const REVIEW={not_in_info_csv:'Нет в info.csv источника: год не подтверждён',no_info_csv:'В папке источника нет info.csv: год неизвестен',csv_name_fuzzy_match:'Название сопоставлено с info.csv приблизительно',encoding:'Файл был не в UTF-8',author_header_conflict:'Автор в файле не совпадает с автором папки',very_short:'Очень короткий текст',author_not_in_curated_mapping:'Автор определён только по заголовкам файлов',author_single_vote:'Автор определён по одному файлу',author_unresolved_folder_name_used:'Автор не определён: взято имя папки',unexpected_folder_layout:'Нестандартное расположение файла',possible_duplicate_title:'Похожее название и автор: возможный дубль',no_structure_detected:'Структура глав не найдена',not_mostly_cyrillic:'Текст не похож на русский',replacement_characters:'В тексте есть повреждённые символы'};
const reviewText=k=>{const [c,arg]=String(k).split(/:(.*)/s);return (REVIEW[c]||c)+(arg?` (${arg})`:'')};
const STATUS_LABEL=Object.fromEntries(STATUS);
const ERR={title:'Укажите название',author:'Укажите автора',lang:'Язык: ru или uz',genre:'Выберите жанр из списка',source:'Укажите источник (название)',
  rights_required:'Для публикации текста выберите подтверждённое основание прав',pd_not_proven:'Общественное достояние: нужен год смерти автора не позже (текущий год − 71). Иначе выберите другое основание',
  evidence:'Для этого основания нужна ссылка (https) или описание документа',toolarge:'Текст больше 1,4 МБ: разделите книгу',manuscript:'Не удалось выделить главы из текста',duplicate:'Такая книга уже есть',
  rights:'Нет подтверждённых прав: аудио и текст недоступны',no_file:'У книги нет готового файла текста',meta_review_required:'Сначала подтвердите, что автор, название и год проверены',lazy_book:'Текст импортированной книги меняется повторным импортом (скрипт ruslit)',url:'Ссылки на аудио должны начинаться с https://',empty:'Нечего импортировать'};
export function initCatalogAdmin(x,adm){
  const {ACT,CHG,api,toast,esc,ico,openSheet,closeSheet,setSheet,loadBoot,tg}=x;
  const {A,M,T,bodies,loaders,hm,loading,bg}=adm;
  Object.assign(M,{ci_title:'',ci_author:'',ci_lang:'ru',ci_genre:'novel',ci_year:'',ci_series:'',ci_seriesNo:'',ci_desc:'',ci_orig:'',ci_transl:'',ci_publ:'',ci_isbn:'',ci_srcName:'',ci_srcUrl:'',ci_coverUrl:'',
    ci_status:'public_domain',ci_license:'',ci_evid:'',ci_note:'',ci_death:'',ci_json:'',rt_status:'public_domain',rt_license:'',rt_evid:'',rt_note:'',rt_death:'',rt_src:'',rt_srcUrl:'',au_list:''});
  const CI={text:'',file:'',info:null,cover:null,coverName:'',busy:false,msg:null,filter:'all',json:null,shown:40};
  let L=null; // {books, demo, audit}
  const OPEN={};document.addEventListener('toggle',e=>{const d=e.target;if(d&&d.dataset&&d.dataset.cg)OPEN[d.dataset.cg]=d.open},true);
  const num=v=>v===''||v==null?null:Math.round(+v);
  const msgOf=r=>r.error?`<span class="bad">✕ ${esc(r.title||'')}: ${esc(ERR[r.error]||r.error)}</span>`:`<span class="ok">✓ ${esc(r.title)} ${r.fullText?'(текст)':'(только карточка)'}</span>`;

  function stats(){
    const real=L.books.filter(b=>!b.demo&&b.publish!=='draft'),full=real.filter(b=>b.fullText),meta=real.filter(b=>!b.fullText),check=real.filter(b=>b.publish!=='draft'&&(b.rights.status==='unverified'||b.rights.legacy)),drafts=real.filter(b=>b.publish==='draft');
    const tile=(n,l,sub)=>`<div class="tile"><b>${n}</b><span>${l}</span>${sub?`<small>${sub}</small>`:''}</div>`;
    return `<div class="tiles">${tile(real.length,'Опубликовано')}${tile(full.length,'С полным текстом')}${tile(meta.length,'Только карточка')}${tile(check.length,'Проверить права')}${drafts.length?tile(drafts.length,'Черновиков','не видны читателям'):''}</div>`;
  }
  function demoBlock(){
    const d=L.demo,c=d.counts||{};
    return `<div class="card" style="margin:14px 0"><b>Тестовые данные</b><p class="mute" style="font-size:12.5px;margin:6px 0 10px">${c.demo||0} вымышленных книг с образцами текста. Они не смешиваются с настоящим каталогом: пока настоящих книг нет, показываются автоматически, затем скрываются.</p>
      <div class="seg mini">${[['auto','Авто'],['true','Показывать'],['false','Скрыть']].map(([v,n])=>`<button class="${String(d.show)===v?'on':''}" data-a="ciDemo" data-v="${v}">${n}</button>`).join('')}</div>
      <p class="hint" style="margin-top:8px">Сейчас читатели видят: ${d.visible?'тестовые данные':'только настоящий каталог'}.</p>
      ${c.demo&&c.real?`<button class="btn sm ghost" style="margin-top:10px;color:var(--err,#e5604a)" data-a="ciDemoPurge">Удалить все тестовые данные навсегда (${c.demo} книг)</button>`:''}</div>`;
  }
  const field=(id,label,key,ph='',type='text')=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" class="in" type="${type}" data-m="adm:${key}" value="${esc(M[key])}" placeholder="${esc(ph)}" autocomplete="off"></div>`;
  const rightsFields=(p)=>`<div class="field"><label for="${p}St">Основание для публикации полного текста</label><select id="${p}St" class="in" data-chg="ciSel" data-k="${p==='ci'?'ci_status':'rt_status'}">${STATUS.map(([v,n])=>`<option value="${v}" ${M[p==='ci'?'ci_status':'rt_status']===v?'selected':''}>${n}</option>`).join('')}</select></div>
    ${field(p+'Lic','Лицензия / условия','ci_license'.replace('ci',p==='ci'?'ci':'rt'),'например: Public Domain, CC BY-SA 4.0')}
    ${field(p+'Ev','Ссылка на подтверждение (https)',p==='ci'?'ci_evid':'rt_evid','страница источника или документ')}
    <div class="field"><label for="${p}Nt">Описание документа, если ссылки нет</label><textarea id="${p}Nt" class="in" data-m="adm:${p==='ci'?'ci_note':'rt_note'}" style="min-height:60px">${esc(M[p==='ci'?'ci_note':'rt_note'])}</textarea></div>
    ${field(p+'Dt','Год смерти автора (для общественного достояния)',p==='ci'?'ci_death':'rt_death','например 1910','number')}`;
  function importForm(){
    return `<div class="field"><label>Файл книги (необязательно)</label><label class="drop" for="ciFile">${ico('file',24)}<div class="grow"><b>${CI.busy?'Читаем файл…':CI.file?esc(CI.file):'.epub · .docx · .pdf · .txt · .md'}</b><div class="mute" style="font-size:12.5px;font-weight:500">${CI.info?`${CI.info.chapters.length} глав · ${CI.info.words.toLocaleString('ru')} слов`:'Без файла будет создана только карточка'}</div></div>${ico('upload',20)}</label>
      <input id="ciFile" type="file" accept=".epub,.docx,.pdf,.txt,.md" data-chg="ciFile" style="position:absolute;opacity:0;width:1px;height:1px"></div>
    ${field('ciT','Название','ci_title')}${field('ciA','Автор','ci_author')}
    <div class="row" style="gap:10px"><div class="field grow"><label for="ciL">Язык</label><select id="ciL" class="in" data-chg="ciSel" data-k="ci_lang"><option value="ru" ${M.ci_lang==='ru'?'selected':''}>Русский</option><option value="uz" ${M.ci_lang==='uz'?'selected':''}>Oʻzbekcha</option></select></div>
      <div class="field grow"><label for="ciG">Жанр</label><select id="ciG" class="in" data-chg="ciSel" data-k="ci_genre">${Object.entries(GENRE_RU).map(([v,n])=>`<option value="${v}" ${M.ci_genre===v?'selected':''}>${n}</option>`).join('')}</select></div></div>
    <div class="row" style="gap:10px">${field('ciY','Год','ci_year','','number')}${field('ciSe','Серия','ci_series')}${field('ciSn','№ в серии','ci_seriesNo','','number')}</div>
    <div class="field"><label for="ciD">Аннотация</label><textarea id="ciD" class="in" data-m="adm:ci_desc" style="min-height:90px">${esc(M.ci_desc)}</textarea></div>
    ${field('ciO','Оригинальное название','ci_orig')}${field('ciTr','Переводчик','ci_transl')}${field('ciP','Издатель','ci_publ')}${field('ciI','ISBN','ci_isbn')}
    <div class="lbl" style="margin:16px 0 8px">Источник данных</div>${field('ciSn2','Название источника','ci_srcName','например: Wikisource, Project Gutenberg, издательство')}${field('ciSu','Ссылка на источник (https)','ci_srcUrl')}
    <div class="lbl" style="margin:16px 0 8px">Обложка</div>
    <label class="drop" for="ciCover">${CI.cover?`<img src="${CI.cover}" alt="" style="width:40px;height:60px;object-fit:cover;border-radius:4px">`:ico('upload',24)}<div class="grow"><b>${CI.cover?esc(CI.coverName):'Загрузить картинку'}</b><div class="mute" style="font-size:12.5px;font-weight:500">Сжимается автоматически</div></div></label><input id="ciCover" type="file" accept="image/*" data-chg="ciCover" style="position:absolute;opacity:0;width:1px;height:1px">
    ${field('ciCu','или ссылка на обложку (Open Library, Wikimedia, Gutenberg)','ci_coverUrl','https://covers.openlibrary.org/b/id/…-L.jpg')}
    <div class="lbl" style="margin:16px 0 8px">Права</div>${rightsFields('ci')}
    ${CI.msg?`<div class="card" style="margin:12px 0;font-size:13px">${CI.msg}</div>`:''}
    <button class="btn block" data-a="ciSubmit" ${CI.busy?'disabled':''}>${CI.busy?'Сохраняем…':'Добавить в каталог'}</button>`;
  }
  const jsonHelp=`[
 {"title":"…","author":"…","lang":"ru","genre":"novel","year":1900,
  "description":"…","source":{"name":"Wikisource","url":"https://…"},
  "authorDeathYear":1910,
  "rights":{"status":"public_domain","license":"PD"},
  "coverUrl":"https://covers.openlibrary.org/…","text":"# Глава 1\\n\\n…"}
]`;
  function bookRow(b){
    const r=b.rights,chip=(t,c)=>`<span class="tag ${c||''}">${t}</span>`,lit=b.lit,draft=b.publish==='draft';
    return `<div class="li" style="align-items:flex-start"><div class="grow" style="min-width:0"><b style="font-size:14px">${esc(b.title)}</b>
      <div class="row" style="gap:6px;margin:4px 0;flex-wrap:wrap">${b.demo?chip('ТЕСТ'):''}${draft?chip('ЧЕРНОВИК'):''}${chip(b.fullText?'ТЕКСТ':b.lazy&&!b.ver?'НЕТ ФАЙЛА':'КАРТОЧКА',b.fullText?'acc':'')}${chip(esc(STATUS_LABEL[r.status]||(r.status==='demo'?'Тестовые данные':r.status)))}${r.legacy?chip('ПРОВЕРИТЬ'):''}${lit&&lit.metaStatus==='needs_review'&&!lit.metaConfirmed?chip('МЕТАДАННЫЕ ПРОВЕРИТЬ'):''}</div>
      ${r.source?`<div class="mute" style="font-size:12px">Источник: ${esc(r.source)}${lit&&lit.commit?` · ${esc(lit.commit.slice(0,8))}`:''}</div>`:''}
      ${lit&&lit.path?`<div class="mute" style="font-size:11.5px;word-break:break-all">${esc(lit.path)}</div>`:''}
      <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn sm ghost" data-a="ciRights" data-id="${esc(b.id)}">Права</button>${b.lazy?'':`<button class="btn sm ghost" data-a="ciText" data-id="${esc(b.id)}">${b.chapters?'Заменить текст':'Добавить текст'}</button>`}<button class="btn sm ghost" data-a="ciAudio" data-id="${esc(b.id)}">Аудио</button>${b.demo?'':`<button class="btn sm ${draft?'':'ghost'}" data-a="ciPublish" data-id="${esc(b.id)}">${draft?'Опубликовать…':'Снять с публикации'}</button>`}${lit&&lit.sourceUrl?`<button class="btn sm ghost" data-a="ciOpen" data-u="${esc(lit.sourceUrl)}">Источник</button>`:''}</div></div></div>`;
  }
  function tabCatalog(){
    if(!L)return loading();
    const f=CI.filter,list=L.books.filter(b=>f==='all'?true:f==='check'?(b.rights.status==='unverified'||b.rights.legacy)&&!b.demo&&b.publish!=='draft':f==='draft'?b.publish==='draft':f==='metareview'?!!(b.lit&&b.lit.metaStatus==='needs_review'&&!b.lit.metaConfirmed):f==='demo'?b.demo:f==='meta'?!b.fullText&&!b.demo&&b.publish!=='draft':!b.demo&&b.publish!=='draft');
    const g=(title,sub,body)=>`<details class="dgroup" data-cg="${title}" ${OPEN[title]?'open':''}><summary><b>${title}</b><span>${sub}</span></summary><div class="dbody">${body}</div></details>`;
    return `${stats()}${demoBlock()}
    <div class="sec"><div class="sec-h"><h2>Добавить</h2></div>
    ${g('Одна книга','файл или только карточка, с обязательным указанием источника и прав',importForm())}
    ${g('Пакетный импорт (JSON)','список книг из подготовленного файла',`<p class="hint" style="margin:0 0 8px">Формат записи (до 8 за запрос, приложение отправляет пачками). Текст принимается только при подтверждённых правах; без них книга станет карточкой.</p><pre class="codebox">${esc(jsonHelp)}</pre>
      <div class="field"><label for="ciJ">Вставьте JSON</label><textarea id="ciJ" class="in" data-m="adm:ci_json" style="min-height:120px;font-family:var(--mono,monospace);font-size:12px">${esc(M.ci_json)}</textarea></div>
      ${CI.json?`<div class="card" style="margin:10px 0;font-size:13px">${CI.json.map(msgOf).join('<br>')}</div>`:''}<button class="btn block" data-a="ciJson" ${CI.busy?'disabled':''}>Импортировать</button>`)}</div>
    <div class="sec"><div class="sec-h"><h2>Книги и права</h2></div>
    <div class="hs" style="margin-bottom:10px">${[['all','Все'],['real','Опубликованные'],['draft','Черновики'],['metareview','Проверить метаданные'],['check','Проверить права'],['meta','Только карточка'],['demo','Тестовые']].map(([k,n])=>`<button class="chip ${f===k?'on':''}" data-a="ciFilter" data-v="${k}">${n}</button>`).join('')}</div>
    <div class="list">${list.slice(0,CI.shown).map(bookRow).join('')||'<div class="li mute">Нет книг</div>'}</div>${list.length>CI.shown?`<button class="btn block ghost" style="margin-top:10px" data-a="ciMore">Показать ещё (${list.length-CI.shown})</button>`:''}<p class="hint">Всего в списке: ${list.length}</p>
    <p class="hint">Читатели видят полный текст только у книг с подтверждёнными правами. «Проверить права» — книги, опубликованные до появления учёта прав: подтвердите основание, чтобы они остались доступны.</p></div>
    <div class="sec"><div class="sec-h"><h2>Журнал действий</h2></div>${L.audit.length?`<div class="list">${L.audit.slice(0,15).map(a=>`<div class="li"><div class="grow" style="min-width:0"><b style="font-size:13px">${esc(a.action)}</b> <span class="mute" style="font-size:12px">${esc(a.target||'')}</span><div class="mute" style="font-size:11.5px">${hm(a.ts)} · ${esc(a.user_id)} · ${esc(a.detail.slice(0,90))}</div></div></div>`).join('')}</div>`:'<p class="mute">Записей пока нет</p>'}</div>`;
  }
  async function reloadCatalog(){
    try{const [b,d,a]=await Promise.all([api('/api/admin/books'),api('/api/admin/demo'),api('/api/admin/audit')]);L={books:b.list,demo:d,audit:a.list};adm.A.adbooks=b}catch(e){toast('Не удалось загрузить каталог')}
    if(adm.here('admin'))x.refresh();
  }
  T.push(['catalog','Каталог']);bodies.catalog=tabCatalog;loaders.catalog=reloadCatalog;

  CHG.ciSel=el=>{M[el.dataset.k]=el.value};
  ACT.ciFilter=el=>{CI.filter=el.dataset.v;CI.shown=40;x.refresh()};
  ACT.ciMore=()=>{CI.shown+=40;x.refresh()};
  ACT.ciOpen=el=>{if(tg&&tg.openLink)tg.openLink(el.dataset.u);else window.open(el.dataset.u,'_blank','noopener')};
  /* publication: the server refuses without confirmed rights and (for imported books) confirmed metadata */
  ACT.ciPublish=el=>{
    const b=bookOf(el.dataset.id),draft=b.publish==='draft',lit=b.lit,needMeta=draft&&lit&&lit.metaStatus==='needs_review'&&!lit.metaConfirmed;
    if(!draft){openSheet(`<h2>Снять «${esc(b.title)}» с публикации?</h2><p class="mute" style="font-size:13px;margin-bottom:14px">Книга исчезнет из каталога и станет недоступна читателям. Закладки и позиции читателей сохранятся.</p><button class="btn block" data-a="ciPublishGo" data-id="${esc(b.id)}" data-on="0">Снять с публикации</button>`);return}
    const ok=['public_domain','author','licensed','permission'].includes(b.rights.status);
    openSheet(`<h2>Опубликовать «${esc(b.title)}»</h2>
      <p class="mute" style="font-size:13px;margin-bottom:10px">Права: <b>${esc(STATUS_LABEL[b.rights.status]||b.rights.status)}</b>${ok?'':'. Сначала подтвердите основание кнопкой «Права»: без этого публикация будет отклонена.'}</p>
      ${lit&&lit.review.length?`<div class="card" style="font-size:12.5px;margin-bottom:12px"><b>Что проверить в метаданных</b><ul style="margin:6px 0 0 16px">${lit.review.map(k=>`<li>${esc(reviewText(k))}</li>`).join('')}</ul></div>`:''}
      ${needMeta?`<label class="wz-rights" style="margin-bottom:12px"><input type="checkbox" id="ciMeta"><span>Я проверил автора, название и год этой книги по источнику</span></label>`:''}
      <button class="btn block" data-a="ciPublishGo" data-id="${esc(b.id)}" data-on="1">Опубликовать</button>`)};
  ACT.ciPublishGo=async el=>{
    const meta=document.getElementById('ciMeta');
    try{await api(`/api/admin/books/${el.dataset.id}/publish`,'POST',{on:el.dataset.on==='1',metaConfirmed:!!(meta&&meta.checked)});closeSheet();toast(el.dataset.on==='1'?'Книга опубликована':'Книга снята с публикации');await loadBoot();reloadCatalog()}
    catch(e){toast(ERR[e.detail]||'Не удалось: '+(e.detail||'ошибка'))}};
  ACT.ciDemoPurge=()=>openSheet(`<h2>${esc(`Удалить все тестовые данные (${L.demo.counts.demo} книг)?`)}</h2><p class="mute" style="font-size:13.5px;margin-bottom:14px">Вместе с книгами исчезнут их отзывы, обсуждения, комментарии, цитаты, тестовые авторы и подборки. Настоящие книги и ваши данные не затрагиваются. Отменить нельзя.</p><div class="row" style="gap:10px"><button class="btn ghost grow" data-a="closeSheet">Отмена</button><button class="btn grow" data-a="ciDemoPurgeGo">Удалить навсегда</button></div>`);
  ACT.ciDemoPurgeGo=()=>{closeSheet();bg(api('/api/admin/demo/purge','POST',{confirm:true}).then(async r=>{await loadBoot();adm.A.fresh.stats=false;const k=r.counts||{};toast(`Удалено: книг ${r.deleted}, отзывов ${k.reviews||0}, обсуждений ${k.threads||0}, комментариев ${k.comments||0}, цитат ${k.quotes||0}`);reloadCatalog()}).catch(e=>toast(e.body&&e.body.error==='no_real_books'?'Сначала должны быть настоящие книги':'Не удалось удалить')))};
  ACT.ciDemo=el=>bg(api('/api/admin/demo','POST',{show:el.dataset.v==='auto'?'auto':el.dataset.v==='true'}).then(async()=>{await loadBoot();toast('Сохранено');reloadCatalog()}));

  CHG.ciFile=async el=>{const f=el.files&&el.files[0];el.value='';if(!f)return;
    if(f.size>MAX_FILE){toast('Файл больше 25 МБ');return}
    CI.busy=true;CI.msg=null;x.refresh();
    try{const {text,meta}=await readManuscriptFull(f);
      if(textBytes(text)>MAX_TEXT_BYTES)throw Object.assign(new Error('big'),{code:'toolarge'});
      CI.text=text;CI.file=f.name;CI.info=analyze(text);
      if(!M.ci_title)M.ci_title=meta.title||titleFromFile(f.name);if(!M.ci_author&&meta.author)M.ci_author=meta.author;if(!M.ci_desc&&meta.description)M.ci_desc=meta.description;
      M.ci_lang=meta.lang==='uz'||meta.lang==='ru'?meta.lang:detectLang(text);
    }catch(e){CI.text='';CI.file='';CI.info=null;toast(e.code==='drm'?'EPUB защищён DRM, прочитать нельзя':e.code==='toolarge'?ERR.toolarge:e.code==='format'?'Формат не поддерживается':'Не удалось прочитать файл')}
    CI.busy=false;x.refresh()};
  CHG.ciCover=async el=>{const f=el.files&&el.files[0];el.value='';if(!f)return;try{const r=await compressImage(f,{mode:'fill'});CI.cover=r.dataUrl;CI.coverName=f.name+' · '+Math.round(r.bytes/1024)+' KB'}catch(e){toast('Не удалось открыть картинку')}x.refresh()};
  const record=()=>({title:M.ci_title,author:M.ci_author,lang:M.ci_lang,genre:M.ci_genre,year:num(M.ci_year),series:M.ci_series,seriesNo:num(M.ci_seriesNo),description:M.ci_desc,originalTitle:M.ci_orig,translator:M.ci_transl,publisher:M.ci_publ,isbn:M.ci_isbn,
    source:{name:M.ci_srcName,url:M.ci_srcUrl},coverUrl:CI.cover?'':M.ci_coverUrl,cover:CI.cover||'',authorDeathYear:num(M.ci_death),text:CI.text,rights:{status:M.ci_status,license:M.ci_license,evidenceUrl:M.ci_evid,note:M.ci_note}});
  async function importChunk(recs){const out=[];for(let i=0;i<recs.length;i+=8){const r=await api('/api/admin/import','POST',{records:recs.slice(i,i+8)});out.push(...r.results)}return out}
  ACT.ciSubmit=async()=>{
    if(CI.busy)return;CI.busy=true;CI.msg='Сохраняем…';x.refresh();
    try{const r=(await importChunk([record()]))[0];CI.msg=msgOf(r);
      if(!r.error){Object.assign(M,{ci_title:'',ci_author:'',ci_year:'',ci_series:'',ci_seriesNo:'',ci_desc:'',ci_orig:'',ci_transl:'',ci_publ:'',ci_isbn:'',ci_coverUrl:'',ci_death:''});CI.text='';CI.file='';CI.info=null;CI.cover=null;await loadBoot()}
    }catch(e){CI.msg=`<span class="bad">✕ ${esc(e.detail||'Ошибка запроса')}</span>`}
    CI.busy=false;await reloadCatalog()};
  ACT.ciJson=async()=>{
    let recs;try{recs=JSON.parse(M.ci_json);if(!Array.isArray(recs))throw 0}catch(e){CI.json=[{title:'JSON',error:'JSON: ожидается список записей [ … ]'}];x.refresh();return}
    CI.busy=true;CI.json=null;x.refresh();
    try{CI.json=await importChunk(recs.slice(0,200));await loadBoot()}catch(e){CI.json=[{title:'Запрос',error:e.detail||'ошибка'}]}
    CI.busy=false;await reloadCatalog()};

  /* ---------- rights, text, audio of one book ---------- */
  const bookOf=id=>L.books.find(b=>b.id===id);
  const rightsSheet=(b,extra='')=>`<h2>Права: ${esc(b.title)}</h2><p class="mute" style="font-size:12.5px;margin-bottom:12px">Текст виден читателям только при подтверждённом основании. Смена на «не подтверждены» скрывает текст сразу. Каждое изменение записывается в журнал.</p>${field('rtSrc','Источник','rt_src')}${field('rtSu','Ссылка на источник','rt_srcUrl')}${rightsFields('rt')}${extra}<button class="btn block" data-a="ciRightsGo" data-id="${esc(b.id)}">Сохранить</button>`;
  ACT.ciRights=el=>{const b=bookOf(el.dataset.id),r=b.rights;Object.assign(M,{rt_status:r.status==='demo'?'unverified':r.status,rt_license:r.license,rt_evid:r.evidenceUrl,rt_note:r.note,rt_death:r.authorDeathYear||'',rt_src:r.source,rt_srcUrl:r.sourceUrl});openSheet(rightsSheet(b))};
  ACT.ciRightsGo=async el=>{
    try{await api(`/api/admin/books/${el.dataset.id}/rights`,'POST',{status:M.rt_status,license:M.rt_license,evidenceUrl:M.rt_evid,note:M.rt_note,authorDeathYear:num(M.rt_death),sourceName:M.rt_src,sourceUrl:M.rt_srcUrl});closeSheet();toast('Права обновлены');await loadBoot();reloadCatalog()}
    catch(e){toast(ERR[e.detail]||'Не удалось сохранить')}};
  let TXT={text:'',file:'',busy:false};
  const textSheet=b=>`<h2>${b.chapters?'Заменить':'Добавить'} текст: ${esc(b.title)}</h2><label class="drop" for="ciTf">${ico('file',24)}<div class="grow"><b>${TXT.busy?'Читаем…':TXT.file?esc(TXT.file):'Выбрать файл'}</b><div class="mute" style="font-size:12.5px;font-weight:500">.epub · .docx · .pdf · .txt · .md</div></div></label><input id="ciTf" type="file" accept=".epub,.docx,.pdf,.txt,.md" data-chg="ciTextFile" style="position:absolute;opacity:0;width:1px;height:1px">
    <div class="lbl" style="margin:14px 0 8px">Права на этот текст</div>${field('rtSrc','Источник','rt_src')}${field('rtSu','Ссылка на источник','rt_srcUrl')}${rightsFields('rt')}<button class="btn block" data-a="ciTextGo" data-id="${esc(b.id)}" ${TXT.text?'':'disabled'}>Опубликовать текст</button>`;
  ACT.ciText=el=>{const b=bookOf(el.dataset.id),r=b.rights;TXT={text:'',file:'',busy:false};Object.assign(M,{rt_status:r.status==='demo'||r.status==='unverified'?'public_domain':r.status,rt_license:r.license,rt_evid:r.evidenceUrl,rt_note:r.note,rt_death:r.authorDeathYear||'',rt_src:r.source,rt_srcUrl:r.sourceUrl});openSheet(textSheet(b));A.tb=b};
  CHG.ciTextFile=async el=>{const f=el.files&&el.files[0];el.value='';if(!f)return;TXT.busy=true;setSheet(textSheet(A.tb));
    try{const {text}=await readManuscriptFull(f);if(textBytes(text)>MAX_TEXT_BYTES)throw Object.assign(new Error('x'),{code:'toolarge'});TXT.text=text;TXT.file=f.name}catch(e){toast(e.code==='toolarge'?ERR.toolarge:e.code==='drm'?'EPUB защищён DRM':'Не удалось прочитать файл')}
    TXT.busy=false;setSheet(textSheet(A.tb))};
  ACT.ciTextGo=async el=>{
    try{const r=await api(`/api/admin/books/${el.dataset.id}/text`,'POST',{text:TXT.text,sourceName:M.rt_src,sourceUrl:M.rt_srcUrl,authorDeathYear:num(M.rt_death),rights:{status:M.rt_status,license:M.rt_license,evidenceUrl:M.rt_evid,note:M.rt_note}});closeSheet();toast(`Текст опубликован: глав ${r.chapters}`);await loadBoot();reloadCatalog()}
    catch(e){toast(ERR[e.detail]||'Не удалось сохранить')}};
  ACT.ciAudio=async el=>{
    const b=bookOf(el.dataset.id);A.ab=b;
    try{const r=await api(`/api/books/${b.id}/audio`);M.au_list=r.tracks.map(t=>`${t.title} | ${t.url} | ${t.duration}`).join('\n')}catch(e){M.au_list=''}
    openSheet(`<h2>Аудио: ${esc(b.title)}</h2><p class="mute" style="font-size:12.5px;margin-bottom:12px">Одна часть в строке: <b>Название | https-ссылка на файл | длительность в секундах</b>. Файлы должны быть ваши или с разрешением на распространение: действует то же правило прав, что и для текста. Пустой список убирает аудио.</p>
      <div class="field"><textarea id="auL" class="in" data-m="adm:au_list" style="min-height:140px;font-size:12.5px" placeholder="Часть 1 | https://…/part1.mp3 | 1800">${esc(M.au_list)}</textarea></div><button class="btn block" data-a="ciAudioGo" data-id="${esc(b.id)}">Сохранить</button>`)};
  ACT.ciAudioGo=async el=>{
    const tracks=M.au_list.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{const [title,url,d]=l.split('|').map(s=>s.trim());return{title,url,duration:+d||0}});
    try{await api(`/api/admin/books/${el.dataset.id}/audio`,'POST',{tracks});closeSheet();toast(tracks.length?`Сохранено частей: ${tracks.length}`:'Аудио убрано');await loadBoot();reloadCatalog()}
    catch(e){toast(ERR[e.detail]||'Не удалось сохранить')}};
}
