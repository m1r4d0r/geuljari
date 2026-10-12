/*
 * 글결 쪽 짜기 층
 * 글 화면의 편집창(editor.js) 위에 쪽의 짜임을 얹는다. 글은 그대로 입력창이라 언제든 고칠 수 있다.
 * - 쪽마다 면을 깐다(다크 쪽은 어두운 면). 면은 표시층 안 글자 뒤에 깔려 글과 함께 굴러간다.
 * - 줄 사이에 마우스를 올리면 점선과 '여기서 나누기'가 보이고, 누르면 거기서 쪽이 나뉜다(빈 줄 둘).
 *   손가락으로 쓰는 화면에서는 문단 사이(빈 줄)에 '나누기'를 늘 둔다.
 * - 쪽 사이에는 쪽 번호와 [반전]·[잇기]. 반전은 그 쪽부터 라이트·다크를 바꾸는 쪽 표시 줄을 넣고 뺀다.
 *   반전된 자리에서는 넘어오는 결(넘김)도 바로 고른다.
 * - 글을 끌어 고르면 바로 위에 [강조]가, 강조 안을 누르면 [강조 빼기]가 뜬다.
 * - 어절 사이를 오른쪽 단추로 누르면 그 자리에 끊을 자리(｜)를 넣고, 끊을 자리 위를 누르면 뺀다. 어절 안을 누르면 늘 쓰던 메뉴가 뜬다.
 *   손가락 화면에는 오른쪽 단추가 없으므로 고른 곳 위에 [끊을 자리]·[끊을 자리 빼기]를 함께 띄운다
 *   (고른 곳 첫 어절 앞, 줄 첫 어절이면 고른 곳 안의 다음 어절 앞).
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
   * ctx: { get() 본문, set(text, sel) 본문 바꾸기, head() 첫 쪽 표시 줄, scene() 처음 장면 이름, turn() 기본 넘김 이름 }
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
      watch(lines.map((ln) => ln.start), pos.map((p) => Math.round(p.top)));
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
        inner.append(pn);

        /* 쪽 안의 줄 사이 틈 */
        g.items.forEach((p, k) => {
          const prev = g.items[k - 1];
          if (!prev) return;
          const blanks = ls.slice(prev.ln.i + 1, p.ln.i).some((x) => x.empty);
          const a = prev.ln.start + prev.ln.text.length;
          const b = p.ln.start;
          const y = blanks ? (prev.bottom + p.top) / 2 : p.top;
          const reach = blanks ? Math.max(10, (p.top - prev.bottom) / 2) : 10;
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
        rev.addEventListener('click', () => {
          if (!guard(a, b)) return;
          const t = ctx.get();
          const mk = markLn ? S.readMarkLine(markLn.text) : { scene: null, ground: null, turn: null, place: null };
          if (turned) { mk.scene = null; mk.ground = null; mk.turn = null; }
          else mk.scene = prevPg && prevPg.scene === 'night' ? '라이트' : '다크';
          const line = S.markLine(mk);
          ctx.set(t.slice(0, a) + '\n\n\n' + (line ? line + '\n' : '') + t.slice(b));
        });
        const join = el('button', 'cp-join', '잇기');
        join.type = 'button';
        join.addEventListener('click', () => {
          if (!guard(a, b)) return;
          const t = ctx.get();
          ctx.set(t.slice(0, a) + '\n\n' + t.slice(b));
        });
        const acts = el('span', 'cp-acts');
        acts.append(rev);
        if (turned) {
          const own = markLn ? S.readMarkLine(markLn.text).turn : null;
          const sel = el('select', 'cp-turn');
          sel.setAttribute('aria-label', '넘어오는 결');
          (window.GeulTune ? window.GeulTune.SCENE_TURNS : Object.keys(E.TURNS).filter((n) => n !== '스밈')).forEach((n) => {
            const o = el('option', null, n === (own || ctx.turn()) && !own ? `${n} (기본)` : n);
            o.value = n;
            o.selected = n === (own || ctx.turn());
            sel.append(o);
          });
          sel.addEventListener('change', () => {
            if (!guard(a, b)) return;
            const t = ctx.get();
            const mk = markLn ? S.readMarkLine(markLn.text) : { scene: pg.scene === 'night' ? '다크' : '라이트', ground: null, turn: null, place: null };
            mk.turn = sel.value;
            ctx.set(t.slice(0, a) + '\n\n\n' + S.markLine(mk) + '\n' + t.slice(b));
          });
          acts.append(sel);
        }
        acts.append(join);
        div.append(el('span', 'cp-rule'), acts);
        inner.append(div);
      });
      scroll();
    }

    /*
     * 그린 뒤에 글줄 자리가 바뀌면(늦게 들어온 글꼴, 폭이 바뀐 표시 등) 면·구분선이 글과 어긋난다.
     * 그린 직후와 조금 뒤에 글줄 첫 글자 자리를 다시 재서 달라졌으면 다시 그린다.
     */
    let watchTimers = [];
    function watch(offsets, tops) {
      watchTimers.forEach(clearTimeout);
      const check = () => {
        if (!box.isConnected || box.offsetParent === null) return;
        const R = ruler();
        if (offsets.some((o, i) => { const t = R.top(o); return t != null && Math.abs(Math.round(t) - tops[i]) > 1; })) ed.draw();
      };
      watchTimers = [60, 400, 1500].map((ms) => setTimeout(check, ms));
    }

    /* 쪽 사이·줄 사이 자리(a~b)에는 빈 줄과 쪽 표시 줄만 있어야 한다. 그 사이 글이 바뀌었으면 다시 그리고 손대지 않는다 */
    function gapOk(t, a, b) {
      if (a >= b || b > t.length || t[a] !== '\n' || t[b - 1] !== '\n') return false;
      return t.slice(a, b).split('\n').every((x) => !x.trim() || E.SCENE_LINE_RE.test(x));
    }
    function guard(a, b) {
      if (gapOk(ctx.get(), a, b)) return true;
      ed.draw();
      return false;
    }

    function split(a, b) {
      if (!guard(a, b)) return;
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
      const host = box.getBoundingClientRect();
      hint.style.top = (m.top - host.top) + best.y - mirror.scrollTop + 'px';
      hint.style.setProperty('--hx', Math.max(0, Math.min(e.clientX - hint.getBoundingClientRect().left + 14, hint.clientWidth - 96)) + 'px');
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
      if (a !== b && coarse.matches) {
        const from = t.lastIndexOf('\n', a - 1) + 1;
        const inside = t.slice(Math.max(from, a - 1), b).includes(E.BREAK);
        if (inside) {
          acts.push(['끊을 자리 빼기', () => {
            const cur = ctx.get();
            const lo = Math.max(from, a - 1);
            const cut = cur.slice(lo, b).split(E.BREAK).length - 1;
            const before = cur.slice(lo, a).split(E.BREAK).length - 1;
            ctx.set(cur.slice(0, lo) + cur.slice(lo, b).split(E.BREAK).join('') + cur.slice(b), [a - before, b - cut]);
          }]);
        } else {
          const at = breakAt(t, a, b);
          if (at != null) acts.push(['끊을 자리', () => {
            const cur = ctx.get();
            ctx.set(cur.slice(0, at) + E.BREAK + cur.slice(at), [at + 1, at + 1]);
          }]);
        }
      }
      if (!acts.length) { hidePop(); return; }
      showPop(a, acts);
    }

    /* 끊을 자리를 넣을 곳: 고른 곳 첫 어절의 앞. 줄의 첫 어절이면 고른 곳 안의 다음 어절 앞. 쪽 표시 줄·이미 있는 자리면 null */
    function breakAt(t, a, b) {
      const from = t.lastIndexOf('\n', a - 1) + 1;
      const nl = t.indexOf('\n', a);
      const to = Math.min(b, nl < 0 ? t.length : nl);
      if (/^\s*\[\[/.test(t.slice(from, nl < 0 ? t.length : nl))) return null;
      const lead = (p) => !t.slice(from, p).trim();
      let p = a;
      while (p > from && !/\s/.test(t[p - 1])) p--;
      if (lead(p)) {
        const gap = t.slice(p, to).search(/\s\S/);
        if (gap < 0) return null;
        p += gap + 1;
      }
      if (p >= to || t[p - 1] === E.BREAK || t[p] === E.BREAK) return null;
      return p;
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

    /* ---------- 오른쪽 단추로 끊을 자리 ---------- */

    /* 화면 자리(x, y)의 본문 offset: 입력창을 잠깐 비켜 표시층 글자에서 잰다(표시층은 글자 수가 본문과 같다) */
    function offsetAt(x, y) {
      const pe = ta.style.pointerEvents;
      const me = mirror.style.pointerEvents;
      ta.style.pointerEvents = 'none';
      mirror.style.pointerEvents = 'auto';
      let node = null;
      let off = 0;
      if (document.caretPositionFromPoint) {
        const p = document.caretPositionFromPoint(x, y);
        if (p) { node = p.offsetNode; off = p.offset; }
      } else if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(x, y);
        if (r) { node = r.startContainer; off = r.startOffset; }
      }
      ta.style.pointerEvents = pe;
      mirror.style.pointerEvents = me;
      if (!node || !mirror.contains(node) || node.nodeType !== 3) return null;
      const walker = document.createTreeWalker(mirror, NodeFilter.SHOW_TEXT);
      let n = 0;
      let cur;
      while ((cur = walker.nextNode())) {
        if (cur === node) return n + off;
        n += cur.length;
      }
      return null;
    }

    /* 누른 자리가 어절 사이면 끊을 자리를 넣을 곳, 끊을 자리 곁이면 그 자리. 어절 안·줄 첫머리·쪽 표시 줄이면 null */
    function gapAt(t, p) {
      if (t[p] === E.BREAK) return { cut: p };
      if (t[p - 1] === E.BREAK) return { cut: p - 1 };
      const from = t.lastIndexOf('\n', p - 1) + 1;
      const nl = t.indexOf('\n', p);
      const line = t.slice(from, nl < 0 ? t.length : nl);
      if (/^\s*\[\[/.test(line)) return null;
      const sp = (c) => c === ' ' || c === '\t' || c === '　';
      if (!sp(t[p]) && !sp(t[p - 1])) return null;
      let q = p;
      while (q < from + line.length && sp(t[q])) q++;
      if (q >= from + line.length || !t.slice(from, q).trim()) return null;
      if (t[q] === E.BREAK) return { cut: q };
      return { put: q };
    }

    ta.addEventListener('contextmenu', (e) => {
      if (coarse.matches) return;
      const t = ctx.get();
      const p = offsetAt(e.clientX, e.clientY);
      const g = p == null ? null : gapAt(t, p);
      if (!g) return;
      e.preventDefault();
      hidePop();
      if (g.put != null) {
        ctx.set(t.slice(0, g.put) + E.BREAK + t.slice(g.put), [g.put + 1, g.put + 1]);
        if (ctx.notice) ctx.notice('끊을 자리를 넣었어요. 좁은 화면에서 줄이 넘치면 끝 어절 대신 여기서 먼저 줄을 바꿔요.');
      } else {
        ctx.set(t.slice(0, g.cut) + t.slice(g.cut + 1), [g.cut, g.cut]);
        if (ctx.notice) ctx.notice('끊을 자리를 뺐어요.');
      }
    });

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
