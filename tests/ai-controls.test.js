import test from 'node:test';
import assert from 'node:assert/strict';
import {requestedChapterCount,parsePlan} from '../worker/orch-checks.js';
import {limitsFrom} from '../worker/orch-route.js';
import {openSecret,sealSecret} from '../worker/secret-box.js';

test('explicit chapter counts are read from Russian and Uzbek prompts',()=>{
  assert.equal(requestedChapterCount('Сделай роман на 32 главы'),32);
  assert.equal(requestedChapterCount('Нужно ровно 25 глав, с завершённым финалом'),25);
  assert.equal(requestedChapterCount('32 ta bobdan iborat kitob yoz'),32);
  assert.equal(requestedChapterCount('Напиши современный роман'),null);
  assert.equal(requestedChapterCount('Сделай 61 главу'),61);
});

test('a complete 32 chapter plan is preserved',()=>{
  const chapters=Array.from({length:32},(_,i)=>({title:`Глава ${i+1}`,summary:`Событие ${i+1}`}));
  const plan=parsePlan(JSON.stringify({chapters,wordsPerChapter:900}),{chapters:32});
  assert.equal(plan.chapters.length,32);
  assert.equal(plan.chapters.at(-1).title,'Глава 32');
});

test('admin limits stay under Worker caps and reject malformed values safely',()=>{
  const limits=limitsFrom({AI_MAX_CALLS:'300',AI_MAX_TOKENS:'200000',AI_MAX_JOBS:'3'},{maxCalls:900,maxTokens:'bad',maxJobs:2});
  assert.equal(limits.maxCalls,300);
  assert.equal(limits.maxTokens,200000);
  assert.equal(limits.maxJobs,2);
});

test('AI provider keys are encrypted and decrypt only with the correct master secret',async()=>{
  const key='test-provider-key-value';
  const encrypted=await sealSecret(key,'test-master-secret');
  assert.notEqual(encrypted,key);
  assert.equal(await openSecret(encrypted,'test-master-secret'),key);
  await assert.rejects(openSecret(encrypted,'different-master-secret'));
  await assert.rejects(sealSecret(key,''),/secure_storage_not_configured/);
});
