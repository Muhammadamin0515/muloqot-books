#!/usr/bin/env node
/* Read-only discovery: what Uzbek-language works exist on uz.wikisource.org (and what the API says about their size and licence).
   Prints a report; changes nothing. Run in GitHub Actions (the development sandbox cannot reach these hosts). */
const API='https://uz.wikisource.org/w/api.php',UA={'user-agent':'MuloqotBooks-discovery/1.0 (project owner contact via GitHub)'};
const q=async p=>{const u=API+'?format=json&origin=*&'+new URLSearchParams(p);const r=await fetch(u,{headers:UA});if(!r.ok)throw new Error(r.status+' '+u);return r.json()};
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
