/* CHROMIUM=실행파일 node tests/publish-browser.cjs; playwright 설치가 필요해요. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
// 불러오기·저장·새로 쓰기는 편집 하단바 오른쪽에 늘 있다
const fileBtn = (pg, id) => pg.click(id);
(async () => {
  const { serve } = await import('./publish-server.mjs');
  const { store, blobs, close, origin } = await serve();
  let browser;
  const errors = [];
  try {
    // 로캘이 비어 있으면 크로뮴이 한글 파일 이름을 'download'로 바꾸므로 UTF-8 로캘로 띄워요.
    browser = await chromium.launch({executablePath:process.env.CHROMIUM || undefined,env:{...process.env,LANG:'C.UTF-8',LC_ALL:'C.UTF-8'},args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const context = await browser.newContext({ viewport:{width:1280,height:800} });
    await context.route('**/fonts.g*/**',r=>r.abort());
    const pg = await context.newPage(); pg.on('pageerror',e=>errors.push(e.message)); pg.on('dialog',d=>d.accept());
    await pg.goto(origin);  await pg.fill('#src', await pg.evaluate(()=>Geulgyeol.stripMarks(GeulgyeolSample.text).replace(/\n{4,}/g,'\n\n\n')));
    await pg.fill('#title','발행 확인'); await pg.click('[data-go=publish]');
    await pg.fill('#publish-password','4821');
    // 서버 저장 뒤 응답만 유실된 경우를 재현해요.
    let loseCreate=true,loseUpdate=false,loseDelete=false;
    await pg.route('**/api/articles**',async route=>{
      const m=route.request().method();
      if((m==='POST'&&loseCreate&&!route.request().url().endsWith('/unlock'))||(m==='PUT'&&loseUpdate)||(m==='DELETE'&&loseDelete)){
        if(m==='POST')loseCreate=false;if(m==='PUT')loseUpdate=false;if(m==='DELETE')loseDelete=false;
        await route.fetch();await route.abort('failed');
      }else await route.continue();
    });
    await pg.click('#publish-submit');await pg.waitForFunction(()=>document.querySelector('#publish-message').textContent.includes('연결이 끊겼'));

    await pg.click('#publish-submit'); await pg.waitForSelector('#publish-result:not([hidden])');
    const link = await pg.inputValue('#publish-url'); assert.match(link,/\/t\/[\w-]{22}\?v=[a-f0-9]{8}#[\w-]{43}$/);
    const bare = u => u.replace(/\?[^#]*/, '');
    const id = new URL(link).pathname.split('/')[2]; const key = new URL(link).hash.slice(1);
    // 발행 기록(열쇠·비밀번호)은 이 브라우저에 남지만 본문 암호문은 넣지 않아요.
    const kept = await pg.evaluate(()=>JSON.parse(localStorage.getItem('geul.publication'))); assert.equal(kept.key,key); assert.equal(kept.password,'4821'); assert.equal(kept.record.cipher,undefined);
    // 링크 칸을 누르면 바로 복사돼요.
    assert.ok(!JSON.stringify(await store.get(id)).includes('4821'));
    const firstRecord = await store.get(id);
    assert.equal(firstRecord.revision,1); assert.ok(firstRecord.ogImage);
    const imageURL = r => `${origin}/og/${id}/${r.ogHash}.${r.ogType || "png"}`;
    const firstImage = await fetch(imageURL(firstRecord)); assert.equal(firstImage.status,200);
    const firstBytes = Buffer.from(await firstImage.arrayBuffer()); assert.equal(firstImage.headers.get('content-type'),'image/jpeg'); assert.equal(firstBytes.readUInt16BE(0),0xffd8); assert.ok(firstBytes.length < 700000);
    const html = await (await fetch(link.split('#')[0])).text(); assert.ok(html.includes(imageURL(firstRecord))); assert.ok(!html.includes(key));
    await fs.mkdir('tests/out',{recursive:true}); await fs.writeFile('tests/out/og-published.jpg',firstBytes);
    // 텍스트 복사: 제목·링크·비밀번호 세 줄
    await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
    await pg.click('#publish-url'); assert.equal(await pg.evaluate(()=>navigator.clipboard.readText()),link);
    await pg.waitForFunction(()=>document.querySelector('#toast').textContent.includes('클립보드에 복사'));
    await pg.click('#publish-share'); assert.equal(await pg.evaluate(()=>navigator.clipboard.readText()),'글자리 · 발행 확인\n링크: '+link+'\n비밀번호: 4821');
    // 발행 뒤 글 파일: [발행] 이름에 링크·비밀번호를 담아요.
    const downloadPromise = pg.waitForEvent('download'); await pg.click('#publish-download'); const download = await downloadPromise;
    assert.match(download.suggestedFilename(),/^\[발행\] 발행 확인 \d{4}-\d{2}-\d{2}\.txt$/);
    const file = await download.path(); const published = await fs.readFile(file,'utf8');
    assert.ok(published.startsWith('글자리 글 파일')); assert.ok(published.includes('\n링크: '+link+'\n')); assert.ok(published.includes('\n비밀번호: 4821\n'));
    const reader = await context.newPage(); reader.on('pageerror',e=>errors.push(e.message));
    await reader.goto('about:blank'); await reader.goto(link); await reader.waitForSelector('#read-status[hidden]',{state:'attached'});
    assert.equal(await reader.evaluate(()=>GeulReaderOpts.source.title),'발행 확인');
    await reader.goto(link.split('#')[0]+'#'+'A'.repeat(43)); await reader.waitForFunction(()=>document.querySelector('#read-message').textContent.includes('열쇠'));
    await pg.click('#publish-live'); await pg.waitForFunction(()=>document.querySelector('.write-bar .publication-label').textContent.startsWith('발행 중단'));
    assert.equal((await fetch(imageURL(firstRecord))).status,404);
    await reader.goto('about:blank'); await reader.goto(link); await reader.waitForFunction(()=>document.querySelector('#read-message').textContent.includes('발행이 중단'));
    await pg.reload(); await fileBtn(pg,'#load-open');
    await pg.fill('#load-url',link); await pg.fill('#load-password','incorrect-password'); await pg.click('#load-form button[type=submit]');
    await pg.waitForFunction(()=>document.querySelector('#load-message').textContent.includes('맞지'));
    await pg.click('#load-close');
    // 발행 글 파일을 놓으면 글이 돌아오고 발행 관리도 이어져요.
    await fileBtn(pg,'#clear'); await fileBtn(pg,'#load-open');
    await pg.setInputFiles('#load-file',file); await pg.waitForSelector('#load-dialog',{state:'hidden'});
    await pg.waitForSelector('.write-bar .publication-strip:not([hidden])');
    assert.equal(await pg.inputValue('#title'),'발행 확인');
    // 예전 관리 파일(JSON·줄글)도 읽어요.
    await fs.mkdir('tests/out',{recursive:true});
    await fs.writeFile('tests/out/legacy-key.txt',JSON.stringify({format:'geuljari-key',version:1,url:link,password:'4821'}));
    await fileBtn(pg,'#load-open'); await pg.setInputFiles('#load-file','tests/out/legacy-key.txt');
    await pg.waitForFunction(()=>document.querySelector('#load-message').textContent.includes('관리 파일을 읽었'));
    assert.equal(await pg.inputValue('#load-url'),link); await pg.click('#load-close');
    await fs.writeFile('tests/out/legacy-key2.txt','글자리 관리 파일\n\n링크: '+link+'\n비밀번호: 4821\n');
    await fileBtn(pg,'#load-open'); await pg.setInputFiles('#load-file','tests/out/legacy-key2.txt');
    await pg.waitForFunction(()=>document.querySelector('#load-message').textContent.includes('관리 파일을 읽었'));
    assert.equal(await pg.inputValue('#load-password'),'4821'); await pg.click('#load-close');
    await pg.click('[data-go=publish]'); assert.equal(await pg.getAttribute('#publish-live','aria-checked'),'false');
    await pg.click('#publish-live'); await pg.waitForFunction(()=>document.querySelector('#publish-live').getAttribute('aria-checked')==='true'&&!document.querySelector('#publish-live').disabled);
    // 스위치로 다시 열면 남아 있던 본문으로 공유 이미지를 다시 만들어요.
    const reopened = await store.get(id); assert.ok(reopened.live); assert.equal((await fetch(imageURL(reopened))).status,200);
    // 이미지 없이 놓인 발행 글은 편집실을 다시 열면 이미지를 채워요.
    await store.change(id, r => ({ next:{ ...r, ogImage:undefined, ogHash:undefined, revision:r.revision + 1 }, value:null }));
    await pg.reload(); await pg.waitForFunction(()=>document.querySelector('#toast').textContent.includes('미리보기 그림'));
    const healed = await store.get(id); assert.match(healed.ogHash,/^[a-f0-9]{64}$/); assert.equal((await fetch(imageURL(healed))).status,200);
    await pg.click('[data-go=publish]');
    await pg.fill('#publish-title','수정한 제목'); loseUpdate=true;
    await pg.click('#publish-submit');await pg.waitForFunction(()=>document.querySelector('#publish-message').textContent.includes('연결이 끊겼'));
    const savedRevision=(await store.get(id)).revision;
    await pg.click('#publish-submit');
    await pg.waitForFunction(()=>document.querySelector('.write-bar .publication-label').textContent.includes('수정한 제목'));
    assert.equal(bare(await pg.inputValue('#publish-url')),bare(link));assert.notEqual(await pg.inputValue('#publish-url'),link);assert.equal((await store.get(id)).revision,savedRevision);
    const updatedRecord = await store.get(id); assert.notEqual(updatedRecord.ogHash,firstRecord.ogHash);
    assert.equal((await fetch(imageURL(firstRecord))).status,404); assert.equal((await fetch(imageURL(updatedRecord))).status,200);
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
    await pg.setViewportSize({width:1280,height:800});
    // 오래된 버전의 수정은 거부하고 입력한 내용은 남겨요.
    await store.change(id,r=>({next:{...r,revision:r.revision+1}}));
    await pg.fill('#publish-title','충돌해도 남을 제목'); await pg.click('#publish-submit');
    await pg.waitForFunction(()=>document.querySelector('#publish-message').textContent.includes('다른 곳'));
    assert.equal(await pg.inputValue('#publish-title'),'충돌해도 남을 제목');
    await pg.click('[data-go=write]'); await fileBtn(pg,'#load-open'); await pg.fill('#load-url',link); await pg.fill('#load-password','4821'); await pg.click('#load-form button[type=submit]'); await pg.waitForSelector('#load-dialog',{state:'hidden'});
    await pg.click('[data-go=publish]');loseDelete=true;await pg.click('#publish-delete');
    await pg.waitForFunction(()=>document.querySelector('#publish-message').textContent.includes('연결이 끊겼'));await pg.click('#publish-delete');
    await pg.waitForFunction(()=>document.querySelector('#publish-message').textContent.includes('삭제했어요'));
    assert.equal(await store.get(id),null); assert.equal((await blobs.get(id,{type:'json'})).deleted,true); await reader.goto('about:blank'); await reader.goto(link); await reader.waitForFunction(()=>document.querySelector('#read-message').textContent.includes('삭제'));
    assert.equal((await fetch(imageURL(updatedRecord))).status,404);
    // 글 파일: 받아서 새로 쓰기로 비운 뒤 다시 불러오면 글과 설정이 돌아와요.
    await pg.click('[data-go=write]');
    const before = await pg.evaluate(()=>JSON.parse(localStorage.getItem('geul.studio')));
    const docPromise = pg.waitForEvent('download'); await fileBtn(pg,'#file-save'); const docDownload = await docPromise;
    assert.match(docDownload.suggestedFilename(),/^\[초안\] .+ \d{4}-\d{2}-\d{2}\.txt$/);
    const docFile = await docDownload.path(); const docText = await fs.readFile(docFile,'utf8');
    assert.ok(docText.startsWith('글자리 글 파일')); assert.ok(!docText.includes('\n비밀번호: ')); assert.ok(docText.includes(before.source)); assert.ok(docText.includes('\n글꼴: '+before.settings.font+'\n'));
    await fileBtn(pg,'#clear'); assert.equal(await pg.inputValue('#src'),'');
    await fileBtn(pg,'#load-open'); await pg.setInputFiles('#load-file',docFile); await pg.waitForSelector('#load-dialog',{state:'hidden'});
    // 편집실은 0.25초 뒤에 저장하므로, 불러온 글이 저장될 때까지 기다렸다 읽어요.
    await pg.waitForFunction((src)=>JSON.parse(localStorage.getItem('geul.studio')).source===src,before.source);
    const after = await pg.evaluate(()=>JSON.parse(localStorage.getItem('geul.studio')));
    for (const k of ['title','source','made','settings','moods','moodsTouched','ending']) assert.deepEqual(after[k],before[k],k);
    assert.equal(await pg.isVisible('.write-bar .publication-strip'),false);
    assert.deepEqual(errors,[]); console.log('발행 / 복호화 / 잘못된 열쇠 / 중단 / 텍스트 복사 / 발행·초안 글 파일 / 예전 관리 파일 / 재발행 / 충돌 / 삭제 / 모바일: 통과');
  } finally { await browser?.close(); await close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
