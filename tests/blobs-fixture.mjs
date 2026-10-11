// Netlify 공식 로컬 Blobs 서버와 실제 SDK를 함께 사용해요. 자격 증명·운영 데이터는 쓰지 않아요.
import { BlobsServer } from '@netlify/blobs/server';
import { getStore } from '@netlify/blobs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBlobStore } from '../server/store.mjs';
export async function blobFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'geuljari-blobs-'));
  let server, address;
  async function start() {
    server = new BlobsServer({ directory, token:'local-test-token', logger:() => {} });
    address = await server.start();
  }
  await start();
  const raw = name => {
    const sdk = getStore({ name, siteID:'local-test-site', token:'local-test-token', apiURL:`http://127.0.0.1:${address.port}`, consistency:'strong' });
    const read = sdk.getWithMetadata.bind(sdk);
    // 공식 로컬 서버 11.1.4는 GET에 ETag를 빠뜨려요. 테스트에서만 list의 같은 파일 버전을 보충해요.
    // 운영 어댑터에는 이 우회가 없고, ETag 없는 수정 요청은 실패해야 해요.
    sdk.getWithMetadata = async (id, options) => {
      const result = await read(id, options);
      if (result && !result.etag) result.etag = (await sdk.list({prefix:id})).blobs.find(b => b.key === id)?.etag;
      return result;
    };
    return sdk;
  };
  return { raw, store:name => createBlobStore(raw(name)),
    async restart() { await server.stop(); await start(); },
    async close() { await server.stop(); await rm(directory, { recursive:true, force:true }); }
  };
}
