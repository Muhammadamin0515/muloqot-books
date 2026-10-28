/* Browser scenario of the AI studio (admin → ИИ-студия) against the scripted provider mock. Run after orch.mjs setup (wrangler with AI_* variables). */
const {chromium}=require('playwright');
const B=process.env.BASE||'http://localhost:8806',MOCK=+(process.env.AI_MOCK_PORT||9997);
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const api=async(who,path,method='GET',body)=>{const r=await fetch(B+path,{method,headers:{'content-type':'application/json','x-dev-user':who},body:body&&JSON.stringify(body)});return{s:r.status,j:await r.json().catch(()=>null)}};
(async()=>{
const {startMock}=await import('./ai-mock.mjs');const {mock,mctl}=startMock(MOCK);
for(const p of ['groq','gemini','openrouter'])await api('admin','/api/admin/ai/key','POST',{provider:p,key:'k_TESTKEY1234567890abcdef'+p});
const br=await chromium.launch(),errs=[];
const ctx=await br.newContext({viewport:{width:410,height:880}}),a=await ctx.newPage();
a.on('pageerror',e=>errs.push(e.message));a.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text())});
await a.goto(B+'/?as=admin&open=profile');await a.waitForTimeout(900);
await a.click('[data-a=openAdmin]');await a.waitForTimeout(400);await a.click('[data-a=admTab][data-v=aistudio]');await a.waitForTimeout(900);
ok((await a.textContent('.adm')).includes('Новая книга'),'AI studio opens with the job list');
await a.click('[data-a=asNew]');await a.waitForTimeout(300);await a.screenshot({path:'/tmp/ui_studio_form.png'});await a.click('summary:has-text("Дополнительно")');await a.waitForTimeout(200);
ok((await a.inputValue('#asMd'))==='draft-model'&&(await a.inputValue('#asMe'))==='editor-model'&&(await a.inputValue('#asMx'))==='expert-model','model fields are prefilled from the server variables');
await a.click('[data-a=asModels][data-p=gemini]');await a.waitForTimeout(500);
ok((await a.locator('#l_asMe option').count())>=1,'the live model list of the service fills the suggestions');
await a.fill('#asMd','invented-model');await a.fill('.card textarea','Детектив в старой Бухаре: торговец находит письмо.');
ok(await a.locator('[data-a=asSet][data-k=chapters]').count()===0,'by default genre, chapters and size are left to the author model');
await a.click('[data-a=asCreate]');await a.waitForTimeout(1200);
ok((await a.textContent('.demo-banner')).includes('Этих моделей нет в списке сервиса'),'an invented model is refused with a clear message');
await a.fill('#asMd','draft-model');await a.click('[data-a=asCreate]');
await a.waitForSelector('[data-a=asApprove]',{timeout:20000});
ok((await a.textContent('.adm')).includes('План книги')&&(await a.textContent('.adm')).includes('ИИ-автор выбрал: жанр — Исторический, глав — 3')&&(await a.inputValue('#asPT'))==='Письмо из Бухары','the plan shows what the author model chose and nothing is written yet');
await a.screenshot({path:'/tmp/ui_studio_plan.png'});
await a.click('[data-a=asApprove]');
await a.waitForSelector('[data-a=asPublish]',{timeout:90000});
ok((await a.textContent('.adm')).includes('бесплатно')&&(await a.textContent('.adm')).includes('Книга готова'),'chapters are written and checked, the job waits for the publication decision');
await a.click('[data-a=asLog]');await a.waitForTimeout(300);
ok((await a.textContent('.logtbl')).includes('chapter_review')&&(await a.textContent('.logtbl')).includes('(тест)'),'the journal shows calls and marks mock calls as test');
await a.click('[data-a=asChapter][data-i="0"]');await a.waitForTimeout(500);
ok((await a.inputValue('textarea[aria-label="Текст главы"]')).includes('Предложение'),'a chapter can be opened and read');
await a.screenshot({path:'/tmp/ui_studio_ready.png'});
ok((await api('admin','/api/bootstrap')).j.books.every(b=>b.title!=='Письмо из Бухары'),'nothing is in the catalog before the administrator publishes');
await a.click('[data-a=asPublish]');await a.waitForTimeout(300);await a.click('[data-a=asPublishGo]');await a.waitForSelector('[data-a=asOpenBook]',{timeout:15000});
const bk=(await api('admin','/api/bootstrap')).j.books.find(b=>b.title==='Письмо из Бухары');
ok(bk&&bk.ai&&bk.fullText&&bk.nch===3,'published after the confirmation: in the catalog, readable, marked as AI-made');
await a.screenshot({path:'/tmp/ui_studio_done.png'});

