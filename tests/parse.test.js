import test from 'node:test';import assert from 'node:assert/strict';
import {parseManuscript} from '../worker/parse.js';
test('chapters from headings in ru and uz',()=>{
  const c=parseManuscript('# Начало\n\nОдин.\n\nДва.\n\nГлава 2. Дорога\n\nТри.\n\n3-bob\n\nTo‘rt.\n\nQism 4\n\nBesh.');
  assert.equal(c.length,4);assert.equal(c[0].t,'Начало');assert.equal(c[1].t,'Дорога');assert.match(c[2].t,/3|bob/i);assert.match(c[3].t,/4|qism/i)
});
test('plain text without headings is split into parts',()=>{const c=parseManuscript(Array.from({length:30},(_,i)=>'Абзац '+i).join('\n\n'));assert.ok(c.length>=2);assert.equal(c[0].t,'Глава 1')});
test('empty input',()=>assert.deepEqual(parseManuscript('  \n '),[]));
import {stripGutenberg} from '../scripts/gutenberg.js';
test('Gutenberg licence header and footer are removed',()=>{
  const t='Project Gutenberg license intro\n*** START OF THE PROJECT GUTENBERG EBOOK WAR AND PEACE ***\n\nГлава 1\n\nТекст.\n\n*** END OF THE PROJECT GUTENBERG EBOOK WAR AND PEACE ***\nlicense footer';
  assert.equal(stripGutenberg(t),'Глава 1\n\nТекст.');assert.equal(stripGutenberg('Просто текст'),'Просто текст');
});
