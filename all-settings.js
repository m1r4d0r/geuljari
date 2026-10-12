/*
 * 글결 전체 설정
 * 미리보기 하단바 갈래 판 맨 위의 '전체 설정'으로 여는 창. 모든 쪽에 걸리는 글 전체 조판값을 한곳에서 고른다.
 * - 바탕: 시작 장면, 라이트·다크 바탕, 다크로·라이트로 넘어갈 때의 전환, 전환 속도.
 * - 글: 나타나는 결, 마름, 속도, 쉼, 글자 크기, 글 상자 폭, 정렬.
 * 쪽마다 따로 고른 값(쪽 표시)이 있으면 그 쪽은 그 값을 따른다. 맨 아래에서 그 값들을 한 번에 지울 수 있다.
 * 고르면 바로 편집실의 setSettings로 건다. 막대는 끄는 동안 이름 옆 값만 바꾸고 판은 다시 그리지 않는다.
 * 전역 GeulAllSettings.
 */
(function (global) {
  'use strict';
  const T = global.GeulTune;
  const S = global.GeulSense;

  /* 쪽마다 따로 고를 수 있는 값(지우기에서 걷는 것). 장면·바탕은 반전이라 남긴다 */
  const PAGE_KEYS = ['turn', 'turnSpeed', 'flow', 'speed', 'size', 'measure', 'align'];

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const times = (v) => (Math.round(v * 100) / 100).toFixed(2).replace(/0$/, '') + '×';

  /*
   * dialog: <dialog> 요소, body: 줄을 그릴 칸
   * ctx: settings() 지금 조판값, set(part) 조판값 바꾸기, get() 본문, setText(text) 본문 바꾸기, pages() 글 쪽 수
   */
  function mount(dialog, body, ctx) {
    function rowOf(name, control) {
      const r = el('div', 'as-row');
      const k = el('span', 'as-name', name);
      r.append(k, control);
      return r;
    }

    function choice(name, list, now, pick) {
      const box = el('div', 'as-opts');
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', name);
      list.forEach(([v, label]) => {
        const b = el('button', 'as-opt', label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(v === now));
        b.addEventListener('click', () => { if (v !== now) { pick(v); draw(); } });
        box.append(b);
      });
      return rowOf(name, box);
    }

    function range(name, r) {
      const box = el('div', 'as-range');
      const out = el('span', 'as-val', r.shown(r.value));
      const input = el('input');
      input.type = 'range';
      input.min = String(r.min);
      input.max = String(r.max);
      input.step = String(r.step);
      input.value = String(r.value);
      input.setAttribute('aria-label', name);
      input.setAttribute('aria-valuetext', r.shown(r.value));
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = r.shown(v);
        input.setAttribute('aria-valuetext', r.shown(v));
        r.input(v);
      });
      box.append(input, out);
      return rowOf(name, box);
    }

    function section(title, rows) {
      const sec = el('section', 'as-sec');
      sec.append(el('h3', null, title), ...rows);
      return sec;
    }

    /* 쪽마다 따로 고른 값이 몇 곳인지 */
    function marked() {
      const t = ctx.get();
      const n = ctx.pages();
      let c = 0;
      for (let k = 0; k < n; k++) PAGE_KEYS.forEach((key) => { if (S.pageMark(t, k, key) != null) c++; });
      return c;
    }

    function clearMarks() {
      let t = ctx.get();
      const n = ctx.pages();
      for (let k = 0; k < n; k++) PAGE_KEYS.forEach((key) => { if (S.pageMark(t, k, key) != null) t = S.setPageMark(t, k, key, null); });
      ctx.setText(t);
      draw();
    }

    function draw() {
      const s = ctx.settings();
      const light = s.scene === '라이트';
      const dayGround = light ? s.ground : (s.altGround || T.GROUNDS['라이트'][0]);
      const nightGround = light ? (s.altGround || T.GROUNDS['다크'][0]) : s.ground;
      const setGround = (scene, v) => ctx.set((scene === s.scene) ? { ground: v } : { altGround: v });
      const names = (list) => list.map((v) => [v, v]);
      const w = (v) => (v < 14 ? '저절로' : v + '자');

      const ground = section('바탕', [
        choice('시작 장면', names(Object.keys(T.GROUNDS)), s.scene, (v) => ctx.set({ scene: v })),
        choice('라이트 바탕', names(T.GROUNDS['라이트']), dayGround, (v) => setGround('라이트', v)),
        choice('다크 바탕', names(T.GROUNDS['다크']), nightGround, (v) => setGround('다크', v)),
        choice('다크로 넘어갈 때', names(T.SCENE_TURNS), s.turn, (v) => ctx.set({ turn: v })),
        choice('라이트로 넘어갈 때', [['', '같게'], ...names(T.SCENE_TURNS)], s.turnLight, (v) => ctx.set({ turnLight: v })),
        range('전환 속도', { min: 0.6, max: 1.6, step: 0.05, value: s.turnSpeed, shown: times, input: (v) => ctx.set({ turnSpeed: v }) })
      ]);
      const text = section('글', [
        choice('나타나는 결', names(T.FLOW_NAMES), s.flow, (v) => ctx.set({ flow: v })),
        choice('마름', names(T.DRY_NAMES), s.dry, (v) => ctx.set({ dry: v })),
        range('속도', { min: 0.5, max: 1.6, step: 0.05, value: s.speed, shown: times, input: (v) => ctx.set({ speed: v }) }),
        choice('쉼', T.REST_NAMES.map((v, i) => [i, v]), s.rest, (v) => ctx.set({ rest: v })),
        range('글자 크기', { min: 0.8, max: 1.5, step: 0.05, value: s.size, shown: (v) => Math.round(v * 100) + '%', input: (v) => ctx.set({ size: v }) }),
        range('글 상자 폭', { min: 12, max: 44, step: 1, value: s.measure || 12, shown: w, input: (v) => ctx.set({ measure: v < 14 ? 0 : v }) }),
        choice('정렬', names(T.ALIGN_NAMES), s.align, (v) => ctx.set({ align: v }))
      ]);
      const foot = el('div', 'as-foot');
      const n = marked();
      if (n) {
        const b = el('button', 'link', `쪽마다 따로 고른 값 ${n}곳 지우기`);
        b.type = 'button';
        b.addEventListener('click', clearMarks);
        foot.append(b);
      } else foot.append(el('span', 'as-none', '쪽마다 따로 고른 값은 없어요.'));
      body.replaceChildren(ground, text, foot);
    }

    function open() {
      draw();
      dialog.showModal();
    }

    return { open, draw, close: () => dialog.close() };
  }

  global.GeulAllSettings = { mount, PAGE_KEYS };
})(typeof window !== 'undefined' ? window : globalThis);
