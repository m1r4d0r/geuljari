import { ID } from './articles.mjs';
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createReaderHandler(getStore, template) {
  return async req => {
    const headers = { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex' };
    let title = '글자리', status = 200;
    try {
      const id = new URL(req.url).pathname.split('/')[2];
      if (!ID.test(id || '')) status = 404;
      else {
        const record = await getStore().get(id);
        if (!record?.live) status = 404;
        else title = record.title || '제목 없는 글';
      }
    } catch { status = 503; }
    // 발행 중인 글의 제목만 OG에 공개해요. 본문·열쇠·비밀번호는 HTML에 넣지 않아요.
    const html = template.replace('<title>글자리</title>', `<title>${escape(title)} · 글자리</title>`)
      .replace('property="og:title" content="글자리"', `property="og:title" content="${escape(title)}"`);
    return new Response(req.method === 'HEAD' ? null : html, { status, headers });
  };
}
