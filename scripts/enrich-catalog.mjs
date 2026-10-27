#!/usr/bin/env node
/* Enriches data/catalog.classics.json from legal sources and writes data/catalog.enriched.json for Admin → Каталог → «Пакетный импорт».
     Texts:  Project Gutenberg through the public Gutendex API (only when the author's death year proves public domain here)
     Covers: Open Library covers (the Worker downloads them itself; only allowed hosts are fetched)
   Usage:  node scripts/enrich-catalog.mjs [input.json] [output.json]
   NOTE: written for a machine with internet access. It was NOT executed in the development environment, where these hosts were
   blocked by the network policy; run it locally and review the output before importing. Nothing is deployed or imported by this script. */
import {readFileSync,writeFileSync} from 'node:fs';
import {PD_YEARS,MAX_TEXT_BYTES} from '../worker/catalog.js';
import {stripGutenberg} from './gutenberg.js';

const IN=process.argv[2]||new URL('../data/catalog.classics.json',import.meta.url),OUT=process.argv[3]||new URL('../data/catalog.enriched.json',import.meta.url);
const UA={'user-agent':'MuloqotBooks-catalog-enrichment/1.0 (contact: project owner)'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const now=new Date().getFullYear();
const norm=s=>String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const byteLen=t=>Buffer.byteLength(t);
const get=async(url,type='json')=>{const r=await fetch(url,{headers:UA});if(!r.ok)throw new Error(url+' → '+r.status);return type==='json'?r.json():r.text()};

async function findText(rec){
  const q=encodeURIComponent(`${rec.title} ${rec.author}`),r=await get(`https://gutendex.com/books/?search=${q}&languages=${rec.lang}`);
  const want=norm(rec.author).split(' ').pop();
  for(const b of r.results||[]){
    if(!b.authors.some(a=>norm(a.name).includes(want)))continue;
    if(norm(b.title)!==norm(rec.title)&&!norm(b.title).includes(norm(rec.title)))continue;
    const url=b.formats['text/plain; charset=utf-8']||b.formats['text/plain'];if(!url)continue;
    return{id:b.id,url};
  }
  return null;
}
async function findCover(rec){
  const r=await get(`https://openlibrary.org/search.json?title=${encodeURIComponent(rec.title)}&author=${encodeURIComponent(rec.author)}&limit=1&fields=cover_i`);
  const id=r.docs?.[0]?.cover_i;return id?`https://covers.openlibrary.org/b/id/${id}-L.jpg`:'';
}
const recs=JSON.parse(readFileSync(IN,'utf8')),out=[],report=[];
for(const rec of recs){
  const o={...rec};
  try{
    if(rec.authorDeathYear<=now-PD_YEARS){
      const hit=await findText(rec);await sleep(1000);
      if(hit){
        const text=stripGutenberg(await get(hit.url,'text'));await sleep(1000);
        if(byteLen(text)>MAX_TEXT_BYTES)report.push(`${rec.title}: text is ${(byteLen(text)/1e6).toFixed(1)} MB, over the 1.4 MB limit: split into volumes by hand`);
        else if(text.length>2000){o.text=text;o.rights={status:'public_domain',license:`Public domain (author died ${rec.authorDeathYear})`,evidenceUrl:`https://www.gutenberg.org/ebooks/${hit.id}`,note:''};o.source={name:'Project Gutenberg',url:`https://www.gutenberg.org/ebooks/${hit.id}`};report.push(`${rec.title}: text from Gutenberg #${hit.id}`)}
      }else report.push(`${rec.title}: no matching Gutenberg text, stays a card`);
    }
    o.coverUrl=await findCover(rec);await sleep(1000);
  }catch(e){report.push(`${rec.title}: ${e.message}`)}
  out.push(o);
}
writeFileSync(OUT,JSON.stringify(out,null,1));
console.log(report.join('\n'));console.log(`\nWrote ${out.length} records (${out.filter(r=>r.text).length} with text) to ${OUT}. Review before importing.`);
