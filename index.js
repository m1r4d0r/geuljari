/*
 * 글결 편집실
 * 쓰기 → 짜기 → 다듬기 세 단계를 잇는다.
 * - 쓰기: 입력창 하나.
 * - 짜기: 글을 읽는 모양으로 펼쳐 쪽을 나누고, 반전을 걸고, 남길 곳을 고르고, 심상을 고른다(compose.js).
 * - 다듬기: 미리보기를 무대 가득 띄우고(PC·모바일 틀), 세부 설정은 필요할 때만 꺼내는 쪽지로 한다(slips.js).
 *   아래 쪽 눈금 띠는 쪽 네모와 쪽지 단추를 모으고, 가만히 두면 흐려진다.
 * 상태는 이 브라우저의 localStorage에만 두고, 미리보기 글과 조판값은 sessionStorage로 view.html에 넘긴다.
 * 반전·쪽 넘김·자리·남길 곳·효과는 모두 본문 안 표시로 들어가 언제든 되돌아가 바꿀 수 있다.
 */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  const T = window.GeulTune;
  const S = window.GeulSense;
  const ED = window.GeulEditor;
  if (!E || !T || !S || !ED || !window.GeulCompose || !window.GeulSlips) return;

  const $ = (id) => document.getElementById(id);
  const KEY = 'geul.studio';
  const STEPS = ['write', 'compose', 'tune'];
  const DEVICES = { pc: [1280, 800], mobile: [390, 844] };
  const OPPOSITE = { '라이트': '다크', '다크': '라이트' };
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
    settings: T.defaults(),
    device: 'pc',
    page: 0,
    prepped: null
  }, store.get(KEY) || {});
  st.settings = T.normalize(st.settings);
  st.moods = T.oneEach(st.moods);
  if (!STEPS.includes(st.step) || !st.source.trim()) st.step = 'write';
  if (!DEVICES[st.device]) st.device = 'pc';

  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set(KEY, st), 250);
  }

  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return String(h);
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
  }

  function head() { return T.sceneLine(st.settings) + '\n'; }
  function allPages() { return E.pages(E.parse(head() + st.source)); }

  /* ---------- 본문 ---------- */

  const ta = $('src');
  const writeEd = ED.attach(ta, $('write-mirror'), {
    onInput(v) { st.source = v; save(); countLines(); }
  });

  /* 본문을 바꾼다. 쓰기 화면이 보일 때만 입력창에 실행 취소가 남도록 갈아 끼운다. */
  function setSource(text) {
    st.source = text;
    if (st.step === 'write') writeEd.set(text);
    else ta.value = text;
    save();
    countLines();
  }

  $('title').value = st.title;
  $('title').addEventListener('input', (e) => { st.title = e.target.value; save(); });

  function countLines() {
    const pgs = allPages();
    const chars = pgs.reduce((n, p) => n + p.count, 0);
    const dark = pgs.filter((p) => p.scene === 'night').length;
    const marks = S.blocks(st.source).length;
    $('count-w').textContent = st.source.trim() ? `${pgs.length}쪽 · ${chars}자` : '';
    $('count-c').textContent = `${pgs.length}쪽${dark ? ` · 다크 ${dark}쪽` : ''}${marks ? ` · 남길 곳 ${marks}` : ''}`;
  }

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
    if (step === 'write') { if (ta.value !== st.source) ta.value = st.source; writeEd.draw(); }
    if (step === 'compose') { prepare(); compose.draw(); drawMoods(); }
    if (step === 'tune') enterTune(from !== 'tune');
    countLines();
    save();
  }
  document.querySelectorAll('.steps [data-go]').forEach((b) => b.addEventListener('click', () => setStep(b.dataset.go)));
  $('home').addEventListener('click', () => setStep('write'));

  /* ---------- 쓰기 ---------- */

  function sampleText() {
    return E.stripMarks(window.GeulgyeolSample ? window.GeulgyeolSample.text : '').replace(/\n{4,}/g, '\n\n\n');
  }
  $('sample').addEventListener('click', () => {
    if (st.source.trim() && !window.confirm('지금 글을 예시 글로 바꿀까요?')) return;
    st.prepped = null;
    setSource(sampleText());
    ta.setSelectionRange(0, 0);
    ta.scrollTop = 0;
  });
  $('clear').addEventListener('click', () => {
    if (st.source.trim() && !window.confirm('지금 글을 지우고 새로 쓸까요?')) return;
    st.prepped = null;
    st.title = '';
    $('title').value = '';
    st.moods = [];
    st.settings = T.defaults();
    st.page = 0;
    setSource('');
    setStep('write');
    ta.focus();
  });
  $('go-compose').addEventListener('click', () => setStep('compose'));

  /* ---------- 짜기 ---------- */

  /* 표시가 없는 새 글이면 글을 읽어 심상을 짐작한다. 쪽 나누기·반전·남길 곳은 짜기에서 사람이 고른다. */
  function prepare() {
    const plainHash = hash(E.stripMarks(st.source).replace(/\s+/g, ''));
    if (/\{\{|\[\[/.test(st.source) || st.prepped === plainHash) return;
    st.moods = T.oneEach(S.guessMoods(st.source));
    st.settings = T.fromMoods(st.moods, st.settings);
    st.prepped = plainHash;
    T.useFont(document, st.settings);
  }

  const compose = window.GeulCompose.mount($('cp-paper'), {
    get: () => st.source,
    set(text) { setSource(text); compose.draw(); },
    head,
    scene: () => st.settings.scene,
    pop: $('cp-pop')
  });

  function setMoods(list) {
    st.moods = T.oneEach(list);
    st.settings = T.fromMoods(st.moods, st.settings);
    save();
  }

  /* 심상: 축마다 한 줄, 줄 안에서 하나만. 고른 것을 다시 누르면 뺀다 */
  function drawMoods() {
    const box = $('cp-moods');
    box.replaceChildren();
    T.AXES.forEach((ax) => {
      const name = document.createElement('span');
      name.className = 'ax';
      name.textContent = ax.name;
      box.append(name);
      ax.words.forEach((w) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = w;
        b.title = T.MOOD[w].note;
        b.setAttribute('aria-pressed', String(st.moods.includes(w)));
        b.addEventListener('click', () => {
          const list = st.moods.filter((x) => !ax.words.includes(x));
          if (!st.moods.includes(w)) list.push(w);
          setMoods(list);
          drawMoods();
        });
        box.append(b);
      });
    });
    const mix = $('cp-mix');
    mix.replaceChildren();
    T.describe(st.settings).filter(([k]) => k !== '장면' && k !== '글꼴').forEach(([k, v]) => {
      const s = document.createElement('span');
      const b = document.createElement('b');
      b.textContent = v;
      s.append(k + ' ', b);
      mix.append(s);
    });
  }

  $('back-write').addEventListener('click', () => setStep('write'));
  $('go-tune').addEventListener('click', () => { st.page = 0; setStep('tune'); });

  /* ---------- 다듬기: 미리보기 무대 ---------- */

  const stage = $('stage');
  const box = $('frame-box');
  const pv = $('pv');
  let pvN = 0;
  let pvPages = 0;

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
    pvPages = 0;
    pv.src = `view.html?v=${++pvN}#preview`;
    drawTicks();
    save();
  }

  function goto(k) {
    if (pvPages && pv.contentWindow) pv.contentWindow.postMessage({ type: 'geulgyeol:goto', page: k }, location.origin);
    else play({ page: k });
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== pv.contentWindow || !e.data) return;
    if (e.data.type === 'geulgyeol:page') {
      pvPages = e.data.pages;
      if (st.page !== e.data.page) {
        st.page = e.data.page;
        save();
        drawTicks();
        slips.refresh();
      }
    } else if (e.data.type === 'geulgyeol:close') hideAll(true);
  });

  /* PC·모바일 틀을 무대에 맞춰 줄인다(폰에서도 PC 틀이 통째로 보인다). 띠 자리는 비운다. */
  function fit() {
    const [w, h] = DEVICES[st.device];
    const W = stage.clientWidth;
    const ruler = $('ruler');
    const rulerH = ruler.hidden ? 0 : stage.clientHeight - ruler.offsetTop;
    const bottom = ruler.hidden ? 16 : rulerH + 12;
    stage.style.setProperty('--ruler-h', rulerH + 'px');
    /* 폰에서 아래 판이 열려 있으면 판 위 빈자리에 맞춘다 */
    const sheet = phone.matches ? document.querySelector('.slip:not([hidden])') : null;
    const H = (sheet ? sheet.offsetTop - 8 : stage.clientHeight - bottom) - 16;
    if (W <= 0 || H <= 0) return;
    const k = Math.min((W - 24) / w, H / h, 1);
    box.style.width = w + 'px';
    box.style.height = h + 'px';
    box.style.left = Math.round((W - w * k) / 2) + 'px';
    box.style.top = Math.round(16 + (H - h * k) / 2) + 'px';
    box.style.transform = `scale(${k})`;
    document.querySelectorAll('#device [data-device]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.device === st.device)));
    document.body.dataset.device = st.device;
  }
  document.querySelectorAll('#device [data-device]').forEach((b) => b.addEventListener('click', () => {
    st.device = b.dataset.device;
    fit();
    save();
  }));
  const refit = new ResizeObserver(() => { if (st.step === 'tune') fit(); });
  refit.observe(stage);
  document.querySelectorAll('.slip').forEach((s) => refit.observe(s));

  /* 쪽 눈금: 쪽마다 네모(다크는 채움), 장면이 바뀌는 사이에는 금 */
  function drawTicks() {
    const ticks = $('ticks');
    ticks.replaceChildren();
    const pgs = allPages();
    pgs.forEach((pg, k) => {
      if (k && pg.scene !== pgs[k - 1].scene) {
        const t = document.createElement('i');
        t.className = 'tick-turn';
        t.title = (pg.turn ? Object.keys(E.TURNS).find((n) => E.TURNS[n] === pg.turn) : st.settings.turn) || '';
        ticks.append(t);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tick' + (pg.scene === 'night' ? ' dark' : '');
      b.textContent = String(k + 1);
      b.setAttribute('aria-label', `${k + 1}쪽`);
      b.setAttribute('aria-current', String(k === st.page));
      b.addEventListener('click', () => goto(k));
      ticks.append(b);
    });
    const cur = ticks.querySelector('[aria-current="true"]');
    if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

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
    drawTicks();
    slips.refresh();
    save();
  }

  const slips = window.GeulSlips.mount(stage, {
    get: () => st.source,
    set(text) { setSource(text); drawTicks(); slips.refresh(); },
    head,
    settings: () => st.settings,
    setSettings,
    moods: () => st.moods,
    setMoods(list) { setMoods(list); slips.refresh(); },
    page: () => Math.min(st.page, allPages().length - 1),
    play,
    again() { if (pvPages && pv.contentWindow) pv.contentWindow.postMessage({ type: 'geulgyeol:again' }, location.origin); else play({ page: st.page }); },
    phone: () => phone.matches,
    store: { get: (k) => store.get('geul.' + k), set: (k, v) => store.set('geul.' + k, v) }
  });
  slips.onChange = () => { syncRuler(); fit(); };

  function syncRuler() {
    document.querySelectorAll('.ruler-act [data-slip]').forEach((b) => b.setAttribute('aria-pressed', String(slips.isOpen(b.dataset.slip))));
  }
  document.querySelectorAll('.ruler-act [data-slip]').forEach((b) => b.addEventListener('click', () => slips.toggle(b.dataset.slip)));

  /* 숨기기: 쪽지와 띠를 모두 거두고 미리보기만 남긴다. 구석의 꺼내기로 돌아온다 */
  function hideAll(on) {
    slips.hideAll();
    if (!on) slips.restore();
    $('ruler').hidden = on;
    $('peek').hidden = !on;
    $('hide-all').setAttribute('aria-pressed', String(on));
    fit();
  }
  $('hide-all').addEventListener('click', () => hideAll(true));
  $('peek').addEventListener('click', () => hideAll(false));

  /* 손이 멈추면 띠를 흐린다 */
  let idleTimer = 0;
  function wake() {
    stage.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => stage.classList.add('idle'), 2500);
  }
  ['pointermove', 'pointerdown', 'keydown', 'focusin'].forEach((t) => stage.addEventListener(t, wake));

  function enterTune(fresh) {
    T.useFont(document, st.settings);
    $('ruler').hidden = false;
    $('peek').hidden = true;
    $('hide-all').setAttribute('aria-pressed', 'false');
    fit();
    drawTicks();
    slips.restore();
    syncRuler();
    wake();
    if (fresh) play({ page: st.page });
    if (!store.get('geul.tuneHint')) {
      store.set('geul.tuneHint', true);
      toast('아래 띠의 ‘이 쪽’·‘전체’에서 쪽마다 다듬어요.');
    }
  }

  function leaveTune() {
    slips.hideAll();
    pv.src = 'about:blank';
    pvPages = 0;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (st.step === 'compose') compose.hidePop();
    if (st.step === 'tune') hideAll($('peek').hidden);
  });

  /* ---------- 시작 ---------- */

  ta.value = st.source;
  T.useFont(document, st.settings);
  setStep(st.step);
})();
