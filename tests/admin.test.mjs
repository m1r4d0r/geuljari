import test from 'node:test';
import assert from 'node:assert/strict';
import { blobFixture } from './blobs-fixture.mjs';
import { createStats, createVisitHandler, day } from '../server/stats.mjs';
import { createAdminHandler } from '../server/admin.mjs';
import { createReaderHandler } from '../server/reader-page.mjs';

const ask = (body, origin) => new Request('https://geuljari.test/api/admin', { method:'POST', headers:{ 'content-type':'application/json', ...(origin ? { origin } : {}) }, body:JSON.stringify(body) });
const record = (id, o) => ({ id, title:'제목 ' + id, cipher:'secret-cipher', iv:'iv', live:true, salt:'s', passwordHash:'h', ogImage:'img', createdAt:'2026-10-10T01:00:00.000Z', updatedAt:'2026-10-11T01:00:00.000Z', revision:2, ...o });

test('관리 현황: 비밀번호, 글 요약 목록, 방문 수, 본문은 내보내지 않음', async () => {
  const f = await blobFixture();
  try {
    const store = f.store('articles'), statsBlobs = f.raw('stats'), stats = createStats(statsBlobs);
    const a = 'A'.repeat(22), b = 'B'.repeat(22), c = 'C'.repeat(22);
    await store.change(a, () => ({ next:record(a) }));
    await store.change(b, () => ({ next:record(b, { live:false, createdAt:new Date().toISOString() }) }));
    await store.change(c, () => ({ next:record(c) }));
    await store.change(c, () => ({ next:null }));
    // 메타데이터 없이 남은 예전 글도 목록에 나와요.
    const old = 'D'.repeat(22);
    await f.raw('articles').setJSON(old, record(old, { createdAt:'2026-09-01T00:00:00.000Z' }));

    const ua = 'Mozilla/5.0 (iPhone)';
    assert.equal(await stats.visit('edit', { ip:'1.1.1.1', ua }), true);
    await stats.visit('edit', { ip:'1.1.1.1', ua });
    await stats.visit('edit', { ip:'2.2.2.2', ua });
    assert.equal(await stats.visit('edit', { ip:'3.3.3.3', ua:'Googlebot/2.1' }), false);
    assert.equal(await stats.visit('nope', { ip:'3.3.3.3', ua }), false);
    await stats.visit('read', { ip:'1.1.1.1', ua, id:a });
    await stats.visit('read', { ip:'2.2.2.2', ua, id:a });
    // 보관 기간이 지난 기록과 지난 소금은 지워져요.
    await statsBlobs.set('v/2020-01-01/edit/x', '1');
    await statsBlobs.set('a/' + a + '/2020-01-01/x', '1');

    const handler = createAdminHandler(() => store, () => stats, () => 'admin-pass');
    assert.equal((await handler(ask({ password:'wrong' }))).status, 401);
    assert.equal((await handler(ask({ password:'admin-pass' }, 'https://evil.test'))).status, 403);
    assert.equal((await createAdminHandler(() => store, () => stats, () => '')(ask({ password:'' }))).status, 503);
    const res = await handler(ask({ password:'admin-pass' }));
    assert.equal(res.status, 200);
    const text = await res.text();
    for (const leak of ['secret-cipher', 'passwordHash', 'ogImage', '"salt"', '1.1.1.1']) assert.ok(!text.includes(leak), leak);
    const d = JSON.parse(text);
    assert.deepEqual(d.counts, { total:3, live:2, closed:1, deleted:1 });
    assert.deepEqual(d.articles.map(x => x.id), [b, a, old]);
    assert.equal(d.articles.find(x => x.id === a).reads, 2);
    assert.equal(d.articles.find(x => x.id === a).title, '제목 ' + a);
    const today = d.timeline[0];
    assert.equal(today.date, day());
    assert.deepEqual([today.edit, today.read, today.created], [2, 2, 1]);
    assert.equal(d.timeline.length, 30);
    const keys = (await statsBlobs.list()).blobs.map(x => x.key);
    assert.ok(!keys.some(k => k.includes('2020-01-01')));
    assert.ok(!keys.some(k => k.includes('1.1.1.1')));

    // 편집실 신호와 공개 글 열기
    const visit = createVisitHandler(() => stats);
    const beacon = await visit(new Request('https://geuljari.test/api/visit', { method:'POST', headers:{ 'user-agent':ua } }), { ip:'4.4.4.4' });
    assert.equal(beacon.status, 204);
    const page = createReaderHandler(() => store, '<html><head><title>글자리</title><meta property="og:title" content="글자리"></head></html>', () => stats);
    assert.equal((await page(new Request('https://geuljari.test/t/' + a, { headers:{ 'user-agent':ua } }), { ip:'5.5.5.5' })).status, 200);
    const again = JSON.parse(await (await handler(ask({ password:'admin-pass' }))).text());
    assert.deepEqual([again.timeline[0].edit, again.timeline[0].read], [3, 3]);
    assert.equal(again.articles.find(x => x.id === a).reads, 3);
  } finally { await f.close(); }
});
