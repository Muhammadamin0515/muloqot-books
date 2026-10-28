/* Simple load check: N readers open the app, read, save progress. Against a LOCAL `wrangler dev` (dev header) it shows errors and relative speed;
   it is not a measurement of Cloudflare itself. Usage: BASE=http://localhost:8806 USERS=300 node tests/load/load.mjs */
const B=process.env.BASE||'http://localhost:8806',N=+(process.env.USERS||200),WAVES=+(process.env.WAVES||1);
const call=async(who,path,method='GET',body)=>{const t=performance.now();let r;try{r=await fetch(B+path,{method,headers:{'content-type':'application/json','x-dev-user':who},body:body&&JSON.stringify(body)})}catch(e){return{s:0,ms:performance.now()-t}}
  await r.arrayBuffer().catch(()=>0);return{s:r.status,ms:performance.now()-t}};
const stats={};const rec=(k,r)=>{(stats[k]=stats[k]||[]).push(r)};
async function reader(i){
  const who='load'+i;
  const b=await call(who,'/api/bootstrap');rec('bootstrap',b);
  const j=await (await fetch(B+'/api/bootstrap',{headers:{'x-dev-user':who}})).json().catch(()=>null);
  const book=j&&j.books&&j.books.find(x=>x.fullText!==false);if(!book)return;
  rec('text',await call(who,`/api/books/${book.id}/text`));
  rec('event',await call(who,`/api/books/${book.id}/event`,'POST',{type:'read'}));
  for(let k=1;k<=3;k++)rec('progress',await call(who,`/api/progress/${book.id}`,'PUT',{ver:book.ver||'',locator:{ch:k,p:0,para:null},percent:k*10,rev:k}));
  rec('state',await call(who,'/api/state','PUT',{theme:'dark',name:'L'+i}));
}
const pct=(a,p)=>a.length?a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))]:0;
const t0=performance.now();
for(let w=0;w<WAVES;w++)await Promise.all(Array.from({length:N},(_,i)=>reader(w*N+i)));
const secs=(performance.now()-t0)/1000;let total=0,bad=0;
console.log(`${N*WAVES} readers in ${secs.toFixed(1)} s`);
for(const [k,v] of Object.entries(stats)){const ms=v.map(x=>x.ms),err=v.filter(x=>x.s>=500||x.s===0).length,rej=v.filter(x=>x.s===429).length;total+=v.length;bad+=err;
  console.log(`${k.padEnd(10)} n=${v.length} p50=${pct(ms,.5).toFixed(0)}ms p95=${pct(ms,.95).toFixed(0)}ms max=${Math.max(...ms).toFixed(0)}ms errors=${err}${rej?` limited=${rej}`:''}`)}
console.log(`${total} requests, ${bad} server errors`);process.exit(bad?1:0);
