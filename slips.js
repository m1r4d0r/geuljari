/*
 * 글결 다듬기 쪽지
 * 미리보기 무대 위에 필요할 때만 꺼내는 종이 쪽지 세 장. 머리를 끌어 옮길 수 있고, 접으면 사라진다.
 * - 이 쪽: 지금 보는 쪽에 맞춰 필요한 칸만 나온다. 자리, 반전(둘째 쪽부터), 넘김·바탕(장면이 바뀌는 쪽),
 *   그 쪽의 남길 곳·효과, 이 쪽 다시.
 * - 전체: 심상(온도·물기·숨), 흐름, 속도, 쉼, 마름, 글꼴, 처음 장면과 바탕.
 * - 글: 그 쪽 글만 꺼내 고치는 작은 편집창. 끌어 고르면 바로 위에 효과 막대가 뜬다.
 * 폰 폭에서는 아래에서 올라오는 판이 되고 한 번에 한 장만 열린다. 전역 GeulSlips.
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
    const r = el('div', 'sl-row');
    r.append(el('span', 'sl-name', label), ...kids);
    return r;
  }

  function range(id, min, max, step, value, shown, onInput) {
    const wrap = el('label', 'sl-range');
    const top = el('span', 'sl-range-top');
    const v = el('span', 'k', shown(value));
    top.append(v);
    const input = el('input');
    input.type = 'range';
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => { v.textContent = shown(Number(input.value)); onInput(Number(input.value)); });
    wrap.append(top, input);
    return wrap;
  }

  /*
   * ctx: get() 본문, set(text) 본문 바꾸기, head(), settings(), setSettings(s), moods(), setMoods(list),
   *      page() 지금 쪽(0부터), play(start) 미리보기를 그 자리부터, again(), phone() 폰 폭인지, store {get,set}
   */
  function mount(stage, ctx) {
    const slips = {};
    ['page', 'all', 'text'].forEach((name) => { slips[name] = document.getElementById('slip-' + name); });
    const pos = ctx.store.get('slips.pos') || {};
    const open = new Set(ctx.store.get('slips.open') || []);
    let onChange = () => {};

    function pages() { return E.pages(E.parse(ctx.head() + ctx.get())); }

    /* ---------- 열고 닫기, 옮기기 ---------- */

    function place(name) {
      const s = slips[name];
      if (ctx.phone()) { s.style.left = ''; s.style.top = ''; return; }
      const p = pos[name];
      const W = stage.clientWidth;
      const H = stage.clientHeight;
      const d = { page: [W - s.offsetWidth - 24, 24], all: [24, 24], text: [(W - s.offsetWidth) / 2, Math.max(24, H - s.offsetHeight - 96)] }[name];
      const x = p ? p[0] : d[0];
      const y = p ? p[1] : d[1];
      s.style.left = Math.max(0, Math.min(x, W - 80)) + 'px';
      s.style.top = Math.max(0, Math.min(y, H - 48)) + 'px';
    }

    /* 겹친 쪽지는 마지막에 만진 것이 위로 온다(띠보다는 아래) */
    const order = Object.keys(slips);
    function raise(name) {
      order.splice(order.indexOf(name), 1);
      order.push(name);
      order.forEach((n, i) => { slips[n].style.zIndex = String(12 + i); });
    }

    function show(name, on) {
      if (on && ctx.phone()) Object.keys(slips).forEach((n) => { if (n !== name) { open.delete(n); slips[n].hidden = true; } });
      if (on) open.add(name); else open.delete(name);
      slips[name].hidden = !on;
      if (on) { render(name); place(name); raise(name); }
      ctx.store.set('slips.open', [...open]);
      onChange();
    }
    const toggle = (name) => show(name, !open.has(name));
    const isOpen = (name) => open.has(name);

    Object.entries(slips).forEach(([name, s]) => {
      s.querySelector('.slip-x').addEventListener('click', () => show(name, false));
      s.addEventListener('pointerdown', () => raise(name), true);
      const head = s.querySelector('.slip-head');
      head.addEventListener('pointerdown', (e) => {
        if (ctx.phone() || e.target.closest('button')) return;
        const r = s.getBoundingClientRect();
        const st = stage.getBoundingClientRect();
        const dx = e.clientX - r.left;
        const dy = e.clientY - r.top;
        head.setPointerCapture(e.pointerId);
        s.classList.add('is-moving');
        const move = (ev) => {
          pos[name] = [ev.clientX - st.left - dx, ev.clientY - st.top - dy];
          place(name);
        };
        const up = () => {
          head.removeEventListener('pointermove', move);
          s.classList.remove('is-moving');
          ctx.store.set('slips.pos', pos);
        };
        head.addEventListener('pointermove', move);
        head.addEventListener('pointerup', up, { once: true });
        head.addEventListener('pointercancel', up, { once: true });
      });
    });

    function render(name) {
      if (name === 'page') renderPage();
      if (name === 'all') renderAll();
      if (name === 'text') renderText();
    }

    /* 열린 쪽지를 다시 그린다. 글 쪽지는 고치는 중이면 건드리지 않는다 */
    function refresh(force) {
      open.forEach((n) => {
        if (n === 'text' && !force && document.activeElement === textTa) return;
        render(n);
      });
    }

    /* ---------- 이 쪽 ---------- */

    function renderPage() {
      const s = slips.page;
      const body = s.querySelector('.slip-body');
      const all = pages();
      const k = Math.min(ctx.page(), all.length - 1);
      const pg = all[k];
      const before = all[k - 1];
      const src = ctx.get();
      s.querySelector('.stamp').textContent = String(k + 1);
      s.querySelector('.slip-title').textContent = `${SCENE_WORD[pg.scene]} · ${groundName(pg.ground)}`;
      body.replaceChildren();

      const own = S.pageMark(src, k, 'place') || '';
      body.append(row('자리', segment([['', '저절로'], ['왼쪽', '왼쪽'], ['가운데', '가운데'], ['오른쪽', '오른쪽']], own, (v) => {
        ctx.set(S.setPageMark(ctx.get(), k, 'place', v || null));
        ctx.play({ page: k });
      }, 'wide')));

      if (k > 0) {
        const turned = pg.scene !== before.scene;
        const rev = el('button', 'sl-check');
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
        });
        body.append(row('반전', rev));
        if (turned) {
          const ownTurn = S.pageMark(src, k, 'turn');
          body.append(row('넘김', segment(T.SCENE_TURNS, ownTurn || ctx.settings().turn, (v) => {
            ctx.set(S.setPageMark(ctx.get(), k, 'turn', v));
            ctx.play(Object.assign(endOf(k - 1), { next: true }));
          }, 'wide grid4')));
          const sceneName = SCENE_WORD[pg.scene];
          body.append(row('바탕', segment(T.GROUNDS[sceneName], groundName(pg.ground), (v) => {
            ctx.set(S.setPageMark(ctx.get(), k, 'ground', v));
            ctx.play({ page: k });
          }, 'wide')));
        }
      } else {
        const st = ctx.settings();
        body.append(row('장면', segment(Object.keys(T.GROUNDS), st.scene, (v) => { ctx.setSettings({ scene: v }); ctx.play({ page: 0 }); })));
        body.append(row('바탕', segment(T.GROUNDS[st.scene], st.ground, (v) => { ctx.setSettings({ ground: v }); ctx.play({ page: 0 }); }, 'wide')));
      }

      const list = blocksOn(k);
      if (list.length) {
        const box = el('div', 'sl-blocks');
        list.forEach((b) => {
          const r = el('div', 'sl-block');
          r.append(el('span', 'sl-clip', clip(src.slice(b.oe, b.cs))));
          const sel = el('select', 'tsel');
          sel.setAttribute('aria-label', '효과');
          [['', '남길 곳']].concat(E.BLOCK_NAMES.map((n) => [n, n])).forEach(([v, label]) => {
            const o = el('option', null, label);
            o.value = v;
            o.selected = b.named ? v === b.fx : v === '';
            sel.append(o);
          });
          sel.addEventListener('change', () => {
            const t = ctx.get();
            const cur = S.blocks(t).find((x) => x.os === b.os);
            if (!cur) return;
            ctx.set(t.slice(0, cur.os) + '{{' + (sel.value ? sel.value + ':' : '') + t.slice(cur.oe));
            ctx.play({ page: k, needle: clip(src.slice(b.oe, b.cs), 14) });
          });
          const off = el('button', 'link small', '빼기');
          off.type = 'button';
          off.addEventListener('click', () => {
            const t = ctx.get();
            const cur = S.blocks(t).find((x) => x.os === b.os);
            if (cur) ctx.set(S.unwrap(t, cur));
            ctx.play({ page: k });
          });
          r.append(sel, off);
          box.append(r);
        });
        body.append(row('강조', box));
      }

      const foot = el('div', 'sl-foot');
      const again = el('button', 'link', '이 쪽 다시');
      again.type = 'button';
      again.addEventListener('click', () => ctx.again());
      const edit = el('button', 'link', '글 고치기');
      edit.type = 'button';
      edit.addEventListener('click', () => show('text', true));
      foot.append(again, edit);
      body.append(foot);
    }

    /* 쪽 k의 블록들 */
    function blocksOn(k) {
      const t = ctx.get();
      const ls = S.lines(t);
      return S.blocks(t).filter((b) => {
        const ln = ls.find((l) => b.os >= l.start && b.os <= l.start + l.text.length);
        return ln && ln.page === k;
      });
    }

    function clip(s, n) {
      const t = E.stripMarks(s).replace(/\s+/g, ' ').trim();
      const max = n || 18;
      return t.length > max ? t.slice(0, max - 1) + '…' : t;
    }

    /* 쪽 k의 마지막 몇 어절부터(넘김을 보려면 넘기기 바로 앞에서 시작한다) */
    function endOf(k) {
      const pg = pages()[Math.max(0, k)];
      const lines = pg ? pg.paragraphs.flatMap((p) => p.lines) : [];
      const last = lines[lines.length - 1];
      return { page: Math.max(0, k), needle: last ? last.tokens.slice(-3).map((t) => t.text).join(' ') : '' };
    }

    /* ---------- 전체 ---------- */

    function renderAll() {
      const body = slips.all.querySelector('.slip-body');
      const st = ctx.settings();
      body.replaceChildren();
      const moods = el('div', 'moods');
      T.AXES.forEach((ax) => {
        moods.append(el('span', 'ax', ax.name));
        ax.words.forEach((w) => {
          const b = el('button', null, w);
          b.type = 'button';
          b.title = T.MOOD[w].note;
          b.setAttribute('aria-pressed', String(ctx.moods().includes(w)));
          b.addEventListener('click', () => {
            const list = ctx.moods().filter((x) => !ax.words.includes(x));
            if (!ctx.moods().includes(w)) list.push(w);
            ctx.setMoods(list);
            renderAll();
            ctx.play({ page: ctx.page() });
          });
          moods.append(b);
        });
      });
      const look = el('a', 'link small', '낱말 하나씩 살펴보기');
      look.href = 'simsang.html';
      body.append(row('결', moods), look);
      const set = (k, v, keepOpen) => {
        ctx.setSettings({ [k]: v });
        if (!keepOpen) renderAll();
        ctx.play({ page: ctx.page() });
      };
      body.append(row('흐름', segment(T.FLOW_NAMES, st.flow, (v) => set('flow', v), 'wide')));
      let timer = 0;
      const later = (k, v) => { ctx.setSettings({ [k]: v }); clearTimeout(timer); timer = setTimeout(() => ctx.play({ page: ctx.page() }), 450); };
      body.append(row('속도', range('sl-speed', 50, 160, 5, Math.round(st.speed * 100), (v) => (v / 100).toFixed(2) + '×', (v) => later('speed', v / 100))));
      body.append(row('쉼', range('sl-rest', 0, 3, 1, st.rest, (v) => T.REST_NAMES[v], (v) => later('rest', v))));
      body.append(row('마름', segment(T.DRY_NAMES, st.dry, (v) => set('dry', v), 'wide')));
      body.append(row('글꼴', segment(T.FONT_NAMES, st.font, (v) => set('font', v), 'wide grid3')));
    }

    /* ---------- 글 ---------- */

    const textTa = slips.text.querySelector('textarea');
    const textMirror = slips.text.querySelector('.ed-mirror');
    const fxbar = slips.text.querySelector('.fxbar');
    let slice = null;
    let typeTimer = 0;
    const ed = ED.attach(textTa, textMirror, {
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

    function renderText() {
      const k = ctx.page();
      slips.text.querySelector('.stamp').textContent = String(k + 1);
      slice = sliceOf(k);
      ed.firstPage = k;
      const v = slice ? ctx.get().slice(slice.s, slice.e) : '';
      if (textTa.value !== v) { textTa.value = v; textTa.scrollTop = 0; }
      ed.draw();
      fxbar.hidden = true;
    }

    function atCaret() {
      const a = textTa.selectionStart || 0;
      const sent = S.sentences(textTa.value).find((x) => x.start <= a && a <= x.end + 1);
      const needle = sent ? E.stripMarks(sent.text).replace(/\s+/g, ' ').trim().slice(0, 14) : '';
      return needle ? { page: slice ? slice.k : ctx.page(), needle } : { page: ctx.page() };
    }

    /* 효과 막대: 갈래로 나누어 늘어놓고, 고른 자리 바로 위에 띄운다 */
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
    const keep = el('button', null, '남길 곳');
    keep.type = 'button';
    keep.dataset.fx = '';
    fxList.prepend(keep);
    fxbar.addEventListener('mousedown', (e) => e.preventDefault());
    fxbar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fx]');
      if (b) applyFx(b.dataset.fx);
      else if (e.target.closest('.fx-off')) removeFx();
    });

    function blockAtSel() {
      const a = textTa.selectionStart;
      const b = textTa.selectionEnd;
      return S.blocks(textTa.value).find((k) => k.os <= a && b <= k.ce) || null;
    }

    function syncFx() {
      const blk = blockAtSel();
      const on = document.activeElement === textTa && (textTa.selectionStart !== textTa.selectionEnd || !!blk);
      fxbar.hidden = !on;
      if (!on) return;
      const cur = blk ? (blk.named ? blk.fx : '') : null;
      fxList.querySelectorAll('[data-fx]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fx === cur)));
      fxbar.querySelector('.fx-off').hidden = !blk;
      const box = ed.rectAt(textTa.selectionStart);
      const host = slips.text.querySelector('.ed').getBoundingClientRect();
      const h = fxbar.offsetHeight || 40;
      let top = box ? box.top - host.top - h - 8 : 4;
      if (top < 0 && box) top = box.bottom - host.top + 8;
      fxbar.style.top = Math.max(0, top) + 'px';
    }
    document.addEventListener('selectionchange', () => { if (document.activeElement === textTa) syncFx(); });
    textTa.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== textTa) fxbar.hidden = true; }, 120));

    function applyFx(fx) {
      const v = textTa.value;
      const blk = blockAtSel();
      let next;
      let sel;
      if (blk) {
        const openTok = '{{' + (fx ? fx + ':' : '');
        next = v.slice(0, blk.os) + openTok + v.slice(blk.oe);
        const shift = openTok.length - (blk.oe - blk.os);
        sel = [blk.os + openTok.length, blk.cs + shift];
      } else {
        const a = textTa.selectionStart;
        const b = textTa.selectionEnd;
        if (a === b) return;
        const r = S.wrap(v, a, b, fx || null);
        next = r.text;
        const inner = S.blocks(next).find((k) => k.os >= r.start - 1 && k.os <= r.start + 1);
        sel = inner ? [inner.oe, inner.cs] : [r.start, r.start];
      }
      ed.set(next, sel);
      commitText();
      textTa.focus({ preventScroll: true });
      textTa.setSelectionRange(sel[0], sel[1]);
      syncFx();
      ctx.play({ page: slice ? slice.k : ctx.page(), needle: E.stripMarks(next.slice(sel[0], sel[1])).replace(/\s+/g, ' ').trim().slice(0, 14) });
    }

    function removeFx() {
      const blk = blockAtSel();
      if (!blk) return;
      ed.set(S.unwrap(textTa.value, blk), [blk.os, blk.os]);
      commitText();
      syncFx();
      ctx.play({ page: slice ? slice.k : ctx.page() });
    }

    function commitText() {
      if (!slice) return;
      const t = ctx.get();
      const v = textTa.value;
      ctx.set(t.slice(0, slice.s) + v + t.slice(slice.e), true);
      slice.e = slice.s + v.length;
    }

    window.addEventListener('resize', () => open.forEach(place));

    return {
      show, toggle, isOpen, refresh,
      restore() { open.forEach((n) => { slips[n].hidden = false; render(n); place(n); }); },
      hideAll() { Object.keys(slips).forEach((n) => { slips[n].hidden = true; }); },
      set onChange(fn) { onChange = fn; }
    };
  }

  global.GeulSlips = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
