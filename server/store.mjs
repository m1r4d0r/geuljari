import { getStore as netlifyStore } from '@netlify/blobs';
import deploy from './deploy-config.json' with { type: 'json' };

const conflict = () => { throw Object.assign(new Error('conflict'), { status:409 }); };
const readable = entry => entry && !entry.deleted ? entry : null;
// 관리 목록에 쓰는 요약. 본문·열쇠·비밀번호·그림은 넣지 않아요.
const summary = r => r.deleted ? { deleted:true } : { title:r.title, live:r.live, createdAt:r.createdAt, updatedAt:r.updatedAt, revision:r.revision };

// 문서 하나를 ETag 조건부 쓰기로 바꿔요. 삭제는 같은 키에 빈 표식을 남겨 재생성을 막아요.
// 쓸 때 요약을 메타데이터로 함께 남겨, 관리 목록이 본문을 내려받지 않고 읽게 해요.
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
      const written = await blobs.setJSON(id, next, { ...conditions, metadata:summary(next) });
      if (!written.modified) conflict();
      return result.value;
    },
    // 모든 글의 요약. 메타데이터가 없는 예전 글만 본문째 읽어요. 한 번에 16개씩 물어요.
    async list() {
      const { blobs:items } = await blobs.list();
      const out = [];
      for (let i = 0; i < items.length; i += 16) {
        out.push(...await Promise.all(items.slice(i, i + 16).map(async ({ key }) => {
          const meta = (await blobs.getMetadata(key, { consistency:'strong' }))?.metadata;
          if (meta && (meta.deleted || typeof meta.createdAt === 'string')) return { id:key, ...summary(meta) };
          const entry = await blobs.get(key, { type:'json', consistency:'strong' });
          return entry ? { id:key, ...summary(entry) } : null;
        })));
      }
      return out.filter(Boolean);
    }
  };
}

let store;
export function getStore() {
  if (!store) store = createBlobStore(netlifyStore({ name:deploy.storeName, consistency:'strong' }));
  return store;
}
