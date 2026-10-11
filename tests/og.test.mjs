import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { imageFields, crc32 } from '../server/og-png.mjs';
import { createHandler } from '../server/articles.mjs';
import { createReaderHandler } from '../server/reader-page.mjs';
import { createImageHandler } from '../server/og-image.mjs';
import { memoryStore } from './publish-server.mjs';

function chunk(type, data) {
  const c = Buffer.alloc(data.length + 12); c.writeUInt32BE(data.length); c.write(type, 4); data.copy(c, 8);
  c.writeUInt32BE(crc32(c.subarray(4, c.length - 4)), c.length - 4); return c;
}
function png(shade = 0, width = 1200) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(630, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * 630, shade);
  for (let i = 0; i < 630; i++) rows[i * (width * 4 + 1)] = 0;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), chunk('IHDR',ihdr), chunk('IDAT',deflateSync(rows)), chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
test('공개 PNG 검증: 형식·크기·손상·압축 폭탄 거부', () => {
  assert.deepEqual(imageFields({}), {});
  assert.match(imageFields({ogImage:png()}).ogHash,/^[a-f0-9]{64}$/);
  for (const image of [null, '', '<svg/>', png(0, 1199), 'a'.repeat(2666669), png().slice(0,-12)]) assert.throws(() => imageFields({ogImage:image}), {status:400});
  const damaged = Buffer.from(png(), 'base64'); damaged[50] ^= 1;
  assert.throws(() => imageFields({ogImage:damaged.toString('base64')}), {status:400});
  const original = Buffer.from(png(),'base64');
  const bomb = Buffer.concat([original.subarray(0,33), chunk('IDAT',deflateSync(Buffer.alloc(4000000))), chunk('IEND',Buffer.alloc(0))]);
  assert.throws(() => imageFields({ogImage:bomb.toString('base64')}), {status:400});
});
test('공개 카드·HTML·변경·재시도·중단·삭제·구형 자료 호환', async () => {
  const store = memoryStore(), api = createHandler(() => store), image = createImageHandler(() => store);
  const page = createReaderHandler(() => store, await readFile(new URL('../published.html',import.meta.url),'utf8'));
  const id = 'abcdefghijklmnopqrstuv', password = 'test-password';
  const data = {id,password,title:'<끝 장>',live:true,cipher:'A'.repeat(24),iv:'B'.repeat(16),ogImage:png()};
  const call = (method, path, d) => api(new Request('https://test.invalid/api/articles'+path, {method,headers:{'Content-Type':'application/json'},...(d ? {body:JSON.stringify(d)} : {})}));
  const url = hash => `https://test.invalid/og/${id}/${hash}.png`;
  const html = async () => (await page(new Request(`https://test.invalid/t/${id}`))).text();
  let r = await call('POST','',data); assert.equal(r.status,201); assert.equal((await r.json()).ogImage,undefined);
  const hash = (await store.get(id)).ogHash;
  const markup = await html(); assert.ok(markup.includes(url(hash))); assert.ok(markup.includes('content="1200"')); assert.ok(markup.includes('summary_large_image')); assert.ok(!markup.includes(data.cipher)); assert.ok(!markup.includes(password));
  r = await image(new Request(url(hash))); assert.equal(r.status,200); assert.equal(r.headers.get('content-type'),'image/png'); assert.equal(r.headers.get('cache-control'),'no-store'); assert.deepEqual(Buffer.from(await r.arrayBuffer()), Buffer.from(data.ogImage,'base64'));
  r = await image(new Request(url(hash),{method:'HEAD'})); assert.equal(r.status,200); assert.equal((await r.arrayBuffer()).byteLength,0);
  assert.equal((await image(new Request(url(hash),{method:'POST'}))).status,405);
  assert.equal((await image(new Request(url('bad')))).status,404);
  assert.equal((await call('POST','',data)).status,201);
  assert.equal((await call('POST','',{...data,ogImage:png(2)})).status,409);
  assert.equal((await call('PUT','/'+id,{...data,revision:1,ogImage:null})).status,400);
  const update = {...data,revision:1,ogImage:png(1)};
  assert.equal((await call('PUT','/'+id,update)).status,200);
  assert.equal((await (await call('PUT','/'+id,update)).json()).revision,2);
  const newHash = (await store.get(id)).ogHash; assert.notEqual(newHash,hash);
  assert.equal((await image(new Request(url(hash)))).status,404); assert.ok((await html()).includes(url(newHash)));
  const legacy = {...data,revision:2,live:false}; delete legacy.ogImage;
  assert.equal((await call('PUT','/'+id,legacy)).status,200); assert.equal((await store.get(id)).ogHash,newHash);
  assert.equal((await image(new Request(url(newHash)))).status,404); assert.ok(!(await html()).includes('og:image'));
  assert.equal((await call('PUT','/'+id,{...legacy,revision:3,live:true})).status,200);
  assert.equal((await image(new Request(url(newHash)))).status,200);
  assert.equal((await call('DELETE','/'+id,{password,revision:4})).status,200);
  assert.equal((await image(new Request(url(newHash)))).status,404); assert.ok(!(await html()).includes('og:image'));
  const old = {...legacy,id:'zyxwvutsrqponmlkjihgfe',live:true};
  assert.equal((await call('POST','',old)).status,201);
  assert.ok(!(await (await page(new Request('https://test.invalid/t/'+old.id))).text()).includes('og:image'));
});
