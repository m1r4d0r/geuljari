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
      // 편집 하단바: 분위기 축 판은 같은 폭으로 붙고, 고르면 그 축 값만 바뀜
      await pg.click('.write-bar [data-key="ax-온도"]');
      await pg.click('#wb-drop-ax-온도 .tb-li:has-text("따뜻한")');
      await pg.waitForFunction(()=>(JSON.parse(localStorage.getItem('geul.studio'))||{}).moods?.includes('따뜻한'));
      assert.equal(await pg.textContent('.write-bar [data-key="ax-온도"] .tb-label'),'온도 따뜻한');
      await pg.click('.write-bar .tb-cat'); await pg.click('.write-bar .tb-cat-item .tb-li:has-text("테마")');
      await pg.click('.write-bar [data-key=font]'); await pg.click('#wb-drop-font .tb-li:has-text("함렛")');
      await pg.waitForFunction(()=>(JSON.parse(localStorage.getItem('geul.studio'))||{}).settings?.font==='함렛');
      await pg.fill('#src', await pg.evaluate(()=>Geulgyeol.stripMarks(GeulgyeolSample.text).replace(/\n{4,}/g,'\n\n\n')));
      await pg.fill('#title','밤에 쓰는 편지');
      assert.ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.ok((await pg.locator('#src').boundingBox()).height>150);
      await pg.screenshot({path:`tests/out/refined-write-${width}.png`});
      await pg.click('[data-go=tune]');
      // 하단바: 갈래 단추를 눌러 글로 바꾸고, 값 단추는 같은 폭의 판으로 펼쳐요.
      await pg.click('#s-tune .tb-cat'); await pg.click('#s-tune .tb-cat-item .tb-li:has-text("글")');
      assert.equal(await pg.textContent('#s-tune .tb-cat .tb-label'),'글');
      await pg.click('#s-tune .tb-val[data-key=align]');
      const [vb,db]=[await pg.locator('#s-tune .tb-val[data-key=align]').boundingBox(), await pg.locator('#tb-drop-align').boundingBox()];
      // 1000px 넘게: 같은 폭으로 단추 위에 붙음. 그 아래: 단추 오른쪽에 같은 높이로 붙음
      if (width > 1000) { assert.equal(Math.round(vb.width),Math.round(db.width)); assert.ok(Math.abs(db.y+db.height-vb.y)<1); }
      else { assert.ok(db.y+db.height<=vb.y+1,'판은 바 위'); assert.ok(Math.abs(db.x-10)<1,'왼쪽 끝에서'); assert.ok(db.width>=Math.min(width-20,420)-1); }
      await pg.screenshot({path:`tests/out/refined-bar-${width}.png`});
      // 값 단추 이름은 잘리지 않음(갈래마다)
      for (const c of ['바탕','글']) {
        await pg.keyboard.press('Escape'); await pg.click('#s-tune .tb-cat'); await pg.click(`#s-tune .tb-cat-item .tb-li:has-text("${c}")`);
        const cut=await pg.evaluate(()=>[...document.querySelectorAll('#s-tune .tb-label')].filter(n=>n.getBoundingClientRect().right>n.closest('button').getBoundingClientRect().right-8).map(n=>n.textContent));
        assert.deepEqual(cut,[],c);
      }
      await pg.click('#s-tune .tb-cat'); await pg.click('#s-tune .tb-cat-item .tb-li:has-text("글")'); await pg.click('#s-tune .tb-val[data-key=align]');
      await pg.keyboard.press('Escape'); assert.equal(await pg.locator('#s-tune .tb-drop').count(),0);
      // 끝 장: 눈금 끝 네모를 누르면 끝 장의 바탕·글을 다듬어요.
      let frame=pg.frameLocator('#screen-main .frame.on');
      await frame.locator('#dots .dot.fin').click();
      frame=pg.frameLocator('#screen-main .frame.on');
      await frame.locator('.ending.is-current .end-full[src]').waitFor();
      await pg.waitForFunction(()=>document.body.dataset.tuneCat==='text'&&!!document.querySelector('#s-tune .tb-val[data-key=card-font]'));
      const title=frame.getByRole('textbox',{name:'카드 문구'});
      assert.equal(await title.inputValue(),'밤에 쓰는 편지');
      await title.fill('그리고 잉크 한 방울이'); await title.press('Tab');
      await pg.click('#s-tune .tb-cat'); await pg.click('#s-tune .tb-cat-item .tb-li:has-text("글")');
      await pg.click('#s-tune .tb-val[data-key=card-follow]');
      await frame.locator('.end-title').evaluate(n=>new Promise(r=>setTimeout(r,50)));
      assert.equal(await title.inputValue(),'밤에 쓰는 편지');
      await title.fill('그리고 잉크 한 방울이'); await title.press('Tab');
      const slide=async(key,v)=>{ await pg.click(`#s-tune .tb-val[data-key=${key}]`); await pg.locator(`#tb-drop-${key} input`).evaluate((n,v)=>{n.value=String(v);n.dispatchEvent(new Event('input',{bubbles:true}));},v); await pg.keyboard.press('Escape'); };
      // 엔터는 줄 나눔, 카드 글꼴은 끝 장에서만 따로
      await title.click(); await title.press('End'); await title.press('Enter'); await title.type('두 번째 줄'); await title.press('Tab');
      await pg.waitForFunction(()=>JSON.parse(localStorage.getItem('geul.studio')).ending.text==='그리고 잉크 한 방울이\n두 번째 줄');
      await pg.click('#s-tune .tb-val[data-key=card-font]'); await pg.click('#tb-drop-card-font .tb-li:has-text("고운바탕")');
      await pg.waitForFunction(()=>JSON.parse(localStorage.getItem('geul.studio')).ending.font==='고운바탕');
      assert.equal(await pg.evaluate(()=>JSON.parse(localStorage.getItem('geul.studio')).settings.font!=='고운바탕'),true);
      await frame.locator('.end-title').evaluate(n=>new Promise(r=>setTimeout(r,300)));
      assert.match(await frame.locator('.end-title').evaluate(n=>n.style.fontFamily),/Gowun Batang/);
      await slide('card-size',64); await slide('card-width',55);
      await pg.click('#s-tune .tb-val[data-key=card-align]'); await pg.click('#tb-drop-card-align .tb-li:has-text("왼쪽")');
      const move=frame.locator('.end-move');
      const x0=()=>pg.evaluate(()=>JSON.parse(localStorage.getItem('geul.studio')).ending.x);
      if (width === 1280) {
        const r=await move.boundingBox();
        await pg.mouse.move(r.x+r.width/2,r.y+r.height/2); await pg.mouse.down();
        await pg.mouse.move(r.x+r.width/2+30,r.y+r.height/2-10,{steps:5}); await pg.mouse.up();
        await pg.waitForFunction(()=>JSON.parse(localStorage.getItem('geul.studio')).ending.x>50);
      }
      await pg.waitForTimeout(300);
      const before=await x0();
      await move.focus(); await move.press('ArrowRight');
      await pg.waitForFunction((b)=>JSON.parse(localStorage.getItem('geul.studio')).ending.x===Math.min(100,b+2),before);
      const settings=await pg.evaluate(()=>JSON.parse(localStorage.getItem('geul.studio')));
      assert.equal(settings.title,'밤에 쓰는 편지'); assert.equal(settings.ending.text,'그리고 잉크 한 방울이\n두 번째 줄');
      assert.equal(settings.ending.size,64); assert.equal(settings.ending.width,55); assert.equal(settings.ending.align,'left');
      assert.equal(await frame.locator('.end-made').count(),0);
      await pg.screenshot({path:`tests/out/refined-card-${width}.png`});
      await frame.getByRole('button',{name:'이대로 발행하기'}).click();
      await pg.waitForSelector('#s-publish:not([hidden])');
      await pg.reload(); await pg.click('[data-go=tune]');
      frame=pg.frameLocator('#screen-main .frame.on');
      await frame.locator('#dots .dot.fin').click();
      frame=pg.frameLocator('#screen-main .frame.on');
      await frame.locator('.ending.is-current .end-full[src]').waitFor();
      assert.equal(await frame.getByRole('textbox',{name:'카드 문구'}).inputValue(),'그리고 잉크 한 방울이\n두 번째 줄');
      await pg.click('#s-tune .tb-cat'); await pg.click('#s-tune .tb-cat-item .tb-li:has-text("글")');
      assert.equal(await pg.textContent('#s-tune .tb-val[data-key=card-size] .tb-label'),'크기 64');
      if(width===1280) {
        await frame.getByRole('button',{name:'이대로 발행하기'}).click();
        await pg.fill('#publish-password','test-only-password');
        await pg.click('#publish-submit'); await pg.waitForSelector('#publish-result:not([hidden])');
        const link=await pg.inputValue('#publish-url');
        const reader=await context.newPage(); reader.on('pageerror',e=>errors.push(e.message));
        reader.on('dialog',d=>d.accept()); await reader.goto(link);
        await reader.waitForSelector('#read-status[hidden]',{state:'attached'});
        assert.equal(await reader.evaluate(()=>GeulReaderOpts.source.ending.text),'그리고 잉크 한 방울이\n두 번째 줄');
        assert.equal(await reader.evaluate(()=>GeulReaderOpts.source.ending.size),64);
        await reader.click('#author-edit'); await reader.waitForSelector('#load-dialog[open]');
        assert.equal(await reader.inputValue('#load-url'),link);
        assert.equal(new URL(reader.url()).hash,'');
        await reader.fill('#load-password','wrong-password'); await reader.click('#load-form button[type=submit]');
        await reader.waitForFunction(()=>document.querySelector('#load-message').textContent.includes('맞지'));
        await reader.fill('#load-password','test-only-password'); await reader.click('#load-form button[type=submit]');
        await reader.waitForSelector('#load-dialog',{state:'hidden'});
        await reader.click('.write-bar .publication-manage'); await reader.uncheck('#publish-live'); await reader.click('#publish-submit');
        await reader.waitForFunction(()=>document.querySelector('.publish-bar .publication-label').textContent.startsWith('발행 중단'));
        const stopped=await context.newPage(); await stopped.goto(link); await stopped.click('#author-edit');
        await stopped.waitForSelector('#load-dialog[open]'); assert.equal(await stopped.inputValue('#load-url'),link);
        const saved=await reader.evaluate(()=>JSON.stringify(localStorage)); assert.ok(!saved.includes('test-only-password')); assert.ok(!saved.includes(new URL(link).hash.slice(1)));
        const record=await store.get(new URL(link).pathname.split('/')[2]); assert.equal(record.live,false);
      }
      await context.close(); console.log(`${width}×${height}: 편집 하단바·미리보기 갈래·카드 문구/배치·발행 연결 통과`);
    }
    assert.deepEqual(errors,[]);
  } finally { await browser?.close(); await close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
