import test from 'node:test';import assert from 'node:assert/strict';
import {TASK_ROLE,rolesFromEnv,mergeRoles,candidatesFor,limitsFrom,priceOf,costOf,budgetCheck,unknownModels,parseSpec,pricesFromEnv} from '../worker/orch-route.js';
import {checkChapter,checkBook,cleanText,parseJsonLoose,parseReview,parsePlan,parseAnalysis,words} from '../worker/orch-checks.js';
import {classify,AiError,parseUsage} from '../worker/ai.js';

const ENV={AI_DRAFT_MODEL:'draft-m',AI_EDITOR_MODEL:'edit-m',AI_EXPERT_MODEL:'expert-m',AI_DRAFT_FALLBACK:'gemini:fb-m,openrouter:fb2'};
const roles=()=>mergeRoles(rolesFromEnv(ENV),{}).roles;

test('tasks are routed to the roles of the specification',()=>{
  assert.equal(TASK_ROLE.chapter_draft,'draft');assert.equal(TASK_ROLE.chapter_fix,'draft');assert.equal(TASK_ROLE.annotation,'draft');
  for(const t of ['plan','chapter_review','analyze','final_review'])assert.equal(TASK_ROLE[t],'editor');
  for(const t of ['chapter_expert','final_second'])assert.equal(TASK_ROLE[t],'expert');
});
test('roles come from server variables and the primary providers are fixed',()=>{
  const r=roles();
  assert.deepEqual(r.draft.primary,{provider:'groq',model:'draft-m'});assert.deepEqual(r.editor.primary,{provider:'gemini',model:'edit-m'});assert.deepEqual(r.expert.primary,{provider:'openrouter',model:'expert-m'});
  assert.deepEqual(r.draft.fallbacks,[{provider:'gemini',model:'fb-m'},{provider:'openrouter',model:'fb2'}]);
  assert.equal(mergeRoles(rolesFromEnv({}),{}).error,'roles_required','no model is assumed when nothing is configured');
  assert.equal(mergeRoles(rolesFromEnv({}),{draft:{model:'a-b'},editor:{model:'c-d'}}).roles.expert,null,'the expert is optional');
  assert.equal(mergeRoles(rolesFromEnv(ENV),{expert:null}).roles.expert,null,'the admin can switch the expert off');
  assert.equal(mergeRoles(rolesFromEnv(ENV),{draft:{model:'bad model!'}}).error,'model:draft');
});
test('candidates: primary first, then fallbacks, providers without a key are skipped',()=>{
  const r=roles();
  assert.deepEqual(candidatesFor(r,'chapter_draft').map(x=>x.provider),['groq','gemini','openrouter']);
  assert.deepEqual(candidatesFor(r,'chapter_draft',p=>p!=='groq').map(x=>x.provider),['gemini','openrouter'],'provider switching when the primary has no key');
  assert.deepEqual(candidatesFor(r,'chapter_review').map(x=>x.provider),['gemini']);
  assert.deepEqual(candidatesFor(r,'chapter_review',()=>false),[]);
  assert.deepEqual(candidatesFor(mergeRoles(rolesFromEnv(ENV),{expert:null}).roles,'chapter_expert'),[],'no expert configured → nothing to call');
});
test('limits can be tightened per job but never loosened beyond the server caps',()=>{
  const e={AI_MAX_CALLS:'50',AI_MAX_TOKENS:'100000',AI_MAX_COST_USD:'2',AI_FIX_ROUNDS:'2',AI_MAX_JOBS:'1'};
  const l=limitsFrom(e,{maxCalls:500,maxTokens:20000,maxCostUsd:5,fixRounds:3});
  assert.equal(l.maxCalls,50);assert.equal(l.maxTokens,20000);assert.equal(l.maxCostUsd,2);assert.equal(l.fixRounds,2);assert.equal(l.maxJobs,1);
  assert.equal(limitsFrom({},{}).maxCalls,200);assert.equal(limitsFrom({},{}).maxCostUsd,null);
  assert.equal(limitsFrom({},{maxCostUsd:1.5}).maxCostUsd,1.5);
});
test('cost: known prices give a cost, unknown ones give null (never a guess)',()=>{
  const prices=pricesFromEnv({AI_PRICES:'{"groq:m":[0.5,1.5]}'});
  assert.equal(costOf({in:2e6,out:1e6},priceOf(prices,'groq','m')),2.5);assert.equal(costOf({in:10,out:10},priceOf(prices,'gemini','x')),null);
  assert.deepEqual(pricesFromEnv({AI_PRICES:'not json'}),{});
});
test('budget: calls, tokens and cost stop the job',()=>{
  const lim={maxCalls:3,maxTokens:1000,maxCostUsd:1};
  assert.equal(budgetCheck({calls:2,tokens_in:100,tokens_out:100,cost:.1},lim),null);
  assert.equal(budgetCheck({calls:3,tokens_in:0,tokens_out:0,cost:0},lim),'calls');
  assert.equal(budgetCheck({calls:1,tokens_in:600,tokens_out:400,cost:0},lim),'tokens');
  assert.equal(budgetCheck({calls:1,tokens_in:1,tokens_out:1,cost:1},lim),'cost');
  assert.equal(budgetCheck({calls:1,tokens_in:1,tokens_out:1,cost:99},{...lim,maxCostUsd:null}),null);
});
test('models missing from the provider list are reported',()=>{
  const r=roles(),u=unknownModels(r,{groq:['draft-m'],gemini:['edit-m'],openrouter:['expert-m','fb2']});
  assert.deepEqual(u,[{provider:'gemini',model:'fb-m'}]);
  assert.deepEqual(unknownModels(r,{}),[],'providers that could not be listed are not guessed');
});
test('parseSpec accepts provider:model only',()=>{assert.deepEqual(parseSpec('groq:llama-x'),{provider:'groq',model:'llama-x'});assert.equal(parseSpec('nope:x'),null);assert.equal(parseSpec('groq'),null)});

