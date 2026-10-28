/* AI orchestrator against `wrangler dev` with AI_BASE pointing at the scripted provider mock below.
   The mock stands in for Groq, Gemini and OpenRouter: this suite proves the routing, versions, limits and resuming, NOT the behaviour of the real services
   (every call it makes is journaled with via='override'). */
import {createHmac} from 'node:crypto';import {startMock} from './ai-mock.mjs';
const B=process.env.BASE||'http://localhost:8806',TOKEN='123456:FAKETOKEN',MOCK=+(process.env.AI_MOCK_PORT||9997);
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};

const {mock,mctl,mcalls,reset}=startMock(MOCK);
/* ---------- client helpers ---------- */
const init=(id,name='User')=>{const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:name})});const str=[...p.entries()].map(([k,v])=>`${k}=${v}`).sort().join('\n');const sk=createHmac('sha256','WebAppData').update(TOKEN).digest();p.set('hash',createHmac('sha256',sk).update(str).digest('hex'));return p.toString()};
const api=async(uid,path,method='GET',body)=>{const r=await fetch(B+path,{method,headers:{'content-type':'application/json',authorization:'tma '+init(uid)},body:body&&JSON.stringify(body)});return{s:r.status,j:await r.json().catch(()=>null)}};
const A=(path,method,body)=>api(1,'/api/admin/ai'+path,method,body);
const create=async(o={})=>(await A('/jobs','POST',{idea:'Детектив в старой Бухаре: торговец находит письмо.',lang:'ru',genre:'detective',chapters:3,words:300,...o}));
/** steps until the job waits (plan_ready, needs_admin, paused, awaiting_publish, published) or `stopWhen` says so */
async function drive(id,stopWhen=()=>false,max=80){let last;for(let i=0;i<max;i++){const r=await A(`/jobs/${id}/step`,'POST',{});if(r.s!==200){return{...r,stopped:'http'}}last=r.j;if(r.j.waiting||stopWhen(r.j.job))return{s:200,j:last};}return{s:200,j:last,stopped:'max'}}
const detail=async id=>(await A('/jobs/'+id)).j;
const callsBy=(d,f)=>d.calls.filter(f);

/* ---------- setup: keys, validation ---------- */
for(const [id,lang] of [[1,'ru'],[11,'ru']])await api(id,'/api/bootstrap');
ok((await api(11,'/api/admin/ai/jobs')).s===403,'the orchestrator is for admins only');
let r=await create();ok(r.s===409&&r.j.error==='no_key','a job cannot start without keys for the draft and editor providers');
const KEY='k_TESTKEY1234567890abcdef';
for(const p of ['groq','gemini','openrouter'])await A('/key','POST',{provider:p,key:KEY+p});
const mods=await A('/models?provider=gemini');ok(mods.s===200&&mods.j.models.some(m=>m.id==='editor-model')&&!mods.j.models.some(m=>m.id==='embed-only'),'live model list: only models that can generate text');
r=await create({roles:{draft:{model:'invented-model'}}});ok(r.s===422&&r.j.error==='unknown_model'&&r.j.models[0].model==='invented-model','a model that is not in the provider list is refused');
r=await create({limits:{maxCostUsd:1}});ok(r.s===422&&r.j.error==='price_unknown','a cost limit needs known prices for every model used');
r=await create({idea:'коротко'});ok(r.s===400,'the idea must be described');

