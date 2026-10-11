/* CHROMIUM=실행파일 node tests/publish-browser.cjs; playwright 설치가 필요해요. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  const { serve } = await import('./publish-server.mjs');
  const { store, blobs, close, origin } = await serve();
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({executablePath:process.env.CHROMIUM || undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const context = await browser.newContext({ viewport:{width:1280,height:800} });
    await context.route('**/fonts.g*/**',r=>r.abort());
    const pg = await context.newPage(); pg.on('pageerror',e=>errors.push(e.message)); pg.on('dialog',d=>d.accept());
    await pg.goto(origin);  await pg.fill('#src', await pg.evaluate(()=>Geulgyeol.stripMarks(GeulgyeolSample.text).replace(/\n{4,}/g,'\n\n\n')));
    await pg.fill('#title','발행 확인'); await pg.click('[data-go=publish]');
    await pg.fill('#publish-password','test-only-password'); await pg.fill('#publish-confirm','test-only-password'); await pg.check('#publish-agree');
    await pg.click('#publish-submit'); await pg.waitForSelector('#publish-result:not([hidden])');
    const link = await pg.inputValue('#publish-url'); assert.match(link,/\/t\/[\w-]{22}#[\w-]{43}$/);
    const id = new URL(link).pathname.split('/')[2]; const key = new URL(link).hash.slice(1);
    const local = await pg.evaluate(()=>JSON.stringify(localStorage)); assert.ok(!local.includes('test-only-password')); assert.ok(!local.includes(key));
    assert.ok(!JSON.stringify(await store.get(id)).includes('test-only-password'));
    const downloadPromise = pg.waitForEvent('download'); await pg.click('#publish-download'); const download = await downloadPromise;
    const file = await download.path(); const management = await fs.readFile(file,'utf8');
    assert.ok(management.startsWith('글자리 관리 파일')); assert.ok(management.includes('\n링크: '+link+'\n')); assert.ok(management.includes('\n비밀번호: test-only-password\n'));
    const reader = await context.newPage(); reader.on('pageerror',e=>errors.push(e.message));
    await reader.goto('about:blank'); await reader.goto(link); await reader.waitForSelector('#read-status[hidden]',{state:'attached'});
    assert.equal(await reader.evaluate(()=>GeulReaderOpts.source.title),'발행 확인');
    await reader.goto(link.split('#')[0]+'#'+'A'.repeat(43)); await reader.waitForFunction(()=>document.querySelector('#read-message').textContent.includes('열쇠'));
    await pg.uncheck('#publish-live'); await pg.click('#publish-submit'); await pg.waitForFunction(()=>document.querySelector('#publication-label').textContent.startsWith('발행 중단'));
    await reader.goto('about:blank'); await reader.goto(link); await reader.waitForFunction(()=>document.querySelector('#read-message').textContent.includes('발행이 중단'));
    await pg.reload(); await pg.click('#load-open');
    await pg.fill('#load-url',link); await pg.fill('#load-password','incorrect-password'); await pg.click('#load-form button[type=submit]');
    await pg.waitForFunction(()=>document.querySelector('#load-message').textContent.includes('맞지'));
    await pg.setInputFiles('#load-file',file); await pg.waitForFunction(()=>document.querySelector('#load-message').textContent.includes('관리 파일을 읽었'));
    await pg.click('#load-form button[type=submit]'); await pg.waitForSelector('#load-dialog',{state:'hidden'});
    assert.equal(await pg.inputValue('#title'),'발행 확인');
    // 예전 JSON 관리 파일도 읽어요.
    await fs.mkdir('tests/out',{recursive:true});
    await fs.writeFile('tests/out/legacy-key.txt',JSON.stringify({format:'geuljari-key',version:1,url:link,password:'test-only-password'}));
    await pg.click('#load-open'); await pg.setInputFiles('#load-file','tests/out/legacy-key.txt');
    await pg.waitForFunction(()=>document.querySelector('#load-message').textContent.includes('관리 파일을 읽었'));
    assert.equal(await pg.inputValue('#load-url'),link); await pg.click('#load-close');
    await pg.click('[data-go=publish]'); assert.equal(await pg.isChecked('#publish-live'),false);
    await pg.fill('#publish-title','수정한 제목'); await pg.check('#publish-live'); await pg.click('#publish-submit');
    await pg.waitForFunction(()=>document.querySelector('#publication-label').textContent.includes('수정한 제목'));
    assert.equal(await pg.inputValue('#publish-url'),link);
    await reader.goto('about:blank'); await reader.goto(link); await reader.waitForSelector('#read-status[hidden]',{state:'attached'});
    assert.equal(await reader.evaluate(()=>GeulReaderOpts.source.title),'수정한 제목');
    await fs.mkdir('tests/out',{recursive:true});
    await pg.screenshot({path:'tests/out/publish-desktop.png'});
    for (const width of [390,320]) {
      await pg.setViewportSize({width,height:844}); await pg.screenshot({path:`tests/out/publish-${width}.png`});
      assert.ok(await pg.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
      await pg.click('[data-go=write]'); assert.ok(await pg.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
      await pg.click('[data-go=publish]');
    }
    // 오래된 버전의 수정은 거부하고 입력한 내용은 남겨요.
    await store.change(id,r=>({next:{...r,revision:r.revision+1}}));
    await pg.fill('#publish-title','충돌해도 남을 제목'); await pg.click('#publish-submit');
    await pg.waitForFunction(()=>document.querySelector('#publish-message').textContent.includes('다른 곳'));
    assert.equal(await pg.inputValue('#publish-title'),'충돌해도 남을 제목');
    await pg.click('[data-go=write]'); await pg.click('#load-open'); await pg.fill('#load-url',link); await pg.fill('#load-password','test-only-password'); await pg.click('#load-form button[type=submit]'); await pg.waitForSelector('#load-dialog',{state:'hidden'});
    await pg.click('[data-go=publish]'); await pg.click('#publish-delete');
    await pg.waitForFunction(()=>document.querySelector('#publish-message').textContent.includes('삭제했어요'));
    assert.equal(await store.get(id),null); assert.equal((await blobs.get(id,{type:'json'})).deleted,true); await reader.goto('about:blank'); await reader.goto(link); await reader.waitForFunction(()=>document.querySelector('#read-message').textContent.includes('삭제'));
    // 글 파일: 받아서 새로 쓰기로 비운 뒤 다시 불러오면 글과 설정이 돌아와요.
    await pg.click('[data-go=write]');
    const before = await pg.evaluate(()=>JSON.parse(localStorage.getItem('geul.studio')));
    const docPromise = pg.waitForEvent('download'); await pg.click('#file-save'); const docDownload = await docPromise;
    assert.match(docDownload.suggestedFilename(),/^글자리-.+\.txt$/);
    const docFile = await docDownload.path(); const docText = await fs.readFile(docFile,'utf8');
    assert.ok(docText.startsWith('글자리 글 파일')); assert.ok(docText.includes(before.source)); assert.ok(docText.includes('\n글꼴: '+before.settings.font+'\n'));
    await pg.click('#clear'); assert.equal(await pg.inputValue('#src'),'');
    await pg.click('#load-open'); await pg.setInputFiles('#load-file',docFile); await pg.waitForSelector('#load-dialog',{state:'hidden'});
    const after = await pg.evaluate(()=>JSON.parse(localStorage.getItem('geul.studio')));
    for (const k of ['title','source','made','settings','moods','moodsTouched','ending']) assert.deepEqual(after[k],before[k],k);
    assert.equal(await pg.isVisible('#publication-strip'),false);
    assert.deepEqual(errors,[]); console.log('발행 / 복호화 / 잘못된 열쇠 / 중단 / 관리 파일(줄글·JSON) / 글 파일 / 재발행 / 충돌 / 삭제 / 모바일: 통과');
  } finally { await browser?.close(); await close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
