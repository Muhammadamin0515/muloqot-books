/* Discovers RusLit works, matches metadata and prepares every file (no network, no database). Used by the dry-run and by the importer. */
import {readdirSync,readFileSync,statSync,existsSync} from 'node:fs';
import {join,relative,sep,basename,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {decode,prepareText,inspect,finalize,PREP_VERSION} from './prepare.js';

const AUTHORS=(()=>{try{const j=JSON.parse(readFileSync(new URL('../../data/ruslit/authors.json',import.meta.url),'utf8'));delete j._comment;return j}catch{return {}}})();
export const SOURCE_NAME='RusLit (d0rj/RusLit)',SOURCE_REPO='https://github.com/d0rj/RusLit';
export const KINDS={prose:'prose',poems:'poetry',publicism:'publicism'};   // folder → catalog genre (taken from the source structure, not guessed)
const sha1=s=>createHash('sha1').update(s).digest('hex');
const nfc=s=>String(s).normalize('NFC');
const nk=s=>nfc(s).toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function lev(a,b){const m=a.length,n=b.length;let p=Array.from({length:n+1},(_,j)=>j);for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[n]}
/** Matches a file name to an info.csv entry that no file claims: same text after normalisation, or at most two letters of difference, and only if exactly one entry qualifies. */
export function fuzzyCsv(stem,free){
  const k=nk(stem),cand=[...free].filter(n=>{const x=nk(n);return x===k||k.startsWith(x)||x.startsWith(k)&&Math.abs(x.length-k.length)<=3||lev(x,k)<=2});
  return cand.length===1?cand[0]:null;
}

export function walk(dir){
  const out=[];
  for(const e of readdirSync(dir,{withFileTypes:true})){
    if(e.name.startsWith('.'))continue;
    const p=join(dir,e.name);
    if(e.isDirectory())out.push(...walk(p));else out.push(p);
  }
  return out.sort();
}
/** Small CSV reader (quotes, commas inside quotes). */
export function parseCsv(text){
  const rows=[];let row=[],cur='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cur+='"';i++}else q=false}else cur+=c}
    else if(c==='"')q=true;else if(c===','){row.push(cur);cur=''}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cur);cur='';if(row.some(x=>x!==''))rows.push(row);row=[]}
    else cur+=c;
  }
  if(cur||row.length){row.push(cur);rows.push(row)}
  return rows;
}
export function parseYear(raw){
  const m=/^\s*(\d{4})(?:\s*-\s*(\d{4}))?\s*$/.exec(raw||'');
  if(!m)return{year:null,yearRaw:raw||'',valid:false};
  const y=+m[1];return{year:y>=800&&y<=2100?y:null,yearRaw:raw,valid:y>=800&&y<=2100};
}
const NAMEWORD=/^(?:[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?|[А-ЯЁ]\.)$/;
/** A first line of a file counts as an author name only if it looks like one (2-4 capitalised words or initials). */
export const looksLikeName=l=>{const w=String(l||'').trim().split(/\s+/);return w.length>=2&&w.length<=4&&w.every(x=>NAMEWORD.test(x))&&l.length<=60};
const firstLine=t=>{for(const l of t.split(/\r?\n/)){const s=l.trim();if(s)return s}return ''};

/** Reads the source tree. Returns {files:[{abs,rel,kind,authorDir,stem,layoutOk}], csv:{dir→Map(name→yearRaw)}, ignored:[rel]}. */
export function discover(root){
  const files=[],ignored=[],csv={};
  for(const abs of walk(root)){
    const rel=relative(root,abs).split(sep).join('/');
    if(/\.txt$/i.test(rel)&&!/^readme/i.test(basename(rel))){
      const parts=rel.split('/');
      files.push({abs,rel,kind:parts.length===3?parts[0]:null,authorDir:parts.length===3?parts[1]:null,stem:basename(rel).replace(/\.txt$/i,''),layoutOk:parts.length===3&&parts[0] in KINDS});
    }else if(/(^|\/)info\.csv$/i.test(rel)){
      const dir=rel.replace(/\/?info\.csv$/i,''),m=new Map();
      const rows=parseCsv(readFileSync(abs,'utf8').replace(/^﻿/,''));
      rows.forEach((r,i)=>{if(i===0&&/^name$/i.test(r[0]||''))return;if(r[0])m.set(nfc(r[0].trim()),(r[1]||'').trim())});
      csv[dir]=m;
    }else ignored.push(rel);
  }
  return{files,csv,ignored};
}

/** Prepares every work. onFile(record) is called as each file is finished (for progress); errors never stop the scan. */
export function scan(root,{commit='unknown',limit=0,onFile,dropNotes=false}={}){
  const {files,csv,ignored}=discover(root);
  const texts=new Map(),firsts={};
  const list=limit?files.slice(0,limit):files;
  // pass 1: decode and read the header line of every file to vote for the author of each folder
  for(const f of list){
    const buf=readFileSync(f.abs),d=decode(buf);texts.set(f.rel,d);
    if(d.text&&f.authorDir){const l=firstLine(d.text);if(looksLikeName(l))(firstsFor(firsts,f.authorDir)).push(l)}
  }
  const dirAuthor={};
  for(const [dir,arr] of Object.entries(firsts)){
    const tally={};arr.forEach(a=>tally[a]=(tally[a]||0)+1);
    const [best,n]=Object.entries(tally).sort((a,b)=>b[1]-a[1])[0]||[];
    const total=list.filter(f=>f.authorDir===dir).length;
    if(best&&n>=2&&n/total>=.5)dirAuthor[dir]={name:best,votes:n,total};
  }
  const records=[],errors=[],seenHash=new Map(),byTitle=new Map();
  // info.csv entries not claimed by an exact file name, per folder: candidates for a careful fuzzy match
  const free={};
  for(const [dir,m] of Object.entries(csv))free[dir]=new Set([...m.keys()].filter(n=>!list.some(f=>(f.kind?`${f.kind}/${f.authorDir}`:'')===dir&&nfc(f.stem)===n)));
  for(const f of list){
    const rec={sourceId:sha1('ruslit|'+nfc(f.rel)),path:f.rel,kind:f.kind,review:[],info:[],status:'ok'};
    try{
      const d=texts.get(f.rel);if(d.error)throw Object.assign(new Error(d.error),{code:d.error});
      const dirKey=f.kind?`${f.kind}/${f.authorDir}`:'';
      const csvMap=csv[dirKey];const stem=nfc(f.stem);
      const title=stem;let year=null,yearRaw='';
      let csvName=csvMap&&csvMap.has(stem)?stem:null;
      if(!csvName&&csvMap){const fz=fuzzyCsv(stem,free[dirKey]||new Set());if(fz){csvName=fz;free[dirKey].delete(fz);rec.review.push(`csv_name_fuzzy_match:${fz}`)}}
      if(csvName){const y=parseYear(csvMap.get(csvName));year=y.year;yearRaw=y.yearRaw;if(!y.valid)rec.info.push('year_invalid_or_missing')}
      else{rec.review.push(csvMap?'not_in_info_csv':'no_info_csv');rec.info.push('year_unknown')}
      if(!f.layoutOk)rec.review.push('unexpected_folder_layout');
      // author: curated folder mapping first (checked against the file header), then the folder's header majority, then the folder name
      const own=looksLikeName(firstLine(d.text))?firstLine(d.text):'';
      const map=AUTHORS[f.authorDir],da=dirAuthor[f.authorDir];let author='',authorSource='';
      if(map){author=map.name;authorSource='folder_mapping';
        const sur=x=>x.split(/\s+/).pop().toLowerCase().replace(/ё/g,'е');
        if(own&&sur(own)!==sur(map.name))rec.review.push(`author_header_conflict:${own}`);else if(own&&own!==map.name)rec.info.push(`author_name_variant:${own}`)}
      else if(da){author=da.name;authorSource='folder_header_majority';rec.review.push('author_not_in_curated_mapping')}
      else if(own){author=own;authorSource='file_header';rec.review.push('author_single_vote')}
      else{author=f.authorDir||'';authorSource='folder_name';rec.review.push('author_unresolved_folder_name_used')}
      const prepared=prepareText(d.text,{title,author,kind:f.kind||'prose',dropNotes});
      const ins=inspect(d.text,prepared,{kind:f.kind||'prose'});if(ins.fatal)throw Object.assign(new Error(ins.fatal),{code:ins.fatal});
      rec.review.push(...ins.issues);rec.info.push(...ins.info);
      if(d.encoding!=='utf-8')rec.review.push('encoding:'+d.encoding);
      const fin=finalize(prepared);
      const series=/^(.+?)\.\s*Том\s+(\d+)\s*$/i.exec(title);
      Object.assign(rec,{id:'rl'+sha1('ruslit|'+nfc(f.rel)).slice(0,10),title,author,authorSource,authorDeathYear:map?.deathYear||null,year,yearRaw,lang:'ru',genre:KINDS[f.kind]||'prose',format:'txt',encoding:d.encoding,
        series:series?series[1]:'',seriesNo:series?+series[2]:null,hash:fin.hash,version:fin.version,prepVersion:PREP_VERSION,chars:fin.chars,chapters:fin.chapters,structure:prepared.structure,synthetic:prepared.synthetic,
        sourceName:SOURCE_NAME,sourceRepo:SOURCE_REPO,sourceCommit:commit,
        sourceUrl:`${SOURCE_REPO}/blob/${commit}/${f.rel.split('/').map(encodeURIComponent).join('/')}`,rawUrl:`https://raw.githubusercontent.com/d0rj/RusLit/${commit}/${f.rel.split('/').map(encodeURIComponent).join('/')}`,
        toc:fin.toc,chunks:fin.chunks});
      if(seenHash.has(fin.hash)){rec.dupOf=seenHash.get(fin.hash);rec.status='duplicate'}else seenHash.set(fin.hash,rec.id);
      const tk=nfc(title).toLowerCase()+'|'+author;if(!rec.dupOf){if(byTitle.has(tk)){rec.possibleDuplicate=byTitle.get(tk);rec.review.push('possible_duplicate_title')}else byTitle.set(tk,rec.id)}
      if(rec.status==='ok'&&rec.review.length)rec.status='needs_review';
    }catch(e){rec.status='error';rec.error=e.code||e.message;errors.push({path:f.rel,error:rec.error})}
    records.push(rec);if(onFile)onFile(rec);
  }
  const csvOrphans=[];
  if(!limit)  for(const [dir,m] of Object.entries(csv))for(const name of m.keys()){
    const claimed=records.some(r=>(r.path.split('/').slice(0,2).join('/'))===dir&&(nfc(r.path.split('/').pop().replace(/\.txt$/i,''))===name||(r.review||[]).includes('csv_name_fuzzy_match:'+name)));
    if(!claimed)csvOrphans.push(`${dir}/${name}`)}
  return{records,errors,ignored,csvOrphans,files:files.length,authors:dirAuthor};
}
const firstsFor=(o,k)=>o[k]||(o[k]=[]);

export const summarize=(res)=>{
  const c={};for(const r of res.records)c[r.status]=(c[r.status]||0)+1;
  const chars=res.records.filter(r=>r.chars).reduce((n,r)=>n+r.chars,0);
  return{filesFound:res.files,processed:res.records.length,byStatus:c,exactDuplicates:res.records.filter(r=>r.dupOf).length,possibleDuplicates:res.records.filter(r=>r.possibleDuplicate).length,errors:res.errors.length,
    csvOrphans:res.csvOrphans.length,ignoredFiles:res.ignored.length,totalChars:chars,uniqueContentHashes:new Set(res.records.filter(r=>r.hash).map(r=>r.hash)).size};
};
/** Report-safe copy of a record: no text. */
export const brief=r=>{const {chunks,toc,...rest}=r;return rest};
