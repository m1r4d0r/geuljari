/*
 * 글결 편집실
 * 글 → 미리보기 두 단계를 잇는다.
 * - 글: 입력창 하나. 그 위에 쪽 짜임을 얹어(compose.js) 줄 사이를 눌러 쪽을 나누고, 쪽 사이에서 반전·잇기를 하고,
 *   끌어 고른 곳을 강조한다. 오른쪽에서 분위기(심상 세 축)를 고른다. 고르기 전에는 글을 읽어 짐작한 분위기를 둔다.
 * - 미리보기: 읽기 틀이 화면을 채운다. 보는 기기와 같은 틀이면 실제 크기 그대로, 다른 틀(폰에서 PC, PC에서 폰)이면 맞춰 줄인다.
 *   설정은 왼쪽 가장자리 책갈피(분위기·글씨·배경·강조)로 하나씩 연다(panels.js). 손가락 벌리기·Ctrl+휠로 확대하고,
 *   글 상자를 끌면 왼쪽·가운데·오른쪽에 붙는다(view.js가 미리보기 안의 손짓을 알려 준다).
 * 상태는 이 브라우저의 localStorage에만 두고, 미리보기 글과 조판값은 sessionStorage로 view.html에 넘긴다.
 * 반전·쪽 넘김·자리·강조·효과는 모두 본문 안 표시로 들어가 언제든 되돌아가 바꿀 수 있다.
 */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  const T = window.GeulTune;
  const S = window.GeulSense;
  const ED = window.GeulEditor;
  const P = window.GeulPanels;
  if (!E || !T || !S || !ED || !window.GeulCompose || !P) return;

  const $ = (id) => document.getElementById(id);
  const KEY = 'geul.studio';
  const STEPS = ['write', 'tune'];
  const DEVICES = { pc: [1280, 800], mobile: [390, 844] };
  const OPPOSITE = { '라이트': '다크', '다크': '라이트' };
  const LONG = 240;
  const ZOOM_MAX = 4;
  const phone = window.matchMedia('(max-width: 760px)');

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장할 수 없는 환경에서는 넘어간다 */ } }
  };

  const st = Object.assign({
    step: 'write',
    title: '',
    source: '',
    moods: [],
    moodsTouched: false,
    settings: T.defaults(),
    device: null,
    page: 0
  }, store.get(KEY) || {});
  st.settings = T.normalize(st.settings);
  st.moods = T.oneEach(st.moods);
  if (!STEPS.includes(st.step) || !st.source.trim()) st.step = 'write';
  if (st.device && !DEVICES[st.device]) st.device = null;

  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set(KEY, st), 250);
  }

  let toastTimer = 0;
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), ms || 2200);
  }

  function head() { return T.sceneLine(st.settings) + '\n'; }
  function allPages() { return E.pages(E.parse(head() + st.source)); }

  /* ---------- 글 ---------- */

  const ta = $('src');
  let compose = null;
  const writeEd = ED.attach(ta, $('write-mirror'), {
    onInput(v) { st.source = v; save(); countLine(); guessLater(); },
    nights: () => (compose ? compose.nights() : null),
    onDraw: () => { if (compose) compose.draw(); },
    onScroll: () => { if (compose) compose.scroll(); }
  });
  compose = window.GeulCompose.mount($('write-ed'), ta, $('write-mirror'), writeEd, {
    get: () => st.source,
    set(text, sel) { setSource(text, sel); },
    head,
    scene: () => st.settings.scene
  });

  /* 본문을 바꾼다. 글 화면이 보일 때만 입력창에 실행 취소가 남도록 갈아 끼운다. */
  function setSource(text, sel) {
    st.source = text;
    if (st.step === 'write') writeEd.set(text, sel);
    else ta.value = text;
    save();
    countLine();
  }

  $('title').value = st.title;
  $('title').addEventListener('input', (e) => { st.title = e.target.value; save(); });

  function countLine() {
    if (!st.source.trim()) { $('count').textContent = ''; return; }
    const pgs = allPages();
    const chars = pgs.reduce((n, p) => n + p.count, 0);
    const dark = pgs.filter((p) => p.scene === 'night').length;
    const marks = S.blocks(st.source).length;
    const long = pgs.map((p, k) => (p.count > LONG ? k + 1 : 0)).filter(Boolean);
    $('count').textContent = [`${pgs.length}쪽 · ${chars}자`, dark ? `다크 ${dark}쪽` : '', marks ? `강조 ${marks}` : '', long.length ? `긴 쪽 ${long.join('·')}` : '']
      .filter(Boolean).join(' · ');
  }

  /* 분위기를 직접 고르기 전에는 글을 읽어 짐작한 분위기를 둔다 */
  let guessTimer = 0;
  function guessLater() {
    if (st.moodsTouched) return;
    clearTimeout(guessTimer);
    guessTimer = setTimeout(() => {
      if (st.moodsTouched || !st.source.trim()) return;
      setMoods(S.guessMoods(st.source));
      drawRail();
    }, 800);
  }

  function setMoods(list) {
    st.moods = T.oneEach(list);
    st.settings = T.fromMoods(st.moods, st.settings);
    save();
  }

  function drawRail() {
    P.moodGrid($('moods'), st.moods, (list) => { st.moodsTouched = true; setMoods(list); drawRail(); });
    P.mix($('mix'), st.settings);
  }

  function sampleText() {
    return E.stripMarks(window.GeulgyeolSample ? window.GeulgyeolSample.text : '').replace(/\n{4,}/g, '\n\n\n');
  }
  $('sample').addEventListener('click', () => {
    if (st.source.trim() && !window.confirm('지금 글을 예시 글로 바꿀까요?')) return;
    st.moodsTouched = false;
    setStep('write');
    setSource(sampleText(), [0, 0]);
    ta.scrollTop = 0;
    guessLater();
  });
  $('clear').addEventListener('click', () => {
    if (st.source.trim() && !window.confirm('지금 글을 지우고 새로 쓸까요?')) return;
    st.title = '';
    $('title').value = '';
    st.moods = [];
    st.moodsTouched = false;
    st.settings = T.defaults();
    st.page = 0;
    setStep('write');
    setSource('', [0, 0]);
    drawRail();
    ta.focus();
  });
  $('go-tune').addEventListener('click', () => { st.page = 0; setStep('tune'); });

  /* ---------- 단계 ---------- */

  function setStep(step) {
    if (step !== 'write' && !st.source.trim()) { toast('글을 먼저 놓아 주세요.'); ta.focus(); return; }
    const from = st.step;
    st.step = step;
    document.body.dataset.step = step;
    STEPS.forEach((s) => { $('s-' + s).hidden = s !== step; });
    document.querySelectorAll('.steps [data-go]').forEach((b) => {
      if (b.dataset.go === step) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
      b.disabled = b.dataset.go !== 'write' && !st.source.trim();
    });
    if (from === 'tune' && step !== 'tune') leaveTune();
    if (step === 'write') { if (ta.value !== st.source) ta.value = st.source; writeEd.draw(); drawRail(); }
    if (step === 'tune') enterTune(from !== 'tune');
    countLine();
    save();
  }
  document.querySelectorAll('.steps [data-go]').forEach((b) => b.addEventListener('click', () => setStep(b.dataset.go)));
  $('home').addEventListener('click', () => setStep('write'));

  /* ---------- 미리보기 ---------- */

  const stage = $('stage');
  const box = $('frame-box');
  const pv = $('pv');
  let pvN = 0;

  function handOff(start) {
    const data = JSON.stringify({ text: head() + st.source });
    const tune = JSON.stringify(st.settings);
    try {
      sessionStorage.setItem('geulgyeol.preview', data);
      sessionStorage.setItem('geulgyeol.tune', tune);
      localStorage.setItem('geulgyeol.preview', data);
      localStorage.setItem('geulgyeol.tune', tune);
      if (start) sessionStorage.setItem('geulgyeol.start', JSON.stringify(start));
      else sessionStorage.removeItem('geulgyeol.start');
    } catch (e) { /* 저장할 수 없는 환경에서는 예시 글이 뜬다 */ }
  }

  /* 미리보기를 start({page, needle, next}) 자리부터 다시 쓴다 */
  function play(start) {
    if (st.step !== 'tune' || !st.source.trim()) return;
    const s = start || { page: st.page };
    st.page = Math.max(0, Math.min(s.page || 0, allPages().length - 1));
    handOff(s);
    pv.src = `view.html?v=${++pvN}#preview`;
    save();
  }
  pv.addEventListener('load', () => tellZoom());

  function post(msg) { if (pv.contentWindow) pv.contentWindow.postMessage(msg, location.origin); }

  /* ---------- 틀 크기와 확대 ---------- */

  const native = () => (phone.matches ? 'mobile' : 'pc');
  const device = () => st.device || native();
  const view = { w: 0, h: 0, base: 1, bx: 0, by: 0, room: 0, k: 1, tx: 0, ty: 0 };

  /*
   * 보는 기기와 같은 틀이면 무대 크기 그대로(실제 화면), 다른 틀이면 그 비율의 틀을 무대에 맞춰 줄인다.
   * 폰에서 아래 판이 열려 있으면 판 위 빈자리에 맞춘다.
   */
  function fit() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (W <= 0 || H <= 0) return;
    const sheet = phone.matches ? stage.querySelector('.panel:not([hidden])') : null;
    const room = sheet ? Math.max(120, sheet.offsetTop - 8) : H;
    const same = device() === native();
    const [w, h] = same ? [W, H] : DEVICES[device()];
    const pad = same ? 0 : 24;
    const base = Math.min((W - pad) / w, (room - pad) / h, 1);
    Object.assign(view, { w, h, base, room, bx: (W - w * base) / 2, by: (room - h * base) / 2 });
    box.style.width = w + 'px';
    box.style.height = h + 'px';
    box.classList.toggle('framed', !same);
    place();
    document.querySelectorAll('#device [data-device]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.device === device())));
  }

  function place() {
    const s = view.base * view.k;
    const W = stage.clientWidth;
    if (view.k === 1) { view.tx = view.bx; view.ty = view.by; } else {
      const sw = view.w * s;
      const sh = view.h * s;
      view.tx = sw > W ? Math.min(0, Math.max(W - sw, view.tx)) : (W - sw) / 2;
      view.ty = sh > view.room ? Math.min(0, Math.max(view.room - sh, view.ty)) : (view.room - sh) / 2;
    }
    box.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${s})`;
    $('zoom').hidden = view.k === 1;
    $('zoom-k').textContent = Math.round(view.k * 100) + '%';
  }

  /* 무대 좌표 (px, py)를 그 자리에 둔 채 f배 */
  function zoomAt(px, py, f) {
    const k = Math.min(ZOOM_MAX, Math.max(1, view.k * f));
    if (k === view.k) return;
    const r = k / view.k;
    const was = view.k;
    view.tx = px - (px - view.tx) * r;
    view.ty = py - (py - view.ty) * r;
    view.k = k < 1.02 ? 1 : k;
    place();
    if ((was === 1) !== (view.k === 1)) tellZoom();
  }
  function resetZoom() { view.k = 1; place(); tellZoom(); }
  function tellZoom() { post({ type: 'geulgyeol:zoomed', on: view.k > 1 }); }
  $('zoom-fit').addEventListener('click', resetZoom);

  /* 미리보기 안의 점(그 문서 좌표)을 무대 좌표로 */
  function fromFrame(x, y) {
    const s = view.base * view.k;
    return [view.tx + x * s, view.ty + y * s];
  }

  /* 휠 한 칸(100)에 1.5배쯤, 트랙패드 벌리기의 잔 값에는 잘게 */
  const wheelFactor = (dy) => Math.exp(-Math.max(-150, Math.min(150, dy)) / 250);

  stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, wheelFactor(e.deltaY));
  }, { passive: false });

  /* 두 손가락: 처음 잡은 내용의 점이 손가락 가운데를 따라오고, 배율은 손가락 사이 거리를 따른다 */
  let grip = null;
  function pinchTo(d) {
    if (d.phase === 'end') {
      grip = null;
      if (view.k < 1.05) resetZoom(); else tellZoom();
      return;
    }
    const [a, b] = d.pts.map(([x, y]) => fromFrame(x, y));
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const cx = (a[0] + b[0]) / 2;
    const cy = (a[1] + b[1]) / 2;
    const s = view.base * view.k;
    if (d.phase === 'start' || !grip) { grip = { dist, k: view.k, x: (cx - view.tx) / s, y: (cy - view.ty) / s }; return; }
    if (!grip.dist) return;
    view.k = Math.min(ZOOM_MAX, Math.max(1, grip.k * dist / grip.dist));
    const s2 = view.base * view.k;
    view.tx = cx - grip.x * s2;
    view.ty = cy - grip.y * s2;
    if (view.k > 1 && view.k < 1.0001) view.k = 1;
    place();
  }

  /* 확대된 동안 한 손가락·마우스로 끌면 틀을 옮긴다 */
  let drag = null;
  function panTo(d) {
    const p = fromFrame(d.x, d.y);
    if (d.phase === 'start' || !drag) { drag = p; return; }
    view.tx += p[0] - drag[0];
    view.ty += p[1] - drag[1];
    drag = p;
    place();
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== pv.contentWindow || !e.data) return;
    const d = e.data;
    if (d.type === 'geulgyeol:page') {
      if (st.page !== d.page) { st.page = d.page; save(); panels.refresh(); }
    } else if (d.type === 'geulgyeol:place') {
      setSource(S.setPageMark(st.source, d.page, 'place', d.place));
      panels.refresh();
      toast(`${d.page + 1}쪽 글을 ${d.place}에 두었어요.`);
    } else if (d.type === 'geulgyeol:zoom') {
      const [px, py] = fromFrame(d.x, d.y);
      zoomAt(px, py, wheelFactor(d.dy));
    } else if (d.type === 'geulgyeol:pinch') {
      pinchTo(d);
    } else if (d.type === 'geulgyeol:pan') {
      panTo(d);
    } else if (d.type === 'geulgyeol:scroll') {
      if (view.k === 1) return;
      view.tx += d.dx;
      view.ty += d.dy;
      place();
    } else if (d.type === 'geulgyeol:close') {
      if (panels.current()) panels.close(); else hideAll($('peek').hidden);
    }
  });

  document.querySelectorAll('#device [data-device]').forEach((b) => b.addEventListener('click', () => {
    st.device = b.dataset.device === native() ? null : b.dataset.device;
    view.k = 1;
    fit();
    tellZoom();
    save();
  }));
  const refit = new ResizeObserver(() => { if (st.step === 'tune') fit(); });
  refit.observe(stage);
  document.querySelectorAll('.panel').forEach((p) => refit.observe(p));

  /* ---------- 판 ---------- */

  /* 장면이 바뀌면 쪽 표시 줄의 장면도 반대로 바꾸고, 맞지 않는 바탕은 뺀다 */
  function flipMarks(text) {
    const ls = text.split('\n');
    S.lines(text).forEach((ln) => {
      if (!ln.scene) return;
      const mk = S.readMarkLine(ln.text);
      if (!mk.scene) return;
      mk.scene = OPPOSITE[mk.scene] || mk.scene;
      if (mk.ground && !T.GROUNDS[mk.scene].includes(mk.ground)) mk.ground = null;
      ls[ln.i] = S.markLine(mk);
    });
    return ls.join('\n');
  }

  function setSettings(part) {
    const before = st.settings.scene;
    st.settings = T.normalize(Object.assign({}, st.settings, part));
    if (st.settings.scene !== before) setSource(flipMarks(st.source));
    T.useFont(document, st.settings);
    save();
  }

  const panels = P.mount({
    get: () => st.source,
    set(text) { setSource(text); },
    head,
    settings: () => st.settings,
    setSettings,
    moods: () => st.moods,
    setMoods(list) { st.moodsTouched = true; setMoods(list); },
    page: () => Math.min(st.page, allPages().length - 1),
    play,
    wide: () => view.w >= 600
  });
  panels.onChange = () => {
    document.querySelectorAll('.tab[data-panel]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.panel === panels.current())));
    stage.classList.toggle('has-panel', !!panels.current());
    if (phone.matches) fit();
  };

  const tabs = $('tabs');
  document.querySelectorAll('.tab[data-panel]').forEach((b) => b.addEventListener('click', () => {
    panels.toggle(b.dataset.panel);
    if (phone.matches) openTabs(false);
  }));
  function openTabs(on) {
    tabs.classList.toggle('open', on);
    $('tab-toggle').setAttribute('aria-expanded', String(on));
  }
  $('tab-toggle').addEventListener('click', () => openTabs(!tabs.classList.contains('open')));
  $('back').addEventListener('click', () => setStep('write'));

  /* 숨기기: 책갈피와 판을 모두 거두고 미리보기만 남긴다. 구석의 작은 네모로 돌아온다 */
  function hideAll(on) {
    if (on) panels.close();
    tabs.hidden = on;
    $('peek').hidden = !on;
    openTabs(false);
    fit();
  }
  $('hide-all').addEventListener('click', () => hideAll(true));
  $('peek').addEventListener('click', () => hideAll(false));

  /* 손이 멈추면 책갈피를 흐린다(판이 열려 있으면 그대로) */
  let idleTimer = 0;
  function wake() {
    stage.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => stage.classList.add('idle'), 2500);
  }
  ['pointermove', 'pointerdown', 'keydown', 'focusin'].forEach((t) => stage.addEventListener(t, wake));

  function enterTune(fresh) {
    T.useFont(document, st.settings);
    tabs.hidden = false;
    $('peek').hidden = true;
    openTabs(false);
    view.k = 1;
    fit();
    wake();
    if (fresh) play({ page: st.page });
    if (!store.get('geul.tuneHint2')) {
      store.set('geul.tuneHint2', true);
      toast(phone.matches ? '왼쪽 위 ‘다듬기’에서 분위기·글씨·배경·강조를 열어요.' : '왼쪽 책갈피에서 분위기·글씨·배경·강조를 열어요.', 3600);
    }
  }

  function leaveTune() {
    panels.close();
    pv.src = 'about:blank';
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (st.step === 'write') compose.hidePop();
    if (st.step !== 'tune') return;
    if (panels.current()) panels.close();
    else hideAll($('peek').hidden);
  });

  /* ---------- 시작 ---------- */

  ta.value = st.source;
  T.useFont(document, st.settings);
  setStep(st.step);
  if (!st.moodsTouched && st.source.trim() && !st.moods.length) guessLater();
})();
