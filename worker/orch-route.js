/* Routing of orchestrator tasks to model roles, provider fallbacks, prices and budget limits. Pure functions. */
import {PROVIDERS,MODEL_RE} from './ai.js';

/** Which role does a task. Groq drafts and fixes, Gemini plans and edits, OpenRouter's chosen model is the expert. */
export const TASK_ROLE={plan:'editor',chapter_draft:'draft',chapter_review:'editor',chapter_fix:'draft',chapter_expert:'expert',analyze:'editor',final_review:'editor',final_second:'expert',annotation:'draft'};
export const ROLE_PROVIDER={draft:'groq',editor:'gemini',expert:'openrouter'};

export const parseSpec=s=>{const m=/^([a-z]+):(.+)$/.exec(String(s||'').trim());return m&&PROVIDERS[m[1]]&&MODEL_RE.test(m[2])?{provider:m[1],model:m[2]}:null};
const specs=s=>String(s||'').split(',').map(parseSpec).filter(Boolean);

/** Role configuration from server variables: AI_DRAFT_MODEL, AI_EDITOR_MODEL, AI_EXPERT_MODEL (model ids) and AI_*_FALLBACK ("provider:model,…"). No model is assumed. */
export function rolesFromEnv(env){
  const roles={};
  for(const [role,v] of [['draft','AI_DRAFT_MODEL'],['editor','AI_EDITOR_MODEL'],['expert','AI_EXPERT_MODEL']]){
    const id=String(env[v]||'').trim();
    roles[role]=id&&MODEL_RE.test(id)?{primary:{provider:ROLE_PROVIDER[role],model:id},fallbacks:specs(env['AI_'+role.toUpperCase()+'_FALLBACK'])}:null;
  }
  return roles;
}
/** The admin may change model ids and fallbacks per job; the primary provider of each role stays fixed. Returns {roles} or {error}. */
export function mergeRoles(base,over={}){
  const roles={};
  for(const role of Object.keys(ROLE_PROVIDER)){
    const o=over[role],b=base[role];
    if(o===null){roles[role]=null;continue}
    const model=String(o?.model||'').trim()||b?.primary?.model||'';
    if(!model){roles[role]=null;continue}
    if(!MODEL_RE.test(model))return{error:'model:'+role};
    const fb=o&&Array.isArray(o.fallbacks)?o.fallbacks.map(x=>parseSpec(typeof x==='string'?x:`${x?.provider}:${x?.model}`)).filter(Boolean):(b?.fallbacks||[]);
    roles[role]={primary:{provider:ROLE_PROVIDER[role],model},fallbacks:fb.slice(0,3)};
  }
  if(!roles.draft||!roles.editor)return{error:'roles_required'};
  return{roles};
}
/** The ordered providers to try for a task: the role's primary, then its fallbacks, only those with a key. */
export function candidatesFor(roles,task,hasKey=()=>true){
  const r=roles[TASK_ROLE[task]];if(!r)return[];
  const seen=new Set();return[r.primary,...r.fallbacks].filter(x=>{const k=x.provider+':'+x.model;if(seen.has(k)||!hasKey(x.provider))return false;seen.add(k);return true});
}

const num=(v,d,min,max)=>{const n=Number(v);return Number.isFinite(n)&&String(v??'')!==''?Math.max(min,Math.min(max,n)):d};
/** Limits from server variables, tightened (never loosened beyond the caps) by the admin per job. */
export function limitsFrom(env,over={}){
  const cap={maxCalls:num(env.AI_MAX_CALLS,80,5,300),maxTokens:num(env.AI_MAX_TOKENS,400000,5000,2000000),maxCostUsd:env.AI_MAX_COST_USD!=null&&String(env.AI_MAX_COST_USD)!==''?num(env.AI_MAX_COST_USD,null,0,1000):null,fixRounds:num(env.AI_FIX_ROUNDS,2,0,4),maxJobs:num(env.AI_MAX_JOBS,2,1,5)};
  const own=(k,min)=>over[k]==null||over[k]===''?cap[k]:Math.max(min,Math.min(cap[k]??Infinity,Number(over[k])));
  return{maxCalls:own('maxCalls',5),maxTokens:own('maxTokens',5000),maxCostUsd:cap.maxCostUsd==null?(over.maxCostUsd!=null&&over.maxCostUsd!==''?Math.max(0,Number(over.maxCostUsd)):null):own('maxCostUsd',0),fixRounds:own('fixRounds',0),maxJobs:cap.maxJobs};
}
/** Price per million tokens [in,out] from AI_PRICES ({"provider:model":[in,out]}) or the list the provider gave. */
export function priceOf(prices,provider,model){const p=prices&&prices[provider+':'+model];return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)?p:null}
export const costOf=(usage,price)=>price?Math.round(((usage.in*price[0]+usage.out*price[1])/1e6)*1e6)/1e6:null;
export function pricesFromEnv(env){try{const j=JSON.parse(String(env.AI_PRICES||'{}'));return j&&typeof j==='object'?j:{}}catch{return{}}}

/** Which limit is exhausted (null when the next call may be made). */
export function budgetCheck(job,limits){
  if(job.calls>=limits.maxCalls)return'calls';
  if(job.tokens_in+job.tokens_out>=limits.maxTokens)return'tokens';
  if(limits.maxCostUsd!=null&&job.cost>=limits.maxCostUsd)return'cost';
  return null;
}
/** Models that are not in the provider's own list: [{provider,model}]. `available` is {provider:[ids]}. */
export function unknownModels(roles,available){
  const out=[];
  for(const r of Object.values(roles)){if(!r)continue;for(const x of [r.primary,...r.fallbacks]){const list=available[x.provider];if(list&&!list.includes(x.model))out.push(x)}}
  return out;
}

const BAD_MODEL=/(whisper|guard|tts|embed|image|vision-only|moderation|safeguard|audio|live|preview|exp\b|-exp-|thinking-exp)/i;
/** Picks one model per role from the providers' own lists when nothing is configured. lists: {groq:[id],gemini:[id],openrouter:[id]}.
    Only real list entries are returned; a role with no suitable entry is null. */
export function pickModels(lists){
  const has=(p,id)=>(lists[p]||[]).includes(id),all=p=>(lists[p]||[]).filter(id=>!BAD_MODEL.test(id));
  const first=(p,prefs)=>prefs.find(id=>has(p,id))||null;
  let draft=first('groq',['openai/gpt-oss-120b','llama-3.3-70b-versatile']);
  if(!draft)draft=all('groq').filter(id=>/(120b|70b|versatile)/i.test(id)).sort()[0]||null;
  /* Gemini: the newest flash model (a full flash before a lite one of the same version) */
  const gem=all('gemini').map(id=>{const m=/^gemini-(\d+(?:\.\d+)?)-flash(-lite)?$/.exec(id);return m?{id,v:parseFloat(m[1]),lite:!!m[2]}:null}).filter(Boolean).sort((a,b)=>b.v-a.v||a.lite-b.lite);
  const editor=gem[0]?gem[0].id:null;
  let expert=first('openrouter',['google/gemma-4-31b-it:free','meta-llama/llama-3.3-70b-instruct:free']);
  if(!expert)expert=all('openrouter').filter(id=>/:free$/.test(id)&&/(70b|120b|31b|gemma|llama)/i.test(id)).sort()[0]||null;
  return{draft,editor,expert};
}
