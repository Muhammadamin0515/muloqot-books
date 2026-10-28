/* Programmatic checks and parsers for the AI orchestrator. Pure functions: no network, no database. */
export const words=t=>(String(t||'').match(/\S+/g)||[]).length;

/** Removes markdown the models like to add, keeps paragraphs separated by a blank line. */
export const cleanText=t=>String(t||'').replace(/\r/g,'').replace(/^[ \t]*#+[ \t].*$/gm,'').replace(/\*\*|__/g,'').replace(/^[ \t]*[-*][ \t]+/gm,'— ').replace(/\n{3,}/g,'\n\n').trim();

const AI_SPEAK=/(как (языковая модель|ии\b|искусственный интеллект)|as an ai\b|language model|я не могу (создать|написать|продолжить)|конечно[!,]? (вот|ниже)|вот (глава|текст|продолжение)|sure[,!] here|here is (the|your) (chapter|text))/i;
const PLACEHOLDER=/\[[^\]\n]{0,40}(вставьте|имя героя|todo|placeholder|insert)[^\]\n]{0,40}\]/i;
const letters=s=>(String(s).match(/\p{L}/gu)||[]);
const shingles=(t,n=6)=>{const w=String(t).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[],out=new Set();for(let i=0;i+n<=w.length;i++)out.add(w.slice(i,i+n).join(' '));return out};

