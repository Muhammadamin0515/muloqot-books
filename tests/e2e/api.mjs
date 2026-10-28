/* API scenarios against a running `wrangler dev` with an EMPTY local database: rights, demo separation, ratings, access control. */
import {readFileSync} from 'node:fs';
const B=process.env.BASE||'http://localhost:8806';
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const api=async(who,path,method='GET',body,hdr={})=>{const h={'content-type':'application/json',...hdr};if(who)h['x-dev-user']=who;const r=await fetch(B+path,{method,headers:h,body:body&&JSON.stringify(body)});return{s:r.status,j:await r.json().catch(()=>null)}};
const para='Это тестовый абзац оригинального текста для проверки импорта и разбора на главы. ';
const txt='Глава 1\n\n'+para.repeat(20)+'\n\nГлава 2\n\n'+para.repeat(20);
const rec={title:'Классика',author:'Автор Тестов',lang:'ru',genre:'novel',year:1900,description:'Описание тестовой книги.',source:{name:'Wikisource',url:'https://ru.wikisource.org/'},text:txt};
const imp=(r,who='admin')=>api(who,'/api/admin/import','POST',{records:[r]}).then(x=>x.j.results?.[0]||x.j);

/* demo on a fresh database */
let b=(await api('r1','/api/bootstrap')).j;
ok(b.demo===true&&b.books.length===12,'fresh database: demo catalog visible');
ok(b.books.every(x=>x.rights.status==='demo'&&x.fullText),'demo books are marked as demo and readable');

/* import rules */
ok((await imp({...rec,rights:{status:'unverified'}})).error==='rights_required','text without rights is refused');
ok((await imp({...rec,rights:{status:'public_domain'}})).error==='pd_not_proven','public domain without death year is refused');
ok((await imp({...rec,authorDeathYear:2000,rights:{status:'public_domain'}})).error==='pd_not_proven','recent author is not public domain');
ok((await imp({...rec,rights:{status:'licensed'}})).error==='evidence','licence needs evidence');
ok((await imp({...rec,genre:'x',rights:{status:'public_domain'},authorDeathYear:1900})).error==='genre','invalid genre refused');
const card=await imp({...rec,title:'Только карточка',text:'',rights:{status:'unverified'}});ok(card.id&&!card.fullText,'metadata-only card is allowed');
const pd=await imp({...rec,title:'Классика',authorDeathYear:1910,rights:{status:'public_domain',license:'PD'}});ok(pd.id&&pd.fullText,'public domain text with proof is imported');
ok((await imp({...rec,title:'Классика',authorDeathYear:1910,rights:{status:'public_domain'}})).error==='duplicate','duplicates are refused');
ok((await api('r1','/api/admin/import','POST',{records:[rec]})).s===403,'readers cannot import');

/* demo is hidden now, real books are clean */
b=(await api('r1','/api/bootstrap')).j;
ok(b.demo===false&&b.books.length===2&&b.reviews.length===0&&b.threads.length===0&&b.quotes.length===0&&b.collections.length===0&&b.weekly===null,'demo books, reviews, threads, quotes and collections are hidden');
const real=b.books.find(x=>x.id===pd.id);
ok(real.rating===0&&real.count===0&&real.pop===0&&real.dist.every(n=>n===0),'a new real book has no rating, no popularity');
ok(real.chapters.length===2&&!('text' in real),'catalog list carries chapter titles only');

