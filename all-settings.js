/*
 * 글결 전체 설정
 * 미리보기 하단바 갈래 판 맨 위의 '전체 설정'으로 여는 창. 모든 쪽에 걸리는 글 전체 조판값을 한곳에서 고른다.
 * - 바탕: 라이트·다크 바탕, 다크로·라이트로 넘어갈 때의 전환, 전환 속도.
 * - 글: 나타나는 결, 속도(쉼·마름이 함께 늘고 줄어듦), 글자 크기, 글 상자 폭, 정렬.
 * 줄마다 이름과 지금 값을 단 단추가 있고, 누르면 하단바처럼 단추에 붙은 판이 펼쳐진다(한 번에 하나, 밖을 누르거나 Esc면 접힘).
 * 판은 고를 낱말 목록이거나 막대 하나. 막대는 끄는 동안 단추의 값만 바꾸고 판은 다시 그리지 않는다.
 * 쪽마다 따로 고른 값(쪽 표시)이 있으면 그 쪽은 그 값을 따른다. 맨 아래에서 그 값들을 한 번에 지울 수 있다.
 * 고르면 바로 편집실의 setSettings로 건다. 전역 GeulAllSettings.
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
    let openKey = null;

    /* 줄 하나: 이름 · 값 단추(누르면 판). spec: {key, name, label, list:[[v, 이름]], now, pick} 또는 {key, name, label, range} */
    function row(spec) {
      const r = el('div', 'as-row');
      const box = el('div', 'as-item');
      const b = el('button', 'as-btn');
      b.type = 'button';
      b.dataset.key = spec.key;
      const label = el('span', 'as-label', spec.label);
      const car = el('i', 'car');
      car.setAttribute('aria-hidden', 'true');
      b.append(label, car);
      const on = openKey === spec.key;
      b.setAttribute('aria-expanded', String(on));
      b.setAttribute('aria-haspopup', spec.range ? 'true' : 'listbox');
      b.classList.toggle('open', on);
      b.addEventListener('click', () => { openKey = on ? null : spec.key; draw(); focusDrop(); });
      box.append(b);
      if (on) box.append(spec.range ? rangeDrop(spec, label) : listDrop(spec));
      r.append(el('span', 'as-name', spec.name), box);
      return r;
    }

    function listDrop(spec) {
      const d = el('div', 'as-drop');
      d.setAttribute('role', 'listbox');
      d.setAttribute('aria-label', spec.name);
      spec.list.forEach(([v, name]) => {
        const on = v === spec.now;
        const o = el('button', 'as-li' + (on ? ' on' : ''), name);
        o.type = 'button';
        o.setAttribute('role', 'option');
        o.setAttribute('aria-selected', String(on));
        o.addEventListener('click', () => {
          openKey = null;
          if (!on) spec.pick(v);
          draw();
          const btn = body.querySelector(`[data-key="${spec.key}"]`);
          if (btn) btn.focus();
        });
        d.append(o);
      });
      return d;
    }

    function rangeDrop(spec, label) {
      const r = spec.range;
      const d = el('div', 'as-drop as-range');
      const input = el('input');
      input.type = 'range';
      input.min = String(r.min);
      input.max = String(r.max);
      input.step = String(r.step);
      input.value = String(r.value);
      input.setAttribute('aria-label', spec.name);
      input.setAttribute('aria-valuetext', r.shown(r.value));
      input.addEventListener('input', () => {
        const v = Number(input.value);
        label.textContent = r.shown(v);
        input.setAttribute('aria-valuetext', r.shown(v));
        r.input(v);
      });
      d.append(el('span', 'k', r.shown(r.min)), input, el('span', 'k', r.shown(r.max)));
      return d;
    }

    function focusDrop() {
      const t = body.querySelector('.as-drop .as-li.on, .as-drop input, .as-drop .as-li');
      if (t) t.focus({ preventScroll: true });
    }

    function section(title, rows) {
      const sec = el('section', 'as-sec');
      sec.append(el('h3', null, title), ...rows.map(row));
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
      const setGround = (scene, v) => ctx.set(scene === s.scene ? { ground: v } : { altGround: v });
      const names = (list) => list.map((v) => [v, v]);
      const w = (v) => (v < 14 ? '저절로' : v + '자');
      const toLight = s.turnLight || s.turn;
      const pct = (v) => Math.round(v * 100) + '%';

      const ground = section('바탕', [
        { key: 'day', name: '라이트 바탕', label: dayGround, list: names(T.GROUNDS['라이트']), now: dayGround, pick: (v) => setGround('라이트', v) },
        { key: 'night', name: '다크 바탕', label: nightGround, list: names(T.GROUNDS['다크']), now: nightGround, pick: (v) => setGround('다크', v) },
        { key: 'turn', name: '다크로 넘어갈 때', label: s.turn, list: names(T.SCENE_TURNS), now: s.turn, pick: (v) => ctx.set({ turn: v }) },
        { key: 'turnLight', name: '라이트로 넘어갈 때', label: toLight, list: names(T.SCENE_TURNS), now: toLight, pick: (v) => ctx.set({ turnLight: v }) },
        { key: 'turnSpeed', name: '전환 속도', label: times(s.turnSpeed), range: { min: 0.6, max: 1.6, step: 0.05, value: s.turnSpeed, shown: times, input: (v) => ctx.set({ turnSpeed: v }) } }
      ]);
      const text = section('글', [
        { key: 'flow', name: '나타나는 결', label: s.flow, list: names(T.FLOW_NAMES), now: s.flow, pick: (v) => ctx.set({ flow: v }) },
        { key: 'speed', name: '속도', label: times(s.speed), range: { min: 0.5, max: 1.6, step: 0.05, value: s.speed, shown: times, input: (v) => ctx.set({ speed: v }) } },
        { key: 'size', name: '글자 크기', label: pct(s.size), range: { min: 0.8, max: 1.5, step: 0.05, value: s.size, shown: pct, input: (v) => ctx.set({ size: v }) } },
        { key: 'measure', name: '글 상자 폭', label: w(s.measure || 12), range: { min: 12, max: 44, step: 1, value: s.measure || 12, shown: w, input: (v) => ctx.set({ measure: v < 14 ? 0 : v }) } },
        { key: 'align', name: '정렬', label: s.align, list: names(T.ALIGN_NAMES), now: s.align, pick: (v) => ctx.set({ align: v }) }
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

    /* 판 밖을 누르면 접고, Esc는 창보다 판을 먼저 접는다 */
    dialog.addEventListener('pointerdown', (e) => {
      if (openKey && !e.target.closest('.as-item')) { openKey = null; draw(); }
    });
    let shut = 0;
    dialog.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !openKey) return;
      e.preventDefault();
      shut = Date.now();
      const key = openKey;
      openKey = null;
      draw();
      const b = body.querySelector(`[data-key="${key}"]`);
      if (b) b.focus();
    });
    dialog.addEventListener('cancel', (e) => { if (openKey || Date.now() - shut < 200) e.preventDefault(); });

    function open() {
      openKey = null;
      draw();
      dialog.showModal();
    }

    return { open, draw, close: () => dialog.close() };
  }

  global.GeulAllSettings = { mount, PAGE_KEYS };
})(typeof window !== 'undefined' ? window : globalThis);
