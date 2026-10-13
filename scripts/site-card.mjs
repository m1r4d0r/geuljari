// 사이트 대표 카드 og.jpg와 홈 화면 아이콘 apple-touch-icon.png를 다시 찍어요. 로고·소개 문구·바탕을 바꿨을 때만 돌려요: node scripts/site-card.mjs
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[/\\]+/, '');
    const body = await readFile(join(process.cwd(), path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(`http://127.0.0.1:${port}/scripts/site-card.html`, { waitUntil: 'networkidle' });
  const { card, icon } = await page.evaluate(() => window.drawSiteCard());
  for (const [name, data] of [['og.jpg', card], ['apple-touch-icon.png', icon]]) {
    await writeFile(name, Buffer.from(data, 'base64'));
    console.log(name, Buffer.from(data, 'base64').length, 'bytes');
  }
} finally { await browser.close(); server.close(); }
