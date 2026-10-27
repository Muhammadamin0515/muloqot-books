/* Turns one RusLit .txt file into structured chapters without inventing anything: titles, authors and chapter names come from the file.
   Pure functions (no I/O) so they can be unit-tested. Bump PREP_VERSION whenever the output for the same input can change. */
import {createHash} from 'node:crypto';

export const PREP_VERSION='ruslit-prep-1';
export const CHUNK_CHARS=150_000;      // one D1 row stays far below the 2 MB row limit
export const SPLIT_OVER=120_000;       // a heading-less section longer than this is cut into technical fragments for lazy loading
export const FRAGMENT=60_000;
export const VERSE_BLOCK=16;           // poems without blank lines between stanzas are cut into blocks of at most this many lines

export const sha256=s=>createHash('sha256').update(s).digest('hex');
const CYR=/[Ѐ-ӿ]/g;

/** Decodes bytes: UTF-8 first, windows-1251 as a flagged fallback (accepted only if the result is mostly Cyrillic). */
export function decode(buf){
  if(buf.includes(0))return{error:'binary'};
  try{return{text:new TextDecoder('utf-8',{fatal:true}).decode(buf).replace(/^\uFEFF/,''),encoding:'utf-8'}}catch{}
  const t=new TextDecoder('windows-1251').decode(buf),letters=(t.match(/\p{L}/gu)||[]).length||1;
  if((t.match(CYR)||[]).length/letters>.6)return{text:t,encoding:'windows-1251',note:'file was not valid UTF-8; decoded as windows-1251'};
  return{error:'encoding'};
}

const norm=s=>String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}]+/gu,' ').trim();
const ROMAN=/^[IVXLCDM]{1,8}\.?$/;
const WORDHEAD=/^(часть|глава|книга|том|действие|явление|песнь|песня|эпилог|пролог|предисловие|послесловие|примечания|комментарии|посвящение|эпиграф)(?=[\s.:,—-]|$)[^.!?]{0,60}$/i;
/* Inside verse a line that merely starts with "Глава" or "Песня" is text, so poems accept only ordinal forms ("Глава первая", "Часть II") */
const STRICT=/^(глава|часть|книга|песнь|песня|действие|явление|эпилог|пролог|предисловие|послесловие|примечания|комментарии|посвящение|эпиграф)(\s+([ivxlcdm]+|\d{1,3}|[а-яё]+(?:ая|ья|ое|ий|ый|ой|яя|ье)))?\.?$/i;
const NOTES=/^(примечания|комментарии)\.?$/i;

const CTRL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const LS=String.fromCharCode(0x2028),PS=String.fromCharCode(0x2029),SHY=String.fromCharCode(0xad),NBSP=String.fromCharCode(0xa0);
function cleanLines(text){
  return text.replace(/\r\n?/g,'\n').replace(CTRL,'').split(SHY).join('').split(LS).join('\n').split(PS).join('\n').split('\n').map(l=>l.split('\t').join(' ').split(NBSP).join(' ').replace(/\s+$/,'').replace(/^\s+/,''));
}
/** Removes the author and title lines that RusLit puts at the top of many files (only lines that repeat known metadata). */
function stripHeader(lines,{title,author}){
  const known=new Set([norm(title),norm(author)].filter(Boolean));
  const sur=norm(author).split(' ').pop();
  const isAuthorLine=n=>sur&&n.split(' ').length<=4&&n.split(' ').includes(sur);
  let i=0,removed=0;
  while(i<lines.length&&removed<4){
    if(!lines[i]){i++;continue}
    const n=norm(lines[i]);
    if(known.has(n)||isAuthorLine(n)||(norm(title)&&n===norm(title).replace(/\s*\d+$/,''))){removed++;i++}else break;
  }
  return removed?lines.slice(i):lines;
}

/** Splits lines (blank lines included) into chapters. Returns {chapters:[{t,lines}], structure}. */
function splitChapters(lines,title,kind){
  const filled=lines.filter(Boolean);
  // numeric-only headings are accepted only when they form an increasing sequence (footnote numbers and years do not)
  const nums=filled.filter(l=>/^\d{1,3}\.?$/.test(l)).map(l=>parseInt(l)),inc=nums.length>=2&&nums.filter((n,k)=>k&&n>nums[k-1]).length>=.8*(nums.length-1);
  const isHead=l=>l.length<=70&&((kind==='poems'?STRICT.test(l):WORDHEAD.test(l)&&!/[,;]$/.test(l))||(kind!=='poems'&&ROMAN.test(l))||(inc&&/^\d{1,3}\.?$/.test(l)));
  const out=[];let cur=null,part='',notes=false;
  const open=t=>{cur={t,lines:[]};out.push(cur)};
  for(const l of lines){
    if(!l){if(cur)cur.lines.push('');continue}
    if(!notes&&isHead(l)){
      if(NOTES.test(l)){notes=true;part='';open(l.replace(/\.$/,''));continue}
      const isPart=WORDHEAD.test(l)&&!/^(глава)\b/i.test(l);
      if(isPart){part=l;
        if(cur&&cur.partOnly){cur.t=l;continue}
        open(l);cur.partOnly=true;continue}
      if(cur&&cur.partOnly){cur.t=part?`${part}. ${l}`:l;cur.partOnly=false;continue}
      open(part&&!/^часть/i.test(l)?`${part}. ${l}`:l);continue;
    }
    if(!cur)open('');
    if(cur.partOnly)cur.partOnly=false;
    cur.lines.push(l);
  }
  const real=out.filter(c=>c.lines.some(Boolean));
  if(real.length<2)return{chapters:[{t:title,lines}],structure:'single'};
  // text before the first heading (epigraph, dedication) stays with the first chapter instead of becoming an invented section
  if(real[0].t==='')real[0].t=title;
  return{chapters:real,structure:'headings'};
}

