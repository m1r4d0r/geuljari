import { createHash, randomBytes } from 'node:crypto';
import { getStore as netlifyStore } from '@netlify/blobs';
import deploy from './deploy-config.json' with { type:'json' };

// 하루 방문 수. 누가 왔는지는 남기지 않아요: 그날만 쓰는 무작위 소금과 IP·브라우저 이름을 섞은 해시로 같은 날 중복만 걸러요.
// 소금은 다음 날 첫 방문 때 지워서, 지난날의 해시는 다시 풀 수 없어요. 기록은 KEEP_DAYS일만 두어요.
// 키: v/{날짜}/{edit|read}/{해시} · a/{글 id}/{날짜}/{해시} · salt/{날짜}. 날짜는 한국 시간.
export const KEEP_DAYS = 30;
export const KINDS = ['edit', 'read'];
const BOT = /bot|crawl|spider|slurp|scrap|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|kakaotalk|yeti|daum|headless|lighthouse|curl|wget|python|node-fetch/i;
export const day = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);

export function createStats(blobs) {
  async function salt(d) {
    const key = 'salt/' + d;
    const kept = await blobs.get(key, { consistency:'strong' });
    if (kept) return kept;
    const fresh = randomBytes(18).toString('base64url');
    if (!(await blobs.set(key, fresh, { onlyIfNew:true })).modified) return blobs.get(key, { consistency:'strong' });
    const { blobs:old } = await blobs.list({ prefix:'salt/' });
    await Promise.all(old.filter(b => b.key < key).map(b => blobs.delete(b.key)));
    return fresh;
  }
  return {
    async visit(kind, { ip, ua, id }) {
      if (!KINDS.includes(kind) || !ip || BOT.test(ua || '')) return false;
      const d = day();
      const who = createHash('sha256').update(`${await salt(d)}\n${ip}\n${ua || ''}`).digest('base64url').slice(0, 22);
      await blobs.set(`v/${d}/${kind}/${who}`, '1');
      if (id) await blobs.set(`a/${id}/${d}/${who}`, '1');
      return true;
    },
    // 날짜마다 편집실·읽기 방문 수, 글마다 읽기 수(하루 한 번씩 센 합). 보관 기간이 지난 기록은 이때 지워요.
    async summary() {
      const cutoff = day(Date.now() - (KEEP_DAYS - 1) * 864e5);
      const { blobs:items } = await blobs.list();
      const days = {}, reads = {}, old = [];
      for (const { key } of items) {
        const p = key.split('/');
        const d = p[0] === 'v' ? p[1] : p[0] === 'a' ? p[2] : null;
        if (!d) continue;
        if (d < cutoff) { old.push(key); continue; }
        if (p[0] === 'v' && KINDS.includes(p[2])) { days[d] ||= { edit:0, read:0 }; days[d][p[2]]++; }
        if (p[0] === 'a') reads[p[1]] = (reads[p[1]] || 0) + 1;
      }
      for (let i = 0; i < old.length; i += 32) await Promise.all(old.slice(i, i + 32).map(k => blobs.delete(k)));
      return { days, reads };
    }
  };
}

// 편집실이 열릴 때 보내는 신호(/api/visit). 몸은 읽지 않아요.
export function createVisitHandler(getStats) {
  return async (req, context) => {
    const headers = { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' };
    if (req.method !== 'POST') return new Response(null, { status:405, headers });
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) return new Response(null, { status:403, headers });
    try { await getStats().visit('edit', clientOf(req, context)); } catch { /* 집계가 안 돼도 편집실은 그대로 */ }
    return new Response(null, { status:204, headers });
  };
}

export const clientOf = (req, context) => ({ ip:context?.ip || req.headers.get('x-nf-client-connection-ip') || '', ua:req.headers.get('user-agent') || '' });

let stats;
export function getStats() {
  if (!stats) stats = createStats(netlifyStore({ name:deploy.storeName + '-stats', consistency:'strong' }));
  return stats;
}