const RU='Он вышел во двор и увидел старый дом, в котором давно никто не жил. '.repeat(0);
const para=i=>`Абзац номер ${i}: утро было тихим, и ветер приносил запах реки, пока Алишер шёл по узкой улице и думал о письме, которое лежало у него в кармане.`;
const good=Array.from({length:30},(_,i)=>para(i)).join('\n\n');
test('programmatic checks: a normal chapter passes',()=>{
  const i=checkChapter(good,{lang:'ru',targetWords:500});assert.deepEqual(i.filter(x=>x.severity==='major'),[]);void RU;
});
test('programmatic checks: empty, short, wrong language, assistant phrases, repeats',()=>{
  const maj=(t,o)=>checkChapter(t,{lang:'ru',targetWords:500,...o}).filter(x=>x.severity==='major').map(x=>x.type);
  assert.deepEqual(maj(''),['length']);
  assert.ok(maj('Короткий текст из нескольких слов. '.repeat(10)).includes('length'));
  assert.ok(maj(good.replace(/[а-яё]/gi,c=>({а:'a',е:'e',о:'o',р:'p',с:'c',и:'i',н:'n',т:'t',у:'y',к:'k',в:'v',л:'l',д:'d',м:'m',ш:'sh'}[c.toLowerCase()]||c))).includes('language'),'latin text for ru');
  assert.ok(maj('Конечно! Вот глава книги.\n\n'+good).includes('format'));
  assert.ok(maj('Как языковая модель, я не могу.\n\n'+good).includes('format'));
  assert.ok(maj(Array(12).fill(para(1)).join('\n\n')).includes('repetition'));
  assert.ok(maj(good,{prevText:good}).includes('repetition'),'a chapter repeating the previous one');
  const uz=Array.from({length:30},(_,i)=>`Ertalab ${i+1}-shamol esdi va Alisher tor ko‘cha bo‘ylab yurib, cho‘ntagidagi xat haqida o‘ylardi.`).join(' ');
  assert.deepEqual(checkChapter(uz,{lang:'uz',targetWords:300}).filter(x=>x.severity==='major'),[]);
  assert.ok(checkChapter(good,{lang:'uz',targetWords:500}).some(x=>x.type==='language'),'cyrillic text for uz');
});
test('book checks: chapter count and empty chapters',()=>{
  assert.ok(checkBook([{title:'a',text:good}],{count:2}).some(x=>x.note.includes('в плане')));
  assert.ok(checkBook([{title:'a',text:good},{title:'a',text:''}],{count:2}).some(x=>x.severity==='major'));
});
test('cleanText strips markdown and extra blank lines',()=>assert.equal(cleanText('# Глава\n\n**Текст** тут\n\n\n\n- пункт'),'Текст тут\n\n— пункт'));
test('JSON parsing tolerates text around the object and braces inside strings',()=>{
  assert.deepEqual(parseJsonLoose('Вот ответ: {"a":"x } y","b":[1,2]} спасибо'),{a:'x } y',b:[1,2]});assert.equal(parseJsonLoose('нет json'),null);assert.equal(parseJsonLoose('{"a":'),null);
});
test('editor review: major issues fail the chapter, minor ones do not, garbage throws',()=>{
  assert.equal(parseReview('{"issues":[]}').ok,true);
  const r=parseReview('```json\n{"issues":[{"type":"continuity","severity":"major","note":"Герой мёртв, но говорит"},{"type":"style","severity":"minor","note":"Повторы"}]}\n```');
  assert.equal(r.ok,false);assert.equal(r.issues.length,2);assert.equal(parseReview('{"issues":[{"severity":"minor","note":"x"}]}').ok,true);
  assert.throws(()=>parseReview('всё хорошо'),/bad_format/);assert.throws(()=>parseReview('{"ok":true}'),/bad_format/);
});
test('plan and analysis parsers validate the shape',()=>{
  const plan=JSON.stringify({title:'T',synopsis:'S',style:{voice:'v',rules:['r']},characters:[{name:'А',role:'r',traits:'t'}],facts:['f'],chapters:[{title:'1',summary:'s'},{title:'2',summary:'s'}]});
  assert.equal(parsePlan(plan,{chapters:2}).chapters.length,2);assert.equal(parsePlan(plan,{chapters:0}).chapters.length,2,'any count when the author model chooses');
  const auto=parsePlan(JSON.stringify({...JSON.parse(plan),genre:'detective',wordsPerChapter:5000}));assert.equal(auto.genre,'detective');assert.equal(auto.wordsPerChapter,2000,'chapter size is clamped');assert.equal(parsePlan(JSON.stringify({...JSON.parse(plan),genre:'nonsense'})).genre,'','an unknown genre is not accepted');assert.throws(()=>parsePlan(plan,{chapters:3}),/bad_format/);assert.throws(()=>parsePlan('{}'),/bad_format/);
  assert.equal(parseAnalysis('{"summary":"Краткое содержание главы здесь","facts":["a"],"characters":[{"name":"А","state":"s"}]}').facts[0],'a');assert.throws(()=>parseAnalysis('{"summary":"x"}'),/bad_format/);
});
test('provider errors are classified',()=>{
  assert.equal(classify(429,{error:{message:'q'}}).kind,'rate_limit');assert.equal(classify(401,{}).kind,'auth');assert.equal(classify(503,{}).kind,'provider');assert.equal(classify(504,{}).kind,'timeout');assert.equal(classify(400,{}).kind,'bad_request');assert.ok(new AiError('empty') instanceof Error);
});
test('usage is read from both API shapes',()=>{
  assert.deepEqual(parseUsage('groq',{usage:{prompt_tokens:5,completion_tokens:7}}),{in:5,out:7});assert.deepEqual(parseUsage('gemini',{usageMetadata:{promptTokenCount:3,candidatesTokenCount:4}}),{in:3,out:4});assert.equal(parseUsage('groq',{}),null);void words;
});

