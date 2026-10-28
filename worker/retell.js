/* Audio retelling of a book: the editor model summarises the chapters one by one, then writes a spoken retelling in Russian or Uzbek.
   The administrator reads and edits the text and publishes it; readers listen with the voice of their device.
   Generation is driven by the admin screen one step (one model call) at a time, so it survives short request limits and can be resumed. */
import {AiError,callModel} from './ai.js';
import {cleanText} from './orch-checks.js';

const LANGS={ru:'русском',uz:'узбекском (латиницей)'};
const SYSTEM=l=>`Ты опытный литературный редактор и рассказчик. Пишешь точно по содержанию книги, ничего не выдумываешь. Язык ответа: ${LANGS[l]}. Никакой разметки: без заголовков, списков, звёздочек и эмодзи.`;
const MAX_CHARS=30000;

export function registerRetell({route,get,all,run,batch,stmt,json,bad,audit,clip,P,J,canRead,isPublished,aiKey,globalConfig}){
  const row=(c,id,lang)=>get(c,'SELECT * FROM book_retellings WHERE book_id=? AND lang=?',id,lang);
  const out=r=>({lang:r.lang,status:r.status,text:r.text||'',progress:r.progress,total:r.total,updated:r.updated});
  const bookRow=async(c,id)=>{const r=await get(c,'SELECT id,data,hidden FROM books WHERE id=?',id);return r?{id:r.id,b:P(r.data),hidden:r.hidden}:null};

  /* ---------- reading the book on the server ---------- */
  const chapterCount=b=>b.lazy?(b.nch||0):(b.chapters||[]).length;
  async function chapterOf(c,id,b,i){
    let title='',paras=[];
    if(!b.lazy){const ch=b.chapters[i];title=ch.t;paras=ch.p}
    else{
      const f=await get(c,'SELECT toc FROM lit_files WHERE book_id=? AND version=? AND ready=1',id,b.ver);if(!f)throw new Error('no_file');
      title=(P(f.toc)[i]||{}).t||'';
      paras=(await all(c,'SELECT body FROM book_chunks WHERE book_id=? AND version=? AND ch=? ORDER BY seq',id,b.ver,i)).flatMap(r=>P(r.body));
    }
    let text=paras.join('\n\n');if(text.length>MAX_CHARS)text=text.slice(0,20000)+'\n[…]\n'+text.slice(-8000);
    return{title,text};
  }

  /* ---------- one model call, trying the editor model first, then the writer, with their fallbacks ---------- */
  async function ask(c,{system,prompt,max,temperature}){
    const roles=(await globalConfig(c)).roles,cands=[];
    for(const r of [roles.editor,roles.draft])if(r)for(const x of [r.primary,...(r.fallbacks||[])])if(x&&!cands.some(y=>y.provider===x.provider&&y.model===x.model))cands.push(x);
    if(!cands.length)return{error:'no_models'};
    let last='provider';
    for(const cand of cands){
      const {key}=await aiKey(c,cand.provider);if(!key){last='no_key';continue}
      try{const r=await callModel(c.env,key,{provider:cand.provider,model:cand.model,system,prompt,max:Math.min(8000,max+1500),temperature,json:false});if(r.text&&r.text.trim())return{text:r.text,model:`${cand.provider}:${cand.model}`}}
      catch(e){last=e instanceof AiError?e.kind:'provider'}
    }
    return{error:'ai_failed',detail:last};
  }
  const target=n=>Math.max(500,Math.min(2000,150+n*100));

  /* ---------- public: only published retellings of books whose text may be read ---------- */
  route('GET','/api/books/:id/retelling',async(c,id)=>{
    const r=await bookRow(c,id);if(!r||(r.hidden&&!c.user.admin)||!isPublished(r.b)&&!c.user.admin)return bad(404);
    if(!canRead(r.b)&&!c.user.admin)return bad(403,'rights');
    const list=await all(c,"SELECT * FROM book_retellings WHERE book_id=? AND status='published' ORDER BY lang",id);
    return json({retellings:list.map(out)});
  });

  /* ---------- admin ---------- */
  route('GET','/api/admin/books/:id/retelling',async(c,id)=>{
    if(!await bookRow(c,id))return bad(404);
    return json({retellings:(await all(c,'SELECT * FROM book_retellings WHERE book_id=? ORDER BY lang',id)).map(out)});
  },true);
  route('POST','/api/admin/books/:id/retelling/start',async(c,id)=>{
    const r=await bookRow(c,id);if(!r)return bad(404);const lang=c.body?.lang;if(!LANGS[lang])return bad(422,'lang');
    if(!canRead(r.b))return bad(422,'rights_required');
    const n=chapterCount(r.b);if(!n)return bad(422,'no_text');
    const old=await row(c,id,lang);if(old?.status==='generating'&&old.progress>0&&c.body.restart!==true)return json({retelling:out(old)}); /* resume */
    const now=Date.now();
    await run(c,"INSERT INTO book_retellings(book_id,lang,text,status,summaries,progress,total,model,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(book_id,lang) DO UPDATE SET text='',status='generating',summaries='[]',progress=0,total=excluded.total,model='',updated=excluded.updated",id,lang,'','generating','[]',0,n+1,'',now,now);
    await audit(c,'retelling_start',id,{lang});return json({retelling:out(await row(c,id,lang))});
  },true);
  route('POST','/api/admin/books/:id/retelling/step',async(c,id)=>{
    const r=await bookRow(c,id);if(!r)return bad(404);const lang=c.body?.lang,cur=await row(c,id,lang);
    if(!cur)return bad(404,'not_started');if(cur.status!=='generating')return json({retelling:out(cur)});
    const n=cur.total-1,sums=P(cur.summaries||'[]'),now=Date.now();
    if(cur.progress<n){
      let ch;try{ch=await chapterOf(c,id,r.b,cur.progress)}catch{return bad(422,'no_file')}
      const a=await ask(c,{system:SYSTEM(lang),prompt:`[task:retell_chapter]
Книга «${r.b.title}». Глава ${cur.progress+1}${ch.title?` «${ch.title}»`:''}.\nПерескажи события главы в 3–6 предложениях (до 120 слов): кто действует, что происходит, чем глава заканчивается. Только пересказ, без вступлений.\n\nТекст главы:\n${ch.text}`,max:450,temperature:.3});
      if(a.error)return json({error:a.error,detail:a.detail||'',retelling:out(cur)},a.error==='no_models'?422:502);
      sums[cur.progress]=clip(cleanText(a.text),1200);
      const u=await run(c,'UPDATE book_retellings SET summaries=?,progress=?,model=?,updated=? WHERE book_id=? AND lang=? AND progress=?',J(sums),cur.progress+1,a.model,now,id,lang,cur.progress);
      if(!u.meta.changes)return json({retelling:out(await row(c,id,lang))});
    }else{
      const au=r.b.a?await get(c,'SELECT data FROM authors WHERE id=?',r.b.a):null,author=au?P(au.data).name:'';
      const words=target(n),all_=sums.map((s,i)=>`${i+1}. ${s}`).join('\n');
      const a=await ask(c,{system:SYSTEM(lang),prompt:`[task:retell_final]
Напиши аудиопересказ книги «${r.b.title}»${author?` (автор: ${author})`:''} для слушателей. Ниже краткие содержания глав по порядку.\n\nТребования: около ${words} слов; живая разговорная речь, которую приятно слушать; связный рассказ от начала до развязки, без перечисления «в первой главе, во второй»; имена и события только из содержаний; начни одним предложением о книге${author?' и авторе':''}; абзацы по 3–5 предложений, между абзацами пустая строка. Выдай только текст пересказа.\n\nСодержания глав:\n${clip(all_,60000)}`,max:Math.round(words*2.6),temperature:.5});
      if(a.error)return json({error:a.error,detail:a.detail||'',retelling:out(cur)},a.error==='no_models'?422:502);
      const text=cleanText(a.text);if(text.length<200)return json({error:'ai_failed',detail:'short',retelling:out(cur)},502);
      await run(c,"UPDATE book_retellings SET text=?,status='draft',progress=?,model=?,updated=? WHERE book_id=? AND lang=? AND progress=?",text,cur.total,a.model,now,id,lang,cur.progress);
    }
    return json({retelling:out(await row(c,id,lang))});
  },true);
  route('PUT','/api/admin/books/:id/retelling',async(c,id)=>{
    const r=await bookRow(c,id);if(!r)return bad(404);const lang=c.body?.lang,cur=lang&&await row(c,id,lang);if(!cur)return bad(404,'not_started');
    if(cur.status==='generating')return bad(409,'generating');
    const text=c.body.text!==undefined?clip(String(c.body.text).replace(/\r/g,''),40000):cur.text,status=c.body.status===undefined?cur.status:c.body.status;
    if(!['draft','published'].includes(status))return bad(422,'status');
    if(status==='published'){if(text.trim().length<200)return bad(422,'short');if(!canRead(r.b))return bad(422,'rights_required')}
    await run(c,'UPDATE book_retellings SET text=?,status=?,updated=? WHERE book_id=? AND lang=?',text,status,Date.now(),id,lang);
    await audit(c,status==='published'?'retelling_publish':'retelling_save',id,{lang});
    return json({retelling:out(await row(c,id,lang))});
  },true);
  route('POST','/api/admin/books/:id/retelling/delete',async(c,id)=>{
    const lang=c.body?.lang;if(!LANGS[lang])return bad(422,'lang');
    await run(c,'DELETE FROM book_retellings WHERE book_id=? AND lang=?',id,lang);await audit(c,'retelling_delete',id,{lang});return json({ok:true});
  },true);
}
