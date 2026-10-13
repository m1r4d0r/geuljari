/*
 * 글결 분위기 살펴보기
 * 편집실 위에 뜨는 판. 심상 세 축(심상·물기·호흡)을 한 장에 한 축씩 보이고, 축의 낱말을 나란히 놓아 그 차이가 움직이는 작은 장면으로 견준다.
 * - 심상: 다섯 벌(빛·바람·물·시간·종이) 가운데 하나를 실제 읽기 틀(look-scene.html)로 보인다. 라이트 쪽 한 줄 → 그 심상의 넘김 → 다크 쪽 한 줄 →
 *   라이트로 돌아가는 넘김을 되풀이한다. 아래 낱말 단추로 다른 심상을 띄우고, '이걸로'로 고른다.
 * - 물기: 보통 글자가 나타나는 결(번짐·이어 쓰기)과, 강조 글자가 마르는 빠르기.
 * - 호흡: 같은 글을 글 상자 폭만 달리 둔 모습. 긴 폭을 카드 안 폭으로 보고 짧은 폭은 그 비율로 줄인다.
 * 카드 아래 시간 막대에는 글자가 나온 때와 낱말이 바꾸는 시간(나타나는 동안·쉼·마름·넘김)을 두 낱말이 같은 눈금으로 그린다.
 * 시간은 낱말의 조판값(GeulTune.fromMoods)을 엔진(Geulgyeol)에 걸어 짠 실제 시간표를 쓰고, 짠 뒤에는 엔진 값을 되돌린다.
 * 글자 효과의 생김새와 길이는 fx.js와 같다.
 * 두 장면은 한 시계로 함께 돌고, 다 쓴 뒤 머물렀다가 흐려지며 처음부터 되풀이한다. 장을 넘기거나 다시 열면 처음부터.
 * 움직임 줄이기 설정이면 장면마다 차이가 가장 잘 보이는 한 순간에 멈춰 둔다.
 * open({ moods, pick, axis, settings }): moods는 지금 고른 낱말, pick(list)가 있으면 낱말 쪽을 눌러 축마다 하나씩 고르고
 *   고른 것을 다시 누르면 뺀다(물기·호흡은 늘 하나라 빼지 않는다). axis(축 이름)를 주면 그 장부터 연다.
 *   settings는 편집실 조판값(심상 장면의 글꼴·주색·속도). close()로 닫는다.
 * 장은 오른쪽 아래 축 단추(심상·물기·호흡)로 고른다. Esc·닫기·바깥 누르기로 닫고, 좌우 방향키로 장을 넘긴다. 닫으면 #mood-look(보이지 않으면 열기 전 자리)으로 초점을 돌려준다.
 * 폰 폭에서는 아래에서 올라오는 판. 전역 GeulLook.
 */
