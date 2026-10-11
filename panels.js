/*
 * 글결 미리보기 하단바(쪽 다듬기)
 * 미리보기 아래 한 줄에 갈래 단추 하나와 그 갈래의 값 단추들을 둔다. 값 단추를 누르면 같은 폭의 판이 단추에 붙어 펼쳐지고
 * (PC는 위로, 폰은 오른쪽으로 한 줄), 한 번에 하나만 열린다. 지금 값이 단추에서 가장 가깝다.
 * - 바탕: 지금 쪽의 장면(라이트·다크, 둘째 쪽부터는 그 쪽부터 반전)·바탕·전환(이 쪽으로 넘어올 때).
 * - 움직임: 나타나는 결·속도·쉼·마름. '다시 보기'를 눌러야 움직임으로 보인다.
 * - 글씨: 글 자리(지금 쪽)·글꼴·크기·정렬·글 상자 폭(PC). 다시 쓰지 않고 바로 바뀐다.
 * - 끝 장에 있으면 갈래가 끝 장(장면·바탕)과 카드(크기·폭·정렬·편집 제목으로)로 바뀐다.
 * - 글 상자를 두 번 눌러 고치는 동안에는 '고른 곳' 갈래: 강조(등장·머묾)·퇴장·꾸밈·색·빼기. 고르기 전에는 흐리게 쉰다.
 * 빈 바탕을 누르면 '바탕', 글 상자를 누르면 '글씨' 갈래가 먼저 열린다(hint).
 * 편집 단계의 하단바(mountWrite)도 같은 한 줄 모양(bar)을 쓴다: 분위기·테마·글. 전역 GeulPanels.
 */
