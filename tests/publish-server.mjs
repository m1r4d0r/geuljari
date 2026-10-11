// Netlify 공식 로컬 Blobs 서버를 연결한 검증 서버예요. 배포 함수에는 포함되지 않아요.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { blobFixture } from './blobs-fixture.mjs';
import { createHandler } from '../server/articles.mjs';
import { createReaderHandler } from '../server/reader-page.mjs';
import { createImageHandler } from '../server/og-image.mjs';
export function memoryStore() {
  const rows = new Map();
  return { rows, async get(id) { return structuredClone(rows.get(id) || null); }, async change(id, fn) {
    const r = fn(structuredClone(rows.get(id) || null));
    if (r.next === null) rows.delete(id); else if (r.next) rows.set(id, structuredClone(r.next));
    return r.value;
  } };
}
export async function serve(port = 0) {
  const fixture = await blobFixture(), blobs = fixture.raw('browser-test'), store = fixture.store('browser-test'), api = createHandler(() => store);
  const reader = createReaderHandler(() => store, await readFile(new URL('../published.html', import.meta.url), 'utf8'));
  const image = createImageHandler(() => store);
  const root = new URL('../', import.meta.url);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://' + req.headers.host);
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/t/') || url.pathname.startsWith('/og/')) {
        const chunks = []; for await (const c of req) chunks.push(c);
        const body = Buffer.concat(chunks);
        const request = new Request(url, { method:req.method, headers:req.headers, ...(body.length ? {body} : {}) });
        const response = await (url.pathname.startsWith('/api/') ? api : url.pathname.startsWith('/og/') ? image : reader)(request);
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
      } else {
        const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        if (path.includes('..')) throw new Error();
        const data = await readFile(new URL(path, root));
        const ext = path.split('.').pop(); res.setHeader('Content-Type', {html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml'}[ext] || 'application/octet-stream'); res.end(data);
      }
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { server, store, blobs, close:async () => { await new Promise(resolve=>server.close(resolve)); await fixture.close(); }, origin:`http://127.0.0.1:${server.address().port}` };
}
