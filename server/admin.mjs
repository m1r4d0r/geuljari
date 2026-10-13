import { createHash, timingSafeEqual } from 'node:crypto';
import { day, KEEP_DAYS } from './stats.mjs';

const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex' };
const fail = (status, code) => { throw Object.assign(new Error(code), { status }); };
const digest = s => createHash('sha256').update(String(s)).digest();

// 관리 현황(/api/admin). 관리자 비밀번호는 Netlify 환경 변수에만 두고, 요청마다 몸으로 받아 비교해요.
// 돌려주는 것: 글 요약 목록(공개 제목·상태·날짜·고친 횟수·읽기 수), 날짜별 새 글·편집실 방문·읽기 방문. 본문·열쇠·비밀번호는 없어요.
export function createAdminHandler(getStore, getStats, secret) {
  return async req => {
    try {
      if (req.method !== 'POST') fail(405, 'method_not_allowed');
      const origin = req.headers.get('origin');
      if (origin && origin !== new URL(req.url).origin) fail(403, 'origin_rejected');
      const text = await req.text();
      if (text.length > 1000) fail(413, 'too_large');
      let d; try { d = JSON.parse(text); } catch { fail(400, 'invalid_request'); }
      const password = secret();
      if (!password) fail(503, 'admin_unset');
      if (typeof d?.password !== 'string' || !timingSafeEqual(digest(d.password), digest(password))) fail(401, 'wrong_password');
      const [list, { days, reads }] = await Promise.all([getStore().list(), getStats().summary()]);
      const articles = list.filter(a => !a.deleted).map(a => ({ ...a, reads:reads[a.id] || 0 }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const timeline = Array.from({ length:KEEP_DAYS }, (_, i) => {
        const date = day(Date.now() - i * 864e5);
        return { date, created:articles.filter(a => day(Date.parse(a.createdAt)) === date).length, edit:days[date]?.edit || 0, read:days[date]?.read || 0 };
      });
      const counts = { total:articles.length, live:articles.filter(a => a.live).length, closed:articles.filter(a => !a.live).length, deleted:list.length - articles.length };
      return new Response(JSON.stringify({ now:new Date().toISOString(), keepDays:KEEP_DAYS, counts, timeline, articles }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ error:e.status ? e.message : 'storage_unavailable' }), { status:e.status || 503, headers });
    }
  };
}
