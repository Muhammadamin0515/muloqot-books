import {readZip} from './zip.js';
/* Reads the text of a .docx in the browser (a .docx is a zip with word/document.xml).
   Headings become "# Title" lines and paragraphs are separated by blank lines, which the server splits into chapters. */
export async function docxToText(buf){
  const doc=(await readZip(buf)).get('word/document.xml');
  if(!doc)throw new Error('no document.xml');
  return xmlToText(new TextDecoder().decode(await doc.read()));
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
