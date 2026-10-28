/* Admin → ИИ-студия: the AI orchestrator. Groq drafts, Gemini plans and edits, an OpenRouter model of your choice is the expert;
   the server keeps every version and call, this screen drives the steps and asks for your decisions. */
import {coverJpeg} from './aibook.js';
import {COVER_STYLES} from '../worker/covers.js';

const GENRES=[['novel','Роман'],['detective','Детектив'],['historical','Исторический'],['adventure','Приключения'],['drama','Драма'],['stories','Рассказы'],['modern','Современная проза'],['prose','Проза']];
const ST_CLASS={running:'run',draft:'run',paused:'warn',needs_admin:'warn',plan_ready:'info',awaiting_publish:'ok',published:'ok',cancelled:'off'};
const STATUS={draft:'Составляется план',plan_ready:'План ждёт вашего утверждения',running:'Идёт работа',paused:'На паузе',needs_admin:'Нужно ваше решение',awaiting_publish:'Готово: ждёт подтверждения публикации',published:'Опубликована',cancelled:'Отменена'};
const PHASE={plan:'Gemini составляет план',draft:'Groq пишет черновик главы',check:'Программная проверка текста',review:'Gemini проверяет главу',fix:'Groq исправляет по замечаниям',expert:'Эксперт (OpenRouter) правит главу',analyze:'Gemini фиксирует факты и краткое содержание',final:'Gemini проверяет книгу целиком',final2:'Эксперт (OpenRouter) даёт вторую оценку',annotation:'Groq пишет аннотацию'};
const PAUSE={manual:'Остановлено вручную','budget:calls':'Достигнут лимит вызовов','budget:tokens':'Достигнут лимит токенов','budget:cost':'Достигнут лимит стоимости'};
const pauseText=r=>PAUSE[r]||(/^no_provider:/.test(r)?'Нет ключа или модели для задачи «'+r.split(':')[1]+'»':/^all_failed:/.test(r)?`Все провайдеры не ответили (${r.split(':')[1]}: ${r.split(':')[2]}). Подождите и продолжите`:r);
const CREATE_ERR={nothing_to_fix:'В замечаниях не названы главы, поэтому их нельзя исправить по главам. Прочитайте книгу и поправьте нужное вручную. ',no_models:'Не удалось подобрать модели автоматически: добавьте ключи Groq и Gemini (нужны оба). Не хватает: ',no_key:'Не добавлен ключ сервиса: ',roles_required:'Укажите модели для черновика (Groq) и редактора (Gemini)',unknown_model:'Этих моделей нет в списке сервиса: ',price_unknown:'Для лимита стоимости нужны цены всех моделей (список OpenRouter даёт цены, для Groq и Gemini добавьте AI_PRICES)',models_unverified:'Не удалось получить список моделей сервиса: ',too_many_active:'Слишком много незавершённых заданий: завершите или отмените старые',idea:'Опишите идею книги хотя бы одним предложением',model:'Название модели указано неверно'};
const words=t=>(String(t).match(/\S+/g)||[]).length;

