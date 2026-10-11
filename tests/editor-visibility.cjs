const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  const {serve}=await import('./publish-server.mjs'); const {origin,close}=await serve();
  let browser; const errors=[];
  try {
    browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    await fs.mkdir('tests/out',{recursive:true});
    for (const [width,height] of [[1280,800],[768,1024],[390,844],[320,568],[844,390]]) {
      const ctx=await browser.newContext({viewport:{width,height}}); await ctx.route('**/fonts.g*/**',r=>r.abort());
      const pg=await ctx.newPage(); pg.on('pageerror',e=>errors.push(e.message));
      await pg.goto(origin);
      assert.equal(await pg.isVisible('#guide'),false);
      assert.equal(await pg.isVisible('#guide-open'),true);
      for(const id of ['load-open','file-save','clear']) assert.equal(await pg.isVisible('#'+id),width>760,id);
      assert.equal(await pg.locator('.write-help li').count(),3); assert.equal(await pg.isVisible('.write-help'),true);
      assert.equal(await pg.locator('#sample, #go-tune').count(),0);
      assert.equal(await pg.locator('button').filter({hasText:/^미리보기$/}).count(),1);
      assert.equal(await pg.isVisible('#settings-open'),width<=760);
      assert.equal(await pg.isVisible('#write-settings-slot .rail'),width>760);
      assert.equal(await pg.getAttribute('link[rel=icon]','href'),'favicon.svg');
      assert.ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.ok((await pg.locator('#src').boundingBox()).height>150);
      await pg.fill('#src',await pg.evaluate(()=>Geulgyeol.stripMarks(GeulgyeolSample.text)));
      await pg.waitForFunction(()=>JSON.parse(localStorage.getItem('geul.studio')||'{}').source?.length>0);
      assert.equal(await pg.isVisible('#count'),width>760);
      await pg.screenshot({path:`tests/out/editor-visible-${width}.png`});
      if(width<=760) { await pg.click('#settings-open'); await pg.waitForSelector('#write-settings[open]'); assert.equal(await pg.isVisible('#load-open'),true); }
      await pg.click('#load-open'); await pg.waitForSelector('#load-dialog[open]');
      assert.equal(await pg.evaluate(()=>document.getElementById('write-settings').open),false);
      assert.equal(await pg.isVisible('#load-file'),true); await pg.click('#load-close');
      await pg.click('#guide-open'); assert.equal(await pg.isVisible('#guide'),true); await pg.click('#g-skip');
      if(width<=760) {
        await pg.click('#settings-open'); await pg.waitForSelector('#write-settings[open]');
        await pg.setViewportSize({width:1280,height:800});
        await pg.waitForFunction(()=>!document.getElementById('write-settings').open);
        assert.equal(await pg.isVisible('#write-settings-slot .rail'),true);
        await pg.setViewportSize({width,height}); await pg.click('#settings-open'); await pg.keyboard.press('Escape');
      }
      await pg.reload(); assert.ok((await pg.inputValue('#src')).length>0);
      // 미리보기: 하단바 갈래. 글 상자를 한 번 누르면 글씨, 빈 바탕을 누르면 바탕
      await pg.click('[data-go=tune]');
      assert.equal(await pg.textContent('.tb-cat'),'바탕');
      const frame=pg.frameLocator('#screen-main .frame.on');
      await frame.locator('.sheet.is-current .column').click({position:{x:8,y:8}});
      await pg.waitForFunction(()=>document.body.dataset.tuneCat==='type');
      assert.ok(await pg.locator('.tb-val[data-key=font]').count()===1);
      await frame.locator('.sheet.is-current .scroll').click({position:{x:4,y:4}});
      await pg.waitForFunction(()=>document.body.dataset.tuneCat==='ground');
      await ctx.close(); console.log(`${width}×${height}: 하단 안내·집계, 설정 칸·모바일 서랍, 저장·불러오기 유지, 누른 곳의 갈래 통과`);
    }
    assert.deepEqual(errors,[]);
  } finally {await browser?.close(); await close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
