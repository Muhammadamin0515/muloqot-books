/* One interface to the AI services (Groq, Google Gemini, OpenRouter): request building, answer parsing, usage, error classes and the
   live model list. Keys never leave the server. The orchestrator (orch.js) and the quick generator both call callModel(). */
export const PROVIDERS={
  groq:{name:'Groq',env:'GROQ_API_KEY',url:'https://api.groq.com/openai/v1/chat/completions',models:'https://api.groq.com/openai/v1/models'},
  gemini:{name:'Google Gemini',env:'GEMINI_API_KEY',url:m=>`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`,models:'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200'},
  openrouter:{name:'OpenRouter',env:'OPENROUTER_API_KEY',url:'https://openrouter.ai/api/v1/chat/completions',models:'https://openrouter.ai/api/v1/models'}
};
export const MODEL_RE=/^[\w./:@-]{2,80}$/;

/** A classified failure: no_key | auth | rate_limit | timeout | empty | provider | bad_request */
export class AiError extends Error{constructor(kind,message,status){super(message||kind);this.kind=kind;this.status=status||0}}

/** The HTTP request for a provider. `base` replaces the host (tests only; every such call is logged as `override`). */
export function buildRequest(provider,model,key,{system,prompt,max=3000,temperature=.9,json=false},base=''){
  const p=PROVIDERS[provider];
  if(provider==='gemini'){
    const url=base?`${base}/gemini/${encodeURIComponent(model)}:generateContent`:p.url(model);
    return{url,init:{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({
      systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:max,temperature,...(json?{responseMimeType:'application/json'}:{})}})}};
  }
  const url=base?`${base}/${provider}/chat/completions`:p.url;
  const headers={'content-type':'application/json',authorization:'Bearer '+key,...(provider==='openrouter'?{'x-title':'Muloqot Books'}:{})};
  /* gpt-oss models think before they answer and the thinking is paid from max_tokens: keep it short so the text is not cut off */
  const reasoning=provider==='groq'&&/^openai\/gpt-oss/.test(model)?{reasoning_effort:'low'}:{};
  return{url,init:{method:'POST',headers,body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:prompt}],max_tokens:max,temperature,...reasoning})}};
}
/** The generated text of a provider answer, or '' when there is none. */
export function parseText(provider,j){
  if(provider==='gemini')return((j?.candidates?.[0]?.content?.parts)||[]).map(x=>x.text||'').join('').trim();
  return String(j?.choices?.[0]?.message?.content||'').trim();
}
/** Token usage as reported by the provider. */
export function parseUsage(provider,j){
  if(provider==='gemini'){const u=j?.usageMetadata;return u&&Number.isFinite(u.promptTokenCount)?{in:u.promptTokenCount||0,out:u.candidatesTokenCount||0}:null}
  const u=j?.usage;return u&&Number.isFinite(u.prompt_tokens)?{in:u.prompt_tokens||0,out:u.completion_tokens||0}:null;
}
/** Classifies an HTTP failure. */
export function classify(status,body){
  const msg=String(body?.error?.message||body?.error||'').slice(0,200);
  if(status===401||status===403)return new AiError('auth',msg||'key rejected',status);
  if(status===429)return new AiError('rate_limit',msg||'rate limit',status);
  if(status===408||status===504)return new AiError('timeout',msg,status);
  if(status>=500)return new AiError('provider',msg,status);
  return new AiError('bad_request',msg,status);
}
const estimate=s=>Math.ceil(String(s||'').length/3);

/** One model call. Throws AiError; on success returns {text,usage:{in,out,estimated},latency,via}. */
export async function callModel(env,key,{provider,model,system,prompt,max,temperature,json,timeoutMs=70000}){
  const base=String(env.AI_BASE||''),req=buildRequest(provider,model,key,{system,prompt,max,temperature,json},base);
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeoutMs),t0=Date.now();
  let r,j;
  try{r=await fetch(req.url,{...req.init,signal:ctl.signal});j=await r.json().catch(()=>null)}
  catch(e){throw new AiError(e&&e.name==='AbortError'?'timeout':'provider',e&&e.name==='AbortError'?'no answer in time':'network error')}
  finally{clearTimeout(timer)}
  const latency=Date.now()-t0;
  if(!r.ok){const e=classify(r.status,j);e.latency=latency;throw e}
  const text=parseText(provider,j);
  if(!text){const e=new AiError('empty','empty answer');e.latency=latency;throw e}
  const u=parseUsage(provider,j);
  /* routers such as openrouter/free pick the model per request: report the model that really answered */
  const served=typeof j?.model==='string'&&j.model&&j.model!==model?j.model:'';
  return{text,served,usage:u?{...u,estimated:false}:{in:estimate(system+prompt),out:estimate(text),estimated:true},latency,via:base?'override':'api'};
}

