import test from 'node:test';import assert from 'node:assert/strict';
import {buildRequest,parseText,PROVIDERS} from '../worker/ai.js';
test('groq and openrouter use the OpenAI chat format with a bearer key',()=>{
  for(const p of ['groq','openrouter']){
    const r=buildRequest(p,'m1','KEY',{system:'S',prompt:'P',max:500,temperature:.5}),b=JSON.parse(r.init.body);
    assert.equal(r.url,PROVIDERS[p].url);assert.equal(r.init.headers.authorization,'Bearer KEY');
    assert.deepEqual(b.messages,[{role:'system',content:'S'},{role:'user',content:'P'}]);assert.equal(b.max_tokens,500);assert.equal(b.model,'m1');
  }
});
test('gemini sends the key in a header, never in the URL',()=>{
  const r=buildRequest('gemini','gemini-2.5-flash','KEY',{system:'S',prompt:'P',max:300});
  assert.ok(!r.url.includes('KEY'));assert.equal(r.init.headers['x-goog-api-key'],'KEY');
  const b=JSON.parse(r.init.body);assert.equal(b.systemInstruction.parts[0].text,'S');assert.equal(b.generationConfig.maxOutputTokens,300);
});
test('answers are parsed per provider and empty ones give an empty string',()=>{
  assert.equal(parseText('groq',{choices:[{message:{content:' hi '}}]}),'hi');
  assert.equal(parseText('gemini',{candidates:[{content:{parts:[{text:'a'},{text:'b'}]}}]}),'ab');
  assert.equal(parseText('gemini',{}),'');assert.equal(parseText('openrouter',null),'');
});
