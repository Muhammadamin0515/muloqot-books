/* Scripted stand-in for Groq, Gemini and OpenRouter (tests only; the orchestrator journals its calls as via='override'). */
import http from 'node:http';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function startMock(MOCK){
const rec=[];let ctl={};const seen={};
const sent=(seed,n=26)=>Array.from({length:n},(_,i)=>`Предложение ${seed}-${i+1}: Алишер медленно шёл по узкой улице старой Бухары и думал о письме номер ${seed*100+i}.`);
const chapterText=seed=>{const s=sent(seed);return Array.from({length:4},(_,k)=>s.slice(k*6,k*6+6).join(' ')).join('\n\n')};
const reply=(res,provider,text,extra={})=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(provider==='gemini'?{candidates:[{content:{parts:[{text}]}}],usageMetadata:{promptTokenCount:120,candidatesTokenCount:80}}:{choices:[{message:{content:text}}],usage:{prompt_tokens:120,completion_tokens:80}}))};
const mock=http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',async()=>{
  const u=req.url;res.setHeader('content-type','application/json');
  if(u==='/__ctl'){ctl={...ctl,...JSON.parse(b)};return res.end('{}')}
  if(u==='/__calls')return res.end(JSON.stringify(rec));
  const m=/^\/(groq|openrouter|gemini)\/(models|chat\/completions|[^/]+:generateContent)$/.exec(u);if(!m){res.statusCode=404;return res.end('{}')}
  const provider=m[1];
  if(m[2]==='models'){
    if(provider==='groq')return res.end(JSON.stringify({data:[{id:'draft-model'},{id:'other-groq'},{id:'llama-3.3-70b-versatile'},{id:'whisper-large-v3'}]}));
    if(provider==='gemini')return res.end(JSON.stringify({models:[{name:'models/editor-model',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.5-flash-lite',supportedGenerationMethods:['generateContent']},{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.5-flash-lite-preview-09',supportedGenerationMethods:['generateContent']},{name:'models/embed-only',supportedGenerationMethods:['embedContent']}]}));
    return res.end(JSON.stringify({data:[{id:'expert-model',pricing:{prompt:'0.000001',completion:'0.000002'}},{id:'free-model',pricing:{prompt:'0',completion:'0'}},{id:'google/gemma-4-31b-it:free',pricing:{prompt:'0',completion:'0'}}]}));
  }
  const j=JSON.parse(b),prompt=provider==='gemini'?j.contents[0].parts[0].text:j.messages[1].content;
  const task=(/^\[task:(\w+)\]/.exec(prompt)||[])[1]||'?',ch=+((/ТЕКСТ ГЛАВЫ (\d+)/.exec(prompt)||/Глава (\d+) «/.exec(prompt)||/Текущая глава (\d+)/.exec(prompt)||[])[1]||0);
  const call={provider,task,chapter:ch,prompt:task==='plan'?prompt:undefined,model:provider==='gemini'?decodeURIComponent(m[2].replace(':generateContent','')):j.model};rec.push(call);
  if(ctl.delayMs)await sleep(ctl.delayMs);
  const key=provider+task+ch;seen[key]=(seen[key]||0)+1;const nth=seen[key];
  if(provider==='openrouter'&&ctl.openrouterMode==='429'){res.statusCode=429;return res.end(JSON.stringify({error:{message:'free models rate limit'}}))}
  if(provider==='groq'&&ctl.groqMode==='429'){res.statusCode=429;return res.end(JSON.stringify({error:{message:'rate limit'}}))}
  if(provider==='groq'&&ctl.groqMode==='empty-once'&&task==='chapter_draft'&&nth===1)return reply(res,provider,'');
  if(provider==='groq'&&ctl.groqMode==='short-once'&&task==='chapter_draft'&&nth===1)return reply(res,provider,'Слишком коротко.');
  if(task==='plan'){const n=+((/Глав ровно (\d+)/.exec(prompt)||[])[1]||3);return reply(res,provider,JSON.stringify({title:'Письмо из Бухары',genre:'historical',wordsPerChapter:600,synopsis:'Торговец находит письмо и идёт по следу.',style:{voice:'спокойный',pov:'третье лицо',tense:'прошедшее',tone:'тёплый',rules:['без анахронизмов']},characters:[{name:'Алишер',role:'торговец',traits:'осторожный'}],facts:['Действие в Бухаре'],chapters:Array.from({length:n},(_,i)=>({title:`Глава ${i+1}: путь`,summary:`Алишер делает шаг ${i+1}.`}))}))}
  if(task==='chapter_draft')return reply(res,provider,chapterText(ch*10+nth));
  if(task==='chapter_fix')return reply(res,provider,chapterText(ch*10+50+nth)+'\n\nИСПРАВЛЕНО.');
  if(task==='chapter_expert')return reply(res,provider,chapterText(ch*10+90+nth)+'\n\nЭКСПЕРТНАЯ ПРАВКА.');
  if(task==='chapter_review'){
    const failN=(ctl.reviewFail||{})[ch]||0,always=(ctl.reviewAlways||[]).includes(ch);
    const bad=always||nth<=failN;
    return reply(res,provider,'```json\n'+JSON.stringify({issues:bad?[{type:'continuity',severity:'major',where:'середина',note:'Герой знает то, чего ещё не видел',fix:'Убрать знание'}]:[{type:'style',severity:'minor',note:'Немного повторов'}]})+'\n```');
  }
  if(task==='analyze')return reply(res,provider,JSON.stringify({summary:`Краткое содержание главы ${ch}: Алишер идёт дальше.`,facts:[`Факт главы ${ch}`],characters:[{name:'Алишер',state:`после главы ${ch} стал решительнее`}]}));
  if(task==='final_review')return reply(res,provider,JSON.stringify({issues:ctl.finalFail?[{type:'plot',severity:'major',where:'финал',note:'Развязка не вытекает из сюжета',fix:'Переписать финал'}]:[]}));
  if(task==='final_second')return reply(res,provider,JSON.stringify({issues:[]}));
  if(task==='annotation')return reply(res,provider,'Торговец из Бухары находит письмо и отправляется по следу.');
  return reply(res,provider,'?');
})}).listen(MOCK);


const mctl=o=>fetch(`http://localhost:${MOCK}/__ctl`,{method:'POST',body:JSON.stringify(o)});
const mcalls=()=>fetch(`http://localhost:${MOCK}/__calls`).then(r=>r.json());
const reset=async()=>{rec.length=0;for(const k of Object.keys(seen))delete seen[k];ctl={};};
return{mock,mctl,mcalls,reset};
}
