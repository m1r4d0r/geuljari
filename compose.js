/*
 * 글결 쪽 짜기 층
 * 글 화면의 편집창(editor.js) 위에 쪽의 짜임을 얹는다. 글은 그대로 입력창이라 언제든 고칠 수 있다.
 * - 쪽마다 면을 깐다(다크 쪽은 어두운 면). 면은 표시층 안 글자 뒤에 깔려 글과 함께 굴러간다.
 * - 줄 사이에 마우스를 올리면 점선과 '여기서 나누기'가 보이고, 누르면 거기서 쪽이 나뉜다(빈 줄 둘).
 *   손가락으로 쓰는 화면에서는 문단 사이(빈 줄)에 '나누기'를 늘 둔다.
 * - 쪽 사이에는 쪽 번호와 [반전]·[잇기]. 반전은 그 쪽부터 라이트·다크를 바꾸는 쪽 표시 줄을 넣고 뺀다.
 * - 글을 끌어 고르면 바로 위에 [강조]가, 강조 안을 누르면 [강조 빼기]가 뜬다.
 * 자리는 표시층 글자의 화면 상자로 잰다. 전역 GeulCompose.
 */
(function (global) {
  'use strict';
  const E = global.Geulgyeol;
  const S = global.GeulSense;
  const LONG = 240;
  const coarse = global.matchMedia ? global.matchMedia('(pointer: coarse)') : { matches: false };

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const sceneWord = (scene) => (scene === 'night' ? '다크' : '라이트');

  /*
   * box: .ed 요소, ta·mirror: 그 안의 입력창·표시층, ed: GeulEditor.attach가 돌려준 것
   * ctx: { get() 본문, set(text, sel) 본문 바꾸기, head() 첫 쪽 표시 줄, scene() 처음 장면 이름 }
   * 돌려주는 것: { draw() 편집창이 다시 그린 뒤 부른다, scroll() 굴릴 때 부른다, nights() 다크 쪽 번호, pages() }
   */
  function mount(box, ta, mirror, ed, ctx) {
    const layer = el('div', 'cp-layer');
    const inner = el('div', 'cp-layer-in');
    layer.append(inner);
    box.append(layer);
    const hint = el('button', 'cp-hint');
    hint.type = 'button';
    hint.hidden = true;
    hint.append(el('span', null, '여기서 나누기'));
    const pop = el('div', 'cp-pop');
    pop.hidden = true;
    box.append(hint, pop);

    let pagesCache = [];
    let seams = [];
    let blocks = [];

    function pages() {
      pagesCache = E.pages(E.parse(ctx.head() + ctx.get()));
      return pagesCache;
    }
    function nights() {
      const set = new Set();
      pages().forEach((p, k) => { if (p.scene === 'night') set.add(k); });
      return set;
    }

    /* 표시층 글자의 위치를 한 번에 재는 도구: offset → 글자 상자(표시층 내용 좌표) */
    function ruler() {
      const nodes = [];
      const walker = document.createTreeWalker(mirror, NodeFilter.SHOW_TEXT);
      let at = 0;
      let n;
      while ((n = walker.nextNode())) { nodes.push([at, n]); at += n.length; }
      const m = mirror.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(mirror).lineHeight) || 36;
      const range = document.createRange();
      function glyph(offset) {
        let lo = 0;
        let hi = nodes.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (nodes[mid][0] <= offset) lo = mid; else hi = mid - 1;
        }
        const [base, node] = nodes[lo] || [];
        if (!node || offset - base >= node.length) return null;
        range.setStart(node, offset - base);
        range.setEnd(node, offset - base + 1);
        const r = range.getBoundingClientRect();
        if (!r.height) return null;
        return { top: r.top - m.top + mirror.scrollTop, bottom: r.bottom - m.top + mirror.scrollTop, left: r.left - m.left, h: r.height };
      }
      /* 줄 상자의 위·아래(글자 상자에서 줄 높이만큼 넓힌다) */
      return {
        lh,
        top(offset) { const g = glyph(offset); return g ? g.top - (lh - g.h) / 2 : null; },
        bottom(offset) { const g = glyph(offset); return g ? g.bottom + (lh - g.h) / 2 : null; },
        glyph
      };
    }

    function draw() {
      const text = ctx.get();
      const ls = S.lines(text);
      const lines = ls.filter((l) => !l.empty && !l.scene);
      const pgs = pagesCache.length ? pagesCache : pages();
      blocks = S.blocks(text);
      seams = [];
      mirror.querySelectorAll('.cp-shade').forEach((n) => n.remove());
      inner.replaceChildren();
      hideHint();
      if (!lines.length) return;
      const R = ruler();
      const pos = lines.map((ln) => {
        const end = ln.start + ln.text.length - 1;
        let top = R.top(ln.start);
        let bottom = R.bottom(end);
        if (top == null) top = R.top(ln.start + ln.text.search(/\S/));
        if (bottom == null) bottom = top + R.lh;
        return { ln, top, bottom };
      });
      if (pos.some((p) => p.top == null)) return;
      const candidate = S.turnCandidate(text, ctx.scene());

      /* 쪽마다 면 */
      const groups = [];
      pos.forEach((p) => {
        const g = groups[groups.length - 1];
        if (g && g.page === p.ln.page) g.items.push(p);
        else groups.push({ page: p.ln.page, items: [p] });
      });
      const pad = Math.round(R.lh * 0.22);
      groups.forEach((g, gi) => {
        const pg = pgs[g.page] || pgs[pgs.length - 1];
        const top = g.items[0].top - pad;
        const bottom = g.items[g.items.length - 1].bottom + pad;
        const shade = el('div', 'cp-shade' + (pg.scene === 'night' ? ' night' : ''));
        shade.style.top = top + 'px';
        shade.style.height = bottom - top + 'px';
        mirror.append(shade);
        const pn = el('span', 'cp-pn' + (pg.count > LONG ? ' long' : '') + (pg.scene === 'night' ? ' night' : ''), String(g.page + 1));
        pn.style.top = top + 'px';
        pn.title = pg.count > LONG ? `${pg.count}자, 길어요. 줄 사이를 눌러 나눠 보세요.` : `${pg.count}자`;
        inner.append(pn);

        /* 쪽 안의 줄 사이 틈 */
        g.items.forEach((p, k) => {
          const prev = g.items[k - 1];
          if (!prev) return;
          const blanks = ls.slice(prev.ln.i + 1, p.ln.i).some((x) => x.empty);
          const a = prev.ln.start + prev.ln.text.length;
          const b = p.ln.start;
          const y = blanks ? (prev.bottom + p.top) / 2 : p.top;
          const reach = blanks ? Math.max(8, (p.top - prev.bottom) / 2) : 7;
          seams.push({ y, reach, a, b, kind: blanks ? 'para' : 'line' });
          if (blanks && coarse.matches) {
            const cut = el('button', 'cp-cut', '나누기');
            cut.type = 'button';
            cut.style.top = y + 'px';
            cut.addEventListener('click', () => split(a, b));
            inner.append(cut);
          }
        });

        /* 앞 쪽과의 사이: 반전·잇기 */
        const before = groups[gi - 1];
        if (!before) return;
        const prevItem = before.items[before.items.length - 1];
        const first = g.items[0];
        const a = prevItem.ln.start + prevItem.ln.text.length;
        const b = first.ln.start;
        const between = ls.slice(prevItem.ln.i + 1, first.ln.i);
        const markLn = between.find((x) => x.scene);
        const prevPg = pgs[before.page];
        const turned = !!(prevPg && pg.scene !== prevPg.scene);
        const div = el('div', 'cp-div');
        const gapTop = prevItem.bottom + pad;
        div.style.top = gapTop + 'px';
        div.style.height = Math.max(0, top - gapTop) + 'px';
        const rev = el('button', 'cp-rev' + (first.ln.i === candidate && !turned ? ' hint' : ''));
        rev.type = 'button';
        rev.setAttribute('aria-pressed', String(turned));
        rev.innerHTML = '<i class="box"></i>';
        rev.append(turned ? `반전 · ${sceneWord(pg.scene)}로` : '반전');
        rev.title = first.ln.i === candidate && !turned ? '글을 읽어 보니 여기서 분위기가 바뀌는 것 같아요.' : '이 쪽부터 라이트와 다크를 바꿔요.';
        rev.addEventListener('click', () => {
          const t = ctx.get();
          const mk = markLn ? S.readMarkLine(markLn.text) : { scene: null, ground: null, turn: null, place: null };
          if (turned) { mk.scene = null; mk.ground = null; mk.turn = null; }
          else mk.scene = prevPg && prevPg.scene === 'night' ? '라이트' : '다크';
          const line = S.markLine(mk);
          ctx.set(t.slice(0, a) + '\n\n\n' + (line ? line + '\n' : '') + t.slice(b));
        });
        const join = el('button', 'cp-join', '잇기');
        join.type = 'button';
        join.title = '나눈 쪽을 다시 이어요.';
        join.addEventListener('click', () => {
          const t = ctx.get();
          ctx.set(t.slice(0, a) + '\n\n' + t.slice(b));
        });
        const acts = el('span', 'cp-acts');
        acts.append(rev, join);
        div.append(el('span', 'cp-rule'), acts);
        inner.append(div);
      });
      scroll();
    }

    function split(a, b) {
      const t = ctx.get();
      hideHint();
      ctx.set(t.slice(0, a) + '\n\n\n' + t.slice(b), [a + 3, a + 3]);
    }

    function scroll() {
      inner.style.transform = `translateY(${-mirror.scrollTop}px)`;
      hideHint();
      hidePop();
    }

    /* ---------- 줄 사이 틈 ---------- */

    let hintAt = null;
    function hideHint() { hint.hidden = true; hintAt = null; }
    function onMove(e) {
      if (e.pointerType === 'touch' || e.buttons) { hideHint(); return; }
      const m = mirror.getBoundingClientRect();
      if (e.clientX < m.left || e.clientX > m.right) { hideHint(); return; }
      const y = e.clientY - m.top + mirror.scrollTop;
      let best = null;
      seams.forEach((s) => {
        const d = Math.abs(s.y - y);
        if (d <= s.reach && (!best || d < Math.abs(best.y - y))) best = s;
      });
      if (!best) { hideHint(); return; }
      hintAt = best;
      hint.hidden = false;
      hint.className = 'cp-hint ' + best.kind;
      hint.style.top = (m.top - box.getBoundingClientRect().top) + best.y - mirror.scrollTop + 'px';
    }
    box.addEventListener('pointermove', onMove);
    box.addEventListener('pointerleave', hideHint);
    hint.addEventListener('click', () => { if (hintAt) split(hintAt.a, hintAt.b); });

    /* ---------- 끌어 고르면 강조 ---------- */

    function hidePop() { pop.hidden = true; }

    function showPop(at, acts) {
      pop.replaceChildren();
      acts.forEach(([label, fn]) => {
        const b = el('button', null, label);
        b.type = 'button';
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => { hidePop(); fn(); });
        pop.append(b);
      });
      pop.hidden = false;
      const g = ed.rectAt(at);
      const host = box.getBoundingClientRect();
      if (!g) { hidePop(); return; }
      const w = pop.offsetWidth;
      const left = Math.max(8, Math.min(g.left - host.left - 8, box.clientWidth - w - 8));
      const above = g.top - host.top - pop.offsetHeight - 8;
      pop.style.left = left + 'px';
      pop.style.top = (above > 4 ? above : g.bottom - host.top + 8) + 'px';
    }

    function syncPop(fromPointer) {
      if (document.activeElement !== ta) { hidePop(); return; }
      const a = ta.selectionStart;
      const b = ta.selectionEnd;
      const t = ctx.get();
      const hit = blocks.filter((k) => k.os < b + 2 && a < k.ce + 2 && (a !== b || (k.oe <= a && a <= k.cs)));
      if (a === b && !(fromPointer && hit.length)) { hidePop(); return; }
      const acts = [];
      if (a !== b && E.stripMarks(t.slice(a, b)).trim()) {
        acts.push(['강조', () => {
          const r = S.wrap(ctx.get(), a, b, null);
          const inside = S.blocks(r.text).find((k) => k.os >= r.start - 1 && k.os <= r.start + 1);
          ctx.set(r.text, inside ? [inside.oe, inside.cs] : null);
        }]);
      }
      if (hit.length) acts.push(['강조 빼기', () => unwrapAll(hit, a)]);
      if (!acts.length) { hidePop(); return; }
      showPop(a, acts);
    }

    function unwrapAll(list, caret) {
      let t = ctx.get();
      list.slice().sort((x, y) => y.os - x.os).forEach((k) => {
        const cur = S.blocks(t).find((x) => x.os === k.os);
        if (cur) t = S.unwrap(t, cur);
      });
      const shift = list.filter((k) => k.os < caret).length * 2;
      ctx.set(t, [Math.max(0, caret - shift), Math.max(0, caret - shift)]);
    }

    ta.addEventListener('pointerup', () => setTimeout(() => syncPop(true), 0));
    ta.addEventListener('keyup', (e) => { if (e.shiftKey) syncPop(false); else hidePop(); });
    ta.addEventListener('input', hidePop);
    ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) hidePop(); }, 150));
    let selTimer = 0;
    document.addEventListener('selectionchange', () => {
      if (document.activeElement !== ta || !coarse.matches) return;
      clearTimeout(selTimer);
      selTimer = setTimeout(() => syncPop(false), 350);
    });

    return { draw, scroll, nights, pages, hidePop };
  }

  global.GeulCompose = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
