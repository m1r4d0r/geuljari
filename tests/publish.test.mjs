import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createHandler } from '../server/articles.mjs';
import { createReaderHandler } from '../server/reader-page.mjs';
import { memoryStore } from './publish-server.mjs';
const window = {};
vm.runInNewContext(await readFile(new URL('../publish-crypto.js', import.meta.url), 'utf8'), { window, crypto:webcrypto, TextEncoder, TextDecoder, Uint8Array, btoa, atob, URL, location:{origin:'https://test.invalid'} });
const C = window.GeulCrypto, store = memoryStore(), handler = createHandler(() => store);
const call = async (method, path, data, origin) => {
  const r = await handler(new Request('https://test.invalid/api/articles' + path, { method, headers:{'Content-Type':'application/json', ...(origin ? {origin} : {})}, ...(data ? {body:JSON.stringify(data)} : {}) }));
  return { status:r.status, data:await r.json(), headers:r.headers };
};
const id = C.random(16), key = C.random(32), password = 'test-only-password';
const doc = {version:1, source:'테스트용 글이에요.', title:'<script>alert(1)</script>', settings:{}, made:'2026-10-11'};
let record;
test('암호화·인증·수정·중단·삭제와 제목 미리보기', async () => {
  const sealed = await C.seal(doc, id, key);
  assert.equal((await C.open({id,...sealed}, key)).source, doc.source);
  await assert.rejects(C.open({id,...sealed}, C.random(32)));
  await assert.rejects(C.open({id:C.random(16),...sealed}, key));
  const body = {id, password, title:doc.title, live:true, ...sealed};
  let r = await call('POST','',body); assert.equal(r.status,201); record = r.data;
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(record.passwordHash,undefined); assert.equal(record.salt,undefined);
  assert.ok(!JSON.stringify(store.rows.get(id)).includes(doc.source));
  assert.equal((await call('POST','',body)).data.revision,1);
  assert.equal((await call('POST','',{...body,title:'다른 글'})).status,409);
  assert.equal((await call('GET','/'+id)).status,200);
  assert.equal((await call('POST','/'+id+'/unlock',{password:'wrong-password'})).status,401);
  assert.equal((await call('PUT','/'+id,{...body,revision:1},'https://evil.invalid')).status,403);
  const template = await readFile(new URL('../published.html',import.meta.url),'utf8');
  const page = createReaderHandler(() => store,template);
  let html = await (await page(new Request('https://test.invalid/t/'+id))).text();
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes(doc.title)); assert.ok(!html.includes(sealed.cipher));
  r = await call('PUT','/'+id,{...body,live:false,revision:1}); assert.equal(r.status,200); assert.equal(r.data.revision,2);
  assert.equal((await call('GET','/'+id)).status,404);
  assert.equal((await call('POST','/'+id+'/unlock',{password})).status,200);
  html = await (await page(new Request('https://test.invalid/t/'+id))).text(); assert.ok(!html.includes('&lt;script&gt;'));
  assert.equal((await call('PUT','/'+id,{...body,revision:1})).status,409);
  assert.equal((await call('DELETE','/'+id,{password,revision:1})).status,409);
  assert.equal((await call('PUT','/'+id,{...body,revision:2})).status,200);
  assert.equal((await call('DELETE','/'+id,{password,revision:3})).status,200);
  assert.equal((await call('GET','/'+id)).status,404);
});
test('잘못된 입력과 저장소 미설정은 안전하게 실패',async () => {
  assert.equal((await call('POST','',{password,id,title:'x',cipher:'x',iv:'x',live:true})).status,400);
  assert.equal((await call('POST','',{password,stuff:'x'.repeat(360001)})).status,413);
  // 비밀번호는 4~128자면 되고 그 밖의 제약은 없어요.
  for (const p of ['123','x'.repeat(129)]) { const r = await call('POST','',{password:p,id}); assert.equal(r.status,400); assert.equal(r.data.error,'invalid_password'); }
  const r4 = await call('POST','',{password:'1234',id,title:'x',cipher:'x',iv:'x',live:true}); assert.notEqual(r4.data.error,'invalid_password');
  assert.equal((await call('GET','/invalid')).status,404);
  const offline = createHandler(() => {throw new Error('secret credentials');});
  const r = await offline(new Request('https://test.invalid/api/articles/'+id));
  assert.equal(r.status,503); assert.ok(!(await r.text()).includes('secret'));
});
