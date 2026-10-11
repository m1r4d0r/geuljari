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
      // 편집 하단바: 분위기(축마다 값 단추)·테마. 불러오기·저장·새로 쓰기는 오른쪽 아래에 늘
      assert.equal(await pg.textContent('.write-bar .tb-cat .tb-label'),'분위기');
      assert.equal(await pg.locator('.write-bar .tb-val[data-key^=ax-]').count(),3);
      for(const id of ['load-open','file-save','clear']) assert.equal(await pg.isVisible('.write-bar .tb-side #'+id),true,id);
      assert.equal(await pg.locator('.write-help li').count(),3); assert.equal(await pg.isVisible('.write-help'),true);
      assert.equal(await pg.locator('#sample, #go-tune').count(),0);
      assert.equal(await pg.locator('button').filter({hasText:/^미리보기$/}).count(),1);
      assert.equal(await pg.locator('#settings-open, #write-settings, .rail').count(),0);
      // 쓰는 법 세 줄: 넓은 화면은 본문 오른쪽, 1000px 이하는 편집창 위
      const [hb,eb]=[await pg.locator('.write-help').boundingBox(), await pg.locator('#write-ed').boundingBox()];
      if(width>1000) assert.ok(hb.x>=eb.x+eb.width-1); else assert.ok(hb.y+hb.height<=eb.y+1);      assert.equal(await pg.getAttribute('link[rel=icon]','href'),'favicon.svg');
      assert.ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.ok((await pg.locator('#src').boundingBox()).height>150);
      await pg.fill('#src',await pg.evaluate(()=>Geulgyeol.stripMarks(GeulgyeolSample.text)));
      await pg.waitForFunction(()=>JSON.parse(localStorage.getItem('geul.studio')||'{}').source?.length>0);
      assert.match(await pg.textContent('#count'),/^\d+쪽 · \d+자$/);
      await pg.evaluate(()=>document.activeElement.blur());
      const [hc,cc]=[await pg.locator('.write-help').boundingBox(), await pg.locator('#count').boundingBox()];
      assert.ok(cc.y>=hc.y+hc.height-1,'집계는 쓰는 법 아래');
      await pg.screenshot({path:`tests/out/editor-visible-${width}.png`});
      await pg.click('#load-open'); await pg.waitForSelector('#load-dialog[open]');
      assert.equal(await pg.isVisible('#load-file'),true); await pg.click('#load-close');
      await pg.click('#guide-open'); assert.equal(await pg.isVisible('#guide'),true); await pg.click('#g-skip');
      // 1000px 이하: 쓰는 동안 하단바를 거둠
      await pg.click('#src'); assert.equal(await pg.isVisible('.write-bar'),width>1000);
      await pg.locator('#src').blur(); await pg.evaluate(()=>document.activeElement.blur()); assert.equal(await pg.isVisible('.write-bar'),true);
      await pg.reload(); assert.ok((await pg.inputValue('#src')).length>0);
      // 미리보기: 하단바 갈래. 글 상자를 한 번 누르면 글, 빈 바탕을 누르면 바탕
      await pg.click('[data-go=tune]');
      assert.equal(await pg.textContent('#s-tune .tb-cat'),'바탕');
      const frame=pg.frameLocator('#screen-main .frame.on');
      await frame.locator('.sheet.is-current .column').click({position:{x:8,y:8}});
      await pg.waitForFunction(()=>document.body.dataset.tuneCat==='text');
      assert.ok(await pg.locator('#s-tune .tb-val[data-key=speed]').count()===1);
      await frame.locator('.sheet.is-current .scroll').click({position:{x:4,y:4}});
      await pg.waitForFunction(()=>document.body.dataset.tuneCat==='ground');
      await ctx.close(); console.log(`${width}×${height}: 머리 안내, 쓰는 법과 그 아래 집계, 편집 하단바·쓰는 동안 거둠, 저장·불러오기 유지, 누른 곳의 갈래 통과`);
    }
    assert.deepEqual(errors,[]);
  } finally {await browser?.close(); await close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
