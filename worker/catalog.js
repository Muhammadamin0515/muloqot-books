/* Catalog rules: which books are real, who may read the full text, and how an imported record is validated. */
import {parseManuscript} from './parse.js';

export const GENRES=['novel','detective','historical','adventure','drama','stories','modern','prose','poetry','publicism'];
/** Statuses under which the full text may be shown to readers. Anything else means "metadata only". */
export const RIGHTS_OK=['public_domain','author','licensed','permission'];
export const RIGHTS_ALL=[...RIGHTS_OK,'unverified'];
/** Uzbekistan: copyright lasts for the author's life plus 70 years, counted from 1 January after the death. */
export const PD_YEARS=71;
export const MAX_TEXT_BYTES=1_400_000,MAX_COVER_CHARS=450_000;
/** Hosts the Worker may download a cover from during import. Nothing else is fetched (no SSRF). */
export const COVER_HOSTS=['covers.openlibrary.org','upload.wikimedia.org','www.gutenberg.org','gutenberg.org'];

export const isDemo=b=>!!(b&&b.demo);
/** Legacy books (published before rights were recorded) came from author submissions and count as author-attested. */
export const rightsOf=b=>b.rights||(b.demo?{status:'demo'}:{status:'author',legacy:true});
/** A book is public unless it is a draft. Imported books start as drafts and are published only after their rights are confirmed. */
export const isPublished=b=>b.publish!=='draft';
/** Chapters of a book live in the row (legacy) or in book_chunks (lazy books, e.g. imported collections). */
export const hasText=b=>b.lazy?(b.nch>0&&!!b.ver):(b.chapters||[]).length>0;
export const canRead=b=>isPublished(b)&&(isDemo(b)||RIGHTS_OK.includes(rightsOf(b).status));
/** The part of the rights record that readers may see. Evidence links and notes stay in the admin panel. */
export const publicRights=b=>{const r=rightsOf(b);return{status:r.status,license:r.license||'',source:r.source?.name||'',sourceUrl:r.source?.url||''}};

const clip=(s,n)=>String(s??'').trim().slice(0,n);
const byteLen=t=>new TextEncoder().encode(t).length;
const httpsUrl=u=>{try{const x=new URL(String(u));return x.protocol==='https:'?x.href.slice(0,500):''}catch{return ''}};

/** The rule that guards every full text: confirmed basis, proof of it, and a size the database can hold. Returns an error code or null. */
export function checkTextRights(rights,death,text,now=new Date().getFullYear(),{translated=false,translatorDeath=null}={}){
  if(!RIGHTS_OK.includes(rights.status))return 'rights_required';
  if(rights.status==='public_domain'&&!(Number.isInteger(death)&&death<=now-PD_YEARS))return 'pd_not_proven';
  /* A translation is a separate work: the translator's rights must have expired too (the original being free is not enough). */
  if(rights.status==='public_domain'&&translated&&!(Number.isInteger(translatorDeath)&&translatorDeath<=now-PD_YEARS))return 'translator_pd_not_proven';
  if(rights.status!=='public_domain'&&!rights.evidenceUrl&&!rights.note)return 'evidence';
  if(byteLen(text)>MAX_TEXT_BYTES)return 'toolarge';
  return null;
}
/** Normalises a rights record coming from the admin form. */
export const cleanRights=r=>({status:RIGHTS_ALL.includes(r?.status)?r.status:'unverified',license:clip(r?.license,80),evidenceUrl:httpsUrl(r?.evidenceUrl),note:clip(r?.note,500)});
export {httpsUrl,clip};

/**
 * Validates one admin import record and returns {book} or {error}. The text is only accepted when the rights are confirmed:
 * public domain needs the author's death year old enough, every other basis needs an evidence link or note.
 */
