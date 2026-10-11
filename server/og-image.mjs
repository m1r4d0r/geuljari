export function createImageHandler(getStore) {
  return async req => {
    const headers = { 'Cache-Control':'no-store', 'Netlify-CDN-Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex', 'Referrer-Policy':'no-referrer' };
    const empty = status => new Response(null, { status, headers });
    if (!['GET','HEAD'].includes(req.method)) return empty(405);
    const match = new URL(req.url).pathname.match(/^\/og\/([A-Za-z0-9_-]{22})\/([a-f0-9]{64})\.png$/);
    if (!match) return empty(404);
    try {
      const record = await getStore().get(match[1]);
      if (!record?.live || !record.ogImage || record.ogHash !== match[2]) return empty(404);
      const png = Buffer.from(record.ogImage, 'base64');
      return new Response(req.method === 'HEAD' ? null : png, { headers:{ ...headers, 'Content-Type':'image/png', 'Content-Length':String(png.length) } });
    } catch { return empty(503); }
  };
}
