const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  const { serve } = await import('./publish-server.mjs');
  const { origin, close } = await serve();
  let browser;
  const errors=[];
  try {
    browser=await chromium.launch({executablePath:process.env.CHROMIUM || undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    await fs.mkdir('tests/out',{recursive:true});
    for(const width of [1280,390]) {
      const context=await browser.newContext({viewport:{width,height:844}});
      await context.route('**/fonts.g*/**',r=>r.abort());
      const pg=await context.newPage(); pg.on('pageerror',e=>errors.push(e.message));
      pg.on('console',msg=>{if(msg.type()==='error' && /shader|compile|link program/i.test(msg.text()))errors.push(msg.text());});
      await pg.goto(origin);
      assert.equal(await pg.title(),'글자리');
      assert.equal(await pg.getAttribute('#home','aria-label'),'글자리, 글로');
      assert.ok(await pg.locator('#home svg path').count()>0);
      await pg.fill('#src', await pg.evaluate(()=>Geulgyeol.stripMarks(GeulgyeolSample.text).replace(/\n{4,}/g,'\n\n\n'))); await pg.screenshot({path:`tests/out/merged-logo-${width}.png`});
      const sample=await pg.inputValue('#src');
      // 저장소 예시 글에 새 바탕 두 개를 적용해 실제 편집실 읽기 틀로 확인해요.
      await pg.fill('#src','[[라이트:원고지]]\n'+sample.split('\n\n\n')[0]+'\n\n\n[[다크:타자]]\n'+sample.split('\n\n\n')[0]);
      await pg.click('[data-go=tune]'); await pg.waitForSelector('#screen-main .frame.on');
      await pg.frameLocator('#screen-main .frame.on').locator('.sheet[data-ground=wongoji]').waitFor({state:'attached'});
      const frame=await (await pg.locator('#screen-main .frame.on').elementHandle()).contentFrame();
      assert.ok(await frame.locator('.sheet[data-ground=wongoji]').count()>0);
      assert.ok(await frame.locator('.sheet[data-ground=typing]').count()>0);
      await pg.screenshot({path:`tests/out/merged-wongoji-${width}.png`});
      // 부모 메시지 조건이 있으므로 편집실에서 해당 쪽으로 보낸다.
      await pg.evaluate(()=>document.querySelector('#screen-main .frame.on').contentWindow.postMessage({type:'geulgyeol:goto',page:1},location.origin));
      await frame.waitForSelector('.sheet.is-current[data-ground=typing]');
      await pg.waitForTimeout(800); await pg.screenshot({path:`tests/out/merged-typing-${width}.png`});
      const stats=await frame.evaluate(()=>['wongoji','typing'].map(kind=>{
        const canvas=GeulBackdrop.still(kind,320,180,kind==='typing'?'night':'day');
        if(!canvas)return {kind,colors:0};
        const pixels=canvas.getContext('2d').getImageData(0,0,320,180).data;
        const colors=new Set(); for(let i=0;i<pixels.length;i+=16)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
        return {kind,colors:colors.size};
      }));
      assert.ok(stats.every(s=>s.colors>10),JSON.stringify(stats));
      await pg.goto(origin+'/flip-lab.html');
      await pg.click('[data-for=day] button[data-ground=wongoji]');
      await pg.click('[data-for=night] button[data-ground=typing]');
      for (const turn of ['iris','bloom','blinds','curtain','sunrise','sunset','flash','sweep']) {
        await pg.click(`[data-turn=${turn}]`); await pg.waitForTimeout(1400);
        assert.equal(await pg.locator('.sheet.is-current').count(),1,turn);
      }
      await context.close(); console.log(`${width}px: 글자리 SVG, 원고지·타자 렌더, 넘김 8종 통과`);
    }
    assert.deepEqual(errors,[]);
  } finally {await browser?.close();await close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
