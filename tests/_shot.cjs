const { chromium } = require('playwright');
(async () => {
  const { serve } = await import('./publish-server.mjs');
  const { origin, close } = await serve();
  const browser = await chromium.launch({ args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  for (const [w,h] of (process.argv[3]||'1280x900,390x844').split(',').map(s=>s.split('x').map(Number))) {
    const pg = await browser.newPage({ viewport:{width:w,height:h}, hasTouch:w<761 });
    await pg.route(/fonts\.g/, r => r.abort()); pg.on('dialog', d => d.accept());
    await pg.goto(origin + '/');
    await pg.fill('#src','시험 글이에요.'); await pg.fill('#title','그렇다면 내가 할 수 있는 대답은 …');
    await pg.click('[data-go="publish"]');
    await pg.fill('#publish-password', '4821');
    await pg.click('#publish-submit'); await pg.waitForSelector('#publish-result:not([hidden])');
    await pg.mouse.move(0,0);
    console.log(w, JSON.stringify(await pg.evaluate(() => [...document.querySelectorAll('.publish-bar button:not([hidden])')].filter(b=>b.offsetParent).map(b => { const r=b.getBoundingClientRect(); return [b.id||b.className, Math.round(r.width), Math.round(r.height), Math.round(r.top)]; }))));
    await pg.screenshot({ path: process.argv[2] + `/pub-${w}.png` });
    if (w < 1000) { await pg.click('.pub-more-btn'); await pg.screenshot({ path: process.argv[2] + `/pub-${w}-more.png` }); }
    await pg.close();
  }
  await browser.close(); await close();
})();
