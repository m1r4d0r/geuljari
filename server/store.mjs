import { getStore as netlifyStore } from '@netlify/blobs';
import deploy from './deploy-config.json' with { type: 'json' };

const conflict = () => { throw Object.assign(new Error('conflict'), { status:409 }); };
const readable = entry => entry && !entry.deleted ? entry : null;

// 문서 하나를 ETag 조건부 쓰기로 바꿔요. 삭제는 같은 키에 빈 표식을 남겨 재생성을 막아요.
export function createBlobStore(blobs) {
  return {
    async get(id) {
      return readable(await blobs.get(id, { type:'json', consistency:'strong' }));
    },
    async change(id, fn) {
      const snapshot = await blobs.getWithMetadata(id, { type:'json', consistency:'strong' });
      if (snapshot?.data.deleted) conflict();
      const result = fn(snapshot?.data || null);
      if (result.next === undefined) return result.value;
      if (snapshot && !snapshot.etag) throw new Error('missing_store_version');
      const next = result.next === null ? { id, deleted:true } : result.next;
      const conditions = snapshot ? { onlyIfMatch:snapshot.etag } : { onlyIfNew:true };
      const written = await blobs.setJSON(id, next, conditions);
      if (!written.modified) conflict();
      return result.value;
    }
  };
}

let store;
export function getStore() {
  if (!store) store = createBlobStore(netlifyStore({ name:deploy.storeName, consistency:'strong' }));
  return store;
}