/* fully automatic: only a plan is typed */
await a.click('[data-a=asBack]');await a.waitForTimeout(600);await a.click('[data-a=asNew]');await a.waitForTimeout(300);
await a.fill('.card textarea','План: 1. Письмо. 2. Погоня. 3. Развязка. Историческая драма о торговце из Бухары.');
await a.click('[data-a=asCreate]');await a.waitForSelector('[data-a=asApprove]',{timeout:20000});
ok((await a.textContent('.adm')).includes('ИИ-автор выбрал')&&(await a.textContent('.adm')).includes('Писатель')&&(await a.textContent('.adm')).includes('draft-model'),'a plan alone is enough: the rest is chosen automatically and shown');
await a.screenshot({path:'/tmp/ui_studio_auto.png'});

/* the "fix with AI" button under the final review */
await mctl({finalFail:true,finalWhere:'главы 1, 2'});
await a.click('[data-a=asBack]');await a.waitForTimeout(600);await a.click('[data-a=asNew]');await a.waitForTimeout(300);
await a.fill('.card textarea','План для проверки кнопки исправления: письмо, погоня, развязка.');await a.click('[data-a=asCreate]');
await a.waitForSelector('[data-a=asApprove]',{timeout:20000});await a.click('[data-a=asApprove]');
await a.waitForSelector('[data-a=asPublish]',{timeout:90000});
ok((await a.textContent('.fixbox')).includes('Исправить с помощью ИИ')&&(await a.textContent('.fixbox')).includes('1, 2'),'under serious notes of the final review there is a "fix with AI" box naming the chapters');
await a.screenshot({path:'/tmp/ui_studio_fix.png'});
await mctl({finalFail:false});
await a.click('[data-a=asFixFinal][data-only=all]');
await a.waitForSelector('.jrun',{timeout:15000});
ok((await a.textContent('.jrun')).includes('Исправление замечаний'),'while repairing, the screen says so');
await a.waitForSelector('[data-a=asPublish]',{timeout:90000});
ok(!(await a.locator('.fixbox').count())&&(await a.textContent('.adm')).includes('серьёзных замечаний нет'),'after the repair the book passes the final review again');
/* the platform's own shelf */
await a.goto(B+'/?as=admin');await a.waitForTimeout(1500);
ok((await a.locator('.own-rail .bk.own').count())>=1&&(await a.textContent('.own-sec')).includes('Muloqot Books')&&(await a.textContent('.own-sec')).includes('Письмо из Бухары'),'the published AI book appears on the home screen in the Muloqot Books shelf');
ok(await a.locator('.own-rail .bk .rank').first().textContent()==='1','books on the shelf are ranked');
await a.screenshot({path:'/tmp/ui_home_own.png'});
await a.goto(B+'/?as=admin&open=catalog');await a.waitForTimeout(1200);
ok(await a.locator('[data-a=catOnly][data-v=own]').count()===1,'the catalog has a Muloqot Books filter');
await a.click('[data-a=catOnly][data-v=own]');await a.waitForTimeout(800);
ok((await a.locator('.cardbk').count())>=1&&(await a.locator('.cardbk').count())<=(await api('admin','/api/bootstrap')).j.books.length,'the filter lists only the own books');
ok(errs.length===0,'no page errors '+JSON.stringify(errs.slice(0,3)));
await br.close();mock.close();
console.log(fails?`\n${fails} FAILED`:'\nall passed');process.exit(fails?1:0);
})();
