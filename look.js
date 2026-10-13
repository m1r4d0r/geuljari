/*
 * 글결 분위기 살펴보기
 * 편집실 위에 뜨는 판. 심상 세 축(심상·물기·호흡)을 한 장에 한 축씩 보이고, 축의 낱말을 나란히 놓아 그 차이가 움직이는 작은 장면으로 견준다.
 * - 심상: 다섯 벌(빛·바람·물·시간·종이)의 라이트 바탕에서 다크 바탕으로 그 심상의 넘김으로 넘어가는 모습. 바탕은 그 바탕의 빛깔을 닮은 면으로 줄여 그린다.
 * - 물기: 보통 글자가 나타나는 결(번짐·이어 쓰기)과, 강조 글자가 마르는 빠르기.
 * - 호흡: 같은 글을 글 상자 폭만 달리 둔 모습. 긴 폭을 카드 안 폭으로 보고 짧은 폭은 그 비율로 줄인다.
 * 카드 아래 시간 막대에는 글자가 나온 때와 낱말이 바꾸는 시간(나타나는 동안·쉼·마름·넘김)을 두 낱말이 같은 눈금으로 그린다.
 * 시간은 낱말의 조판값(GeulTune.fromMoods)을 엔진(Geulgyeol)에 걸어 짠 실제 시간표를 쓰고, 짠 뒤에는 엔진 값을 되돌린다.
 * 글자 효과의 생김새와 길이는 fx.js와 같고, 넘김 시간은 GeulFlip.timing이 있으면 그것을, 없으면 읽기 틀과 같은 값을 쓴다.
 * 두 장면은 한 시계로 함께 돌고, 다 쓴 뒤 머물렀다가 흐려지며 처음부터 되풀이한다. 장을 넘기거나 다시 열면 처음부터.
 * 움직임 줄이기 설정이면 장면마다 차이가 가장 잘 보이는 한 순간에 멈춰 둔다.
 * open({ moods, pick, axis }): moods는 지금 고른 낱말, pick(list)가 있으면 낱말 쪽을 눌러 축마다 하나씩 고르고
 *   고른 것을 다시 누르면 뺀다(물기·호흡은 늘 하나라 빼지 않는다). axis(축 이름)를 주면 그 장부터 연다. close()로 닫는다.
 * Esc·닫기·바깥 누르기로 닫고, 좌우 방향키로 장을 넘긴다. 닫으면 #mood-look(보이지 않으면 열기 전 자리)으로 초점을 돌려준다.
 * 폰 폭에서는 아래에서 올라오는 판. 전역 GeulLook.
 */
