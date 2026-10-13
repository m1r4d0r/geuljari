/* 미리보기 하단바(쪽 다듬기)와 그 자리 고치기를 PC·폰 크기에서 확인해요.
   갈래 고르기(바탕·글 둘), 쪽 표시로 들어가는 바탕·전환·쪽별 크기, 전환 속도, '다시 보기' 표시, 바로 흐름,
   두 번 눌러 고치기(강조·꾸밈·색 → 본문 표시, X는 되돌림, 체크는 남김), X·체크가 글 상자 선에 딱 붙는지, 눈금 네모. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  const { serve } = await import('./publish-server.mjs');
  const { origin, close } = await serve();
  let browser; const errors = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    await fs.mkdir('tests/out', { recursive: true });
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: width < 761 });
      ctx.setDefaultTimeout(12000);
      await ctx.route('**/fonts.g*/**', (r) => r.abort());
      await ctx.addInitScript(() => { try { localStorage.setItem('geul.guide', 'true'); } catch (e) { /* 저장 불가 */ } });
      const pg = await ctx.newPage(); pg.on('pageerror', (e) => errors.push(e.message));
      await pg.goto(origin);
      await pg.fill('#src', '첫 쪽의 글이에요. 마지막 문장은 여기예요.\n\n\n둘째 쪽은 조금 더 길게 써 두었어요.\n\n\n셋째 쪽이에요.');
      await pg.waitForFunction(() => (JSON.parse(localStorage.getItem('geul.studio') || '{}').source || '').length > 0);
      await pg.click('[data-go=tune]');
      let frame = pg.frameLocator('#screen-main .frame.on');
      await frame.locator('.sheet.is-current .column').waitFor();
      assert.equal(await pg.locator('.toast.on').count(), 0);

      // 눈금: 글 쪽 셋과 끝 장 하나, 글자 없음
      assert.equal(await frame.locator('#dots .dot').count(), 4);
      assert.equal(await frame.locator('#dots .dot.fin').count(), 1);
      assert.equal((await frame.locator('#dots').textContent()).trim(), '');

      // 첫 쪽은 전환 없음. 둘째 쪽으로 가면 전환이 생기고, 고르면 쪽 표시로 들어감
      assert.equal(await pg.textContent('#s-tune .tb-cat .tb-label'), '바탕');
      assert.equal(await pg.locator('#s-tune .tb-val[data-key=turn]').count(), 0);
      await frame.locator('#dots .dot').nth(1).click();
      await pg.waitForFunction(() => document.querySelector('#s-tune .tb-val[data-key=turn]'));
      await pg.click('#s-tune .tb-val[data-key=turn]'); await pg.click('#tb-drop-turn .tb-li:has-text("섬광")');
      await pg.waitForFunction(() => JSON.parse(localStorage.getItem('geul.studio')).source.includes('[[섬광]]'));
      assert.equal(await pg.textContent('#s-tune .tb-val[data-key=turn] .tb-label'), '전환 섬광');
      await pg.click('#s-tune .tb-val[data-key=ground]'); await pg.click('#tb-drop-ground .tb-li:has-text("원고지")');
      await pg.waitForFunction(() => JSON.parse(localStorage.getItem('geul.studio')).source.includes('원고지'));

      // 바탕의 전환 속도: 이 쪽으로 넘어올 때
      assert.equal(await pg.locator('#s-tune .tb-cat-item').count(), 1);
      await pg.click('#s-tune .tb-val[data-key=turnSpeed]');
      await pg.locator('#tb-drop-turnSpeed input').evaluate((n) => { n.value = '1.3'; n.dispatchEvent(new Event('input', { bubbles: true })); });
      await pg.keyboard.press('Escape');
      // 전환 속도도 이 쪽에만(쪽 표시)
      await pg.waitForFunction(() => JSON.parse(localStorage.getItem('geul.studio')).source.includes('전환속도130'));
      // 손을 멈추면 그 쪽으로 한 번 넘겨 보인다: 다시 둘째 쪽에 닿을 때까지 기다림
      // 넘겨 보이는 동안 첫 쪽을 잠깐 거치므로, 둘째 쪽에 닿아 넘김이 끝난 뒤까지 기다림
      await pg.waitForTimeout(700);
      await pg.waitForFunction(() => JSON.parse(localStorage.getItem('geul.studio')).page === 1);
      await pg.waitForFunction(() => { const d = document.querySelector('#screen-main .frame.on')?.contentDocument; const sh = d && d.querySelector('.sheet.is-current'); return sh && sh.dataset.i === '1' && !d.querySelector('.sheet.is-moving'); }, null, { timeout: 8000 });
      await pg.waitForTimeout(600);
      await pg.waitForFunction(() => JSON.parse(localStorage.getItem('geul.studio')).page === 1);
      // 글: 갈래는 바탕·글 둘. 바꾸면 지금 눈금이 장미색, 누르면 다시 씀. 바로 흐름을 고를 수 있음
      await pg.click('#s-tune .tb-cat');
      assert.deepEqual(await pg.locator('#s-tune .tb-cat-item .tb-li').allTextContents(), ['바탕', '글', '전체 설정']);
      assert.equal(await pg.locator('#s-tune .tb-cat-item .tb-ttl, #s-tune .tb-cat-item .tb-gname').count(), 0, '갈래 판에는 이름 없음');
      // 갈래 판 맨 위의 전체 설정: 글 전체 값 창. 칸 넷과 두 칸 폭의 속도 막대, 탭은 머리 줄 아래 선의 오른쪽 끝
      // 편집실은 조금 뒤에 저장하므로 저장된 값이 맞을 때까지 기다림(s: 저장된 편집실 상태)
      const until = (cond) => pg.waitForFunction(`(() => { const s = JSON.parse(localStorage.getItem('geul.studio')); return ${cond}; })()`, null, { timeout: 4000 });
      const openAll = async () => { await pg.click('#s-tune .tb-cat'); await pg.click('#s-tune .tb-cat-item .tb-li:has-text("전체 설정")'); await pg.locator('#all-dialog').waitFor(); };
      const slide = (v) => pg.locator('#all-body .as-slide input').evaluate((n, x) => { n.value = x; n.dispatchEvent(new Event('input', { bubbles: true })); }, v);
      await pg.click('#s-tune .tb-cat-item .tb-li:has-text("전체 설정")');
      assert.equal(await pg.isVisible('#all-dialog'), true);
      assert.equal(await pg.locator('#all-body .as-btn').count(), 4);
      assert.equal(await pg.locator('#all-body .as-wide .as-slide input').count(), 1);
      const edge = await pg.evaluate(() => { const h = document.querySelector('.as-head').getBoundingClientRect(); const t = document.querySelector('.as-tabs').getBoundingClientRect(); return { right: Math.round(h.right - t.right), bottom: Math.round(h.bottom - 1 - t.bottom) }; });
      assert.deepEqual(edge, { right: 0, bottom: 0 }, '탭은 선 오른쪽 끝에 붙음');
      // 둘째 쪽은 하단바에서 전환·전환 속도를 골라 '따로'가 켜져 있음. 끄면 걷히고 다시 켜면 돌아옴
      assert.equal(await pg.getAttribute('.as-switch', 'aria-checked'), 'true');
      assert.equal(await pg.textContent('.as-page .as-note'), '전환·전환 속도');
      await pg.click('.as-switch');
      assert.equal(await pg.getAttribute('.as-switch', 'aria-checked'), 'false');
      await until(`!s.source.includes('섬광') && !s.source.includes('전환속도') && s.source.includes('[[원고지]]')`); // 따로 끄면 쪽 값만 걷힘
      await pg.click('.as-switch');
      await until(`s.source.includes('전환속도130')`); // 다시 켜면 돌아옴
      await pg.click('.as-switch');
      // 글 탭: 속도는 맨 아래 막대. 바꾸고 취소하면 연 때로
      await pg.click('#all-dialog [data-tab=text]');
      assert.equal(await pg.getAttribute('#all-dialog [data-tab=text]', 'aria-selected'), 'true');
      assert.deepEqual(await pg.locator('#all-body .as-btn').evaluateAll((l) => l.map((b) => b.dataset.key)), ['flow', 'size', 'measure', 'align']);
      await pg.click('#all-body .as-btn[data-key=flow]');
      assert.equal(await pg.locator('#all-body .as-drop .as-li').count(), 6);
      await pg.keyboard.press('Escape');
      assert.equal(await pg.isVisible('#all-dialog'), true);
      assert.equal(await pg.locator('#all-body .as-drop').count(), 0);
      await slide('1.3');
      assert.equal(await pg.textContent('#all-body .as-val'), '1.3×');
      await until('s.settings.speed === 1.3');
      await pg.click('.as-cancel');
      assert.equal(await pg.isVisible('#all-dialog'), false);
      await until(`s.source.includes('섬광:전환속도130') && s.settings.speed === 1`); // 취소하면 쪽 값도 돌아옴
      // 전체 초기화: 모든 쪽 값과 전체 값을 걷고, Esc(취소)면 돌아옴
      await openAll();
      await pg.click('#all-dialog [data-tab=text]');
      await slide('1.2');
      await pg.click('.as-reset');
      await until(`s.settings.speed === 1 && !s.source.includes('섬광')`);
      assert.equal(await pg.getAttribute('.as-switch', 'aria-checked'), 'false');
      await pg.keyboard.press('Escape');
      assert.equal(await pg.isVisible('#all-dialog'), false);
      await until(`s.source.includes('전환속도130')`);
      // 저장하면 남음
      await openAll();
      await pg.click('#all-dialog [data-tab=text]');
      await slide('1.1');
      await pg.click('.as-save');
      assert.equal(await pg.isVisible('#all-dialog'), false);
      await until('s.settings.speed === 1.1');
      await openAll();
      await pg.click('#all-dialog [data-tab=text]');
      await slide('1');
      await pg.click('.as-save');
      await until('s.settings.speed === 1');
      await pg.click('#s-tune .tb-cat');
      await pg.click('#s-tune .tb-cat-item .tb-li:has-text("글")');
      assert.equal(await pg.locator('#s-tune .tb-val[data-key=place], #s-tune .tb-val[data-key=font], #s-tune .tb-val[data-key=rest], #s-tune .tb-val[data-key=dry]').count(), 0);
      await pg.click('#s-tune .tb-val[data-key=flow]'); await pg.click('#tb-drop-flow .tb-li:has-text("바로")');
      assert.equal(await pg.textContent('#s-tune .tb-val[data-key=flow] .tb-label'), '바로');
      // 결도 이 쪽에만
      await pg.waitForFunction(() => /\[\[[^\]]*결바로/.test(JSON.parse(localStorage.getItem('geul.studio')).source));
      assert.equal(await pg.evaluate(() => JSON.parse(localStorage.getItem('geul.studio')).settings.flow), '이어 쓰기');
      // 다시 보기는 지금 쪽 눈금: 바꾼 움직임을 아직 안 봤으면 장미색, 꽉 찬 눈금을 누르면 바뀐 값으로 다시 씀
      assert.equal(await pg.locator('#replay-top').count(), 0);
      frame = pg.frameLocator('#screen-main .frame.on');
      await frame.locator('#dots.is-due .dot.is-full[aria-current="true"]').waitFor();
      const oldSrc = await pg.getAttribute('#screen-main .frame.on', 'src');
      await frame.locator('#dots .dot[aria-current="true"]').click();
      // 새 틀이 바꿔 끼워질 때까지 기다린 뒤 그 틀을 본다
      await pg.waitForFunction((src) => { const f = document.querySelector('#screen-main .frame.on'); const b = f && f.getAttribute('src') !== src && f.contentDocument?.getElementById('dots'); return b && b.children.length && !b.classList.contains('is-due'); }, oldSrc, { timeout: 8000 });
      // 바로: 새 틀이 첫 쪽에 닿아 바꿔 끼워진 뒤 그 쪽 글이 다 놓임(바탕 그리기가 무거우면 조금 늦음)
      await pg.waitForFunction(() => { const f = document.querySelector('#screen-main .frame.on'); const d = f && f.contentDocument; const sh = d && d.querySelector('.sheet.is-current'); return !!sh && sh.querySelectorAll('.ch').length > 0 && sh.querySelectorAll('.ch.pending').length === 0; }, null, { timeout: 8000 });
      frame = pg.frameLocator('#screen-main .frame.on');
      assert.equal(await frame.locator('.sheet.is-current .ch.pending').count(), 0, '바로: 다 놓임');

      // 글: 첫 쪽으로 돌아가 그 쪽 글자 크기만 키움(쪽 표시로)
      await frame.locator('#dots .dot').first().click();
      await frame.locator('#dots .dot[aria-current="true"]').first().evaluate(() => 0);
      await pg.waitForFunction(() => JSON.parse(localStorage.getItem('geul.studio')).page === 0);
      await frame.locator('.sheet.is-current .column').click({ position: { x: 6, y: 6 } });
      await pg.waitForFunction(() => document.body.dataset.tuneCat === 'text');
      await pg.click('#s-tune .tb-val[data-key=size]');
      await pg.locator('#tb-drop-size input').evaluate((n) => { n.value = '1.2'; n.dispatchEvent(new Event('input', { bubbles: true })); });
      await pg.keyboard.press('Escape');
      await pg.waitForFunction(() => JSON.parse(localStorage.getItem('geul.studio')).source.startsWith('[[크기120]]'));
      frame = pg.frameLocator('#screen-main .frame.on');
      assert.equal(await frame.locator('.sheet[data-i="0"]').evaluate((n) => n.style.getPropertyValue('--page-k')), '1.2');
      assert.equal(await frame.locator('.sheet[data-i="1"]').evaluate((n) => n.style.getPropertyValue('--page-k')), '');

      // 두 번 눌러 고치기
      frame = pg.frameLocator('#screen-main .frame.on');
      await frame.locator('.sheet.is-current .column').waitFor();
      await pg.waitForTimeout(600);
      await frame.locator('.sheet.is-current .column').dblclick({ position: { x: 10, y: 10 } });
      await frame.locator('.ip').waitFor();
      await pg.waitForFunction(() => document.body.dataset.tuneCat === 'pick');
      assert.equal(await pg.locator('#s-tune .tb-val[data-key=em]').isDisabled(), true, '고르기 전에는 쉼');
      const geo = await frame.locator('.ip').evaluate(() => {
        const f = document.querySelector('.ip-frame').getBoundingClientRect();
        const a = document.querySelector('.ip-acts').getBoundingClientRect();
        return { right: f.right - a.right, top: a.top - (f.bottom - 1) };
      });
      assert.deepEqual(geo, { right: 0, top: 0 }, 'X·체크는 상자 선에 겹쳐 붙음');
      await frame.locator('.ip-input').evaluate((ta) => { ta.focus(); ta.setSelectionRange(0, 4); document.dispatchEvent(new Event('selectionchange')); });
      await pg.waitForFunction(() => !document.querySelector('#s-tune .tb-val[data-key=em]').disabled);
      await pg.click('#s-tune .tb-val[data-key=em]'); await pg.click('#tb-drop-em .tb-li:has-text("번짐")');
      await pg.waitForFunction(() => JSON.parse(localStorage.getItem('geul.studio')).source.includes('{{번짐:'));
      // 고른 효과를 그 자리에서 보임: 고름은 그대로, 표시는 숨겼다가 끝나면 돌아옴
      await frame.locator('.ip.ip-previewing .pv-ch').first().waitFor();
      assert.equal(await frame.locator('.ip .m-mark.pv-hide').count() > 0, true);
      assert.ok(await frame.locator('.ip-input').evaluate((ta) => ta.selectionStart !== ta.selectionEnd), '고름이 남음');
      await frame.locator('.ip:not(.ip-previewing)').waitFor({ timeout: 8000 });
      assert.equal(await frame.locator('.ip .pv-ch').count(), 0);
      await pg.click('#s-tune .tb-val[data-key=style]'); await pg.click('#tb-drop-style .tb-li:has-text("굵게")');
      assert.equal(await pg.locator('#tb-drop-style').count(), 1, '꾸밈은 여러 개라 판이 남음');
      await pg.waitForFunction(() => JSON.parse(localStorage.getItem('geul.studio')).source.includes('{{번짐+굵게:'));
      // 이 강조의 속도: 머리에 속도150으로(Esc는 고치는 칸이 받아 고치기를 끝내므로 쓰지 않음)
      await pg.click('#s-tune .tb-val[data-key=bspeed]');
      await pg.locator('#tb-drop-bspeed input').evaluate((n) => { n.value = '1.5'; n.dispatchEvent(new Event('input', { bubbles: true })); });
      await pg.waitForFunction(() => JSON.parse(localStorage.getItem('geul.studio')).source.includes('{{번짐+굵게+속도150:'));
      await pg.screenshot({ path: `tests/out/tune-bar-edit-${width}.png` });
      // X: 고치기 전으로
      await frame.locator('.ip-acts button').first().click();
      await pg.waitForFunction(() => !JSON.parse(localStorage.getItem('geul.studio')).source.includes('{{'));
      await pg.waitForFunction(() => document.body.dataset.tuneCat !== 'pick');
      // 체크: 남김
      await pg.waitForTimeout(800);
      frame = pg.frameLocator('#screen-main .frame.on');
      await frame.locator('.sheet.is-current .column').dblclick({ position: { x: 10, y: 10 } });
      await frame.locator('.ip').waitFor();
      await frame.locator('.ip-input').evaluate((ta) => { ta.focus(); ta.setSelectionRange(0, 4); document.dispatchEvent(new Event('selectionchange')); });
      await pg.waitForFunction(() => !document.querySelector('#s-tune .tb-val[data-key=color]').disabled);
      // 색: 이름 있는 여섯과 늘 '직접 고르기'
      await pg.click('#s-tune .tb-val[data-key=color]');
      assert.equal(await pg.locator('#tb-drop-color .tb-picker input[type=color]').count(), 1);
      await pg.keyboard.press('Escape');
      await pg.click('#s-tune .tb-val[data-key=color]'); await pg.click('#tb-drop-color .tb-li:has-text("파랑")');
      await frame.locator('.ip-acts button').last().click();
      await pg.waitForFunction(() => JSON.parse(localStorage.getItem('geul.studio')).source.includes('{{파랑:'));
      await pg.waitForFunction(() => document.body.dataset.tuneCat !== 'pick');
      assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await ctx.close();
      console.log(`${width}×${height}: 갈래 둘·바탕·전환·전환 속도·쪽별 크기, 다시 보기·바로, 두 번 눌러 고치기·X·체크, 눈금 통과`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
