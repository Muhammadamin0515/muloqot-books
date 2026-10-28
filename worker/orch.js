/* AI orchestrator: plans a book, writes and checks it chapter by chapter, and publishes only after the administrator approves.
   Each POST /api/admin/ai/jobs/:id/step performs exactly one unit of work (one model call or one programmatic check) and saves the result,
   so a job can be stopped and resumed at any time without losing chapters or repeating successful calls. */
import {PROVIDERS,AiError,callModel,listModels} from './ai.js';
import {candidatesFor,rolesFromEnv,mergeRoles,limitsFrom,priceOf,costOf,pricesFromEnv,budgetCheck,unknownModels,ROLE_PROVIDER} from './orch-route.js';
import {checkChapter,checkBook,cleanText,parseReview,parsePlan,parseAnalysis,words} from './orch-checks.js';
import * as PR from './orch-prompts.js';

const LOCK_MS=100000,MAX_ACTIVE=10,RETRIES=1,MAX_VERSIONS=240;
const ACTIVE=['draft','plan_ready','running','paused','needs_admin','awaiting_publish'];
/** Stops the job for a reason that an administrator or a later step can resolve. The state is kept untouched. */
class Halt extends Error{constructor(reason){super(reason);this.reason=reason}}

export function registerOrch(d){
  const {route,stmt,get,all,run,batch,json,bad,P,J,audit,id8,aiKey,importOne}=d;

  /* ---------- storage ---------- */
  const loadJob=async(c,id)=>{
    const r=await get(c,'SELECT * FROM ai_jobs WHERE id=?',id);if(!r)return null;
    return{...r,config:P(r.config),plan:r.plan?P(r.plan):null,state:P(r.state||'{}')};
  };
  const saveJob=(c,job,extra={})=>stmt(c,'UPDATE ai_jobs SET status=?,pause_reason=?,plan=?,state=?,updated=? WHERE id=?',job.status,job.pause_reason||'',job.plan?J(job.plan):null,J(job.state),Date.now(),job.id);
  const chaptersOf=async(c,id)=>(await all(c,'SELECT idx,status,text,summary,facts FROM ai_chapters WHERE job_id=? ORDER BY idx',id)).map(r=>({...r,facts:P(r.facts||'[]')}));
  const addVersion=(c,job,chapter,kind,text,who,note='')=>stmt(c,'INSERT INTO ai_versions(job_id,chapter,kind,text,provider,model,note,created) VALUES(?,?,?,?,?,?,?,?)',job.id,chapter,kind,text,who?.provider||'',who?.model||'',note,Date.now());
  const addCheck=(c,job,chapter,kind,ok,issues,who)=>stmt(c,'INSERT INTO ai_checks(job_id,chapter,kind,ok,issues,provider,model,created) VALUES(?,?,?,?,?,?,?,?)',job.id,chapter,kind,ok?1:0,J(issues),who?.provider||'',who?.model||'',Date.now());

  const view=job=>({id:job.id,title:job.title,status:job.status,pauseReason:job.pause_reason,created:job.created,updated:job.updated,config:{lang:job.config.lang,genre:job.config.genre,chapters:job.config.chapters,words:job.config.words,roles:job.config.roles,limits:job.config.limits,idea:job.config.idea},
    state:job.state,usage:{calls:job.calls,tokensIn:job.tokens_in,tokensOut:job.tokens_out,cost:job.cost,costUnknown:!!job.cost_unknown},bookId:job.book_id||null});

  /* ---------- calling a role: fallbacks, retries, limits, journal ---------- */
  async function callRole(c,job,task,{chapter=-1,system,prompt,max=3000,temperature=.8,json:wantJson=false,parse=null}){
    const roles=job.config.roles,keys={};
    for(const p of Object.keys(PROVIDERS))keys[p]=(await aiKey(c,p)).key;
    const cands=candidatesFor(roles,task,p=>!!keys[p]);
    if(!cands.length)throw new Halt('no_provider:'+task);
    let lastKind='';
    for(const cand of cands){
      for(let attempt=0;attempt<=RETRIES;attempt++){
        const b=budgetCheck(job,job.config.limits);if(b)throw new Halt('budget:'+b);
        const price=priceOf(job.config.prices,cand.provider,cand.model);
        let status='ok',error='',usage={in:0,out:0,estimated:false},latency=0,via='api',value=null,text='',served='';
        try{
          const r=await callModel(c.env,keys[cand.provider],{provider:cand.provider,model:cand.model,system,prompt,max:Math.min(8000,max+1500),temperature,json:wantJson&&cand.provider==='gemini'}); /* headroom for models that think before answering */
          served=r.served;usage=r.usage;latency=r.latency;via=r.via;text=r.text;
          if(parse){try{value=parse(text)}catch(e){status='bad_format';error=String(e.message||'bad_format')}}
        }catch(e){
          const k=e instanceof AiError?e.kind:'provider';status=k;error=String(e.message||k).slice(0,200);latency=e.latency||0;lastKind=k;
        }
        const cost=costOf(usage,price);
        job.calls++;job.tokens_in+=usage.in;job.tokens_out+=usage.out;if(cost!=null)job.cost=Math.round((job.cost+cost)*1e6)/1e6;else if(usage.in+usage.out>0)job.cost_unknown=1;
        await batch(c,[
          stmt(c,'INSERT INTO ai_calls(job_id,chapter,task,provider,model,via,latency,tokens_in,tokens_out,estimated,cost,status,error,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',job.id,chapter,task,cand.provider,served?`${cand.model} → ${served}`:cand.model,via,latency,usage.in,usage.out,usage.estimated?1:0,cost,status,error,Date.now()),
          stmt(c,'UPDATE ai_jobs SET calls=?,tokens_in=?,tokens_out=?,cost=?,cost_unknown=? WHERE id=?',job.calls,job.tokens_in,job.tokens_out,job.cost,job.cost_unknown?1:0,job.id)]);
        if(status==='ok')return{text,value,provider:cand.provider,model:cand.model};
        lastKind=status;
        if(['rate_limit','auth','bad_request'].includes(status))break; // the next provider, no retry here
      }
    }
    throw new Halt('all_failed:'+task+':'+lastKind);
  }

  /* ---------- one step ---------- */
  const lastIdx=job=>job.config.chapters-1;
  async function doStep(c,job){
    const lim=job.config.limits;
    if(job.status==='draft'){
      const r=await callRole(c,job,'plan',{system:PR.SYS_EDITOR(job.config.lang),prompt:PR.planPrompt(job),max:3500,temperature:.8,json:true,parse:t=>parsePlan(t,{chapters:job.config.chapters})});
      const plan=r.value;if(job.config.title)plan.title=job.config.title;if(!plan.title)plan.title='Без названия';
      job.plan=plan;job.title=plan.title;job.status='plan_ready';job.pause_reason='';
      await batch(c,[saveJob(c,job),stmt(c,'UPDATE ai_jobs SET title=? WHERE id=?',job.title,job.id)]);return;
    }
    const st=job.state,n=job.config.chapters;
    const chapters=await chaptersOf(c,job.id);
    if(st.phase==='final'||st.phase==='final2'||st.phase==='annotation')return finalSteps(c,job,chapters);
    const i=st.chapter,ch=chapters[i],text=ch.text;
    const prevText=i>0?chapters[i-1].text:'';
    const issuesNow=()=>st.issues||[];
    const nextAfterFailure=()=>{ // out of fix rounds: expert once, then the administrator
      if(!st.expert&&job.config.roles.expert){st.phase='expert';return}
      job.status='needs_admin';st.phase='needs_admin';
    };
    switch(st.phase){
      case 'draft':{
        const r=await callRole(c,job,'chapter_draft',{chapter:i,system:PR.SYS_WRITER(job.config.lang),prompt:PR.draftPrompt(job,i,chapters),max:Math.min(8000,Math.round(job.config.words*3.2)+400),temperature:.9});
        const t=cleanText(r.text);st.phase='check';st.fix=0;st.expert=0;st.issues=[];
        await batch(c,[addVersion(c,job,i,'draft',t,r),stmt(c,"UPDATE ai_chapters SET text=?,status='draft',updated=? WHERE job_id=? AND idx=?",t,Date.now(),job.id,i),saveJob(c,job)]);return;
      }
      case 'check':{
        const issues=checkChapter(text,{lang:job.config.lang,targetWords:job.config.words,prevText,characters:job.plan.characters});
        const major=issues.filter(x=>x.severity==='major');
        st.issues=issues;
        if(major.length){if(st.fix<lim.fixRounds)st.phase='fix';else nextAfterFailure()}else st.phase='review';
        await batch(c,[addCheck(c,job,i,'program',!major.length,issues),saveJob(c,job)]);return;
      }
      case 'review':{
        const r=await callRole(c,job,'chapter_review',{chapter:i,system:PR.SYS_EDITOR(job.config.lang),prompt:PR.reviewPrompt(job,i,chapters,text),max:2000,temperature:.2,json:true,parse:parseReview});
        const rev=r.value;st.issues=rev.issues;
        if(rev.ok)st.phase='analyze';else if(st.fix<lim.fixRounds)st.phase='fix';else nextAfterFailure();
        await batch(c,[addCheck(c,job,i,'editor',rev.ok,rev.issues,r),saveJob(c,job)]);return;
      }
      case 'fix':{
        const notes=issuesNow().filter(x=>x.severity==='major').concat(issuesNow().filter(x=>x.severity==='minor')).slice(0,8);
        const r=await callRole(c,job,'chapter_fix',{chapter:i,system:PR.SYS_WRITER(job.config.lang),prompt:PR.fixPrompt(job,i,chapters,text,notes),max:Math.min(8000,Math.round(job.config.words*3.2)+400),temperature:.6});
        const t=cleanText(r.text);st.fix++;st.phase='check';
        await batch(c,[addVersion(c,job,i,'revision',t,r,`круг ${st.fix}`),stmt(c,'UPDATE ai_chapters SET text=?,updated=? WHERE job_id=? AND idx=?',t,Date.now(),job.id,i),saveJob(c,job)]);return;
      }
      case 'expert':{
        const notes=issuesNow().slice(0,8);
        const r=await callRole(c,job,'chapter_expert',{chapter:i,system:PR.SYS_EXPERT(job.config.lang),prompt:PR.expertPrompt(job,i,chapters,text,notes),max:Math.min(8000,Math.round(job.config.words*3.2)+400),temperature:.5});
        const t=cleanText(r.text);st.expert=1;st.fix=lim.fixRounds;st.phase='check'; // after the expert only one more check/review, then the administrator
        await batch(c,[addVersion(c,job,i,'expert',t,r,'экспертная правка'),stmt(c,'UPDATE ai_chapters SET text=?,updated=? WHERE job_id=? AND idx=?',t,Date.now(),job.id,i),saveJob(c,job)]);return;
      }
      case 'analyze':{
        const r=await callRole(c,job,'analyze',{chapter:i,system:PR.SYS_EDITOR(job.config.lang),prompt:PR.analyzePrompt(job,i,text),max:1200,temperature:.2,json:true,parse:parseAnalysis});
        const a=r.value,p=job.plan;
        p.facts=[...(p.facts||[]),...a.facts].filter((x,k,arr)=>arr.indexOf(x)===k).slice(-40);
        p.characterState={...(p.characterState||{})};for(const x of a.characters)p.characterState[x.name]=x.state;
        const lastCh=i>=lastIdx(job);
        if(lastCh){st.phase='final';st.issues=[]}else{st.chapter=i+1;st.phase='draft';st.fix=0;st.expert=0;st.issues=[]}
        await batch(c,[stmt(c,"UPDATE ai_chapters SET status='approved',summary=?,facts=?,updated=? WHERE job_id=? AND idx=?",a.summary,J(a.facts),Date.now(),job.id,i),saveJob(c,job)]);return;
      }
      default:throw new Halt('bad_state:'+st.phase);
    }
    void n;
  }
  async function finalSteps(c,job,chapters){
    const st=job.state;
    const full=chapters.map((x,i)=>({title:job.plan.chapters[i].title,text:x.text,summary:x.summary||job.plan.chapters[i].summary,words:words(x.text)}));
    if(st.phase==='final'){
      const prog=checkBook(full,{count:job.config.chapters,lang:job.config.lang});
      const r=await callRole(c,job,'final_review',{system:PR.SYS_EDITOR(job.config.lang),prompt:PR.finalPrompt(job,full,prog),max:2500,temperature:.2,json:true,parse:parseReview});
      const issues=[...prog,...r.value.issues];st.final={ok:!issues.some(x=>x.severity==='major'),issues};
      st.phase=job.config.roles.expert&&!job.config.noSecondOpinion?'final2':'annotation';
      await batch(c,[addCheck(c,job,-1,'final',st.final.ok,issues,r),saveJob(c,job)]);return;
    }
    if(st.phase==='final2'){
      const r=await callRole(c,job,'final_second',{system:PR.SYS_EXPERT(job.config.lang).replace('Оцениваешь текст','Оцениваешь книгу')+' Отвечаешь только валидным JSON.',prompt:PR.finalPrompt(job,full,[]).replace('[task:final_review]','[task:final_second]'),max:2500,temperature:.2,json:true,parse:parseReview});
      st.finalSecond={ok:r.value.ok,issues:r.value.issues};
      if(!r.value.ok)st.final={ok:false,issues:[...(st.final?.issues||[]),...r.value.issues.map(x=>({...x,source:'expert'}))]};
      st.phase='annotation';
      await batch(c,[addCheck(c,job,-1,'final_expert',r.value.ok,r.value.issues,r),saveJob(c,job)]);return;
    }
    // annotation, then wait for the administrator
    const r=await callRole(c,job,'annotation',{system:PR.SYS_WRITER(job.config.lang),prompt:PR.annotationPrompt(job),max:500,temperature:.7});
    job.plan.annotation=cleanText(r.text).slice(0,1500);job.status='awaiting_publish';st.phase='done';
    await batch(c,[saveJob(c,job)]);
  }

  /** Runs one step under a lock; every outcome leaves the job in a resumable state. */
  async function step(c,id){
    const job=await loadJob(c,id);if(!job)return{s:404,j:{error:'not_found'}};
    const wait={plan_ready:'plan_ready',needs_admin:'needs_admin',paused:'paused',awaiting_publish:'awaiting_publish',published:'published',cancelled:'cancelled'}[job.status];
    if(wait)return{s:200,j:{job:view(job),waiting:wait}};
    const now=Date.now();
    const lk=await run(c,'UPDATE ai_jobs SET lock_until=? WHERE id=? AND lock_until<?',now+LOCK_MS,id,now);
    if(!lk.meta.changes)return{s:409,j:{error:'busy'}};
    try{
      const busy=(await get(c,'SELECT COUNT(*) n FROM ai_jobs WHERE lock_until>? AND id<>?',now,id)).n;
      if(busy>=job.config.limits.maxJobs)return{s:429,j:{error:'too_many_jobs'}};
      try{await doStep(c,job)}
      catch(e){
        if(!(e instanceof Halt))throw e;
        job.status='paused';job.pause_reason=e.reason;await run(c,'UPDATE ai_jobs SET status=?,pause_reason=?,updated=? WHERE id=?','paused',e.reason,Date.now(),id);
      }
      return{s:200,j:{job:view(await loadJob(c,id))}};
    }finally{await run(c,'UPDATE ai_jobs SET lock_until=0 WHERE id=?',id)}
  }

  /* ---------- routes ---------- */
  const A=(method,path,fn)=>route(method,path,fn,true);
  /* defaults the server is configured with (model ids only; nothing is assumed when a variable is missing) */
  A('GET','/api/admin/ai/jobs-config',async c=>{const r=rolesFromEnv(c.env),l=limitsFrom(c.env,{});return json({roles:Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v?{model:v.primary.model,fallbacks:v.fallbacks.map(x=>x.provider+':'+x.model)}:null])),limits:l})});
  A('POST','/api/admin/ai/jobs/:id/step',async(c,id)=>{const r=await step(c,id);return json(r.j,r.s)});

  A('POST','/api/admin/ai/jobs',async c=>{
    const b=c.body,idea=String(b.idea||'').trim().slice(0,1500);if(idea.length<10)return bad(400,'idea');
    const lang=b.lang==='uz'?'uz':'ru',genre=['novel','detective','historical','adventure','drama','stories','modern','prose'].includes(b.genre)?b.genre:'novel';
    const chapters=Math.max(2,Math.min(12,Math.round(+b.chapters)||6)),wordsN=Math.max(300,Math.min(2000,Math.round(+b.words)||900));
    if((await get(c,`SELECT COUNT(*) n FROM ai_jobs WHERE status IN (${ACTIVE.map(()=>'?').join(',')})`,...ACTIVE)).n>=MAX_ACTIVE)return bad(429,'too_many_active');
    const m=mergeRoles(rolesFromEnv(c.env),b.roles||{});if(m.error)return json({error:m.error==='roles_required'?'roles_required':'model',detail:m.error},422);
    const roles=m.roles,limits=limitsFrom(c.env,b.limits||{}),prices={...pricesFromEnv(c.env)};
    /* models are never assumed: each one must be in the provider's own list, and each provider needs a key */
    const used=[...new Set(Object.values(roles).filter(Boolean).flatMap(r=>[r.primary,...r.fallbacks]).map(x=>x.provider))],available={};
    for(const p of used){
      const {key}=await aiKey(c,p);
      if(!key){if(Object.values(roles).some(r=>r&&r.primary.provider===p&&(r===roles.draft||r===roles.editor)))return json({error:'no_key',detail:p},409);
        // an optional role or fallback without a key is dropped
        for(const role of Object.keys(roles)){const r=roles[role];if(!r)continue;if(r.primary.provider===p)roles[role]=null;else r.fallbacks=r.fallbacks.filter(x=>x.provider!==p)}continue}
      try{const list=await listModels(c.env,key,p);available[p]=list.map(x=>x.id);for(const x of list)if(x.price&&!prices[p+':'+x.id])prices[p+':'+x.id]=x.price}
      catch(e){return json({error:'models_unverified',detail:`${p}: ${e.kind||'error'}`},502)}
    }
    const bad_=unknownModels(roles,available);if(bad_.length)return json({error:'unknown_model',models:bad_},422);
    if(limits.maxCostUsd!=null){const miss=Object.values(roles).filter(Boolean).flatMap(r=>[r.primary,...r.fallbacks]).filter(x=>!priceOf(prices,x.provider,x.model));if(miss.length)return json({error:'price_unknown',models:miss},422)}
    const used2=Object.values(roles).filter(Boolean).flatMap(r=>[r.primary,...r.fallbacks]);
    const cfg={idea,title:String(b.title||'').trim().slice(0,100),lang,genre,chapters,words:wordsN,roles,limits,prices:Object.fromEntries(used2.map(x=>[x.provider+':'+x.model,priceOf(prices,x.provider,x.model)]).filter(([,v])=>v)),noSecondOpinion:!!b.noSecondOpinion};
    const id='j'+id8(),now=Date.now();
    await run(c,"INSERT INTO ai_jobs(id,created,updated,created_by,status,title,config,state) VALUES(?,?,?,?,?,?,?,?)",id,now,now,c.user.id,'draft',cfg.title||'Новая книга',J(cfg),J({phase:'plan'}));
    await audit(c,'ai_job_create',id,{lang,genre,chapters,roles:Object.fromEntries(Object.entries(roles).map(([k,r])=>[k,r&&r.primary.model]))});
    return json({job:view(await loadJob(c,id))});
  });
  A('GET','/api/admin/ai/jobs',async c=>json({jobs:(await all(c,'SELECT id,title,status,pause_reason,created,updated,calls,tokens_in,tokens_out,cost,cost_unknown,config FROM ai_jobs ORDER BY created DESC LIMIT 30')).map(r=>({id:r.id,title:r.title,status:r.status,pauseReason:r.pause_reason,created:r.created,updated:r.updated,calls:r.calls,tokens:r.tokens_in+r.tokens_out,cost:r.cost,costUnknown:!!r.cost_unknown,chapters:P(r.config).chapters}))}));
  A('GET','/api/admin/ai/jobs/:id',async(c,id)=>{
    const job=await loadJob(c,id);if(!job)return bad(404);
    const chs=await chaptersOf(c,id),checks=await all(c,'SELECT id,chapter,kind,ok,issues,provider,model,created FROM ai_checks WHERE job_id=? ORDER BY id DESC LIMIT 40',id),calls=await all(c,'SELECT id,chapter,task,provider,model,via,latency,tokens_in,tokens_out,estimated,cost,status,error,created FROM ai_calls WHERE job_id=? ORDER BY id DESC LIMIT 60',id);
    return json({job:view(job),plan:job.plan,chapters:chs.map(x=>({idx:x.idx,status:x.status,words:words(x.text),summary:x.summary})),checks:checks.map(x=>({...x,ok:!!x.ok,issues:P(x.issues||'[]')})),calls:calls.map(x=>({...x,estimated:!!x.estimated}))});
  });
  A('GET','/api/admin/ai/jobs/:id/chapters/:i',async(c,id,i)=>{
    const ch=await get(c,'SELECT idx,status,text,summary FROM ai_chapters WHERE job_id=? AND idx=?',id,+i);if(!ch)return bad(404);
    return json({chapter:ch,versions:await all(c,'SELECT id,kind,provider,model,note,created,LENGTH(text) len FROM ai_versions WHERE job_id=? AND chapter=? ORDER BY id',id,+i)});
  });
  A('GET','/api/admin/ai/jobs/:id/versions/:v',async(c,id,v)=>{const r=await get(c,'SELECT id,chapter,kind,text,provider,model,note,created FROM ai_versions WHERE job_id=? AND id=?',id,+v);return r?json({version:r}):bad(404)});

  A('PUT','/api/admin/ai/jobs/:id/plan',async(c,id)=>{
    const job=await loadJob(c,id);if(!job)return bad(404);if(job.status!=='plan_ready')return bad(409,'not_plan_ready');
    let np;try{np=parsePlan(J(c.body),{chapters:job.config.chapters})}catch{return bad(422,'plan')}
    if(!np.title)np.title=job.plan.title;job.plan={...job.plan,...np};job.title=job.plan.title;
    await batch(c,[saveJob(c,job),stmt(c,'UPDATE ai_jobs SET title=? WHERE id=?',job.title,id)]);return json({job:view(job),plan:job.plan});
  });
  A('POST','/api/admin/ai/jobs/:id/approve-plan',async(c,id)=>{
    const job=await loadJob(c,id);if(!job)return bad(404);if(job.status!=='plan_ready')return bad(409,'not_plan_ready');
    if(c.body.confirm!==true)return bad(400,'confirm');
    const now=Date.now();job.status='running';job.pause_reason='';job.state={phase:'draft',chapter:0,fix:0,expert:0,issues:[]};
    await batch(c,[...job.plan.chapters.map((_,k)=>stmt(c,"INSERT OR IGNORE INTO ai_chapters(job_id,idx,status,text,updated) VALUES(?,?,'pending','',?)",id,k,now)),saveJob(c,job)]);
    await audit(c,'ai_job_plan_approved',id,{chapters:job.plan.chapters.length});return json({job:view(job)});
  });
  A('POST','/api/admin/ai/jobs/:id/pause',async(c,id)=>{const job=await loadJob(c,id);if(!job)return bad(404);if(job.status!=='running'&&job.status!=='draft')return bad(409,'not_running');job.status='paused';job.pause_reason='manual';await run(c,'UPDATE ai_jobs SET status=?,pause_reason=?,updated=? WHERE id=?','paused','manual',Date.now(),id);return json({job:view(job)})});
  /* resuming after a pause; the administrator may raise the limits (never above the server caps) */
  A('POST','/api/admin/ai/jobs/:id/resume',async(c,id)=>{
    const job=await loadJob(c,id);if(!job)return bad(404);if(job.status!=='paused')return bad(409,'not_paused');
    if(c.body.limits){job.config.limits=limitsFrom(c.env,{...job.config.limits,...c.body.limits});await run(c,'UPDATE ai_jobs SET config=? WHERE id=?',J(job.config),id)}
    job.status=job.plan&&job.state.chapter!==undefined&&job.state.phase&&job.state.phase!=='plan'?'running':'draft';job.pause_reason='';
    await run(c,'UPDATE ai_jobs SET status=?,pause_reason=?,updated=? WHERE id=?',job.status,'',Date.now(),id);return json({job:view(job)});
  });
  A('POST','/api/admin/ai/jobs/:id/cancel',async(c,id)=>{const job=await loadJob(c,id);if(!job)return bad(404);if(['published','cancelled'].includes(job.status))return bad(409,'finished');await run(c,"UPDATE ai_jobs SET status='cancelled',updated=? WHERE id=?",Date.now(),id);await audit(c,'ai_job_cancel',id,{});return json({ok:true})});

  /* the administrator decides about a chapter the models could not bring to quality */
  A('POST','/api/admin/ai/jobs/:id/chapters/:i/resolve',async(c,id,i)=>{
    const job=await loadJob(c,id);if(!job)return bad(404);if(job.status!=='needs_admin')return bad(409,'not_needs_admin');
    const idx=+i;if(idx!==job.state.chapter)return bad(409,'not_current');
    const act=String(c.body.action||'');const ch=await get(c,'SELECT text FROM ai_chapters WHERE job_id=? AND idx=?',id,idx);
    const ops=[];
    if(act==='accept'){job.state.phase='analyze';ops.push(addVersion(c,job,idx,'admin-accepted',ch.text,null,'принята без исправлений'))}
    else if(act==='edit'){const t=cleanText(c.body.text);if(words(t)<40)return bad(422,'text');job.state={...job.state,phase:'check',fix:0,expert:1,issues:[]};ops.push(addVersion(c,job,idx,'admin',t,null,'правка администратора'),stmt(c,'UPDATE ai_chapters SET text=?,updated=? WHERE job_id=? AND idx=?',t,Date.now(),id,idx))}
    else if(act==='retry'){job.state={...job.state,phase:'draft',fix:0,expert:0,issues:[]}}
    else return bad(400,'action');
    job.status='running';await batch(c,[...ops,saveJob(c,job)]);await audit(c,'ai_chapter_resolve',id,{chapter:idx,action:act});return json({job:view(job)});
  });
  /* manual edit of a finished chapter before publication; the final check is marked stale */
  A('PUT','/api/admin/ai/jobs/:id/chapters/:i/text',async(c,id,i)=>{
    const job=await loadJob(c,id);if(!job)return bad(404);if(job.status!=='awaiting_publish')return bad(409,'not_awaiting_publish');
    const idx=+i,t=cleanText(c.body.text);if(words(t)<40)return bad(422,'text');if(!(await get(c,'SELECT 1 x FROM ai_chapters WHERE job_id=? AND idx=?',id,idx)))return bad(404);
    if((await get(c,'SELECT COUNT(*) n FROM ai_versions WHERE job_id=?',id)).n>=MAX_VERSIONS)return bad(429,'too_many_versions');
    job.state.final={...(job.state.final||{}),stale:true};
    await batch(c,[addVersion(c,job,idx,'admin',t,null,'правка перед публикацией'),stmt(c,'UPDATE ai_chapters SET text=?,updated=? WHERE job_id=? AND idx=?',t,Date.now(),id,idx),saveJob(c,job)]);return json({ok:true});
  });

  /* publication: only an explicit administrator confirmation, only after every step has finished */
  A('POST','/api/admin/ai/jobs/:id/publish',async(c,id)=>{
    const job=await loadJob(c,id);if(!job)return bad(404);
    if(job.status==='published')return bad(409,'already_published');if(job.status!=='awaiting_publish')return bad(409,'not_ready');
    if(c.body.confirm!==true)return bad(400,'confirm');
    const fin=job.state.final;if(fin&&!fin.ok&&c.body.override!==true)return json({error:'final_issues',issues:fin.issues},409);
    const chs=await chaptersOf(c,id);if(chs.length!==job.config.chapters||chs.some(x=>x.status!=='approved'))return bad(409,'chapters_not_approved');
    const title=String(c.body.title||job.plan.title).trim(),author=String(c.body.author||'').trim()||'Muloqot Books';
    const text=chs.map((x,k)=>`# ${job.plan.chapters[k].title}\n\n${x.text.trim()}`).join('\n\n');
    const r=job.config.roles,provs=[...new Set(Object.values(r).filter(Boolean).map(x=>x.primary.provider))].join('+');
    const res=await importOne(c,{title,author,lang:job.config.lang,genre:job.config.genre,description:String(c.body.description||job.plan.annotation||job.plan.synopsis).trim(),text,cover:typeof c.body.cover==='string'?c.body.cover:'',
      rights:{status:'author',note:`Оригинальный текст, созданный с помощью ИИ-оркестратора (задание ${id}) по заказу администратора Muloqot Books; опубликован после ручной проверки`},source:{name:'Muloqot Books (ИИ)'},ai:{provider:provs,model:Object.values(r).filter(Boolean).map(x=>x.primary.model).join(' / ').slice(0,80)}});
    if(res.error)return json({error:res.error,id:res.id},res.error==='duplicate'?409:422);
    await batch(c,[stmt(c,"UPDATE ai_jobs SET status='published',book_id=?,updated=? WHERE id=?",res.id,Date.now(),id)]);
    await audit(c,'ai_job_publish',id,{book:res.id,override:!!fin&&!fin.ok});return json({ok:true,bookId:res.id,job:view(await loadJob(c,id))});
  });
  void ROLE_PROVIDER;
}