import {buildRequest,callModel,listModels} from '../worker/ai.js';
test('gpt-oss on Groq gets a short reasoning effort; other models are untouched',()=>{
  const b=m=>JSON.parse(buildRequest('groq',m,'K',{system:'S',prompt:'P'}).init.body);
  assert.equal(b('openai/gpt-oss-120b').reasoning_effort,'low');assert.equal(b('llama-3.3-70b-versatile').reasoning_effort,undefined);
  assert.equal(JSON.parse(buildRequest('openrouter','openai/gpt-oss-120b','K',{system:'S',prompt:'P'}).init.body).reasoning_effort,undefined);
});
test('the model that really answered is reported when a router picked it',async()=>{
  const real=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({model:'qwen/some-free',choices:[{message:{content:'текст'}}],usage:{prompt_tokens:3,completion_tokens:4}}),{status:200});
  try{
    const r=await callModel({},'K',{provider:'openrouter',model:'openrouter/free',system:'S',prompt:'P',max:100});
    assert.equal(r.served,'qwen/some-free');assert.deepEqual(r.usage,{in:3,out:4,estimated:false});assert.equal(r.via,'api');
    globalThis.fetch=async()=>new Response(JSON.stringify({model:'m',choices:[{message:{content:'x'}}]}),{status:200});
    assert.equal((await callModel({},'K',{provider:'groq',model:'m',system:'S',prompt:'P',max:100})).served,'','nothing extra when the model is the requested one');
  }finally{globalThis.fetch=real}
});
test('router prices (negative = variable) are not turned into a cost',async()=>{
  const real=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({data:[{id:'openrouter/auto',pricing:{prompt:'-1',completion:'-1'}},{id:'openrouter/free',pricing:{prompt:'0',completion:'0'}},{id:'x/y',pricing:{prompt:'0.000001',completion:'0.000002'}}]}),{status:200});
  try{const l=await listModels({},'K','openrouter');assert.equal(l.find(m=>m.id==='openrouter/auto').price,undefined);assert.deepEqual(l.find(m=>m.id==='openrouter/free').price,[0,0]);assert.deepEqual(l.find(m=>m.id==='x/y').price,[1,2])}finally{globalThis.fetch=real}
});