export function validateImport(r,{now=new Date().getFullYear()}={}){
  const title=clip(r.title,160),author=clip(r.author,100);
  if(title.length<2)return{error:'title'};
  if(author.length<2)return{error:'author'};
  const lang=r.lang==='uz'?'uz':r.lang==='ru'?'ru':null;if(!lang)return{error:'lang'};
  const genre=GENRES.includes(r.genre)?r.genre:null;if(!genre)return{error:'genre'};
  const desc=clip(r.description,3000);
  const rights=cleanRights(r.rights);
  const death=Number.isInteger(r.authorDeathYear)?r.authorDeathYear:null;
  if(death!==null)rights.authorDeathYear=death;
  const text=typeof r.text==='string'?r.text:'';
  let chapters=[];
  const translatorDeath=Number.isInteger(r.translatorDeathYear)?r.translatorDeathYear:null;if(translatorDeath!==null)rights.translatorDeathYear=translatorDeath;
  if(text.trim()){const e=checkTextRights(rights,death,text,now,{translated:!!clip(r.translator,100),translatorDeath});if(e)return{error:e};chapters=parseManuscript(text);if(!chapters.length)return{error:'manuscript'}}
  const source={name:clip(r.source?.name,80),url:httpsUrl(r.source?.url)};
  if(!source.name)return{error:'source'};
  rights.source=source;
  const chars=chapters.reduce((n,c)=>n+c.p.join('').length,0);
  const book={
    title,lang,genre,desc,chapters,rights,
    pages:chapters.length?Math.max(1,Math.round(chars/1800)):Math.max(0,Math.min(5000,Math.round(+r.pages)||0)),
    year:Math.max(0,Math.min(now,Math.round(+r.year)||0))||null,
    ...(clip(r.series,100)?{series:clip(r.series,100),seriesNo:Math.max(0,Math.min(999,Math.round(+r.seriesNo)||0))||null}:{}),
    ...(clip(r.originalTitle,160)?{originalTitle:clip(r.originalTitle,160)}:{}),
    ...(clip(r.translator,100)?{translator:clip(r.translator,100)}:{}),
    ...(clip(r.publisher,100)?{publisher:clip(r.publisher,100)}:{}),
    ...(/^[\dXx-]{10,17}$/.test(String(r.isbn||'').trim())?{isbn:String(r.isbn).trim()}:{}),
    ...(r.ai&&clip(r.ai.model,80)?{ai:{provider:clip(r.ai.provider,20),model:clip(r.ai.model,80)}}:{}),
    format:'text'
  };
  return{book,author:{name:author,city:{ru:clip(r.authorCity,60),uz:clip(r.authorCity,60)},bio:{ru:clip(r.authorBio,600),uz:clip(r.authorBio,600)},...(death!==null?{deathYear:death}:{})},coverUrl:httpsUrl(r.coverUrl),cover:typeof r.cover==='string'?r.cover:''};
}

/** Downloads an allowed cover and returns it as a data URI, or null. Runs inside the Worker, never with a user-supplied host outside COVER_HOSTS. */
export async function fetchCover(url,fetcher=fetch){
  const u=new URL(url);if(!COVER_HOSTS.includes(u.hostname))return null;
  const res=await fetcher(u.href,{redirect:'follow'});if(!res.ok)return null;
  const type=(res.headers.get('content-type')||'').split(';')[0];if(!/^image\/(jpeg|png|webp)$/.test(type))return null;
  const buf=new Uint8Array(await res.arrayBuffer());if(buf.length>MAX_COVER_CHARS*.74)return null;
  let s='';for(let i=0;i<buf.length;i+=8192)s+=String.fromCharCode(...buf.subarray(i,i+8192));
  return `data:${type};base64,${btoa(s)}`;
}

/** Popularity from real signals only: reads, finishes, views of the last 30 days and the number of real ratings. */
export const popularity=(s,ratings)=>Math.round(((s.reads||0)*3+(s.finishes||0)*6+(s.views||0)*.5+(ratings||0)*4)*10)/10;
