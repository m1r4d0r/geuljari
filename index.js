/*
 * 글결 편집실
 * 편집 → 미리보기 → 발행 세 단계를 잇는다.
 * - 글: 입력창 하나. 그 위에 쪽 짜임을 얹어(compose.js) 줄 사이를 눌러 쪽을 나누고, 쪽 사이에서 반전·잇기를 하고,
 *   끌어 고른 곳을 강조한다. 오른쪽 칸(폰은 위)에서 분위기(심상 세 축)와 테마(주색·글꼴·시작 장면)를 고르고, 그 아래에 쓰는 법 세 줄을 늘 둔다.
 *   분위기는 고르기 전에는 글을 읽어 짐작한 것을 두고, '살펴보기'는 낱말마다 움직임을 견주어 보는 덮개(look.js)를 연다.
 *   페이지 어디에서 휠을 굴려도 본문이 굴러간다.
 * - 미리보기: 읽기 틀이 화면을 채운다. 보는 기기와 같은 틀이면 실제 크기 그대로, 다른 틀(폰에서 PC 16:9, PC에서 폰)이면
 *   맞춰 줄이고, 병렬이면 PC와 폰을 나란히 둔다. 설정은 오른쪽 여백 색인(분위기·글씨·움직임·배경) 아래로 하나씩 펼친다(panels.js).
 *   모양을 바꾸면 다시 쓰지 않고 바로 바뀌고, 움직임은 '다시 보기'로 본다. 글 상자를 누르면 그 자리에서 고치고 꾸민다(inplace.js).
 *   손가락 벌리기·Ctrl+휠로 확대하고, 글 상자를 끌면 왼쪽·가운데·오른쪽에 붙는다(view.js가 미리보기 안의 손짓을 알려 준다).
 * - 미리보기의 마지막 쪽 뒤에는 마지막 카드 화면이 한 장 더 있다. 그 화면에서 고친 카드 문구·배치를 받아 두고(geulgyeol:ending, 병렬이면 다른 틀에도 건넴),
 *   배경 판에서는 그 화면의 장면·바탕을 고른다.
 * 상태는 이 브라우저의 localStorage에만 두고, 미리보기 글({text, title, made, ending})과 조판값은 storage로 view.html에 넘긴다.
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
  const STEPS = ['write', 'tune', 'publish'];
  let publication;
  const OPPOSITE = { '라이트': '다크', '다크': '라이트' };
  const LONG = 240;
  const ZOOM_MAX = 4;
  const phone = window.matchMedia('(max-width: 760px)');

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장할 수 없는 환경에서는 넘어간다 */ } }
  };

  /* 오늘(이 기기의 날짜) YYYY-MM-DD */
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  /* 마지막 화면의 장면·바탕. 그 장면에 없는 바탕이면 편지지(없으면 그 장면의 첫 바탕) */
  function normEnding(en) {
    const o = Object.assign({ scene: '라이트', ground: '편지지' }, en || {});
    if (!T.GROUNDS[o.scene]) o.scene = '라이트';
    const list = T.GROUNDS[o.scene];
    if (!list.includes(o.ground)) o.ground = list.includes('편지지') ? '편지지' : list[0];
    return { scene: o.scene, ground: o.ground, ...window.GeulCardSettings.normalize(o) };
  }

  const st = Object.assign({
    step: 'write',
    title: '',
    made: '',
    source: '',
    moods: [],
    moodsTouched: false,
    settings: T.defaults(),
    ending: normEnding(),
    device: null,
    page: 0,
    atEnd: false
  }, store.get(KEY) || {});
  st.settings = T.normalize(st.settings);
  st.moods = T.oneEach(st.moods);
  st.ending = normEnding(st.ending);
  st.atEnd = false;
  if (typeof st.title !== 'string') st.title = '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(st.made))) st.made = st.source.trim() ? today() : '';
  /* 열 때는 늘 글 화면에서 시작한다(미리보기는 글 화면에서 넘어간다) */
  st.step = 'write';
  if (st.device && !['pc', 'mobile', 'both'].includes(st.device)) st.device = null;

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
    onInput(v) { st.source = v; stamp(); save(); countLine(); guessLater(); },
    nights: () => (compose ? compose.nights() : null),
    onDraw: () => { if (compose) compose.draw(); },
    onScroll: () => { if (compose) compose.scroll(); }
  });
  compose = window.GeulCompose.mount($('write-ed'), ta, $('write-mirror'), writeEd, {
    get: () => st.source,
    set(text, sel) { setSource(text, sel); },
    head,
    scene: () => st.settings.scene,
    turn: () => st.settings.turn
  });

  /* 글이 처음 생긴 날을 적어 둔다(새로 쓰기·예시 글이면 다시) */
  function stamp() { if (!st.made && st.source.trim()) st.made = today(); }

  /* 본문을 바꾼다. 글 화면이 보일 때만 입력창에 실행 취소가 남도록 갈아 끼운다. */
  function setSource(text, sel) {
    st.source = text;
    stamp();
    if (st.step === 'write') writeEd.set(text, sel);
    else ta.value = text;
    save();
    countLine();
  }

  $('title').value = st.title;
  $('title').addEventListener('input', (e) => { st.title = e.target.value; save(); handOff(); });

  function countLine() {
    document.querySelectorAll('.steps [data-go]').forEach((b) => {
      b.disabled = b.dataset.go !== 'write' && !st.source.trim();
    });
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

  /* 오른쪽 칸: 분위기(심상 세 축)와 테마(주색·글꼴·시작 장면) */
  function drawRail() {
    P.moodGrid($('moods'), st.moods, (list) => { st.moodsTouched = true; setMoods(list); drawRail(); });
    P.themeSwatches($('themes'), st.settings.theme, (theme) => setSettings({ theme }));
    const fonts = P.pieces(T.FONT_NAMES, st.settings.font, (font) => {
      setSettings({ font });
      drawRail();
      requestAnimationFrame(() => writeEd.draw());
    }, 'fonts');
    fonts.querySelectorAll('.piece').forEach((b) => { b.style.fontFamily = `${T.FONTS[b.dataset.v].css}, var(--f-body)`; });
    $('fonts').replaceChildren(fonts);
    $('start-scene').replaceChildren(P.pieces(Object.keys(T.GROUNDS), st.settings.scene, (scene) => {
      setSettings({ scene });
      writeEd.draw();
      drawRail();
      countLine();
    }, 'scenes'));
  }

  /* 분위기 살펴보기: 낱말마다 움직임을 견주는 덮개(look.js). 거기서 고르면 이쪽 고름도 바뀐다 */
  function openLook() {
    if (!window.GeulLook) return;
    window.GeulLook.open({
      moods: st.moods.slice(),
      pick(list) {
        st.moodsTouched = true;
        setMoods(list);
        if (st.step === 'tune') { handOff(); $('replay').classList.add('due'); panels.refresh(); } else drawRail();
      }
    });
  }
  $('mood-look').hidden = !window.GeulLook;
  $('mood-look').addEventListener('click', openLook);

  function sampleText() {
    return E.stripMarks(window.GeulgyeolSample ? window.GeulgyeolSample.text : '').replace(/\n{4,}/g, '\n\n\n');
  }
  $('sample').addEventListener('click', () => {
    if (st.source.trim() && !window.confirm('지금 글을 예시 글로 바꿀까요?')) return;
    publication.reset();
    st.moodsTouched = false;
    st.made = '';
    setStep('write');
    setSource(sampleText(), [0, 0]);
    ta.scrollTop = 0;
    guessLater();
  });
  $('clear').addEventListener('click', () => {
    if (st.source.trim() && !window.confirm('지금 글을 지우고 새로 쓸까요?')) return;
    publication.reset();
    st.title = '';
    $('title').value = '';
    st.made = '';
    st.moods = [];
    st.moodsTouched = false;
    st.settings = T.defaults();
    st.ending = normEnding();
    st.page = 0;
    setStep('write');
    setSource('', [0, 0]);
    drawRail();
    ta.focus();
  });
  $('go-tune').addEventListener('click', () => { st.page = 0; setStep('tune'); });

  /*
   * 처음 들어오면 편집창을 흐리게 가리고 안내를 띄운다. 다섯 장을 한 장씩 넘기며, 장마다 그 기능이 움직이는 작은 장면을 보인다.
   * 장면은 숨겼다 보이면 처음부터 다시 움직인다.
   */
  const GUIDE = [
    { title: '분위기를 고르면', body: '그 결에 맞는 움직임을 기본으로 입혀요. 따뜻하면 천천히 마르고, 숨차면 빠르게 써 내려가요.', tip: '상단 메뉴의 편집 설정에서 축마다 하나씩 골라요. 고르기 전에는 글을 읽고 짐작해 둬요.' },
    { title: '줄 사이를 누르면', body: '거기서부터 다음 쪽으로 넘어가요. 한 쪽에 한 호흡씩 담아 보세요.', tip: '줄 사이에 마우스를 올리면 점선이 보여요. 띠 어디를 눌러도 돼요.' },
    { title: '쪽 사이에서 반전', body: '이 쪽부터 배경이 밝게, 어둡게 바뀌어요. 넘어오는 결도 그 자리에서 골라요.', tip: '분위기가 바뀌는 자리는 반전 단추가 점선으로 먼저 알려 줘요.' },
    { title: '두 번 띄어 쓰면 쉼', body: '띄어쓰기를 두 번 한 곳은 잠깐 쉬었다가 이어서 써요. 화면에는 한 칸으로 보여요.', tip: '편집창에는 쉬는 자리가 호박색으로 표시돼요.' },
    { title: '끌어 고르면 강조', body: '남기고 싶은 곳을 끌어 고르고 강조를 눌러요. 미리보기에서는 효과와 글자 꾸밈도 더할 수 있어요.', tip: '여러 곳을 강조하면 조금씩 다른 움직임으로 나와요.' }
  ];
  let guideAt = 0;
  function guideTo(k) {
    guideAt = Math.max(0, Math.min(GUIDE.length - 1, k));
    const g = GUIDE[guideAt];
    document.querySelectorAll('.g-scene').forEach((sc) => { sc.hidden = Number(sc.dataset.n) !== guideAt; });
    $('g-count').textContent = String(guideAt + 1).padStart(2, '0') + ' / ' + String(GUIDE.length).padStart(2, '0');
    $('g-title').textContent = g.title;
    $('g-body').textContent = g.body;
    $('g-tip').textContent = g.tip;
    $('g-prev').hidden = guideAt === 0;
    $('g-next').textContent = guideAt === GUIDE.length - 1 ? '시작하기' : '다음';
    $('g-dots').replaceChildren(...GUIDE.map((x, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(i + 1);
      b.setAttribute('aria-label', `${i + 1}번째 장: ${x.title}`);
      if (i === guideAt) b.setAttribute('aria-current', 'step');
      else if (i < guideAt) b.classList.add('seen');
      b.addEventListener('click', () => guideTo(i));
      return b;
    }));
  }
  function showGuide(on) {
    $('guide').hidden = !on;
    document.body.classList.toggle('guided', on);
    if (on) { guideTo(0); $('g-next').focus(); }
    else { store.set('geul.guide', true); ta.focus({ preventScroll: true }); }
  }
  $('g-next').addEventListener('click', () => { if (guideAt === GUIDE.length - 1) showGuide(false); else guideTo(guideAt + 1); });
  $('g-prev').addEventListener('click', () => guideTo(guideAt - 1));
  $('g-skip').addEventListener('click', () => showGuide(false));
  $('guide-open').addEventListener('click', () => showGuide(true));

  /* 안내나 다른 덮개(살펴보기 등)가 열려 있는지 */
  function overlayOpen() {
    return [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some((d) => !d.hidden && d.getClientRects().length > 0);
  }

  /*
   * 글 화면에서는 페이지 어디에서 휠을 굴려도 본문이 굴러간다. 입력창 위에서는 원래대로 두고, 그 방향으로 스스로 굴러갈 수 있는 칸
   * (넘친 오른쪽 칸 등) 안이나 Ctrl+휠(확대), 안내·덮개가 열려 있을 때는 손대지 않는다. 줄·쪽 단위 휠은 픽셀로 바꾼다.
   * 휠 한 칸처럼 큰 걸음은 부드럽게, 트랙패드의 잔걸음은 그대로 따라간다.
   */
  function canScroll(node, dy) {
    for (let n = node; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (!/(auto|scroll)/.test(getComputedStyle(n).overflowY) || n.scrollHeight <= n.clientHeight + 1) continue;
      if (dy > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0) return true;
    }
    return false;
  }
  let wheelGoal = null;
  let wheelTimer = 0;
  document.addEventListener('wheel', (e) => {
    if (st.step !== 'write' || e.ctrlKey || e.defaultPrevented || overlayOpen()) return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t === ta || !t.closest('.top, #s-write')) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const unit = e.deltaMode === 1 ? (parseFloat(getComputedStyle(ta).lineHeight) || 36) : e.deltaMode === 2 ? ta.clientHeight : 1;
    const dy = e.deltaY * unit;
    if (!dy || canScroll(t, dy)) return;
    e.preventDefault();
    clearTimeout(wheelTimer);
    if (Math.abs(dy) < 50) {
      wheelGoal = null;
      ta.scrollTop += dy;
      return;
    }
    const max = Math.max(0, ta.scrollHeight - ta.clientHeight);
    wheelGoal = Math.max(0, Math.min(max, (wheelGoal == null ? ta.scrollTop : wheelGoal) + dy));
    ta.scrollTo({ top: wheelGoal, behavior: 'smooth' });
    wheelTimer = setTimeout(() => { wheelGoal = null; }, 320);
  }, { passive: false });

  /* ---------- 단계 ---------- */

  function setStep(step) {
    if (step !== 'write' && !st.source.trim()) { toast('글을 먼저 놓아 주세요.'); ta.focus(); return; }
    if ($('write-settings').open) $('write-settings').close();
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
    if (step === 'publish') publication.enter();
    countLine();
    save();
  }
  document.querySelectorAll('.steps [data-go]').forEach((b) => b.addEventListener('click', () => setStep(b.dataset.go)));
  $('home').addEventListener('click', () => setStep('write'));

  /* ---------- 미리보기 ---------- */

  const stage = $('stage');
  const LIVE = ['font', 'size', 'measure', 'align', 'theme'];
  const MOTION = ['flow', 'speed', 'rest', 'dry', 'turn'];
  let pvN = 0;

  /* 미리보기에 넘길 것: 글(첫 장 표시 줄 포함), 제목, 만든 날, 마지막 화면 */
  function handOff() {
    stamp();
    const data = JSON.stringify({ text: head() + st.source, title: st.title, made: st.made || today(), ending: st.ending });
    const tune = JSON.stringify(st.settings);
    try {
      sessionStorage.setItem('geulgyeol.preview', data);
      sessionStorage.setItem('geulgyeol.tune', tune);
      localStorage.setItem('geulgyeol.preview', data);
      localStorage.setItem('geulgyeol.tune', tune);
    } catch (e) { /* 저장할 수 없는 환경에서는 예시 글이 뜬다 */ }
  }

  /*
   * 틀 하나: iframe 두 장을 번갈아 쓴다. 새로 그릴 글은 뒤 장에 불러 두었다가, 그 장이 첫 쪽에 닿았다고 알리면 앞으로 바꾼다.
   * 그래서 바탕부터 다시 불러오며 깜빡이는 일이 없다.
   */
  function makeScreen(box) {
    const frames = [...box.querySelectorAll('iframe')];
    const sc = { box, frames, active: 0, pending: -1, device: 'pc', w: 0, h: 0, s: 1, x: 0, y: 0 };
    frames[0].classList.add('on');
    sc.win = () => frames[sc.active].contentWindow;
    sc.load = (url) => {
      const n = 1 - sc.active;
      sc.pending = n;
      frames[n].src = url;
      clearTimeout(sc.late);
      sc.late = setTimeout(() => { if (sc.pending === n) sc.swap(); }, 4000);
    };
    sc.swap = () => {
      const old = sc.active;
      sc.active = sc.pending;
      sc.pending = -1;
      frames[sc.active].classList.add('on');
      frames[old].classList.remove('on');
      setTimeout(() => { if (sc.active !== old && sc.pending !== old) frames[old].src = 'about:blank'; }, 320);
    };
    sc.clear = () => { sc.pending = -1; frames.forEach((f) => { f.src = 'about:blank'; }); };
    return sc;
  }
  const main = makeScreen($('screen-main'));
  const side = makeScreen($('screen-side'));

  const native = () => (phone.matches ? 'mobile' : 'pc');
  const mode = () => (st.device === 'both' && !phone.matches ? 'both' : st.device && st.device !== 'both' ? st.device : native());
  const screens = () => (mode() === 'both' ? [main, side] : [main]);
  const wide = () => mode() !== 'mobile';

  /*
   * 미리보기를 start({page, needle, next, done, ending}) 자리부터 다시 그린다. done이면 다 쓴 모습으로 바로,
   * ending이면 마지막 화면에 바로 놓는다.
   */
  function play(start) {
    if (st.step !== 'tune' || !st.source.trim()) return;
    const s = Object.assign({ page: st.page }, start);
    st.page = Math.max(0, Math.min(s.page || 0, allPages().length - 1));
    st.atEnd = !!s.ending;
    handOff();
    const url = `view.html?v=${++pvN}&start=${encodeURIComponent(JSON.stringify(s))}#preview`;
    screens().forEach((sc) => sc.load(url));
    if (!s.done) $('replay').classList.remove('due');
    save();
  }
  const show = (start) => play(Object.assign({ page: st.page }, start, { done: true }));
  const replay = () => play({ page: st.page });
  /* 지금 보는 자리(마지막 화면이면 그 화면) */
  const here = () => (st.atEnd ? { page: st.page, ending: true } : { page: st.page });

  function post(sc, msg) { const w = sc.win(); if (w) w.postMessage(msg, location.origin); }
  function postAll(msg) { screens().forEach((sc) => post(sc, msg)); }

  /* ---------- 틀 크기와 확대 ---------- */

  const DEVICES = { pc: [1280, 720], mobile: [390, 844] };
  const view = { k: 1, tx: 0, ty: 0 };

  /*
   * 보는 기기와 같은 틀이면 무대 크기 그대로(실제 화면), 다른 틀(PC 16:9, 폰 390×844)이면 맞춰 줄인다.
   * 병렬은 PC와 폰을 같은 배율로 나란히. 여백 색인을 펼쳐도 읽기 틀의 배율은 유지한다.
   */
  function fit() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (W <= 0 || H <= 0) return;
    const room = H;
    const m = mode();
    side.box.hidden = m !== 'both';
    if (m === 'both') {
      const [pw, ph] = DEVICES.pc;
      const [mw, mh] = DEVICES.mobile;
      const gap = 28;
      const s = Math.min((W - 96 - gap) / (pw + mw), (room - 56) / Math.max(ph, mh), 1);
      const x0 = (W - (pw + mw) * s - gap) / 2;
      Object.assign(main, { device: 'pc', w: pw, h: ph, s, x: x0, y: (room - ph * s) / 2 });
      Object.assign(side, { device: 'mobile', w: mw, h: mh, s, x: x0 + pw * s + gap, y: (room - mh * s) / 2 });
      view.k = 1;
    } else {
      const same = m === native();
      const [w, h] = same ? [W, H] : DEVICES[m];
      const pad = same ? 0 : 32;
      const s = Math.min((W - pad) / w, (room - pad) / h, 1);
      Object.assign(main, { device: m, w, h, s, x: (W - w * s) / 2, y: (room - h * s) / 2 });
      main.box.classList.toggle('framed', !same);
    }
    side.box.classList.add('framed');
    if (m === 'both') main.box.classList.add('framed');
    [main, side].forEach((sc) => { sc.box.style.width = sc.w + 'px'; sc.box.style.height = sc.h + 'px'; });
    place();
    document.querySelectorAll('#device [data-device]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.device === m)));
  }

  function place() {
    const sc = main;
    const s = sc.s * view.k;
    const W = stage.clientWidth;
    const room = sc.y * 2 + sc.h * sc.s;
    if (view.k === 1) { view.tx = sc.x; view.ty = sc.y; } else {
      const sw = sc.w * s;
      const sh = sc.h * s;
      view.tx = sw > W ? Math.min(0, Math.max(W - sw, view.tx)) : (W - sw) / 2;
      view.ty = sh > room ? Math.min(0, Math.max(room - sh, view.ty)) : (room - sh) / 2;
    }
    main.box.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${s})`;
    side.box.style.transform = `translate(${side.x}px, ${side.y}px) scale(${side.s})`;
    $('zoom').hidden = view.k === 1;
    $('zoom-k').textContent = Math.round(view.k * 100) + '%';
  }

  /* 무대 좌표 (px, py)를 그 자리에 둔 채 f배 */
  function zoomAt(px, py, f) {
    if (mode() === 'both') return;
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
  function tellZoom() { post(main, { type: 'geulgyeol:zoomed', on: view.k > 1 }); }
  $('zoom-fit').addEventListener('click', resetZoom);

  /* 미리보기 안의 점(그 문서 좌표)을 무대 좌표로 */
  function fromFrame(x, y) {
    const s = main.s * view.k;
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
    if (mode() === 'both') return;
    if (d.phase === 'end') {
      grip = null;
      if (view.k < 1.05) resetZoom(); else tellZoom();
      return;
    }
    const [a, b] = d.pts.map(([x, y]) => fromFrame(x, y));
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const cx = (a[0] + b[0]) / 2;
    const cy = (a[1] + b[1]) / 2;
    const s = main.s * view.k;
    if (d.phase === 'start' || !grip) { grip = { dist, k: view.k, x: (cx - view.tx) / s, y: (cy - view.ty) / s }; return; }
    if (!grip.dist) return;
    view.k = Math.min(ZOOM_MAX, Math.max(1, grip.k * dist / grip.dist));
    const s2 = main.s * view.k;
    view.tx = cx - grip.x * s2;
    view.ty = cy - grip.y * s2;
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

  /* ---------- 미리보기와 주고받기 ---------- */

  function whoIs(src) {
    for (const sc of [main, side]) {
      const i = sc.frames.findIndex((f) => f.contentWindow === src);
      if (i >= 0) return { sc, i };
    }
    return null;
  }

  /* 미리보기 안에서 고치는 쪽의 본문 범위 */
  let editing = null;
  function sliceOf(k) {
    const ls = S.lines(st.source).filter((l) => !l.empty && !l.scene && l.page === k);
    if (!ls.length) return null;
    return { s: ls[0].start, e: ls[ls.length - 1].start + ls[ls.length - 1].text.length };
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data) return;
    const who = whoIs(e.source);
    if (!who) return;
    const { sc, i } = who;
    const d = e.data;
    if (d.type === 'geulgyeol:page') {
      if (i === sc.pending) { sc.swap(); if (sc === main) tellZoom(); }
      if (i !== sc.active) return;
      /* 마지막 화면이면 page는 글 쪽 수다. 쪽은 마지막 글 쪽에 두고 마지막 화면에 있다고 적는다 */
      const end = d.ending === true;
      const k = end ? Math.max(0, allPages().length - 1) : d.page;
      if (sc === main && (st.page !== k || st.atEnd !== end)) {
        st.page = k;
        st.atEnd = end;
        save();
        panels.refresh();
        if (mode() === 'both') post(side, { type: 'geulgyeol:goto', page: d.page });
      }
      return;
    }
    if (i !== sc.active) return;
    if (d.type === 'geulgyeol:publish') { setStep('publish'); return; }
    if (d.type === 'geulgyeol:ending') {
      st.ending = normEnding({ ...st.ending, ...window.GeulCardSettings.normalize(d.ending) });
      save(); handOff();
      screens().forEach(o => { if (o !== sc) post(o, { type:'geulgyeol:ending', ending:st.ending }); });
      return;
    }
    if (d.type === 'geulgyeol:place') {
      setSource(S.setPageMark(st.source, d.page, 'place', d.place));
      handOff();
      panels.refresh();
      toast(`${d.page + 1}쪽 글을 ${d.place}에 두었어요.`);
    } else if (d.type === 'geulgyeol:edit-req') {
      const r = sliceOf(d.page);
      editing = r ? { s: r.s, e: r.e, page: d.page } : null;
      e.source.postMessage({ type: 'geulgyeol:edit-slice', page: d.page, text: r ? st.source.slice(r.s, r.e) : null }, location.origin);
    } else if (d.type === 'geulgyeol:edit') {
      if (!editing || typeof d.text !== 'string') return;
      setSource(st.source.slice(0, editing.s) + d.text + st.source.slice(editing.e));
      editing.e = editing.s + d.text.length;
    } else if (d.type === 'geulgyeol:edit-done') {
      editing = null;
      if (d.replay) play(d.replay); else show({ page: d.page });
    } else if (sc !== main) {
      /* 병렬의 폰 틀에서는 확대·닫기 손짓을 받지 않는다 */
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
      if (tabs.classList.contains('open')) { openTabs(false); $('tab-toggle').focus(); } else hideAll($('peek').hidden);
    }
  });

  document.querySelectorAll('#device [data-device]').forEach((b) => b.addEventListener('click', () => {
    const before = mode();
    st.device = b.dataset.device === native() ? null : b.dataset.device;
    view.k = 1;
    fit();
    tellZoom();
    if (mode() === 'both' && before !== 'both') show(here());
    else if (before === 'both' && mode() !== 'both') side.clear();
    panels.refresh();
    save();
  }));
  const refit = new ResizeObserver(() => { if (st.step === 'tune') fit(); });
  refit.observe(stage);

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

  /*
   * 조판값 바꾸기. 모양(글꼴·크기·폭·정렬·주색)은 미리보기에 바로 걸고, 움직임 값은 '다시 보기'를 기다리며,
   * 장면·바탕은 그 쪽을 다 쓴 모습으로 다시 그린다.
   */
  function setSettings(part) {
    const keys = Object.keys(part);
    const before = st.settings.scene;
    st.settings = T.normalize(Object.assign({}, st.settings, part));
    if (st.settings.scene !== before) setSource(flipMarks(st.source));
    T.useFont(document, st.settings);
    T.useTheme(document, st.settings);
    handOff();
    save();
    if (st.step !== 'tune') return;
    if (keys.every((k) => LIVE.includes(k))) postAll({ type: 'geulgyeol:style', settings: st.settings });
    else if (keys.every((k) => MOTION.includes(k))) $('replay').classList.add('due');
    else show(here());
  }

  /* 마지막 화면의 장면·바탕을 바꾸고 그 화면을 바로 다시 보인다 */
  function setEnding(part) {
    st.ending = normEnding(Object.assign({}, st.ending, part));
    save();
    handOff();
    show({ page: st.page, ending: true });
  }

  const panels = P.mount({
    get: () => st.source,
    set(text) { setSource(text); },
    head,
    settings: () => st.settings,
    setSettings,
    moods: () => st.moods,
    setMoods(list) { st.moodsTouched = true; setMoods(list); handOff(); $('replay').classList.add('due'); },
    page: () => Math.min(st.page, allPages().length - 1),
    show,
    play,
    replay,
    wide,
    atEnd: () => st.atEnd,
    ending: () => st.ending,
    setEnding,
    look: window.GeulLook ? openLook : null
  });
  panels.onChange = () => {
    document.querySelectorAll('.tab[data-panel]').forEach((b) => {
      const on = b.dataset.panel === panels.current();
      b.setAttribute('aria-expanded', String(on));
      b.querySelector('.tab-sign').textContent = on ? '−' : '+';
    });
    stage.classList.toggle('has-panel', !!panels.current());
  };

  const tabs = $('tabs');
  document.querySelectorAll('.tab[data-panel]').forEach((b) => b.addEventListener('click', () => {
    panels.toggle(b.dataset.panel);
  }));
  function openTabs(on) {
    if (!on && panels.current()) panels.close();
    tabs.hidden = !on; tabs.inert = !on;
    $('tab-toggle').hidden = on || document.body.classList.contains('preview-clean');
    tabs.classList.toggle('open', on);
    $('tab-toggle').setAttribute('aria-expanded', String(on));
  }
  $('tab-toggle').addEventListener('click', () => { openTabs(true); $('tabs-close').focus(); });
  $('tabs-close').addEventListener('click', () => { openTabs(false); $('tab-toggle').focus(); });
  let drawerStart = null;
  $('tab-toggle').addEventListener('pointerdown', e => { drawerStart = e.clientX; e.currentTarget.setPointerCapture(e.pointerId); });
  $('tab-toggle').addEventListener('pointerup', e => { if (drawerStart !== null && drawerStart - e.clientX > 16) { openTabs(true); $('tabs-close').focus(); } drawerStart = null; });
  $('tab-toggle').addEventListener('pointercancel', () => { drawerStart = null; });
  $('card-open').addEventListener('click', () => { openTabs(false); show({ page:allPages().length - 1, ending:true }); });
  $('replay').addEventListener('click', () => { replay(); if (phone.matches) openTabs(false); });

  /* 숨기기: 책갈피와 판을 모두 거두고 미리보기만 남긴다. 구석의 작은 네모로 돌아온다 */
  function hideAll(on) {
    document.body.classList.toggle('preview-clean', on);
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
    document.body.classList.remove('preview-clean');
    T.useFont(document, st.settings);
    tabs.hidden = false;
    $('peek').hidden = true;
    openTabs(false);
    view.k = 1;
    fit();
    wake();
    if (fresh) replay();
    if (!store.get('geul.tuneHint3')) {
      store.set('geul.tuneHint3', true);
      toast(phone.matches
        ? '글 상자를 누르면 그 자리에서 고치고 꾸며요. 오른쪽 가장자리를 당기면 설정이 열려요.'
        : '글 상자를 누르면 그 자리에서 고치고 꾸며요. 오른쪽 가장자리에서 여백 색인을 열어요.', 4200);
    }
  }

  function leaveTune() {
    document.body.classList.remove('preview-clean');
    panels.close();
    main.clear();
    side.clear();
    editing = null;
    st.atEnd = false;
  }

  document.addEventListener('keydown', (e) => {
    /* 살펴보기 덮개가 열려 있으면 그 덮개가 키를 맡는다 */
    if (e.defaultPrevented || (overlayOpen() && $('guide').hidden)) return;
    if (!$('guide').hidden && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { guideTo(guideAt + (e.key === 'ArrowRight' ? 1 : -1)); return; }
    if (e.key !== 'Escape') return;
    if (!$('guide').hidden) { showGuide(false); return; }
    if (st.step === 'write') compose.hidePop();
    if (st.step !== 'tune') return;
    if (tabs.classList.contains('open')) { openTabs(false); $('tab-toggle').focus(); }
    else hideAll($('peek').hidden);
  });

  /* ---------- 시작 ---------- */

  publication = window.GeulPublish.mount({
    snapshot: () => ({ version:1, title:st.title, source:st.source, made:st.made || today(), settings:st.settings, moods:st.moods, moodsTouched:st.moodsTouched, ending:st.ending }),
    title(value) { st.title = value; $('title').value = value; save(); },
    manage: () => setStep('publish'),
    import(d) {
      clearTimeout(guessTimer);
      st.title = d.title; $('title').value = d.title;
      st.made = /^\d{4}-\d{2}-\d{2}$/.test(d.made) ? d.made : today();
      st.settings = T.normalize(d.settings);
      st.moods = T.oneEach(Array.isArray(d.moods) ? d.moods : []);
      st.moodsTouched = !!d.moodsTouched;
      st.ending = normEnding(d.ending); st.page = 0;
      setStep('write'); setSource(d.source, [0,0]);
      T.useFont(document, st.settings); T.useTheme(document, st.settings);
      drawRail(); handOff();
    }
  });
  ta.value = st.source;
  T.useFont(document, st.settings);
  T.useTheme(document, st.settings);
  if (!store.get('geul.guide') && !location.hash.startsWith('#edit=')) showGuide(true);
  setStep(st.step);
  publication.resume();
  if (!st.moodsTouched && st.source.trim() && !st.moods.length) guessLater();
})();