/* text access follows the rights */
ok((await api('r1',`/api/books/${pd.id}/text`)).s===200,'rights confirmed: text served');
ok((await api('r1',`/api/books/${card.id}/text`)).s===403&&(await api('admin',`/api/books/${card.id}/text`)).s===200,'no rights: readers get 403, admin may preview');
ok((await api('admin',`/api/admin/books/${card.id}/text`,'POST',{text:txt,rights:{status:'public_domain'},sourceName:'x'})).j.error==='pd_not_proven','attaching text needs proof');
ok((await api('admin',`/api/admin/books/${card.id}/text`,'POST',{text:txt,sourceName:'Издательство',rights:{status:'permission',note:'Письмо правообладателя'}})).s===200,'attaching text with a document works');
ok((await api('r1',`/api/books/${card.id}/text`)).s===200,'... and the text becomes available');
ok((await api('admin',`/api/admin/books/${pd.id}/rights`,'POST',{status:'unverified'})).s===200&&(await api('r1',`/api/books/${pd.id}/text`)).s===403,'revoking rights hides the text at once');
ok((await api('admin',`/api/admin/books/${pd.id}/rights`,'POST',{status:'public_domain'})).s===200&&(await api('r1',`/api/books/${pd.id}/text`)).s===200,'re-confirming uses the stored death year');

/* ratings are real */
await api('r1',`/api/books/${pd.id}/rate`,'POST',{value:5});const r2=await api('r2',`/api/books/${pd.id}/rate`,'POST',{value:3});
ok(r2.j.rating===4&&r2.j.count===2,'rating is the mean of real ratings only');
b=(await api('r1','/api/bootstrap')).j;const rb=b.books.find(x=>x.id===pd.id);
ok(rb.dist.join()==='0,0,1,0,1','rating distribution is counted');
await api('r1',`/api/books/${pd.id}/event`,'POST',{type:'read'});await api('r1',`/api/books/${pd.id}/event`,'POST',{type:'finish'});
b=(await api('r1','/api/bootstrap')).j;ok(b.books.find(x=>x.id===pd.id).pop>0&&b.books.find(x=>x.id===card.id).pop===0,'popularity comes from real activity');
ok((await api('r1',`/api/books/${pd.id}/rate`,'POST',{value:9})).s===400,'rating out of range is refused');

/* demo switch */
ok((await api('admin','/api/admin/demo','POST',{show:true})).s===200&&(await api('r1','/api/bootstrap')).j.books.length===14,'admin can show demo data');
await api('admin','/api/admin/demo','POST',{show:'auto'});

/* audio follows the same rule */
await api('admin',`/api/admin/books/${card.id}/rights`,'POST',{status:'unverified'});
ok((await api('admin',`/api/admin/books/${card.id}/audio`,'POST',{tracks:[{url:'https://x.y/a.mp3'}]})).j.error==='rights_required','audio needs confirmed rights');
ok((await api('admin',`/api/admin/books/${pd.id}/audio`,'POST',{tracks:[{url:'http://x.y/a.mp3'}]})).j.error==='url','audio links must be https');
ok((await api('admin',`/api/admin/books/${pd.id}/audio`,'POST',{tracks:[{url:'javascript:alert(1)'}]})).j.error==='url','javascript: links are refused');
ok((await api('admin',`/api/admin/books/${pd.id}/audio`,'POST',{tracks:[{title:'Часть 1',url:'https://x.y/a.mp3',duration:600}]})).s===200&&(await api('r1',`/api/books/${pd.id}/audio`)).j.tracks.length===1,'audio tracks saved and listed');

