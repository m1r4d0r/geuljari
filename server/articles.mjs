import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export const ID = /^[A-Za-z0-9_-]{22}$/;
const b64 = /^[A-Za-z0-9_-]+$/;
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const fail = (status, code) => { throw Object.assign(new Error(code), { status }); };
const publicRecord = r => Object.fromEntries(['id','title','cipher','iv','live','createdAt','updatedAt','revision'].map(k => [k,r[k]]));
async function hash(password, salt) { return (await scrypt(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })).toString('base64url'); }
function validate(d) {
  if (typeof d.title !== 'string' || d.title.length > 40 || typeof d.live !== 'boolean' ||
      typeof d.iv !== 'string' || d.iv.length !== 16 || !b64.test(d.iv) ||
      typeof d.cipher !== 'string' || d.cipher.length < 24 || d.cipher.length > 350000 || !b64.test(d.cipher)) fail(400, 'invalid_document');
}
export function createHandler(getStore) {
  return async req => {
    try {
      const path = new URL(req.url).pathname;
      const match = path.match(/^\/api\/articles(?:\/([A-Za-z0-9_-]{22})(\/unlock)?)?\/?$/);
      if (!match) fail(404, 'not_found');
      const [, id, unlock] = match, method = req.method;
      if (!((!id && method === 'POST') || (id && !unlock && ['GET','PUT','DELETE'].includes(method)) || (unlock && method === 'POST'))) fail(405, 'method_not_allowed');
      if (method === 'GET') {
        const r = await getStore().get(id);
        if (!r || !r.live) fail(404, 'not_found');
        return new Response(JSON.stringify(publicRecord(r)), { headers });
      }
      const origin = req.headers.get('origin');
      if (origin && origin !== new URL(req.url).origin) fail(403, 'origin_rejected');
      if (!req.headers.get('content-type')?.startsWith('application/json')) fail(415, 'json_required');
      // 스트림을 제한해 Content-Length가 없는 요청도 막아요.
      const reader = req.body?.getReader();
      if (!reader) fail(400, 'invalid_request');
      let size = 0, chunks = [];
      for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 360000) { await reader.cancel(); fail(413, 'too_large'); } chunks.push(Buffer.from(value)); }
      let d; try { d = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'invalid_request'); }
      if (!d || typeof d.password !== 'string' || d.password.length < 4 || d.password.length > 128) fail(400, 'invalid_password');
      if (!id) {
        if (!ID.test(d.id || '')) fail(400, 'invalid_id');
        validate(d);
        const salt = randomBytes(16).toString('base64url');
        const passwordHash = await hash(d.password, salt), now = new Date().toISOString();
        const next = { id:d.id, title:d.title, cipher:d.cipher, iv:d.iv, live:d.live, salt, passwordHash, createdAt:now, updatedAt:now, revision:1 };
        const value = await getStore().change(d.id, r => {
          if (r) { // 응답이 유실돼 같은 암호문을 다시 보내면 같은 결과를 돌려줘요.
            if (r.cipher === d.cipher && r.iv === d.iv && r.title === d.title && r.live === d.live) return { value: publicRecord(r) };
            fail(409, 'conflict');
          }
          return { next, value:publicRecord(next) };
        });
        return new Response(JSON.stringify(value), { status:201, headers });
      }
      const r = await getStore().get(id);
      if (!r) fail(404, 'not_found');
      const attempt = await hash(d.password, r.salt);
      if (!timingSafeEqual(Buffer.from(attempt), Buffer.from(r.passwordHash))) fail(401, 'wrong_password');
      if (unlock) return new Response(JSON.stringify(publicRecord(r)), { headers });
      if (!Number.isSafeInteger(d.revision)) fail(400, 'invalid_revision');
      if (method === 'PUT') validate(d);
      const value = await getStore().change(id, current => {
        if (!current) fail(404, 'not_found');
        if (current.revision !== d.revision || current.passwordHash !== r.passwordHash) fail(409, 'conflict');
        if (method === 'DELETE') return { next:null, value:{ deleted:true } };
        const next = { ...current, title:d.title, cipher:d.cipher, iv:d.iv, live:d.live, revision:current.revision + 1, updatedAt:new Date().toISOString() };
        return { next, value:publicRecord(next) };
      });
      return new Response(JSON.stringify(value), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ error:e.status ? e.message : 'storage_unavailable' }), { status:e.status || 503, headers });
    }
  };
}
