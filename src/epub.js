/* EPUB reader: turns a DRM-free .epub into the same "# Heading + paragraphs" text the rest of the pipeline understands. */
import {readZip,readText} from './zip.js';

const ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',mdash:'—',ndash:'–',hellip:'…',laquo:'«',raquo:'»',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',copy:'©',shy:''};
export const decodeEntities=s=>s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(m,e)=>{
  if(e[0]==='#'){const n=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):+e.slice(1);try{return String.fromCodePoint(n)}catch{return ''}}
  return ENT[e.toLowerCase()]??m});
const attr=(tag,name)=>{const m=new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`,'i').exec(tag);return m?decodeEntities(m[2]??m[3]):''};
const first=(xml,tag)=>{const m=new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`,'i').exec(xml);return m?decodeEntities(m[1].replace(/<[^>]+>/g,'')).replace(/\s+/g,' ').trim():''};
const dirOf=p=>p.includes('/')?p.slice(0,p.lastIndexOf('/')+1):'';
const resolve=(base,href)=>{const parts=(base+href.split('#')[0]).split('/'),out=[];for(const x of parts){if(x==='..')out.pop();else if(x&&x!=='.')out.push(decodeURIComponent(x))}return out.join('/')};

/** XHTML to lines. Headings become "# title" (first one is also returned), blocks become paragraphs. */
export function htmlToBlocks(html){
  let h=html.replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  const body=/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(h);if(body)h=body[1];
  const out=[];
  h=h.replace(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi,(m,l,t)=>{out.push({h:decodeEntities(t.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim()});return '\u0001'+(out.length-1)+'\u0001'});
  const blocks=h.split(/<\/?(?:p|div|li|blockquote|section|tr|br|hr|h[4-6]|pre|table|ul|ol)\b[^>]*>/i);
  const res=[];
  for(const b of blocks){
    const m=/\u0001(\d+)\u0001/.exec(b);
    if(m){const pre=b.slice(0,m.index),post=b.slice(m.index+m[0].length);const t0=clean(pre);if(t0)res.push({p:t0});res.push(out[+m[1]]);const t1=clean(post);if(t1)res.push({p:t1});continue}
    const t=clean(b);if(t)res.push({p:t});
  }
  return res.filter(x=>x.p||x.h);
}
const clean=s=>decodeEntities(s.replace(/<[^>]+>/g,'')).replace(/[ \t\r\n ]+/g,' ').trim();

export async function epubToBook(buf){
  const files=readZip(buf);
  const enc=await readText(files,'META-INF/encryption.xml');
  if(enc&&/<(?:\w+:)?EncryptedData/i.test(enc)&&!/fontobfuscation|font-obfuscation|ofl|idpf\.org\/2008\/embedding/i.test(enc))throw Object.assign(new Error('drm'),{code:'drm'});
  const cont=await readText(files,'META-INF/container.xml');if(!cont)throw Object.assign(new Error('not an epub'),{code:'epub'});
  const rootPath=attr(/<rootfile\b[^>]*>/i.exec(cont)?.[0]||'','full-path');
  const opf=await readText(files,rootPath);if(!opf)throw Object.assign(new Error('no opf'),{code:'epub'});
  const base=dirOf(rootPath);
  const manifest={};for(const m of opf.matchAll(/<item\b[^>]*>/gi)){manifest[attr(m[0],'id')]={href:attr(m[0],'href'),type:attr(m[0],'media-type'),props:attr(m[0],'properties')}}
  const spine=[...opf.matchAll(/<itemref\b[^>]*>/gi)].filter(m=>attr(m[0],'linear')!=='no').map(m=>manifest[attr(m[0],'idref')]).filter(x=>x&&/html|xml/.test(x.type));
  /* chapter names from the table of contents (EPUB3 nav or EPUB2 ncx) */
  const toc={};
  const nav=Object.values(manifest).find(x=>/\bnav\b/.test(x.props)),ncx=Object.values(manifest).find(x=>x.type==='application/x-dtbncx+xml');
  if(nav){const x=await readText(files,resolve(base,nav.href));if(x)for(const m of x.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){const href=attr(m[1],'href');if(href)toc[resolve(dirOf(resolve(base,nav.href)),href)]??=clean(m[2])}}
  else if(ncx){const x=await readText(files,resolve(base,ncx.href));if(x)for(const m of x.matchAll(/<navPoint\b[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<content\b([^>]*)>/gi))toc[resolve(dirOf(resolve(base,ncx.href)),attr(m[2],'src'))]??=clean(m[1])}
  const lines=[];let chars=0;
  for(const it of spine){
    const path=resolve(base,it.href),html=await readText(files,path);if(!html)continue;
    const blocks=htmlToBlocks(html),text=blocks.filter(b=>b.p).map(b=>b.p).join('');
    if(text.length<40&&!blocks.some(b=>b.h))continue;
    const tocTitle=toc[path];
    if(!blocks.some(b=>b.h)&&tocTitle&&text.length>=150)lines.push('# '+tocTitle);
    for(const b of blocks){lines.push(b.h?'# '+b.h:b.p);chars+=(b.p||'').length}
  }
  const text=lines.join('\n\n');
  if(chars<200)throw Object.assign(new Error('empty epub'),{code:'scan'});
  return{text,meta:{title:first(opf,'title'),author:first(opf,'creator'),lang:first(opf,'language').slice(0,2).toLowerCase(),description:first(opf,'description')}};
}
export const epubToText=async buf=>(await epubToBook(buf)).text;
