/*
 * 글결 미리보기 안에서 고치기
 * 편집실 미리보기(view.html, iframe)에서 글 상자를 누르면 그 자리에 같은 폭·같은 글꼴의 편집창을 띄운다.
 * 글은 편집실에서 그 쪽 몫만 받아 오고(geulgyeol:edit-req → edit-slice), 고칠 때마다 돌려보낸다(geulgyeol:edit).
 * 고르면 위에 막대가 뜬다: 강조, 강조 효과(등장·머묾), 퇴장, 굵게·기울임·밑줄·취소선, 색, 빼기.
 * 꾸밈과 강조는 편집창에 그대로 두고, 효과·퇴장을 고르면 닫으면서 그 자리부터 다시 써 보인다.
 * 바깥을 누르거나 Esc·'다 고쳤어요'로 닫으면 편집실이 그 쪽을 다 쓴 모습으로 다시 그린다(geulgyeol:edit-done).
 * 전역 GeulInplace.
 */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  const S = window.GeulSense;
  const ED = window.GeulEditor;
  if (!E || !S || !ED || window.parent === window) return;

  const tell = (msg) => window.parent.postMessage(msg, location.origin);
  const MOVE_GROUPS = ['등장', '머묾'];
  let cur = null;
  let pending = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function btn(label, title, cls) {
    const b = el('button', cls || null, label);
    b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    return b;
  }

  function open(col, page) {
    if (cur || pending) return;
    window.postMessage({ type: 'geulgyeol:finish' }, location.origin);
    pending = { col, page };
    tell({ type: 'geulgyeol:edit-req', page });
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'geulgyeol:edit-slice' || !pending) return;
    if (e.data.page !== pending.page) return;
    const p = pending;
    pending = null;
    if (typeof e.data.text === 'string') build(p.col, p.page, e.data.text);
  });

  /* ---------- 편집창 ---------- */

  function build(col, page, text) {
    const box = el('div', 'ip');
    box.style.left = col.offsetLeft + 'px';
    box.style.top = col.offsetTop + 'px';
    box.style.width = col.offsetWidth + 'px';
    const mirror = el('div', 'ip-mirror');
    mirror.setAttribute('aria-hidden', 'true');
    const ta = el('textarea', 'ip-input');
    ta.spellcheck = false;
    ta.setAttribute('aria-label', `${page + 1}쪽 글`);
    const done = btn('다 고쳤어요', null, 'ip-done');
    const bar = buildBar();
    box.append(mirror, ta, bar.el);
    col.parentElement.append(box);
    document.body.append(done);
    col.classList.add('ip-hidden');
    ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'touchstart'].forEach((t) => box.addEventListener(t, (e) => e.stopPropagation()));

    const ed = ED.attach(ta, mirror, { onInput() { send(); } });
    ed.firstPage = page;
    ta.value = text;
    ed.draw();
    cur = { col, page, box, ta, mirror, ed, bar, done };
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);

    done.addEventListener('click', () => close());
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    document.addEventListener('selectionchange', sync);
  }

  function send() {
    if (cur) tell({ type: 'geulgyeol:edit', text: cur.ta.value });
  }

  function close(replay) {
    if (!cur) return;
    const c = cur;
    cur = null;
    document.removeEventListener('selectionchange', sync);
    tell({ type: 'geulgyeol:edit', text: c.ta.value });
    c.box.remove();
    c.done.remove();
    c.col.classList.remove('ip-hidden');
    tell({ type: 'geulgyeol:edit-done', page: c.page, replay: replay || null });
  }

  document.addEventListener('pointerdown', (e) => {
    if (cur && !cur.box.contains(e.target) && e.target !== cur.done) close();
  }, true);

  /* ---------- 막대 ---------- */

  function buildBar() {
    const root = el('div', 'ip-bar');
    root.hidden = true;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', '고른 곳 꾸미기');
    const row = el('div', 'ip-row');
    const keep = btn('강조', '강조(남기고 싶은 곳)', 'ip-keep');
    const moves = btn('효과', '강조 효과 고르기', 'ip-open');
    const exits = btn('퇴장', '물러나는 효과 고르기', 'ip-open');
    const styles = Object.keys(E.STYLES).map((w) => {
      const b = btn('가', w, 'ip-style s-' + E.STYLES[w]);
      b.dataset.style = w;
      return b;
    });
    const colors = Object.keys(E.COLORS).map((c) => {
      const b = btn('', c, 'ip-color');
      b.dataset.color = c;
      b.classList.add('c-' + E.COLORS[c]);
      return b;
    });
    const off = btn('빼기', '표시 빼기', 'ip-off');
    const sep = () => el('i', 'ip-sep');
    row.append(keep, moves, exits, sep(), ...styles, sep(), ...colors, sep(), off);
    const list = el('div', 'ip-list');
    list.hidden = true;
    root.append(row, list);
    root.addEventListener('mousedown', (e) => e.preventDefault());

    let listKind = null;
    function showList(kind) {
      listKind = listKind === kind ? null : kind;
      list.hidden = !listKind;
      moves.setAttribute('aria-expanded', String(listKind === 'move'));
      exits.setAttribute('aria-expanded', String(listKind === 'exit'));
      list.replaceChildren();
      if (!listKind) return;
      const names = listKind === 'move'
        ? MOVE_GROUPS.flatMap((g) => E.BLOCK_GROUPS[g] || [])
        : (E.BLOCK_GROUPS['퇴장'] || []);
      const blk = cur && blockAtSel();
      names.forEach((n) => {
        const b = btn(n, null);
        b.dataset.fx = n;
        b.setAttribute('aria-pressed', String(!!(blk && blk.head.fx === n)));
        list.append(b);
      });
    }
    moves.addEventListener('click', () => showList('move'));
    exits.addEventListener('click', () => showList('exit'));
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-fx]'); if (b) applyFx(b.dataset.fx); });
    keep.addEventListener('click', () => applyKeep());
    styles.forEach((b) => b.addEventListener('click', () => applyStyle(b.dataset.style)));
    colors.forEach((b) => b.addEventListener('click', () => applyColor(b.dataset.color)));
    off.addEventListener('click', () => removeAll());

    return {
      el: root,
      update(blk) {
        const h = blk ? blk.head : null;
        keep.setAttribute('aria-pressed', String(!!(blk && blk.em && !h.fx)));
        moves.classList.toggle('on', !!(h && h.fx && !E.BLOCKS[h.fx].exit));
        exits.classList.toggle('on', !!(h && h.fx && E.BLOCKS[h.fx].exit));
        styles.forEach((b) => b.setAttribute('aria-pressed', String(!!(h && h.styles.includes(b.dataset.style)))));
        colors.forEach((b) => b.setAttribute('aria-pressed', String(!!(h && h.color === b.dataset.color))));
        off.hidden = !blk;
        if (listKind) { const k = listKind; listKind = null; showList(k); }
      },
      reset() { listKind = null; list.hidden = true; }
    };
  }

  function blockAtSel() {
    const a = cur.ta.selectionStart;
    const b = cur.ta.selectionEnd;
    return S.blocks(cur.ta.value).find((k) => k.os <= a && b <= k.ce) || null;
  }

  function sync() {
    if (!cur || document.activeElement !== cur.ta) return;
    const { ta, bar, ed, box } = cur;
    const blk = blockAtSel();
    const on = ta.selectionStart !== ta.selectionEnd || !!blk;
    if (!on) { bar.el.hidden = true; bar.reset(); return; }
    bar.el.hidden = false;
    bar.update(blk);
    const g = ed.rectAt(ta.selectionStart);
    const host = box.getBoundingClientRect();
    const h = bar.el.offsetHeight || 40;
    let top = g ? g.top - host.top - h - 10 : -h - 10;
    if (g && g.top - h - 10 < 8) top = g.bottom - host.top + 10;
    bar.el.style.top = top + 'px';
  }

  /* 고친 글을 편집창에 넣고 편집실에 보낸다. sel: 그 뒤에 고를 범위 */
  function put(next, sel) {
    const { ta, ed } = cur;
    ed.set(next, sel);
    ta.focus({ preventScroll: true });
    if (sel) ta.setSelectionRange(sel[0], sel[1]);
    send();
    sync();
  }

  /* 고른 범위를 head로 감싸거나(블록 밖), 블록 머리를 바꾼다(블록 안) */
  function change(edit) {
    const { ta } = cur;
    const v = ta.value;
    const blk = blockAtSel();
    if (blk) {
      const head = edit(Object.assign({}, blk.head, { styles: blk.head.styles.slice() }), blk);
      const next = S.setHead(v, blk, head);
      const nb = S.blocks(next).find((k) => k.os === blk.os);
      return { next, sel: nb ? [nb.oe, nb.cs] : [blk.os, blk.os + (blk.cs - blk.oe)] };
    }
    const a = ta.selectionStart;
    const b = ta.selectionEnd;
    if (a === b) return null;
    const head = edit({ fx: null, keep: false, styles: [], color: null }, null);
    const word = E.headText(head);
    if (!word && !head.keep) return null;
    const r = S.wrap(v, a, b, word || null);
    const inner = S.blocks(r.text).find((k) => k.os >= r.start - 1 && k.os <= r.start + 1);
    return { next: r.text, sel: inner ? [inner.oe, inner.cs] : [r.start, r.start] };
  }

  function applyKeep() {
    const r = change((h, blk) => {
      if (blk && blk.em && !h.fx) { h.keep = false; return h; }
      h.fx = null;
      h.keep = true;
      return h;
    });
    if (r) put(r.next, r.sel);
  }

  function applyStyle(w) {
    const r = change((h) => {
      const i = h.styles.indexOf(w);
      if (i >= 0) h.styles.splice(i, 1); else h.styles.push(w);
      return h;
    });
    if (r) put(r.next, r.sel);
  }

  function applyColor(c) {
    const r = change((h) => { h.color = h.color === c ? null : c; return h; });
    if (r) put(r.next, r.sel);
  }

  /* 효과·퇴장: 걸고 닫으면서 그 자리부터 다시 써 보인다 */
  function applyFx(fx) {
    const r = change((h) => { h.fx = fx; h.keep = false; return h; });
    if (!r) return;
    put(r.next, r.sel);
    const needle = E.stripMarks(r.next.slice(r.sel[0], r.sel[1])).replace(/\s+/g, ' ').trim().slice(0, 14);
    close({ page: cur.page, needle });
  }

  function removeAll() {
    const blk = blockAtSel();
    if (!blk) return;
    put(S.unwrap(cur.ta.value, blk), [blk.os, blk.os + (blk.cs - blk.oe)]);
  }

  window.GeulInplace = { open, close, editing: () => !!cur };
})();
