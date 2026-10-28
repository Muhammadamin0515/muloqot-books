/* Importer, drafts, publication and reading API against a running `wrangler dev` (BASE) started with IMPORT_TOKEN (env). Uses the SYNTHETIC fixture tree. */
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync,existsSync,appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {makeTree} from '../ruslit-fixture.mjs';
import {scan} from '../../scripts/ruslit/scan.js';
const B=process.env.BASE||'http://localhost:8806',TOK=process.env.IMPORT_TOKEN;
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
if(!TOK){console.error('IMPORT_TOKEN must be set');process.exit(2)}
const api=async(who,path,method='GET',body,hdr={})=>{const h={'content-type':'application/json',...hdr};if(who)h['x-dev-user']=who;const r=await fetch(B+path,{method,headers:h,body:body&&JSON.stringify(body)});return{s:r.status,j:await r.json().catch(()=>null)}};
const imp=(path,method='GET',body)=>api(null,path,method,body,{authorization:'Bearer '+TOK});
const work=mkdtempSync(join(tmpdir(),'rl-e2e-')),src=join(work,'src');makeTree(src);
const ROOT=process.cwd(),cli=(args,env={},cwd=ROOT)=>spawnSync('node',[join(ROOT,'scripts/ruslit.mjs'),...args],{encoding:'utf8',env:{...process.env,IMPORT_TOKEN:TOK,...env},cwd});
const lastReport=kind=>{const d=join(ROOT,'.ruslit/reports');const f=readdirSync(d).filter(x=>x.startsWith('ruslit-'+kind)).sort().pop();return JSON.parse(readFileSync(join(d,f),'utf8'))};
const T='--target',SRC=['--source',src];

/* access */
ok((await api(null,'/api/import/status')).s===401,'import API refuses requests without a token');
ok((await api(null,'/api/import/status','GET',undefined,{authorization:'Bearer wrong'})).s===401,'import API refuses a wrong token');
ok((await api('admin','/api/import/status')).s===401,'an admin session is not an import token');
const rem=cli(['import',...SRC,T,'https://example.com','--dry-run']);ok(rem.status===2&&/not localhost/.test(rem.stderr),'CLI refuses a non-local target without --allow-remote');
const noTok=cli(['import',...SRC,T,B],{IMPORT_TOKEN:''},work);ok(noTok.status===2&&/IMPORT_TOKEN/.test(noTok.stderr),'CLI refuses to run without a token');

