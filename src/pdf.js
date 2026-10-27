/* Text extraction from PDF files (pdf.js is loaded only when a PDF is chosen).
   Lines are rebuilt into paragraphs; page numbers and repeated headers/footers are dropped. */
const END=/[.!?…»"”)\]]$/;
const CHAPTER=/^(глава|часть|bob|qism|chapter|пролог|эпилог|prolog|epilog)\b/i;
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:0};

function toLines(items){
  const its=items.filter(i=>i.str&&i.str.trim()).map(i=>({s:i.str,x:i.transform[4],y:i.transform[5],h:i.height||Math.abs(i.transform[3])||10,w:i.width||0}));
  its.sort((a,b)=>b.y-a.y||a.x-b.x);
  const lines=[];
  for(const it of its){
    const last=lines[lines.length-1];
    if(last&&Math.abs(last.y-it.y)<=Math.max(2,it.h*.5))last.items.push(it);else lines.push({y:it.y,h:it.h,items:[it]});
  }
  return lines.map(l=>{
    l.items.sort((a,b)=>a.x-b.x);let t='',prev=null;
    for(const it of l.items){if(prev&&it.x-(prev.x+prev.w)>l.h*.25&&!t.endsWith(' ')&&!it.s.startsWith(' '))t+=' ';t+=it.s;prev=it}
    const first=l.items[0],lastIt=l.items[l.items.length-1];
    return{text:t.replace(/­/g,'').replace(/\s+/g,' ').trim(),y:l.y,h:l.h,x:first.x,xr:lastIt.x+lastIt.w};
  }).filter(l=>l.text);
}
const key=t=>t.replace(/\d+/g,'#').toLowerCase();
const isPageNo=t=>/^[-–—\s]*\d{1,4}[-–—\s]*$/.test(t);

export async function pdfToText(buf,onProgress){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc=(await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  const doc=await pdfjs.getDocument({data:new Uint8Array(buf),isEvalSupported:false,useSystemFonts:true}).promise;
  const pages=[];
  for(let n=1;n<=doc.numPages;n++){
    const page=await doc.getPage(n);pages.push(toLines((await page.getTextContent()).items));
    if(onProgress)onProgress(n,doc.numPages);
  }
  /* repeated running headers / footers */
  const counts=new Map(),need=Math.max(3,Math.ceil(pages.length*.4));
  for(const ls of pages){const edge=new Set();if(ls.length){edge.add(key(ls[0].text));edge.add(key(ls[ls.length-1].text))}edge.forEach(k=>counts.set(k,(counts.get(k)||0)+1))}
  const clean=pages.map(ls=>ls.filter((l,i)=>{const edge=i===0||i===ls.length-1;return!(edge&&(isPageNo(l.text)||counts.get(key(l.text))>=need))}));
  const paras=[];let cur='',prevLine=null,pageNo=0;
  const flush=()=>{if(cur.trim())paras.push(cur.trim());cur='';};
  for(const ls of clean){
    pageNo++;if(!ls.length)continue;
    const gaps=[];for(let i=1;i<ls.length;i++)gaps.push(ls[i-1].y-ls[i].y);
    const med=median(gaps)||ls[0].h*1.3,minX=Math.min(...ls.map(l=>l.x)),maxR=Math.max(...ls.map(l=>l.xr));
    ls.forEach((l,i)=>{
      const isChap=CHAPTER.test(l.text)&&l.text.length<80;
      let brk=false;
      if(!cur)brk=true;
      else if(i===0){/* a new page continues the paragraph unless it clearly starts a new one */brk=END.test(cur)&&!/^[a-zа-яёʻ’']/.test(l.text)}
      else{
        const gap=ls[i-1].y-l.y,p=ls[i-1];
        if(gap>med*1.45)brk=true;
        else if(l.x>minX+l.h*1.1&&END.test(p.text))brk=true;
        else if(p.xr<maxR-l.h*3&&END.test(p.text))brk=true;
      }
      if(isChap||(prevLine&&CHAPTER.test(prevLine.text)&&prevLine.text.length<80&&cur===prevLine.text))brk=true;
      if(brk){flush();cur=l.text}
      else if(/[-‐]$/.test(cur)&&/^[a-zа-яёʻ’']/.test(l.text))cur=cur.slice(0,-1)+l.text;
      else cur+=' '+l.text;
      prevLine=l;
    });
  }
  flush();
  const text=paras.join('\n\n');
  if(text.replace(/\s/g,'').length<200)throw Object.assign(new Error('scan'),{code:'scan'});
  return text;
}