/** Issues found without any model. Each: {type,severity:'major'|'minor',note}. */
export function checkChapter(text,{lang='ru',targetWords=900,prevText='',characters=[]}={}){
  const issues=[],add=(type,severity,note)=>issues.push({type,severity,note,source:'program'});
  const w=words(text);
  if(w<40){add('length','major','Текст пустой или слишком короткий');return issues}
  if(w<targetWords*.45)add('length','major',`Глава слишком короткая: ${w} слов при цели около ${targetWords}`);
  else if(w>targetWords*2.4)add('length','minor',`Глава заметно длиннее цели: ${w} слов при цели около ${targetWords}`);
  const L=letters(text),cyr=L.filter(ch=>/\p{Script=Cyrillic}/u.test(ch)).length,lat=L.filter(ch=>/\p{Script=Latin}/u.test(ch)).length;
  if(L.length){
    if(lang==='ru'&&cyr/L.length<.8)add('language','major','Текст должен быть на русском, но значительная часть написана другим алфавитом');
    if(lang==='uz'&&lat/L.length<.8)add('language','major','Текст должен быть на узбекском (латиница), но значительная часть написана другим алфавитом');
  }
  if(AI_SPEAK.test(text))add('format','major','В тексте остались фразы ассистента («как языковая модель», «вот глава» и т. п.)');
  if(PLACEHOLDER.test(text))add('format','major','В тексте остались заполнители в квадратных скобках');
  const paras=String(text).split(/\n{2,}/).map(x=>x.trim().toLowerCase()).filter(x=>x.length>30),uniq=new Set(paras);
  if(paras.length>=4&&(paras.length-uniq.size)/paras.length>.15)add('repetition','major','Много повторяющихся абзацев');
  if(prevText){const a=shingles(text),b=shingles(prevText);if(a.size>30){let same=0;for(const x of a)if(b.has(x))same++;if(same/a.size>.2)add('repetition','major','Глава дословно повторяет большие куски предыдущей')}}
  const sent=String(text).split(/[.!?…]+\s/).map(x=>x.trim().toLowerCase()).filter(x=>x.length>25);
  if(sent.length>=8){const u=new Set(sent);if((sent.length-u.size)/sent.length>.2)add('repetition','major','Много повторяющихся предложений')}
  if(!/[.!?…»"”]\s*$/.test(String(text).trim()))add('format','minor','Текст обрывается на середине предложения');
  void characters;
  return issues;
}
/** Whole-book checks that need no model. */
export function checkBook(chapters,{count,lang}={}){
  const issues=[],add=(type,severity,note)=>issues.push({type,severity,note,source:'program'});
  if(count&&chapters.length!==count)add('structure','major',`Глав ${chapters.length}, а в плане ${count}`);
  const titles=chapters.map(c=>String(c.title||'').trim().toLowerCase());if(new Set(titles).size!==titles.length)add('structure','minor','Есть главы с одинаковыми названиями');
  chapters.forEach((c,i)=>{if(!c.text||words(c.text)<40)add('length','major',`Глава ${i+1} пустая`)});
  void lang;return issues;
}

/** The first balanced JSON object found in a model answer, or null. */
export function parseJsonLoose(text){
  const s=String(text||''),a=s.indexOf('{');if(a<0)return null;
  let depth=0,inStr=false,esc=false;
  for(let i=a;i<s.length;i++){
    const ch=s[i];
    if(inStr){if(esc)esc=false;else if(ch==='\\')esc=true;else if(ch==='"')inStr=false;continue}
    if(ch==='"')inStr=true;else if(ch==='{')depth++;else if(ch==='}'){depth--;if(depth===0){try{return JSON.parse(s.slice(a,i+1))}catch{return null}}}
  }
  return null;
}
export const GENRE_IDS=['novel','detective','historical','adventure','drama','stories','modern','prose'];
const TYPES=['continuity','character','style','logic','language','plot','other'];
/** An editor's answer → {ok,issues}. Throws when the answer is not usable. */
export function parseReview(text){
  const j=parseJsonLoose(text);
  if(!j||!Array.isArray(j.issues))throw new Error('bad_format');
  const issues=j.issues.slice(0,12).map(x=>({type:TYPES.includes(x?.type)?x.type:'other',severity:x?.severity==='minor'?'minor':'major',note:String(x?.note||'').slice(0,500),fix:String(x?.fix||'').slice(0,500),where:String(x?.where||'').slice(0,200),source:'editor'})).filter(x=>x.note);
  return{ok:!issues.some(x=>x.severity==='major'),issues};
}
/** The plan and "story bible" the architect returns → normalized, or throws. */
export function parsePlan(text,{chapters}={}){
  const j=parseJsonLoose(text);if(!j||!Array.isArray(j.chapters))throw new Error('bad_format');
  const ch=j.chapters.slice(0,14).map(c=>({title:String(c?.title||'').slice(0,100),summary:String(c?.summary||'').slice(0,500)})).filter(c=>c.title);
  if(!ch.length||(chapters&&ch.length!==chapters))throw new Error('bad_format');
  const wpc=Math.round(+j.wordsPerChapter);
  const st=j.style&&typeof j.style==='object'?j.style:{};
  return{title:String(j.title||'').slice(0,150),synopsis:String(j.synopsis||'').slice(0,1500),genre:GENRE_IDS.includes(j.genre)?j.genre:'',wordsPerChapter:Number.isFinite(wpc)?Math.max(300,Math.min(2000,wpc)):0,
    style:{voice:String(st.voice||'').slice(0,200),pov:String(st.pov||'').slice(0,100),tense:String(st.tense||'').slice(0,60),tone:String(st.tone||'').slice(0,200),rules:(Array.isArray(st.rules)?st.rules:[]).slice(0,8).map(x=>String(x).slice(0,200))},
    characters:(Array.isArray(j.characters)?j.characters:[]).slice(0,12).map(x=>({name:String(x?.name||'').slice(0,60),role:String(x?.role||'').slice(0,120),traits:String(x?.traits||'').slice(0,240)})).filter(x=>x.name),
    facts:(Array.isArray(j.facts)?j.facts:[]).slice(0,20).map(x=>String(x).slice(0,240)),chapters:ch};
}
/** After a chapter is approved: its summary and the facts it established. */
export function parseAnalysis(text){
  const j=parseJsonLoose(text);if(!j||typeof j.summary!=='string'||j.summary.trim().length<10)throw new Error('bad_format');
  return{summary:j.summary.trim().slice(0,900),facts:(Array.isArray(j.facts)?j.facts:[]).slice(0,10).map(x=>String(x).slice(0,240)).filter(Boolean),
    characters:(Array.isArray(j.characters)?j.characters:[]).slice(0,8).map(x=>({name:String(x?.name||'').slice(0,60),state:String(x?.state||'').slice(0,240)})).filter(x=>x.name)};
}

/** The language of a text by its script: Cyrillic → ru, otherwise Latin → uz. */
export function detectLang(text){
  const L=letters(text),cyr=L.filter(ch=>/\p{Script=Cyrillic}/u.test(ch)).length;
  return L.length&&cyr/L.length>=.3?'ru':'uz';
}
