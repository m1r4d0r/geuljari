/*
 * 글결 읽기 틀
 * 글을 페이지(빈 줄 둘로 나뉜 덩어리)마다 화면 한 장으로 세우고, 진행값 pos 하나로 장 사이를 오간다.
 *   pos = 2.4 → 3번째 장에서 4번째 장으로 40% 넘어간 상태
 * 마지막 쪽 뒤에는 끝 장(.sheet.ending, ending.js)이 하나 더 있다. 쓸 글이 없어서 도착하면 바로 다 쓴 장으로 친다.
 * pos는 끌기가 직접 밀고, 손을 떼면 스프링이 가까운 장으로 마저 데려간다. 키·휠·눈금은 정해진 시간과 곡선으로 휙 넘긴다.
 *   그 시간과 곡선은 넘김마다 GeulFlip.timing이 정한다(바닥 빛이 먼저 드는 lead, 움직이는 run, 빛이 빠지는 tail).
 * 두 장의 장면(라이트·다크)이 다르면 반전 넘김으로, 같으면 스며들듯 겹쳐 넘긴다.
 *   쪽 표시 줄에 넘김이 적힌 쪽은 그 넘김으로 들어온다. 적지 않은 쪽은 장면이 바뀌면 window.GeulReaderOpts.turn(다크로, 기본 쓸기)·turnLight(라이트로, 없으면 turn).
 * 장에 도착하면 그 장의 글을 엔진 시간표대로 써 내려간다. 쓰는 중에 넘기려 하면 처음 한 번은 그 장을 다 쓰고, 그다음에 넘긴다.
 * 화면에는 아래 가운데의 쪽 눈금 말고 글자를 띄우지 않는다. 지금 장의 눈금은 테두리 네모에 써 나간 만큼 먹이 아래에서 차오르고,
 * 다 찬 지금 눈금을 누르면 그 장을 다시 쓴다. 끝 장은 테두리 네모 하나로 따로 보인다.
 * 글이 화면보다 긴 장은 안에서 위아래로 스크롤되고, 그때만 화면 가운데 줄이 또렷한 초점 띠가 켜진다.
 * 쓰는 자리가 화면 아래에 닿으면 저절로 내리지 않고 거기서 기다리며, 눈금 위에 짧은 선이 흘러내린다. 읽는 사람이 내리면 이어 쓴다.
 * 휠은 조금 굴리면 넘김이 걸리고, 걸린 뒤로는 손을 멈출 때까지 더 굴러도 한 장만 휙 넘긴다.
 * 움직임은 기기의 '동작 줄이기' 설정을 따른다. 켜져 있으면 글을 처음부터 다 보여 주고 넘김도 바로 바꾼다.
 * 미리 보기로 열렸을 때 시작 자리({page, needle, next, done, ending})가 있으면 그 장의 그 글귀 조금 앞부터 쓴다.
 *   next가 있으면 그 장을 다 쓴 뒤 다음 장으로 저절로 넘겨 넘김을 보여 준다. ending이면 끝 장에 바로 놓는다.
 * 편집실 안(iframe)에 있으면 장에 멈출 때마다 몇째 장인지 알리고(geulgyeol:page, 끝 장이면 ending: true),
 *   편집실이 부르면 그 장으로 가거나(geulgyeol:goto, 쪽 수와 같은 번호는 끝 장) 지금 장을 다시 쓰거나(geulgyeol:again) 다 쓴다(geulgyeol:finish).
 * 길게 누르면 그 줄에 머물러 나머지가 가라앉고 바탕도 느려진다. 다 쓴 어절에 손을 대면 잠깐 다시 젖는다.
 */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  const G = window.GeulFx;
  const M = window.GeulMotion;
  const F = window.GeulFlip;
  const B = window.GeulBackdrop;
  if (!E || !G || !M || !F || !B) return;

  const stage = document.getElementById('stage');
  const srBox = document.getElementById('glog-sr');
  const dotsBox = document.getElementById('dots');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const OPTS = window.GeulReaderOpts || {};
  const turnOr = (t, d) => (Object.values(E.TURNS).includes(t) && t !== 'drift' ? t : d);
  const TURN = turnOr(OPTS.turn, 'sweep');
  /* 라이트로 돌아올 때의 넘김(심상 시간·종이처럼 방향마다 다를 때). 없으면 TURN */
  const TURN_LIGHT = turnOr(OPTS.turnLight, TURN);
  const PARA_GAP = 650;       // 한 장 안에서 문단과 문단 사이(ms)
  const WHEEL_KICK = 40;      // 휠을 이만큼(px) 굴리면 넘김이 걸린다
  const WHEEL_REST = 260;     // 휠이 이만큼 멈추면 다음 넘김을 받는다
  const HOLD_LINE = 0.86;     // 쓰는 자리가 화면 높이의 이 비율 아래로 내려가면 기다린다
  const AUTO_NEXT = 700;      // 다 쓰고 저절로 넘길 때 기다림
  const NEXT_ONLY = 420;      // 넘김만 볼 때 앞 쪽을 보여 주는 시간
  const LAND_WAIT = 320;      // 장에 도착한 뒤 쓰기 시작까지
  const HOLD_MS = 480;        // 이만큼 누르고 있으면 머무르기
  const FREE = 'a, button, input, textarea, select'; // 누르면 넘김·머무르기 대신 제 일을 하는 것

  const store = {
    get(area, k) { try { return window[area].getItem(k); } catch (e) { return null; } },
    del(area, k) { try { window[area].removeItem(k); } catch (e) { /* 저장할 수 없는 환경에서는 넘어간다 */ } }
  };

  /*
   * 본문은 #glog-text에서 읽는다. 편집실·가림판에서 미리 보기로 넘어왔으면 그 글을 대신 쓰고,
   * 제목(title)·처음 만든 날(made, YYYY-MM-DD)·끝 장 바탕(ending {scene, ground})도 함께 읽는다. 글만 있는 옛 자료도 읽힌다.
   */
  function readSource() {
    if (OPTS.source) return OPTS.source;
    const holder = document.getElementById('glog-text');
    const src = { text: holder ? holder.textContent : '', title: '', made: '', ending: null };
    const asked = location.hash === '#preview' || store.get('sessionStorage', 'geulgyeol.go') === '1';
    store.del('sessionStorage', 'geulgyeol.go');
    if (!asked) return src;
    const raw = store.get('sessionStorage', 'geulgyeol.preview') || store.get('localStorage', 'geulgyeol.preview');
    try {
      const d = raw ? JSON.parse(raw) : null;
      if (d && typeof d.text === 'string' && d.text.trim()) {
        src.text = d.text;
        if (typeof d.title === 'string') src.title = d.title;
        if (typeof d.made === 'string') src.made = d.made;
        if (d.ending && typeof d.ending === 'object') src.ending = d.ending;
      }
    } catch (e) { /* 읽을 수 없는 미리 보기 자료는 무시한다 */ }
    return src;
  }

  /* ---------- 페이지 자리 ---------- */

  /*
   * 페이지마다 글 기둥의 폭·가로 자리를 정한다. 글이 짧을수록 좁고 한쪽으로 치우치며,
   * 길수록 넓고 가운데에 가깝다. 바로 앞 장과 같은 자리는 피하고, 양 끝까지는 가지 않는다(0.2~0.8).
   * 쪽 표시에 자리(왼쪽·가운데·오른쪽)가 있으면 그대로, 없고 강조 블록이 있는 쪽은 가운데.
   * 짧은 글이 오른쪽에 놓이면 오른쪽 정렬이지만, 편지지 쪽은 종이 왼쪽부터 써 내려가도록 늘 왼쪽 정렬.
   */
  const PLACE_X = { left: 0.2, center: 0.5, right: 0.8 };
  const PAGE_ALIGN = { '왼쪽': 'left', '가운데': 'center', '오른쪽': 'right', '양쪽': 'justify' };
  function layoutFor(page, i, prev) {
    const n = page.count;
    const short = n < 70;
    const mid = n < 240;
    const measure = short ? 15 : mid ? 22 : 29;
    const marked = page.paragraphs.some((p) => p.lines.some((l) => l.tokens.some((t) => t.cells.some((c) => c.em))));
    const xs = short ? [0.22, 0.78, 0.5] : mid ? [0.28, 0.72, 0.5] : [0.5, 0.36, 0.64];
    let k = (i * 3 + Math.round(n / 37)) % xs.length;
    if (prev && Math.abs(xs[k] - prev.x) < 0.2) k = (k + 1) % xs.length;
    const x = page.place ? PLACE_X[page.place] : marked ? 0.5 : xs[k];
    const align = short && x > 0.7 && page.ground !== 'letter' ? 'right' : 'left';
    return { measure, x, align };
  }

  /* ---------- 장 만들기 ---------- */

  function buildPages(src) {
    const data = E.pages(E.parse(src.text));
    /* 무대에는 장만 지운다. 넘김 빛(flip.js가 붙인 바늘·고리 등)은 남겨 둔다 */
    stage.querySelectorAll('.sheet').forEach((s) => s.remove());
    srBox.textContent = '';
    let prevLayout = null;
    const list = data.map((pg, i) => {
      const sheet = document.createElement('section');
      sheet.className = 'sheet';
      sheet.dataset.scene = pg.scene;
      sheet.dataset.ground = pg.ground;
      sheet.dataset.i = String(i);
      sheet.setAttribute('aria-hidden', 'true');
      /* 쪽 표시의 글자 크기·글 상자 폭(그 쪽에만) */
      if (pg.size) sheet.style.setProperty('--page-k', String(pg.size));
      if (pg.measure) sheet.style.setProperty('--page-m', pg.measure + 'em');
      /* 쪽 표시의 속도는 마르는 시간도 같이 줄이고 늘인다 */
      if (pg.speed) {
        const dry = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dry'));
        if (dry > 0) sheet.style.setProperty('--dry', (dry / pg.speed).toFixed(2) + 's');
      }
      const scroll = document.createElement('div');
      scroll.className = 'scroll';
      const column = document.createElement('div');
      column.className = 'column';
      const lay = layoutFor(pg, i, prevLayout);
      prevLayout = lay;
      column.style.setProperty('--measure', lay.measure + 'em');
      column.style.setProperty('--x', String(lay.x));
      column.style.setProperty('--align', lay.align);
      /* 쪽 표시의 정렬: 저절로면 이 쪽의 자리 정렬, 아니면 그 정렬(글 전체 정렬보다 먼저) */
      if (pg.align) column.style.setProperty('--a-user', PAGE_ALIGN[pg.align] || 'var(--align)');

      const items = [];
      let at = 0;
      pg.paragraphs.forEach((para) => {
        const box = document.createElement('div');
        box.className = 'para';
        const inner = document.createElement('div');
        inner.className = 'inner';
        box.append(inner);
        column.append(box);
        const built = G.buildParagraph(para, inner);
        built.items.forEach((it) => { it.t += at; items.push(it); });
        at += para.lead + PARA_GAP / (pg.speed || 1);

        const sr = document.createElement('p');
        sr.textContent = para.lines.map((l) => l.tokens.map((t) => t.text).join(' ')).join('\n');
        srBox.append(sr);
      });

      G.deferExits(items);
      scroll.append(column);
      sheet.append(scroll);
      stage.append(sheet);
      if (window.GeulManuscript) window.GeulManuscript.attach(sheet);
      B.mount(sheet, pg.ground);

      const P = { el: sheet, scroll, column, items, lines: [], scene: pg.scene, turn: pg.turn, turnSpeed: pg.turnSpeed || 1, state: 'idle', tl: null, start: 0, fits: true, held: false };
      P.lines = [...column.querySelectorAll('.ln')];
      if (column.querySelector('.brk') && window.ResizeObserver) new ResizeObserver(() => breaks(sheet)).observe(column);
      scroll.addEventListener('scroll', () => { if (P === pages[S.cur]) band(); }, { passive: true });
      return P;
    });
    const end = list.length ? buildEnding(src, list.length) : null;
    if (end) list.push(end);
    return list;
  }

  /* 끝 장: ending.js가 그린다. 쓸 글이 없어 늘 다 쓴 장이다 */
  function buildEnding(src, n) {
    if (!window.GeulEnding) return null;
    const end = window.GeulEnding.build({ text: src.text, title: src.title, made: src.made, ending: src.ending, onReplay: replay });
    if (!end) return null;
    end.sheet.dataset.i = String(n);
    stage.append(end.sheet);
    B.mount(end.sheet, end.ground);
    return { el: end.sheet, scroll: end.scroll, column: null, items: [], lines: [], scene: end.scene, turn: null, state: 'done', tl: null, start: 0, fits: true, held: false, ending: true };
  }

  /* ---------- 상태 ---------- */

  const flip = F.create(stage, { content: '.scroll' });
  const S = { cur: 0, pos: 0, on: !reduce.matches, firstShown: false };
  let pages = [];
  let count = 0;   // 글이 있는 장 수(끝 장 번호와 같다)
  let tw = null;

  const spring = M.spring({
    value: 0,
    stiffness: 150,
    damping: 23,
    onUpdate: (x) => render(x),
    onRest: (x) => land(Math.round(x))
  });

  /*
   * 끊을 자리(.brk): 글줄이 한 줄에 들면 그대로, 넘쳐 접히면 그 줄의 끊을 자리마다 줄을 바꾼다(.on). 그래도 넘치면 어절 사이에서 접힌다.
   * 원고지 쪽은 칸에 맞춰 접으므로 쓰지 않는다. 글 기둥의 폭·글자 크기가 바뀔 때만 다시 잰다.
   */
  function breaks(sheet, force) {
    const column = sheet.querySelector('.column');
    if (!column || !column.querySelector('.brk')) return;
    const key = sheet.dataset.ground === 'wongoji' ? 'wg' : column.clientWidth + ':' + getComputedStyle(column).fontSize;
    if (!force && column.dataset.brk === key) return;
    column.dataset.brk = key;
    column.querySelectorAll('.ln').forEach((ln) => {
      const list = ln.querySelectorAll('.brk');
      if (!list.length) return;
      list.forEach((b) => b.classList.remove('on'));
      if (key === 'wg') return;
      const chs = ln.querySelectorAll('.ch');
      if (chs.length < 2) return;
      const a = chs[0].getBoundingClientRect();
      const z = chs[chs.length - 1].getBoundingClientRect();
      if (z.top - a.top > a.height * 0.5) list.forEach((b) => b.classList.add('on'));
    });
  }

  function measureFits() {
    pages.forEach((P) => {
      if (window.GeulManuscript) window.GeulManuscript.layout(P.el);
      breaks(P.el);
      /* 넘치는 장의 아래 여백(has-band)은 빼고 잰다 */
      P.el.classList.remove('has-band');
      P.fits = P.scroll.scrollHeight <= P.scroll.clientHeight + 4;
      P.el.classList.toggle('fits', P.fits);
      P.el.classList.toggle('has-band', !P.fits);
    });
  }

  /* ---------- 쓰기 ---------- */

  function finish(P) {
    clearTimeout(P.start);
    if (P.tl) P.tl.finish();
    else G.show(P.items);
    P.tl = null;
    P.state = 'done';
    progress(P, 1);
  }

  function reset(P) {
    clearTimeout(P.start);
    if (P.tl) P.tl.cancel();
    P.tl = null;
    P.state = 'idle';
    progress(P, 0);
    P.scroll.scrollTop = 0;
    if (S.on) G.hide(P.items);
    else G.show(P.items);
  }

  function firstWait() {
    if (S.firstShown) return LAND_WAIT;
    S.firstShown = true;
    return E.TIME.firstDelay;
  }

  /* 아래로 내려 이어 읽으라는 표시: 눈금 위에서 짧은 선이 흘러내린다 */
  const cue = document.createElement('div');
  cue.className = 'ui cue';
  cue.setAttribute('aria-hidden', 'true');
  document.body.append(cue);

  /* 쓰는 자리가 화면 아래에 닿았는지. 닿았으면 그 장은 읽는 사람이 내릴 때까지 기다린다. */
  function gateFor(P) {
    return (it) => {
      if (P.fits) return true;
      const r = it.el.getBoundingClientRect();
      const open = r.top < window.innerHeight * HOLD_LINE;
      P.held = !open;
      cue.classList.toggle('is-on', P.held && P === pages[S.cur]);
      return open;
    };
  }

  /* 쓰는 중이면 그 장을 다 쓰고 true(이번에는 넘기지 않음). 쓰는 중이 아니면 false */
  function finishFirst(P) {
    if (!writing(P)) return false;
    finish(P);
    P.held = false;
    cue.classList.remove('is-on');
    return true;
  }

  function play(P, wait, from) {
    if (P.state !== 'idle') return;
    if (P.ending || !S.on) { finish(P); return; }
    P.state = 'waiting';
    const total = P.items.filter((it) => !it.keep).length || 1;
    let shown = from ? P.items.filter((it) => !it.keep && it.t < from).length : 0;
    progress(P, shown / total);
    P.start = setTimeout(() => {
      P.state = 'playing';
      P.tl = G.timeline(P.items, {
        from: from || 0,
        gate: gateFor(P),
        onReveal(it) { if (!it.keep) progress(P, ++shown / total); },
        onDone() {
          P.tl = null;
          P.state = 'done';
          progress(P, 1);
          P.held = false;
          cue.classList.remove('is-on');
          if (P.after) { const f = P.after; P.after = null; setTimeout(f, AUTO_NEXT); }
        }
      });
    }, wait);
  }

  /* 장 안에서 needle(띄어쓰기 뺀 글귀)이 시작하는 글자. 없으면 null */
  function findNeedle(P, needle) {
    const n = String(needle || '').replace(/\s+/g, '');
    if (!n) return null;
    const chars = P.items.filter((it) => !it.keep);
    const idx = chars.map((it) => it.el.textContent).join('').indexOf(n);
    return idx >= 0 ? chars[idx] : null;
  }

  const writing = (P) => P && (P.state === 'playing' || P.state === 'waiting');

  /* ---------- 그리기 ---------- */

  function keepAround(k) {
    return pages.filter((P, j) => Math.abs(j - k) <= 1).map((P) => P.el);
  }

  /* pos를 그린다. light를 주면 넘김이 멈춰 있어도 바늘에 그만큼 불을 켠다 */
  function render(p, light, axis) {
    const N = pages.length;
    S.pos = clamp(p, 0, N - 1);
    const i = Math.min(N - 1, Math.floor(S.pos + 1e-6));
    const f = S.pos - i;
    const resting = i >= N - 1 || ((f < 0.0005 || f > 0.9995) && !light);
    if (resting || N < 2) {
      const k = Math.round(S.pos);
      if (flip.active) flip.finish(true);
      pages.forEach((P, j) => P.el.classList.toggle('is-current', j === k));
      B.setActive([pages[k].el], keepAround(k));
    } else {
      const a = pages[i];
      const b = pages[Math.min(N - 1, i + 1)];
      if (writing(a)) finish(a);
      if (writing(b) && b === pages[S.cur]) finish(b);
      const mode = modeOf(a, b);
      flip.begin(a.el, b.el, mode, 1, axis || S.axis || 'x');
      flip.render(f, light);
      B.setActive([a.el, b.el], keepAround(i).concat(keepAround(i + 1)));
    }
  }

  /* a 장에서 b 장으로 넘어갈 때의 넘김(되돌아갈 때도 같은 넘김을 거꾸로 돌린다) */
  function modeOf(a, b) {
    if (b.turn) return b.turn;
    return a.scene !== b.scene ? (b.scene === 'day' ? TURN_LIGHT : TURN) : 'drift';
  }

  /* 장 k에 멈췄다. from을 주면 그 시각부터 쓴다 */
  function land(k, from) {
    if (!pages.length) return;
    S.cur = clamp(k, 0, pages.length - 1);
    pages.forEach((P, j) => {
      if (j !== S.cur && writing(P)) finish(P);
      if (j !== S.cur) P.el.classList.remove('lingering');
    });
    cue.classList.toggle('is-on', !!pages[S.cur].held);
    play(pages[S.cur], firstWait(), from);
    tellPage();
    band();
    syncPager();
  }

  /* 글이 넘치는 장에서만 화면 가운데 줄을 또렷하게 */
  function band() {
    pages.forEach((P, j) => G.focusBand(P.lines, j === S.cur && !P.fits && S.on));
  }

  /* ---------- 넘기기 ---------- */

  function stopAll() {
    spring.stop();
    if (tw) { tw.cancel(); tw = null; }
  }

  /*
   * 넘김의 시간과 곡선. flip.js가 정한 값을 쓰고, 없으면 반전은 빛 170 · 휙 640 · 빛 빠짐 260, 스밈은 760.
   * 시간은 전환 속도(GeulReaderOpts.turnPace, 클수록 빠름)와 넘어갈 쪽의 쪽 표시 전환 속도(k)로 나눈다. 편집실이 바꾸면 다음 넘김부터 따른다.
   */
  function timingOf(mode, own) {
    const t = typeof F.timing === 'function' ? F.timing(mode) : null;
    const base = t && t.run > 0
      ? { lead: t.lead || 0, run: t.run, tail: t.tail || 0, ease: t.ease || M.ease.inOut }
      : mode === 'drift'
        ? { lead: 0, run: 760, tail: 0, ease: M.ease.inOut }
        : { lead: 170, run: 640, tail: 260, ease: M.ease.swing };
    const k = (Number(OPTS.turnPace) > 0 ? Number(OPTS.turnPace) : 1) * (own > 0 ? own : 1);
    return { lead: base.lead / k, run: base.run / k, tail: base.tail / k, ease: base.ease };
  }

  /*
   * 키·눈금으로 한 장 넘기기: 바닥 빛이 있는 넘김은 빛이 먼저 들어온 뒤(lead) 휙 넘어가고(run) 빛이 빠진다(tail).
   * 빛을 켜 두는 동안에도 넘기는 두 장 사이에 머물도록, 앞으로 갈 때는 도착 바로 앞(to - 1e-4)에서, 되돌아갈 때는 출발 바로 앞에서 그린다.
   */
  function goTo(target, axis) {
    const N = pages.length;
    const to = clamp(target, 0, N - 1);
    if (to === S.cur && Math.abs(S.pos - to) < 0.001) return;
    stopAll();
    S.axis = axis || 'x';
    if (Math.abs(to - S.cur) > 1) { jump(to); return; }
    if (!S.on) { spring.set(to); land(to); return; }
    const from = S.pos;
    const lo = Math.floor(Math.min(from, to));
    const into = pages[Math.min(N - 1, lo + 1)];
    const t = timingOf(modeOf(pages[lo], into), into.turnSpeed);
    const lit = t.lead > 0 || t.tail > 0 ? 1 : undefined;
    const fwd = to > from;
    const a = fwd ? from : Math.max(to, from - 1e-4);
    const b = fwd ? Math.max(from, to - 1e-4) : to;
    const arrive = () => { tw = null; spring.set(to); land(to); };
    const fade = () => {
      if (!t.tail) { arrive(); return; }
      tw = M.tween(1, 0, t.tail, M.ease.out, (l) => render(b, l), arrive);
    };
    const run = () => { tw = M.tween(a, b, t.run, t.ease, (x) => render(x, lit), fade); };
    if (t.lead) tw = M.tween(0, 1, t.lead, M.ease.out, (l) => render(a, l), run);
    else run();
  }

  /* 무대를 잠깐 어둡게 했다가 그사이에 then을 하고 다시 밝힌다 */
  function dimSwap(then) {
    const a = stage.animate && S.on ? stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' }) : null;
    setTimeout(() => {
      then();
      if (!a) return;
      a.cancel();
      stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' });
    }, a ? 220 : 0);
  }

  /* 두 장 이상 건너뛸 때는 무대를 잠깐 어둡게 했다가 바로 옮긴다 */
  function jump(to) {
    dimSwap(() => { spring.set(to); land(to); });
  }

  function next() {
    if (finishFirst(pages[S.cur])) return;
    goTo(S.cur + 1);
  }

  function prev() { goTo(S.cur - 1); }

  /* ---------- 끌기 · 머무르기 ---------- */

  let drag = null;

  function lineAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.closest ? el.closest('.ln') : null;
  }

  function linger(on, x, y) {
    const P = pages[S.cur];
    if (on) {
      const ln = lineAt(x, y) || P.lines.reduce((best, l) => {
        const r = l.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - y);
        return !best || d < best.d ? { l, d } : best;
      }, null)?.l;
      if (!ln) return;
      P.el.querySelectorAll('.ln.is-held').forEach((l) => l.classList.remove('is-held'));
      ln.classList.add('is-held');
      P.el.classList.add('lingering');
      B.setSpeed(0.2);
    } else {
      P.el.classList.remove('lingering');
      P.el.querySelectorAll('.ln.is-held').forEach((l) => l.classList.remove('is-held'));
      B.setSpeed(1);
    }
  }

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target.closest && e.target.closest(FREE))) return;
    stopAll();
    drag = {
      id: e.pointerId, x: e.clientX, y: e.clientY, from: S.pos, axis: null, moved: false,
      samples: [[performance.now(), S.pos]], held: false
    };
    drag.holdTimer = setTimeout(() => {
      if (drag && !drag.moved) { drag.held = true; linger(true, drag.x, drag.y); }
    }, HOLD_MS);
  });

  stage.addEventListener('pointermove', (e) => {
    B.pointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (drag.held) {
      const ln = lineAt(e.clientX, e.clientY);
      if (ln && !ln.classList.contains('is-held')) linger(true, e.clientX, e.clientY);
      return;
    }
    if (!drag.axis) {
      if (Math.hypot(dx, dy) < 8) return;
      clearTimeout(drag.holdTimer);
      drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      const P = pages[S.cur];
      if (drag.axis === 'y' && !P.fits) { drag = null; return; }
      drag.moved = true;
      S.axis = drag.axis;
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* 이미 놓친 포인터 */ }
      stage.classList.add('is-dragging');
    }
    const w = drag.axis === 'x' ? window.innerWidth : window.innerHeight;
    const d = (drag.axis === 'x' ? -dx : -dy) / (w * 0.62);
    const lo = Math.max(0, Math.round(drag.from) - 1);
    const hi = Math.min(pages.length - 1, Math.round(drag.from) + 1);
    const p = clamp(drag.from + d, lo, hi);
    if (p > drag.from && writing(pages[S.cur])) finish(pages[S.cur]);
    render(p, 1, drag.axis);
    drag.samples.push([performance.now(), p]);
    if (drag.samples.length > 8) drag.samples.shift();
  });

  function release(e) {
    if (!drag || e.pointerId !== drag.id) return;
    clearTimeout(drag.holdTimer);
    const d = drag;
    drag = null;
    stage.classList.remove('is-dragging');
    if (d.held) { linger(false); return; }
    if (!d.moved) return;
    const now = performance.now();
    const old = d.samples.find(([t]) => now - t < 100) || d.samples[0];
    const v = (S.pos - old[1]) / (Math.max(16, now - old[0]) / 1000);
    const base = Math.round(d.from);
    let target = base;
    if (v > 1.1) target = Math.min(base + 1, pages.length - 1);
    else if (v < -1.1) target = Math.max(base - 1, 0);
    else target = Math.round(S.pos);
    if (!S.on) { spring.set(target); land(target); return; }
    spring.set(S.pos, v);
    spring.to(target, v);
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('contextmenu', (e) => { if (drag && drag.held) e.preventDefault(); });

  /* ---------- 휠 ---------- */

  /*
   * 휠: 장 안에 내릴 글이 남았으면 그대로 스크롤한다. 끝에 닿은 뒤 WHEEL_KICK만큼 더 굴리면 넘김이 걸려
   * 키로 넘길 때처럼 끝까지 휙 넘어간다. 걸린 뒤 WHEEL_REST 동안 휠이 멈추지 않으면 그 몸짓은 다 한 번으로 친다.
   */
  let wheel = null;
  stage.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return;
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1;
    const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    const d = (horiz ? e.deltaX : e.deltaY) * unit;
    const P = pages[S.cur];
    if (!horiz && !(wheel && wheel.locked)) {
      const sc = P.scroll;
      const canDown = sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2;
      const canUp = sc.scrollTop > 2;
      if ((d > 0 && canDown) || (d < 0 && canUp)) return;
    }
    e.preventDefault();
    if (!wheel) wheel = { acc: 0, locked: false };
    clearTimeout(wheel.timer);
    wheel.timer = setTimeout(() => { wheel = null; }, WHEEL_REST);
    if (wheel.locked || !d) return;
    if (d > 0 && finishFirst(P)) { wheel.locked = true; return; }
    if (wheel.acc && Math.sign(wheel.acc) !== Math.sign(d)) wheel.acc = 0;
    wheel.acc += d;
    if (Math.abs(wheel.acc) < WHEEL_KICK) return;
    wheel.locked = true;
    const to = clamp(S.cur + Math.sign(wheel.acc), 0, pages.length - 1);
    if (to !== S.cur) goTo(to, horiz ? 'x' : 'y');
  }, { passive: false });

  /* ---------- 키 ---------- */

  function scrollPage(dir) {
    const sc = pages[S.cur].scroll;
    const room = dir > 0 ? sc.scrollHeight - sc.clientHeight - sc.scrollTop : sc.scrollTop;
    if (room <= 2) return false;
    sc.scrollBy({ top: dir * sc.clientHeight * 0.75, behavior: S.on ? 'smooth' : 'auto' });
    return true;
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if ((e.key === ' ' || e.key === 'Enter') && e.target.closest && e.target.closest('button, a')) return;
    const P = pages[S.cur];
    if (!P) return;
    if (['ArrowDown', 'PageDown', ' '].includes(e.key)) {
      e.preventDefault();
      if (writing(P) && P.held && scrollPage(1)) return;
      if (finishFirst(P)) return;
      if (!scrollPage(1)) next();
    } else if (['ArrowRight', 'Enter'].includes(e.key)) {
      e.preventDefault();
      next();
    } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      if (!scrollPage(-1)) prev();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    }
  });

  /* ---------- 아래 눈금 ---------- */

  /* 지금 장의 눈금은 써 나간 만큼(--p) 먹이 아래에서 차오르고, 다 차면 누를 때 그 장을 다시 쓴다 */
  function progress(P, n) {
    const dot = dotsBox.children[pages.indexOf(P)];
    if (!dot || P.ending) return;
    dot.style.setProperty('--p', String(Math.min(1, n)));
    dot.classList.toggle('is-full', n >= 1);
    syncLabel(dot, pages.indexOf(P));
  }

  function syncLabel(b, i) {
    if (pages[i].ending) return;
    const again = i === S.cur && b.classList.contains('is-full');
    b.setAttribute('aria-label', again ? `${i + 1}쪽 다시 보기` : `${i + 1}쪽`);
  }

  function drawDots() {
    dotsBox.textContent = '';
    pages.forEach((P, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = P.ending ? 'dot fin' : 'dot';
      b.setAttribute('aria-label', P.ending ? '끝' : `${i + 1}쪽`);
      b.addEventListener('click', () => {
        if (i === S.cur && !P.ending && P.state === 'done' && Math.abs(S.pos - i) < 0.001) again();
        else goTo(i);
      });
      dotsBox.append(b);
    });
  }

  /*
   * 눈금 가까이: 마우스는 눈금 줄에 다가갈수록 줄이 커진다(--near 0~1). 손가락은 눈금 자리를 처음 누르면 줄이 커져
   * 잠깐 머물고(그 누름은 넘기지 않음), 커진 동안 누른 눈금이 넘기거나 다시 쓴다. 다른 곳을 누르거나 손을 떼고 조금 지나면 접힌다.
   */
  const NEAR_REACH = 110;
  const NEAR_HOLD = 2800;
  let nearTimer = 0;
  let swallow = false;
  function setNear(v) { dotsBox.style.setProperty('--near', v.toFixed(3)); }
  function touchOpen(on) {
    clearTimeout(nearTimer);
    dotsBox.classList.toggle('is-open', on);
    setNear(on ? 1 : 0);
    if (on) nearTimer = setTimeout(() => touchOpen(false), NEAR_HOLD);
  }
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    /* 커진 크기가 아니라 눈금 줄이 놓인 자리(바닥 막대)를 기준으로 잰다 */
    const r = dotsBox.parentElement.getBoundingClientRect();
    const box = dotsBox.getBoundingClientRect();
    const k = 1 + (parseFloat(dotsBox.style.getPropertyValue('--near')) || 0) * 0.7;
    const w = box.width / k / 2;
    const cx = (box.left + box.right) / 2;
    const dx = Math.max(0, Math.abs(e.clientX - cx) - w);
    const dy = Math.max(0, r.top - e.clientY, e.clientY - r.bottom);
    setNear(clamp(1 - Math.hypot(dx, dy) / NEAR_REACH, 0, 1));
  }, { passive: true });
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) setNear(0); });
  dotsBox.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    if (!dotsBox.classList.contains('is-open')) swallow = true;
    touchOpen(true);
  });
  dotsBox.addEventListener('click', (e) => {
    if (!swallow) return;
    swallow = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' && !dotsBox.contains(e.target) && dotsBox.classList.contains('is-open')) touchOpen(false);
  });

  /* 지금 장 표시, 눈금과 기다림 표시는 지금 장의 장면 먹색으로 */
  const uiParts = [dotsBox.closest('.ui'), cue].filter(Boolean);
  function syncPager() {
    [...dotsBox.children].forEach((b, i) => { b.setAttribute('aria-current', String(i === S.cur)); syncLabel(b, i); });
    const P = pages[S.cur];
    if (P) uiParts.forEach((n) => { n.dataset.scene = P.scene; });
  }

  /* ---------- 다시 쓰기 ---------- */

  /* 처음부터: 모든 장을 되돌리고 첫 장부터 다시 쓴다(끝 장의 '다시 보기') */
  function replay() {
    stopAll();
    dimSwap(() => {
      pages.forEach(reset);
      S.firstShown = false;
      spring.set(0);
      land(0);
    });
  }

  /* 이 쪽 다시: 지금 장만 처음부터 다시 쓴다(편집실의 geulgyeol:again) */
  function again() {
    const P = pages[S.cur];
    reset(P);
    play(P, LAND_WAIT);
  }

  /* 기기의 '동작 줄이기'를 바꾸면 바로 따른다 */
  reduce.addEventListener('change', () => {
    S.on = !reduce.matches;
    if (!S.on) pages.forEach(finish);
    band();
  });

  /* ---------- 편집실과 주고받기 ---------- */

  const embedded = window.parent !== window;
  function tellPage() {
    if (embedded) window.parent.postMessage({ type: 'geulgyeol:page', page: S.cur, pages: count, ending: !!pages[S.cur].ending }, location.origin);
  }
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || !pages.length) return;
    if (e.data.type === 'geulgyeol:goto') {
      const k = clamp(Number(e.data.page) || 0, 0, pages.length - 1);
      if (k !== S.cur) goTo(k);
    } else if (e.data.type === 'geulgyeol:again') again();
    else if (e.data.type === 'geulgyeol:finish') { const P = pages[S.cur]; if (writing(P) || P.state === 'idle') finish(P); }
  });

  G.touchable(stage);

  window.addEventListener('resize', () => {
    measureFits();
    render(S.pos);
    band();
  });

  /* ---------- 시작 ---------- */

  pages = buildPages(readSource());
  if (!pages.length) return;
  count = pages.filter((P) => !P.ending).length;
  drawDots();
  syncPager();
  pages.forEach((P) => { if (S.on) G.hide(P.items); });

  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]).then(start, start);

  /* 시작 자리: 주소의 start(편집실이 틀마다 넣음)가 먼저, 없으면 sessionStorage에 남긴 것 */
  function readStart() {
    if (location.hash !== '#preview') return null;
    const q = new URLSearchParams(location.search).get('start');
    const raw = q || store.get('sessionStorage', 'geulgyeol.start');
    if (!q) store.del('sessionStorage', 'geulgyeol.start');
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  function start() {
    measureFits();
    const at = readStart();
    const last = pages.length - 1;
    const k = !at ? 0 : at.ending ? last : clamp(Number(at.page) || 0, 0, last);
    let from = 0;
    if (at && at.needle) {
      const it = findNeedle(pages[k], at.needle);
      if (it) {
        from = Math.max(0, it.t - 700);
        if (!pages[k].fits) {
          const r = it.el.getBoundingClientRect();
          pages[k].scroll.scrollTop += r.top - window.innerHeight * 0.4;
        }
      }
    }
    if (k || from) S.firstShown = true;
    const done = !!(at && at.done);
    if (at && at.next && k < last && !done) pages[k].after = () => goTo(k + 1);
    spring.set(k);
    render(k);
    land(k, from);
    /* done: 그 쪽을 다 쓴 모습으로 바로 놓는다(설정을 바꿨을 때). next와 함께면 곧바로 다음 쪽으로 넘겨 넘김만 보인다 */
    if (done) {
      finish(pages[k]);
      if (at.next && k < last) setTimeout(() => goTo(k + 1), NEXT_ONLY);
    }
  }
})();
