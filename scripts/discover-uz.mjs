#!/usr/bin/env node
/* Read-only discovery: what Uzbek-language works exist on uz.wikisource.org (and what the API says about their size and licence).
   Prints a report; changes nothing. Run in GitHub Actions (the development sandbox cannot reach these hosts). */
const API='https://uz.wikisource.org/w/api.php',UA={'user-agent':'MuloqotBooks/1.0 (https://github.com/Muhammadamin0515/muloqot-books; read-only catalogue discovery) node-fetch','accept':'application/json'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* Wikimedia asks for a descriptive User-Agent and a gentle request rate: one request per 1.5 s, retry on 429 */
const q=async p=>{const u=API+'?format=json&maxlag=5&'+new URLSearchParams(p);
  for(let i=0;i<4;i++){await sleep(1500*(i+1));const r=await fetch(u,{headers:UA}),t=await r.text();
    if(r.status===429){continue}
    try{return JSON.parse(t)}catch{throw new Error(r.status+' not JSON: '+t.slice(0,120).replace(/\s+/g,' '))}}
  throw new Error('429 after retries')};
const authors=['Abdulla Qodiriy','Cho‘lpon','Alisher Navoiy','Zahiriddin Muhammad Bobur','Abdulla Avloniy','Hamza Hakimzoda Niyoziy','Abdurauf Fitrat','Muqimiy','Furqat','Behbudiy','Erkin Vohidov','Oybek','Abdulla Qahhor','G‘afur G‘ulom','Hamid Olimjon','Said Ahmad','O‘tkir Hoshimov','Tog‘ay Murod'];
try{
  const s=await q({action:'query',meta:'siteinfo',siprop:'statistics|general'});
  console.log('SITE',JSON.stringify({articles:s.query.statistics.articles,pages:s.query.statistics.pages,rightsinfo:s.query.general.rights,license:s.query.general.rightsinfo?.text||s.query.general.rightstext}));
}catch(e){console.log('SITEINFO ERROR',e.message)}
for(const a of authors){
  try{
    const r=await q({action:'query',list:'search',srsearch:a,srlimit:8,srnamespace:'0|102|104'});
    console.log('\nAUTHOR',a,'hits',r.query.searchinfo?.totalhits);
    for(const h of r.query.search)console.log('  ',h.title,'|',h.size,'bytes |',h.wordcount,'words');
  }catch(e){console.log('AUTHOR',a,'ERROR',e.message)}
}
try{const c=await q({action:'query',list:'allcategories',aclimit:80,acprefix:'',acprop:'size'});console.log('\nCATEGORIES',c.query.allcategories.map(x=>x['*']+':'+x.pages).join(' | '))}catch(e){console.log('CATEGORIES ERROR',e.message)}
try{const n=await q({action:'query',meta:'siteinfo',siprop:'namespaces'});console.log('\nNAMESPACES',Object.values(n.query.namespaces).map(x=>x.id+'='+x['*']).join(', '))}catch(e){}
