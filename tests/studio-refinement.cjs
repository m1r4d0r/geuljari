/* 설정 서랍·카드 편집·발행 뷰어의 작성자 진입을 실제 사용자 동선으로 확인해요. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  const { serve } = await import('./publish-server.mjs');
  const { origin, close, store } = await serve();
  let browser; const errors=[];
  try {
    browser = await chromium.launch({ executablePath:process.env.CHROMIUM, args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
    await fs.mkdir('tests/out',{recursive:true});
    for (const [width,height] of [[1280,800],[768,1024],[390,844],[320,568],[844,390]]) {
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<761}); context.setDefaultTimeout(12000);
      await context.route('**/fonts.g*/**',r=>r.abort());
      const pg=await context.newPage(); pg.on('pageerror',e=>errors.push(e.message));
      await pg.goto(origin);
      assert.equal(await pg.isVisible('#write-settings'),false);
      if (width < 761) {
        await pg.click('#settings-open'); assert.equal(await pg.isVisible('#write-settings'),true);
        await pg.keyboard.press('Escape'); assert.equal(await pg.isVisible('#write-settings'),false);
        assert.equal(await pg.locator('#settings-open').evaluate(n=>n===document.activeElement),true);
      } else assert.equal(await pg.isVisible('#write-settings-slot .rail'),true);
      await pg.fill('#src', await pg.evaluate(()=>Geulgyeol.stripMarks(GeulgyeolSample.text).replace(/\n{4,}/g,'\n\n\n')));
      await pg.fill('#title','밤에 쓰는 편지');
      assert.ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.ok((await pg.locator('#src').boundingBox()).height>150);
      await pg.screenshot({path:`tests/out/refined-write-${width}.png`});
      await pg.click('[data-go=tune]');
      if (width === 1280) {
        const r=await pg.locator('#tab-toggle').boundingBox();
        await pg.mouse.move(r.x+r.width/2,r.y+r.height/2); await pg.mouse.down();
        await pg.mouse.move(r.x-40,r.y+r.height/2,{steps:5}); await pg.mouse.up();
      } else await pg.click('#tab-toggle');
      await pg.click('#tab-type');
      assert.equal(await pg.getAttribute('#tab-type','aria-expanded'),'true');
      await pg.screenshot({path:`tests/out/refined-drawer-${width}.png`});
      await pg.click('#tabs-close'); assert.equal(await pg.isVisible('#tabs'),false);
      await pg.click('#card-open');
      let frame=pg.frameLocator('#screen-main .frame.on');
      await frame.locator('.ending.is-current .end-full[src]').waitFor();
      const title=frame.getByRole('textbox',{name:'카드 문구'});
      assert.equal(await title.inputValue(),'밤에 쓰는 편지');
      await title.fill('그리고 잉크 한 방울이'); await title.press('Tab');
      await frame.locator('.end-follow input').check();
      assert.equal(await title.inputValue(),'밤에 쓰는 편지');
      await title.fill('그리고 잉크 한 방울이'); await title.press('Tab');
      await frame.locator('[data-card=size]').fill('64');
      await frame.locator('[data-card=width]').fill('55');
      await frame.locator('[data-card=x]').fill('20');
      await frame.locator('[data-card=y]').fill('80');
      await frame.locator('[data-card=align]').selectOption('left');
      const move=frame.locator('.end-move');
      if (width === 1280) {
        const r=await move.boundingBox();
        await pg.mouse.move(r.x+r.width/2,r.y+r.height/2); await pg.mouse.down();
        await pg.mouse.move(r.x+r.width/2+30,r.y+r.height/2-10,{steps:5}); await pg.mouse.up();
        assert.ok(Number(await frame.locator('[data-card=x]').inputValue())>20);
        await frame.locator('[data-card=x]').fill('20'); await frame.locator('[data-card=y]').fill('80');
      }
      await move.focus(); await move.press('ArrowRight');
      await pg.waitForFunction(()=>JSON.parse(localStorage.getItem('geul.studio')).ending.x===22);
      const settings=await pg.evaluate(()=>JSON.parse(localStorage.getItem('geul.studio')));
      assert.equal(settings.title,'밤에 쓰는 편지'); assert.equal(settings.ending.text,'그리고 잉크 한 방울이');
      assert.equal(settings.ending.size,64); assert.equal(settings.ending.align,'left');
      assert.equal(await frame.locator('.end-made').count(),0);
      await frame.locator('.end-controls').evaluate(n=>n.scrollIntoView({block:'center'}));
      await pg.screenshot({path:`tests/out/refined-card-${width}.png`});
      await frame.getByRole('button',{name:'이대로 발행하기'}).click();
      await pg.waitForSelector('#s-publish:not([hidden])');
      await pg.reload(); await pg.click('[data-go=tune]'); await pg.click('#card-open');
      frame=pg.frameLocator('#screen-main .frame.on');
      await frame.locator('.ending.is-current .end-full[src]').waitFor();
      assert.equal(await frame.getByRole('textbox',{name:'카드 문구'}).inputValue(),'그리고 잉크 한 방울이');
      assert.equal(await frame.locator('[data-card=x]').inputValue(),'22');
      if(width===1280) {
        await frame.getByRole('button',{name:'이대로 발행하기'}).click();
        await pg.fill('#publish-password','test-only-password');
        await pg.click('#publish-submit'); await pg.waitForSelector('#publish-result:not([hidden])');
        const link=await pg.inputValue('#publish-url');
        const reader=await context.newPage(); reader.on('pageerror',e=>errors.push(e.message));
        reader.on('dialog',d=>d.accept()); await reader.goto(link);
        await reader.waitForSelector('#read-status[hidden]',{state:'attached'});
        assert.equal(await reader.evaluate(()=>GeulReaderOpts.source.ending.text),'그리고 잉크 한 방울이');
        assert.equal(await reader.evaluate(()=>GeulReaderOpts.source.ending.size),64);
        await reader.click('#author-edit'); await reader.waitForSelector('#load-dialog[open]');
        assert.equal(await reader.inputValue('#load-url'),link);
        assert.equal(new URL(reader.url()).hash,'');
        await reader.fill('#load-password','wrong-password'); await reader.click('#load-form button[type=submit]');
        await reader.waitForFunction(()=>document.querySelector('#load-message').textContent.includes('맞지'));
        await reader.fill('#load-password','test-only-password'); await reader.click('#load-form button[type=submit]');
        await reader.waitForSelector('#load-dialog',{state:'hidden'});
        await reader.click('#publication-manage'); await reader.uncheck('#publish-live'); await reader.click('#publish-submit');
        await reader.waitForFunction(()=>document.querySelector('#publication-label').textContent.startsWith('발행 중단'));
        const stopped=await context.newPage(); await stopped.goto(link); await stopped.click('#author-edit');
        await stopped.waitForSelector('#load-dialog[open]'); assert.equal(await stopped.inputValue('#load-url'),link);
        const saved=await reader.evaluate(()=>JSON.stringify(localStorage)); assert.ok(!saved.includes('test-only-password')); assert.ok(!saved.includes(new URL(link).hash.slice(1)));
        const record=await store.get(new URL(link).pathname.split('/')[2]); assert.equal(record.live,false);
      }
      await context.close(); console.log(`${width}×${height}: 설정 서랍·카드 문구/배치·발행 연결 통과`);
    }
    assert.deepEqual(errors,[]);
  } finally { await browser?.close(); await close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