(function (global) {
  'use strict';
  const E = global.Geulgyeol;
  const T = global.GeulTune;
  const S = global.GeulSense;
  const SCENE_WORD = { day: '라이트', night: '다크' };
  const groundName = (g) => Object.keys(E.GROUNDS).find((k) => E.GROUNDS[k] === g) || g;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  const CATS = { ground: '바탕', motion: '움직임', type: '글씨', end: '끝 장', card: '카드' };
  const CARD_ALIGN = { left: '왼쪽', center: '가운데', right: '오른쪽' };
  const opt = (v, label, extra) => Object.assign({ v, label: label == null ? String(v) : label }, extra);
  const num = (v) => (Math.round(v * 100) / 100).toFixed(Math.round(v * 100) % 10 ? 2 : 1);

  /*
   * 하단바 한 줄: 갈래 단추(또는 멈춘 이름)와 값 단추들, 값 단추마다 같은 폭의 판. 한 번에 하나만 열린다.
   * model: head() 갈래 단추 {key, title, label, current, options, pick} 또는 {still: 이름}, vals() 값 단추 목록,
   *        name() 지금 갈래 이름, before() 그리기 전에 갈래 고치기, changed() 그린 뒤, drop 판 id 머리(기본 tb-drop-)
   * 값 단추: {key, title, label, current, options, pick} 판, {range} 막대, {act} 바로 하는 단추, {node} 늘 같은 단추
   */
  function bar(root, model) {
    let openKey = null;

    function caret() { const c = el('i', 'car'); c.setAttribute('aria-hidden', 'true'); return c; }

    /* 지금 값이 단추에서 가장 가깝게: 지금 값이 든 무리를 먼저, 무리 안에서도 지금 값을 먼저 */
    function ordered(spec) {
      const isOn = (o) => (spec.multi ? false : o.v === spec.current);
      const names = [];
      spec.options.forEach((o) => { if (!names.includes(o.group || null)) names.push(o.group || null); });
      const lists = names.map((g) => ({ g, items: spec.options.filter((o) => (o.group || null) === g) }));
      lists.forEach((l) => { const i = l.items.findIndex(isOn); if (i > 0) l.items.unshift(...l.items.splice(i, 1)); });
      const j = lists.findIndex((l) => l.items.some(isOn));
      if (j > 0) lists.unshift(...lists.splice(j, 1));
      return lists;
    }

    function listDrop(spec, id) {
      const d = el('div', 'tb-drop');
      d.id = id;
      d.setAttribute('role', 'listbox');
      d.setAttribute('aria-label', spec.title);
      if (spec.multi) d.setAttribute('aria-multiselectable', 'true');
      ordered(spec).forEach((l) => {
        const g = el('div', 'tb-grp');
        g.setAttribute('role', 'group');
        l.items.forEach((o) => {
          if (o.picker) { g.append(pickerItem(spec, o)); return; }
          const on = spec.multi ? spec.current.includes(o.v) : o.v === spec.current;
          const b = el('button', 'tb-li' + (on ? ' on' : '') + (o.cls ? ' ' + o.cls : ''), o.label);
          b.type = 'button';
          b.setAttribute('role', 'option');
          b.setAttribute('aria-selected', String(on));
          if (o.font) b.style.fontFamily = `${o.font}, var(--f-body)`;
          if (o.swatch || o.color) { const sw = el('i', 'tb-sw' + (o.swatch ? ' c-' + o.swatch : '')); if (o.color) sw.style.background = o.color; sw.setAttribute('aria-hidden', 'true'); b.prepend(sw); }
          b.addEventListener('click', () => {
            if (!spec.multi) openKey = null;
            spec.pick(o.v);
            render();
          });
          g.append(b);
        });
        if (l.g) { g.setAttribute('aria-label', l.g); g.append(el('span', 'tb-gname', l.g)); }
        d.append(g);
      });
      d.append(el('span', 'tb-ttl', spec.title));
      return d;
    }

    /* 직접 고르는 색: 끄는 동안은 그 자리에서 바로 걸고, 다 고르면 다시 그린다 */
    function pickerItem(spec, o) {
      const lab = el('label', 'tb-li tb-picker' + (o.on ? ' on' : ''));
      const sw = el('i', 'tb-sw');
      sw.setAttribute('aria-hidden', 'true');
      sw.style.background = o.value;
      const input = el('input');
      input.type = 'color';
      input.value = o.value;
      input.setAttribute('aria-label', o.label);
      input.addEventListener('input', () => { sw.style.background = input.value; spec.pick(input.value); });
      input.addEventListener('change', () => render());
      lab.append(sw, o.label, input);
      return lab;
    }

    function rangeDrop(spec, id, btn) {
      const r = spec.range;
      const d = el('div', 'tb-drop tb-range');
      d.id = id;
      d.setAttribute('role', 'group');
      d.setAttribute('aria-label', spec.title);
      const input = el('input');
      input.type = 'range';
      input.min = String(r.min);
      input.max = String(r.max);
      input.step = String(r.step);
      input.value = String(r.value);
      input.setAttribute('aria-label', spec.title);
      input.setAttribute('aria-valuetext', r.shown(r.value));
      input.addEventListener('input', () => {
        const v = Number(input.value);
        input.setAttribute('aria-valuetext', r.shown(v));
        btn.querySelector('.tb-label').textContent = r.label(v);
        r.input(v);
      });
      d.append(el('span', 'k', r.shown(r.min)), input, el('span', 'k', r.shown(r.max)), el('span', 'tb-ttl', spec.title));
      return d;
    }

    function item(spec, isCat) {
      const box = el('div', 'tb-item' + (isCat ? ' tb-cat-item' : ''));
      /* 늘 같은 단추(편집실이 만들고 다른 코드가 붙잡고 있음)는 그대로 옮겨 단다 */
      if (spec.node) { box.append(spec.node); return box; }
      const id = (model.drop || 'tb-drop-') + spec.key;
      const b = el('button', isCat ? 'tb-cat' : spec.act ? 'tb-val tb-act' : 'tb-val');
      b.type = 'button';
      b.dataset.key = spec.key;
      const label = el('span', 'tb-label', spec.label);
      if (spec.font) label.style.fontFamily = `${spec.font}, var(--f-body)`;
      b.append(label);
      if (spec.off) b.disabled = true;
      if (spec.act) {
        b.addEventListener('click', () => { openKey = null; spec.act(); render(); });
        box.append(b);
        return box;
      }
      b.append(caret());
      const on = openKey === spec.key;
      b.setAttribute('aria-expanded', String(on));
      b.setAttribute('aria-controls', id);
      b.setAttribute('aria-haspopup', isCat ? 'menu' : 'listbox');
      b.classList.toggle('open', on);
      b.addEventListener('click', () => { openKey = openKey === spec.key ? null : spec.key; render(); focusDrop(); });
      box.append(b);
      if (on) box.append(spec.range ? rangeDrop(spec, id, b) : listDrop(spec, id));
      return box;
    }

    function focusDrop() {
      const d = root.querySelector('.tb-drop');
      if (!d) return;
      const t = d.querySelector('.tb-li.on, input, .tb-li');
      if (t) t.focus({ preventScroll: true });
    }

    function render() {
      if (model.before) model.before();
      const list = model.vals();
      const head = model.head();
      if (openKey && openKey !== 'cat' && !list.some((v) => v.key === openKey && !v.act && !v.node && !v.off)) openKey = null;
      if (head.still && openKey === 'cat') openKey = null;
      root.replaceChildren();
      if (head.still) {
        const c = el('span', 'tb-cat tb-cat-still', head.still);
        c.setAttribute('role', 'status');
        const box = el('div', 'tb-item tb-cat-item');
        box.append(c);
        root.append(box);
      } else root.append(item(head, true));
      root.append(el('span', 'tb-sep'));
      const row = el('div', 'tb-vals');
      list.forEach((v) => row.append(item(v)));
      root.append(row);
      root.dataset.cat = model.name();
      root.classList.toggle('cat-open', openKey === 'cat');
      root.classList.toggle('is-open', !!openKey);
      if (model.changed) model.changed();
    }

    /* 펼친 판 밖을 누르면 접는다 */
    document.addEventListener('pointerdown', (e) => {
      if (openKey && !root.contains(e.target)) { openKey = null; render(); }
    });
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !openKey) return;
      e.preventDefault();
      e.stopPropagation();
      const key = openKey;
      openKey = null;
      render();
      const b = root.querySelector(`[data-key="${key}"]`);
      if (b) b.focus();
    });

    return {
      render,
      refresh() {
        /* 속도·크기를 끄는 중에는 다시 그리지 않는다(끄는 손을 놓치지 않게) */
        const a = document.activeElement;
        if (a && a.type === 'range' && root.contains(a)) return;
        render();
      },
      shut() { openKey = null; },
      close() { if (!openKey) return false; openKey = null; render(); return true; },
      open: () => openKey
    };
  }

  /*
   * root: 하단바의 왼쪽 칸(갈래와 값 단추가 들어갈 자리)
   * ctx: get() 본문, set(text) 본문 바꾸기, head(), settings(), setSettings(part), page() 지금 쪽(0부터),
   *      show(start) 다 쓴 모습으로 바로 보이기, wide() 넓은 틀(PC)을 보고 있는지, atEnd() 끝 장에 있는지,
   *      ending() 끝 장의 {scene, ground, text, size, width, align…}, setEnding(part) 끝 장의 장면·바탕 바꾸기(그 화면을 다시 보인다),
   *      setCard(part) 카드 문구·배치 바꾸기(다시 그리지 않음), ip(cmd) 고치는 중인 글 상자에 고른 것을 보내기
   */
  function mount(root, ctx) {
    let cat = 'ground';
    let edit = null;
    let onState = () => {};

    function pages() { return E.pages(E.parse(ctx.head() + ctx.get())); }

    /* ---------- 갈래마다 값 단추 ---------- */

    function groundVals() {
      const all = pages();
      const k = Math.min(ctx.page(), all.length - 1);
      const pg = all[k];
      const before = all[k - 1];
      const sceneName = SCENE_WORD[pg.scene];
      const st = ctx.settings();
      const vals = [{
        key: 'scene', title: '장면', label: sceneName, current: sceneName,
        options: Object.keys(T.GROUNDS).map((v) => opt(v)),
        pick(v) {
          if (v === sceneName) return;
          if (k === 0) { ctx.setSettings({ scene: v }); return; }
          let t = ctx.get();
          if (v === SCENE_WORD[before.scene]) {
            t = S.setPageMark(t, k, 'scene', null);
            t = S.setPageMark(t, k, 'ground', null);
          } else t = S.setPageMark(t, k, 'scene', v);
          ctx.set(t);
          ctx.show({ page: k - 1, done: true, next: true });
        }
      }, {
        key: 'ground', title: '바탕', label: '바탕 ' + groundName(pg.ground), current: groundName(pg.ground),
        options: T.GROUNDS[sceneName].map((v) => opt(v)),
        pick(v) {
          if (k === 0) { ctx.setSettings({ ground: v }); return; }
          ctx.set(S.setPageMark(ctx.get(), k, 'ground', v));
          ctx.show({ page: k, done: true });
        }
      }];
      if (k > 0) {
        const fallback = pg.scene !== before.scene ? st.turn : '스밈';
        const turn = S.pageMark(ctx.get(), k, 'turn') || fallback;
        vals.push({
          key: 'turn', title: '전환', label: '전환 ' + turn, current: turn,
          options: T.TURN_NAMES.map((v) => opt(v)),
          pick(v) {
            ctx.set(S.setPageMark(ctx.get(), k, 'turn', v === fallback ? null : v));
            ctx.show({ page: k - 1, done: true, next: true });
          }
        });
      }
      return vals;
    }

    function motionVals() {
      const st = ctx.settings();
      return [{
        key: 'flow', title: '나타나는 결', label: st.flow, current: st.flow,
        options: T.FLOW_NAMES.map((v) => opt(v)),
        pick: (v) => ctx.setSettings({ flow: v })
      }, {
        key: 'speed', title: '속도', label: `속도 ${num(st.speed)}×`, range: {
          min: 0.8, max: 1.3, step: 0.05, value: Math.min(1.3, Math.max(0.8, st.speed)),
          shown: (v) => `${num(v)}×`, label: (v) => `속도 ${num(v)}×`, input: (v) => ctx.setSettings({ speed: v })
        }
      }, {
        key: 'rest', title: '띄어 쓴 쉼', label: '쉼 ' + T.REST_NAMES[st.rest], current: st.rest,
        options: T.REST_NAMES.map((n, i) => opt(i, n)),
        pick: (v) => ctx.setSettings({ rest: v })
      }, {
        key: 'dry', title: '마름', label: '마름 ' + st.dry, current: st.dry,
        options: T.DRY_NAMES.map((v) => opt(v)),
        pick: (v) => ctx.setSettings({ dry: v })
      }];
    }

    function typeVals() {
      const all = pages();
      const k = Math.min(ctx.page(), all.length - 1);
      const st = ctx.settings();
      const vals = [];
      if (groundName(all[k].ground) !== '원고지') {
        const own = S.pageMark(ctx.get(), k, 'place') || '';
        vals.push({
          key: 'place', title: '글 자리', label: '자리 ' + (own || '저절로'), current: own,
          options: [opt('', '저절로'), opt('왼쪽'), opt('가운데'), opt('오른쪽')],
          pick(v) {
            ctx.set(S.setPageMark(ctx.get(), k, 'place', v || null));
            ctx.show({ page: k, done: true });
          }
        });
      }
      vals.push({
        key: 'font', title: '글꼴', label: st.font, current: st.font, font: T.FONTS[st.font].css,
        options: T.FONT_NAMES.map((v) => opt(v, v, { font: T.FONTS[v].css })),
        pick: (v) => ctx.setSettings({ font: v })
      }, {
        key: 'size', title: '글자 크기', label: `크기 ${Math.round(st.size * 100)}%`, range: {
          min: 0.8, max: 1.5, step: 0.05, value: st.size,
          shown: (v) => `${Math.round(v * 100)}%`, label: (v) => `크기 ${Math.round(v * 100)}%`, input: (v) => ctx.setSettings({ size: v })
        }
      }, {
        key: 'align', title: '정렬', label: '정렬 ' + st.align, current: st.align,
        options: T.ALIGN_NAMES.map((v) => opt(v)),
        pick: (v) => ctx.setSettings({ align: v })
      });
      if (ctx.wide()) {
        const w = (v) => (v < 14 ? '저절로' : v + '자');
        vals.push({
          key: 'measure', title: '글 상자 폭', label: '폭 ' + w(st.measure || 12), range: {
            min: 12, max: 44, step: 1, value: st.measure || 12,
            shown: w, label: (v) => '폭 ' + w(v), input: (v) => ctx.setSettings({ measure: v < 14 ? 0 : v })
          }
        });
      }
      return vals;
    }

    function endVals() {
      const en = ctx.ending();
      return [{
        key: 'end-scene', title: '장면', label: en.scene, current: en.scene,
        options: Object.keys(T.GROUNDS).map((v) => opt(v)),
        pick: (v) => ctx.setEnding({ scene: v })
      }, {
        key: 'end-ground', title: '바탕', label: '바탕 ' + en.ground, current: en.ground,
        options: T.GROUNDS[en.scene].map((v) => opt(v)),
        pick: (v) => ctx.setEnding({ ground: v })
      }];
    }

    function cardVals() {
      const en = ctx.ending();
      const vals = [{
        key: 'card-size', title: '글자 크기', label: '크기 ' + Math.round(en.size), range: {
          min: 28, max: 120, step: 1, value: en.size,
          shown: (v) => String(Math.round(v)), label: (v) => '크기 ' + Math.round(v), input: (v) => ctx.setCard({ size: v })
        }
      }, {
        key: 'card-width', title: '문구 폭', label: `폭 ${Math.round(en.width)}%`, range: {
          min: 30, max: 90, step: 1, value: en.width,
          shown: (v) => Math.round(v) + '%', label: (v) => `폭 ${Math.round(v)}%`, input: (v) => ctx.setCard({ width: v })
        }
      }, {
        key: 'card-align', title: '정렬', label: '정렬 ' + CARD_ALIGN[en.align], current: en.align,
        options: Object.keys(CARD_ALIGN).map((v) => opt(v, CARD_ALIGN[v])),
        pick: (v) => ctx.setCard({ align: v })
      }];
      if (en.text !== null) vals.push({ key: 'card-follow', act: () => ctx.setCard({ text: null }), label: '편집 제목으로' });
      return vals;
    }

    /* 고치는 중: 고른 곳에 거는 것들. 강조는 등장·머묾을 한 칸에, 퇴장은 따로 */
    function pickVals() {
      const sel = edit.sel || { on: false, head: null };
      const h = sel.head;
      const exit = !!(h && h.fx && E.BLOCKS[h.fx] && E.BLOCKS[h.fx].exit);
      const em = !!(h && h.em && !exit);
      const emNow = em ? (h.fx || '') : null;
      const groups = (names, group) => (E.BLOCK_GROUPS[names] || []).map((v) => opt(v, v, { group }));
      const off = !sel.on;
      return [{
        key: 'em', title: '강조', label: em ? (h.fx ? '강조 ' + h.fx : '강조 기본') : '강조 없음', current: emNow, off,
        options: [opt(null, '없음'), opt('', '기본'), ...groups('등장', '등장'), ...groups('머묾', '머묾')],
        pick: (v) => ctx.ip({ act: 'em', v })
      }, {
        key: 'exit', title: '퇴장', label: exit ? '퇴장 ' + h.fx : '퇴장 없음', current: exit ? h.fx : null, off,
        options: [opt(null, '없음'), ...groups('퇴장', null)],
        pick: (v) => ctx.ip({ act: 'exit', v })
      }, {
        key: 'style', title: '꾸밈', off, multi: true,
        label: h && h.styles.length ? (h.styles.length === 1 ? '꾸밈 ' + h.styles[0] : `꾸밈 ${h.styles.length}가지`) : '꾸밈 없음',
        current: h ? h.styles : [],
        options: Object.keys(E.STYLES).map((v) => opt(v, v, { cls: 's-' + E.STYLES[v] })),
        pick: (v) => ctx.ip({ act: 'style', v })
      }, {
        key: 'color', title: '색', label: h && h.color ? '색 ' + h.color : '색 없음', current: h ? h.color : null, off,
        options: [opt(null, '없음'), ...Object.keys(E.COLORS).map((v) => opt(v, v, { swatch: E.COLORS[v] }))],
        pick: (v) => ctx.ip({ act: 'color', v })
      }, { key: 'off', label: '빼기', act: () => ctx.ip({ act: 'off' }), off: !h }];
    }

    function vals() {
      if (edit) return pickVals();
      return ({ ground: groundVals, motion: motionVals, type: typeVals, end: endVals, card: cardVals })[cat]();
    }
    const cats = () => (ctx.atEnd() ? ['end', 'card'] : ['ground', 'motion', 'type']);

    const ui = bar(root, {
      head() {
        if (edit) return { still: '고른 곳' };
        return {
          key: 'cat', title: '다듬을 갈래', label: CATS[cat], current: cat,
          options: cats().map((v) => opt(v, CATS[v])),
          pick: (v) => { cat = v; }
        };
      },
      before() {
        if (ctx.atEnd() && !['end', 'card'].includes(cat)) cat = 'end';
        if (!ctx.atEnd() && ['end', 'card'].includes(cat)) cat = 'ground';
      },
      vals,
      name: () => (edit ? 'pick' : cat),
      changed: () => onState()
    });
    const render = ui.render;

    return {
      refresh: () => ui.refresh(),
      /* 누른 곳: 'box' 글 상자, 'ground' 빈 바탕 */
      hint(on) {
        if (edit) return;
        ui.shut();
        cat = ctx.atEnd() ? (on === 'box' ? 'card' : 'end') : on === 'box' ? 'type' : 'ground';
        render();
      },
      editing(on) { edit = on ? { sel: null } : null; ui.shut(); render(); },
      selection(sel) { if (edit) { edit.sel = sel; render(); } },
      close: () => ui.close(),
      state: () => ({ cat: edit ? 'pick' : cat, open: ui.open() }),
      set onState(fn) { onState = fn; }
    };
  }

  /*
   * 편집 하단바: 글 전체에 거는 것. 갈래는 분위기(축마다 값 단추 하나, 그리고 살펴보기)·테마(주색·글꼴·시작)·글(불러오기·초안 저장·새로 쓰기).
   * ctx: moods(), setMoods(list), settings(), setSettings(part), look 살펴보기 단추, files 글 단추들,
   *      spare 그 단추들을 쉬게 둘 숨은 칸(편집실이 만들어 두고 다른 코드도 id로 찾으므로 문서 밖으로 빼지 않는다)
   */
  const WRITE_CATS = { mood: '분위기', theme: '테마', file: '글' };
  function mountWrite(root, ctx) {
    let cat = 'mood';
    const ui = bar(root, {
      head: () => ({
        key: 'cat', title: '갈래', label: WRITE_CATS[cat], current: cat,
        options: Object.keys(WRITE_CATS).map((v) => opt(v, WRITE_CATS[v])),
        pick: (v) => { cat = v; }
      }),
      vals() {
        const st = ctx.settings();
        if (cat === 'file') return ctx.files.map((node) => ({ key: node.id, node }));
        if (cat === 'theme') {
          const custom = T.HEX_RE.test(String(st.theme));
          return [{
            key: 'theme', title: '주색', label: '주색 ' + (custom ? '직접' : st.theme), current: st.theme,
            options: [...T.THEME_NAMES.map((n) => opt(n, n, { color: T.THEMES[n] })),
              { v: '#', label: '직접 고르기', picker: true, on: custom, value: (custom ? st.theme : T.themeInk(st.theme)).toLowerCase() }],
            pick: (v) => ctx.setSettings({ theme: v })
          }, {
            key: 'font', title: '글꼴', label: st.font, current: st.font, font: T.FONTS[st.font].css,
            options: T.FONT_NAMES.map((v) => opt(v, v, { font: T.FONTS[v].css })),
            pick: (v) => ctx.setSettings({ font: v })
          }, {
            key: 'scene', title: '시작', label: '시작 ' + st.scene, current: st.scene,
            options: Object.keys(T.GROUNDS).map((v) => opt(v)),
            pick: (v) => ctx.setSettings({ scene: v })
          }];
        }
        const moods = ctx.moods();
        return [...T.AXES.map((ax) => {
          const now = moods.find((w) => ax.words.includes(w)) || null;
          return {
            key: 'ax-' + ax.name, title: ax.name, label: `${ax.name} ${now || '없음'}`, current: now,
            options: [...ax.words.map((w) => opt(w)), opt(null, '없음')],
            pick(v) {
              const list = moods.filter((w) => !ax.words.includes(w));
              if (v) list.push(v);
              ctx.setMoods(list);
            }
          };
        }), ...(ctx.look ? [{ key: 'look', node: ctx.look }] : [])];
      },
      drop: 'wb-drop-',
      before() { [ctx.look, ...ctx.files].forEach((n) => { if (n) ctx.spare.append(n); }); },
      name: () => cat
    });
    return { refresh: () => ui.refresh(), close: () => ui.close() };
  }

  global.GeulPanels = { mount, mountWrite };
})(typeof window !== 'undefined' ? window : globalThis);
