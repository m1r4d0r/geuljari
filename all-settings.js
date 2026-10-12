/*
 * 글결 전체 설정
 * 미리보기 하단바 갈래 판 맨 위의 '전체 설정'으로 여는 창. 모든 쪽에 걸리는 글 전체 조판값을 한곳에서 고른다.
 * 머리 줄 아래 선의 오른쪽 끝에 색인 탭이 붙어 갈래를 바꾼다(처음에는 하단바의 지금 갈래).
 * - 바탕: 라이트·다크 바탕, 다크로·라이트로 넘어갈 때의 전환, 맨 아래에 전환 속도 막대.
 * - 글: 나타나는 결, 글자 크기, 글 상자 폭, 정렬, 맨 아래에 속도 막대(쉼·마름이 함께 늘고 줄어듦).
 * 칸마다 이름 아래 지금 값을 단 단추가 있고, 누르면 하단바처럼 단추에 붙은 판이 다른 칸 위로 잠깐 덮인다
 * (한 번에 하나, 고르거나 밖을 누르거나 Esc면 접힘, 아래 자리가 모자라면 위로 펼침). 속도 막대는 두 칸 폭으로 늘 펼쳐 둔다.
 * 선 아래 줄에는 지금 쪽의 '따로' 스위치: 하단바에서 그 쪽에 값을 고르면 켜지고, 끄면 그 쪽도 전체 설정을 따른다.
 * 켜져 있으면 그 쪽이 따로 정한 것을 한 줄로 적는다.
 * 고르면 미리보기에 바로 걸어 보이고, 저장하면 남기고, 취소(Esc)하면 창을 열 때로 되돌린다.
 * 전체 초기화는 전체 값을 분위기에서 정해진 값으로 돌리고 모든 쪽에 따로 고른 값을 걷는다. 전역 GeulAllSettings.
 */