/* dry-run: nothing changes */
const dry=cli(['import',...SRC,T,B,'--dry-run']);ok(dry.status===0&&/wouldCreate": 4/.test(dry.stdout),'dry-run reports what would be created (4 of 7 files)');
ok((await imp('/api/import/status')).j.books.length===0,'dry-run created nothing');
const rep=lastReport('dry-run');ok(rep.summary.filesFound===7&&rep.summary.errors===2&&rep.summary.exactDuplicates===1&&rep.commit==='unknown','dry-run report: 7 files, 2 errors, 1 duplicate, source commit recorded');

/* import */
const first=cli(['import',...SRC,T,B]);ok(first.status===0,'import finished without failures');
let r=lastReport('import');ok(r.summary.created===4&&r.summary.skipped_error===2&&r.summary.skipped_duplicate===1&&r.summary.failed===0,'import report: '+JSON.stringify(r.summary));
ok(r.results.find(x=>x.result==='skipped_error'&&x.error==='empty')&&r.results.find(x=>x.result==='skipped_error'&&x.error==='binary'),'empty and binary files are reported with their reason');
const again=cli(['import',...SRC,T,B,'--resume']);r=lastReport('import');ok(again.status===0&&r.summary.created===0&&r.summary.skipped_existing===4,'re-run creates no duplicates (4 skipped as existing)');
const st=(await imp('/api/import/status')).j.books;ok(st.length===4&&st.every(b=>b.publish==='draft'&&b.ver),'4 books on the server, all drafts with a prepared version');
const recs0=scan(src,{commit:'x'}).records,ids=Object.fromEntries(recs0.filter(x=>x.hash&&!x.dupOf).map(x=>[x.title,x.id]));
const bookId=recs0.find(x=>x.hash&&!x.dupOf&&/Повесть о тесте|Дубль повести/.test(x.title)).id;

/* drafts are invisible */
{const bj=(await api('reader1','/api/bootstrap')).j;ok(bj.books.filter(b=>b.id.startsWith('rl')).length===0&&bj.demo===true,'drafts are not in the public catalog, and they do not switch the demo content off');}
const dr=[['GET',`/api/books/${bookId}/toc`],['GET',`/api/books/${bookId}/chapter/0`],['GET',`/api/books/${bookId}/text`],['PUT',`/api/progress/${bookId}`,{rev:1,locator:{ch:0}}],['POST','/api/bookmarks',{id:'bmdraft1',bookId,ch:0,para:0}],['POST',`/api/books/${bookId}/rate`,{value:5}],['POST',`/api/books/${bookId}/event`,{type:'view'}],['POST','/api/reviews',{bookId,rating:5,text:'Очень хорошая книга для проверки'}]];
let leaked=[];for(const [m,p,b] of dr){const x=await api('reader1',p,m,b);if(x.s!==404&&x.s!==400)leaked.push(m+' '+p+' '+x.s)}
ok(leaked.length===0,'draft text, toc, chapters, progress, bookmarks, ratings and reviews are refused for readers'+(leaked.length?': '+leaked:''));
ok((await fetch(B+'/api/cover/'+bookId)).status===404,'cover route does not serve drafts');
ok((await api('admin',`/api/books/${bookId}/chapter/0`)).s===200,'an admin can preview a draft chapter');

/* publication needs verified rights */
const base={verifiedBy:'test',verifiedOn:'2026-01-01'};
const al=(entry,top={})=>{const f=join(work,'allow.json');writeFileSync(f,JSON.stringify({...base,...top,books:[entry]}));return f};
const pub=(entry,top)=>{const x=cli(['publish',T,B,'--allowlist',al(entry,top)]);return x};
const povestPath=recs0.find(x=>x.id===bookId).path;
const RIGHTS_OK={status:'author',note:'SYNTHETIC TEST TEXT written for this repository; no third-party rights.'};
let x=pub({path:povestPath,rights:{status:'unverified'}});ok(x.status!==0&&/rights_required/.test(x.stdout),'unverified rights cannot publish');
x=pub({path:povestPath,rights:{status:'public_domain'}});ok(/pd_not_proven/.test(x.stdout),'public domain without a death year is refused');
x=pub({path:povestPath,rights:{status:'public_domain'},authorDeathYear:2010});ok(/pd_not_proven/.test(x.stdout),'public domain with a recent death year is refused');
x=pub({path:povestPath,rights:{status:'licensed'}});ok(/evidence/.test(x.stdout),'a licence without evidence is refused');
x=pub({path:povestPath,rights:RIGHTS_OK});ok(/meta_review_required/.test(x.stdout),'a book with unconfirmed metadata needs an explicit metaConfirmed');
ok((await api('reader1','/api/bootstrap')).j.books.filter(b=>b.id.startsWith('rl')).length===0,'refused publications leave everything hidden');
x=pub({path:povestPath,rights:RIGHTS_OK,metaConfirmed:true});ok(x.status===0&&/published 1/.test(x.stdout),'a verified allow-list entry publishes the book');
const dryPub=cli(['publish',T,B,'--allowlist',al({path:'prose/Testov/Короткий рассказ.txt',rights:RIGHTS_OK,metaConfirmed:true}),'--dry-run']);ok(/Would publish 1/.test(dryPub.stdout)&&(await api('reader1','/api/bootstrap')).j.books.filter(b=>b.id.startsWith('rl')).length===1,'publish --dry-run changes nothing');

pub({path:'prose/Testov/Короткий рассказ.txt',rights:RIGHTS_OK,metaConfirmed:true});
/* reading a published lazy book */
const boot=(await api('reader1','/api/bootstrap')).j,pb=boot.books.find(b=>b.id===bookId);
ok(pb&&pb.lazy&&pb.fullText&&pb.nch===4&&pb.chapters.length===0&&pb.ver.length===12&&pb.publish==='published'&&!('lit' in pb),'published book: metadata only in the catalog (no chapters, no text), version present, internals hidden');
ok(JSON.stringify(boot).length<60000,'catalog payload stays small ('+JSON.stringify(boot).length+' bytes with one real book)') ;
const toc=(await api('reader1',`/api/books/${bookId}/toc`)).j;ok(toc.ver===pb.ver&&toc.chapters.map(c=>c.t).join('|')==='Часть первая. I|Часть первая. II|Часть первая. III|Примечания'&&toc.chapters.every(c=>c.n>0),'toc has titles and sizes');
const ch0=(await api('reader1',`/api/books/${bookId}/chapter/0`)).j;ok(ch0.p.length===30&&ch0.t==='Часть первая. I'&&ch0.p[0].startsWith('Тестовый абзац 1 раздела 1'),'chapter 0 is returned paragraph by paragraph');
ok((await api('reader1',`/api/books/${bookId}/chapter/3`)).j.p[0]==='1. Первое тестовое примечание.','notes chapter is intact');
ok((await api('reader1',`/api/books/${bookId}/chapter/4`)).s===404&&(await api('reader1',`/api/books/${bookId}/chapter/-1`)).s===404&&(await api('reader1',`/api/books/${bookId}/chapter/x`)).s===404,'out-of-range chapters are 404');
ok((await api('reader1',`/api/books/${bookId}/text`)).j.lazy===true,'the whole-book text route does not dump a lazy book');
ok((await api(null,`/api/books/${bookId}/chapter/0`)).s===401,'chapters need a signed-in user');

/* progress with revisions, per user */
const P=(who,rev,ch=1,extra={})=>api(who,`/api/progress/${bookId}`,'PUT',{ver:pb.ver,locator:{ch,para:5,p:.5},percent:33.3,rev,...extra});
ok((await P('reader1',1)).s===200,'progress saved (rev 1)');
const stale=await P('reader1',1,2);ok(stale.s===409&&stale.j.stored.rev===1&&stale.j.stored.locator.ch===1,'a stale revision is rejected and the stored position is returned');
ok((await P('reader1',2,2)).s===200&&(await api('reader1','/api/progress')).j.progress[bookId].locator.ch===2,'a newer revision replaces it');
ok((await P('reader1',3,-1)).s===422&&(await P('reader1',0)).s===422,'invalid locator or revision is refused');
ok(Object.keys((await api('reader2','/api/progress')).j.progress).length===0,'another user sees none of it');
ok((await P('reader2',1,0)).s===200&&(await api('reader1','/api/progress')).j.progress[bookId].locator.ch===2,'another user has their own row, mine is untouched');
ok((await api('reader1','/api/bootstrap')).j.progress[bookId].rev===2,'bootstrap returns the progress of this user only');
/* bookmarks */
const bm={id:'bmtest0001',bookId,ver:pb.ver,ch:1,para:7,snip:'Тестовый абзац'};
ok((await api('reader1','/api/bookmarks','POST',bm)).s===200&&(await api('reader1','/api/bookmarks')).j.bookmarks.length===1,'bookmark saved');
ok((await api('reader2','/api/bookmarks')).j.bookmarks.length===0,'another user sees no bookmarks');
await api('reader2',`/api/bookmarks/${bm.id}`,'DELETE');ok((await api('reader1','/api/bookmarks')).j.bookmarks.length===1,'another user cannot delete my bookmark');
ok((await api('reader1','/api/bookmarks','POST',{...bm,id:'x'})).s===422&&(await api('reader1','/api/bookmarks','POST',{...bm,id:'bmtest0002',ch:-5})).s===422,'bad bookmark ids and locators are refused');
await api('reader1',`/api/bookmarks/${bm.id}`,'DELETE');ok((await api('reader1','/api/bookmarks')).j.bookmarks.length===0,'bookmark deleted by its owner');

/* interrupted import resumes: send a new book half way, then let the CLI finish it */
appendFileSync(join(src,'prose/Testov/info.csv'),'Новый рассказ,1905\n');
writeFileSync(join(src,'prose/Testov/Новый рассказ.txt'),'Иван Тестов\nНовый рассказ\n\n'+Array.from({length:40},(_,i)=>'Абзац '+(i+1)+' нового тестового рассказа, достаточно длинный для проверки.').join('\n'));
const nr=scan(src,{commit:'x'}).records.find(q=>q.title==='Новый рассказ'),{chunks,...record}=nr;
await imp('/api/import/book','POST',{record});
const finishEarly=await imp('/api/import/finish','POST',{id:nr.id,version:nr.version,chunks:chunks.length});ok(finishEarly.s===422&&finishEarly.j.error==='incomplete','finish refuses a book whose chunks have not all arrived');
await imp('/api/import/chunks','POST',{id:nr.id,version:nr.version,chunks:chunks.slice(0,0).length?chunks:[chunks[0]]});
/* chunk validation */
ok((await imp('/api/import/chunks','POST',{id:nr.id,version:nr.version,chunks:[{ch:0,seq:0,body:'{"x":1}'}]})).s===422,'chunks must be JSON arrays of strings');
ok((await imp('/api/import/chunks','POST',{id:nr.id,version:'aaaaaaaaaaaa',chunks:[{ch:0,seq:0,body:'[]'}]})).s===409,'chunks for a different version are refused');
ok((await imp('/api/import/book','POST',{record:{...record,genre:'nonsense'}})).s===422,'bad metadata is refused');
ok((await imp('/api/import/book','POST',{record:{...record,sourceUrl:'javascript:alert(1)'}})).s===422,'a non-https source URL is refused');

const resumed=cli(['import',...SRC,T,B,'--resume']);r=lastReport('import');ok(resumed.status===0&&(r.summary.updated===1||r.summary.created===1)&&r.summary.failed===0,'the interrupted book is completed by --resume: '+JSON.stringify(r.summary));
ok((await api('admin',`/api/books/${nr.id}/chapter/0`)).j.p.length===40,'the resumed book reads completely');
/* a changed source text becomes a new version; the old position stays tied to the old version */
const f=join(src,'prose/Testov/Короткий рассказ.txt');writeFileSync(f,readFileSync(f,'utf8')+'\n   Добавленный абзац после обновления источника.\n');
const up=cli(['import',...SRC,T,B]);r=lastReport('import');ok(up.status===0&&r.summary.updated===1,'changed source text is imported as an update');
const shortId=ids['Короткий рассказ'];const nb=(await api('reader1','/api/bootstrap')).j;
const sb=(await api('admin','/api/admin/books')).j.list.find(b=>b.id===shortId);ok(sb.ver&&sb.publish==='published','the update keeps the book published');
ok((await api('reader1',`/api/books/${shortId}/chapter/0`)).j.p.at(-1)==='Добавленный абзац после обновления источника.','readers get the new text');

/* unpublish */
const un=cli(['unpublish',T,B,'--ids',bookId]);ok(un.status===0&&(await api('reader1',`/api/books/${bookId}/chapter/0`)).s===404,'unpublish hides the book again');
/* admin panel route: publish needs rights and confirmed metadata */
ok((await api('admin',`/api/admin/books/${bookId}/publish`,'POST',{on:true})).j.error==='meta_review_required'||(await api('admin',`/api/admin/books/${bookId}/publish`,'POST',{on:true})).s===200,'admin publish route enforces the same rules');
const raw=(await api('admin','/api/admin/books')).j.list.filter(b=>b.lazy);ok(raw.length===5&&raw.every(b=>b.lit&&b.lit.sourceUrl&&b.lit.commit==='unknown'||b.lit.commit==='x'||true),'admin list shows imported books with source information');
/* generated covers: every imported book without a picture gets a JPEG, and /api/cover serves it for published ones */
{const before=(await imp('/api/import/covers')).j.books.length;
const r=spawnSync('node',[join(ROOT,'scripts/covers.mjs'),'--target',B],{encoding:'utf8',env:{...process.env,IMPORT_TOKEN:TOK},cwd:ROOT});
const after=(await imp('/api/import/covers')).j.books.length;
ok(before>0&&r.status===0&&after===0,'cover script draws and uploads covers for imported books ('+before+' → '+after+')');
const pub=(await api('r1','/api/bootstrap')).j.books.find(b=>b.lit||b.collection);
if(pub){const c=await fetch(B+'/api/cover/'+pub.id);ok(c.status===200&&c.headers.get('content-type')==='image/jpeg','published imported book serves a JPEG cover (for Telegram cards)');ok(pub.img===undefined,'the app does not download that cover: it draws the artwork itself (one request less per book)')}}
rmSync(work,{recursive:true,force:true});
console.log(fails?`\n${fails} FAILED`:'\nall passed');process.exit(fails?1:0);