/** Lines of one chapter to paragraphs. Prose: every non-empty line is a paragraph. Poems: blank lines separate stanzas and line breaks are kept. */
function toParas(lines,kind,{notes}={}){
  if(kind!=='poems'){
    const src=lines.filter(Boolean),out=[];
    for(let i=0;i<src.length;i++){
      let l=src[i].replace(/ {2,}/g,' ');
      if(notes&&/^\d{1,3}$/.test(l)&&src[i+1])l=`${l}. ${src[++i].replace(/ {2,}/g,' ')}`;
      out.push(l);
    }
    return out;
  }
  const out=[];let buf=[];
  const flush=()=>{while(buf.length)out.push(buf.splice(0,VERSE_BLOCK).join('\n'))};
  for(const l of lines){if(!l)flush();else buf.push(l.replace(/ {2,}/g,' '))}
  flush();return out;
}

/** Main entry. text is the decoded file. kind: 'prose' | 'poems' | 'publicism' (the source folder). */
export function prepareText(text,{title,author,kind='prose',dropNotes=false}={}){
  const lines=stripHeader(cleanLines(text),{title,author});
  const {chapters,structure}=splitChapters(lines,title,kind);
  const out=[];
  for(const c of chapters){
    if(dropNotes&&NOTES.test(c.t))continue;   // editorial notes of modern editions: optional, see docs/READING.md
    const notes=NOTES.test(c.t),paras=toParas(c.lines,notes?'prose':kind,{notes}).filter(p=>p.trim());
    if(paras.length)out.push({t:c.t,paras});
  }
  // heading-less long sections are cut into technical fragments (marked synthetic; never shown as a table of contents)
  const final=[];let synthetic=false;
  for(const c of out){
    const size=c.paras.reduce((n,p)=>n+p.length,0);
    if(size>SPLIT_OVER&&(structure==='single'||size>SPLIT_OVER*2)){
      let cur=[],n=0;const parts=[];
      for(const p of c.paras){cur.push(p);n+=p.length;if(n>=FRAGMENT){parts.push(cur);cur=[];n=0}}
      if(cur.length)parts.push(cur);
      if(parts.length>1)synthetic=true;
      parts.forEach((ps,i)=>final.push({t:parts.length>1?`${c.t||title} (${i+1}/${parts.length})`:c.t,paras:ps,synthetic:parts.length>1}));
    }else final.push({...c,synthetic:false});
  }
  const chars=final.reduce((n,c)=>n+c.paras.reduce((m,p)=>m+p.length,0),0);
  return{chapters:final,chars,structure,synthetic,dropNotes};
}

/** Quality checks. Returns {fatal?:code, issues:[code]}; fatal files are reported and skipped, issues are kept as review notes. */
export function inspect(text,prepared,{kind='prose'}={}){
  const issues=[];const letters=(text.match(/\p{L}/gu)||[]).length;
  if(!text.trim()||letters<30)return{fatal:'empty',issues,info:[]};
  if((text.match(CYR)||[]).length/Math.max(1,letters)<.5)issues.push('not_mostly_cyrillic');
  if(text.includes('\uFFFD'))issues.push('replacement_characters');
  const info=[];
  if(CTRL.test(text)){info.push('control_characters_removed');CTRL.lastIndex=0}
  if(prepared.chars<500)(kind==='poems'?info:issues).push(kind==='poems'?'short_text':'very_short');
  if(prepared.chapters.length===0)return{fatal:'no_text',issues,info:[]};
  if(prepared.structure==='single'&&prepared.chars>150_000&&!prepared.synthetic)issues.push('no_structure_detected');
  return{issues,info};
}

/** Canonical content hash and storage chunks. Chunks are JSON arrays of paragraphs, a few hundred KB at most. */
/** Content hash used for versions and verification. */
export const contentHash=(pairs,dropNotes)=>sha256(JSON.stringify(pairs)+PREP_VERSION+(dropNotes?'|nonotes':''));
export function finalize(prepared){
  const hash=contentHash(prepared.chapters.map(c=>[c.t,c.paras]),prepared.dropNotes);
  const toc=prepared.chapters.map(c=>({t:c.t,n:c.paras.reduce((m,p)=>m+p.length,0),...(c.synthetic?{s:1}:{})}));
  const chunks=[];
  prepared.chapters.forEach((c,ch)=>{
    let cur=[],n=0,seq=0;
    for(const p of c.paras){cur.push(p);n+=p.length;if(n>=CHUNK_CHARS){chunks.push({ch,seq:seq++,body:JSON.stringify(cur)});cur=[];n=0}}
    if(cur.length||!seq)chunks.push({ch,seq,body:JSON.stringify(cur)});
  });
  return{hash,version:hash.slice(0,12),toc,chunks,chars:prepared.chars,chapters:prepared.chapters.length};
}
