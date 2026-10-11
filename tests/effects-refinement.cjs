const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  const { serve } = await import('./publish-server.mjs');
  const { origin, close } = await serve();
  let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.CHROMIUM,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    await fs.mkdir('tests/out',{recursive:true});
    const errors=[];
    for (const [width,height] of [[1280,720],[390,844],[844,390]]) {
      const page=await browser.newPage({viewport:{width,height}});
      await page.route('**/fonts.g*/**', r=>r.abort());
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+'/flip-lab.html');
      await page.click('[data-for=day] [data-ground=aurora]');
      const ratios=await page.evaluate(()=>{
        const stage=document.querySelector('#stage');
        const sizes=()=>[...document.querySelectorAll('.ground-aurora .au')].map(n=>{
          const s=getComputedStyle(n); return parseFloat(s.width)/parseFloat(s.height);
        });
        const before=sizes();
        stage.style.transform='scale(.65)';
        GeulBackdrop.refresh();
        const after=sizes();
        stage.style.transform='';
        GeulBackdrop.refresh();
        return {before,after};
      });
      ratios.before.forEach((n,i)=>assert.ok(Math.abs(n-[1.375,1/.95,1][i])<.001));
      assert.deepEqual(ratios.before,ratios.after);
      await page.screenshot({path:`tests/out/aurora-${width}.png`});
      // 실제 바탕과 원문을 함께 나누고, 끌기를 되감아도 같은 면이 돌아오는지 확인해요.
      const result=await page.evaluate(()=>{
        const stage=document.querySelector('#stage');
        const [from,to]=stage.querySelectorAll('.sheet');
        window.testFlip=GeulFlip.create(stage);
        testFlip.begin(from,to,'glass',1);
        testFlip.render(0);
        const start=from.style.visibility;
        testFlip.render(.48);
        const take=()=>[...stage.querySelectorAll('.glass-shard')].map(n=>[n.style.transform,n.style.opacity]);
        const first=take();
        testFlip.render(.76);testFlip.render(.48);
        return {start,first,back:take(),shards:stage.querySelectorAll('.glass-shard').length,
          ids:stage.querySelectorAll('.flip-glass [id]').length,
          inert:stage.querySelector('.flip-glass').inert};
      });
      assert.equal(result.start,'visible');assert.equal(result.shards,12);
      assert.equal(result.ids,0);assert.equal(result.inert,true);
      assert.deepEqual(result.first,result.back);
      await page.screenshot({path:`tests/out/glass-${width}.png`});
      await page.evaluate(()=>testFlip.finish(false));
      assert.equal(await page.locator('.flip-glass').count(),0);
      assert.equal(await page.locator('.sheet.is-current').count(),1);
      await page.click('[data-turn=glass]');
      await page.waitForSelector('.flip-glass',{state:'detached',timeout:7000});
      assert.equal(await page.locator('.flip-glass').count(),0);
      assert.equal(await page.locator('.sheet.is-current').count(),1);
      await page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await page.evaluate(()=>{
        const [from,to]=document.querySelectorAll('#stage > .sheet');
        testFlip.begin(from,to,'glass',1);testFlip.render(.5);
        return testFlip.mode;
      }),'drift');
      assert.equal(await page.locator('.flip-glass').count(),0);
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.goto(origin+'/reader.html?start='+encodeURIComponent(JSON.stringify({page:0,done:true})));
      const snapshot=await page.evaluate(()=>{
        const stage=document.querySelector('#stage');
        const [from,to]=stage.querySelectorAll('.sheet');
        from.querySelector('.column').style.height='2000px';
        from.querySelector('.scroll').scrollTop=160;
        const top=from.querySelector('.scroll').scrollTop;
        const flip=GeulFlip.create(stage);
        flip.begin(from,to,'glass',1);flip.render(.3);
        const out={top,scrolls:[...stage.querySelectorAll('.glass-copy .scroll')].map(n=>n.scrollTop),
          images:[...stage.querySelectorAll('.glass-copy img.ground')].map(n=>n.src.length),
          turn:Geulgyeol.readMark('다크:오로라:유리').turn};
        flip.finish(true);
        return out;
      });
      assert.equal(snapshot.turn,'glass');
      assert.ok(snapshot.top>0);
      assert.ok(snapshot.scrolls.every(n=>n===snapshot.top));
      assert.equal(snapshot.images.length,12);
      assert.ok(snapshot.images.every(n=>n>500));
      await page.close();
      console.log(`${width}×${height}: 오로라 비율·축소, 유리 되감기·정리·동작 줄이기 통과`);
    }
    assert.deepEqual(errors,[]);
  } finally {await browser?.close();await close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