(function (global) {
  'use strict';
  const T = global.GeulTune;
  const S = global.GeulSense;

  /* 쪽마다 따로 고를 수 있는 값(스위치·초기화에서 걷는 것). 장면·바탕은 반전이라 남긴다 */
  const PAGE_KEYS = ['turn', 'turnSpeed', 'flow', 'speed', 'size', 'measure', 'align'];
  const PAGE_NAMES = { turn: '전환', turnSpeed: '전환 속도', flow: '나타나는 결', speed: '속도', size: '글자 크기', measure: '글 상자 폭', align: '정렬' };

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  /* 받침이 있으면 '을', 없으면 '를' */
  const eul = (w) => { const c = w.charCodeAt(w.length - 1) - 0xAC00; return c >= 0 && c < 11172 && c % 28 ? '을' : '를'; };
  const times = (v) => (Math.round(v * 100) / 100).toFixed(2).replace(/0$/, '') + '×';

  /*
   * dialog: <dialog> 요소(안에 [data-tab] 탭 단추, .as-page 쪽 줄, .as-reset·.as-cancel·.as-save 단추), body: 칸을 그릴 자리
   * ctx: settings() 지금 조판값, set(part) 조판값 바꾸기, get() 본문, setText(text) 본문 바꾸기, pages() 글 쪽 수,
   *      page() 지금 쪽(0부터, 끝 장이면 null), restore(snap) 연 때의 {settings, source}로 되돌리기, reset(text) 본문을 text로 하고 전체 값을 처음으로
   */
  function mount(dialog, body, ctx) {
    const tabs = [...dialog.querySelectorAll('[data-tab]')];
    const pageRow = dialog.querySelector('.as-page');
    let tab = 'ground';
    let openKey = null;
    let snap = null;
    let kept = {};
    let saved = false;

    /* 칸 하나: 이름 · 값 단추(누르면 판). spec: {key, name, label, list:[[v, 이름]], now, pick} 또는 {key, name, label, range} */
    function cell(spec) {
      const c = el('div', 'as-cell');
      const id = 'as-name-' + spec.key;
      const name = el('span', 'as-name', spec.name);
      name.id = id;
      const box = el('div', 'as-item');
      const b = el('button', 'as-btn');
      b.type = 'button';
      b.dataset.key = spec.key;
      b.setAttribute('aria-labelledby', id + ' ' + id + '-v');
      const label = el('span', 'as-label', spec.label);
      label.id = id + '-v';
      const car = el('i', 'car');
      car.setAttribute('aria-hidden', 'true');
      b.append(label, car);
      const on = openKey === spec.key;
      b.setAttribute('aria-expanded', String(on));
      b.setAttribute('aria-haspopup', spec.range ? 'true' : 'listbox');
      b.classList.toggle('open', on);
      b.addEventListener('click', () => { openKey = on ? null : spec.key; draw(); place(); focusDrop(); });
      box.append(b);
      if (on) box.append(spec.range ? rangeDrop(spec, label) : listDrop(spec));
      c.append(name, box);
      return c;
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

    function slider(r, name, onShown) {
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
        input.setAttribute('aria-valuetext', r.shown(v));
        onShown(r.shown(v));
        r.input(v);
      });
      return input;
    }

    function rangeDrop(spec, label) {
      const r = spec.range;
      const d = el('div', 'as-drop as-range');
      d.append(el('span', 'k', r.shown(r.min)), slider(r, spec.name, (t) => { label.textContent = t; }), el('span', 'k', r.shown(r.max)));
      return d;
    }

    /* 두 칸 폭으로 늘 펼친 막대: 이름과 지금 값이 한 줄, 그 아래 막대 */
    function wideRange(spec) {
      const c = el('div', 'as-cell as-wide');
      const top = el('div', 'as-wide-top');
      const v = el('span', 'as-val', spec.range.shown(spec.range.value));
      top.append(el('span', 'as-name', spec.name), v);
      const row = el('div', 'as-slide');
      const r = spec.range;
      row.append(el('span', 'k', r.shown(r.min)), slider(r, spec.name, (t) => { v.textContent = t; }), el('span', 'k', r.shown(r.max)));
      c.append(top, row);
      return c;
    }

    /* 펼친 판이 화면 아래로 넘치면 단추 위로 펼친다 */
    function place() {
      const d = body.querySelector('.as-drop');
      if (!d) return;
      const btn = d.previousElementSibling.getBoundingClientRect();
      const h = d.offsetHeight;
      const up = btn.bottom + h > window.innerHeight - 8 && btn.top - h > 8;
      d.classList.toggle('up', up);
      d.previousElementSibling.classList.toggle('up', up);
    }

    function focusDrop() {
      const t = body.querySelector('.as-drop .as-li.on, .as-drop input, .as-drop .as-li');
      if (t) t.focus({ preventScroll: true });
    }

    /* 쪽 k에 따로 적힌 값 {key: 값} */
    function own(text, k) {
      const o = {};
      PAGE_KEYS.forEach((key) => { const v = S.pageMark(text, k, key); if (v != null) o[key] = v; });
      return o;
    }

    function writeMarks(text, k, marks) {
      let t = text;
      PAGE_KEYS.forEach((key) => { if (S.pageMark(t, k, key) != (marks[key] ?? null)) t = S.setPageMark(t, k, key, marks[key] ?? null); });
      return t;
    }

    /* 스위치: 끄면 그 쪽의 따로 고른 값을 걷고, 다시 켜면 창을 열 때 있던 값을 돌려놓는다 */
    function toggle(k) {
      const now = own(ctx.get(), k);
      ctx.setText(writeMarks(ctx.get(), k, Object.keys(now).length ? {} : kept));
      draw();
    }

    function drawPage() {
      const k = ctx.page();
      pageRow.replaceChildren();
      if (k == null) { pageRow.append(el('span', 'as-note', '모든 쪽에 같이 걸려요.')); return; }
      const keys = Object.keys(own(ctx.get(), k));
      const on = keys.length > 0;
      const list = keys.map((key) => PAGE_NAMES[key]).join('·');
      const note = on ? `${k + 1}쪽은 ${list}${eul(list)} 따로 정했어요.` : `${k + 1}쪽도 이 값을 따라요.`;
      const sw = el('button', 'as-switch');
      sw.type = 'button';
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-checked', String(on));
      sw.disabled = !on && !Object.keys(kept).length;
      const knob = el('i');
      knob.setAttribute('aria-hidden', 'true');
      sw.append(el('span', null, `${k + 1}쪽 따로`), knob);
      sw.addEventListener('click', () => { toggle(k); const b = pageRow.querySelector('.as-switch'); if (b) b.focus(); });
      pageRow.append(el('span', 'as-note' + (on ? ' on' : ''), note), sw);
    }

    function cells() {
      const s = ctx.settings();
      const names = (list) => list.map((v) => [v, v]);
      if (tab === 'ground') {
        const light = s.scene === '라이트';
        const dayGround = light ? s.ground : (s.altGround || T.GROUNDS['라이트'][0]);
        const nightGround = light ? (s.altGround || T.GROUNDS['다크'][0]) : s.ground;
        const setGround = (scene, v) => ctx.set(scene === s.scene ? { ground: v } : { altGround: v });
        const toLight = s.turnLight || s.turn;
        return [
          { key: 'day', name: '라이트 바탕', label: dayGround, list: names(T.GROUNDS['라이트']), now: dayGround, pick: (v) => setGround('라이트', v) },
          { key: 'night', name: '다크 바탕', label: nightGround, list: names(T.GROUNDS['다크']), now: nightGround, pick: (v) => setGround('다크', v) },
          { key: 'turn', name: '다크로 넘어갈 때', label: s.turn, list: names(T.SCENE_TURNS), now: s.turn, pick: (v) => ctx.set({ turn: v }) },
          { key: 'turnLight', name: '라이트로 넘어갈 때', label: toLight, list: names(T.SCENE_TURNS), now: toLight, pick: (v) => ctx.set({ turnLight: v }) },
          { key: 'turnSpeed', name: '전환 속도', wide: true, range: { min: 0.6, max: 1.6, step: 0.05, value: s.turnSpeed, shown: times, input: (v) => ctx.set({ turnSpeed: v }) } }
        ];
      }
      const w = (v) => (v < 14 ? '저절로' : v + '자');
      const pct = (v) => Math.round(v * 100) + '%';
      return [
        { key: 'flow', name: '나타나는 결', label: s.flow, list: names(T.FLOW_NAMES), now: s.flow, pick: (v) => ctx.set({ flow: v }) },
        { key: 'size', name: '글자 크기', label: pct(s.size), range: { min: 0.8, max: 1.5, step: 0.05, value: s.size, shown: pct, input: (v) => ctx.set({ size: v }) } },
        { key: 'measure', name: '글 상자 폭', label: w(s.measure || 12), range: { min: 12, max: 44, step: 1, value: s.measure || 12, shown: w, input: (v) => ctx.set({ measure: v < 14 ? 0 : v }) } },
        { key: 'align', name: '정렬', label: s.align, list: names(T.ALIGN_NAMES), now: s.align, pick: (v) => ctx.set({ align: v }) },
        { key: 'speed', name: '속도', wide: true, range: { min: 0.5, max: 1.6, step: 0.05, value: s.speed, shown: times, input: (v) => ctx.set({ speed: v }) } }
      ];
    }

    function draw() {
      tabs.forEach((t) => {
        const on = t.dataset.tab === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
      const grid = el('div', 'as-grid');
      cells().forEach((spec) => grid.append(spec.wide ? wideRange(spec) : cell(spec)));
      body.replaceChildren(grid);
      drawPage();
    }

    /* 전체 값을 분위기에서 정해진 값으로, 모든 쪽의 따로 고른 값은 걷는다(취소하면 돌아옴) */
    function reset() {
      let t = ctx.get();
      const n = ctx.pages();
      for (let k = 0; k < n; k++) t = writeMarks(t, k, {});
      openKey = null;
      ctx.reset(t);
      draw();
    }

    tabs.forEach((t) => {
      t.addEventListener('click', () => { if (tab !== t.dataset.tab) { tab = t.dataset.tab; openKey = null; draw(); } });
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const k = (tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        tab = tabs[k].dataset.tab;
        openKey = null;
        draw();
        tabs[k].focus();
      });
    });

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
    /* 저장하지 않고 닫히면(취소·Esc) 연 때로 되돌린다 */
    dialog.addEventListener('close', () => {
      const s = snap;
      snap = null;
      if (saved || !s) return;
      if (JSON.stringify(ctx.settings()) !== JSON.stringify(s.settings) || ctx.get() !== s.source) ctx.restore(s);
    });
    dialog.querySelector('.as-reset').addEventListener('click', reset);
    dialog.querySelector('.as-cancel').addEventListener('click', () => dialog.close());
    dialog.querySelector('.as-save').addEventListener('click', () => { saved = true; dialog.close(); });

    /* which: 'ground' | 'text'(하단바의 지금 갈래) */
    function open(which) {
      tab = which === 'text' ? 'text' : 'ground';
      openKey = null;
      saved = false;
      snap = { settings: Object.assign({}, ctx.settings()), source: ctx.get() };
      const k = ctx.page();
      kept = k == null ? {} : own(snap.source, k);
      draw();
      dialog.showModal();
    }

    return { open, draw, close: () => dialog.close() };
  }

  global.GeulAllSettings = { mount, PAGE_KEYS };
})(typeof window !== 'undefined' ? window : globalThis);
