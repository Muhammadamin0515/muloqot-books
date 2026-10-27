/* Reading imported (lazy) books in a mobile-size browser: chapter-by-chapter loading, TOC, verse, progress and bookmark sync, second device, outage, text update.
   Needs BASE and IMPORT_TOKEN (the server started with the same token). Uses the SYNTHETIC fixture tree. */
const {chromium}=require('playwright');const {spawnSync}=require('child_process');const fs=require('fs');const os=require('os');const path=require('path');
const B=process.env.BASE||'http://localhost:8806',TOK=process.env.IMPORT_TOKEN,ROOT=process.cwd();
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const api=async(who,p,method='GET',body)=>{const r=await fetch(B+p,{method,headers:{'content-type':'application/json','x-dev-user':who},body:body&&JSON.stringify(body)});return{s:r.status,j:await r.json().catch(()=>null)}};
const work=fs.mkdtempSync(path.join(os.tmpdir(),'rl-ui-')),src=path.join(work,'src');
(async()=>{
const {makeTree}=await import(ROOT+'/tests/ruslit-fixture.mjs');makeTree(src);
const cli=a=>spawnSync('node',[path.join(ROOT,'scripts/ruslit.mjs'),...a],{encoding:'utf8',env:{...process.env,IMPORT_TOKEN:TOK},cwd:work});
ok(cli(['import','--source',src,'--target',B]).status===0,'fixture imported');
const allow=path.join(work,'allow.json');fs.writeFileSync(allow,JSON.stringify({verifiedBy:'test',verifiedOn:'2026-01-01',rights:{status:'author',note:'SYNTHETIC TEST TEXT written for this repository.'},metaConfirmed:true,books:[{path:'prose/Testov/Дубль повести.txt'},{path:'poems/Testov/Тестовое стихотворение.txt'}]}));
const pb=cli(['publish','--target',B,'--allowlist',allow]);
const boot=(await api('reader1','/api/bootstrap')).j;const real=boot.books.filter(b=>b.lazy);
ok(real.length===2,'two books published, the duplicate stays a draft ('+real.map(b=>b.title)+')');
const prose=real.find(b=>b.genre==='prose'),poem=real.find(b=>b.genre==='poetry');
const br=await chromium.launch();const errs=[];const reqs=[];
const mk=async(who,ctx)=>{const c=ctx||await br.newContext({viewport:{width:410,height:880}});const p=await c.newPage();p.on('pageerror',e=>errs.push(who+': '+e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(who+' console: '+m.text())});p.on('request',r=>{if(/\/api\/books\//.test(r.url()))reqs.push(r.method()+' '+r.url().replace(B,''))});return{c,p}};
const topPara=p=>p.evaluate(()=>{const body=document.querySelector('#rbody'),top=body.getBoundingClientRect().top;for(const x of document.querySelectorAll('.rp'))if(x.getBoundingClientRect().bottom>top+60)return +x.dataset.i;return -1});

/* catalog and card */
let {c:ctx1,p}=await mk('reader1');await p.goto(B+'/?as=reader1&open=catalog');await p.waitForTimeout(1500);
ok(await p.locator('.cardbk').count()===2,'catalog shows only the 2 published books');
await p.fill('#q','повести');await p.waitForTimeout(700);ok(await p.locator('.cardbk').count()===1,'search by title finds the prose book');
await p.fill('#q','Тестов');await p.waitForTimeout(700);ok(await p.locator('.cardbk').count()===2,'search by author finds both');
await p.click(`.cardbk:has-text("${prose.title}")`);await p.waitForTimeout(600);
const kv=await p.textContent('.kv');ok(kv.includes('Иван Тестов')===false&&kv.includes('4')&&/Права/.test(kv)&&/RusLit/.test(kv),'card shows chapters, rights and the source collection');
ok(await p.locator('[data-a=read]').count()===1,'card has the Read button');
reqs.length=0;
/* reading: chapter by chapter */
await p.click('[data-a=read]');await p.waitForSelector('.rp',{timeout:8000});await p.waitForTimeout(700);
ok(reqs.some(r=>/\/chapter\/0\?v=\w+$/.test(r)),'opening loads chapter 0 (cached by book version)');
ok(!reqs.some(r=>/\/text/.test(r)),'the whole book is never downloaded');
ok(await p.locator('.rp').count()===30,'chapter 0 shows its 30 paragraphs');
ok((await p.textContent('.chhead h2'))==='Часть первая. I','chapter title shown');
await p.click('[data-a=rToc]');await p.waitForTimeout(300);ok(await p.locator('.toc button').count()===4,'table of contents lists 4 sections');
await p.evaluate(()=>document.getElementById('scrim').click());await p.waitForTimeout(300);
ok(/^≈\d+%$/.test((await p.textContent('#rpc')).trim()),'progress is shown as an approximation (≈)');
await p.click('[data-a=rNext]');await p.waitForTimeout(900);
ok(reqs.some(r=>/\/chapter\/1/.test(r))&&(await p.textContent('.chhead h2'))==='Часть первая. II','next chapter is fetched on demand');
await p.evaluate(()=>{const b=document.querySelector('#rbody');b.scrollTop=b.scrollHeight*0.5});await p.waitForTimeout(600);
const para=await topPara(p);ok(para>5,'scrolled to paragraph '+para);
/* bookmark */
await p.click('#bmBtn');await p.waitForTimeout(400);
ok(await p.locator('#bmBtn.on').count()===1,'bookmark toggled on');
await p.waitForTimeout(6500); // progress is synced a few seconds after the last scroll, bookmarks sooner
const srv=(await api('reader1','/api/bootstrap')).j;const row=srv.progress[prose.id];
ok(row&&row.ver===prose.ver&&row.locator.ch===1&&Math.abs(row.locator.para-para)<=1&&row.rev>=1&&row.percent>0,'progress row on the server: '+JSON.stringify(row));
ok(srv.bookmarks.length===1&&srv.bookmarks[0].bookId===prose.id&&srv.bookmarks[0].ver===prose.ver,'bookmark stored with the book version');
ok(Object.keys((await api('reader2','/api/bootstrap')).j.progress).length===0&&(await api('reader2','/api/bootstrap')).j.bookmarks.length===0,'another user has none of this');
/* second device */
let {c:ctx2,p:p2}=await mk('reader1-device2');await p2.goto(B+'/?as=reader1&open=read_'+prose.id);await p2.waitForSelector('.rp',{timeout:8000});await p2.waitForTimeout(900);
ok((await p2.textContent('.chhead h2'))==='Часть первая. II'&&Math.abs(await topPara(p2)-para)<=1,'a second device resumes in the same chapter and paragraph');
await p2.goto(B+'/?as=reader1&open=library');await p2.waitForTimeout(900);await p2.click('[data-a=libTab][data-v=bookmarks]');await p2.waitForTimeout(400);
ok(await p2.locator('.bmrow').count()===1,'the bookmark is visible on the second device');
await p2.screenshot({path:'/tmp/ui_ruslit_lib.png'});
/* the other user's home does not show "continue" for this book */
const {p:p3}=await mk('reader2');await p3.goto(B+'/?as=reader2');await p3.waitForTimeout(1500);
ok(await p3.locator('.cont').count()===0,'another user has no "continue reading" for it');
await p3.close();
/* verse */
await p.goto(B+'/?as=reader1&open=read_'+poem.id);await p.waitForSelector('.rp',{timeout:8000});await p.waitForTimeout(600);
const v=await p.evaluate(()=>{const e=document.querySelector('.rp');return{ws:getComputedStyle(e).whiteSpace,lines:e.textContent.split('\n').length,h:e.getBoundingClientRect().height,lh:parseFloat(getComputedStyle(e).lineHeight)}});
ok(v.lines===4&&v.ws==='pre-line'&&v.h>v.lh*3.5,'a stanza keeps its 4 lines: '+JSON.stringify(v));
await p.screenshot({path:'/tmp/ui_ruslit_verse.png'});
ok(await p.locator('[data-a=rToc]').count()===0,'a book without chapters has no table of contents button');
/* sync outage: progress is kept and sent later */
await p.goto(B+'/?as=reader1&open=read_'+prose.id);await p.waitForSelector('.rp',{timeout:8000});await p.waitForTimeout(500);
await ctx1.route('**/api/progress/**',r=>r.abort());
await p.click('[data-a=rNext]');await p.waitForTimeout(800);await p.evaluate(()=>{const b=document.querySelector('#rbody');b.scrollTop=b.scrollHeight*0.3});await p.waitForTimeout(6500);
const stuck=(await api('reader1','/api/bootstrap')).j.progress[prose.id];ok(stuck.locator.ch===1,'while the network is blocked the server still has the old position (ch '+stuck.locator.ch+')');
const outbox=await p.evaluate(()=>JSON.parse(localStorage.getItem('muloqot.proto.v1')).outbox);ok(outbox&&outbox.p&&outbox.p[prose.id]===1,'the unsent change is kept in the persistent outbox');
await ctx1.unroute('**/api/progress/**');await p.evaluate(()=>window.dispatchEvent(new Event('online')));await p.waitForTimeout(5200);
const healed=(await api('reader1','/api/bootstrap')).j.progress[prose.id];ok(healed.locator.ch===2,'after the network returns the position is synced (ch '+healed.locator.ch+', rev '+healed.rev+')');
/* a stale device cannot overwrite a newer position */
const r0=healed.rev;const stale=await api('reader1',`/api/progress/${prose.id}`,'PUT',{ver:prose.ver,locator:{ch:0,para:0,p:0},percent:1,rev:r0});ok(stale.s===409,'a write with an old revision is rejected');
/* the text is replaced upstream → new version, old position degrades to the chapter */
const f=path.join(src,'poems/Testov/Тестовое стихотворение.txt');fs.writeFileSync(f,fs.readFileSync(f,'utf8')+'\nТретья строфа появилась после обновления,\nпоэтому версия текста изменилась.\n');
ok(cli(['import','--source',src,'--target',B]).status===0,'updated source imported');
await api('reader1',`/api/progress/${poem.id}`,'PUT',{ver:poem.ver,locator:{ch:0,para:1,p:.9},percent:90,rev:1});
await p.goto(B+'/?as=reader1');await p.waitForTimeout(1200);
await p.goto(B+'/?as=reader1&open=read_'+poem.id);await p.waitForSelector('.rp',{timeout:8000});await p.waitForTimeout(800);
const nb=(await api('reader1','/api/bootstrap')).j.books.find(b=>b.id===poem.id);ok(nb.ver!==poem.ver,'the book got a new version after the source changed');
ok(await p.locator('.rp').count()===3,'the reader shows the new text (3 stanzas)');
await p.close();await ctx2.close();await ctx1.close();
ok(errs.length===0,'no page errors '+JSON.stringify(errs.slice(0,3)));
await br.close();fs.rmSync(work,{recursive:true,force:true});console.log(fails?`\n${fails} FAILED`:'\nall passed');process.exit(fails?1:0)})().catch(e=>{console.error(e);process.exit(1)});