export function initAiStudio(x,adm){
  const {ACT,CHG,api,toast,esc,ico,openSheet,closeSheet,loadBoot,go}=x;
  const {A,M,T,bodies,loaders,loading,here}=adm;
  Object.assign(M,{ai_key_groq:'',ai_key_gemini:'',ai_key_openrouter:'',as_idea:'',as_title:'',as_draft:'',as_editor:'',as_expert:'',as_maxCalls:'',as_maxCost:'',as_ptitle:'',as_psyn:'',as_edit:'',as_pub_title:'',as_pub_author:'Muloqot Books',as_pub_desc:''});
  const S={jobs:null,cfg:null,keys:null,models:{},form:{onFail:'accept',paid:false,lang:'auto',genre:'novel',chapters:6,words:900,second:true,auto:true},cur:null,d:null,loop:false,err:'',chText:null,showLog:false};
  const refresh=()=>{if(here('admin'))x.refresh()};
  const errOf=e=>{const b=e&&e.body||{};if(b.error==='limit_too_low')return `Лимит уже исчерпан (использовано ${b.used.calls} запросов, серверный максимум ${b.cap.maxCalls}). Чтобы продолжить, увеличьте переменную AI_MAX_CALLS в Cloudflare (до 1000), нажмите Deploy и снова «Продолжить».`;const t=CREATE_ERR[b.error];if(!t)return b.error||'ошибка запроса';return t+(b.detail||(b.models?b.models.map(m=>m.provider+':'+m.model).join(', '):''))};

  async function loadKeys(){try{S.keys=await api('/api/admin/ai/config')}catch(e){S.keys={providers:{},canSetKeys:false}}}
  async function loadList(){loadKeys().then(refresh);try{const [j,c]=await Promise.all([api('/api/admin/ai/jobs'),S.cfg?S.cfg:api('/api/admin/ai/jobs-config')]);S.jobs=j.jobs;S.cfg=c;if(!M.as_draft&&c.roles.draft)M.as_draft=c.roles.draft.model;if(!M.as_editor&&c.roles.editor)M.as_editor=c.roles.editor.model;if(!M.as_expert&&c.roles.expert)M.as_expert=c.roles.expert.model}catch(e){S.jobs=[];S.err='Не удалось загрузить: '+errOf(e)}refresh()}
  async function openJob(id){S.cur=id;S.d=null;S.err='';S.chText=null;refresh();await reloadJob();if(S.d&&['draft','running'].includes(S.d.job.status))runLoop()}
  async function reloadJob(){try{S.d=await api('/api/admin/ai/jobs/'+S.cur)}catch(e){S.err=errOf(e)}refresh()}

  /* the loop: one step at a time until the job waits for you */
  async function runLoop(){
    if(S.loop)return;S.loop=true;refresh();
    try{
      for(let i=0;i<400&&S.cur;i++){
        let r;try{r=await api(`/api/admin/ai/jobs/${S.cur}/step`,'POST',{})}
        catch(e){const c=e.body&&e.body.error;if(c==='busy'){await new Promise(r=>setTimeout(r,2500));continue}S.err=c==='too_many_jobs'?'Уже работает другое задание: дождитесь его':errOf(e);break}
        await reloadJob();
        if(r.waiting||!['draft','running'].includes(r.job.status))break;
      }
    }finally{S.loop=false;refresh()}
  }
  const call=async(path,method='POST',body={})=>{try{const r=await api(path,method,method==='GET'?undefined:body);S.err='';return r}catch(e){S.err=errOf(e);toast(S.err);refresh();return null}};

  /* ---------- list / create ---------- */
  ACT.asNew=()=>{S.cur='new';S.d=null;S.err='';S.chText=null;S.showLog=false;refresh()};
  ACT.asBack=()=>{S.cur=null;S.d=null;S.err='';S.loop=false;loadList()};
  ACT.asOpen=el=>openJob(el.dataset.id);
  ACT.asSet=el=>{S.form[el.dataset.k]=el.dataset.k==='lang'||el.dataset.k==='second'||el.dataset.k==='auto'||el.dataset.k==='paid'?(el.dataset.v==='1'?true:el.dataset.v==='0'?false:el.dataset.v):+el.dataset.v;refresh()};
  CHG.asSel=el=>{S.form[el.dataset.k]=el.value;refresh()};
  ACT.asModels=async el=>{const p=el.dataset.p;try{S.models[p]=(await api('/api/admin/ai/models?provider='+p)).models.map(m=>m.id);toast(`${p}: моделей в списке сервиса — ${S.models[p].length}`)}catch(e){toast(e.body&&e.body.error==='no_key'?'Сначала добавьте ключ сервиса (кнопка «Ключи сервисов» выше)':'Не удалось получить список: '+errOf(e))}refresh()};
  ACT.asCreate=async()=>{
    const f=S.form,roles=M.as_draft.trim()&&M.as_editor.trim()?{draft:{model:M.as_draft.trim()},editor:{model:M.as_editor.trim()},expert:M.as_expert.trim()?{model:M.as_expert.trim()}:null}:undefined;
    const limits={...(+M.as_maxCalls?{maxCalls:+M.as_maxCalls}:{}),...(f.paid&&+M.as_maxCost?{maxCostUsd:+M.as_maxCost}:{})};
    const r=await call('/api/admin/ai/jobs','POST',{idea:M.as_idea,title:M.as_title,...(f.lang==='auto'?{}:{lang:f.lang}),...(f.auto?{auto:true}:{auto:false,genre:f.genre,chapters:f.chapters,words:f.words}),roles,limits,freeOnly:!f.paid,onFail:f.onFail,noSecondOpinion:!f.second});
    if(r){S.cur=r.job.id;S.d=null;S.chText=null;S.showLog=false;await reloadJob();runLoop()}
  };

  /* ---------- plan ---------- */
  const syncPlan=()=>{const p=S.d.plan;return{...p,title:M.as_ptitle.trim()||p.title,synopsis:M.as_psyn.trim()||p.synopsis,chapters:p.chapters.map((c,i)=>({title:(M['asp_t'+i]??c.title).trim()||c.title,summary:(M['asp_s'+i]??c.summary).trim()||c.summary}))}};
  ACT.asPlanSave=async()=>{const r=await call(`/api/admin/ai/jobs/${S.cur}/plan`,'PUT',syncPlan());if(r){toast('План сохранён');await reloadJob()}};
  ACT.asApprove=async()=>{const r=await call(`/api/admin/ai/jobs/${S.cur}/plan`,'PUT',syncPlan());if(!r)return;const a=await call(`/api/admin/ai/jobs/${S.cur}/approve-plan`,'POST',{confirm:true});if(a){await reloadJob();runLoop()}};

  /* ---------- running ---------- */
  ACT.asPause=async()=>{S.loop=false;await call(`/api/admin/ai/jobs/${S.cur}/pause`);await reloadJob()};
  ACT.asSkipExpert=async()=>{const r=await call(`/api/admin/ai/jobs/${S.cur}/resume`,'POST',{skipExpert:true});if(r)await reloadJob()};
  ACT.asResume=async()=>{const lim=S.d&&/^budget:/.test(S.d.job.pauseReason)?0:+M.as_maxCalls;const r=await call(`/api/admin/ai/jobs/${S.cur}/resume`,'POST',lim?{limits:{maxCalls:lim}}:{});if(r){await reloadJob();runLoop()}};
  ACT.asCancel=()=>openSheet(`<h2>Отменить задание?</h2><p class="mute" style="font-size:13.5px;margin-bottom:14px">Написанные главы и журнал останутся, но задание нельзя будет продолжить.</p><div class="row" style="gap:10px"><button class="btn ghost grow" data-a="closeSheet">Нет</button><button class="btn grow" data-a="asCancelGo">Отменить задание</button></div>`);
  ACT.asCancelGo=async()=>{closeSheet();S.loop=false;await call(`/api/admin/ai/jobs/${S.cur}/cancel`);await reloadJob()};
  ACT.asLog=()=>{S.showLog=!S.showLog;refresh()};
  ACT.asChapter=async el=>{const i=el.dataset.i;if(S.chText&&S.chText.i===i){S.chText=null;refresh();return}const r=await call(`/api/admin/ai/jobs/${S.cur}/chapters/${i}`,'GET');if(r){S.chText={i,...r};M.as_edit=r.chapter.text;refresh()}};
  ACT.asVersion=async el=>{const r=await call(`/api/admin/ai/jobs/${S.cur}/versions/${el.dataset.v}`,'GET');if(r){S.chText.shown=r.version;refresh()}};
  ACT.asResolve=async el=>{
    const body={action:el.dataset.act};if(el.dataset.act==='edit')body.text=M.as_edit;
    const r=await call(`/api/admin/ai/jobs/${S.cur}/chapters/${el.dataset.i}/resolve`,'POST',body);if(r){S.chText=null;await reloadJob();runLoop()}
  };
  ACT.asSaveEdit=async el=>{const r=await call(`/api/admin/ai/jobs/${S.cur}/chapters/${el.dataset.i}/text`,'PUT',{text:M.as_edit});if(r){toast('Правка сохранена. Итоговая проверка книги устарела');await reloadJob()}};

  /* ---------- publishing ---------- */
  ACT.asFixFinal=async el=>{const r=await call(`/api/admin/ai/jobs/${S.cur}/fix-final`,'POST',{only:el.dataset.only||'all'});if(r){toast('ИИ исправляет главы: '+r.fix.chapters.join(', '));await reloadJob();runLoop()}};
  ACT.asPublish=()=>{const fin=S.d.job.state.final;openSheet(`<h2>Опубликовать книгу в каталоге?</h2><p class="mute" style="font-size:13.5px;margin-bottom:14px">Книга сразу появится у всех читателей, автором будет указан тот, кого вы впишете. ${fin&&!fin.ok?'<b>Итоговая проверка нашла серьёзные замечания. Вы публикуете вопреки им.</b>':''}</p><div class="row" style="gap:10px"><button class="btn ghost grow" data-a="closeSheet">Отмена</button><button class="btn grow" data-a="asPublishGo">Опубликовать</button></div>`)};
  ACT.asPublishGo=async()=>{
    closeSheet();const d=S.d,fin=d.job.state.final,title=(M.as_pub_title||d.plan.title).trim(),author=(M.as_pub_author||'').trim()||'Muloqot Books';
    const h=[...title].reduce((s,ch)=>s+ch.charCodeAt(0),0),st=COVER_STYLES[h%COVER_STYLES.length];
    const cover=await coverJpeg({id:'ai'+h,title,authorName:author,motif:st.motif,pal:st.pal});
    const r=await call(`/api/admin/ai/jobs/${S.cur}/publish`,'POST',{confirm:true,override:!!(fin&&!fin.ok),title,author,description:(M.as_pub_desc||d.plan.annotation||d.plan.synopsis).trim(),cover});
    if(r){await loadBoot();adm.A.fresh.stats=false;toast('Книга опубликована в каталоге');await reloadJob()}
  };
  ACT.asOpenBook=()=>go('book',{id:S.d.job.bookId});


  /* keys of the services: the owner can save them here instead of Cloudflare */
  ACT.aiKeys=()=>openSheet(keysSheet());
  const keysSheet=()=>`<h2>Ключи ИИ-сервисов</h2><p class="mute" style="font-size:13px;margin-bottom:12px">Ключ хранится на сервере и больше нигде не показывается. Получить бесплатно: Groq (console.groq.com), Gemini (aistudio.google.com), OpenRouter (openrouter.ai).</p>
    ${Object.entries(S.keys.providers).map(([p,c])=>`<div class="card" style="margin-bottom:10px"><div class="row" style="justify-content:space-between"><b>${esc(c.name)}</b><span class="tag ${c.set?'acc':''}">${c.set?(c.source==='env'?'ключ в Cloudflare':'ключ добавлен'):'нет ключа'}</span></div>
      ${c.source==='env'?`<p class="hint">Ключ задан секретом ${esc(c.env)} в Cloudflare.</p>`:S.keys.canSetKeys?`<div class="row" style="gap:8px;margin-top:10px"><input class="in grow" type="password" data-m="adm:ai_key_${p}" placeholder="${c.set?'Заменить ключ':'Вставьте ключ'}" autocomplete="off" aria-label="Ключ ${esc(c.name)}"><button class="btn sm" data-a="aiKeySave" data-p="${p}">Сохранить</button></div>${c.set?`<button class="btn sm ghost" style="margin-top:8px" data-a="aiKeySave" data-p="${p}" data-del="1">Удалить ключ</button>`:''}`:`<p class="hint">Ключи может менять только владелец.</p>`}</div>`).join('')}`;
  ACT.aiKeySave=async el=>{
    const p=el.dataset.p,key=el.dataset.del?'':(M['ai_key_'+p]||'').trim();
    if(!el.dataset.del&&!key)return toast('Вставьте ключ');
    try{await api('/api/admin/ai/key','POST',{provider:p,key});M['ai_key_'+p]='';await loadKeys();toast(el.dataset.del?'Ключ удалён':'Ключ сохранён');openSheet(keysSheet())}
    catch(e){const c=e.body&&e.body.error;toast(c==='key'?'Ключ выглядит неверно':c==='superadmin'?'Ключи может менять только владелец':'Не удалось сохранить')}
  };
  const keyLine=()=>S.keys?`<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0">${Object.values(S.keys.providers).map(c=>`<span class="tag ${c.set?'acc':''}">${esc(c.name)} ${c.set?'✓':'✕'}</span>`).join('')}<button class="btn sm ghost" data-a="aiKeys">Ключи сервисов</button></div>`:'';

  /* ---------- views ---------- */
  const tag=(t,cls='')=>`<span class="tag ${cls}">${esc(t)}</span>`;
  
  const suggestLimit=d=>Math.min((d.caps&&d.caps.maxCalls)||1000,d.job.usage.calls+60);
  const kfmt=n=>n>=1000?(n/1000).toFixed(n>=10000?0:1).replace('.0','')+' тыс.':String(n);
  const statChips=(u,free)=>`<div class="jstats"><span><b>${u.calls}</b>вызовов</span><span><b>${kfmt(u.tokensIn+u.tokensOut)}</b>токенов</span><span><b>${free?'бесплатно':'≈ $'+(u.cost||0).toFixed(2)}</b>${free?'расходы':'расчётные расходы'}</span></div>`;
  const issueList=l=>(l||[]).length?`<ul class="issues">${l.map(i=>`<li><b class="${i.severity==='major'?'bad':''}">${i.severity==='major'?'Серьёзно':'Замечание'}</b> ${esc(i.note)}${i.where?` <span class="mute">(${esc(i.where)})</span>`:''}${i.fix?`<br><span class="mute">Как исправить: ${esc(i.fix)}</span>`:''}</li>`).join('')}</ul>`:'<p class="mute">Замечаний нет.</p>';
  const err=()=>S.err?`<div class="demo-banner" style="margin:12px 0"><b>${esc(S.err)}</b></div>`:'';
  const seg=(k,list,cur)=>`<div class="seg">${list.map(([v,n])=>`<button class="${String(cur)===String(v)?'on':''}" data-a="asSet" data-k="${k}" data-v="${v}">${n}</button>`).join('')}</div>`;
  const step=(n,t)=>`<div class="step"><i>${n}</i><b>${t}</b></div>`;

  function listView(){
    if(!S.jobs)return loading();
    return `<button class="btn block" data-a="asNew">${ico('pen',18)} Новая книга</button>
      <p class="hint">Groq пишет черновики, Gemini строит план и проверяет текст, выбранная вами модель OpenRouter помогает со сложными главами. Публикация только после вашего подтверждения.</p>
      ${keyLine()}${err()}
      <div class="sec"><div class="sec-h"><h2>Задания</h2></div>${S.jobs.length?`<div class="list">${S.jobs.map(j=>`<button class="li" style="text-align:left" data-a="asOpen" data-id="${esc(j.id)}"><div class="grow" style="min-width:0"><b>${esc(j.title)}</b><div class="mute" style="font-size:12.5px">${esc(STATUS[j.status]||j.status)} · ${j.chapters} гл. · вызовов ${j.calls}</div></div>${ico('chev',18)}</button>`).join('')}</div>`:'<p class="mute">Заданий пока нет.</p>'}</div>`;
  }
  const OPEN={};document.addEventListener('toggle',e=>{const d=e.target;if(d&&d.dataset&&d.dataset.asg)OPEN[d.dataset.asg]=d.open},true);
  const roleCard=(id,key,icon,title,who,what,provider,ph,optional)=>`<div class="rolecard"><div class="rolehead"><span class="roleico">${icon}</span><div class="grow"><b>${title}</b><small>${who}</small></div></div>
    <p class="hint" style="margin:6px 0 8px">${what}</p>
    <input id="${id}" class="in" data-m="adm:${key}" list="l_${id}" value="${esc(M[key])}" placeholder="${esc(ph)}" autocomplete="off" aria-label="${esc(title)}: модель" style="width:100%"><button class="btn sm ghost" style="margin-top:8px" data-a="asModels" data-p="${provider}">Выбрать из списка моделей</button>
    <datalist id="l_${id}">${(S.models[provider]||[]).map(m=>`<option value="${esc(m)}">`).join('')}</datalist>${optional?'<p class="hint" style="margin:6px 0 0">Можно оставить пустым: тогда сложные главы вы будете дорабатывать сами.</p>':''}</div>`;
  function createView(){
    const f=S.form,noModels=!M.as_draft.trim()||!M.as_editor.trim(),anyKey=S.keys&&Object.values(S.keys.providers).some(c=>c.set);
    return `<button class="btn sm ghost" data-a="asBack" style="margin-bottom:10px">← К заданиям</button>
    <div class="card">
      <b style="font-size:16px">Ваш план книги</b>
      <p class="hint" style="margin:6px 0 10px">Вставьте готовый план по главам или просто идею. Всё остальное ИИ сделает сам: определит язык, жанр, число глав и длину, подберёт модели, напишет и проверит главы. Работает только на бесплатных моделях. Опубликуется книга только по вашей кнопке.</p>
      <textarea class="in" data-m="adm:as_idea" maxlength="8000" style="min-height:230px" aria-label="План или идея книги" placeholder="Например: детектив в старой Бухаре 1920-х: торговец находит в караван-сарае письмо, из-за которого пропали три человека. Или вставьте весь план по главам.">${esc(M.as_idea)}</textarea>
      <div class="counter"><span>${M.as_idea.length} / 8000</span></div>
      ${S.keys&&!anyKey?`<div class="demo-banner" style="margin:10px 0;flex-direction:column;align-items:flex-start"><b>Сначала добавьте ключи ИИ-сервисов</b><button class="btn sm" data-a="aiKeys">Добавить ключи</button></div>`:''}
      ${err()}
      <button class="btn block" style="margin-top:12px" data-a="asCreate">Составить план книги</button>
      <p class="hint" style="text-align:center">Пока вы не утвердите план, ни одна глава не пишется.</p>
    </div>
    <details class="dgroup" data-asg="more" ${OPEN.more?'open':''} style="margin-top:12px"><summary><b>Дополнительно</b><span>название, язык, ручные настройки, модели, лимиты</span></summary><div class="dbody">
      <div class="field"><label for="asT">Название книги <span class="mute">(иначе придумает ИИ)</span></label><input id="asT" class="in" data-m="adm:as_title" value="${esc(M.as_title)}" maxlength="100" autocomplete="off"></div>
      <div class="lbl" style="margin:12px 0 6px">Язык книги</div>
      ${seg('lang',[['auto','По тексту плана'],['ru','Русский'],['uz','Oʻzbekcha']],f.lang)}
      <div class="lbl" style="margin:16px 0 6px">Жанр, число глав и размер</div>
      ${seg('auto',[['1','Подберёт ИИ'],['0','Задам сам']],f.auto?'1':'0')}
      ${f.auto?'':`<select class="in" style="margin-top:10px" data-chg="asSel" data-k="genre" aria-label="Жанр">${GENRES.map(([v,n])=>`<option value="${v}" ${f.genre===v?'selected':''}>${n}</option>`).join('')}</select>
      <div class="lbl" style="margin:12px 0 6px">Сколько глав</div>${seg('chapters',[3,5,6,8,10,12].map(n=>[n,n]),f.chapters)}
      <div class="lbl" style="margin:12px 0 6px">Длина главы, слов</div>${seg('words',[[600,'600'],[900,'900'],[1200,'1200'],[1500,'1500']],f.words)}`}
      <div class="lbl" style="margin:16px 0 6px">Если глава не проходит проверку</div>
      ${seg('onFail',[['accept','Принять лучший вариант'],['ask','Остановиться и спросить']],f.onFail)}
      <p class="hint">${f.onFail==='accept'?'Работа не прерывается: такая глава отмечается в итоговой проверке, и вы прочитаете её перед публикацией.':'Работа остановится на этой главе, и вы решите сами: поправить, принять или переписать.'}</p>
      <div class="lbl" style="margin:16px 0 6px">Платные модели</div>
      ${seg('paid',[['0','Не использовать'],['1','Разрешить']],f.paid?'1':'0')}
      <p class="hint">${f.paid?'Платные модели OpenRouter будут разрешены; расходы считаются по ценам из списка сервиса.':'Используются только бесплатные модели OpenRouter. Groq и Gemini бесплатны, если ключ из бесплатного аккаунта без привязанной карты.'}</p>
      <div class="lbl" style="margin:16px 0 6px">Проверить готовую книгу ещё и экспертом</div>
      ${seg('second',[['1','Да'],['0','Нет']],f.second?'1':'0')}
      <div class="lbl" style="margin:16px 0 6px">Модели ИИ</div>
      ${keyLine()}
      <p class="hint" style="margin:0 0 10px">${noModels?'Если ничего не выбирать, модели подберутся сами из доступных вашим ключам.':'Заданы на сервере. Можно заменить; список — только доступные вашим ключам.'}</p>
      ${roleCard('asMd','as_draft','✍️','Писатель','Groq','Быстро пишет черновик каждой главы и исправляет текст по замечаниям редактора.','groq','Подберётся сам')}
      ${roleCard('asMe','as_editor','🔎','Редактор','Gemini','Составляет план, проверяет главы на ошибки и противоречия, ведёт краткое содержание и факты.','gemini','Подберётся сам')}
      ${roleCard('asMx','as_expert','🎓','Эксперт','OpenRouter (по желанию)','Вызывается, только когда писатель и редактор не справились с главой. Даёт независимую оценку.','openrouter','Подберётся сам',true)}
      <div class="lbl" style="margin:16px 0 6px">Ограничить расходы <span class="mute">(необязательно)</span></div>
      <div class="field"><label for="asLc">Не больше запросов к ИИ на всю книгу</label><input id="asLc" class="in" type="number" inputmode="numeric" min="5" data-m="adm:as_maxCalls" value="${esc(M.as_maxCalls)}" placeholder="${S.cfg?'по умолчанию '+esc(S.cfg.limits.maxCalls):'по умолчанию'}"></div>
      ${f.paid?`<div class="field"><label for="asLm">Не больше потратить, $</label><input id="asLm" class="in" type="number" inputmode="decimal" min="0" step="0.1" data-m="adm:as_maxCost" value="${esc(M.as_maxCost)}" placeholder="без ограничения"></div>`:''}
      <p class="hint">При достижении лимита работа встаёт на паузу, написанное сохраняется.</p>
    </div></details>`;
  }
  const modelsLine=c=>{const r=c.roles||{},row=(l,x)=>`<div class="mrow2"><span>${l}</span><b>${x?esc(x.primary.model):'не задан'}</b></div>`;
    return `<details class="mdet" data-asg="models" ${OPEN.models?'open':''}><summary>Какие модели работают${c.autoModels?' (подобраны автоматически)':''}</summary>${row('Писатель',r.draft)}${row('Редактор',r.editor)}${row('Эксперт',r.expert)}${(c.dropped||[]).length?`<p class="hint" style="margin:6px 0 0">Не используются: ${c.dropped.map(x=>esc(x.provider+':'+x.model)+(x.reason==='not_free'?' (платная)':' (нет в списке сервиса)')).join(', ')}</p>`:''}</details>`};
  const head=d=>{const j=d.job,done=d.chapters.filter(c=>c.status==='approved').length,n=j.config.chapters||0;
    return `<button class="btn sm ghost" data-a="asBack" style="margin-bottom:10px">← К заданиям</button>
    <div class="card jhead"><div class="jtitle"><b>${esc(j.title)}</b></div>
      <div class="jbadge ${ST_CLASS[j.status]||''}"><i></i>${esc(STATUS[j.status]||j.status)}</div>
      ${n?`<div class="mute" style="font-size:13px;margin:10px 0 2px">${j.status==='published'?'Книга опубликована':`Глав готово: ${done} из ${n}`}</div>`:''}
      ${statChips(j.usage,j.config.freeOnly)}${modelsLine(j.config)}</div>`};
  function planView(d){
    const p=d.plan;
    return `${head(d)}<div class="card">${step(1,'План книги: проверьте и утвердите')}
      <p class="hint" style="margin:0 0 6px">${d.job.config.auto?'ИИ-автор выбрал: ':'Параметры: '}жанр — ${esc((GENRES.find(g=>g[0]===d.job.config.genre)||[])[1]||'проза')}, глав — ${p.chapters.length}, около ${d.job.config.words} слов в главе (примерно ${Math.round(p.chapters.length*d.job.config.words/250)} страниц).</p><p class="hint" style="margin:0 0 10px">Пока вы не утвердите план, ни одна глава не пишется. План можно править.</p>
      <div class="field"><label for="asPT">Название</label><input id="asPT" class="in" data-m="adm:as_ptitle" value="${esc(M.as_ptitle||p.title)}" maxlength="150"></div>
      <div class="field"><label for="asPS">О чём книга</label><textarea id="asPS" class="in" data-m="adm:as_psyn" style="min-height:80px">${esc(M.as_psyn||p.synopsis)}</textarea></div>
      ${p.style&&(p.style.voice||p.style.tone)?`<p class="hint">Стиль: ${esc([p.style.voice,p.style.pov,p.style.tense,p.style.tone].filter(Boolean).join(' · '))}</p>`:''}
      ${(p.characters||[]).length?`<details class="dgroup"><summary><b>Персонажи (${p.characters.length})</b></summary><div class="dbody">${p.characters.map(c=>`<p><b>${esc(c.name)}</b> ${esc(c.role)}<br><span class="mute">${esc(c.traits)}</span></p>`).join('')}</div></details>`:''}
      ${p.chapters.map((c,i)=>`<div class="card" style="margin:10px 0;padding:12px"><div class="mute" style="font-size:12px">Глава ${i+1}</div><input class="in" data-m="adm:asp_t${i}" value="${esc(M['asp_t'+i]??c.title)}" maxlength="100" aria-label="Название главы ${i+1}" style="margin:6px 0"><textarea class="in" data-m="adm:asp_s${i}" style="min-height:64px" aria-label="Содержание главы ${i+1}">${esc(M['asp_s'+i]??c.summary)}</textarea></div>`).join('')}
      ${err()}<div class="row" style="gap:10px;margin-top:12px"><button class="btn ghost" data-a="asPlanSave">Сохранить правки</button><button class="btn grow" data-a="asApprove">Утвердить и писать</button></div>
      <button class="btn block ghost" style="margin-top:10px" data-a="asCancel">Отменить задание</button></div>`;
  }
  const chapterRows=d=>d.plan?d.plan.chapters.map((c,i)=>{const ch=d.chapters[i]||{status:'pending'},cur=d.job.state.chapter===i&&['running','needs_admin','paused'].includes(d.job.status);
    return `<button class="li" style="text-align:left" data-a="asChapter" data-i="${i}"><div class="grow" style="min-width:0"><b>${i+1}. ${esc(c.title)}</b><div class="mute" style="font-size:12.5px">${ch.status==='approved'?`Принята · ${ch.words} слов`:ch.status==='draft'?`Черновик · ${ch.words} слов`:cur?'В работе':'Ждёт очереди'}</div></div>${ico('chev',18)}</button>`}).join(''):'';
  function chapterPanel(d){
    const c=S.chText;if(!c||!d.plan)return'';const i=+c.i,cur=d.job.state.chapter===i;
    const issues=(d.checks.find(x=>x.chapter===i&&!x.ok)||{}).issues;
    return `<div class="card" style="margin-top:10px"><b>Глава ${i+1}: ${esc(d.plan.chapters[i].title)}</b>
      ${c.shown?`<p class="mute" style="font-size:12.5px">Версия «${esc(c.shown.kind)}» ${esc(c.shown.provider)} ${esc(c.shown.model)}</p><div class="chtext">${esc(c.shown.text)}</div><button class="btn sm ghost" data-a="asChapter" data-i="${i}">Закрыть</button>`
      :`<textarea class="in" data-m="adm:as_edit" style="min-height:260px;line-height:1.55;margin-top:8px" aria-label="Текст главы">${esc(M.as_edit)}</textarea>`}
      <details class="dgroup" style="margin-top:8px"><summary><b>Версии (${c.versions.length})</b></summary><div class="dbody">${c.versions.map(v=>`<button class="li" data-a="asVersion" data-v="${v.id}"><div class="grow"><b>${esc(v.kind)}</b> <span class="mute">${esc(v.provider)} ${esc(v.model)} · ${v.len} зн. ${esc(v.note||'')}</span></div></button>`).join('')}</div></details>
      ${d.job.status==='needs_admin'&&cur?`<div class="demo-banner" style="margin:10px 0;flex-direction:column;align-items:flex-start"><b>Модели не довели эту главу до качества</b>${issueList(issues)}</div>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-a="asResolve" data-act="edit" data-i="${i}">Сохранить мою правку и продолжить</button><button class="btn sm ghost" data-a="asResolve" data-act="accept" data-i="${i}">Принять как есть</button><button class="btn sm ghost" data-a="asResolve" data-act="retry" data-i="${i}">Написать заново</button></div>`
      :d.job.status==='awaiting_publish'?`<button class="btn sm ghost" style="margin-top:8px" data-a="asSaveEdit" data-i="${i}">Сохранить правку</button>`:''}</div>`;
  }
  const journal=d=>`<button class="btn sm ghost" style="margin-top:12px" data-a="asLog">${S.showLog?'Скрыть журнал':'Журнал вызовов и проверок'}</button>${S.showLog?`<div class="card" style="margin-top:8px;font-size:12.5px"><b>Вызовы</b><div class="logtbl">${d.calls.map(c=>`<div class="logrow"><span>${esc(c.task)}${c.chapter>=0?' · гл.'+(c.chapter+1):''}</span><span>${esc(c.provider)} / ${esc(c.model)}${c.via==='override'?' (тест)':''}</span><span>${c.latency} мс · ${c.tokens_in}+${c.tokens_out}${c.estimated?'~':''} ток. · ${c.cost==null?'цена неизвестна':'$'+c.cost.toFixed(5)}</span><span class="${c.status==='ok'?'':'bad'}">${esc(c.status)}${c.error?': '+esc(c.error):''}</span></div>`).join('')}</div><b style="display:block;margin-top:10px">Проверки</b>${d.checks.slice(0,20).map(k=>`<div style="margin-top:6px"><span class="${k.ok?'':'bad'}">${k.ok?'✓':'✕'}</span> ${esc(k.kind)}${k.chapter>=0?' · гл.'+(k.chapter+1):''} ${esc(k.provider)} ${esc(k.model)}${k.ok?'':issueList(k.issues)}</div>`).join('')}</div>`:''}`;
  function jobView(d){
    const j=d.job,st=j.state;
    if(j.status==='plan_ready')return planView(d);
    const running=['draft','running'].includes(j.status);
    let body='';
    if(running){
      const approved=d.chapters.filter(c=>c.status==='approved').length,n=Math.max(1,j.config.chapters),fin=/^final|annotation/.test(st.phase||'');
      const frac={draft:.1,check:.3,review:.45,fix:.55,expert:.6,analyze:.8}[st.phase]||0,rf=Array.isArray(st.refix),pct=rf?Math.min(99,Math.round(((st.refixTotal-st.refix.length-1+frac)/st.refixTotal)*100)):Math.min(100,Math.round(((fin?n:approved+frac)/n)*100));
      body=`<div class="card jrun"><div class="jrun-h"><span class="spin"></span><b>${S.loop?esc(PHASE[st.phase]||PHASE[j.status==='draft'?'plan':'draft']):'Остановлено'}</b></div>
      <div class="bar" style="margin:12px 0 8px"><i style="width:${pct}%"></i></div>
      <div class="mute" style="font-size:13px">${fin?'Все главы написаны, идёт итоговая проверка':rf?`Исправление замечаний: глава ${(st.chapter||0)+1} (осталось глав: ${st.refix.length+1})`:`Глава ${(st.chapter||0)+1} из ${j.config.chapters}`}${st.fix?` · круг исправлений ${st.fix}`:''} · готово ${pct}%</div>
      <p class="hint" style="margin:10px 0 12px">Не закрывайте приложение. Если связь пропадёт, всё сохранено: вернитесь сюда и нажмите «Продолжить».</p>
      <div class="row" style="gap:10px"><button class="btn ghost grow" data-a="asPause">Пауза</button>${S.loop?'':'<button class="btn grow" data-a="asResume2">Продолжить</button>'}</div></div>`;
    }
    else if(j.status==='paused')body=`<div class="card"><b>На паузе</b><p class="mute" style="font-size:13.5px;margin:6px 0">${esc(pauseText(j.pauseReason))}</p>${/^budget:(calls|tokens)/.test(j.pauseReason)?`<p class="hint" style="margin:0 0 10px">Использовано ${j.usage.calls} запросов к ИИ (лимит задания ${j.config.limits.maxCalls}). Это защита от зацикливания. Книга и всё написанное сохранены. Нажмите «Продолжить»: лимит поднимется до серверного максимума${d.caps?` (${d.caps.maxCalls} запросов)`:''}.</p>`:''}<div class="row" style="gap:10px"><button class="btn grow" data-a="asResume">Продолжить</button><button class="btn ghost" data-a="asCancel">Отменить</button></div>${/^all_failed:chapter_expert/.test(j.pauseReason)?`<p class="hint" style="margin-top:12px">Эксперт временно недоступен (у бесплатных моделей строгие лимиты: обычно помогает подождать минуту, а при дневном лимите до следующих суток). Можно не ждать: решите по главе сами.</p><button class="btn block ghost" data-a="asSkipExpert">Обойтись без эксперта: решу сам</button>`:''}</div>`;
    else if(j.status==='needs_admin')body=`<div class="card"><b>Нужно ваше решение по главе ${st.chapter+1}</b><p class="mute" style="font-size:13.5px;margin-top:6px">Откройте главу ниже: вы можете поправить текст, принять как есть или написать заново.</p></div>`;
    else if(j.status==='awaiting_publish'){
      const fin=st.final||{ok:true,issues:[]};
      body=`<div class="card"><b>Книга готова</b><p class="mute" style="font-size:13.5px;margin:6px 0">Итоговая проверка: ${fin.stale?'устарела после ваших правок':fin.ok?'серьёзных замечаний нет':'<b class="bad">найдены серьёзные замечания</b>'}</p>${issueList(fin.issues)}
        ${d.fixPlan&&d.fixPlan.chapters.length?`<div class="fixbox"><b>Исправить с помощью ИИ</b><p class="hint" style="margin:6px 0 10px">ИИ перепишет главы, названные в замечаниях (${d.fixPlan.chapters.join(', ')}), проверит их заново и ещё раз проверит всю книгу. Старый текст сохранится в версиях. Это ${d.fixPlan.chapters.length*3}–${d.fixPlan.chapters.length*5} запросов к ИИ.${d.fixPlan.global?` Замечания ко всей книге без номера главы ИИ исправить не сможет (${d.fixPlan.global}).`:''}</p>
          <button class="btn block" data-a="asFixFinal" data-only="all">Исправить замечания</button>${(fin.issues||[]).some(i=>i.severity==='major')?'<button class="btn block ghost" style="margin-top:8px" data-a="asFixFinal" data-only="major">Исправить только серьёзные</button>':''}</div>`:''}
        <div class="field" style="margin-top:12px"><label for="asUT">Название</label><input id="asUT" class="in" data-m="adm:as_pub_title" value="${esc(M.as_pub_title||d.plan.title)}" maxlength="150"></div>
        <div class="field"><label for="asUA">Автор (имя или псевдоним)</label><input id="asUA" class="in" data-m="adm:as_pub_author" value="${esc(M.as_pub_author)}" maxlength="100"></div>
        <div class="field"><label for="asUD">Описание для каталога</label><textarea id="asUD" class="in" data-m="adm:as_pub_desc" style="min-height:90px">${esc(M.as_pub_desc||d.plan.annotation||d.plan.synopsis)}</textarea></div>
        <p class="hint">Прочитайте главы ниже. Публикация только по вашей кнопке, без неё книга в каталог не попадёт.</p>
        <button class="btn block" data-a="asPublish">Опубликовать в каталог…</button><button class="btn block ghost" style="margin-top:8px" data-a="asCancel">Отменить задание</button></div>`;
    }else if(j.status==='published')body=`<div class="card" style="text-align:center"><div style="font-size:36px">📚</div><b>Книга опубликована</b><button class="btn block" style="margin-top:12px" data-a="asOpenBook">Открыть книгу</button></div>`;
    else body=`<div class="card"><b>${esc(STATUS[j.status]||j.status)}</b></div>`;
    return `${head(d)}${err()}${body}<div class="sec"><div class="sec-h"><h2>Главы</h2></div><div class="list">${chapterRows(d)}</div>${chapterPanel(d)}</div>${journal(d)}`;
  }
  ACT.asResume2=()=>{runLoop()};
  function tabStudio(){
    if(S.cur==='new')return createView();
    if(S.cur){if(!S.d)return S.err?`<button class="btn sm ghost" data-a="asBack">← К заданиям</button>${err()}`:loading();return jobView(S.d)}
    return listView();
  }
  T.push(['aistudio','ИИ-книга']);bodies.aistudio=tabStudio;loaders.aistudio=loadList;
}
