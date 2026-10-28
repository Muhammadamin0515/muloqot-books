/* AI text generation for the admin "ИИ-книга" tool. The Worker only relays one prompt to the chosen provider with a key that never
   leaves the server; the book itself is planned and written step by step by the admin panel. */
export const PROVIDERS={
  groq:{name:'Groq',env:'GROQ_API_KEY',model:'llama-3.3-70b-versatile',url:'https://api.groq.com/openai/v1/chat/completions'},
  gemini:{name:'Google Gemini',env:'GEMINI_API_KEY',model:'gemini-2.5-flash',url:m=>`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`},
  openrouter:{name:'OpenRouter',env:'OPENROUTER_API_KEY',model:'meta-llama/llama-3.3-70b-instruct:free',url:'https://openrouter.ai/api/v1/chat/completions'}
};
const MODEL_RE=/^[\w./:@-]{2,80}$/;

/** The HTTP request for a provider. `base` replaces the host (used by tests with a mock server). */
export function buildRequest(provider,model,key,{system,prompt,max=3000,temperature=.9},base=''){
  const p=PROVIDERS[provider];
  if(provider==='gemini'){
    const url=base?`${base}/gemini/${encodeURIComponent(model)}:generateContent`:p.url(model);
    return{url,init:{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({
      systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:max,temperature}})}};
  }
  const url=base?`${base}/${provider}/chat/completions`:p.url;
  const headers={'content-type':'application/json',authorization:'Bearer '+key,...(provider==='openrouter'?{'x-title':'Muloqot Books'}:{})};
  return{url,init:{method:'POST',headers,body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:prompt}],max_tokens:max,temperature})}};
}
/** The generated text of a provider answer, or '' when there is none. */
export function parseText(provider,j){
  if(provider==='gemini')return((j?.candidates?.[0]?.content?.parts)||[]).map(x=>x.text||'').join('').trim();
  return String(j?.choices?.[0]?.message?.content||'').trim();
}

export function registerAi(d){
  const {route,get,run,json,bad,P,J,audit}=d;
  const keyOf=async(c,p)=>{const e=String(c.env[PROVIDERS[p].env]||'').trim();if(e)return{key:e,source:'env'};const r=await get(c,'SELECT value FROM meta WHERE key=?','aikey:'+p);const k=r?String(P(r.value)||''):'';return k?{key:k,source:'db'}:{key:'',source:''}};

  /* which providers are ready (never the keys themselves) */
  route('GET','/api/admin/ai/config',async c=>{
    const out={};for(const p of Object.keys(PROVIDERS)){const k=await keyOf(c,p);out[p]={name:PROVIDERS[p].name,model:PROVIDERS[p].model,set:!!k.key,source:k.source,env:PROVIDERS[p].env}}
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
  route('POST','/api/admin/ai/generate',async c=>{
    const b=c.body,provider=String(b.provider||''),p=PROVIDERS[provider];if(!p)return bad(400,'provider');
    const model=String(b.model||p.model).trim();if(!MODEL_RE.test(model))return bad(400,'model');
    const system=String(b.system||'').slice(0,4000),prompt=String(b.prompt||'').slice(0,20000);if(prompt.length<2)return bad(400,'prompt');
    const {key}=await keyOf(c,provider);if(!key)return bad(409,'no_key');
    const req=buildRequest(provider,model,key,{system,prompt,max:Math.max(200,Math.min(8000,+b.max||3000)),temperature:Math.max(0,Math.min(1.5,+b.temperature||.9))},String(c.env.AI_BASE||''));
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),90000);
    let r,j;
    try{r=await fetch(req.url,{...req.init,signal:ctl.signal});j=await r.json().catch(()=>null)}
    catch(e){return bad(504,'timeout')}finally{clearTimeout(timer)}
    if(!r.ok){const msg=String(j?.error?.message||j?.error||'').slice(0,200);return json({error:r.status===429?'rate_limit':'provider_error',detail:msg,status:r.status},r.status===429?429:502)}
    const text=parseText(provider,j);if(!text)return bad(502,'empty');
    return json({text});
  },true);
}
