/* Author studio: a four-step publishing wizard (manuscript, details, cover, review), the author's submissions and their book stats. */
import {cover} from './art.js';
import {COVER_STYLES} from '../worker/covers.js';
import {compressImage} from './image.js';
import {readManuscript,readManuscriptFull,analyze,detectLang,titleFromFile,textBytes,MAX_FILE,MAX_TEXT_BYTES} from './manuscript.js';

const DRAFT_KEY='muloqot.draft';
const hasLetters=s=>/[\p{L}\p{N}]/u.test(s||'');

export function initStudio(x){
  const {SCREENS,ACT,CHG,MODEL,ONINPUT,go,api,net,toast,esc,ico,openSheet,closeSheet,setSheet,$,tr,t,gl,GENRES,refresh,loadBoot,save,NAV}=x;
  const S=()=>x.S;
  const blank=()=>({mode:'home',step:0,title:'',author:'',lang:'ru',genre:'novel',desc:'',tags:'',body:'',fileName:'',info:null,
    cover:null,coverName:'',coverBytes:0,coverMode:'auto',coverFit:false,style:0,rights:false,err:null,busy:false,reading:false,sent:false,sentId:null,note:'',fixId:null,prog:''});
  const W=blank();MODEL.wz=W;
  const AUT={data:null,profile:undefined};
  const UPD={id:null,body:'',fileName:'',busy:false,note:'',reading:false};
  MODEL.aut={title:'',desc:'',note:'',cityRu:'',bioRu:''};

  /* ---------- draft kept on the device so a crash or a closed app loses nothing ---------- */
  let dT;
  const draftSave=()=>{clearTimeout(dT);dT=setTimeout(()=>{
    if(W.mode!=='form'||W.sent)return;
    if(!W.body&&!W.title.trim()&&!W.desc.trim())return;
    const d={title:W.title,author:W.author,lang:W.lang,genre:W.genre,desc:W.desc,tags:W.tags,body:W.body,fileName:W.fileName,cover:W.cover,coverName:W.coverName,coverBytes:W.coverBytes,coverMode:W.coverMode,coverFit:W.coverFit,style:W.style,step:W.step,ts:Date.now()};
    try{localStorage.setItem(DRAFT_KEY,JSON.stringify(d))}catch(e){try{delete d.body;delete d.cover;localStorage.setItem(DRAFT_KEY,JSON.stringify(d))}catch(e2){}}
  },500)};
  const draftLoad=()=>{try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');return d&&(d.title||d.body||d.desc)?d:null}catch(e){return null}};
  const draftClear=()=>{clearTimeout(dT);try{localStorage.removeItem(DRAFT_KEY)}catch(e){}};
  ['title','author','desc','tags'].forEach(k=>{ONINPUT['wz:'+k]=()=>{if(k==='desc'){const c=$('#wzCnt');if(c)c.textContent=W.desc.trim().length+' / 1500'}draftSave()}});

  const loadAuthor=()=>{if(!net.online)return;api('/api/author/stats').then(d=>{AUT.data=d;if(NAV.cur.name==='studio')refresh()}).catch(()=>{})};
  const loadSubs=()=>{if(net.online)api('/api/bootstrap').then(d=>{S().subs=d.subs;save();if(NAV.cur.name==='studio')refresh()}).catch(()=>{})};

  /* ---------- human wording for every failure ---------- */
  const ERR={
    title:tr('Название слишком короткое','Sarlavha juda qisqa'),
    desc:tr('Опишите книгу хотя бы в двух предложениях (от 20 знаков)','Kitobni kamida ikki gapda tasvirlang (20 belgidan)'),
    rights:tr('Подтвердите, что у вас есть права на текст','Matnga huquqingiz borligini tasdiqlang'),
    manuscript:tr('В файле слишком мало текста (нужно от 500 знаков)','Faylda matn juda kam (kamida 500 belgi)'),
    toolarge:tr('Текст слишком большой для публикации. Разделите книгу на два тома.','Matn juda katta. Kitobni ikki jildga bo‘ling.'),
    coverlarge:tr('Не удалось уменьшить обложку. Выберите другую картинку.','Muqovani kichraytirib bo‘lmadi. Boshqa rasm tanlang.'),
    coverformat:tr('Обложка должна быть картинкой JPG, PNG или WebP','Muqova JPG, PNG yoki WebP bo‘lishi kerak'),
    ratelimit:tr('Сегодня отправлено слишком много заявок. Попробуйте завтра.','Bugun juda ko‘p ariza yuborildi. Ertaga urinib ko‘ring.'),
    pending:tr('Предыдущий текст ещё на проверке','Oldingi matn hali tekshiruvda'),
    scan:tr('В этом PDF нет текста: похоже, это скан или фотографии страниц. Сохраните книгу из Word/Google Docs как PDF с текстом или загрузите .docx.','Bu PDFda matn yo‘q: skan yoki sahifa rasmlariga o‘xshaydi. Kitobni Word/Google Docs dan matnli PDF qilib saqlang yoki .docx yuklang.'),
    drm:tr('Этот EPUB защищён (DRM). Мы не можем его прочитать: загрузите книгу без защиты.','Bu EPUB himoyalangan (DRM). O‘qib bo‘lmaydi: himoyasiz faylni yuklang.'),
    epub:tr('Файл не похож на EPUB. Проверьте, что книга сохранена целиком.','Fayl EPUBga o‘xshamaydi. Kitob to‘liq saqlanganini tekshiring.'),
    zip:tr('Файл повреждён или не является книгой.','Fayl shikastlangan yoki kitob emas.'),
    format:tr('Этот формат не поддерживается. Сохраните книгу как .docx, .pdf, .epub или .txt.','Bu format qo‘llab-quvvatlanmaydi. Kitobni .docx, .pdf, .epub yoki .txt qilib saqlang.'),
    big:tr('Файл больше 25 МБ. Уберите картинки из документа или разделите книгу.','Fayl 25 MB dan katta. Hujjatdan rasmlarni olib tashlang yoki kitobni bo‘ling.'),
    read:tr('Не удалось прочитать файл. Попробуйте сохранить его как .docx или .txt.','Faylni o‘qib bo‘lmadi. Uni .docx yoki .txt qilib saqlab ko‘ring.'),
    empty:tr('В файле не нашлось текста','Faylda matn topilmadi'),
    offline:tr('Для отправки нужен интернет. Черновик сохранён на устройстве.','Yuborish uchun internet kerak. Qoralama qurilmada saqlangan.'),
    net:tr('Не удалось отправить. Проверьте интернет: черновик сохранён, нажмите ещё раз.','Yuborib bo‘lmadi. Internetni tekshiring: qoralama saqlangan, yana bosing.')
  };
  const sendErr=e=>e&&e.status&&ERR[e.detail]?ERR[e.detail]:(e&&e.status>=500?tr('Сервер временно недоступен, попробуйте через минуту. Черновик сохранён.','Server vaqtincha ishlamayapti, bir daqiqadan so‘ng urinib ko‘ring. Qoralama saqlangan.'):ERR.net);

  /* ---------- helpers ---------- */
  const bookView=()=>{
    const st=COVER_STYLES[W.style]||COVER_STYLES[0];
    return{id:'draft',title:W.title.trim()||tr('Название книги','Kitob nomi'),authorName:W.author.trim()||S().name||'',motif:st.motif,pal:st.pal,img:W.coverMode==='own'?W.cover:null};
  };
  const kb=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
  const plural=(n,a,b,c)=>{const m=n%10,h=n%100;return m===1&&h!==11?a:(m>=2&&m<=4&&(h<10||h>20)?b:c)};
  const chWord=n=>tr(plural(n,'глава','главы','глав'),'bob');
  const top=()=>{const s=$('#screen');if(s)s.scrollTop=0};

  function infoCard(){
    const i=W.info;if(!i)return '';
    const warns=i.warn.map(w=>({
      onechapter:tr('Вся книга распознана как одна глава. Чтобы читатели могли переходить по главам, начните каждую с заголовка «Глава 1», «Глава 2»…','Butun kitob bitta bob sifatida aniqlandi. O‘quvchilar boblar bo‘ylab yurishi uchun har bobni «1-bob», «2-bob»… sarlavhasi bilan boshlang.'),
      autosplit:tr('Заголовков глав не найдено, книга разбита на равные части автоматически. Хотите свои названия — добавьте строки «Глава 1», «Глава 2»…','Bob sarlavhalari topilmadi, kitob teng qismlarga bo‘lindi. O‘z nomlaringiz uchun «1-bob», «2-bob»… qatorlarini qo‘shing.'),
      tiny:tr('Есть очень короткие главы. Проверьте, что заголовки стоят только там, где начинается новая глава.','Juda qisqa boblar bor. Sarlavhalar faqat yangi bob boshlanadigan joyda turganini tekshiring.')
    })[w]).map(m=>`<p class="wz-warn">${ico('info',16)}<span>${m}</span></p>`).join('');
    const shown=i.chapters.slice(0,5),more=i.chapters.length-shown.length;
    return `<div class="card wz-info"><div class="row" style="gap:12px;align-items:flex-start">${ico('file',24)}<div class="grow"><b class="wz-fn">${esc(W.fileName)}</b>
      <div class="mute" style="font-size:12.5px;margin-top:2px">${i.chapters.length} ${chWord(i.chapters.length)} · ${i.words.toLocaleString('ru')} ${tr('слов','so‘z')} · ~${i.pages} ${tr('стр.','bet')}</div></div></div>
      <ol class="wz-chs">${shown.map(c=>`<li><span>${esc(c.t)}</span><small>${c.paras}</small></li>`).join('')}${more>0?`<li class="more">${tr('и ещё','va yana')} ${more}…</li>`:''}</ol>${warns}</div>`;
  }

  function formatTip(){
    return `<h2>${tr('Как оформить рукопись','Qo‘lyozmani qanday tayyorlash')}</h2>
    <p class="mute" style="font-size:14px;margin-bottom:12px">${tr('Платформа сама делит книгу на главы. Это работает в любом формате: .docx, .pdf, .txt.','Platforma kitobni o‘zi boblarga bo‘ladi. Bu .docx, .pdf, .txt formatlarida ishlaydi.')}</p>
    <ul class="wz-tips"><li>${tr('Каждую главу начинайте строкой «Глава 1», «Глава 2» или «Часть первая» (можно с названием: «Глава 3. Дом у реки»).','Har bobni «1-bob», «2-bob» yoki «Birinchi qism» qatori bilan boshlang (nom bilan: «3-bob. Daryo bo‘yidagi uy»).')}</li>
    <li>${tr('Абзацы разделяйте обычным переносом строки. Номера страниц и колонтитулы мы уберём сами.','Abzaclarni oddiy qator bilan ajrating. Sahifa raqamlari va kolontituldan o‘zimiz tozalaymiz.')}</li>
    <li>${tr('Картинки и таблицы не переносятся, только текст.','Rasm va jadvallar ko‘chmaydi, faqat matn.')}</li>
    <li>${tr('PDF должен содержать текст, а не фотографии страниц (скан не прочитается).','PDFda matn bo‘lishi kerak, sahifa rasmlari emas (skan o‘qilmaydi).')}</li>
    <li>${tr('Максимум около 1,4 МБ чистого текста — это примерно 700 страниц.','Maksimum taxminan 1,4 MB sof matn — taxminan 700 bet.')}</li></ul>
    <button class="btn block" style="margin-top:16px" data-a="closeSheet">${tr('Понятно','Tushunarli')}</button>`;
  }

  /* ---------- the wizard ---------- */
  const STEPS=()=>[tr('Рукопись','Qo‘lyozma'),tr('О книге','Kitob haqida'),tr('Обложка','Muqova'),tr('Проверка','Tekshiruv')];

  function stepFile(){
    const drop=`<label class="drop" for="wzFile">${ico(W.reading?'clock':'file',26)}<div class="grow"><b>${W.reading?esc(W.prog||tr('Читаем файл…','Fayl o‘qilmoqda…')):(W.fileName?tr('Выбрать другой файл','Boshqa fayl tanlash'):tr('Выбрать файл с книгой','Kitob faylini tanlash'))}</b>
      <div class="mute" style="font-size:12.5px;font-weight:500;margin-top:3px">.docx · .pdf · .epub · .txt · .md</div></div>${ico('upload',22)}</label>
      <input id="wzFile" type="file" accept=".docx,.pdf,.epub,.txt,.md,application/pdf,application/epub+zip,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-chg="wzFile" style="position:absolute;opacity:0;width:1px;height:1px">`;
    return `<h2 class="wz-h">${tr('Загрузите книгу','Kitobni yuklang')}</h2><p class="mute wz-p">${tr('Подойдёт файл из Word, Google Docs, PDF или EPUB. Главы мы определим сами.','Word, Google Docs, PDF yoki EPUB fayli mos keladi. Boblarni o‘zimiz aniqlaymiz.')}</p>
      ${drop}${W.reading?'<div class="bar" style="margin-top:14px"><i style="width:100%;opacity:.5"></i></div>':''}
      ${W.err?`<p class="err" style="margin-top:12px">${esc(W.err)}</p>`:''}${W.info?infoCard():''}
      <button class="wz-link" data-a="wzTip">${ico('info',16)} ${tr('Как оформить главы','Boblarni qanday rasmiylashtirish')}</button>`;
  }
  function stepAbout(){
    return `<h2 class="wz-h">${tr('О книге','Kitob haqida')}</h2>
      <div class="field"><label for="wzTitle">${t('f_title')}</label><input id="wzTitle" class="in" data-m="wz:title" value="${esc(W.title)}" autocomplete="off" maxlength="120"></div>
      <div class="field"><label for="wzAuthor">${t('f_author')}</label><input id="wzAuthor" class="in" data-m="wz:author" value="${esc(W.author)}" autocomplete="off" maxlength="60" placeholder="${tr('Имя или псевдоним','Ism yoki taxallus')}"></div>
      <div class="row" style="gap:12px;align-items:flex-start"><div class="field grow"><label for="wzLang">${t('f_lang')}</label><select id="wzLang" class="in" data-chg="wzLang"><option value="ru" ${W.lang==='ru'?'selected':''}>Русский</option><option value="uz" ${W.lang==='uz'?'selected':''}>Oʻzbekcha</option></select></div>
      <div class="field grow"><label for="wzGenre">${t('f_genre')}</label><select id="wzGenre" class="in" data-chg="wzGenre">${GENRES.map(g=>`<option value="${g}" ${W.genre===g?'selected':''}>${gl(g)}</option>`).join('')}</select></div></div>
      <div class="field"><label for="wzDesc">${t('f_desc')}</label><textarea id="wzDesc" class="in" data-m="wz:desc" maxlength="1500" placeholder="${t('f_desc_ph')}" style="min-height:130px">${esc(W.desc)}</textarea><div class="wz-cnt"><span class="mute">${tr('От 20 знаков. Это увидят читатели в карточке книги.','Kamida 20 belgi. Bu kitob kartasida ko‘rinadi.')}</span><span id="wzCnt" class="mono">${W.desc.trim().length} / 1500</span></div></div>
      <div class="field"><label for="wzTags">${t('f_tags')}</label><input id="wzTags" class="in" data-m="wz:tags" value="${esc(W.tags)}" autocomplete="off" placeholder="${tr('через запятую (необязательно)','vergul bilan (ixtiyoriy)')}"></div>
      ${W.err?`<p class="err">${esc(W.err)}</p>`:''}`;
  }
  function stepCover(){
    const own=W.coverMode==='own';
    const seg=`<div class="seg" style="margin-bottom:18px"><button class="${!own?'on':''}" data-a="wzCoverMode" data-v="auto">${tr('Автообложка','Avto-muqova')}</button><button class="${own?'on':''}" data-a="wzCoverMode" data-v="own">${tr('Своя картинка','O‘z rasmim')}</button></div>`;
    let inner;
    if(own){
      inner=`<label class="drop" for="wzCover"><div style="width:54px;flex:none">${cover(bookView(),'sm')}</div><div class="grow"><b>${W.cover?tr('Заменить картинку','Rasmni almashtirish'):tr('Выбрать картинку','Rasm tanlash')}</b>
        <div class="mute" style="font-size:12.5px;font-weight:500;margin-top:3px">${W.cover?esc(W.coverName)+' · '+kb(W.coverBytes):tr('Любое фото: размер подгоним сами','Istalgan rasm: o‘lchamini o‘zimiz moslaymiz')}</div></div>${ico('upload',22)}</label>
        <input id="wzCover" type="file" accept="image/*" data-chg="wzCover" style="position:absolute;opacity:0;width:1px;height:1px">
        ${W.cover?`<div class="seg mini" style="margin-top:14px"><button class="${!W.coverFit?'on':''}" data-a="wzFit" data-v="0">${tr('Заполнить рамку','To‘ldirish')}</button><button class="${W.coverFit?'on':''}" data-a="wzFit" data-v="1">${tr('Показать целиком','To‘liq ko‘rsatish')}</button></div>`:''}
        <p class="mute" style="font-size:12.5px;margin-top:12px">${tr('Лучше всего подходит вертикальная картинка 2:3. Мы автоматически уменьшим её до лёгкого размера.','Eng yaxshisi 2:3 vertikal rasm. Uni avtomatik yengil o‘lchamgacha kichraytiramiz.')}</p>`;
    }else{
      inner=`<p class="mute" style="font-size:13px;margin-bottom:12px">${tr('Выберите оформление: на обложке будут название и ваше имя.','Bezakni tanlang: muqovada nom va ismingiz bo‘ladi.')}</p>
        <div class="wz-styles">${COVER_STYLES.map((s,i)=>`<button class="${W.style===i?'on':''}" data-a="wzStyle" data-i="${i}" aria-label="${i+1}" aria-pressed="${W.style===i}">${cover({id:'draft',title:W.title.trim()||tr('Название','Nom'),authorName:W.author.trim()||S().name||'',motif:s.motif,pal:s.pal},'sm')}</button>`).join('')}</div>`;
    }
    return `<h2 class="wz-h">${tr('Обложка','Muqova')}</h2>${seg}
      <div class="wz-prev"><div style="width:132px">${cover(bookView())}</div></div>${inner}${W.err?`<p class="err" style="margin-top:12px">${esc(W.err)}</p>`:''}`;
  }
  function stepReview(){
    const v=bookView(),i=W.info,ok=(c,txt)=>`<li class="${c?'ok':'no'}">${ico(c?'check':'x',16)}<span>${txt}</span></li>`;
    if(W.sent)return `<div class="empty" style="padding-top:10px"><div class="ring" style="border-style:solid;border-color:var(--acc);color:var(--acc-t)">${ico('check',30)}</div><b>${tr('Заявка отправлена','Ariza yuborildi')}</b><span>${tr('Модератор проверит книгу, обычно это занимает до 2 дней. Мы пришлём уведомление в Telegram, как только будет решение.','Moderator kitobni tekshiradi, odatda 2 kungacha. Qaror bo‘lishi bilan Telegramga xabar yuboramiz.')}</span></div>
      <div class="stages"><div class="on"><span class="dot">${ico('check',14)}</span>${tr('Заявка получена','Ariza qabul qilindi')}</div><div><span class="dot"></span>${tr('Проверка модератором','Moderator tekshiruvi')}</div><div><span class="dot"></span>${tr('Книга в каталоге','Kitob katalogda')}</div></div>
      <button class="btn block" data-a="wzHome">${tr('Мои заявки','Mening arizalarim')}</button><button class="btn block ghost" style="margin-top:10px" data-a="wzNew">${tr('Добавить ещё книгу','Yana kitob qo‘shish')}</button>`;
    return `<h2 class="wz-h">${tr('Проверьте и отправьте','Tekshiring va yuboring')}</h2>
      <div class="card"><div class="row" style="gap:14px"><div style="width:64px;flex:none">${cover(v,'sm')}</div><div class="grow"><b>${esc(v.title)}</b><div class="mute" style="font-size:12.5px">${esc(v.authorName||'—')} · ${W.lang.toUpperCase()} · ${gl(W.genre)}</div>
        <div class="mute" style="font-size:12px;margin-top:6px">${i?`${i.chapters.length} ${chWord(i.chapters.length)} · ${i.words.toLocaleString('ru')} ${tr('слов','so‘z')}`:''}</div></div></div></div>
      <ul class="wz-check">${ok(!!W.info,tr('Рукопись загружена','Qo‘lyozma yuklangan'))}${ok(W.title.trim().length>=2,tr('Название указано','Nom ko‘rsatilgan'))}${ok(W.desc.trim().length>=20,tr('Описание заполнено','Tavsif to‘ldirilgan'))}${ok(true,W.coverMode==='own'&&W.cover?tr('Обложка: своя картинка','Muqova: o‘z rasmi'):tr('Обложка: автооформление','Muqova: avto-bezak'))}</ul>
      <label class="wz-rights"><input type="checkbox" data-chg="wzRights" ${W.rights?'checked':''}><span>${tr('Я автор этой книги или у меня есть права на её публикацию. Я согласен(на) с проверкой модератором.','Men ushbu kitobning muallifiman yoki uni nashr etish huquqiga egaman. Moderator tekshiruviga roziman.')}</span></label>
      ${!net.online?`<p class="err">${ERR.offline}</p>`:''}${W.err?`<p class="err">${esc(W.err)}</p>`:''}
      ${W.busy?`<div style="margin:18px 0"><div class="bar"><i style="width:100%;animation:wzp 1.2s ease-in-out infinite"></i></div><p class="mute" style="font-size:13px;margin-top:10px">${tr('Отправляем… не закрывайте приложение','Yuborilmoqda… ilovani yopmang')}</p></div>`:''}`;
  }

  function formScreen(){
    const st=STEPS(),s=W.step;
    let inner=[stepFile,stepAbout,stepCover,stepReview][s]();
    const hideNav=W.sent||W.busy;
    const nav=hideNav?'':`<div class="wz-nav">${s>0?`<button class="btn ghost" data-a="wzPrev">${t('back')}</button>`:`<button class="btn ghost" data-a="wzHome">${t('cancel')}</button>`}${s<3?`<button class="btn grow" data-a="wzNext" ${W.reading?'disabled':''}>${t('next')}</button>`:`<button class="btn grow" data-a="wzSubmit" ${!W.rights||!net.online?'disabled':''}>${tr('Отправить на проверку','Tekshiruvga yuborish')}</button>`}</div>`;
    return `<div class="steps" aria-label="${st[s]}">${st.map((_,i)=>`<i class="${i<=s?'on':''}"></i>`).join('')}</div>
      <div class="eyebrow" style="margin-bottom:6px">${W.sent?'':(s+1)+' / 4 · '+st[s]}</div>
      ${W.note?`<div class="wz-reject">${ico('info',18)}<div><b>${tr('Причина отказа','Rad etish sababi')}</b><div>${esc(W.note)}</div></div></div>`:''}${inner}${nav}`;
  }

  /* ---------- studio home ---------- */
  const statusChip=s=>{
    const map={moderation:[tr('На проверке','Tekshiruvda'),'m'],approved:[tr('Опубликована','Nashr etildi'),'m'],rejected:[tr('Отклонена','Rad etildi'),'']};
    const m=map[s.status]||[tr('Черновик','Qoralama'),''];return `<span class="status ${m[1]}">${m[0]}</span>`;
  };
  function subsBlock(){
    const subs=S().subs||[];
    if(!subs.length)return `<div class="card wz-first"><b>${tr('Здесь появятся ваши заявки','Bu yerda arizalaringiz paydo bo‘ladi')}</b><p class="mute" style="font-size:13.5px;margin-top:4px">${tr('Загрузите файл с книгой, заполните описание и отправьте на проверку. Это занимает несколько минут.','Kitob faylini yuklang, tavsifni to‘ldiring va tekshiruvga yuboring. Bir necha daqiqa.')}</p></div>`;
    return `<div class="list">${subs.map(s=>`<div class="li wz-sub"><div class="grow"><b>${s.update?'↻ ':''}${esc(s.title)}</b>
      ${s.update?`<div class="mute" style="font-size:12px">${tr('Обновление текста','Matn yangilanishi')}</div>`:''}
      ${s.status==='rejected'&&s.note?`<div class="mute" style="font-size:12.5px;margin-top:3px">${esc(s.note)}</div>`:''}
      <div class="wz-acts">${s.status==='moderation'?`<button class="btn sm ghost" data-a="wzWithdraw" data-id="${esc(s.id)}">${tr('Отозвать','Qaytarib olish')}</button>`:''}
      ${s.status==='rejected'&&!s.update?`<button class="btn sm" data-a="wzFix" data-id="${esc(s.id)}">${tr('Исправить и отправить снова','Tuzatib qayta yuborish')}</button>`:''}
      ${s.status==='approved'&&s.bookId?`<button class="btn sm ghost" data-a="openBook" data-id="${esc(s.bookId)}">${tr('Открыть книгу','Kitobni ochish')}</button>`:''}</div></div>${statusChip(s)}</div>`).join('')}</div>`;
  }
  function booksBlock(){
    const d=AUT.data;if(!d||!d.books.length)return '';
    const max=Math.max(1,...d.series.map(v=>v.v));
    return `<div class="sec"><div class="sec-h"><h2>${tr('Мои книги','Mening kitoblarim')}</h2></div>
    ${d.series.length?`<div class="card" style="margin-bottom:12px"><div class="lbl" style="margin-bottom:12px">${tr('Просмотры за 14 дней','14 kunlik ko‘rishlar')}</div><div class="bars">${d.series.map(v=>`<div><i style="height:${Math.max(6,v.v/max*100)}%"></i><small>${v.v}</small><em>${esc(v.day.slice(8))}</em></div>`).join('')}</div></div>`:''}
    ${d.books.map(b=>`<div class="card" style="margin-bottom:12px"><div class="row" style="justify-content:space-between;gap:8px"><b>${esc(b.title)}</b>${b.hidden?`<span class="tag">${tr('скрыта','yashirin')}</span>`:''}</div>
      <div class="stat3" style="margin:12px 0"><div><b>${b.views}</b><small>${tr('Просмотры','Ko‘rishlar')}</small></div><div><b>${b.reads}</b><small>${tr('Начали читать','O‘qiy boshladi')}</small></div><div><b>${b.finishes}</b><small>${tr('Дочитали','Tugatdi')}</small></div></div>
      <p class="mute" style="font-size:12.5px;margin-bottom:10px">⭐ ${b.rating} (${b.count}) · ${tr('отзывов','sharhlar')}: ${b.reviews} · ${tr('глав','bob')}: ${b.chapters}</p>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-a="openBook" data-id="${esc(b.id)}">${tr('Открыть','Ochish')}</button><button class="btn sm ghost" data-a="autEdit" data-id="${esc(b.id)}">${tr('Править','Tahrirlash')}</button>${b.pending?`<span class="status m">${tr('Новый текст на проверке','Yangi matn tekshiruvda')}</span>`:`<button class="btn sm ghost" data-a="autUpdate" data-id="${esc(b.id)}">${tr('Заменить текст','Matnni almashtirish')}</button>`}</div></div>`).join('')}</div>`;
  }
  function homeScreen(){
    const dr=draftLoad();
    const draft=dr?`<button class="card wz-draft" data-a="wzResume"><span class="wz-di">${ico('pen',20)}</span><span class="grow" style="text-align:left"><b>${tr('Продолжить черновик','Qoralamani davom ettirish')}</b><span class="mute" style="display:block;font-size:13px;margin-top:2px">${esc(dr.title||dr.fileName||tr('Без названия','Nomsiz'))}</span></span>${ico('chev',18)}</button>`:'';
    const hasBooks=AUT.data&&AUT.data.books.length;
    return `<div class="sec" style="margin-top:8px">${draft}
      <button class="btn block" data-a="wzNew">${ico('plus',18)} ${tr('Добавить книгу','Kitob qo‘shish')}</button>
      <button class="wz-link" data-a="wzTip">${ico('info',16)} ${tr('Как подготовить рукопись','Qo‘lyozmani qanday tayyorlash')}</button></div>
      <div class="sec"><div class="sec-h"><h2>${t('my_subs')}</h2></div>${subsBlock()}</div>${booksBlock()}
      <div class="sec"><div class="list">
        ${x.ACT.openAch?`<button class="li" data-a="openAch"><span class="grow"><b>${tr('Достижения','Yutuqlar')}</b><span class="mute" style="display:block;font-size:12.5px">${tr('Награды читателя и автора','O‘quvchi va muallif mukofotlari')}</span></span>${ico('chev',18)}</button>`:''}
        ${hasBooks?`<button class="li" data-a="wzProfile"><span class="grow"><b>${tr('Профиль автора','Muallif profili')}</b><span class="mute" style="display:block;font-size:12.5px">${tr('Город и несколько слов о себе','Shahar va o‘zingiz haqida bir necha so‘z')}</span></span>${ico('chev',18)}</button>`:''}
      </div></div>`;
  }

  SCREENS.studio=()=>{
    const head=`<header class="topbar px"><button class="iconbtn" data-a="${W.mode==='form'&&!W.sent?'wzHome':'back'}" aria-label="${t('back')}">${ico('back')}</button><div class="grow"><h2 class="display" style="font-size:22px">${t('studio')}</h2></div></header>`;
    return `${head}<div class="px wz">${W.mode==='form'?formScreen():homeScreen()}</div>`;
  };

  /* ---------- opening, leaving, resuming ---------- */
  ACT.openStudio=()=>{W.mode='home';W.sent=false;W.busy=false;go('studio');loadAuthor();loadSubs()};
  const fresh=()=>{Object.assign(W,blank(),{mode:'form'});W.author=hasLetters(S().name)?S().name:''};
  ACT.wzNew=()=>{fresh();refresh();top()};
  ACT.wzHome=()=>{
    if(W.mode==='form'&&!W.sent&&!W.busy&&(W.body||W.title.trim()||W.desc.trim())){
      openSheet(`<h2>${tr('Выйти из мастера?','Ustadan chiqasizmi?')}</h2><p class="mute" style="font-size:14px;margin-bottom:16px">${tr('Всё введённое сохранится как черновик на этом устройстве. Вы сможете продолжить позже.','Kiritganlaringiz shu qurilmada qoralama sifatida saqlanadi. Keyinroq davom ettirishingiz mumkin.')}</p>
        <button class="btn block" data-a="wzLeave">${tr('Выйти, сохранить черновик','Chiqish, qoralamani saqlash')}</button><button class="btn block ghost" style="margin-top:10px" data-a="closeSheet">${tr('Остаться','Qolish')}</button>`);return}
    ACT.wzLeave();
  };
  ACT.wzLeave=()=>{closeSheet();clearTimeout(dT);if(W.sent)draftClear();else if(W.body||W.title.trim()||W.desc.trim())flush();W.mode='home';W.sent=false;refresh();loadSubs();loadAuthor();top()};
  function flush(){ // write the draft immediately
    const d={title:W.title,author:W.author,lang:W.lang,genre:W.genre,desc:W.desc,tags:W.tags,body:W.body,fileName:W.fileName,cover:W.cover,coverName:W.coverName,coverBytes:W.coverBytes,coverMode:W.coverMode,coverFit:W.coverFit,style:W.style,step:W.step,ts:Date.now()};
    try{localStorage.setItem(DRAFT_KEY,JSON.stringify(d))}catch(e){try{delete d.body;delete d.cover;localStorage.setItem(DRAFT_KEY,JSON.stringify(d))}catch(e2){}}
  }
  ACT.wzResume=()=>{const d=draftLoad();if(!d)return;fresh();Object.assign(W,d);W.mode='form';W.err=null;W.rights=false;W.info=W.body?safeAnalyze(W.body):null;W.step=Math.min(d.step||0,W.info?3:0);refresh();top()};
  const safeAnalyze=b=>{try{return analyze(b)}catch(e){return null}};
  ACT.wzTip=()=>openSheet(formTip());
  const formTip=formatTip;

  /* ---------- manuscript upload ---------- */
  CHG.wzFile=async el=>{
    const f=el.files&&el.files[0];el.value='';if(!f)return;
    W.err=null;
    if(f.size>MAX_FILE){W.err=ERR.big;refresh();return}
    W.reading=true;W.prog=tr('Читаем файл…','Fayl o‘qilmoqda…');refresh();
    try{
      const {text,meta}=await readManuscriptFull(f,(p,n)=>{W.prog=n?tr(`Читаем PDF: страница ${p} из ${n}`,`PDF o‘qilmoqda: ${p}/${n}-bet`):W.prog;const b=document.querySelector('.drop b');if(b)b.textContent=W.prog});
      const info=analyze(text);
      if(!info.chapters.length||text.trim().length<500)throw Object.assign(new Error('short'),{code:'manuscript'});
      if(textBytes(text)>MAX_TEXT_BYTES)throw Object.assign(new Error('big'),{code:'toolarge'});
      W.body=text;W.info=info;W.fileName=f.name;
      if(!W.title.trim())W.title=meta.title||titleFromFile(f.name);
      if(!W.author.trim()&&meta.author)W.author=meta.author.slice(0,60);
      if(!W.desc.trim()&&meta.description)W.desc=meta.description.slice(0,1500);
      W.lang=meta.lang==='uz'||meta.lang==='ru'?meta.lang:detectLang(text);
      draftSave();
    }catch(e){
      W.err=ERR[e.code]||(e.message==='short'?ERR.empty:ERR.read);
    }
    W.reading=false;W.prog='';refresh();
  };
  CHG.wzLang=el=>{W.lang=el.value;draftSave()};CHG.wzGenre=el=>{W.genre=el.value;draftSave()};
  CHG.wzRights=el=>{W.rights=el.checked;refresh()};

  /* ---------- cover ---------- */
  ACT.wzCoverMode=el=>{W.coverMode=el.dataset.v;W.err=null;refresh();draftSave()};
  ACT.wzStyle=el=>{W.style=+el.dataset.i;refresh();draftSave()};
  let coverFile=null;
  async function recompress(){
    if(!coverFile)return;
    try{const r=await compressImage(coverFile,{mode:W.coverFit?'fit':'fill'});W.cover=r.dataUrl;W.coverBytes=r.bytes;W.err=null}
    catch(e){W.err=tr('Не удалось открыть картинку. Попробуйте JPG или PNG.','Rasmni ochib bo‘lmadi. JPG yoki PNG sinab ko‘ring.')}
    refresh();draftSave();
  }
  CHG.wzCover=el=>{const f=el.files&&el.files[0];el.value='';if(!f)return;
    if(!/^image\//.test(f.type)&&!/\.(jpe?g|png|webp|heic|gif|bmp)$/i.test(f.name)){W.err=ERR.coverformat;refresh();return}
    coverFile=f;W.coverName=f.name;recompress()};
  ACT.wzFit=el=>{W.coverFit=el.dataset.v==='1';recompress()};

  /* ---------- steps ---------- */
  ACT.wzPrev=()=>{W.step=Math.max(0,W.step-1);W.err=null;refresh();top();draftSave()};
  ACT.wzNext=()=>{
    W.err=null;
    if(W.step===0){
      if(W.reading)return;
      if(!W.body||!W.info){W.err=tr('Сначала выберите файл с книгой','Avval kitob faylini tanlang');refresh();return}
    }
    if(W.step===1){
      if(W.title.trim().length<2){W.err=ERR.title;refresh();return}
      if(W.desc.trim().length<20){W.err=ERR.desc;refresh();return}
    }
    if(W.step===2&&W.coverMode==='own'&&!W.cover){W.err=tr('Выберите картинку или переключитесь на автообложку','Rasm tanlang yoki avto-muqovaga o‘ting');refresh();return}
    W.step=Math.min(3,W.step+1);refresh();top();draftSave();
  };
  ACT.wzSubmit=async()=>{
    if(W.busy)return;
    if(!net.online){W.err=ERR.offline;refresh();return}
    if(!W.rights){W.err=ERR.rights;refresh();return}
    W.busy=true;W.err=null;refresh();
    const own=W.coverMode==='own'&&W.cover;
    try{
      const r=await api('/api/submissions','POST',{title:W.title.trim(),author:W.author.trim(),lang:W.lang,genre:W.genre,desc:W.desc.trim(),tags:W.tags,
        cover:own?W.cover:null,style:own?null:W.style,fileName:W.fileName,body:W.body,rights:true});
      S().subs.unshift(r.sub);save();draftClear();W.busy=false;W.sent=true;
      if(x.checkAch)x.checkAch();
    }catch(e){
      W.busy=false;W.err=sendErr(e);flush();
      // a field the server rejected: send the author to the step that has it
      if(e.detail==='title'||e.detail==='desc')W.step=1;else if(e.detail==='manuscript'||e.detail==='toolarge')W.step=0;else if(e.detail==='coverlarge'||e.detail==='coverformat')W.step=2;
    }
    refresh();top();
  };

  /* ---------- submissions: withdraw / fix and resend ---------- */
  ACT.wzWithdraw=el=>openSheet(`<h2>${tr('Отозвать заявку?','Arizani qaytarib olasizmi?')}</h2><p class="mute" style="font-size:14px;margin-bottom:16px">${tr('Книга не попадёт в каталог. Позже можно отправить её заново.','Kitob katalogga tushmaydi. Keyinroq qayta yuborishingiz mumkin.')}</p>
    <button class="btn block" data-a="wzWithdrawGo" data-id="${esc(el.dataset.id)}">${tr('Отозвать','Qaytarib olish')}</button><button class="btn block ghost" style="margin-top:10px" data-a="closeSheet">${tr('Отмена','Bekor qilish')}</button>`);
  ACT.wzWithdrawGo=async el=>{closeSheet();
    try{await api(`/api/submissions/${el.dataset.id}/withdraw`,'POST',{});S().subs=S().subs.filter(s=>s.id!==el.dataset.id);save();toast(tr('Заявка отозвана','Ariza qaytarib olindi'));refresh()}
    catch(e){toast(tr('Не удалось отозвать: возможно, модератор уже принял решение','Qaytarib bo‘lmadi: moderator allaqachon qaror qilgan bo‘lishi mumkin'));loadSubs()}};
  ACT.wzFix=async el=>{
    try{
      const s=await api(`/api/submissions/${el.dataset.id}`);
      fresh();
      Object.assign(W,{title:s.title,author:s.author||W.author,lang:s.lang,genre:s.genre,desc:s.desc,body:s.body||'',fileName:s.fileName||'',note:s.note||'',fixId:s.id});
      if(s.cover){W.cover=s.cover;W.coverMode='own';W.coverBytes=Math.round(s.cover.length*.75);W.coverName=tr('Прежняя обложка','Oldingi muqova')}
      else if(Number.isInteger(s.style))W.style=s.style;
      W.info=W.body?safeAnalyze(W.body):null;W.step=W.info?1:0;
      refresh();top();
    }catch(e){toast(tr('Не удалось открыть заявку. Проверьте интернет.','Arizani ochib bo‘lmadi. Internetni tekshiring.'))}
  };

  /* ---------- author profile ---------- */
  ACT.wzProfile=async()=>{
    openSheet(`<h2>${tr('Профиль автора','Muallif profili')}</h2><div class="sk" style="height:140px;border-radius:16px"></div>`);
    try{
      const {author:a}=await api('/api/author/profile');
      if(!a){setSheet(`<h2>${tr('Профиль автора','Muallif profili')}</h2><p class="mute">${tr('Профиль появится после первой опубликованной книги.','Profil birinchi nashr etilgan kitobdan so‘ng paydo bo‘ladi.')}</p>`);return}
      const uz=S().lang==='uz';
      MODEL.aut.cityRu=uz?a.cityUz:a.cityRu;MODEL.aut.bioRu=uz?a.bioUz:a.bioRu;
      setSheet(`<h2>${tr('Профиль автора','Muallif profili')}</h2>
        <div class="field"><label for="apCity">${tr('Город','Shahar')}</label><input id="apCity" class="in" data-m="aut:cityRu" value="${esc(MODEL.aut.cityRu)}" maxlength="60" autocomplete="off"></div>
        <div class="field"><label for="apBio">${tr('О себе','O‘zingiz haqingizda')}</label><textarea id="apBio" class="in" data-m="aut:bioRu" maxlength="600" style="min-height:120px">${esc(MODEL.aut.bioRu)}</textarea></div>
        <button class="btn block" data-a="wzProfileSave">${tr('Сохранить','Saqlash')}</button>`);
    }catch(e){setSheet(`<h2>${tr('Профиль автора','Muallif profili')}</h2><p class="mute">${tr('Не удалось загрузить. Проверьте интернет.','Yuklab bo‘lmadi. Internetni tekshiring.')}</p>`)}
  };
  ACT.wzProfileSave=async()=>{
    const uz=S().lang==='uz',m=MODEL.aut;
    try{await api('/api/author/profile','POST',uz?{cityUz:m.cityRu,bioUz:m.bioRu}:{cityRu:m.cityRu,bioRu:m.bioRu});closeSheet();toast(tr('Сохранено','Saqlandi'));loadBoot()}
    catch(e){toast(tr('Не удалось сохранить','Saqlab bo‘lmadi'))}
  };

  /* ---------- editing a published book ---------- */
  ACT.autEdit=el=>{const b=x.book(el.dataset.id);MODEL.aut.title=b.title;MODEL.aut.desc=b.desc;
    openSheet(`<h2>${tr('Правка книги','Kitobni tahrirlash')}</h2><div class="field"><label for="auT">${t('f_title')}</label><input id="auT" class="in" data-m="aut:title" value="${esc(b.title)}"></div><div class="field"><label for="auD">${t('f_desc')}</label><textarea id="auD" class="in" data-m="aut:desc" style="min-height:130px">${esc(b.desc)}</textarea></div><button class="btn block" data-a="autSave" data-id="${esc(b.id)}">${tr('Сохранить','Saqlash')}</button>`)};
  ACT.autSave=el=>{closeSheet();x.bg(api(`/api/author/books/${el.dataset.id}/edit`,'POST',{title:MODEL.aut.title,desc:MODEL.aut.desc}).then(async()=>{toast(tr('Сохранено','Saqlandi'));await loadBoot();loadAuthor()}))};

  const updSheet=()=>`<h2>${tr('Заменить текст книги','Kitob matnini almashtirish')}</h2><p class="mute" style="font-size:13px;margin-bottom:14px">${tr('Новый текст пройдёт проверку модератором. До одобрения читатели видят прежнюю версию, оценки и отзывы сохранятся.','Yangi matn moderator tekshiruvidan o‘tadi. Tasdiqlanguncha o‘quvchilar eski versiyani ko‘radi, baho va sharhlar saqlanadi.')}</p>
    <label class="drop" for="updFile">${x.ico(UPD.reading?'clock':'file',26)}<div class="grow"><b>${UPD.reading?tr('Читаем файл…','Fayl o‘qilmoqda…'):(UPD.fileName?esc(UPD.fileName):t('up_file'))}</b><div class="mute" style="font-size:12.5px;font-weight:500;margin-top:3px">${UPD.fileName&&!UPD.reading?Math.round(UPD.body.length/1000)+tr('k знаков','k belgi'):'.docx · .pdf · .epub · .txt · .md'}</div></div>${ico('upload',22)}</label>
    <input id="updFile" type="file" accept=".docx,.pdf,.epub,.txt,.md,application/pdf,application/epub+zip,text/plain" data-chg="updFile" style="position:absolute;opacity:0;width:1px;height:1px">
    ${UPD.err?`<p class="err" style="margin-top:10px">${esc(UPD.err)}</p>`:''}
    <div class="field" style="margin-top:16px"><label for="updNote">${tr('Что изменилось (необязательно)','Nima o‘zgardi (ixtiyoriy)')}</label><textarea id="updNote" class="in" data-m="aut:note" style="min-height:80px" placeholder="${tr('Например: исправлены опечатки, добавлена глава 5','Masalan: xatolar tuzatildi, 5-bob qo‘shildi')}">${esc(MODEL.aut.note)}</textarea></div>
    <button class="btn block" data-a="updSend" ${UPD.body.length<500||UPD.busy||UPD.reading?'disabled':''}>${UPD.busy?tr('Отправляем…','Yuborilmoqda…'):tr('Отправить на проверку','Tekshiruvga yuborish')}</button>`;
  ACT.autUpdate=el=>{Object.assign(UPD,{id:el.dataset.id,body:'',fileName:'',busy:false,reading:false,err:null});MODEL.aut.note='';openSheet(updSheet())};
  CHG.updFile=async el=>{const f=el.files&&el.files[0];el.value='';if(!f)return;
    if(f.size>MAX_FILE){UPD.err=ERR.big;setSheet(updSheet());return}
    UPD.err=null;UPD.reading=true;setSheet(updSheet());
    try{const {text}=await readManuscriptFull(f);if(text.trim().length<500)throw Object.assign(new Error('short'),{code:'manuscript'});if(textBytes(text)>MAX_TEXT_BYTES)throw Object.assign(new Error('big'),{code:'toolarge'});UPD.body=text;UPD.fileName=f.name}
    catch(e){UPD.err=ERR[e.code]||ERR.read}
    UPD.reading=false;setSheet(updSheet())};
  ACT.updSend=async()=>{if(UPD.busy||UPD.body.length<500)return;UPD.busy=true;setSheet(updSheet());
    try{await api(`/api/author/books/${UPD.id}/update`,'POST',{body:UPD.body,fileName:UPD.fileName,note:MODEL.aut.note});closeSheet();toast(tr('Отправлено на проверку','Tekshiruvga yuborildi'));loadAuthor();loadSubs()}
    catch(e){UPD.busy=false;UPD.err=sendErr(e);setSheet(updSheet())}};
}
