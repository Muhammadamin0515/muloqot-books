/* Admin → ИИ-книга: plan a book with an AI model, write it chapter by chapter, review and publish it to the catalog.
   The keys of the AI services stay on the server (Worker secrets or saved by the owner); this panel only sends prompts through it. */
import {coverSvg} from './art.js';
import {COVER_STYLES} from '../worker/covers.js';

const GENRES=[['novel','Роман'],['detective','Детектив'],['historical','Исторический'],['adventure','Приключения'],['drama','Драма'],['stories','Рассказы'],['modern','Современная проза'],['prose','Проза'],['poetry','Поэзия']];
const MODELS={groq:['llama-3.3-70b-versatile','llama-3.1-8b-instant'],gemini:['gemini-2.5-flash','gemini-2.5-pro','gemini-2.5-flash-lite'],openrouter:['meta-llama/llama-3.3-70b-instruct:free','deepseek/deepseek-chat-v3-0324:free','google/gemini-2.0-flash-exp:free']};
const ERR={no_key:'Для этого сервиса не добавлен ключ',rate_limit:'Лимит сервиса исчерпан: подождите минуту или выберите другую модель',timeout:'Модель слишком долго отвечает',provider_error:'Сервис вернул ошибку',empty:'Модель вернула пустой ответ',model:'Название модели указано неверно'};
const KEY='muloqot.aibook';
const clean=t=>String(t||'').replace(/\r/g,'').replace(/^\s*#+\s.*$/gm,'').replace(/\*\*|__/g,'').replace(/^\s*[-*]\s+/gm,'— ').replace(/\n{3,}/g,'\n\n').trim();
const words=t=>(String(t).match(/\S+/g)||[]).length;

export async function coverJpeg(b){
  try{
    const svg=coverSvg(b,false).replace('<svg ','<svg width="300" height="450" '),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
    const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=url});
    const c=document.createElement('canvas');c.width=300;c.height=450;c.getContext('2d').drawImage(img,0,0,300,450);URL.revokeObjectURL(url);
    return c.toDataURL('image/jpeg',.82);
  }catch(e){return ''}
}
export function initAiBook(x,adm){
  const {ACT,CHG,api,toast,esc,ico,openSheet,closeSheet,loadBoot,go}=x;
  const {A,M,T,bodies,loaders,loading,bg,here}=adm;
  Object.assign(M,{ai_idea:'',ai_title:'',ai_author:'Muloqot Books',ai_model:'',ai_syn:'',ai_ptitle:'',ai_desc:'',ai_key:''});
  const D0=()=>({stage:'form',auto:true,provider:'gemini',lang:'ru',genre:'novel',chapters:6,words:900,plan:null,texts:[],error:'',busy:false,done:0,published:null});
  let AI=D0(),CFG=null,stop=false;
  try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s&&s.stage){AI={...D0(),...s,busy:false,error:''};if(AI.stage==='writing')AI.stage='plan';Object.assign(M,s.m||{})}}catch(e){}
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({...AI,busy:false,m:{ai_idea:M.ai_idea,ai_title:M.ai_title,ai_author:M.ai_author,ai_model:M.ai_model,ai_syn:M.ai_syn,ai_ptitle:M.ai_ptitle,ai_desc:M.ai_desc}}))}catch(e){}};
  const refresh=()=>{save();if(here('admin'))x.refresh()};
  const errc=e=>(e&&e.body&&e.body.error)||(e&&e.detail)||'';
  const errText=e=>ERR[errc(e)]||(e&&e.body&&e.body.detail)||'Не удалось связаться с сервисом';

  async function loadCfg(){try{CFG=await api('/api/admin/ai/config')}catch(e){CFG={providers:{},canSetKeys:false,err:true}}if(here('admin'))x.refresh()}
  const model=()=>(M.ai_model||'').trim()||(CFG&&CFG.providers[AI.provider]&&CFG.providers[AI.provider].model)||MODELS[AI.provider][0];
  const gen=async(system,prompt,max,temperature)=>(await api('/api/admin/ai/generate','POST',{provider:AI.provider,model:model(),system,prompt,max,temperature})).text;

  /* ---------- prompts ---------- */
  const LANGN=l=>l==='uz'?'узбекском (латиница, литературный язык)':'русском';
  const SYS=l=>`Ты опытный писатель-прозаик. Пишешь оригинальные художественные тексты на ${LANGN(l)} языке. Не копируй и не пересказывай существующие произведения, не подражай стилю живых авторов, не используй цитаты из защищённых авторским правом книг. Все герои и события вымышленные. Пиши живо: сцены, диалоги, детали, без морализаторства и без повторов.`;
  const planPrompt=()=>`${AI.auto?'Ниже план или идея заказчика. Сам выбери жанр (novel, detective, historical, adventure, drama, stories, modern, prose), число глав (от 3 до 12 по смыслу материала) и объём главы в словах (от 600 до 1500). Если заказчик уже разбил план на главы, сохрани его деление.':`Жанр: ${(GENRES.find(g=>g[0]===AI.genre)||[])[1]}. Количество глав: ${AI.chapters}.`}\nИдея или план заказчика: ${M.ai_idea.trim()}\n${M.ai_title.trim()?`Название: ${M.ai_title.trim()}\n`:''}Верни ТОЛЬКО JSON без пояснений и без markdown в таком виде:\n{"title":"название","genre":"жанр из списка","wordsPerChapter":900,"synopsis":"описание книги на 2-3 предложения для читателей","chapters":[{"title":"название главы","summary":"что происходит в главе, 2-3 предложения"}]}\n${AI.auto?'':`Глав ровно ${AI.chapters}. `}Язык названий и описаний: ${LANGN(AI.lang)}.`;
  const chPrompt=i=>{const p=AI.plan,prev=i>0?AI.texts[i-1]:'';
    return `Книга «${p.title}». Жанр: ${(GENRES.find(g=>g[0]===AI.genre)||[])[1]}.\nО чём: ${p.synopsis}\nПлан глав:\n${p.chapters.map((c,k)=>`${k+1}. ${c.title}: ${c.summary}`).join('\n')}\n\n${prev?`Конец предыдущей главы (продолжи плавно, не повторяйся):\n«…${prev.slice(-1500)}»\n\n`:''}Напиши главу ${i+1} «${p.chapters[i].title}» целиком. Что в ней происходит: ${p.chapters[i].summary}\nОбъём около ${AI.words} слов. Язык: ${LANGN(AI.lang)}. Выдай только текст главы без заголовка, без номера и без пояснений. Абзацы разделяй пустой строкой, без markdown.`};

  /* ---------- steps ---------- */
  const syncPlan=()=>{if(!AI.plan)return;AI.plan.title=M.ai_ptitle.trim()||AI.plan.title;AI.plan.synopsis=M.ai_syn.trim()||AI.plan.synopsis;AI.plan.chapters.forEach((c,i)=>{if(M['aip_t'+i]!=null)c.title=M['aip_t'+i].trim()||c.title;if(M['aip_s'+i]!=null)c.summary=M['aip_s'+i].trim()||c.summary})};
  const setPlan=p=>{AI.plan=p;M.ai_ptitle=p.title;M.ai_syn=p.synopsis;p.chapters.forEach((c,i)=>{M['aip_t'+i]=c.title;M['aip_s'+i]=c.summary})};
  ACT.aiPlan=async()=>{
    if(M.ai_idea.trim().length<10)return toast('Опишите идею книги хотя бы в одном предложении');
    AI.busy=true;AI.error='';refresh();
    try{
      const raw=await gen(SYS(AI.lang),planPrompt(),3000,.9),a=raw.indexOf('{'),b=raw.lastIndexOf('}');
      const j=JSON.parse(raw.slice(a,b+1));
      const ch=(Array.isArray(j.chapters)?j.chapters:[]).slice(0,14).map(c=>({title:String(c.title||'').slice(0,100),summary:String(c.summary||'').slice(0,400)})).filter(c=>c.title);
      if(!ch.length)throw new Error('plan');
      setPlan({title:String(j.title||M.ai_title||'Без названия').slice(0,150),synopsis:String(j.synopsis||'').slice(0,1500),chapters:ch});
      if(AI.auto){if(GENRES.some(g=>g[0]===j.genre))AI.genre=j.genre;AI.chapters=ch.length;const w=Math.round(+j.wordsPerChapter);AI.words=w>=300&&w<=2000?w:900}
      AI.stage='plan';AI.texts=[];AI.done=0;
    }catch(e){AI.error=e instanceof SyntaxError||e.message==='plan'?'Модель вернула план в неверном формате. Нажмите ещё раз или выберите другую модель.':errText(e)}
    AI.busy=false;refresh();
  };
  async function writeFrom(start){
    stop=false;AI.busy=true;AI.error='';AI.stage='writing';refresh();
    for(let i=start;i<AI.plan.chapters.length&&!stop;i++){
      try{
        const t=clean(await gen(SYS(AI.lang),chPrompt(i),Math.min(8000,Math.round(AI.words*3.2)+400),.9));
        if(words(t)<80)throw Object.assign(new Error('short'),{detail:'empty'});
        AI.texts[i]=t;AI.done=i+1;M['ait_'+i]=t;refresh();
      }catch(e){AI.error=`Глава ${i+1}: ${errText(e)}`;AI.busy=false;refresh();return}
    }
    AI.busy=false;if(!stop)AI.stage='review';
    if(!stop){M.ai_desc=AI.plan.synopsis}
    refresh();
  }
  ACT.aiWrite=()=>{syncPlan();AI.texts=[];AI.done=0;writeFrom(0)};
  ACT.aiResume=()=>writeFrom(AI.done);
  ACT.aiStop=()=>{stop=true;AI.busy=false;AI.stage='plan';toast('Остановлено: написанные главы сохранены');refresh()};
  ACT.aiRewrite=async el=>{
    const i=+el.dataset.i;AI.busy=true;AI.error='';refresh();
    try{const t=clean(await gen(SYS(AI.lang),chPrompt(i),Math.min(8000,Math.round(AI.words*3.2)+400),1));if(words(t)<80)throw Object.assign(new Error('short'),{detail:'empty'});AI.texts[i]=t;M['ait_'+i]=t}
    catch(e){AI.error=`Глава ${i+1}: ${errText(e)}`}
    AI.busy=false;refresh();
  };
  ACT.aiBack=()=>{syncPlan();AI.stage=AI.stage==='review'?'plan':'form';AI.error='';refresh()};
  ACT.aiReset=()=>{AI=D0();Object.assign(M,{ai_idea:'',ai_title:'',ai_syn:'',ai_ptitle:'',ai_desc:''});try{localStorage.removeItem(KEY)}catch(e){}x.refresh()};
  ACT.aiSet=el=>{AI[el.dataset.k]=el.dataset.k==='chapters'||el.dataset.k==='words'?+el.dataset.v:el.dataset.k==='auto'?el.dataset.v==='1':el.dataset.v;if(el.dataset.k==='provider')M.ai_model='';refresh()};
  CHG.aiSel=el=>{AI[el.dataset.k]=el.dataset.k==='chapters'||el.dataset.k==='words'?+el.value:el.value;if(el.dataset.k==='provider')M.ai_model='';refresh()};

  ACT.aiPublish=()=>openSheet(`<h2>Опубликовать книгу в каталоге?</h2><p class="mute" style="font-size:13.5px;margin-bottom:14px">Книга сразу появится у всех читателей без пометки об ИИ, с автором, которого вы укажете. Это оригинальный вымышленный текст.</p><div class="row" style="gap:10px"><button class="btn ghost grow" data-a="closeSheet">Отмена</button><button class="btn grow" data-a="aiPublishGo">Опубликовать</button></div>`);
  ACT.aiPublishGo=async()=>{
    closeSheet();AI.busy=true;AI.error='';refresh();
    try{
      const title=(M.ai_ptitle||AI.plan.title).trim(),author=(M.ai_author||'').trim()||'Muloqot Books';
      const text=AI.plan.chapters.map((c,i)=>`# ${c.title}\n\n${(M['ait_'+i]??AI.texts[i]).trim()}`).join('\n\n');
      const h=[...title].reduce((s,ch)=>s+ch.charCodeAt(0),0),st=COVER_STYLES[h%COVER_STYLES.length];
      const cover=await coverJpeg({id:'ai'+h,title,authorName:author,motif:st.motif,pal:st.pal});
      const r=await api('/api/admin/import','POST',{records:[{title,author,lang:AI.lang,genre:AI.genre,description:(M.ai_desc||AI.plan.synopsis).trim(),text,cover,
        rights:{status:'author',note:`Оригинальный текст, созданный с помощью ИИ (${AI.provider}, ${model()}) по заказу администратора Muloqot Books`},source:{name:'Muloqot Books (ИИ)'},ai:{provider:AI.provider,model:model()}}]});
      const res=r.results[0];
      if(res.error){AI.error={duplicate:'Книга с таким названием и автором уже есть: измените название',manuscript:'Не удалось разделить текст на главы'}[res.error]||('Не опубликовано: '+res.error)}
      else{AI.published=res.id;AI.stage='done';await loadBoot();adm.A.fresh.stats=false;toast('Книга опубликована в каталоге')}
    }catch(e){AI.error='Не удалось опубликовать: '+(errc(e)||'ошибка запроса')}
    AI.busy=false;refresh();
  };
  ACT.aiOpenBook=()=>go('book',{id:AI.published});

  /* keys of the services */
  ACT.aiKeys=()=>{M.ai_key='';openSheet(keysSheet())};
  const keysSheet=()=>`<h2>Ключи ИИ-сервисов</h2><p class="mute" style="font-size:13px;margin-bottom:12px">Ключ хранится на сервере и больше нигде не показывается. Получить бесплатно: Groq (console.groq.com), Gemini (aistudio.google.com), OpenRouter (openrouter.ai).</p>
    ${Object.entries(CFG.providers).map(([p,c])=>`<div class="card" style="margin-bottom:10px"><div class="row" style="justify-content:space-between"><b>${esc(c.name)}</b><span class="tag ${c.set?'acc':''}">${c.set?(c.source==='env'?'ключ в Cloudflare':'ключ добавлен'):'нет ключа'}</span></div>
      ${c.source==='env'?`<p class="hint">Ключ задан секретом ${esc(c.env)} в Cloudflare.</p>`:`<div class="row" style="gap:8px;margin-top:10px"><input class="in grow" type="password" data-m="adm:ai_key_${p}" placeholder="${c.set?'Заменить ключ':'Вставьте ключ'}" autocomplete="off" aria-label="Ключ ${esc(c.name)}"><button class="btn sm" data-a="aiKeySave" data-p="${p}">Сохранить</button></div>${c.set?`<button class="btn sm ghost" style="margin-top:8px" data-a="aiKeySave" data-p="${p}" data-del="1">Удалить ключ</button>`:''}`}</div>`).join('')}`;
  ACT.aiKeySave=async el=>{
    const p=el.dataset.p,key=el.dataset.del?'':(M['ai_key_'+p]||'').trim();
    if(!el.dataset.del&&!key)return toast('Вставьте ключ');
    try{await api('/api/admin/ai/key','POST',{provider:p,key});M['ai_key_'+p]='';await loadCfg();toast(el.dataset.del?'Ключ удалён':'Ключ сохранён');openSheet(keysSheet())}
    catch(e){toast(errc(e)==='key'?'Ключ выглядит неверно':errc(e)==='superadmin'?'Ключи может менять только владелец':'Не удалось сохранить')}
  };

  /* ---------- screens ---------- */
  const seg=(k,list,cur)=>`<div class="seg">${list.map(([v,n])=>`<button class="${String(cur)===String(v)?'on':''}" data-a="aiSet" data-k="${k}" data-v="${v}">${n}</button>`).join('')}</div>`;
  const step=(n,t)=>`<div class="step"><i>${n}</i><b>${t}</b></div>`;
  const err=()=>AI.error?`<div class="demo-banner" style="margin:12px 0"><b>${esc(AI.error)}</b></div>`:'';
  function formView(){
    const pr=CFG&&CFG.providers[AI.provider],ready=pr&&pr.set;
    return `<div class="card">
      ${step(1,'Сервис и модель')}
      ${seg('provider',Object.entries(CFG.providers).map(([p,c])=>[p,c.name+(c.set?'':' ✕')]),AI.provider)}
      <div class="field" style="margin-top:10px"><label for="aiModel">Модель</label><input id="aiModel" class="in" data-m="adm:ai_model" list="aiModels" value="${esc(M.ai_model)}" placeholder="${esc(MODELS[AI.provider][0])}" autocomplete="off"><datalist id="aiModels">${MODELS[AI.provider].map(m=>`<option value="${esc(m)}">`).join('')}</datalist></div>
      ${ready?'':`<p class="hint" style="color:var(--acc)">Для ${esc(pr?pr.name:'')} ключ не добавлен. ${CFG.canSetKeys?'Нажмите «Ключи» ниже.':'Добавьте секрет '+esc(pr?pr.env:'')+' в Cloudflare.'}</p>`}
      <button class="btn sm ghost" data-a="aiKeys" style="margin-top:6px">Ключи сервисов</button>
      <div class="step" style="margin-top:18px"><i>2</i><b>Ваш план или идея</b></div>
      <p class="hint" style="margin:0 0 8px">Вставьте готовый план или идею. ИИ-автор сам определит жанр, число глав и объём; если план уже разбит на главы, он сохранит ваше деление.</p>
      <textarea id="aiIdea" class="in" data-m="adm:ai_idea" maxlength="8000" style="min-height:180px" placeholder="Вставьте готовый план или идею. Например: Детектив в старой Бухаре 1920-х: торговец находит в караван-сарае письмо, из-за которого пропали три человека.">${esc(M.ai_idea)}</textarea>
      <div class="field" style="margin-top:12px"><label for="aiTitle">Название (если пусто, придумает ИИ)</label><input id="aiTitle" class="in" data-m="adm:ai_title" value="${esc(M.ai_title)}" maxlength="100" autocomplete="off"></div>
      <div class="step" style="margin-top:18px"><i>3</i><b>Язык книги</b></div>
      ${seg('lang',[['ru','Русский'],['uz','Oʻzbekcha']],AI.lang)}
      <div class="step" style="margin-top:18px"><i>4</i><b>Жанр, главы и объём</b></div>
      ${seg('auto',[['1','Подберёт ИИ-автор'],['0','Задам сам']],AI.auto?'1':'0')}
      ${AI.auto?'<p class="hint">Подбор увидите в плане и сможете поправить его до начала работы.</p>':`<select class="in" style="margin-top:10px" data-chg="aiSel" data-k="genre" aria-label="Жанр">${GENRES.map(([v,n])=>`<option value="${v}" ${AI.genre===v?'selected':''}>${n}</option>`).join('')}</select>
      <div class="lbl" style="margin:12px 0 6px">Глав в книге</div>${seg('chapters',[3,5,8,10,12].map(n=>[n,n]),AI.chapters)}
      <div class="lbl" style="margin:12px 0 6px">Слов в главе (примерно)</div>${seg('words',[[600,'600'],[900,'900'],[1200,'1200'],[1500,'1500']],AI.words)}
      <p class="hint">Книга из ${AI.chapters} глав по ${AI.words} слов: около ${Math.round(AI.chapters*AI.words/250)} страниц, написание займёт несколько минут.</p>`}
      ${err()}
      <button class="btn block" style="margin-top:14px" data-a="aiPlan" ${AI.busy||!ready?'disabled':''}>${AI.busy?'Составляю план…':'Составить план книги'}</button></div>`;
  }
  function planView(){
    const p=AI.plan,partial=AI.done>0&&AI.done<p.chapters.length;
    return `<div class="card">
      ${step(1,'План книги')}<p class="hint" style="margin:0 0 6px">${AI.auto?'ИИ-автор выбрал: ':'Параметры: '}жанр — ${esc((GENRES.find(g=>g[0]===AI.genre)||[])[1]||'проза')}, глав — ${p.chapters.length}, около ${AI.words} слов в главе (примерно ${Math.round(p.chapters.length*AI.words/250)} страниц).</p><p class="hint" style="margin:0 0 10px">Поправьте название и главы, если нужно. По этому плану ИИ напишет всю книгу.</p>
      <div class="field"><label for="aiPT">Название</label><input id="aiPT" class="in" data-m="adm:ai_ptitle" value="${esc(M.ai_ptitle)}" maxlength="150"></div>
      <div class="field"><label for="aiSyn">О чём книга</label><textarea id="aiSyn" class="in" data-m="adm:ai_syn" style="min-height:90px">${esc(M.ai_syn)}</textarea></div>
      ${p.chapters.map((c,i)=>`<div class="card" style="margin:10px 0;padding:12px"><div class="mute" style="font-size:12px">Глава ${i+1}${AI.texts[i]?` · написана, ${words(AI.texts[i])} слов`:''}</div><input class="in" data-m="adm:aip_t${i}" value="${esc(M['aip_t'+i])}" maxlength="100" aria-label="Название главы ${i+1}" style="margin:6px 0"><textarea class="in" data-m="adm:aip_s${i}" style="min-height:70px" aria-label="Содержание главы ${i+1}">${esc(M['aip_s'+i])}</textarea></div>`).join('')}
      ${err()}
      <div class="row" style="gap:10px;margin-top:12px"><button class="btn ghost" data-a="aiBack">Назад</button>${partial?`<button class="btn grow" data-a="aiResume">Продолжить с главы ${AI.done+1}</button>`:`<button class="btn grow" data-a="aiWrite">Писать книгу</button>`}</div>
      ${partial?`<button class="btn block ghost" style="margin-top:10px" data-a="aiWrite">Написать заново с первой главы</button>`:''}</div>`;
  }
  function writingView(){
    const n=AI.plan.chapters.length,pct=Math.round(AI.done/n*100);
    return `<div class="card"><b>${AI.busy?'ИИ пишет книгу…':'Остановлено'}</b>
      <div class="bar" style="margin:12px 0 8px"><i style="width:${pct}%"></i></div>
      <span class="mute" style="font-size:13px">Готово ${AI.done} из ${n} глав. ${AI.busy?`Сейчас пишется глава ${AI.done+1}: «${esc(AI.plan.chapters[AI.done]?.title||'')}».`:''}</span>
      <p class="hint">Не закрывайте приложение: каждая глава пишется 20–60 секунд. Если связь пропадёт, написанное сохранится и можно продолжить.</p>
      ${err()}
      <div class="row" style="gap:10px;margin-top:12px">${AI.busy?'<button class="btn ghost grow" data-a="aiStop">Остановить</button>':'<button class="btn grow" data-a="aiResume">Продолжить</button><button class="btn ghost" data-a="aiBack">К плану</button>'}</div></div>`;
  }
  function reviewView(){
    const p=AI.plan,total=AI.texts.reduce((n,t)=>n+words(t),0);
    return `<div class="card">${step(1,'Книга готова')}<p class="hint" style="margin:0 0 10px">${p.chapters.length} глав, ${total} слов. Прочитайте, поправьте текст или перепишите главу. Ничего не опубликовано, пока вы не нажмёте кнопку внизу.</p>
      <div class="field"><label for="aiPT2">Название</label><input id="aiPT2" class="in" data-m="adm:ai_ptitle" value="${esc(M.ai_ptitle)}" maxlength="150"></div>
      <div class="field"><label for="aiAu">Автор (имя или псевдоним на обложке)</label><input id="aiAu" class="in" data-m="adm:ai_author" value="${esc(M.ai_author)}" maxlength="100"></div>
      <div class="field"><label for="aiDesc">Описание для читателей</label><textarea id="aiDesc" class="in" data-m="adm:ai_desc" style="min-height:90px">${esc(M.ai_desc)}</textarea></div>
      ${p.chapters.map((c,i)=>`<details class="dgroup"><summary><b>${i+1}. ${esc(c.title)}</b><span>${words(M['ait_'+i]??AI.texts[i])} слов</span></summary><div class="dbody"><textarea class="in" data-m="adm:ait_${i}" style="min-height:260px;line-height:1.55" aria-label="Текст главы ${i+1}">${esc(M['ait_'+i]??AI.texts[i])}</textarea><button class="btn sm ghost" style="margin-top:8px" data-a="aiRewrite" data-i="${i}" ${AI.busy?'disabled':''}>Переписать главу заново</button></div></details>`).join('')}
      ${err()}
      <p class="hint">Книга появится в каталоге с указанным автором, со своей обложкой и сразу доступна для чтения.</p>
      <div class="row" style="gap:10px;margin-top:12px"><button class="btn ghost" data-a="aiBack">К плану</button><button class="btn grow" data-a="aiPublish" ${AI.busy?'disabled':''}>${AI.busy?'Публикую…':'Опубликовать в каталог'}</button></div></div>`;
  }
  const doneView=()=>`<div class="card" style="text-align:center"><div style="font-size:40px">📚</div><b style="font-size:17px">Книга опубликована</b><p class="mute" style="margin:8px 0 14px">«${esc(M.ai_ptitle||AI.plan.title)}» уже в каталоге и доступна читателям.</p><button class="btn block" data-a="aiOpenBook">Открыть книгу</button><button class="btn block ghost" style="margin-top:10px" data-a="aiReset">Создать ещё одну</button></div>`;
  function tabAi(){
    if(!CFG)return loading();
    const body=AI.stage==='form'?formView():AI.stage==='plan'?planView():AI.stage==='writing'?writingView():AI.stage==='review'?reviewView():doneView();
    return `${AI.stage!=='form'&&AI.stage!=='done'?`<div style="text-align:right;margin-bottom:8px"><button class="btn sm ghost" data-a="aiReset">Начать заново</button></div>`:''}${body}`;
  }
  T.push(['ai','ИИ: быстро']);bodies.ai=tabAi;loaders.ai=loadCfg;
}
