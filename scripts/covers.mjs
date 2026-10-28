#!/usr/bin/env node
/* Draws a cover (the same artwork the app shows) for every imported book that has none, as a JPEG, and uploads it.
     node scripts/covers.mjs --target local|URL [--allow-remote] [--limit N]
   Telegram link previews and shared cards need a real picture; the in-app artwork is SVG. Needs IMPORT_TOKEN. */
import sharp from 'sharp';
import {existsSync,readFileSync} from 'node:fs';
import {coverSvg} from '../src/art.js';

const argv=process.argv.slice(2),opt=(n,d)=>{const i=argv.indexOf('--'+n);return i>=0&&argv[i+1]&&!argv[i+1].startsWith('--')?argv[i+1]:d};
const t=opt('target');if(!t){console.error('--target local|URL is required');process.exit(2)}
const url=(t==='local'?process.env.LOCAL_URL||'http://localhost:8787':t).replace(/\/$/,''),host=new URL(url).hostname;
if(!['localhost','127.0.0.1'].includes(host)&&!argv.includes('--allow-remote')){console.error('Refusing a non-local target without --allow-remote');process.exit(2)}
let token=process.env.IMPORT_TOKEN||'';
if(!token&&existsSync('.dev.vars')){const m=/^IMPORT_TOKEN=(.*)$/m.exec(readFileSync('.dev.vars','utf8'));if(m)token=m[1].trim().replace(/^["']|["']$/g,'')}
if(!token){console.error('IMPORT_TOKEN is not set');process.exit(2)}
const call=async(path,method='GET',body)=>{
  for(let i=0;i<4;i++){
    const r=await fetch(url+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body&&JSON.stringify(body)});
    if(r.ok)return r.json();
    if(r.status<500&&r.status!==429)throw new Error(`${path} → ${r.status}`);
    await new Promise(r=>setTimeout(r,1500*(i+1)));
  }
  throw new Error(path+' failed');
};
/* Fonts of the app are not installed on the runner: fall back to ones that have Cyrillic. */
const fix=svg=>svg.replace(/font-family="Prata,Georgia,serif"/g,'font-family="DejaVu Serif,Liberation Serif,serif"').replace(/font-family="Manrope,sans-serif"/g,'font-family="DejaVu Sans,Liberation Sans,sans-serif"');
const list=(await call('/api/import/covers')).books.slice(0,+opt('limit',0)||1e9);
console.log(`${list.length} books without a cover`);
let ok=0,fail=0;
for(const b of list){
  try{
    const svg=fix(coverSvg({id:b.id,title:b.title,authorName:b.authorName,motif:b.motif,pal:b.pal},false));
    let q=72,buf;
    do{buf=await sharp(Buffer.from(svg),{density:144}).resize(300,450).jpeg({quality:q,mozjpeg:true}).toBuffer();q-=10}while(buf.length*4/3>64000&&q>20);
    await call('/api/import/cover','POST',{id:b.id,img:'data:image/jpeg;base64,'+buf.toString('base64')});ok++;
  }catch(e){fail++;console.log('failed',b.id,e.message)}
}
console.log(`covers: ${ok} uploaded, ${fail} failed`);
process.exit(fail?1:0);