/* ---------- 1. the full flow ---------- */
await reset();await mctl({reviewFail:{2:1}});
r=await create();ok(r.s===200&&r.j.job.status==='draft'&&r.j.job.config.roles.draft.primary.provider==='groq'&&r.j.job.config.roles.editor.primary.provider==='gemini'&&r.j.job.config.roles.expert.primary.provider==='openrouter','job created with the configured roles');
const J1=r.j.job.id;
r=await drive(J1);ok(r.j.waiting==='plan_ready'&&r.j.job.title==='Письмо из Бухары','the architect (Gemini) made a plan and the job waits for approval');
ok((await A(`/jobs/${J1}/step`,'POST',{})).j.waiting==='plan_ready'&&(await mcalls()).length===1,'no model is called while the plan waits for the administrator');
ok((await A(`/jobs/${J1}/approve-plan`,'POST',{})).s===400,'the plan needs an explicit confirmation');
ok((await A(`/jobs/${J1}/plan`,'PUT',{title:'Письмо из Бухары. Правка',synopsis:'Торговец находит письмо.',chapters:[{title:'Один',summary:'a'},{title:'Два',summary:'b'}]})).s===422,'a plan with the wrong number of chapters is refused');
const pl=(await detail(J1)).plan;ok((await A(`/jobs/${J1}/plan`,'PUT',{...pl,title:'Письмо из Бухары. Правка'})).s===200,'the administrator edits the plan');
ok((await A(`/jobs/${J1}/approve-plan`,'POST',{confirm:true})).j.job.status==='running','plan approved');
r=await drive(J1);ok(r.j.waiting==='awaiting_publish'&&r.j.job.state.final.ok===true,'all chapters passed, final review done, the job waits for publication');
let d=await detail(J1);
const T=(t,p)=>callsBy(d,x=>x.task===t&&(!p||x.provider===p)&&x.status==='ok').length;
ok(T('plan','gemini')===1&&T('chapter_draft','groq')===3&&T('chapter_fix','groq')===1&&T('chapter_review','gemini')===4&&T('analyze','gemini')===3&&T('final_review','gemini')===1&&T('final_second','openrouter')===1&&T('annotation','groq')===1,'routing: Groq drafts and fixes, Gemini plans/reviews/analyses, OpenRouter gives the second opinion');
ok(callsBy(d,x=>x.task==='chapter_expert').length===0,'the expert is not called for chapters that pass');
const mc=await mcalls();ok(mc.length===d.calls.length&&d.job.usage.calls===mc.length,'the journal matches every call the providers received ('+mc.length+')');
ok(d.calls.every(x=>x.via==='override'&&x.model&&x.latency>=0&&x.tokens_in>0&&x.tokens_out>0&&x.status),'journal: provider, model, latency, tokens, result; mock calls are marked as override, not as real');
ok(d.job.usage.tokensIn===120*mc.length&&d.job.usage.tokensOut===80*mc.length,'token totals are summed from the provider usage');
const exp=callsBy(d,x=>x.provider==='openrouter'&&x.status==='ok');ok(exp.length>0&&exp.every(x=>Math.abs(x.cost-(120*1+80*2)/1e6)<1e-9),'cost is computed from the price in the provider list (OpenRouter)');
ok(callsBy(d,x=>x.provider==='groq').every(x=>x.cost===null)&&d.job.usage.costUnknown===true,'unknown prices stay unknown (no guessed cost)');
const c2=(await A(`/jobs/${J1}/chapters/1`)).j;ok(c2.versions.map(v=>v.kind).join()==='draft,revision','versions: the original draft and the corrected text are both kept');
const orig=(await A(`/jobs/${J1}/versions/${c2.versions[0].id}`)).j.version.text,fixed=(await A(`/jobs/${J1}/versions/${c2.versions[1].id}`)).j.version.text;
ok(orig!==fixed&&fixed.includes('ИСПРАВЛЕНО')&&c2.chapter.text===fixed&&!orig.includes('ИСПРАВЛЕНО'),'the saved chapter is the corrected one, the draft is untouched');
ok(d.checks.some(x=>x.chapter===1&&x.kind==='editor'&&!x.ok&&x.issues[0].severity==='major')&&d.checks.some(x=>x.chapter===1&&x.kind==='editor'&&x.ok)&&d.checks.some(x=>x.kind==='program')&&d.checks.some(x=>x.kind==='final'),'check results are stored (program, editor, final)');
ok((await A(`/jobs/${J1}/publish`,'POST',{})).s===400,'publishing needs an explicit confirmation');
ok((await A(`/jobs/${J1}/publish`,'POST',{confirm:true,author:'Тест Автор'})).j.bookId!==undefined,'published after the administrator confirmed');
const bk=(await api(11,'/api/bootstrap')).j.books.find(b=>b.title==='Письмо из Бухары. Правка');
ok(bk&&bk.ai&&bk.fullText&&bk.nch===3&&bk.ai.provider==='groq+gemini+openrouter','the book is in the catalog, readable, labelled as AI-made');
ok((await A(`/jobs/${J1}/publish`,'POST',{confirm:true})).s===409,'a job cannot be published twice');
const J0=r.j.job.id;void J0;

/* ---------- 2. provider switching and unusable answers ---------- */
await reset();await mctl({groqMode:'429'});
r=await create({title:'Переключение'});const J2=r.j.job.id;await drive(J2);await A(`/jobs/${J2}/approve-plan`,'POST',{confirm:true});
r=await drive(J2,j=>j.state.chapter>=1&&j.state.phase==='draft');d=await detail(J2);
const dr=d.calls.filter(x=>x.task==='chapter_draft'&&x.chapter===0).sort((a,b)=>a.id-b.id);
ok(dr.length===2&&dr[0].provider==='groq'&&dr[0].status==='rate_limit'&&dr[1].provider==='gemini'&&dr[1].status==='ok','rate limit on Groq → the draft is written by the fallback provider (Gemini), no retry on the limited one');
ok(d.chapters[0].status==='approved'&&d.chapters[0].words>100,'the chapter written by the fallback was checked and approved');
await A(`/jobs/${J2}/cancel`,'POST',{});

