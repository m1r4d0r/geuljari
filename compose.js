/*
 * 글결 짜기 화면
 * 본문을 읽는 모양으로 펼쳐 놓고 그 위에서 쪽을 나누고, 반전을 걸고, 남길 곳을 고른다.
 * - 줄 사이 틈에 마우스를 올리면 '여기서 나누기'가 보이고, 누르면 거기서 쪽이 나뉜다(빈 줄 둘).
 * - 쪽 사이에는 구분선과 함께 [반전]·[잇기]를 둔다. 반전은 그 쪽부터 라이트·다크를 바꾸는 쪽 표시 줄을 넣고 뺀다.
 * - 글을 끌어 고르면 [남기기]가 뜨고, 남긴 곳(이름 없는 블록)을 누르면 [빼기]가 뜬다.
 * 쪽마다 한 덩어리로 묶고 다크 쪽은 어두운 면으로 그려 구조를 한눈에 보인다. 글자 하나하나는 본문 자리(data-o)를 갖고 있어
 * 끌어 고른 범위를 본문 offset으로 바꾼다. 전역 GeulCompose.
 */
(function (global) {
  'use strict';
  const E = global.Geulgyeol;
  const S = global.GeulSense;
  const ED = global.GeulEditor;
  const LONG = 240;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const sceneWord = (scene) => (scene === 'night' ? '다크' : '라이트');
  const groundName = (g) => Object.keys(E.GROUNDS).find((k) => E.GROUNDS[k] === g) || g;

  /*
   * ctx: { get() 본문, set(text) 본문 바꾸기, head() 첫 쪽 표시 줄, scene() 처음 장면 이름, pop 떠 있는 판 요소 }
   */
  function mount(box, ctx) {
    let blocks = [];

    function draw() {
      const text = ctx.get();
      const ls = S.lines(text);
      const lines = ls.filter((l) => !l.empty && !l.scene);
      const pages = E.pages(E.parse(ctx.head() + text));
      const candidate = S.turnCandidate(text, ctx.scene());
      blocks = S.blocks(text);
      const frag = document.createDocumentFragment();
      if (!lines.length) {
        frag.append(el('p', 'cp-empty', '쓰기에서 글을 먼저 놓아 주세요.'));
        box.replaceChildren(frag);
        return;
      }
      let pageBox = null;
      const openPage = (k) => {
        const pg = pages[k] || pages[pages.length - 1];
        pageBox = el('div', 'cp-page');
        pageBox.dataset.scene = pg.scene;
        const head = el('div', 'cp-head');
        head.append(el('span', 'cp-pn', String(k + 1)));
        const n = pg.count;
        head.append(el('span', 'k', `${sceneWord(pg.scene)} · ${groundName(pg.ground)} · ${n}자`));
        if (n > LONG) {
          pageBox.classList.add('long');
          head.append(el('span', 'k cp-long', '길어요. 줄 사이를 눌러 나눠 보세요.'));
        }
        pageBox.append(head);
        frag.append(pageBox);
      };
      openPage(0);
      let openBlk = null;
      lines.forEach((ln, k) => {
        const prev = lines[k - 1];
        if (prev) {
          const a = prev.start + prev.text.length;
          const b = ln.start;
          const between = ls.slice(prev.i + 1, ln.i);
          const blanks = between.filter((x) => x.empty).length;
          if (ln.page !== prev.page) {
            const mark = between.find((x) => x.scene);
            frag.append(divider(a, b, ln.page, pages, mark ? S.readMarkLine(mark.text) : null, ln.i === candidate));
            openPage(ln.page);
            openBlk = null;
          } else {
            if (blanks) openBlk = null;
            pageBox.append(seam(a, b, blanks ? 'para' : 'line'));
          }
        }
        openBlk = line(ln, openBlk);
      });
      box.replaceChildren(frag);

      /* 줄 하나: 블록 표시 글자는 빼고 글자만, 자리(data-o)를 단다 */
      function line(ln, open) {
        const row = el('div', 'cp-ln');
        const t = ln.text;
        let cur = open;
        let i = 0;
        const put = (a, b) => {
          if (b <= a) return;
          const sp = el('span', cur ? 'cp-em' + (cur.named ? '' : ' focus') : null, t.slice(a, b));
          sp.dataset.o = String(ln.start + a);
          if (cur) sp.dataset.b = String(cur.os);
          row.append(sp);
        };
        ED.TOKEN_RE.lastIndex = 0;
        let m;
        while ((m = ED.TOKEN_RE.exec(t))) {
          put(i, m.index);
          if (m[0] === '}}') cur = null;
          else {
            cur = { named: !!m[1], os: ln.start + m.index };
            if (m[1]) row.append(el('span', 'cp-fx', m[1]));
          }
          i = m.index + m[0].length;
        }
        put(i, t.length);
        pageBox.append(row);
        return cur;
      }
    }

    /* 줄 사이 틈: 누르면 거기서 쪽을 나눈다 */
    function seam(a, b, kind) {
      const s = el('button', 'cp-seam ' + kind);
      s.type = 'button';
      s.setAttribute('aria-label', '여기서 쪽 나누기');
      s.append(el('span', 'cp-seam-hint', '여기서 나누기'));
      s.addEventListener('click', () => {
        const t = ctx.get();
        ctx.set(t.slice(0, a) + '\n\n\n' + t.slice(b));
      });
      return s;
    }

    /* 쪽 사이: 쪽 번호, 반전, 잇기 */
    function divider(a, b, page, pages, mark, hint) {
      const d = el('div', 'cp-div');
      const pg = pages[page];
      const before = pages[page - 1];
      const turned = !!(pg && before && pg.scene !== before.scene);
      d.append(el('span', 'cp-rule'));
      const rev = el('button', 'cp-rev' + (hint && !turned ? ' hint' : ''));
      rev.type = 'button';
      rev.setAttribute('aria-pressed', String(turned));
      rev.innerHTML = '<i class="box"></i>';
      rev.append(turned ? `반전 · ${sceneWord(pg.scene)}로` : '반전');
      rev.title = hint && !turned ? '글을 읽어 보니 여기서 분위기가 바뀌는 것 같아요.' : '이 쪽부터 라이트와 다크를 바꿔요.';
      rev.addEventListener('click', () => {
        const t = ctx.get();
        const mk = mark ? Object.assign({}, mark) : { scene: null, ground: null, turn: null, place: null };
        if (turned) { mk.scene = null; mk.ground = null; mk.turn = null; }
        else mk.scene = before && before.scene === 'night' ? '라이트' : '다크';
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
      d.append(rev, join);
      return d;
    }

    /* ---------- 끌어 고르기 ---------- */

    function offsetOf(node, off) {
      const host = node.nodeType === 3 ? node.parentElement : node;
      const sp = host && host.closest ? host.closest('[data-o]') : null;
      if (sp && node.nodeType === 3) return +sp.dataset.o + off;
      if (sp) return +sp.dataset.o;
      const kid = host && host.childNodes ? host.childNodes[Math.min(off, host.childNodes.length - 1)] : null;
      const inner = kid && kid.querySelector ? (kid.matches && kid.matches('[data-o]') ? kid : kid.querySelector('[data-o]')) : null;
      return inner ? +inner.dataset.o : null;
    }

    function hidePop() { ctx.pop.hidden = true; }

    function showPop(rect, acts) {
      const pop = ctx.pop;
      pop.replaceChildren();
      acts.forEach(([label, fn]) => {
        const b = el('button', null, label);
        b.type = 'button';
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => { hidePop(); fn(); });
        pop.append(b);
      });
      pop.hidden = false;
      const host = pop.offsetParent ? pop.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
      const w = pop.offsetWidth;
      const left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2 - host.left, (pop.offsetParent ? pop.offsetParent.clientWidth : innerWidth) - w - 8));
      const above = rect.top - host.top - pop.offsetHeight - 8;
      pop.style.left = left + 'px';
      pop.style.top = (above > 4 ? above : rect.bottom - host.top + 8) + 'px';
    }

    function onPick() {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      if (!box.contains(r.commonAncestorContainer)) return;
      if (sel.isCollapsed) return;
      let a = offsetOf(r.startContainer, r.startOffset);
      let b = offsetOf(r.endContainer, r.endOffset);
      if (a == null || b == null) return;
      if (a > b) [a, b] = [b, a];
      const hit = blocks.filter((k) => k.os < b + 2 && a < k.ce + 2);
      const acts = [['남기기', () => { sel.removeAllRanges(); ctx.set(S.wrap(ctx.get(), a, b, null).text); }]];
      if (hit.length) acts.push(['빼기', () => { sel.removeAllRanges(); unwrapAll(hit); }]);
      showPop(r.getBoundingClientRect(), acts);
    }

    function unwrapAll(list) {
      let t = ctx.get();
      list.slice().sort((x, y) => y.os - x.os).forEach((k) => {
        const cur = S.blocks(t).find((x) => x.os === k.os);
        if (cur) t = S.unwrap(t, cur);
      });
      ctx.set(t);
    }

    box.addEventListener('mouseup', () => setTimeout(onPick, 0));
    box.addEventListener('keyup', (e) => { if (e.shiftKey) onPick(); });
    let selTimer = 0;
    document.addEventListener('selectionchange', () => {
      if (!box.isConnected || box.offsetParent === null) return;
      clearTimeout(selTimer);
      selTimer = setTimeout(() => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && 'ontouchstart' in window) onPick();
      }, 450);
    });
    box.addEventListener('click', (e) => {
      const sp = e.target.closest('.cp-em');
      const sel = window.getSelection();
      if (!sp || (sel && !sel.isCollapsed)) return;
      const blk = blocks.find((k) => String(k.os) === sp.dataset.b);
      if (!blk) return;
      showPop(sp.getBoundingClientRect(), [['빼기', () => unwrapAll([blk])]]);
    });
    document.addEventListener('mousedown', (e) => { if (!ctx.pop.contains(e.target)) hidePop(); });

    return { draw, hidePop };
  }

  global.GeulCompose = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
