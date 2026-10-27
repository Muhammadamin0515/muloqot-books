const HEAD=/^\s*(?:#+\s*(.+)|(?:глава|часть|bob|qism|chapter)\s*[\dIVXLC]*\s*[.:\-—]?\s*(.*)|[\dIVXLC]+\s*[-.]?\s*(?:bob|qism|глава|часть)\s*[.:\-—]?\s*(.*))\s*$/i;
/** Splits a plain-text manuscript into chapters [{t,p:[paragraph]}]. */
export function parseManuscript(text){
  const lines=String(text).replace(/\r/g,'').split('\n');
  const chapters=[];let cur=null;let buf=[];
  const flush=()=>{if(!cur)return;const joined=buf.join('\n').trim();const paras=(/\n\s*\n/.test(joined)?joined.split(/\n\s*\n/):joined.split('\n')).map(s=>s.replace(/\s*\n\s*/g,' ').trim()).filter(Boolean);if(paras.length)cur.p=paras,chapters.push(cur);buf=[]};
  for(const ln of lines){
    const m=ln.length<90&&HEAD.exec(ln);
    if(m){flush();cur={t:(m[1]||m[2]||m[3]||ln).trim()||`Глава ${chapters.length+1}`,p:[]}}
    else{if(!cur)cur={t:'',p:[]};buf.push(ln)}
  }
  flush();
  if(chapters.length===1&&!chapters[0].t&&chapters[0].p.length>16){const all=chapters[0].p;chapters.length=0;for(let i=0;i<all.length;i+=12)chapters.push({t:'',p:all.slice(i,i+12)})}
  return chapters.map((c,i)=>({t:c.t||`Глава ${i+1}`,p:c.p}));
}
