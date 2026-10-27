import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {makeTree} from './ruslit-fixture.mjs';
import {scan,summarize,parseCsv,parseYear,looksLikeName,fuzzyCsv} from '../scripts/ruslit/scan.js';
import {decode,prepareText,finalize,inspect,CHUNK_CHARS} from '../scripts/ruslit/prepare.js';

const dir=mkdtempSync(join(tmpdir(),'ruslit-'));makeTree(dir);
const res=scan(dir,{commit:'deadbeef'});const by=n=>res.records.find(r=>r.path.endsWith(n+'.txt'));

test('discovery: only .txt works, service files are ignored, nothing is lost',()=>{
  assert.equal(res.files,7);assert.equal(res.records.length,7);assert.deepEqual(res.ignored,['README.md']);
});
test('broken files are reported and do not stop the rest',()=>{
  assert.equal(by('Пустой').status,'error');assert.equal(by('Пустой').error,'empty');
  assert.equal(by('Бинарный').status,'error');assert.equal(by('Бинарный').error,'binary');
  assert.equal(res.errors.length,2);assert.equal(res.records.filter(r=>r.status!=='error').length,5);
});
test('identical content is flagged as a duplicate, never merged silently',()=>{
  const a=by('Дубль повести'),b=by('Повесть о тесте'),dup=a.dupOf?a:b,orig=a.dupOf?b:a;
  assert.equal(dup.status,'duplicate');assert.equal(dup.dupOf,orig.id);assert.equal(dup.hash,orig.hash);assert.ok(!orig.dupOf,'the first one stays the original');
  assert.equal(summarize(res).exactDuplicates,1);
});
test('metadata comes from info.csv and the file header, nothing is invented',()=>{
  const r=by('Повесть о тесте');assert.equal(r.title,'Повесть о тесте');assert.equal(r.year,1900);assert.equal(r.author,'Иван Тестов');assert.equal(r.lang,'ru');assert.equal(r.genre,'prose');
  assert.equal(by('Короткий рассказ').year,1901);assert.equal(by('Короткий рассказ').yearRaw,'1901-1902');
  assert.equal(by('Тестовое стихотворение').genre,'poetry');
  assert.ok(r.review.includes('author_not_in_curated_mapping'),'an author outside the curated list is flagged for review');
  assert.equal(r.sourceCommit,'deadbeef');assert.match(r.sourceUrl,/blob\/deadbeef\/prose\/Testov\//);assert.match(r.id,/^rl[0-9a-f]{10}$/);
});
test('structure: parts and roman numerals become chapters, notes stay one section, headerless text is a single section',()=>{
  const r=by('Повесть о тесте');assert.deepEqual(r.toc.map(c=>c.t),['Часть первая. I','Часть первая. II','Часть первая. III','Примечания']);
  assert.equal(by('Короткий рассказ').structure,'single');assert.equal(by('Короткий рассказ').chapters,1);
});
test('paragraphs: one per line, indentation removed, header lines removed, note numbers joined to their text',()=>{
  const r=prepareText(readFileSync(join(dir,'prose/Testov/Повесть о тесте.txt'),'utf8'),{title:'Повесть о тесте',author:'Иван Тестов'});
  assert.equal(r.chapters[0].paras.length,30);assert.ok(!r.chapters[0].paras.some(p=>p.includes('Иван Тестов')));
  assert.deepEqual(r.chapters.at(-1).paras,['1. Первое тестовое примечание.','2. Второе тестовое примечание.']);
  const s=prepareText(readFileSync(join(dir,'prose/Testov/Короткий рассказ.txt'),'utf8'),{title:'Короткий рассказ',author:'Иван Тестов'});
  assert.equal(s.chapters[0].paras.length,12);assert.ok(s.chapters[0].paras.every(p=>!/^\s/.test(p)));
});
test('verse keeps its line breaks and stanzas',()=>{
  const r=prepareText(readFileSync(join(dir,'poems/Testov/Тестовое стихотворение.txt'),'utf8'),{title:'Тестовое стихотворение',author:'Иван Тестов',kind:'poems'});
  assert.equal(r.chapters.length,1);assert.deepEqual(r.chapters[0].paras.map(p=>p.split('\n').length),[4,2]);
  assert.equal(r.chapters[0].paras[0].split('\n')[0],'Первая строка первой строфы,');
});
test('a non-UTF-8 file is decoded as windows-1251 and flagged',()=>{
  const r=by('Старая кодировка');assert.equal(r.encoding,'windows-1251');assert.ok(r.review.some(x=>x.startsWith('encoding:')));assert.equal(r.status,'needs_review');
  const d=decode(Buffer.from([0xcf,0xf0,0xe8,0xe2,0xe5,0xf2,0x20,0xec,0xe8,0xf0,0x21,0x20,0xcf,0xf0,0xe8,0xe2,0xe5,0xf2]));assert.equal(d.text,'Привет мир! Привет');
  assert.equal(decode(Buffer.from([0x89,0,0x50])).error,'binary');
});
test('hash and version are stable across runs and change with the content',()=>{
  const again=scan(dir,{commit:'other-commit'});
  for(const r of res.records)if(r.hash)assert.equal(again.records.find(x=>x.path===r.path).hash,r.hash,'same text, same hash, whatever the commit');
  const a=finalize(prepareText('Иван Тестов\nИмя\n\n'+'Абзац один.\n'.repeat(80),{title:'Имя',author:'Иван Тестов'})),b=finalize(prepareText('Иван Тестов\nИмя\n\n'+'Абзац два.\n'.repeat(80),{title:'Имя',author:'Иван Тестов'}));
  assert.notEqual(a.hash,b.hash);assert.equal(a.version.length,12);
});
test('chunks: every chunk is valid JSON, under the size limit, chapters are complete and in order',()=>{
  const big=Array.from({length:4000},(_,i)=>'Очень длинный абзац номер '+i+' '+'слово '.repeat(40)).join('\n');
  const f=finalize(prepareText('Иван Тестов\nБольшая\n\n'+big,{title:'Большая',author:'Иван Тестов'}));
  assert.ok(f.chunks.length>1);let paras=0;
  for(const c of f.chunks){assert.ok(c.body.length<=CHUNK_CHARS*1.2);const a=JSON.parse(c.body);assert.ok(Array.isArray(a)&&a.every(x=>typeof x==='string'));paras+=a.length}
  assert.equal(paras,4000);assert.deepEqual([...new Set(f.chunks.map(c=>c.ch))],[...Array(f.chapters).keys()]);
  assert.ok(f.toc.every(c=>c.n>0));
});
test('csv helpers',()=>{
  assert.deepEqual(parseCsv('name,year\n"A, B",1900\nC,1901-1902\n'),[['name','year'],['A, B','1900'],['C','1901-1902']]);
  assert.deepEqual(parseYear('1825-1826'),{year:1825,yearRaw:'1825-1826',valid:true});assert.equal(parseYear('18xx').valid,false);assert.equal(parseYear('').year,null);
  assert.ok(looksLikeName('Лев Толстой')&&looksLikeName('А. С. Пушкин')&&!looksLikeName('Часть первая I')&&!looksLikeName('Господин Прохарчин Иванович Третий Пятый'));
  assert.equal(fuzzyCsv('Республика Южного Креста',new Set(['Республика Юного Креста','Другое'])),'Республика Юного Креста');
  assert.equal(fuzzyCsv('Нет такого',new Set(['Совсем другое'])),null);
});
test('inspect flags suspicious content but accepts short poems',()=>{
  assert.equal(inspect('   ',{chars:0,chapters:[]}).fatal,'empty');
  const short={chars:100,chapters:[{}],structure:'single'};
  assert.ok(inspect('Короткий текст на русском языке, совсем короткий.',short,{kind:'prose'}).issues.includes('very_short'));
  assert.ok(!inspect('Короткий текст на русском языке, совсем короткий.',short,{kind:'poems'}).issues.includes('very_short'));
});
test.after(()=>rmSync(dir,{recursive:true,force:true}));