/* access control */
ok((await api(null,'/api/bootstrap')).s===401,'no credentials: 401');
ok((await api(null,'/api/bootstrap','GET',undefined,{authorization:'tma auth_date=1&hash=00'})).s===401,'forged initData: 401');
const adminRoutes=[...readFileSync(new URL('../../worker/index.js',import.meta.url),'utf8').matchAll(/^route\('(GET|POST)','(\/api\/admin\/[^']*)'/gm)].map(m=>[m[1],m[2].replace(/:\w+/g,'x')]);
let leaked=[];for(const [m,p] of adminRoutes){const r=await api('reader9',p,m,m==='POST'?{}:undefined);if(r.s!==403)leaked.push(m+' '+p+' '+r.s)}
ok(adminRoutes.length>40&&leaked.length===0,`all ${adminRoutes.length} admin routes refuse a normal reader`+(leaked.length?': '+leaked.join('; '):''));
/* ownership */
const sub=(await api('author1','/api/submissions','POST',{title:'Моя книга',desc:'Описание достаточно длинное.',genre:'novel',lang:'ru',rights:true,body:txt})).j.sub;
ok(sub&&(await api('author2',`/api/submissions/${sub.id}`)).s===404,'another user cannot read my submission');
ok((await api('author2',`/api/submissions/${sub.id}/withdraw`,'POST',{})).s===404,'another user cannot withdraw my submission');
await api('admin',`/api/admin/submissions/${sub.id}/approve`,'POST',{});
const mine=(await api('author1','/api/bootstrap')).j.subs.find(x=>x.id===sub.id).bookId;
ok(mine&&(await api('author2',`/api/author/books/${mine}/edit`,'POST',{title:'Взлом',desc:'x'.repeat(30)})).s===404,'another user cannot edit my book');
ok((await api('author2',`/api/author/books/${mine}/update`,'POST',{body:txt})).s===404,'another user cannot replace my text');
const approved=(await api('r1','/api/bootstrap')).j.books.find(x=>x.id===mine);ok(approved.rights.status==='author'&&approved.fullText,'author-approved book records the author basis');
/* upload checks */
const big=await api('author1','/api/submissions','POST',{title:'Огромная',desc:'Описание достаточно длинное.',genre:'novel',lang:'ru',rights:true,body:'Глава 1\n\n'+'я'.repeat(800000)});
ok(big.s===413&&big.j.error==='toolarge','oversized text is refused');
ok((await api('author1','/api/submissions','POST',{title:'Обложка',desc:'Описание достаточно длинное.',genre:'novel',lang:'ru',rights:true,body:txt,cover:'data:text/html;base64,PHNjcmlwdD4='})).j.error==='coverformat','non-image cover is refused');
ok((await api('author1','/api/submissions','POST',{title:'Без прав',desc:'Описание достаточно длинное.',genre:'novel',lang:'ru',body:txt})).j.error==='rights','submission without the rights confirmation is refused');
const huge=await fetch(B+'/api/state',{method:'PUT',headers:{'content-type':'application/json','x-dev-user':'r1','content-length':'9000000'},body:'{}'}).catch(()=>null);
ok(!huge||huge.status!==200,'declared oversized request is not accepted');
/* starter catalog file imports cleanly through the real endpoint */
const starter=JSON.parse(readFileSync(new URL('../../data/catalog.classics.json',import.meta.url),'utf8'));let res=[];
for(let i=0;i<starter.length;i+=8)res.push(...(await api('admin','/api/admin/import','POST',{records:starter.slice(i,i+8)})).j.results);
ok(res.length===starter.length&&res.every(r=>r.id&&!r.fullText),`starter catalog: ${res.length} cards imported without text`);
const sb=(await api('r1','/api/bootstrap')).j;ok(sb.books.filter(b=>!b.fullText).length>=starter.length&&sb.authors.length>=10,'cards and authors appear in the catalog');
/* achievements ignore ids of books that are gone or hidden (demo) */
await api('ghost','/api/state','PUT',{finished:['b1','b2','b3','gone1'],saved:['b1','b2','b3','b4','b5','gone2']});
{const a=(await api('ghost','/api/achievements')).j.list;const g=id=>a.find(x=>x.id===id);ok(!g('r_fin1').unlocked&&!g('r_save5').unlocked,'finished/saved ids of hidden or missing books do not unlock achievements');}
/* share page: Telegram builds the card from these tags */
{const bid=(await api('r1','/api/bootstrap')).j.books[0].id;const r=await fetch(B+'/b/'+bid),h=await r.text();ok(r.status===200&&/og:site_name" content="Muloqot Books"/.test(h)&&/og:title/.test(h)&&!/⭐ 0/.test(h),'share page /b/:id carries card tags without a fake rating');ok((await fetch(B+'/b/nope')).status===404,'unknown book share page is 404');}
/* admin overview counts only real published books */
{const st=(await api('admin','/api/admin/stats')).j,bs=(await api('admin','/api/bootstrap')).j.books;ok(st.books===bs.filter(b=>!b.demo).length&&st.demoBooks>=12&&st.errors.length===0,'admin overview: real books exclude demo and drafts ('+st.books+' real, '+st.demoBooks+' demo)')}
/* purging the test sample: needs confirmation, removes only demo content */
{const a=await api('admin','/api/admin/demo/purge','POST',{});ok(a.s===400,'purge needs explicit confirmation');
const before=(await api('admin','/api/admin/stats')).j,r=await api('admin','/api/admin/demo/purge','POST',{confirm:true});
const after=(await api('admin','/api/admin/stats')).j;
ok(r.s===200&&r.j.deleted>=12&&after.demoBooks===0&&after.books===before.books,'purge removes the demo books and keeps real ones ('+r.j.deleted+' deleted)');
ok(r.j.counts.reviews>=10&&r.j.counts.threads>=4&&r.j.counts.comments>=6&&r.j.counts.quotes>=5&&r.j.counts.collections>=1&&r.j.counts.weekly===1,'the sample reviews, discussions, comments, quotes, collections and the weekly question go too ('+JSON.stringify(r.j.counts)+')');
const bs=(await api('admin','/api/bootstrap')).j;ok(bs.books.every(b=>!b.demo)&&bs.books.length===before.books,'catalog after purge has only real books');
ok(bs.reviews.every(r=>r.id.length>3)&&bs.threads.every(x=>x.id.length>3)&&bs.quotes.every(q=>q.id.length>3)&&bs.collections.every(c=>c.id.length>3)&&!bs.weekly,'no sample review, thread, quote, collection or weekly question is left');}

/* the shared catalog: built once, personal marks added per reader, cleared when something changes */
{const raw=async who=>{const r=await fetch(B+'/api/bootstrap',{headers:{'x-dev-user':who}});return{h:r.headers.get('x-catalog-cache'),j:await r.json()}};
const a1=await raw('cacheA'),a2=await raw('cacheA'),b1=await raw('cacheB');
ok(['mem','db','built'].includes(a1.h)&&a2.h==='mem'&&b1.h==='mem','the second and third readers get the catalog from the cache ('+a1.h+', '+a2.h+', '+b1.h+')');
ok(JSON.stringify(a1.j.books)===JSON.stringify(b1.j.books)&&a1.j.me.id==='cacheA'&&b1.j.me.id==='cacheB','the books are shared, "me" is personal');
const bid=a1.j.books[0].id;
await api('cacheA','/api/books/'+bid+'/rate','POST',{value:5});
const rv=await api('cacheA','/api/reviews','POST',{bookId:bid,rating:5,text:'Отличная книга, читал с удовольствием до конца.'});
const a3=await raw('cacheA'),b3=await raw('cacheB');
const mine=a3.j.reviews.find(r=>r.text.startsWith('Отличная книга')),other=b3.j.reviews.find(r=>r.text.startsWith('Отличная книга'));
ok(rv.s===200&&mine&&mine.mine===true&&other&&other.mine===false,'a new review is visible at once (the cache is cleared), marked as mine only for its author');
ok(a3.j.ratings[bid]===5&&b3.j.ratings[bid]===undefined,'my rating is personal');
const hid=await api('admin','/api/admin/books/'+bid+'/hide','POST',{on:true});const a4=await raw('cacheA');
ok(hid.s===200&&!a4.j.books.some(b=>b.id===bid),'hiding a book removes it from the catalog at once');
await api('admin','/api/admin/books/'+bid+'/hide','POST',{on:false});const a5=await raw('cacheA');ok(a5.j.books.some(b=>b.id===bid),'and showing it brings it back at once');
const before=Date.now();for(let i=0;i<5;i++)await raw('cacheB');
const meta=(await api('admin','/api/admin/stats')).j;ok(meta.errors.length===0,'the cache row does not disturb the admin overview');void before;}
/* audit */
const au=(await api('admin','/api/admin/audit')).j.list.map(x=>x.action);ok(['import','rights','text','audio','demo'].every(a=>au.includes(a)),'rights and import actions are written to the audit log');
console.log(fails?`\n${fails} FAILED`:'\nall passed');process.exit(fails?1:0);