import {pickModels} from '../worker/orch-route.js';
import {detectLang} from '../worker/orch-checks.js';
test('automatic model choice uses only real list entries',()=>{
  const l={groq:['whisper-large-v3','llama-3.3-70b-versatile','openai/gpt-oss-120b','llama-guard-4'],gemini:['gemini-2.5-flash','gemini-3.5-flash-lite','gemini-3.5-flash','gemini-3.6-flash-preview','gemini-3.5-flash-image','embedding-001'],openrouter:['openrouter/free','google/gemma-4-31b-it:free','meta-llama/llama-3.3-70b-instruct:free','openai/gpt-5']};
  assert.deepEqual(pickModels(l),{draft:'openai/gpt-oss-120b',editor:'gemini-3.5-flash',expert:'google/gemma-4-31b-it:free'},'a full flash before a lite one of the same version; previews and image models are skipped');
  assert.equal(pickModels({groq:['llama-3.3-70b-versatile']}).draft,'llama-3.3-70b-versatile');
  assert.deepEqual(pickModels({}),{draft:null,editor:null,expert:null},'nothing is invented when the lists are empty');
  assert.equal(pickModels({groq:['whisper-large-v3','llama-guard-4']}).draft,null);
  assert.equal(pickModels({openrouter:['x/some-70b-chat:free']}).expert,'x/some-70b-chat:free');assert.equal(pickModels({openrouter:['x/paid-70b']}).expert,null,'the expert is free or none');
});
test('language is detected by script',()=>{assert.equal(detectLang('Детектив в Бухаре'),'ru');assert.equal(detectLang('Buxoro savdogari xat topadi'),'uz');assert.equal(detectLang('Роман и Mening'),'ru')});

import {freeOnly} from '../worker/orch-route.js';
test('free-only drops paid OpenRouter models and keeps the rest',()=>{
  const roles=mergeRoles(rolesFromEnv({AI_DRAFT_MODEL:'d-m',AI_EDITOR_MODEL:'e-m',AI_EXPERT_MODEL:'x/paid',AI_DRAFT_FALLBACK:'openrouter:y/free:free,openrouter:y/paid2'}),{}).roles;
  const prices={'openrouter:x/paid':[1,2],'openrouter:y/free:free':[0,0],'openrouter:y/paid2':[0.1,0.1]};
  const dropped=freeOnly(roles,prices);
  assert.equal(roles.expert,null);assert.deepEqual(roles.draft.fallbacks.map(x=>x.model),['y/free:free']);assert.equal(dropped.length,2);assert.ok(dropped.every(x=>x.reason==='not_free'));
  assert.equal(roles.draft.primary.model,'d-m','Groq and Gemini are kept');
  const r2=mergeRoles(rolesFromEnv({AI_DRAFT_MODEL:'dd',AI_EDITOR_MODEL:'ee',AI_EXPERT_MODEL:'unlisted/model'}),{}).roles;
  freeOnly(r2,{});assert.equal(r2.expert,null,'a model without a known price is not treated as free');
});

import {issueChapters,fixPlan} from '../worker/orch-checks.js';
test('chapters are read out of the final review notes',()=>{
  const n=14;
  assert.deepEqual(issueChapters({where:'главы 9, 10, 11, 13'},n),[8,9,10,12]);
  assert.deepEqual(issueChapters({where:'Глава 4'},n),[3]);
  assert.deepEqual(issueChapters({where:'глава 14'},n),[13]);
  assert.deepEqual(issueChapters({where:'главы 2-4'},n),[1,2,3]);
  assert.deepEqual(issueChapters({where:'главы 11, 12 и 13'},n),[10,11,12]);
  assert.deepEqual(issueChapters({where:'Глава 3',note:'см. также главу 5'},n),[2,4]);
  assert.deepEqual(issueChapters({where:'финал',note:'Развязка слабая'},n),[]);
  assert.deepEqual(issueChapters({where:'глава 99'},n),[],'a chapter that does not exist is ignored');
});
test('the fix plan groups the notes by chapter and leaves whole-book notes out',()=>{
  const issues=[{severity:'major',where:'главы 9, 10',note:'a'},{severity:'minor',where:'Глава 10',note:'b'},{severity:'minor',where:'весь текст',note:'c'}];
  const fp=fixPlan(issues,14);assert.deepEqual(fp.chapters,[8,9]);assert.equal(fp.byChapter[9].length,2);assert.equal(fp.global.length,1);
  assert.deepEqual(fixPlan(issues,14,'major').chapters,[8,9]);assert.equal(fixPlan(issues,14,'major').byChapter[9].length,1);
});
