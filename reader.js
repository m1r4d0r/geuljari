/*
 * 글결 읽기 틀
 * 글을 페이지(빈 줄 둘로 나뉜 덩어리)마다 화면 한 장으로 세우고, 진행값 pos 하나로 장 사이를 오간다.
 *   pos = 2.4 → 3번째 장에서 4번째 장으로 40% 넘어간 상태
 * pos는 끌기·휠이 직접 밀고, 손을 떼면 스프링이 가까운 장으로 마저 데려간다. 단추·키는 정해진 곡선으로 휙 넘긴다.
 * 두 장의 장면(낮·밤)이 다르면 바닥 가운데를 축으로 쓸어 넘기고(같이 넘김: 글도 장과 함께 쓸림), 같으면 스며들듯 겹쳐 넘긴다.
 * 장에 도착하면 그 장의 글을 엔진 시간표대로 써 내려간다. 쓰는 중에 넘기려 하면 먼저 그 장을 다 쓴다.
 * 글이 화면보다 긴 장은 안에서 위아래로 스크롤되고, 그때만 화면 가운데 줄이 또렷한 초점 띠가 켜진다.
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

  const root = document.documentElement;
  const stage = document.getElementById('stage');
  const srBox = document.getElementById('glog-sr');
  const dotsBox = document.getElementById('dots');
  const hint = document.getElementById('hint');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  const motionBtn = document.getElementById('motion');
  const replayBtn = document.getElementById('replay');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const PARA_GAP = 650;       // 한 장 안에서 문단과 문단 사이(ms)
  const LAND_WAIT = 320;      // 장에 도착한 뒤 쓰기 시작까지
  const HOLD_MS = 480;        // 이만큼 누르고 있으면 머무르기

  const store = {
    get(area, k) { try { return window[area].getItem(k); } catch (e) { return null; } },
    set(area, k, v) { try { window[area].setItem(k, v); } catch (e) { /* 저장할 수 없는 환경에서는 넘어간다 */ } },
    del(area, k) { try { window[area].removeItem(k); } catch (e) { /* 저장할 수 없는 환경에서는 넘어간다 */ } }
  };

  /* 본문은 #glog-text에서 읽는다. 가림판에서 미리 보기로 넘어왔으면 그 글을 대신 쓴다. */
  function readSource() {
    const holder = document.getElementById('glog-text');
    let text = holder ? holder.textContent : '';
    const asked = location.hash === '#preview' || store.get('sessionStorage', 'geulgyeol.go') === '1';
    store.del('sessionStorage', 'geulgyeol.go');
    if (asked) {
      const raw = store.get('sessionStorage', 'geulgyeol.preview') || store.get('localStorage', 'geulgyeol.preview');
      try {
        const d = raw ? JSON.parse(raw) : null;
        if (d && typeof d.text === 'string' && d.text.trim()) text = d.text;
      } catch (e) { /* 읽을 수 없는 미리 보기 자료는 무시한다 */ }
    }
    return text;
  }

  /* ---------- 페이지 자리 ---------- */

  /*
   * 페이지마다 글 기둥의 폭·가로 자리·세로 자리를 정한다. 글이 짧을수록 좁고 한쪽으로 치우치며,
   * 길수록 넓고 가운데에 가깝다. 바로 앞 장과 같은 자리는 피한다.
   */
  function layoutFor(page, i, prev) {
    const n = page.count;
    const short = n < 70;
    const mid = n < 240;
    const measure = short ? 15 : mid ? 22 : 29;
    const xs = short ? [0.12, 0.88, 0.5, 1, 0] : mid ? [0, 1, 0.5, 0.25, 0.75] : [0.5, 0.15, 0.85];
    let k = (i * 3 + Math.round(n / 37)) % xs.length;
    if (prev && Math.abs(xs[k] - prev.x) < 0.2) k = (k + 1) % xs.length;
    const x = xs[k];
    const ys = short ? [0.42, 0.62, 0.3, 0.5] : mid ? [0.38, 0.45, 0.32] : [0.28, 0.34];
    const y = ys[(i * 5 + n) % ys.length];
    const align = short && x > 0.7 ? 'right' : 'left';
    return { measure, x, y, align };
  }

  /* ---------- 장 만들기 ---------- */

  function buildPages(text) {
    const data = E.pages(E.parse(text));
    stage.textContent = '';
    srBox.textContent = '';
    let prevLayout = null;
    return data.map((pg, i) => {
      const sheet = document.createElement('section');
      sheet.className = 'sheet';
      sheet.dataset.scene = pg.scene;
      sheet.dataset.ground = pg.ground;
      sheet.dataset.i = String(i);
      const scroll = document.createElement('div');
      scroll.className = 'scroll';
      const column = document.createElement('div');
      column.className = 'column';
      const lay = layoutFor(pg, i, prevLayout);
      prevLayout = lay;
      column.style.setProperty('--measure', lay.measure + 'em');
      column.style.setProperty('--x', String(lay.x));
      column.style.setProperty('--align', lay.align);
      scroll.style.setProperty('--y', String(lay.y));

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
        at += para.lead + PARA_GAP;

        const sr = document.createElement('p');
        sr.textContent = para.lines.map((l) => l.tokens.map((t) => t.text).join(' ')).join('\n');
        srBox.append(sr);
      });

      scroll.append(column);
      sheet.append(scroll);
      stage.append(sheet);
      B.mount(sheet, pg.ground);

      const P = { el: sheet, scroll, column, items, lines: [], scene: pg.scene, state: 'idle', tl: null, start: 0, fits: true, userScrollAt: 0, autoScrolling: false };
      P.lines = [...column.querySelectorAll('.ln')];
      scroll.addEventListener('scroll', () => {
        if (!P.autoScrolling) P.userScrollAt = performance.now();
        if (P === pages[S.cur]) band();
      }, { passive: true });
      return P;
    });
  }

  /* ---------- 상태 ---------- */

  const flip = F.create(stage, { content: '.scroll' });
  const S = { cur: 0, pos: 0, on: true, firstShown: false, turned: false };
  let pages = [];
  let tw = null;

  const spring = M.spring({
    value: 0,
    stiffness: 150,
    damping: 23,
    onUpdate: (x) => render(x),
    onRest: (x) => land(Math.round(x))
  });

  function measureFits() {
    pages.forEach((P) => {
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
  }

  function reset(P) {
    clearTimeout(P.start);
    if (P.tl) P.tl.cancel();
    P.tl = null;
    P.state = 'idle';
    P.scroll.scrollTop = 0;
    if (S.on) G.hide(P.items);
    else G.show(P.items);
  }

  function firstWait() {
    if (S.firstShown) return LAND_WAIT;
    S.firstShown = true;
    return E.TIME.firstDelay;
  }

  /* 쓰는 자리가 화면 아래로 내려가면, 읽는 사람이 막 스크롤하지 않은 때에만 글 층을 살짝 올려 준다 */
  function follow(P, it) {
    if (P.fits) return;
    const now = performance.now();
    if (now - P.userScrollAt < 2500 || now - (P.followAt || 0) < 500) return;
    const r = it.el.getBoundingClientRect();
    const h = window.innerHeight;
    if (r.bottom < h * 0.78) return;
    P.followAt = now;
    P.autoScrolling = true;
    P.scroll.scrollBy({ top: r.bottom - h * 0.5, behavior: 'smooth' });
    setTimeout(() => { P.autoScrolling = false; }, 700);
  }

  function play(P, wait) {
    if (P.state !== 'idle') return;
    if (!S.on) { finish(P); return; }
    P.state = 'waiting';
    P.start = setTimeout(() => {
      P.state = 'playing';
      P.tl = G.timeline(P.items, {
        onReveal: (it) => { if (!it.keep) follow(P, it); },
        onDone() { P.tl = null; P.state = 'done'; }
      });
    }, wait);
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
    const resting = (f < 0.0005 || f > 0.9995 || i >= N - 1) && !light;
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
      const mode = a.scene !== b.scene ? 'sweep' : 'drift';
      flip.begin(a.el, b.el, mode, 1, axis || S.axis || 'x');
      flip.render(f, light);
      B.setActive([a.el, b.el], keepAround(i).concat(keepAround(i + 1)));
    }
  }

  /* 장 k에 멈췄다 */
  function land(k) {
    if (!pages.length) return;
    S.cur = clamp(k, 0, pages.length - 1);
    pages.forEach((P, j) => {
      if (j !== S.cur && writing(P)) finish(P);
      if (j !== S.cur) P.el.classList.remove('lingering');
    });
    const P = pages[S.cur];
    play(P, firstWait());
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

  function noteTurn() {
    if (S.turned) return;
    S.turned = true;
    if (hint) hint.classList.add('is-gone');
  }

  /* 단추·키: 장면이 바뀌는 넘김이면 바닥선에 불이 먼저 들어온 뒤 휙, 아니면 스며들 듯 넘긴다 */
  function goTo(target) {
    const N = pages.length;
    const to = clamp(target, 0, N - 1);
    if (to === S.cur && Math.abs(S.pos - to) < 0.001) return;
    stopAll();
    noteTurn();
    S.axis = 'x';
    if (Math.abs(to - S.cur) > 1) { jump(to); return; }
    if (!S.on || reduce.matches) { spring.set(to); land(to); return; }
    const from = S.pos;
    const lo = Math.min(from, to);
    const sweep = pages[Math.floor(lo)].scene !== pages[Math.min(N - 1, Math.floor(lo) + 1)].scene;
    if (!sweep) {
      tw = M.tween(from, to, 760, M.ease.inOut, (x) => render(x), () => { tw = null; spring.set(to); land(to); });
      return;
    }
    tw = M.tween(0, 1, 170, M.ease.out, (l) => render(from, l), () => {
      tw = M.tween(from, to, 640, M.ease.swing, (x) => render(x, 1), () => {
        tw = M.tween(1, 0, 260, M.ease.out, (l) => render(to, l), () => {
          tw = null;
          spring.set(to);
          land(to);
        });
      });
    });
  }

  /* 두 장 이상 건너뛸 때는 무대를 잠깐 어둡게 했다가 바로 옮긴다 */
  function jump(to) {
    const a = stage.animate ? stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' }) : null;
    setTimeout(() => {
      spring.set(to);
      land(to);
      if (a) a.cancel();
      if (stage.animate) stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' });
    }, a ? 220 : 0);
  }

  function next() {
    const P = pages[S.cur];
    if (writing(P)) { finish(P); return; }
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
    if (e.button !== 0) return;
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
    noteTurn();
    const now = performance.now();
    const old = d.samples.find(([t]) => now - t < 100) || d.samples[0];
    const v = (S.pos - old[1]) / (Math.max(16, now - old[0]) / 1000);
    const base = Math.round(d.from);
    let target = base;
    if (v > 1.1) target = Math.min(base + 1, pages.length - 1);
    else if (v < -1.1) target = Math.max(base - 1, 0);
    else target = Math.round(S.pos);
    if (!S.on || reduce.matches) { spring.set(target); land(target); return; }
    spring.set(S.pos, v);
    spring.to(target, v);
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('contextmenu', (e) => { if (drag && drag.held) e.preventDefault(); });

  /* ---------- 휠 ---------- */

  let wheel = null;
  stage.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return;
    const unit = e.deltaMode === 1 ? 33 : 1;
    const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    const d = (horiz ? e.deltaX : e.deltaY) * unit;
    const P = pages[S.cur];
    if (!horiz && !wheel) {
      const sc = P.scroll;
      const canDown = sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2;
      const canUp = sc.scrollTop > 2;
      if ((d > 0 && canDown) || (d < 0 && canUp)) return;
    }
    e.preventDefault();
    stopAll();
    if (!wheel) {
      wheel = { from: S.cur, used: false };
      if (d > 0 && writing(P)) { finish(P); wheel.used = true; }
    }
    clearTimeout(wheel.timer);
    if (!wheel.used) {
      S.axis = horiz ? 'x' : 'y';
      const lo = Math.max(0, wheel.from - 1);
      const hi = Math.min(pages.length - 1, wheel.from + 1);
      render(clamp(S.pos + d / 900, lo, hi), 1, S.axis);
    }
    wheel.timer = setTimeout(() => {
      const w = wheel;
      wheel = null;
      if (w.used) return;
      const off = S.pos - w.from;
      const target = off > 0.28 ? w.from + 1 : off < -0.28 ? w.from - 1 : w.from;
      const t = clamp(target, 0, pages.length - 1);
      if (t !== w.from) noteTurn();
      if (!S.on || reduce.matches) { spring.set(t); land(t); return; }
      spring.set(S.pos);
      spring.to(t);
    }, 140);
  }, { passive: false });

  /* ---------- 키 ---------- */

  function scrollPage(dir) {
    const sc = pages[S.cur].scroll;
    const room = dir > 0 ? sc.scrollHeight - sc.clientHeight - sc.scrollTop : sc.scrollTop;
    if (room <= 2) return false;
    sc.scrollBy({ top: dir * sc.clientHeight * 0.75, behavior: reduce.matches ? 'auto' : 'smooth' });
    return true;
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if ((e.key === ' ' || e.key === 'Enter') && e.target.closest && e.target.closest('button, a')) return;
    const P = pages[S.cur];
    if (['ArrowDown', 'PageDown', ' '].includes(e.key)) {
      e.preventDefault();
      if (writing(P)) { finish(P); return; }
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

  /* ---------- 아래 막대 ---------- */

  function drawDots() {
    dotsBox.textContent = '';
    pages.forEach((P, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dot';
      b.setAttribute('aria-label', `${i + 1}쪽`);
      b.addEventListener('click', () => goTo(i));
      dotsBox.append(b);
    });
  }

  function syncPager() {
    [...dotsBox.children].forEach((b, i) => b.setAttribute('aria-current', String(i === S.cur)));
    prevBtn.disabled = S.cur === 0;
    nextBtn.disabled = S.cur === pages.length - 1 && !writing(pages[S.cur]);
  }

  /* ---------- 움직임 · 처음부터 ---------- */

  function setMotion(on, persist) {
    S.on = on;
    motionBtn.textContent = on ? '움직임 끄기' : '움직임 켜기';
    root.classList.toggle('no-motion', !on);
    if (persist) store.set('localStorage', 'geulgyeol.motion', on ? 'on' : 'off');
    if (!on) pages.forEach(finish);
    band();
  }

  function replay() {
    stopAll();
    pages.forEach(reset);
    S.firstShown = false;
    spring.set(0);
    land(0);
  }

  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  motionBtn.addEventListener('click', () => {
    if (S.on) setMotion(false, true);
    else { setMotion(true, true); replay(); }
  });
  replayBtn.addEventListener('click', () => {
    if (!S.on) setMotion(true, true);
    replay();
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
  drawDots();
  const saved = store.get('localStorage', 'geulgyeol.motion');
  S.on = saved ? saved === 'on' : !reduce.matches;
  motionBtn.textContent = S.on ? '움직임 끄기' : '움직임 켜기';
  pages.forEach((P) => { if (S.on) G.hide(P.items); });

  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]).then(start, start);

  function start() {
    measureFits();
    render(0);
    land(0);
  }
})();
