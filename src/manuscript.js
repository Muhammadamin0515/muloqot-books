/* Reading a manuscript file and describing what the platform will make of it. */
import {parseManuscript} from '../worker/parse.js';
import {docxToText} from './docx.js';

export const MAX_FILE=25*1024*1024,MAX_TEXT_BYTES=1_400_000;
export const textBytes=t=>new TextEncoder().encode(t).length;

/* .txt files from Windows are often windows-1251, not UTF-8 */
function decodeText(buf){
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buf).replace(/^﻿/,'')}catch(e){return new TextDecoder('windows-1251').decode(buf)}
}
/** Reads a file and returns {text, meta}; meta (title, author, language, description) is filled for .epub only. */
export async function readManuscriptFull(file,onProgress){
  if(/\.epub$/i.test(file.name)){const {epubToBook}=await import('./epub.js');return epubToBook(await file.arrayBuffer())}
  return{text:await readManuscript(file,onProgress),meta:{}};
}
export async function readManuscript(file,onProgress){
  const name=file.name.toLowerCase();
  if(/\.(doc|rtf|odt|fb2|mobi|azw3?)$/.test(name))throw Object.assign(new Error('format'),{code:'format'});
  const buf=await file.arrayBuffer();
  if(name.endsWith('.docx'))return docxToText(buf);
  if(name.endsWith('.pdf'))return (await import('./pdf.js')).pdfToText(buf,onProgress);
  return decodeText(buf);
}
export function detectLang(text){
  const letters=(text.slice(0,30000).match(/\p{L}/gu)||[]).length||1,cyr=(text.slice(0,30000).match(/[Ѐ-ӿ]/g)||[]).length;
  return cyr/letters>.5?'ru':'uz';
}
export const titleFromFile=name=>{const t=name.replace(/\.[a-z0-9]+$/i,'').replace(/[_]+/g,' ').replace(/\s+/g,' ').trim();return t?t[0].toUpperCase()+t.slice(1):''};
export function analyze(text){
  const ch=parseManuscript(text),chars=ch.reduce((n,c)=>n+c.p.join('').length,0),words=(text.match(/\S+/g)||[]).length;
  const named=ch.filter(c=>!/^Глава \d+$/.test(c.t)).length;
  const warn=[];
  if(ch.length===1&&chars>25000)warn.push('onechapter');
  if(ch.length>1&&named===0&&!/(^|\n)\s*(#|глава|часть|bob|qism|chapter)/i.test(text))warn.push('autosplit');
  const tiny=ch.filter(c=>c.p.join('').length<300).length;if(tiny>2&&tiny>ch.length*.3)warn.push('tiny');
  return{chapters:ch.map(c=>({t:c.t,paras:c.p.length,chars:c.p.join('').length})),chars,words,pages:Math.max(1,Math.round(chars/1800)),warn};
}