await reset();await mctl({groqMode:'empty-once'});
r=await create({title:'Пустой ответ'});const J3=r.j.job.id;await drive(J3);await A(`/jobs/${J3}/approve-plan`,'POST',{confirm:true});
await drive(J3,j=>j.state.phase==='check');d=await detail(J3);
const em=d.calls.filter(x=>x.task==='chapter_draft'&&x.chapter===0).sort((a,b)=>a.id-b.id);
ok(em.length===2&&em[0].status==='empty'&&em[1].status==='ok'&&em[1].provider==='groq','an empty answer is retried once on the same provider');
await A(`/jobs/${J3}/cancel`,'POST',{});

await reset();await mctl({groqMode:'short-once'});
r=await create({title:'Короткий текст'});const J4=r.j.job.id;await drive(J4);await A(`/jobs/${J4}/approve-plan`,'POST',{confirm:true});
await drive(J4,j=>j.state.chapter>=1);d=await detail(J4);
const vs=(await A(`/jobs/${J4}/chapters/0`)).j.versions.map(v=>v.kind).join();
ok(vs==='draft,revision'&&d.checks.some(x=>x.chapter===0&&x.kind==='program'&&!x.ok&&x.issues.some(i=>i.type==='length')),'a too short draft is caught by the programmatic check and fixed before any editor call');
ok(d.calls.filter(x=>x.task==='chapter_review'&&x.chapter===0).length===1,'the editor reviewed only the corrected text');
await A(`/jobs/${J4}/cancel`,'POST',{});

/* ---------- 3. interruption, resuming, locking ---------- */
await reset();
r=await create({title:'Возобновление'});const J5=r.j.job.id;await drive(J5);await A(`/jobs/${J5}/approve-plan`,'POST',{confirm:true});
await drive(J5,j=>j.state.chapter===1&&j.state.phase==='draft');
const cnt=async task=>(await mcalls()).filter(x=>x.task===task).length;const before=[await cnt('chapter_draft'),await cnt('chapter_review'),await cnt('analyze')].join();
ok((await A(`/jobs/${J5}/pause`,'POST',{})).j.job.status==='paused','the job can be paused between chapters');
const n0=(await mcalls()).length;ok((await A(`/jobs/${J5}/step`,'POST',{})).j.waiting==='paused'&&(await mcalls()).length===n0,'a paused job makes no calls');
ok((await A(`/jobs/${J5}/resume`,'POST',{})).j.job.status==='running','resume');
await mctl({delayMs:400});
const [s1,s2]=await Promise.all([A(`/jobs/${J5}/step`,'POST',{}),A(`/jobs/${J5}/step`,'POST',{})]);
ok([s1.s,s2.s].sort().join()==='200,409'&&[s1,s2].find(x=>x.s===409).j.error==='busy','two parallel steps of one job: one runs, the other is refused (no double calls)');
await mctl({delayMs:0});
await drive(J5);d=await detail(J5);
ok(before==='1,1,1'&&d.job.status==='awaiting_publish'&&[await cnt('chapter_draft'),await cnt('chapter_review'),await cnt('analyze')].join()==='3,3,3','resumed job finished with exactly one draft, review and analysis per chapter: nothing repeated');
ok(d.chapters.every(c=>c.status==='approved'),'no chapter was lost');

/* ---------- 4. escalation to the expert, administrator decision, final gate ---------- */
await reset();await mctl({reviewAlways:[1],finalFail:true});
r=await create({title:'Сложная глава'});const J6=r.j.job.id;await drive(J6);await A(`/jobs/${J6}/approve-plan`,'POST',{confirm:true});
r=await drive(J6);d=await detail(J6);
ok(r.j.waiting==='needs_admin','a chapter that keeps failing stops the job for the administrator');
const seq=d.calls.filter(x=>x.chapter===0&&['chapter_fix','chapter_expert','chapter_draft'].includes(x.task)).sort((a,b)=>a.id-b.id).map(x=>x.task+':'+x.provider).join();
ok(seq==='chapter_draft:groq,chapter_fix:groq,chapter_fix:groq,chapter_expert:openrouter','escalation: draft, two fix rounds by Groq, then the chosen OpenRouter expert, once');
ok((await A(`/jobs/${J6}/chapters/0`)).j.versions.map(v=>v.kind).join()==='draft,revision,revision,expert'&&d.checks.filter(x=>x.chapter===0&&x.kind==='editor').length===4,'every version and check was kept; the expert result was re-checked by the editor');
const nCalls=(await mcalls()).length;ok((await A(`/jobs/${J6}/step`,'POST',{})).j.waiting==='needs_admin'&&(await mcalls()).length===nCalls,'no more calls while it waits for the administrator');
ok((await A(`/jobs/${J6}/chapters/0/resolve`,'POST',{action:'edit',text:'коротко'})).s===422,'an administrator edit must be a real text');
await mctl({reviewAlways:[]});
const mine=(await A(`/jobs/${J6}/chapters/0`)).j.chapter.text+'\n\nПравка администратора.';
ok((await A(`/jobs/${J6}/chapters/0/resolve`,'POST',{action:'edit',text:mine})).j.job.status==='running','the administrator edits the chapter and the job continues');
r=await drive(J6);d=await detail(J6);
ok(r.j.waiting==='awaiting_publish'&&r.j.job.state.final.ok===false,'the final review found a major problem');
ok((await A(`/jobs/${J6}/chapters/0`)).j.versions.some(v=>v.kind==='admin'),'the administrator version is stored');
r=await A(`/jobs/${J6}/publish`,'POST',{confirm:true});ok(r.s===409&&r.j.error==='final_issues','publication is blocked while the final review reports a major problem');
r=await A(`/jobs/${J6}/publish`,'POST',{confirm:true,override:true});ok(r.s===200&&r.j.bookId,'the administrator can publish anyway, explicitly');

