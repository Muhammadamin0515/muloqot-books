/* Reads the text of a .docx in the browser (a .docx is a zip with word/document.xml).
   Headings become "# Title" lines and paragraphs are separated by blank lines, which the server splits into chapters. */
export async function docxToText(buf){
  const u8=new Uint8Array(buf),dv=new DataView(buf),dec=new TextDecoder();
  let e=-1;for(let i=u8.length-22;i>=Math.max(0,u8.length-65557);i--)if(dv.getUint32(i,true)===0x06054b50){e=i;break}
  if(e<0)throw new Error('not a zip');
  const count=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);
  for(let k=0;k<count&&dv.getUint32(p,true)===0x02014b50;k++){
    const method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),nlen=dv.getUint16(p+28,true),elen=dv.getUint16(p+30,true),clen=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true);
    if(dec.decode(u8.subarray(p+46,p+46+nlen))==='word/document.xml'){
      const start=off+30+dv.getUint16(off+26,true)+dv.getUint16(off+28,true),data=u8.subarray(start,start+csize);
      return xmlToText(dec.decode(method===0?data:await inflate(data)));
    }
    p+=46+nlen+elen+clen;
  }
  throw new Error('no document.xml');
}
async function inflate(data){
  const r=new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')));
  return new Uint8Array(await r.arrayBuffer());
}
function xmlToText(xml){
  const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',doc=new DOMParser().parseFromString(xml,'application/xml'),out=[];
  for(const p of doc.getElementsByTagNameNS(W,'p')){
    let text='';
    for(const n of p.getElementsByTagNameNS(W,'*')){const l=n.localName;if(l==='t')text+=n.textContent;else if(l==='tab')text+=' ';else if(l==='br')text+='\n'}
    text=text.replace(/[ \t]*\n[ \t]*/g,'\n').trim();if(!text)continue;
    const st=p.getElementsByTagNameNS(W,'pStyle')[0],style=st?(st.getAttributeNS(W,'val')||st.getAttribute('w:val')||''):'';
    out.push(/^(Heading\d|Title|Заголовок)/i.test(style)?'# '+text:text);
  }
  return out.join('\n\n');
}
