/* CHROMIUM=실행파일 node tests/og-browser.cjs */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  const { serve } = await import('./publish-server.mjs'), { imageFields } = await import('../server/og-png.mjs');
  const server = await serve(); let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.CHROMIUM || undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const context = await browser.newContext(); await context.route('**/fonts.g*/**', r => r.abort());
    const page = await context.newPage(); await page.goto(server.origin);
    // 입력 문구·설정이 아닌 미리보기의 오래된 그림을 내보내는 일을 막아요.
    const data = await page.evaluate(() => ({source:GeulgyeolSample.text,title:'글자리',made:'2026-10-11',settings:GeulTune.defaults(),ending:{scene:'라이트',ground:'편지지',text:'글자리\n남겨 둔 문장',size:60,width:64,x:20,y:80,align:'left',font:'고운바탕'}}));
    const render = d => page.evaluate(d => GeulOG.render(d),d);
    const first = await render(data); imageFields({ogImage:first});
    const renderer = await context.newPage(); await renderer.goto(server.origin+'/og-render.html');
    // 화면용 카드와 발행용 이미지가 같은 설정에서 픽셀까지 같아요.
    const displayed = await renderer.evaluate(async d => {
      await GeulOGRenderer.render(d);
      const built = GeulEnding.build({...d,text:d.source}); document.body.append(built.sheet);
      return new Promise(resolve => {
        const check = () => { const card = GeulEnding.card(); if (card?.blob) resolve(card.canvas.toDataURL('image/png').split(',')[1]); else setTimeout(check,20); }; check();
      });
    },data);
    assert.ok(first === displayed, '화면 카드와 발행 이미지가 달라요.');
    for (const patch of [{text:'남겨 둔 문장'}, {x:100,y:0}, {align:'right'}, {size:100}, {width:40}, {scene:'다크',ground:'오로라'}]) {
      const next = await render({...data,ending:{...data.ending,...patch}}); imageFields({ogImage:next}); assert.notEqual(next,first);
    }
    const theme = await render({...data,settings:{...data.settings,theme:'#136B50'}}); assert.notEqual(theme,first);
    await page.setViewportSize({width:320,height:700}); assert.ok(await render(data) === first, '화면 폭에 따라 이미지가 달라요.');
    assert.equal(await page.locator('iframe[src="/og-render.html"]').count(),0);
    // 이미지 생성 실패 때 발행하지 않고, 재시도로 회복해요.
    await page.fill('#src',data.source); await page.fill('#title',data.title); await page.click('[data-go=publish]'); await page.fill('#publish-password','4821');
    let posts = 0; page.on('request',r => { if (r.method()==='POST' && r.url().includes('/api/articles')) posts++; });
    await page.route('**/og-render.html',r=>r.abort()); await page.click('#publish-submit');
    await page.waitForFunction(()=>document.querySelector('#s-publish').getAttribute('aria-busy')==='false'); assert.equal(posts,0);
    assert.equal(await page.isVisible('#publish-result'),false);
    await page.unroute('**/og-render.html'); await page.click('#publish-submit'); await page.waitForSelector('#publish-result:not([hidden])'); assert.equal(posts,1);
    await fs.mkdir('tests/out',{recursive:true}); await fs.writeFile('tests/out/og-custom.png',Buffer.from(first,'base64'));
    console.log('카드 화면과 PNG 일치 / 문구·크기·폭·위치·정렬·바탕·주색 / 모바일 동일 크기 / 실패 후 재시도: 통과');
  } finally { await browser?.close(); await server.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