/** The models an account can really use, asked from the provider itself: [{id,price?:[inPerM,outPerM]}]. */
export async function listModels(env,key,provider){
  const base=String(env.AI_BASE||''),p=PROVIDERS[provider];
  const url=base?`${base}/${provider}/models`:p.models;
  const r=await fetch(url,{headers:provider==='gemini'?{'x-goog-api-key':key}:{authorization:'Bearer '+key}}),j=await r.json().catch(()=>null);
  if(!r.ok)throw classify(r.status,j);
  if(provider==='gemini')return(j?.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent')).map(m=>({id:String(m.name||'').replace(/^models\//,'')})).filter(m=>m.id);
  return(j?.data||[]).map(m=>{
    const pr=m.pricing,price=pr&&pr.prompt!=null&&pr.completion!=null&&Number.isFinite(+pr.prompt)&&Number.isFinite(+pr.completion)&&+pr.prompt>=0&&+pr.completion>=0?[+pr.prompt*1e6,+pr.completion*1e6]:undefined;
    return{id:m.id,...(price?{price}:{})};
  }).filter(m=>m.id);
}

export function registerAi(d){
  const {route,get,run,json,bad,P,J,audit}=d;
  const keyOf=async(c,p)=>{const e=String(c.env[PROVIDERS[p].env]||'').trim();if(e)return{key:e,source:'env'};const r=await get(c,'SELECT value FROM meta WHERE key=?','aikey:'+p);const k=r?String(P(r.value)||''):'';return k?{key:k,source:'db'}:{key:'',source:''}};
  d.aiKey=keyOf;

  /* which providers are ready (never the keys themselves) */
  route('GET','/api/admin/ai/config',async c=>{
    const out={};for(const p of Object.keys(PROVIDERS)){const k=await keyOf(c,p);out[p]={name:PROVIDERS[p].name,set:!!k.key,source:k.source,env:PROVIDERS[p].env}}
    return json({providers:out,canSetKeys:!!c.user.superadmin});
  },true);
  route('POST','/api/admin/ai/key',async c=>{
    if(!c.user.superadmin)return bad(403,'superadmin');
    const p=String(c.body.provider||''),key=String(c.body.key||'').trim();if(!PROVIDERS[p])return bad(400,'provider');
    if(key&&!/^[\w.:-]{16,300}$/.test(key))return bad(422,'key');
    if(key)await run(c,"INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",'aikey:'+p,J(key));
    else await run(c,'DELETE FROM meta WHERE key=?','aikey:'+p);
    await audit(c,'ai_key',p,{set:!!key});return json({ok:true});
  },true);
  /* the live model list of one provider */
  route('GET','/api/admin/ai/models',async c=>{
    const p=new URL(c.request.url).searchParams.get('provider')||'';if(!PROVIDERS[p])return bad(400,'provider');
    const {key}=await keyOf(c,p);if(!key)return bad(409,'no_key');
    try{return json({provider:p,models:await listModels(c.env,key,p)})}
    catch(e){return json({error:e.kind||'provider',detail:String(e.message).slice(0,200)},e.kind==='rate_limit'?429:502)}
  },true);
  route('POST','/api/admin/ai/generate',async c=>{
    const b=c.body,provider=String(b.provider||''),p=PROVIDERS[provider];if(!p)return bad(400,'provider');
    const model=String(b.model||'').trim();if(!MODEL_RE.test(model))return bad(400,'model');
    const system=String(b.system||'').slice(0,4000),prompt=String(b.prompt||'').slice(0,20000);if(prompt.length<2)return bad(400,'prompt');
    const {key}=await keyOf(c,provider);if(!key)return bad(409,'no_key');
    try{
      const r=await callModel(c.env,key,{provider,model,system,prompt,max:Math.max(200,Math.min(8000,+b.max||3000)),temperature:Math.max(0,Math.min(1.5,+b.temperature||.9))});
      return json({text:r.text});
    }catch(e){
      const status=e.kind==='rate_limit'?429:e.kind==='timeout'?504:502;
      return json({error:e.kind==='provider'||e.kind==='bad_request'?'provider_error':e.kind,detail:String(e.message).slice(0,200),status:e.status},status);
    }
  },true);
}
