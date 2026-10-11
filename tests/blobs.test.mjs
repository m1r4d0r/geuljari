import test from 'node:test';
import assert from 'node:assert/strict';
import { blobFixture } from './blobs-fixture.mjs';
import { createBlobStore } from '../server/store.mjs';
import { deployConfig } from '../scripts/deploy-config.mjs';

const conflict = { status:409 };
test('Blobs SDK: 조건부 생성·변경·삭제, 삭제한 주소 재사용 금지', async () => {
  const f = await blobFixture();
  try {
    const blobs = f.raw('articles'), store = createBlobStore(blobs);
    const record = { id:'article', cipher:'encrypted-test', passwordHash:'test-hash', live:true, revision:1 };
    assert.equal(await store.get('article'),null);
    await store.change('article', () => ({ next:record, value:'created' }));
    assert.deepEqual(await store.get('article'),record);
    // 어댑터가 읽은 직후 다른 요청이 먼저 저장한 상황을 실제 SDK에 재현해요.
    const stale = createBlobStore({
      getWithMetadata: (...a) => blobs.getWithMetadata(...a),
      async setJSON(id, next, options) {
        await store.change(id, r => ({ next:{...r,revision:2} }));
        return blobs.setJSON(id,next,options);
      }
    });
    await assert.rejects(stale.change('article', r => ({ next:{...r,revision:2,title:'stale'} })),conflict);
    assert.equal((await store.get('article')).title,undefined);
    const deletionRace = createBlobStore({
      getWithMetadata: (...a) => blobs.getWithMetadata(...a),
      async setJSON(id,next,options) { await store.change(id, () => ({next:null})); return blobs.setJSON(id,next,options); }
    });
    await assert.rejects(deletionRace.change('article', r => ({next:{...r,revision:3}})),conflict);
    assert.equal(await store.get('article'),null);
    assert.deepEqual(await blobs.get('article',{type:'json'}),{id:'article',deleted:true});
    await assert.rejects(store.change('article', () => ({next:record})),conflict);
    const createRace = createBlobStore({
      getWithMetadata: (...a) => blobs.getWithMetadata(...a),
      async setJSON(id,next,options) { await store.change(id, () => ({next:{...record,id}})); return blobs.setJSON(id,next,options); }
    });
    await assert.rejects(createRace.change('new', () => ({next:{...record,id:'new',title:'loser'}})),conflict);
    assert.equal((await store.get('new')).title,undefined);
  } finally { await f.close(); }
});

test('발행 중단은 새 읽기에 반영, 서버 재시작·배포 후 보존, 미리보기 분리',async () => {
  const f = await blobFixture();
  try {
    const prod = deployConfig({CONTEXT:'production'}).storeName;
    const preview = deployConfig({CONTEXT:'deploy-preview',DEPLOY_ID:'preview-one'}).storeName;
    const store = f.store(prod);
    await store.change('article', () => ({next:{id:'article',live:true,revision:1}}));
    await store.change('article', r => ({next:{...r,live:false,revision:2}}));
    assert.equal((await f.store(prod).get('article')).live,false);
    assert.equal(await f.store(preview).get('article'),null);
    await f.store(preview).change('article', () => ({next:{id:'article',live:true,revision:1}}));
    await f.store(preview).change('article', () => ({next:null}));
    assert.equal((await store.get('article')).revision,2);
    await f.restart();
    assert.equal((await f.store(prod).get('article')).revision,2);
    assert.equal(deployConfig({CONTEXT:'production',DEPLOY_ID:'new-deploy'}).storeName,prod);
    assert.notEqual(deployConfig({CONTEXT:'branch-deploy',DEPLOY_ID:'preview-two'}).storeName,preview);
    assert.equal(deployConfig({}).storeName,'geuljari-local-v1');
    assert.throws(() => deployConfig({NETLIFY:'true'}));
  } finally { await f.close(); }
});
