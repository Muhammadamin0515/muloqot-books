import test from 'node:test';import assert from 'node:assert/strict';
import {validateImport,canRead,rightsOf,publicRights,checkTextRights,popularity,fetchCover,COVER_HOSTS} from '../worker/catalog.js';
const text='Глава 1\n\n'+'Абзац оригинального текста для проверки импорта. '.repeat(30)+'\n\nГлава 2\n\n'+'Второй абзац. '.repeat(50);
const base={title:'Классика',author:'Автор Тестов',lang:'ru',genre:'novel',year:1900,source:{name:'Wikisource',url:'https://ru.wikisource.org/'},text};
const NOW=2026;
test('public domain needs a death year old enough',()=>{
  assert.equal(validateImport({...base,rights:{status:'public_domain'}},{now:NOW}).error,'pd_not_proven');
  assert.equal(validateImport({...base,authorDeathYear:2000,rights:{status:'public_domain'}},{now:NOW}).error,'pd_not_proven');
  assert.equal(validateImport({...base,authorDeathYear:1955,rights:{status:'public_domain'}},{now:NOW}).error,undefined,'1955 + 71 years = 2026');
  assert.equal(validateImport({...base,authorDeathYear:1956,rights:{status:'public_domain'}},{now:NOW}).error,'pd_not_proven');
});
test('a translation needs the translator to be out of copyright as well',()=>{
  const tr={...base,translator:'Тестовый Переводчик',authorDeathYear:1900,rights:{status:'public_domain'}};
  assert.equal(validateImport(tr,{now:NOW}).error,'translator_pd_not_proven');
  assert.equal(validateImport({...tr,translatorDeathYear:2000},{now:NOW}).error,'translator_pd_not_proven');
  assert.equal(validateImport({...tr,translatorDeathYear:1955},{now:NOW}).error,undefined);
  assert.equal(validateImport({...tr,translatorDeathYear:1956},{now:NOW}).error,'translator_pd_not_proven');
  assert.ok(validateImport({...tr,rights:{status:'permission',note:'Письмо переводчика'}},{now:NOW}).book,'a written permission covers a living translator');
});
test('other bases need evidence',()=>{
  assert.equal(validateImport({...base,rights:{status:'licensed'}}).error,'evidence');
  assert.equal(validateImport({...base,rights:{status:'licensed',evidenceUrl:'http://insecure'}}).error,'evidence');
  assert.ok(validateImport({...base,rights:{status:'permission',note:'Письмо правообладателя'}}).book);
  assert.equal(validateImport({...base,rights:{status:'unverified'}}).error,'rights_required');
  assert.equal(validateImport({...base,rights:{status:'whatever'}}).error,'rights_required');
});
test('metadata-only records are allowed without rights, but need a source',()=>{
  const r=validateImport({...base,text:'',rights:{status:'unverified'}});assert.equal(r.book.chapters.length,0);assert.equal(canRead(r.book),false);
  assert.equal(validateImport({...base,text:'',source:{}}).error,'source');
});
test('field validation',()=>{
  const ok={...base,authorDeathYear:1900,rights:{status:'public_domain'}};
  assert.equal(validateImport({...ok,title:'a'}).error,'title');assert.equal(validateImport({...ok,lang:'en'}).error,'lang');assert.equal(validateImport({...ok,genre:'x'}).error,'genre');
  assert.equal(validateImport({...ok,text:'x'.repeat(1_500_000)}).error,'toolarge');
  const b=validateImport({...ok,isbn:'bad',series:'Цикл',seriesNo:2}).book;assert.equal(b.isbn,undefined);assert.equal(b.series,'Цикл');assert.equal(b.seriesNo,2);assert.equal(b.pages>0,true);
});
test('legacy and demo books',()=>{
  assert.equal(canRead({chapters:[]}),true,'legacy author submissions stay readable');assert.equal(rightsOf({}).legacy,true);
  assert.equal(canRead({demo:1,rights:{status:'unverified'}}),true);assert.equal(canRead({rights:{status:'unverified'}}),false);
  assert.deepEqual(Object.keys(publicRights({rights:{status:'author',evidenceUrl:'https://secret',note:'private'}})).sort(),['license','source','sourceUrl','status']);
});
test('size guard',()=>assert.equal(checkTextRights({status:'author',note:'x'},null,'я'.repeat(800_000)),'toolarge'));
test('popularity uses real signals only',()=>{assert.equal(popularity({},0),0);assert.ok(popularity({reads:5,finishes:2},3)>popularity({reads:5},3))});
test('cover download is limited to allowed hosts',async()=>{
  let called=0;const f=async()=>{called++;return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}})};
  assert.equal(await fetchCover('https://evil.example/x.png',f),null);assert.equal(called,0);
  assert.equal(await fetchCover('http://169.254.169.254/latest',f),null);
  assert.match(await fetchCover(`https://${COVER_HOSTS[0]}/b/id/1-L.jpg`,f),/^data:image\/png;base64,/);
  assert.equal(await fetchCover(`https://${COVER_HOSTS[0]}/a.html`,async()=>new Response('x',{headers:{'content-type':'text/html'}})),null);
});
import {readFileSync} from 'node:fs';
test('the shipped starter catalog is valid, honest metadata (no text, no unproven rights)',()=>{
  const recs=JSON.parse(readFileSync(new URL('../data/catalog.classics.json',import.meta.url),'utf8'));
  assert.ok(recs.length>=20);const seen=new Set();
  for(const r of recs){
    const v=validateImport(r,{now:2026});assert.equal(v.error,undefined,r.title+': '+v.error);
    assert.equal(v.book.chapters.length,0,'no full text in the starter catalog');assert.equal(canRead(v.book),false);
    assert.ok(r.authorDeathYear<=2026-71,r.title+' must be old enough to be public domain after verification');
    const k=r.title+'|'+r.author;assert.ok(!seen.has(k),'duplicate '+k);seen.add(k);
  }
});
