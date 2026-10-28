/* Library: machine import of prepared collections (token protected), chapter-by-chapter reading, publication, reading progress and bookmarks.
   Books imported here are "lazy": the row in `books` holds metadata only, the text lives in `book_chunks` (JSON arrays of paragraphs). */
import {GENRES,RIGHTS_OK,canRead,isPublished,hasText,rightsOf,checkTextRights,cleanRights,httpsUrl} from './catalog.js';
import {COVER_STYLES} from './covers.js';

const MAX_CHUNK_CHARS=250_000,MAX_REQ_CHARS=1_800_000;
const HEX=(n,m)=>new RegExp(`^[0-9a-f]{${n},${m}}$`);

/** Constant-time comparison of the bearer token with env.IMPORT_TOKEN. Import is disabled when the token is not configured. */
export async function tokenCheck(env,header){
  if(!env.IMPORT_TOKEN||String(env.IMPORT_TOKEN).length<16)return 'disabled';
  const m=/^Bearer (.+)$/.exec(header||'');if(!m)return 'denied';
  const enc=new TextEncoder(),h=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)));
  const [a,b]=await Promise.all([h(m[1]),h(String(env.IMPORT_TOKEN))]);
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0?'ok':'denied';
}

/** Why a book cannot be published yet, or null. */
export function publishBlock(b,{metaConfirmed=false}={}){
  if(!b.lazy&&!(b.chapters||[]).length)return 'no_file';
  if(b.lazy&&!(b.ver&&b.nch>0))return 'no_file';
  if(!RIGHTS_OK.includes(rightsOf(b).status))return 'rights_required';
  if(b.lit?.metaStatus==='needs_review'&&!metaConfirmed&&!b.lit?.metaConfirmed)return 'meta_review_required';
  return null;
}

const str=(v,n)=>String(v??'').trim().slice(0,n);
const int=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi?v:null;
const strList=(a,n,m)=>(Array.isArray(a)?a:[]).slice(0,n).map(x=>str(x,m));

export function validateRecord(r){
  if(!r||typeof r!=='object')return{error:'record'};
  if(!HEX(40,40).test(r.sourceId||''))return{error:'sourceId'};
  if(!/^[a-z]{1,4}[0-9a-f]{6,16}$/.test(r.id||''))return{error:'id'};
  const title=str(r.title,200),author=str(r.author,100);
  if(title.length<1)return{error:'title'};if(author.length<2)return{error:'author'};
  const lang=r.lang==='uz'?'uz':r.lang==='ru'?'ru':null;if(!lang)return{error:'lang'};
  if(!GENRES.includes(r.genre))return{error:'genre'};
  const nch=int(r.chapters,1,5000);if(!nch)return{error:'chapters'};
  if(!HEX(64,64).test(r.hash||'')||!HEX(12,12).test(r.version||''))return{error:'hash'};
  if(!Array.isArray(r.toc)||r.toc.length!==nch)return{error:'toc'};
  const toc=r.toc.map(c=>({t:str(c?.t,200),n:int(c?.n,0,5_000_000)??0,...(c?.s?{s:1}:{})}));
  const chars=int(r.chars,1,20_000_000);if(!chars)return{error:'chars'};
  const sourceUrl=httpsUrl(r.sourceUrl);if(!sourceUrl||!str(r.sourceName,80))return{error:'source'};
  return{rec:{id:r.id,sourceId:r.sourceId,title,author,lang,genre:r.genre,year:int(r.year,800,2100),yearRaw:str(r.yearRaw,40),nch,chars,toc,hash:r.hash,version:r.version,
    series:str(r.series,100),seriesNo:int(r.seriesNo,1,999),authorDeathYear:int(r.authorDeathYear,0,2100),
    lit:{collection:str(r.collection||'RusLit',60),sourceName:str(r.sourceName,80),sourceUrl,rawUrl:httpsUrl(r.rawUrl),repo:httpsUrl(r.sourceRepo),commit:str(r.sourceCommit,60),path:str(r.path,300),prepVersion:str(r.prepVersion,40),
      encoding:str(r.encoding,20),structure:str(r.structure,20),synthetic:!!r.synthetic,authorSource:str(r.authorSource,40),metaStatus:r.status==='needs_review'?'needs_review':'ok',review:strList(r.review,30,200),info:strList(r.info,30,200),
      ...(r.dupOf?{dupOf:str(r.dupOf,20)}:{}),...(r.possibleDuplicate?{possibleDuplicate:str(r.possibleDuplicate,20)}:{})}}};
}

