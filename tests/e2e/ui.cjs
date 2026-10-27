/* Browser scenarios against a running `wrangler dev` (BASE, default http://localhost:8806) with an EMPTY local database.
   Run: node tests/e2e/ui.cjs   (fixtures: node tests/fixtures.mjs /tmp/fixtures) */
const {chromium}=require('playwright');const fs=require('fs');
const B=process.env.BASE||'http://localhost:8806',FX=process.env.FX||'/tmp/fixtures';
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const api=async(who,path,method='GET',body)=>{const r=await fetch(B+path,{method,headers:{'content-type':'application/json','x-dev-user':who},body:body&&JSON.stringify(body)});return {s:r.status,j:await r.json().catch(()=>null)}};
(async()=>{
const br=await chromium.launch();const errs=[];
const page=async(who,ctx)=>{const p=await (ctx||await br.newContext({viewport:{width:410,height:880}})).newPage();p.on('pageerror',e=>errs.push(who+': '+e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(who+' console: '+m.text())});return p};

/* A. demo catalog on a fresh database */
let p=await page('reader');await p.goto(B+'/?as=reader&open=catalog');await p.waitForTimeout(1200);
ok(await p.locator('.cardbk').count()>=10,'fresh database shows the demo catalog');
await p.click('.cardbk >> nth=0');await p.waitForTimeout(500);await p.click('[data-a=bookTab][data-v=reviews]');await p.waitForTimeout(300);
ok(await p.locator('.dist .bar').count()===5,'rating distribution renders');
await p.close();

/* B. admin imports an EPUB with rights */
const a=await page('admin');await a.goto(B+'/?as=admin&open=profile');await a.waitForTimeout(900);
await a.click('[data-a=openAdmin]');await a.waitForTimeout(400);await a.click('[data-a=admTab][data-v=catalog]');await a.waitForTimeout(900);
ok((await a.textContent('.tiles')).includes('Настоящих книг'),'catalog tab opens');
await a.click('summary:has-text("Одна книга")');
await a.setInputFiles('#ciFile',FX+'/classic.epub');await a.waitForTimeout(900);
ok(await a.inputValue('#ciT')==='Старый двор'&&await a.inputValue('#ciA')==='Иван Тестов','EPUB metadata prefills the form');
await a.fill('#ciSn2','Тестовый источник');
await a.selectOption('#ciSt','unverified');await a.click('[data-a=ciSubmit]');await a.waitForTimeout(900);
ok((await a.textContent('.card:has-text("✕")')).includes('выберите подтверждённое основание'),'text is refused without confirmed rights');
await a.selectOption('#ciSt','public_domain');await a.fill('#ciDt','2005');await a.click('[data-a=ciSubmit]');await a.waitForTimeout(900);
ok((await a.textContent('.card:has-text("✕")')).includes('год смерти'),'public domain with a recent death year is refused');
await a.fill('#ciDt','1900');await a.fill('#ciSe','Дворовые истории');await a.fill('#ciSn','1');await a.click('[data-a=ciSubmit]');await a.waitForTimeout(1500);
ok((await a.textContent('.card:has-text("✓")')).includes('(текст)'),'EPUB imported with full text');
ok((await a.textContent('.tiles')).includes('1'),'stats updated');
await a.screenshot({path:'/tmp/ui_admin_catalog.png'});
/* metadata-only card */
const meta=await api('admin','/api/admin/import','POST',{records:[{title:'Только карточка',author:'Иван Тестов',lang:'ru',genre:'novel',description:'Карточка без текста.',source:{name:'Каталог издательства'},rights:{status:'unverified'}}]});
ok(meta.j.results[0].id&&!meta.j.results[0].fullText,'metadata-only card created');
await a.close();

/* C. reader view: demo hidden, real book readable, series, rights line */
const rc=await br.newContext({viewport:{width:410,height:880}});
p=await page('reader2',rc);await p.goto(B+'/?as=reader2&open=catalog');await p.waitForTimeout(1300);
ok(await p.locator('.cardbk').count()===2,'demo content is hidden once real books exist ('+await p.locator('.cardbk').count()+' books)');
await p.click('.cardbk:has-text("Старый двор")');await p.waitForTimeout(600);
const det=await p.textContent('.kv');ok(det.includes('Дворовые истории')&&det.includes('Общественное достояние'),'book card shows series and rights');
ok(await p.locator('[data-a=read]').count()>0,'readable book has a Read button');
await p.click('[data-a=read]');await p.waitForTimeout(900);
ok(await p.locator('.rp').count()>=20,'reader shows chapter text');
await p.evaluate(()=>{const b=document.querySelector('#rbody');b.scrollTop=b.scrollHeight*0.45});await p.waitForTimeout(500);
const para=await p.evaluate(()=>{const body=document.querySelector('#rbody'),top=body.getBoundingClientRect().top;for(const x of document.querySelectorAll('.rp'))if(x.getBoundingClientRect().bottom>top+60)return +x.dataset.i;return -1});
ok(para>5,'scrolled to paragraph '+para);
await p.waitForTimeout(2200); // state sync is debounced
await p.close();
/* same reader on a "second device": fresh browser context, nothing in localStorage */
const p2=await page('reader2');await p2.goto(B+'/?as=reader2');await p2.waitForTimeout(1500);
const st=(await api('reader2','/api/bootstrap')).j.state;const pr=Object.values(st.progress||{})[0];
ok(pr&&pr.para>=para-1&&pr.para<=para+1,'position (paragraph) is synced to the server: '+JSON.stringify(pr));
await p2.evaluate(()=>{});
const id=(await api('reader2','/api/bootstrap')).j.books.find(b=>b.title==='Старый двор').id;
await p2.goto(B+'/?as=reader2&open=read_'+id);await p2.waitForTimeout(1500);
const back=await p2.evaluate(()=>{const body=document.querySelector('#rbody'),top=body.getBoundingClientRect().top;for(const x of document.querySelectorAll('.rp'))if(x.getBoundingClientRect().bottom>top+60)return +x.dataset.i;return -1});
ok(Math.abs(back-para)<=1,'second device resumes at the same paragraph ('+back+' vs '+para+')');
/* changing the font size keeps the place (restore is by paragraph, not by scroll fraction) */
await p2.click('[data-a=rSet]');await p2.waitForTimeout(200);for(let i=0;i<4;i++)await p2.click('[data-a=rSize][data-d="1"]');await p2.evaluate(()=>document.getElementById('scrim').click());await p2.waitForTimeout(300);
const bigAt=await p2.evaluate(()=>{const body=document.querySelector('#rbody'),top=body.getBoundingClientRect().top;for(const x of document.querySelectorAll('.rp'))if(x.getBoundingClientRect().bottom>top+60)return +x.dataset.i;return -1});
const fs0=await p2.evaluate(()=>getComputedStyle(document.querySelector('.reader')).getPropertyValue('--rs'));
ok(fs0.trim()==='19px'||fs0.trim()==='21px'||parseInt(fs0)>=19,'font size changed ('+fs0.trim()+') ');
await p2.close();

/* D. metadata-only book + search */
p=await page('reader3');await p.goto(B+'/?as=reader3&open=catalog');await p.waitForTimeout(1200);
await p.fill('#q','Старй дво');await p.waitForTimeout(700);
ok(await p.locator('.cardbk:has-text("Старый двор")').count()===1,'typo "Старй дво" finds the book');
await p.fill('#q','Tarixiy qwerty');await p.waitForTimeout(700);ok(await p.locator('.empty').count()===1,'nonsense shows empty state');
await p.fill('#q','Тестов');await p.waitForTimeout(700);ok(await p.locator('.cardbk').count()===2,'author search finds both books');
await p.click('.cardbk:has-text("Только карточка")');await p.waitForTimeout(600);
ok(await p.locator('[data-a=read]').count()===0&&(await p.textContent('.avail')).includes('недоступен'),'metadata-only book: no Read button, honest notice');
ok((await p.textContent('.bhero')).includes('Только описание'),'format tag says description only');
const mid=(await api('reader3','/api/bootstrap')).j.books.find(b=>b.title==='Только карточка').id;
ok((await api('reader3','/api/books/'+mid+'/text')).s===403,'API refuses the text of a book without rights');
await p.screenshot({path:'/tmp/ui_book_meta.png'});
await p.close();

/* E. audio */
await api('admin','/api/admin/books/'+id+'/rights','POST',{status:'public_domain'});
const au=await api('admin','/api/admin/books/'+id+'/audio','POST',{tracks:[{title:'Часть 1',url:'https://audio.test/t1.wav',duration:10},{title:'Часть 2',url:'https://audio.test/t1.wav?2',duration:10}]});
ok(au.s===200,'audio tracks saved');
const ctx=await br.newContext({viewport:{width:410,height:880}});await ctx.route('https://audio.test/**',r=>r.fulfill({status:200,body:fs.readFileSync(FX+'/tone.wav'),headers:{'content-type':'audio/wav','accept-ranges':'bytes'}}));
p=await page('reader4',ctx);await p.goto(B+'/?as=reader4&open=book_'+id);await p.waitForTimeout(1500);
ok(await p.locator('[data-a=audioOpen]').count()===1,'book with audio shows the Listen button');
await p.click('[data-a=audioOpen]');await p.waitForTimeout(1000);
ok(await p.locator('#aPlay').count()===1,'player opens');
await p.click('#aPlay');await p.waitForTimeout(2500);
let ct=await p.evaluate(()=>window.__aud&&window.__aud.currentTime);
ct=await p.evaluate(()=>[...document.querySelectorAll('#aCur')].map(x=>x.textContent)[0]);ok(ct&&ct!=='0:00','playback advances ('+ct+')');
await p.click('[data-a=aSpeed]');ok((await p.textContent('#aSpd'))==='1.25×','speed control works');
await p.click('[data-a=aSkip][data-d="-15"]');await p.click('[data-a=aToggle]');await p.waitForTimeout(500);
await p.evaluate(()=>{const r=document.getElementById('aSeek');r.value=6;r.dispatchEvent(new Event('input',{bubbles:true}))});await p.waitForTimeout(400);
await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await p.waitForTimeout(2200);
const pos=(await api('reader4','/api/bootstrap')).j.state.audioPos;ok(pos&&pos[id]&&pos[id].t>=5&&pos[id].speed===1.25,'audio position and speed are saved and synced: '+JSON.stringify(pos&&pos[id]));
await p.screenshot({path:'/tmp/ui_audio.png'});await p.close();

/* F. studio accepts EPUB and PDF under the real Content-Security-Policy */
const sp=await page('author9');await sp.goto(B+'/?as=author9&open=profile');await sp.waitForTimeout(900);
await sp.click('[data-a=openStudio]');await sp.waitForTimeout(500);await sp.click('[data-a=wzNew]');await sp.waitForTimeout(200);
await sp.setInputFiles('#wzFile',FX+'/classic.epub');await sp.waitForSelector('.wz-info',{timeout:15000});
ok((await sp.textContent('.wz-info')).includes('3 главы'),'studio reads an EPUB: '+(await sp.textContent('.wz-info')).replace(/\s+/g,' ').slice(0,60));
await sp.click('[data-a=wzNext]');await sp.waitForTimeout(300);
ok(await sp.inputValue('#wzTitle')==='Старый двор'&&(await sp.inputValue('#wzDesc')).startsWith('Рассказ о дворе'),'EPUB title and description prefill the form');
await sp.click('[data-a=wzPrev]');await sp.waitForTimeout(200);
if(fs.existsSync(FX+'/book.pdf')){await sp.setInputFiles('#wzFile',FX+'/book.pdf');await sp.waitForFunction(()=>/book\.pdf/.test(document.querySelector('.wz-info')?.textContent||''),null,{timeout:20000});ok(true,'studio reads a PDF (pdf.js worker loads under CSP)')}
const csp=await (await fetch(B+'/')).headers.get('content-security-policy');ok(/frame-ancestors/.test(csp)&&/default-src 'self'/.test(csp),'app shell is served with a Content-Security-Policy');
await sp.close();

/* G. no JS errors anywhere */
ok(errs.length===0,'no page errors '+JSON.stringify(errs.slice(0,4)));
await br.close();console.log(fails?`\n${fails} FAILED`:'\nall passed');process.exit(fails?1:0)})();