(function (global) {
  'use strict';
  const doc = global.document;

  const LEAD = 300;        // 장면 첫머리의 빈 종이
  const HOLD = 1600;       // 다 쓴 뒤 머무는 시간
  const OUT = 600;         // 되풀이 앞에 흐려지는 시간
  const TURN_WAIT = 400;   // 다 마른 뒤 넘기기까지
  const PAPER = '#ECEDF0';

  /* 장마다 축 하나. text는 엔진 문법 그대로(빈 줄 없는 한 문단), next는 넘어간 다크 쪽에 놓이는 글 */
  const PAGES = [
    {
      axis: '심상', kind: 'image',
      body: '두 장면의 바탕과, 라이트·다크가 바뀌는 쪽에서 넘기는 결을 한 벌로 정해요.',
      tip: '라이트에서 다크로 넘어가는 모습이에요. 시간·종이는 라이트로 돌아올 때 넘김이 달라요.',
      text: '밤이 깊어지면',
      next: '그리고 잉크'
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
  const smooth = (q) => q * q * (3 - 2 * q);
  const pct = (v) => (v * 100).toFixed(3) + '%';

  function el(tag, cls, text) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* 읽기 틀의 장면 바뀌는 넘김과 같은 곡선(motion.js의 swing) */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 6; i++) {
        const err = ((ax * t + bx) * t + cx) * t - x;
        const d = (3 * ax * t + 2 * bx) * t + cx;
        if (Math.abs(err) < 1e-5 || Math.abs(d) < 1e-6) break;
        t -= err / d;
      }
      t = clamp01(t);
      return ((ay * t + by) * t + cy) * t;
    };
  }
  const swing = bezier(0.7, 0, 0.22, 1);

  function turnTiming(mode) {
    const F = global.GeulFlip;
    const t = F && typeof F.timing === 'function' ? F.timing(mode) : null;
    if (t && t.run > 0) return { lead: t.lead || 0, run: t.run, tail: t.tail || 0, ease: typeof t.ease === 'function' ? t.ease : swing };
    return { lead: 170, run: 640, tail: 260, ease: swing };
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

  /* 바탕 이름 → 엔진 이름(lk-g-* 면의 이름) */
  const groundKey = (name) => (global.Geulgyeol && global.Geulgyeol.GROUNDS[name]) || 'plain';

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

    if (pg.kind === 'image') {
      /* 라이트 바탕 면에 쓰고, 다 쓴 뒤 그 심상의 넘김으로 다크 바탕 면으로 넘어간다 */
      const img = m.image;
      day.classList.add('lk-g-' + groundKey(img.day));
      o.dryEnd = o.end;
      o.mode = T.TURNS[img.toNight];
      o.tm = turnTiming(o.mode);
      const night = el('div', 'lk-face night lk-g-' + groundKey(img.night));
      pg.next.split('\n').forEach((line) => night.append(el('div', 'lk-ln', line)));
      o.night = night;
      o.ring = el('i', 'lk-ring');
      o.glint = el('i', 'lk-glint');
      card.append(night, o.ring, o.glint);
    }
    o.render = (t, loop) => {
      anims.forEach((a) => { a.currentTime = t; });
      const k = t > loop - OUT ? clamp01((loop - t) / OUT) : 1;
      day.style.opacity = k < 1 ? k.toFixed(3) : '';
      if (o.night) {
        o.night.style.opacity = k < 1 ? k.toFixed(3) : '';
        turn(o, t);
      }
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

  /*
   * 다크 쪽으로 넘김을 카드 크기로: 쓸기·잠수·해넘이·먹자국은 덮는 가장자리로, 섬광은 하얗게 번쩍이는 사이에, 그 밖은 피어남(바닥 가운데에서 둥글게 부풂)으로 그린다.
   * flip.js처럼 모양은 진행값에 곧게 따르고, 움직임의 결은 timing의 곡선(ease)이 정한다.
   */
  function turn(o, t) {
    const { night, ring, glint, card, tm } = o;
    const p = (t - o.turnAt - tm.lead) / tm.run;
    const q = p <= 0 ? 0 : p >= 1 ? 1 : clamp01(tm.ease(p));
    const W = card.clientWidth;
    const H = card.clientHeight;
    const e = smooth(q);
    const mid = Math.sin(Math.PI * q);
    const moving = q > 0.0005 && q < 0.9995;
    night.style.visibility = q <= 0.0005 ? 'hidden' : 'visible';
    const pc = (v) => (v * 100).toFixed(2) + '%';
    const EDGES = {
      sweep: () => `inset(0 ${pc(1 - q)} 0 0)`,            // 쓸기: 왼쪽에서 오른쪽으로 덮음
      dive: () => `inset(${pc(1 - q)} 0 0 0)`,             // 잠수: 아래에서 물이 차오름
      sunset: () => `inset(0 0 ${pc(1 - q)} 0)`,           // 해넘이: 위에서 어둠이 내려옴
      sunrise: () => `inset(${pc(1 - q)} 0 0 0)`,
      ink: () => `circle(${(Math.hypot(W, H) * 0.62 * q).toFixed(1)}px at 42% 46%)`  // 먹자국: 가운데서 번져 나감
    };
    if (EDGES[o.mode]) {
      night.style.opacity = '';
      night.style.transform = '';
      night.style.clipPath = moving ? EDGES[o.mode]() : '';
      ring.style.opacity = '0';
      glint.style.opacity = '0';
    } else if (o.mode === 'flash') {
      night.style.clipPath = '';
      night.style.opacity = moving ? (q < 0.5 ? '0' : '1') : '';
      glint.style.background = moving ? 'rgba(255,250,240,1)' : '';
      glint.style.opacity = moving ? Math.max(0, 1 - Math.abs(q - 0.5) * 2.6).toFixed(3) : '0';
      ring.style.opacity = '0';
    } else {
      const R = Math.hypot(W, H) * 1.05 * q;
      night.style.opacity = '';
      night.style.clipPath = moving ? `circle(${R.toFixed(1)}px at 50% 100%)` : '';
      night.style.transform = moving ? `scale(${(1.04 - 0.04 * e).toFixed(4)})` : '';
      ring.style.width = ring.style.height = (R * 2).toFixed(1) + 'px';
      ring.style.opacity = moving ? mid.toFixed(3) : '0';
      glint.style.opacity = '0';
    }
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
    if (o.turnAt != null) seg('turn', o.turnAt + o.tm.lead, o.turnAt + o.tm.lead + o.tm.run);
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
    const nav = el('div', 'lk-nav');
    const dots = el('div', 'lk-dots');
    dots.setAttribute('role', 'group');
    dots.setAttribute('aria-label', '분위기 축');
    const prev = el('button', 'lk-btn', '이전');
    prev.type = 'button';
    const next = el('button', 'lk-btn fill', '다음');
    next.type = 'button';
    nav.append(dots, prev, next);
    text.append(top, title, body, tip, nav);
    sheet.append(stage, text);
    root.append(sheet);
    doc.body.append(root);
    ui = { sheet, stage, count, title, body, tip, dots, prev, next };

    x.addEventListener('click', close);
    prev.addEventListener('click', () => show(at - 1));
    next.addEventListener('click', () => { if (at === PAGES.length - 1) close(); else show(at + 1); });
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
    if (cur) cur.list.forEach((o) => o.items.forEach((it) => it.el.getAnimations().forEach((a) => a.cancel())));
  }

  function paint(t) {
    if (cur) cur.list.forEach((o) => o.render(t, cur.loop));
  }

  function frame(now) {
    paint((now - start) % cur.loop);
    raf = requestAnimationFrame(frame);
  }

  function show(k) {
    const T = global.GeulTune;
    at = Math.max(0, Math.min(PAGES.length - 1, k));
    stop();
    const pg = PAGES[at];
    const ax = T.AXES.find((a) => a.name === pg.axis);
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
       still: 움직임 줄이기에서 멈춰 둘 순간(심상은 넘기는 한가운데, 물기는 마지막 글자들이 막 나타나는 때, 호흡은 다 쓴 뒤) */
    let end = Math.max(...list.map((o) => o.end));
    let still = end;
    let span = end + 400;
    if (pg.kind === 'image') {
      const turnAt = Math.max(end, ...list.map((o) => o.dryEnd)) + TURN_WAIT;
      list.forEach((o) => { o.turnAt = turnAt; o.until = turnAt + o.tm.lead + o.tm.run; });
      end = Math.max(...list.map((o) => turnAt + o.tm.lead + o.tm.run + o.tm.tail));
      span = end + 200;
      still = turnAt + list[0].tm.lead + list[0].tm.run * 0.5;
    }
    if (pg.kind === 'wet') still = Math.max(...list.map((o) => o.items[o.items.length - 1].t)) + 400;
    list.forEach((o) => track(o, span, pal));
    cur = { pg, list, loop: end + HOLD + OUT, still };

    ui.count.textContent = String(at + 1).padStart(2, '0') + ' / ' + String(PAGES.length).padStart(2, '0');
    ui.title.textContent = pg.axis;
    ui.body.textContent = pg.body;
    ui.tip.textContent = pg.tip;
    ui.prev.hidden = at === 0;
    ui.next.textContent = at === PAGES.length - 1 ? '다 봤어요' : '다음';
    ui.dots.replaceChildren(...PAGES.map((p, i) => {
      const b = el('button', null, p.axis);
      b.type = 'button';
      b.setAttribute('aria-label', `${i + 1}번째 장: ${p.axis}`);
      if (i === at) b.setAttribute('aria-current', 'step');
      b.addEventListener('click', () => show(i));
      return b;
    }));
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
    ui.next.focus({ preventScroll: true });
    global.addEventListener('keydown', onKey, true);
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
    const shown = (n) => n && n.isConnected && typeof n.focus === 'function' && n.getClientRects().length > 0;
    const back = [doc.getElementById('mood-look'), lastFocus].find(shown);
    if (back) back.focus({ preventScroll: true });
  }

  global.GeulLook = { open, close };
})(window);