(function (global) {
  'use strict';
  const doc = global.document;

  const LEAD = 300;        // 장면 첫머리의 빈 종이
  const HOLD = 1600;       // 다 쓴 뒤 머무는 시간
  const OUT = 600;         // 되풀이 앞에 흐려지는 시간
  /* 심상 장면: 다크 쪽에 넘어간 뒤 머무는 시간, 라이트로 돌아와 다시 쓰고 넘기기까지 */
  const DARK_STAY = 3400;
  const LIGHT_STAY = 3200;
  const PAPER = '#ECEDF0';

  /* 장마다 축 하나. text는 엔진 문법 그대로(빈 줄 없는 한 문단). 심상 장의 글은 look-scene.js에 */
  const PAGES = [
    {
      axis: '심상', kind: 'image',
      body: '두 장면의 바탕과, 라이트·다크가 바뀌는 쪽에서 넘기는 결을 한 벌로 정해요.',
      tip: '라이트에서 다크로 넘어가는 모습이에요. 시간·종이는 라이트로 돌아올 때 넘김이 달라요.'
    },
    {
      axis: '물기', kind: 'wet',
      body: '보통 글자가 종이에 나타나는 결과, 강조한 글자가 마르는 빠르기가 달라져요.',
      tip: '강조한 곳은 따로 고른 효과 그대로 나와요.',
      text: '밤이 깊어지면\n소리가 지워진다.'
    },
    {
      axis: '호흡', kind: 'measure',
      body: 'PC에서 글 상자의 폭, 한 줄에 담기는 글자 수가 달라져요.',
      tip: '폰에서는 화면 폭을 따라요. 쪽마다 따로 정한 폭이 먼저예요.',
      text: '잉크가 마르기 전의 글자는 아직 젖어 있어서, 손바닥 옆면으로 스치기만 해도 번진다. 그래서 천천히 써야 한다.'
    }
  ];

  /* 글자 효과의 생김새(fx.js의 FX와 같은 키프레임) */
  const FRAMES = {
    fade: { easing: 'ease-out', frames: () => [{ opacity: 0 }, { opacity: 1 }] },
    soft: { easing: 'ease-out', frames: () => [{ opacity: 0 }, { opacity: 1 }] },
    rise: {
      easing: 'cubic-bezier(.2, .65, .25, 1)',
      frames: () => [
        { opacity: 0, transform: 'translateY(.5em)', filter: 'blur(4px)' },
        { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' }
      ]
    },
    bleed: {
      easing: 'ease-out',
      frames: (c) => [
        { opacity: 0, color: 'transparent', textShadow: `0 0 .6em ${c}` },
        { opacity: 1, color: 'transparent', textShadow: `0 0 .28em ${c}`, offset: 0.4 },
        { opacity: 1, color: c, textShadow: `0 0 0 ${c}` }
      ]
    }
  };

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const pct = (v) => (v * 100).toFixed(3) + '%';

  function el(tag, cls, text) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* 색: 편집실 토큰(주색에서 만든 값)을 읽고, 없으면 기본 먹지 색 */
  function hex(v, d) {
    const s = String(v || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s;
    if (/^#[0-9a-f]{3}$/i.test(s)) return '#' + s.slice(1).split('').map((c) => c + c).join('');
    const m = s.match(/^rgba?\(([^)]+)\)/);
    if (m) return '#' + m[1].split(/[\s,/]+/).slice(0, 3).map((x) => Math.round(parseFloat(x)).toString(16).padStart(2, '0')).join('');
    return d;
  }
  function mix(a, b, t) {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  function palette() {
    const cs = getComputedStyle(doc.documentElement);
    const ink = hex(cs.getPropertyValue('--ink'), '#2C2F6B');
    const paper = hex(cs.getPropertyValue('--paper'), PAPER);
    return { ink, wet: hex(cs.getPropertyValue('--wet-ink'), mix(ink, paper, 0.5)) };
  }

  /*
   * 낱말 하나의 조판값으로 엔진 시간표를 짠다. 엔진의 시간 값은 짠 뒤 그대로 되돌린다.
   * 돌려주는 값: para(글자마다 t·anim이 붙은 문단), enter(효과마다 길이), speed
   */
  function written(text, s) {
    const E = global.Geulgyeol;
    const T = global.GeulTune;
    const keep = { time: Object.assign({}, E.TIME), enter: Object.assign({}, E.ENTER), blocks: {} };
    Object.keys(E.BLOCKS).forEach((k) => { keep.blocks[k] = Object.assign({}, E.BLOCKS[k]); });
    try {
      T.apply(E, s);
      const para = E.parse(text).paragraphs[0];
      T.flowCells(para, s);
      return { para, enter: Object.assign({}, E.ENTER), speed: s.speed };
    } finally {
      Object.assign(E.TIME, keep.time);
      Object.assign(E.ENTER, keep.enter);
      Object.keys(keep.blocks).forEach((k) => Object.assign(E.BLOCKS[k], keep.blocks[k]));
    }
  }

  /* 문단을 줄·글자로 그리고, 글자마다 나올 때(t)와 효과(fx)를 돌려준다. 쉼 뒤 첫 글자는 rest에 쉼이 시작된 때를 단다 */
  function draw(box, para) {
    const items = [];
    para.lines.forEach((l) => {
      const ln = el('div', 'lk-ln');
      l.tokens.forEach((tk, ti) => {
        if (ti > 0) ln.append(' ');
        const word = el('span', 'lk-tk');
        ln.append(word);
        tk.cells.forEach((c, j) => {
          const sp = el('span', 'lk-ch', c.ch);
          word.append(sp);
          const prev = items[items.length - 1];
          items.push({ el: sp, t: c.t + LEAD, fx: c.anim, rest: tk.afterRest && j === 0 && prev ? prev.t : null });
        });
      });
      box.append(ln);
    });
    return items;
  }

  /* 시계를 직접 맞추는 애니메이션(멈춰 두고 currentTime으로 그린다) */
  function held(node, frames, o) {
    try {
      const a = node.animate(frames, Object.assign({ fill: 'both' }, o));
      a.pause();
      return a;
    } catch (e) {
      return null;
    }
  }

  /* ---------- 낱말 하나의 장면 ---------- */

  function option(word, pg, pal, canPick) {
    const T = global.GeulTune;
    const s = T.fromMoods([word]);
    const m = T.MOOD[word];
    const art = el('article', 'lk-opt' + (canPick ? ' can' : ''));
    art.dataset.word = word;
    const card = el('div', 'lk-card');
    card.setAttribute('aria-hidden', 'true');
    const day = el('div', 'lk-face day');
    card.append(day);
    art.append(card);

    const cap = el('div', 'lk-cap');
    const head = el('div', 'lk-head');
    head.append(el('span', 'lk-word', word));
    if (canPick) {
      const b = el('button', 'lk-pick', '이걸로');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', word);
      head.append(b);
    }
    cap.append(head, el('p', 'lk-val', values(word)), el('p', 'lk-note', /요$/.test(m.note) ? m.note + '.' : m.note));
    art.append(cap);

    if (pg.kind === 'measure') day.style.setProperty('--lk-m', String(m.measure));
    const { para, enter, speed } = written(pg.text, s);
    const items = draw(day, para);
    const anims = [];
    const push = (a) => { if (a) anims.push(a); };
    items.forEach((it) => {
      const f = FRAMES[it.fx] || FRAMES.fade;
      push(held(it.el, f.frames(pal.ink), { duration: enter[it.fx] || enter.fade, delay: it.t, easing: f.easing }));
    });
    const last = items[items.length - 1];
    const o = {
      word, art, card, items,
      end: last.t + (enter[last.fx] || enter.fade),
      marks: { ticks: items.map((it) => it.t), rests: items.filter((it) => it.rest != null).map((it) => [it.rest, it.t]) }
    };
    o.until = o.end;
    if (pg.kind === 'wet') o.marks.show = [items[0].t, o.end];

    o.render = (t, loop) => {
      anims.forEach((a) => { a.currentTime = t; });
      const k = t > loop - OUT ? clamp01((loop - t) / OUT) : 1;
      day.style.opacity = k < 1 ? k.toFixed(3) : '';
      if (o.trackRender) o.trackRender(t);
    };
    return o;
  }

  /* 낱말이 바꾸는 조판값 한 줄 */
  function values(word) {
    const T = global.GeulTune;
    const m = T.MOOD[word];
    const out = [];
    if (m.image) {
      out.push(`라이트 ${m.image.day} · 다크 ${m.image.night}`);
      out.push(m.image.toDay === m.image.toNight ? '넘김 ' + m.image.toNight : `넘김 ${m.image.toNight}·${m.image.toDay}`);
    }
    if (m.dry) out.push('마름 ' + (T.DRY[m.dry] / T.PACE).toFixed(1) + '초');
    if (m.flow) out.push('흐름 ' + m.flow);
    if (m.speed != null) out.push('속도 ' + m.speed.toFixed(2) + '×');
    if (m.rest != null) out.push('쉼 ' + T.REST_NAMES[m.rest]);
    if (m.measure) out.push('글 상자 폭 ' + m.measure + '자');
    return out.join(' · ');
  }

  /* 시간 막대: 두 낱말이 같은 눈금(span ms)을 쓴다 */
  function track(o, span, pal) {
    const box = el('div', 'lk-track');
    box.setAttribute('aria-hidden', 'true');
    const x = (t) => pct(clamp01(t / span));
    const mk = o.marks;
    const seg = (cls, a, b) => {
      const n = el('i', 'lk-seg ' + cls);
      n.style.left = x(a);
      n.style.width = pct(clamp01((b - a) / span));
      box.append(n);
      return n;
    };
    if (mk.show) seg('show', mk.show[0], mk.show[1]);
    (mk.rests || []).forEach(([a, b]) => seg('rest', a, b));
    if (mk.wet) {
      const n = seg('dry', mk.wet[0], mk.wet[2]);
      const h = ((mk.wet[1] - mk.wet[0]) / (mk.wet[2] - mk.wet[0])) * 100;
      n.style.background = `linear-gradient(to right, ${pal.wet} 0, ${pal.wet} ${h.toFixed(1)}%, ${pal.ink} 100%)`;
    }
    const past = el('i', 'lk-past');
    box.append(past);
    const ticks = mk.ticks.map((t) => {
      const n = el('i', 'lk-tick');
      n.style.left = x(t);
      box.append(n);
      return { n, t };
    });
    const now = el('i', 'lk-now');
    box.append(now);
    o.card.after(box);
    /* 지금 자리는 그 낱말의 장면이 끝나는 곳(o.until)에서 멈춘다 */
    o.trackRender = (t) => {
      const at = x(Math.min(t, o.until, span));
      now.style.left = at;
      past.style.width = at;
      ticks.forEach((k) => k.n.classList.toggle('on', k.t <= t));
    };
  }

  /* ---------- 판 ---------- */

  let root = null;
  let ui = null;
  let opts = {};
  let moods = [];
  let at = 0;
  let cur = null;
  let raf = 0;
  let start = 0;
  let lastFocus = null;
  const reduce = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function build() {
    root = el('div', 'lk');
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '분위기 살펴보기');
    root.setAttribute('aria-describedby', 'lk-body');
    const sheet = el('section', 'lk-sheet');
    const stage = el('div', 'lk-stage');
    const text = el('div', 'lk-text');
    const top = el('div', 'lk-top');
    const count = el('span', 'lk-count');
    const x = el('button', 'lk-link', '닫기');
    x.type = 'button';
    top.append(count, x);
    const title = el('h2');
    title.id = 'lk-title';
    const body = el('p', 'lk-body');
    body.id = 'lk-body';
    const tip = el('p', 'lk-tip');
    /* 장 고르기는 축 단추 하나뿐: 심상·물기·호흡 */
    const dots = el('div', 'lk-dots');
    dots.setAttribute('role', 'group');
    dots.setAttribute('aria-label', '분위기 축');
    const axes = PAGES.map((pg, i) => {
      const b = el('button', null, pg.axis);
      b.type = 'button';
      b.addEventListener('click', () => show(i));
      return b;
    });
    dots.append(...axes);
    text.append(top, title, body, tip, dots);
    sheet.append(stage, text);
    root.append(sheet);
    doc.body.append(root);
    ui = { sheet, stage, count, title, body, tip, axes };

    x.addEventListener('click', close);
    root.addEventListener('click', (e) => { if (e.target === root) close(); });
    stage.addEventListener('click', (e) => {
      const art = e.target.closest('.lk-opt.can');
      if (art) toggle(art.dataset.word);
    });
  }

  /* 축마다 하나: 같은 축의 다른 낱말은 빼고, 이미 고른 낱말을 다시 누르면 뺀다(물기·호흡은 늘 하나라 빼지 않음) */
  function toggle(word) {
    const T = global.GeulTune;
    if (typeof opts.pick !== 'function') return;
    const ax = T.AXES.find((a) => a.words.includes(word));
    if (moods.includes(word) && T.FIXED[ax.name]) return;
    const list = moods.filter((w) => !ax.words.includes(w));
    if (!moods.includes(word)) list.push(word);
    moods = T.oneEach(list);
    opts.pick(moods.slice());
    mark();
  }

  function mark() {
    if (!cur) return;
    if (cur.mark) cur.mark();
    cur.list.forEach((o) => {
      const on = moods.includes(o.word);
      o.art.classList.toggle('on', on);
      const b = o.art.querySelector('.lk-pick');
      if (b) {
        b.setAttribute('aria-pressed', String(on));
        b.textContent = on ? '골랐어요' : '이걸로';
      }
    });
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (!cur) return;
    if (cur.dispose) cur.dispose();
    cur.list.forEach((o) => o.items.forEach((it) => it.el.getAnimations().forEach((a) => a.cancel())));
  }

  function paint(t) {
    if (cur) cur.list.forEach((o) => o.render(t, cur.loop));
  }

  function frame(now) {
    paint((now - start) % cur.loop);
    raf = requestAnimationFrame(frame);
  }

  /* ---------- 심상 장: 실제 읽기 틀 ---------- */

  /*
   * 위에 읽기 틀(look-scene.html) 하나, 아래에 다섯 낱말 단추와 띄운 낱말의 조판값·풀이·'이걸로'.
   * 읽기 틀은 틀 크기의 4/3배로 세워 3/4로 줄여 보인다(글자가 작은 미리보기처럼 읽히게).
   * 다크 쪽에 닿으면 머물렀다가 라이트로 넘기고(돌아오는 넘김), 라이트에서 다시 쓴 뒤 다크로 넘기기를 되풀이한다.
   * 움직임 줄이기면 처음 한 번만 넘긴다.
   */
  function imageScene(ax, canPick) {
    const T = global.GeulTune;
    const pair = el('div', 'lk-pair lk-image');
    const view = el('div', 'lk-view');
    view.setAttribute('aria-hidden', 'true');
    const words = el('div', 'lk-words');
    words.setAttribute('role', 'group');
    words.setAttribute('aria-label', '심상 낱말');
    const cap = el('div', 'lk-cap');
    const head = el('div', 'lk-head');
    const val = el('p', 'lk-val');
    const note = el('p', 'lk-note');
    const pick = canPick ? el('button', 'lk-pick', '이걸로') : null;
    if (pick) {
      pick.type = 'button';
      pick.addEventListener('click', () => toggle(shown));
    }
    const name = el('span', 'lk-word');
    head.append(name);
    if (pick) head.append(pick);
    cap.append(head, val, note);
    pair.append(view, words, cap);

    const chips = ax.words.map((w) => {
      const b = el('button', 'lk-chip', w);
      b.type = 'button';
      b.addEventListener('click', () => load(w));
      words.append(b);
      return b;
    });

    let shown = (moods.find((w) => ax.words.includes(w))) || ax.words[0];
    let frame = null;
    let timers = [];
    let back = false;
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const post = (msg) => { if (frame && frame.contentWindow) frame.contentWindow.postMessage(msg, location.origin); };

    function load(w) {
      shown = w;
      timers.forEach(clearTimeout);
      timers = [];
      back = false;
      if (frame) frame.remove();
      frame = el('iframe', 'lk-frame');
      frame.title = '';
      frame.tabIndex = -1;
      frame.setAttribute('aria-hidden', 'true');
      const q = new URLSearchParams({ w, s: JSON.stringify(opts.settings || {}), start: JSON.stringify({ page: 0, next: true }) });
      frame.src = 'look-scene.html?' + q + '#preview';
      view.append(frame);
      const m = T.MOOD[w];
      name.textContent = w;
      val.textContent = values(w);
      note.textContent = /요$/.test(m.note) ? m.note + '.' : m.note;
      paintMark();
    }

    function paintMark() {
      chips.forEach((b) => {
        b.classList.toggle('on', moods.includes(b.textContent));
        if (b.textContent === shown) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
      const on = moods.includes(shown);
      pair.classList.toggle('on', on);
      if (pick) {
        pick.setAttribute('aria-pressed', String(on));
        pick.textContent = on ? '골랐어요' : '이걸로';
      }
    }

    /* 읽기 틀이 장에 닿을 때마다 알린다(geulgyeol:page). 다크 쪽(1)이면 머문 뒤 라이트로, 라이트로 돌아왔으면 다시 쓰고 다크로 */
    function onPage(d) {
      if (reduce.matches) return;
      if (d.page === 1) {
        back = true;
        later(DARK_STAY, () => post({ type: 'geulgyeol:goto', page: 0 }));
      } else if (d.page === 0 && back) {
        later(500, () => post({ type: 'geulgyeol:again' }));
        later(500 + LIGHT_STAY, () => post({ type: 'geulgyeol:goto', page: 1 }));
      }
    }

    ui.stage.replaceChildren(pair);
    load(shown);
    return {
      pg: null, list: [], loop: 1, still: 0,
      mark: paintMark,
      message(e) { if (frame && e.source === frame.contentWindow && e.data.type === 'geulgyeol:page') onPage(e.data); },
      dispose() { timers.forEach(clearTimeout); timers = []; if (frame) frame.remove(); frame = null; }
    };
  }

  function show(k) {
    const T = global.GeulTune;
    at = Math.max(0, Math.min(PAGES.length - 1, k));
    stop();
    const pg = PAGES[at];
    const ax = T.AXES.find((a) => a.name === pg.axis);
    ui.count.textContent = String(at + 1).padStart(2, '0') + ' / ' + String(PAGES.length).padStart(2, '0');
    ui.title.textContent = pg.axis;
    ui.body.textContent = pg.body;
    ui.tip.textContent = pg.tip;
    ui.axes.forEach((b, i) => { if (i === at) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    if (pg.kind === 'image') {
      cur = imageScene(ax, typeof opts.pick === 'function');
      return;
    }
    const pal = palette();
    const pair = el('div', 'lk-pair lk-' + pg.kind);
    ui.stage.replaceChildren(pair);
    const canPick = typeof opts.pick === 'function';
    const list = ax.words.map((w) => {
      const o = option(w, pg, pal, canPick);
      pair.append(o.art);
      return o;
    });
    /* end: 두 장면이 다 끝나는 때, span: 시간 막대 눈금 길이,
       still: 움직임 줄이기에서 멈춰 둘 순간(물기는 마지막 글자들이 막 나타나는 때, 호흡은 다 쓴 뒤) */
    const end = Math.max(...list.map((o) => o.end));
    let still = end;
    const span = end + 400;
    if (pg.kind === 'wet') still = Math.max(...list.map((o) => o.items[o.items.length - 1].t)) + 400;
    list.forEach((o) => track(o, span, pal));
    cur = { pg, list, loop: end + HOLD + OUT, still };
    mark();
    if (reduce.matches) paint(still);
    else {
      start = performance.now();
      paint(0);
      raf = requestAnimationFrame(frame);
    }
  }

  function focusables() {
    return [...ui.sheet.querySelectorAll('button')].filter((b) => !b.hidden && !b.disabled && b.offsetParent !== null);
  }

  function onKey(e) {
    if (!root || root.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      show(at + (e.key === 'ArrowRight' ? 1 : -1));
    } else if (e.key === 'Tab') {
      const list = focusables();
      if (!list.length) return;
      const i = list.indexOf(doc.activeElement);
      if (i < 0 || (e.shiftKey && i === 0) || (!e.shiftKey && i === list.length - 1)) {
        e.preventDefault();
        list[e.shiftKey ? list.length - 1 : 0].focus();
      }
    }
  }

  /* 심상 장면의 읽기 틀이 보내는 알림 */
  function onMessage(e) {
    if (e.origin === location.origin && e.data && cur && cur.message) cur.message(e);
  }

  function onResize() {
    if (cur && reduce.matches) paint(cur.still);
  }

  function open(o) {
    const T = global.GeulTune;
    if (!T || !global.Geulgyeol) return false;
    opts = o || {};
    moods = T.oneEach(opts.moods || []);
    if (!root) build();
    if (root.hidden) lastFocus = doc.activeElement;
    root.hidden = false;
    const k = PAGES.findIndex((p) => p.axis === opts.axis);
    show(k < 0 ? 0 : k);
    ui.axes[at].focus({ preventScroll: true });
    global.addEventListener('keydown', onKey, true);
    global.addEventListener('message', onMessage);
    global.addEventListener('resize', onResize);
    return true;
  }

  function close() {
    if (!root || root.hidden) return;
    stop();
    cur = null;
    ui.stage.replaceChildren();
    root.hidden = true;
    global.removeEventListener('keydown', onKey, true);
    global.removeEventListener('resize', onResize);
    global.removeEventListener('message', onMessage);
    const shown = (n) => n && n.isConnected && typeof n.focus === 'function' && n.getClientRects().length > 0;
    const back = [doc.getElementById('mood-look'), lastFocus].find(shown);
    if (back) back.focus({ preventScroll: true });
  }

  global.GeulLook = { open, close };
})(window);
