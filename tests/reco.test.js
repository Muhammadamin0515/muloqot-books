import test from 'node:test';import assert from 'node:assert/strict';
import {recommend} from '../src/reco.js';
const B=(id,a,genre,o={})=>({id,a,genre,lang:'ru',fullText:true,pop:1,count:0,rating:0,...o});
const books=[B('b1','a1','novel'),B('b2','a1','novel'),B('b3','a2','detective'),B('b4','a3','novel'),B('b5','a3','novel',{fullText:false}),B('b6','a4','detective',{lang:'uz'})];
test('no signal, no recommendations',()=>assert.deepEqual(recommend({books}),[]));
test('same author and genre first, read books excluded, readable preferred',()=>{
  const r=recommend({books,finished:['b1']}).map(x=>x.book.id);
  assert.equal(r[0],'b2');assert.ok(!r.includes('b1'));assert.ok(r.indexOf('b4')<r.indexOf('b5'),'readable book ranks above metadata-only');
});
test('low rating pushes a genre away',()=>{const r=recommend({books,finished:['b3'],ratings:{b1:1,b3:5}}).map(x=>x.book.id);assert.ok(!r.includes('b1'));assert.equal(r[0],'b6')});
test('explains why',()=>{const r=recommend({books,finished:['b1']});assert.equal(r[0].why.kind,'author');assert.equal(r[0].why.book.id,'b1')});
