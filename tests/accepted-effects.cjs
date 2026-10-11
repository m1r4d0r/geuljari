const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const server=http.createServer(async(req,res)=>{try{const file=path.join(process.cwd(),new URL(req.url,'http://local').pathname);const content=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(content);}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const errors=[];
  for(const [width,height] of [[1280,720],[390,844]]){
   const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/fonts.g*/**',r=>r.abort());
   await page.goto(origin+'/manuscript-lab.html');
   await page.waitForSelector('.column[data-grid-size]');
   const inspect=()=>page.evaluate(()=>{const col=document.querySelector('.column'),cells=[...col.querySelectorAll('.ch,.sp,.wg-empty,.wg-indent')],n=Number(col.style.getPropertyValue('--wg-cols')),size=parseFloat(col.style.getPropertyValue('--wg-cell'));return {n,size,width:col.getBoundingClientRect().width,cells:cells.map(x=>({w:x.getBoundingClientRect().width,h:x.getBoundingClientRect().height,left:x.getBoundingClientRect().left})),overflow:document.documentElement.scrollWidth>innerWidth};});
   let grid=await inspect();assert.ok(grid.n>=8&&grid.n<=20);assert.equal(grid.overflow,false);assert.ok(Math.abs(grid.width-grid.n*grid.size)<1);grid.cells.forEach(c=>assert.ok(Math.abs(c.w-grid.size)<.1&&Math.abs(c.h-grid.size)<.1));
   await page.screenshot({path:`tests/out/manuscript-${width}.png`});
   await page.locator('input').fill('24');await page.locator('input').dispatchEvent('input');grid=await inspect();assert.ok(grid.size>33);assert.equal(grid.overflow,false);
   await page.locator('.ms-play').click();await page.waitForTimeout(250);assert.ok(await page.locator('.pending').count()>0);await page.locator('.ms-play').click();assert.equal(await page.locator('.pending').count(),0);
   const sample=(await fs.readFile('reader.html','utf8')).split('<script type="text/plain" id="glog-text">')[1].split('</script>')[0].trim().split('\n\n\n')[0];
   await page.addInitScript(sample=>{window.GeulReaderOpts={source:{text:'[[라이트:원고지]]\n'+sample+'\n\n\n[[다크:영사광:잠수]]\n'+sample}};},sample);
   await page.goto(origin+'/reader.html');
   await page.waitForSelector('.sheet.is-current');
   assert.equal(await page.locator('.sheet[data-ground=wongoji] .ground').count(),0);
   assert.ok(await page.locator('.sheet[data-ground=wongoji] .column').getAttribute('data-grid-size'));
   await page.evaluate(()=>{document.querySelector('.sheet[data-ground=wongoji] .scroll').scrollTop=90;});
   await page.evaluate(()=>window.postMessage({type:'geulgyeol:finish'},location.origin));
   for(const mode of ['dive','ink','glitch']){
    const result=await page.evaluate(mode=>{
     const stage=document.getElementById('stage'),[a,b]=stage.querySelectorAll('.sheet');
     const flip=GeulFlip.create(stage);flip.begin(a,b,mode,1);flip.render(.43);
     const c=stage.querySelector('.flip-texture');if(!c)return {missing:true};
     const first=c.toDataURL();flip.render(.8);flip.render(.43);const same=first===c.toDataURL();
     window.testFlip=flip;return {same,width:c.width,mode:flip.mode,turns:Geulgyeol.TURNS};
    },mode);
    assert.equal(result.missing,undefined);assert.equal(result.mode,mode);assert.equal(result.same,true);assert.ok(result.width>0);assert.equal(result.turns['글리치'],'glitch');
    await page.screenshot({path:`tests/out/${mode}-${width}.png`});
    await page.evaluate(()=>testFlip.finish(false));assert.equal(await page.locator('.flip-texture').count(),0);
   }
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await page.evaluate(()=>{const s=document.getElementById('stage'),[a,b]=s.querySelectorAll('.sheet');testFlip.begin(a,b,'dive',1);testFlip.render(.5);return testFlip.mode;}),'drift');
   await page.close();console.log(width+'px: 원고지 칸 맞춤·크기 변경·재생, 전환 세 가지·되감기·정리·동작 줄이기 통과');
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
