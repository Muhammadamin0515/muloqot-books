/* Catalog search: Russian and Uzbek (Cyrillic and Latin) spellings are compared on one canonical key, typos are tolerated. */
const CYR={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'j',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'s',ч:'ch',ш:'sh',щ:'sh',ъ:'',ы:'i',ь:'',э:'e',ю:'yu',я:'ya',ў:'u',қ:'k',ғ:'g',ҳ:'h'};
/** Lower case, no diacritics, no Uzbek apostrophes ("Oʻ", "G‘", "’"), ё=е. */
export const fold=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[ʻʼ‘’`'´ʹʽ]/g,'').replace(/ё/g,'е');
/** Same word in Cyrillic or Latin, ru or uz, lands on the same key: "Навоий" = "Navoiy", "Чехов" = "Chexov". */
export function key(s){
  let t=fold(s).replace(/[а-яёўқғҳ]/g,c=>CYR[c]??c);
  t=t.replace(/zh/g,'j').replace(/x/g,'h').replace(/q/g,'k').replace(/w/g,'v').replace(/ts/g,'s').replace(/yo/g,'e').replace(/shch/g,'sh').replace(/ey|iy|yy|ij/g,'i').replace(/y(?=$)/g,'i').replace(/c(?!h)/g,'k');
  return t.replace(/([a-z])\1+/g,'$1').replace(/[^a-z0-9]+/g,' ').trim();
}
const words=s=>fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
/** Damerau-Levenshtein distance with an early exit above `max`. */
export function dist(a,b,max=2){
  if(a===b)return 0;if(Math.abs(a.length-b.length)>max)return max+1;
  const n=a.length,m=b.length;let p2=null,p1=Array.from({length:m+1},(_,j)=>j);
  for(let i=1;i<=n;i++){const cur=[i];let lo=i;
    for(let j=1;j<=m;j++){let v=Math.min(p1[j]+1,cur[j-1]+1,p1[j-1]+(a[i-1]===b[j-1]?0:1));
      if(p2&&i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])v=Math.min(v,p2[j-2]+1);cur[j]=v;lo=Math.min(lo,v)}
    if(lo>max)return max+1;p2=p1;p1=cur}
  return p1[m];
}
const tol=len=>len<4?0:len<8?1:2;
/** How well one query word matches one document word: 3 exact, 2.5 prefix, 2 same key, 1.5 key prefix, 1 typo, 0 none. */
function wordScore(q,qk,w,wk,last){
  if(w===q)return 3;if(last&&w.startsWith(q))return 2.5;
  if(wk===qk&&qk)return 2;if(last&&qk.length>=2&&wk.startsWith(qk))return 1.5;
  const t=tol(qk.length);if(t&&dist(qk,wk,t)<=t)return 1;
  if(last&&qk.length>=4&&wk.length>qk.length&&dist(qk,wk.slice(0,qk.length),1)<=1)return 0.8;
  /* Russian endings: "тополя" finds "тополей" when the stems share all but the last couple of letters */
  let c=0;while(c<q.length&&c<w.length&&q[c]===w[c])c++;
  if(q.length>=5&&w.length>=5&&c>=Math.max(4,Math.min(q.length,w.length)-2))return 0.9;
  return 0;
}
/** docs: [{id,title,author,extra}]. Every query word must match something; titles weigh more than authors, authors more than extra words. */
export function search(query,docs){
  const qs=words(query);if(!qs.length)return docs.map(d=>({id:d.id,score:0}));
  const qk=qs.map(key);const out=[];
  for(const d of docs){
    d._f??=[['title',3,words(d.title)],['author',2,words(d.author)],['extra',1,words(d.extra||'')]].map(([n,w,ws])=>({w,ws,ks:ws.map(key)}));
    let total=0,ok=true,fuzzy=false;
    for(let i=0;i<qs.length&&ok;i++){
      let best=0,bw=0;
      for(const f of d._f)for(let j=0;j<f.ws.length;j++){const s=wordScore(qs[i],qk[i],f.ws[j],f.ks[j],i===qs.length-1);if(s*f.w>best*bw||s*f.w>best*bw-0.001&&s>best){if(s>0&&s*f.w>=best*bw){best=s;bw=f.w}}}
      if(!best){ok=false;break}
      if(best<=1)fuzzy=true;total+=best*bw;
    }
    if(ok)out.push({id:d.id,score:Math.round(total*100)/100,fuzzy});
  }
  return out.sort((a,b)=>b.score-a.score);
}
/** "Did you mean": the closest title or author word for a query that found nothing. */
export function suggest(query,docs){
  const qs=words(query).filter(w=>w.length>=3);if(!qs.length)return null;
  const vocab=new Map();for(const d of docs)for(const w of (d.title+' '+d.author).split(/[^\p{L}\p{N}ʻʼ‘’'`]+/u))if(w.length>=3)vocab.set(key(w),w);
  const fixed=qs.map(q=>{const k=key(q);if(vocab.has(k))return vocab.get(k);let best=null,bd=3;for(const [vk,w] of vocab){const x=dist(k,vk,2);if(x<bd){bd=x;best=w}}return best||q});
  const s=fixed.join(' ');return s!==qs.join(' ')?s:null;
}
