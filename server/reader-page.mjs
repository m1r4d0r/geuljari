import { ID } from './articles.mjs';
import { clientOf } from './stats.mjs';
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// getStats가 있으면 공개 글을 연 것을 하루 방문으로 세요(관리 현황). 응답을 기다리게 하지 않아요.
export function createReaderHandler(getStore, template, getStats) {
  return async (req, context) => {
    const headers = { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex' };
    let title = '글자리', status = 200, image = '', page = '', type = 'png';
    try {
      const id = new URL(req.url).pathname.split('/')[2];
      if (!ID.test(id || '')) status = 404;
      else {
        const record = await getStore().get(id);
        if (!record?.live) status = 404;
        else {
          title = record.title || '제목 없는 글';
          if (getStats && req.method === 'GET') {
            const counted = getStats().visit('read', { ...clientOf(req, context), id }).catch(() => {});
            if (context?.waitUntil) context.waitUntil(counted); else await counted;
          }
          page = new URL(`/t/${id}`, req.url).href;
          if (record.ogImage && /^[a-f0-9]{64}$/.test(record.ogHash || '')) {
            type = record.ogType === 'jpg' ? 'jpg' : 'png';
            image = new URL(`/og/${id}/${record.ogHash}.${type}`, req.url).href;
            // 편집실이 건네는 링크와 같은 판(?v=)을 대표 주소로 둬요.
            page += '?v=' + record.ogHash.slice(0, 8);
          }
        }
      }
    } catch { status = 503; }
    // 제목과 공개 카드 주소만 넣어요. 본문·열쇠·비밀번호는 HTML에 넣지 않아요.
    const html = template.replace('<title>글자리</title>', `<title>${escape(title)} · 글자리</title>`)
      .replace('property="og:title" content="글자리"', `property="og:title" content="${escape(title)}"`)
      .replace('</head>', (page ? `<meta property="og:url" content="${escape(page)}">\n` : '') + (image ? `<meta property="og:image" content="${escape(image)}">\n<meta property="og:image:alt" content="${escape(title)} · 글자리">\n<meta property="og:image:type" content="${type === 'jpg' ? 'image/jpeg' : 'image/png'}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${escape(image)}">\n` : '') + '</head>');
    return new Response(req.method === 'HEAD' ? null : html, { status, headers });
  };
}