export function registerLibrary(d){
  const {route,stmt,get,all,run,batch,json,bad,P,J,audit,id8}=d;
  const bookRow=async(c,id)=>get(c,'SELECT id,data,hidden FROM books WHERE id=?',id);
  const bySource=(c,sid)=>get(c,"SELECT id,data FROM books WHERE json_extract(data,'$.lit.sourceId')=?",sid);

  /* ---------- machine import (Authorization: Bearer IMPORT_TOKEN; routes flagged 'token') ---------- */
  route('GET','/api/import/status',async c=>{
    const rows=await all(c,"SELECT id,data FROM books WHERE json_extract(data,'$.lit.sourceId') IS NOT NULL");
    return json({books:rows.map(r=>{const b=P(r.data);return{id:r.id,sourceId:b.lit.sourceId,ver:b.ver||null,pendingVer:b.lit.pendingVer||null,publish:b.publish||'published',hash:b.lit.hash}})});
  },'token');

  /* Covers drawn by scripts/covers.mjs: the list of real books without a picture, and an upload of the rendered JPEG. */
  route('GET','/api/import/covers',async c=>{
    const rows=await all(c,"SELECT b.id,b.data,a.data ad FROM books b LEFT JOIN authors a ON a.id=json_extract(b.data,'$.a') WHERE json_extract(b.data,'$.img') IS NULL AND json_extract(b.data,'$.demo') IS NOT 1 AND json_extract(b.data,'$.lit.sourceId') IS NOT NULL");
    return json({books:rows.map(r=>{const b=P(r.data);return{id:r.id,title:b.title,authorName:r.ad?P(r.ad).name:'',motif:b.motif,pal:b.pal}})});
  },'token');
  route('POST','/api/import/cover',async c=>{
    const id=String(c.body.id||''),img=String(c.body.img||'');
    if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(img)||img.length>70000)return bad(422,'cover');
    const row=await bookRow(c,id);if(!row)return bad(404);
    const b=P(row.data);if(b.img)return json({status:'exists'});
    b.img=img;b.imgAuto=true;await run(c,'UPDATE books SET data=? WHERE id=?',J(b),id);return json({status:'ok'});
  },'token');

  route('POST','/api/import/book',async c=>{
    const v=validateRecord(c.body.record);if(v.error)return bad(422,v.error);const r=v.rec;
    const ex=await bySource(c,r.sourceId);
    if(ex){
      const b=P(ex.data);
      if(b.ver===r.version&&b.lit.hash===r.hash)return json({status:'exists',id:ex.id,ver:b.ver});
      // same source file, new content: keep identity, rights and publication, stage the new version
      b.lit={...b.lit,...r.lit,hash:r.hash,pendingVer:r.version,metaConfirmed:b.lit.metaConfirmed};
      b.pendingToc=r.toc;b.pendingNch=r.nch;b.pendingChars=r.chars;
      await run(c,'UPDATE books SET data=? WHERE id=?',J(b),ex.id);
      return json({status:'updating',id:ex.id,ver:b.ver});
    }
    if(await get(c,'SELECT 1 x FROM books WHERE id=?',r.id))return bad(409,'id_taken');
    let a=await get(c,"SELECT id FROM authors WHERE lower(json_extract(data,'$.name'))=lower(?)",r.author);
    const aid=a?.id||'a'+id8(),h=[...r.id].reduce((x,ch)=>x+ch.charCodeAt(0),0),st=COVER_STYLES[h%COVER_STYLES.length];
    const added=((await get(c,'SELECT COALESCE(MAX(added),0) m FROM books')).m)+1;
    const book={id:r.id,a:aid,title:r.title,lang:r.lang,genre:r.genre,year:r.year,pages:Math.max(1,Math.round(r.chars/1800)),added,rating:0,count:0,motif:st.motif,pal:st.pal,desc:'',
      chapters:[],lazy:true,nch:r.nch,chars:r.chars,ver:null,format:'txt',...(r.series?{series:r.series,seriesNo:r.seriesNo}:{}),publish:'draft',
      rights:{status:'unverified',license:'',evidenceUrl:'',note:'Импортировано как черновик. Права на публикацию этого текста не подтверждены.',source:{name:r.lit.sourceName,url:r.lit.sourceUrl}},
      lit:{...r.lit,sourceId:r.sourceId,hash:r.hash,pendingVer:r.version,importedAt:new Date().toISOString(),...(r.authorDeathYear?{authorDeathYear:r.authorDeathYear}:{})},pendingToc:r.toc,pendingNch:r.nch,pendingChars:r.chars};
    const ops=[stmt(c,'INSERT INTO books(id,data,added) VALUES(?,?,?)',r.id,J(book),added)];
    if(!a)ops.push(stmt(c,'INSERT INTO authors(id,data,followers_base,user_id) VALUES(?,?,0,NULL)',aid,J({id:aid,name:r.author,city:{ru:'',uz:''},hair:'short',hairc:'#2a1c12',skin:'#d3ab88',glasses:0,pal:[['#2a1a14','#7a2e17'],['#10282c','#2f6672'],['#26141a','#7a3346'],['#2a1f12','#8a5a22']][h%4],bio:{ru:'',uz:''}})));
    await batch(c,ops);
    return json({status:'created',id:r.id});
  },'token');

  route('POST','/api/import/chunks',async c=>{
    const id=String(c.body.id||''),ver=String(c.body.version||''),list=Array.isArray(c.body.chunks)?c.body.chunks:[];
    if(!HEX(12,12).test(ver)||!list.length||list.length>60)return bad(422,'chunks');
    const row=await bookRow(c,id);if(!row)return bad(404);const b=P(row.data);
    if(!b.lit?.pendingVer||b.lit.pendingVer!==ver)return bad(409,'version');
    let total=0;const ops=[];
    for(const ch of list){
      const i=int(ch.ch,0,4999),q=int(ch.seq,0,9999),body=typeof ch.body==='string'?ch.body:'';
      if(i===null||q===null||!body||body.length>MAX_CHUNK_CHARS)return bad(422,'chunk');
      let arr;try{arr=JSON.parse(body)}catch{return bad(422,'chunk_json')}
      if(!Array.isArray(arr)||!arr.every(x=>typeof x==='string'))return bad(422,'chunk_shape');
      total+=body.length;if(total>MAX_REQ_CHARS)return bad(413,'toolarge');
      ops.push(stmt(c,'INSERT OR REPLACE INTO book_chunks(book_id,version,ch,seq,body) VALUES(?,?,?,?,?)',id,ver,i,q,body));
    }
    await batch(c,ops);return json({ok:true,stored:ops.length});
  },'token');

  route('POST','/api/import/finish',async c=>{
    const id=String(c.body.id||''),ver=String(c.body.version||''),expected=int(c.body.chunks,1,100000);
    const row=await bookRow(c,id);if(!row)return bad(404);const b=P(row.data);
    if(b.lit?.pendingVer!==ver||!expected)return bad(409,'version');
    const have=await all(c,'SELECT ch,COUNT(*) n,SUM(length(body)) s FROM book_chunks WHERE book_id=? AND version=? GROUP BY ch',id,ver);
    const nch=b.pendingNch,got=have.reduce((n,x)=>n+x.n,0);
    if(have.length!==nch||got!==expected||have.some((x,k)=>x.ch!==k))return bad(422,'incomplete');
    const bytes=have.reduce((n,x)=>n+x.s,0);
    await run(c,'INSERT OR REPLACE INTO lit_files(book_id,version,hash,chapters,chunks,chars,bytes,format,storage,toc,prep_version,ready,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?)',
      id,ver,b.lit.hash,nch,got,b.pendingChars,bytes,'txt','d1:book_chunks/'+id+'/'+ver,J(b.pendingToc),b.lit.prepVersion||'',Date.now());
    const old=b.ver;
    b.ver=ver;b.nch=nch;b.chars=b.pendingChars;b.pages=Math.max(1,Math.round(b.chars/1800));b.lit.storageKey='d1:book_chunks/'+id+'/'+ver;delete b.lit.pendingVer;delete b.pendingToc;delete b.pendingNch;delete b.pendingChars;
    await run(c,'UPDATE books SET data=? WHERE id=?',J(b),id);
    // keep the previous version for a while (readers mid-chapter), drop anything older
    await run(c,'DELETE FROM book_chunks WHERE book_id=? AND version NOT IN (?,?)',id,ver,old||ver);
    await run(c,'DELETE FROM lit_files WHERE book_id=? AND version NOT IN (?,?)',id,ver,old||ver);
    return json({ok:true,id,ver,chapters:nch,bytes});
  },'token');

  /** Applies an allow-list entry: the rights are verified here (not only in the importer) before a draft becomes public. */
  async function publishOne(c,item,by){
    const row=item.id?await bookRow(c,String(item.id)):null;if(!row)return{id:item.id,error:'not_found'};
    const b=P(row.data);
    const r=cleanRights(item.rights),death=Number.isInteger(item.authorDeathYear)?item.authorDeathYear:null;
    if(death!==null)r.authorDeathYear=death;
    r.source=b.rights?.source||{name:'',url:''};
    const td=Number.isInteger(item.translatorDeathYear)?item.translatorDeathYear:(b.rights?.translatorDeathYear??null);if(td!==null)r.translatorDeathYear=td;
    const e=checkTextRights(r,death,'',new Date().getFullYear(),{translated:!!b.translator,translatorDeath:td});if(e)return{id:row.id,error:e};
    b.rights={...r,verifiedBy:str(item.verifiedBy||by,60),verifiedAt:Date.now(),verifiedOn:str(item.verifiedOn,20)};
    if(b.lit&&item.metaConfirmed)b.lit.metaConfirmed=true;
    const blocked=publishBlock(b,{metaConfirmed:!!item.metaConfirmed});if(blocked)return{id:row.id,error:blocked};
    b.publish='published';await run(c,'UPDATE books SET data=? WHERE id=?',J(b),row.id);
    await audit(c,'publish',row.id,{rights:r.status,by:b.rights.verifiedBy});return{id:row.id,ok:true};
  }
  route('POST','/api/import/publish',async c=>{
    const items=(Array.isArray(c.body.items)?c.body.items:[]).slice(0,100);if(!items.length)return bad(400,'empty');
    const out=[];for(const it of items)out.push(await publishOne(c,it,'allowlist'));return json({results:out});
  },'token');
  route('POST','/api/import/unpublish',async c=>{
    const out=[];for(const id of (Array.isArray(c.body.ids)?c.body.ids:[]).slice(0,200)){
      const row=await bookRow(c,String(id));if(!row){out.push({id,error:'not_found'});continue}
      const b=P(row.data);b.publish='draft';await run(c,'UPDATE books SET data=? WHERE id=?',J(b),row.id);await audit(c,'unpublish',row.id,{});out.push({id,ok:true})}
    return json({results:out});
  },'token');

  /** Machine read-back of a prepared chapter, drafts included (import verification only; protected by the token). */
  route('GET','/api/import/chapter/:id/:n',async(c,id,n)=>{
    const row=await bookRow(c,id);if(!row)return bad(404);const b=P(row.data);if(!b.lazy||!b.ver)return bad(404,'no_file');
    const i=/^\d{1,4}$/.test(n)?+n:-1;if(i<0||i>=b.nch)return bad(404);
    const f=await get(c,'SELECT toc FROM lit_files WHERE book_id=? AND version=? AND ready=1',id,b.ver);if(!f)return bad(404,'no_file');
    const rows=await all(c,'SELECT body FROM book_chunks WHERE book_id=? AND version=? AND ch=? ORDER BY seq',id,b.ver,i);
    return json({ver:b.ver,i,t:P(f.toc)[i].t,p:rows.flatMap(r=>P(r.body)),hash:b.lit.hash});
  },'token');

  /* ---------- admin: publish / unpublish one book from the panel ---------- */
  route('POST','/api/admin/books/:id/publish',async(c,id)=>{
    const row=await bookRow(c,id);if(!row)return bad(404);const b=P(row.data);
    if(c.body.on===false){b.publish='draft';await run(c,'UPDATE books SET data=? WHERE id=?',J(b),id);await audit(c,'unpublish',id,{});return json({ok:true})}
    if(c.body.metaConfirmed&&b.lit){b.lit.metaConfirmed=true}
    const e=publishBlock(b,{metaConfirmed:!!c.body.metaConfirmed});if(e)return bad(422,e);
    b.publish='published';await run(c,'UPDATE books SET data=? WHERE id=?',J(b),id);await audit(c,'publish',id,{by:c.user.id});return json({ok:true});
  },true);

  /* ---------- reading ---------- */
  const readable=(b,c)=>canRead(b)||c.user.admin;
  const tocOf=async(c,id,b)=>{
    if(b.lazy){const f=await get(c,'SELECT toc,version FROM lit_files WHERE book_id=? AND version=? AND ready=1',id,b.ver);return f?{ver:b.ver,chapters:P(f.toc)}:null}
    return{ver:'',chapters:b.chapters.map(ch=>({t:ch.t,n:ch.p.reduce((m,x)=>m+x.length,0)}))};
  };
  route('GET','/api/books/:id/toc',async(c,id)=>{
    const row=await bookRow(c,id);if(!row||(row.hidden&&!c.user.admin))return bad(404);const b=P(row.data);
    if(!readable(b,c))return bad(b.publish==='draft'?404:403,b.publish==='draft'?'not found':'rights');
    const t=await tocOf(c,id,b);if(!t)return bad(404,'no_file');
    return new Response(J(t),{headers:{'content-type':'application/json','cache-control':'private, max-age=600'}});
  });
  route('GET','/api/books/:id/chapter/:n',async(c,id,n)=>{
    const row=await bookRow(c,id);if(!row||(row.hidden&&!c.user.admin))return bad(404);const b=P(row.data);
    if(!readable(b,c))return bad(b.publish==='draft'?404:403,b.publish==='draft'?'not found':'rights');
    const i=/^\d{1,4}$/.test(n)?+n:-1;
    if(!b.lazy){const ch=b.chapters[i];if(!ch)return bad(404);return json({ver:'',i,t:ch.t,p:ch.p})}
    if(i<0||i>=b.nch)return bad(404);
    const f=await get(c,'SELECT toc FROM lit_files WHERE book_id=? AND version=? AND ready=1',id,b.ver);if(!f)return bad(404,'no_file');
    const rows=await all(c,'SELECT body FROM book_chunks WHERE book_id=? AND version=? AND ch=? ORDER BY seq',id,b.ver,i);
    if(!rows.length)return bad(404,'no_file');
    const p=rows.flatMap(r=>P(r.body));
    return new Response(J({ver:b.ver,i,t:P(f.toc)[i].t,p}),{headers:{'content-type':'application/json','cache-control':'private, max-age=3600'}});
  });

  /* ---------- reading progress (one row per user and book, protected by a revision) ---------- */
  const progOut=r=>({ver:r.ver,locator:P(r.locator),percent:r.percent,rev:r.rev,ts:r.updated});
  route('GET','/api/progress',async c=>json({progress:Object.fromEntries((await all(c,'SELECT book_id,ver,locator,percent,rev,updated FROM reading_progress WHERE user_id=?',c.user.id)).map(r=>[r.book_id,progOut(r)]))}));
  route('PUT','/api/progress/:bookId',async(c,bookId)=>{
    const row=await bookRow(c,bookId);if(!row)return bad(404);const b=P(row.data);if(!isPublished(b)&&!c.user.admin)return bad(404);
    const loc=c.body.locator||{},ch=int(loc.ch,0,5000),para=loc.para==null?null:int(loc.para,0,200000),p=typeof loc.p==='number'&&loc.p>=0&&loc.p<=1?Math.round(loc.p*10000)/10000:0;
    const rev=int(c.body.rev,1,1e9),percent=typeof c.body.percent==='number'&&c.body.percent>=0&&c.body.percent<=100?Math.round(c.body.percent*10)/10:null;
    const ver=String(c.body.ver||'').slice(0,20);
    if(ch===null||!rev)return bad(422,'locator');
    const cur=await get(c,'SELECT ver,locator,percent,rev,updated FROM reading_progress WHERE user_id=? AND book_id=?',c.user.id,bookId);
    if(cur&&cur.rev>=rev)return json({stored:progOut(cur)},409);
    const now=Date.now();
    await run(c,'INSERT INTO reading_progress(user_id,book_id,ver,locator,percent,rev,updated) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,book_id) DO UPDATE SET ver=excluded.ver,locator=excluded.locator,percent=excluded.percent,rev=excluded.rev,updated=excluded.updated',
      c.user.id,bookId,ver,J({ch,para,p}),percent,rev,now);
    return json({ok:true,rev,ts:now});
  });
  route('GET','/api/bookmarks',async c=>json({bookmarks:await bookmarksOf(c)}));
  const bookmarksOf=async c=>(await all(c,'SELECT id,book_id,ver,ch,para,snippet,created FROM bookmarks WHERE user_id=? ORDER BY created DESC LIMIT 500',c.user.id)).map(r=>({id:r.id,bookId:r.book_id,ver:r.ver,ch:r.ch,para:r.para,snip:r.snippet,ts:r.created}));
  route('POST','/api/bookmarks',async c=>{
    const id=String(c.body.id||'');if(!/^[\w-]{4,40}$/.test(id))return bad(422,'id');
    const row=await bookRow(c,String(c.body.bookId||''));if(!row)return bad(404);const b=P(row.data);if(!isPublished(b)&&!c.user.admin)return bad(404);
    const ch=int(c.body.ch,0,5000),para=int(c.body.para,0,200000);if(ch===null||para===null)return bad(422,'locator');
    if((await get(c,'SELECT COUNT(*) n FROM bookmarks WHERE user_id=?',c.user.id)).n>=500&&!await get(c,'SELECT 1 x FROM bookmarks WHERE user_id=? AND id=?',c.user.id,id))return bad(422,'limit');
    await run(c,'INSERT INTO bookmarks(user_id,id,book_id,ver,ch,para,snippet,created) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET ver=excluded.ver,ch=excluded.ch,para=excluded.para,snippet=excluded.snippet',
      c.user.id,id,row.id,String(c.body.ver||'').slice(0,20),ch,para,String(c.body.snip||'').slice(0,160),Date.now());
    return json({ok:true});
  });
  route('DELETE','/api/bookmarks/:id',async(c,id)=>{await run(c,'DELETE FROM bookmarks WHERE user_id=? AND id=?',c.user.id,id);return json({ok:true})});
  return{progressOf:async c=>(await get(c,'SELECT 1 x'))&&Object.fromEntries((await all(c,'SELECT book_id,ver,locator,percent,rev,updated FROM reading_progress WHERE user_id=?',c.user.id)).map(r=>[r.book_id,progOut(r)])),bookmarksOf};
}