/* ---------- 5. budget ---------- */
await reset();
r=await create({title:'Бюджет',limits:{maxCalls:5}});const J7=r.j.job.id;await drive(J7);await A(`/jobs/${J7}/approve-plan`,'POST',{confirm:true});
r=await drive(J7);d=await detail(J7);
ok(r.j.waiting==='paused'&&r.j.job.pauseReason==='budget:calls'&&d.job.usage.calls===5&&(await mcalls()).length===5,'the call limit stops the job; not a single extra call was made');
ok((await A(`/jobs/${J7}/step`,'POST',{})).j.waiting==='paused'&&(await mcalls()).length===5,'a paused job stays paused');
r=await A(`/jobs/${J7}/resume`,'POST',{limits:{maxCalls:9999}});ok(r.s===200&&r.j.job.config.limits.maxCalls<=300,'limits can be raised on resume, but never above the server cap');
await A(`/jobs/${J7}/cancel`,'POST',{});
r=await drive((await create({title:'Нет провайдера'})).j.job.id,()=>false,3);void r;


/* ---------- the author model chooses genre, chapters and size ---------- */
await reset();
r=await A('/jobs','POST',{idea:'Мой готовый план: 1. Письмо. 2. Погоня. 3. Развязка. Историческая драма о торговце из Бухары.',lang:'ru'});
ok(r.s===200&&r.j.job.config.auto===true,'only a plan/idea and a language are enough: the rest is chosen by the author model');
const JA=r.j.job.id;r=await drive(JA);d=await detail(JA);
ok(r.j.waiting==='plan_ready'&&d.job.config.genre==='historical'&&d.job.config.chapters===3&&d.job.config.words===600,'the plan fixed the genre, the number of chapters and the chapter size');
{const pc=(await mcalls()).filter(x=>x.task==='plan');ok(pc.length===1&&pc[0].prompt.includes('Сам выбери жанр')&&pc[0].prompt.includes('1. Письмо. 2. Погоня. 3. Развязка.'),'the author model gets the administrator plan and is asked to choose genre, chapters and size')}
ok((await A(`/jobs/${JA}/plan`,'PUT',{...d.plan,chapters:[...d.plan.chapters,{title:'Эпилог',summary:'Финал'}]})).j.job.config.chapters===4,'in the automatic mode the administrator may change the number of chapters');
await A(`/jobs/${JA}/cancel`,'POST',{});
r=await A('/jobs','POST',{idea:'Детектив в Бухаре про письмо торговца.',lang:'ru',genre:'detective',chapters:3,words:600});
ok(r.j.job.config.auto===false,'choosing genre/chapters/size by hand keeps the manual mode');
await A(`/jobs/${r.j.job.id}/cancel`,'POST',{});

/* a job whose only editor key disappears is paused, not failed */
await reset();
r=await create({title:'Без ключа'});const J8=r.j.job.id;await A('/key','POST',{provider:'gemini',key:''});
r=await drive(J8);ok(r.j.waiting==='paused'&&/^no_provider:plan/.test(r.j.job.pauseReason),'no key for a needed role → the job pauses with a clear reason');
await A('/key','POST',{provider:'gemini',key:KEY+'gemini'});r=await A(`/jobs/${J8}/resume`,'POST',{});r=await drive(J8);ok(r.j.waiting==='plan_ready','after the key is back the job resumes from where it stopped');

const list=(await A('/jobs')).j.jobs;ok(list.length>=8&&list.every(j=>j.id&&j.status),'job list');
mock.close();
console.log(fails?`\n${fails} FAILED`:'\nall passed');process.exit(fails?1:0);
