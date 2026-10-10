/*
 * 글결 미리보기 판
 * 미리보기 왼쪽 가장자리의 책갈피(분위기·글씨·배경·강조)를 누르면 그 판 하나만 열린다. 다시 누르거나 닫기·Esc로 접는다.
 * - 분위기: 심상 세 축(온도·물기·숨).
 * - 글씨: 글꼴, 나타나는 결(흐름), 속도, 쉼, 마르는 빠르기.
 * - 배경: 지금 보는 쪽의 장면(첫 쪽)·반전(둘째 쪽부터)·바탕·넘어오는 결, 글 자리.
 * - 강조: 지금 보는 쪽 글을 꺼내 고치는 작은 편집창. 끌어 고르면 바로 위에 강조·효과 막대가 뜬다.
 * 폰 폭에서는 아래에서 올라오는 판이 된다. 전역 GeulPanels.
 */
(function (global) {
  'use strict';
  const E = global.Geulgyeol;
  const T = global.GeulTune;
  const S = global.GeulSense;
  const ED = global.GeulEditor;
  const SCENE_WORD = { day: '라이트', night: '다크' };
  const groundName = (g) => Object.keys(E.GROUNDS).find((k) => E.GROUNDS[k] === g) || g;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function segment(names, current, onPick, cls) {
    const box = el('div', 'seg' + (cls ? ' ' + cls : ''));
    box.setAttribute('role', 'group');
    names.forEach((n) => {
      const b = el('button', null, Array.isArray(n) ? n[1] : n);
      const v = Array.isArray(n) ? n[0] : n;
      b.type = 'button';
      b.setAttribute('aria-pressed', String(v === current));
      b.addEventListener('click', () => onPick(v));
      box.append(b);
    });
    return box;
  }

  function row(label, ...kids) {
    const r = el('div', 'pn-row');
    r.append(el('span', 'pn-name', label), ...kids);
    return r;
  }

  function range(min, max, step, value, shown, onInput) {
    const wrap = el('label', 'pn-range');
    const v = el('span', 'k', shown(value));
    const input = el('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => { v.textContent = shown(Number(input.value)); onInput(Number(input.value)); });
    wrap.append(input, v);
    return wrap;
  }

  /* 심상: 축(반대말 한 쌍)마다 한 줄. 줄 안에서 하나만 고르고, 고른 것을 다시 누르면 뺀다 */
  function moodGrid(box, moods, onPick) {
    box.replaceChildren();
    T.AXES.forEach((ax) => {
      box.append(el('span', 'ax', ax.name));
      ax.words.forEach((w) => {
        const b = el('button', null, w);
        b.type = 'button';
        b.title = T.MOOD[w].note;
        b.setAttribute('aria-pressed', String(moods.includes(w)));
        b.addEventListener('click', () => {
          const list = moods.filter((x) => !ax.words.includes(x));
          if (!moods.includes(w)) list.push(w);
          onPick(list);
        });
        box.append(b);
      });
    });
  }

  /* 조판값 요약 한 줄(장면·글꼴은 뺀다) */
  function mix(box, s) {
    box.replaceChildren();
    T.describe(s).filter(([k]) => k !== '장면' && k !== '글꼴').forEach(([k, v]) => {
      const sp = el('span');
      sp.append(k + ' ', el('b', null, v));
      box.append(sp);
    });
  }

  /*
   * ctx: get() 본문, set(text) 본문 바꾸기, head(), settings(), setSettings(s), moods(), setMoods(list),
   *      page() 지금 쪽(0부터), play(start) 미리보기를 그 자리부터, wide() 글 상자를 끌어 옮길 수 있는 폭인지
   */
  function mount(ctx) {
    const panels = {};
    ['mood', 'type', 'ground', 'mark'].forEach((name) => { panels[name] = document.getElementById('panel-' + name); });
    let current = null;
    let onChange = () => {};

    function pages() { return E.pages(E.parse(ctx.head() + ctx.get())); }

    function open(name) {
      Object.entries(panels).forEach(([n, p]) => { p.hidden = n !== name; });
      current = name;
      render(name);
      onChange();
    }
    function close() {
      Object.values(panels).forEach((p) => { p.hidden = true; });
      current = null;
      onChange();
    }
    const toggle = (name) => (current === name ? close() : open(name));
    Object.values(panels).forEach((p) => p.querySelector('.panel-x').addEventListener('click', close));

    function render(name) {
      if (name === 'mood') renderMood();
      if (name === 'type') renderType();
      if (name === 'ground') renderGround();
      if (name === 'mark') renderMark();
    }

    /* 열린 판을 다시 그린다. 강조 판은 고치는 중이면 건드리지 않는다 */
    function refresh(force) {
      if (!current) return;
      if (current === 'mark' && !force && document.activeElement === markTa) return;
      render(current);
    }

    function body(name) { return panels[name].querySelector('.panel-body'); }
    function sub(name, text) { panels[name].querySelector('.panel-sub').textContent = text; }

    /* ---------- 분위기 ---------- */

    function renderMood() {
      const b = body('mood');
      b.replaceChildren();
      const grid = el('div', 'moods');
      moodGrid(grid, ctx.moods(), (list) => { ctx.setMoods(list); renderMood(); ctx.play({ page: ctx.page() }); });
      const m = el('p', 'mix');
      mix(m, ctx.settings());
      const look = el('a', 'link small', '낱말 하나씩 살펴보기');
      look.href = 'simsang.html';
      b.append(grid, m, look);
    }

    /* ---------- 글씨 ---------- */

    function renderType() {
      const b = body('type');
      const st = ctx.settings();
      b.replaceChildren();
      const set = (k, v) => { ctx.setSettings({ [k]: v }); renderType(); ctx.play({ page: ctx.page() }); };
      let timer = 0;
      const later = (k, v) => { ctx.setSettings({ [k]: v }); clearTimeout(timer); timer = setTimeout(() => ctx.play({ page: ctx.page() }), 450); };
      b.append(row('글꼴', segment(T.FONT_NAMES, st.font, (v) => set('font', v), 'wide grid3')));
      b.append(row('나타나는 결', segment(T.FLOW_NAMES, st.flow, (v) => set('flow', v), 'wide')));
      b.append(row('쓰는 빠르기', range(50, 160, 5, Math.round(st.speed * 100), (v) => (v / 100).toFixed(2) + '×', (v) => later('speed', v / 100))));
      b.append(row('띄어 쓴 쉼', range(0, 3, 1, st.rest, (v) => T.REST_NAMES[v], (v) => later('rest', v))));
      b.append(row('마르는 빠르기', segment(T.DRY_NAMES, st.dry, (v) => set('dry', v), 'wide')));
    }

    /* ---------- 배경 ---------- */

    /* 쪽 k의 마지막 몇 어절부터(넘어오는 결을 보려면 넘기기 바로 앞에서 시작한다) */
    function endOf(k) {
      const pg = pages()[Math.max(0, k)];
      const lines = pg ? pg.paragraphs.flatMap((p) => p.lines) : [];
      const last = lines[lines.length - 1];
      return { page: Math.max(0, k), needle: last ? last.tokens.slice(-3).map((t) => t.text).join(' ') : '' };
    }

    function renderGround() {
      const b = body('ground');
      const all = pages();
      const k = Math.min(ctx.page(), all.length - 1);
      const pg = all[k];
      const before = all[k - 1];
      const src = ctx.get();
      sub('ground', `${k + 1}쪽 · ${SCENE_WORD[pg.scene]} · ${groundName(pg.ground)}`);
      b.replaceChildren();

      if (k === 0) {
        const st = ctx.settings();
        b.append(row('장면', segment(Object.keys(T.GROUNDS), st.scene, (v) => { ctx.setSettings({ scene: v }); ctx.play({ page: 0 }); renderGround(); }, 'wide')));
        b.append(row('바탕', segment(T.GROUNDS[st.scene], st.ground, (v) => { ctx.setSettings({ ground: v }); ctx.play({ page: 0 }); renderGround(); }, 'wide')));
      } else {
        const turned = pg.scene !== before.scene;
        const rev = el('button', 'pn-check');
        rev.type = 'button';
        rev.setAttribute('aria-pressed', String(turned));
        rev.innerHTML = '<i class="box"></i>';
        rev.append(turned ? `이 쪽부터 ${SCENE_WORD[pg.scene]}` : `이 쪽부터 ${before.scene === 'night' ? '라이트' : '다크'}로 바꾸기`);
        rev.addEventListener('click', () => {
          let t = ctx.get();
          if (turned) {
            t = S.setPageMark(t, k, 'turn', null);
            t = S.setPageMark(t, k, 'ground', null);
            t = S.setPageMark(t, k, 'scene', null);
          } else t = S.setPageMark(t, k, 'scene', before.scene === 'night' ? '라이트' : '다크');
          ctx.set(t);
          ctx.play(Object.assign(endOf(k - 1), { next: true }));
          renderGround();
        });
        b.append(row('반전', rev));
        if (turned) {
          const sceneName = SCENE_WORD[pg.scene];
          b.append(row('바탕', segment(T.GROUNDS[sceneName], groundName(pg.ground), (v) => {
            ctx.set(S.setPageMark(ctx.get(), k, 'ground', v));
            ctx.play({ page: k });
            renderGround();
          }, 'wide')));
          const ownTurn = S.pageMark(src, k, 'turn');
          b.append(row('넘어오는 결', segment(T.SCENE_TURNS, ownTurn || ctx.settings().turn, (v) => {
            ctx.set(S.setPageMark(ctx.get(), k, 'turn', v));
            ctx.play(Object.assign(endOf(k - 1), { next: true }));
            renderGround();
          }, 'wide grid4')));
        }
      }

      const own = S.pageMark(src, k, 'place') || '';
      const place = row('글 자리', segment([['', '저절로'], ['왼쪽', '왼쪽'], ['가운데', '가운데'], ['오른쪽', '오른쪽']], own, (v) => {
        ctx.set(S.setPageMark(ctx.get(), k, 'place', v || null));
        ctx.play({ page: k });
        renderGround();
      }, 'wide'));
      if (ctx.wide()) place.append(el('span', 'pn-note', '미리보기에서 글 상자를 끌어 옮겨도 돼요.'));
      b.append(place);
    }

    /* ---------- 강조 ---------- */

    const markTa = panels.mark.querySelector('textarea');
    const markMirror = panels.mark.querySelector('.ed-mirror');
    const fxbar = panels.mark.querySelector('.fxbar');
    let slice = null;
    let typeTimer = 0;
    const ed = ED.attach(markTa, markMirror, {
      onInput(v) {
        if (!slice) return;
        const t = ctx.get();
        const next = t.slice(0, slice.s) + v + t.slice(slice.e);
        slice.e = slice.s + v.length;
        ctx.set(next, true);
        clearTimeout(typeTimer);
        typeTimer = setTimeout(() => ctx.play(atCaret()), 1000);
      }
    });

    /* 쪽 k의 글 범위(첫 글줄 처음부터 마지막 글줄 끝까지) */
    function sliceOf(k) {
      const t = ctx.get();
      const ls = S.lines(t).filter((l) => !l.empty && !l.scene && l.page === k);
      if (!ls.length) return null;
      return { s: ls[0].start, e: ls[ls.length - 1].start + ls[ls.length - 1].text.length, k };
    }

    function renderMark() {
      const k = ctx.page();
      sub('mark', `${k + 1}쪽`);
      slice = sliceOf(k);
      ed.firstPage = k;
      const v = slice ? ctx.get().slice(slice.s, slice.e) : '';
      if (markTa.value !== v) { markTa.value = v; markTa.scrollTop = 0; }
      ed.draw();
      fxbar.hidden = true;
    }

    function atCaret() {
      const a = markTa.selectionStart || 0;
      const sent = S.sentences(markTa.value).find((x) => x.start <= a && a <= x.end + 1);
      const needle = sent ? E.stripMarks(sent.text).replace(/\s+/g, ' ').trim().slice(0, 14) : '';
      return needle ? { page: slice ? slice.k : ctx.page(), needle } : { page: ctx.page() };
    }

    /* 효과 막대: 강조와 갈래별 효과를 늘어놓고, 고른 자리 바로 위에 띄운다 */
    const fxList = fxbar.querySelector('.fx-list');
    Object.entries(E.BLOCK_GROUPS).forEach(([group, names], gi) => {
      if (gi) { const sep = el('i', 'sep'); sep.setAttribute('aria-hidden', 'true'); fxList.append(sep); }
      names.forEach((n) => {
        const b = el('button', null, n);
        b.type = 'button';
        b.dataset.fx = n;
        b.title = group;
        fxList.append(b);
      });
    });
    const keep = el('button', null, '강조');
    keep.type = 'button';
    keep.dataset.fx = '';
    keep.title = '남기고 싶은 곳';
    const keepSep = el('i', 'sep');
    keepSep.setAttribute('aria-hidden', 'true');
    fxList.prepend(keep, keepSep);
    fxbar.addEventListener('mousedown', (e) => e.preventDefault());
    fxbar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fx]');
      if (b) applyFx(b.dataset.fx);
      else if (e.target.closest('.fx-off')) removeFx();
    });

    function blockAtSel() {
      const a = markTa.selectionStart;
      const b = markTa.selectionEnd;
      return S.blocks(markTa.value).find((k) => k.os <= a && b <= k.ce) || null;
    }

    function syncFx() {
      const blk = blockAtSel();
      const on = document.activeElement === markTa && (markTa.selectionStart !== markTa.selectionEnd || !!blk);
      fxbar.hidden = !on;
      if (!on) return;
      const cur = blk ? (blk.named ? blk.fx : '') : null;
      fxList.querySelectorAll('[data-fx]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fx === cur)));
      fxbar.querySelector('.fx-off').hidden = !blk;
      const box = ed.rectAt(markTa.selectionStart);
      const host = panels.mark.querySelector('.ed').getBoundingClientRect();
      const h = fxbar.offsetHeight || 40;
      let top = box ? box.top - host.top - h - 8 : 4;
      if (top < 0 && box) top = box.bottom - host.top + 8;
      fxbar.style.top = Math.max(0, top) + 'px';
    }
    document.addEventListener('selectionchange', () => { if (document.activeElement === markTa) syncFx(); });
    markTa.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== markTa) fxbar.hidden = true; }, 120));

    function applyFx(fx) {
      const v = markTa.value;
      const blk = blockAtSel();
      let next;
      let sel;
      if (blk) {
        const openTok = '{{' + (fx ? fx + ':' : '');
        next = v.slice(0, blk.os) + openTok + v.slice(blk.oe);
        const shift = openTok.length - (blk.oe - blk.os);
        sel = [blk.os + openTok.length, blk.cs + shift];
      } else {
        const a = markTa.selectionStart;
        const b = markTa.selectionEnd;
        if (a === b) return;
        const r = S.wrap(v, a, b, fx || null);
        next = r.text;
        const inner = S.blocks(next).find((k) => k.os >= r.start - 1 && k.os <= r.start + 1);
        sel = inner ? [inner.oe, inner.cs] : [r.start, r.start];
      }
      ed.set(next, sel);
      commitText();
      markTa.focus({ preventScroll: true });
      markTa.setSelectionRange(sel[0], sel[1]);
      syncFx();
      ctx.play({ page: slice ? slice.k : ctx.page(), needle: E.stripMarks(next.slice(sel[0], sel[1])).replace(/\s+/g, ' ').trim().slice(0, 14) });
    }

    function removeFx() {
      const blk = blockAtSel();
      if (!blk) return;
      ed.set(S.unwrap(markTa.value, blk), [blk.os, blk.os]);
      commitText();
      syncFx();
      ctx.play({ page: slice ? slice.k : ctx.page() });
    }

    function commitText() {
      if (!slice) return;
      const t = ctx.get();
      const v = markTa.value;
      ctx.set(t.slice(0, slice.s) + v + t.slice(slice.e), true);
      slice.e = slice.s + v.length;
    }

    return {
      open, close, toggle, refresh,
      current: () => current,
      set onChange(fn) { onChange = fn; }
    };
  }

  global.GeulPanels = { mount, moodGrid, mix };
})(typeof window !== 'undefined' ? window : globalThis);
