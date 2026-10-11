/*
 * 글결 미리보기 안에서 고치기
 * 편집실 미리보기(view.html, iframe)에서 글 상자를 두 번 누르면 그 자리에 같은 폭·같은 글꼴의 편집창을 띄운다.
 * 글은 편집실에서 그 쪽 몫만 받아 오고(geulgyeol:edit-req → edit-slice), 고칠 때마다 돌려보낸다(geulgyeol:edit).
 * 꾸밈 막대는 편집실 하단바의 '고른 곳' 갈래다. 고른 곳이 바뀌면 그 모습을 알리고(geulgyeol:sel),
 * 하단바에서 고른 것을 받아(geulgyeol:ip) 고른 곳에 건다: 강조(등장·머묾), 퇴장, 꾸밈(굵게·기울임·밑줄·취소선), 색, 빼기.
 * 끝내기는 글 상자 아래 오른쪽 모서리의 두 단추다. X는 고치기 전 글로 되돌리고, 체크(와 Esc)는 고친 대로 둔다.
 * 닫으면 편집실이 그 쪽을 다시 그린다(geulgyeol:edit-done). 효과·퇴장을 고쳤으면 마지막으로 고친 자리부터 다시 써 보인다.
 * 전역 GeulInplace.
 */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  const S = window.GeulSense;
  const ED = window.GeulEditor;
  if (!E || !S || !ED || window.parent === window) return;

  const tell = (msg) => window.parent.postMessage(msg, location.origin);
  let cur = null;
  let pending = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function icon(btn, label, path, w) {
    btn.type = 'button';
    btn.setAttribute('aria-label', label);
    btn.innerHTML = `<svg aria-hidden="true" width="${w}" height="14" viewBox="0 0 ${w + 2} 16"><path d="${path}" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
    return btn;
  }

  function open(col, page) {
    if (cur || pending) return;
    window.postMessage({ type: 'geulgyeol:finish' }, location.origin);
    pending = { col, page };
    tell({ type: 'geulgyeol:edit-req', page });
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data) return;
    const d = e.data;
    if (d.type === 'geulgyeol:edit-slice' && pending && d.page === pending.page) {
      const p = pending;
      pending = null;
      if (typeof d.text === 'string') build(p.col, p.page, d.text);
    } else if (d.type === 'geulgyeol:ip' && cur && e.source === window.parent) {
      command(d);
    }
  });

  /* ---------- 편집창 ---------- */

  function build(col, page, text) {
    const box = el('div', 'ip');
    box.style.left = col.offsetLeft + 'px';
    box.style.top = col.offsetTop + 'px';
    box.style.width = col.offsetWidth + 'px';
    const frame = el('div', 'ip-frame');
    const acts = el('div', 'ip-acts');
    const undo = icon(el('button'), '고치기 전으로 돌리고 닫기', 'M3 3 L13 13 M13 3 L3 13', 14);
    const keep = icon(el('button'), '고친 대로 두기', 'M2 8.5 L7 13 L16 3', 16);
    acts.append(undo, keep);
    frame.append(acts);
    const mirror = el('div', 'ip-mirror');
    mirror.setAttribute('aria-hidden', 'true');
    const ta = el('textarea', 'ip-input');
    ta.spellcheck = false;
    ta.setAttribute('aria-label', `${page + 1}쪽 글`);
    box.append(frame, mirror, ta);
    col.parentElement.append(box);
    col.classList.add('ip-hidden');
    ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'touchstart', 'click'].forEach((t) => box.addEventListener(t, (e) => e.stopPropagation()));

    const ed = ED.attach(ta, mirror, { onInput() { send(); report(); } });
    ed.firstPage = page;
    ta.value = text;
    ed.draw();
    cur = { col, page, box, ta, ed, before: text, replay: null, last: '' };
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);

    undo.addEventListener('click', () => close(false));
    keep.addEventListener('click', () => close(true));
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(true); }
    });
    document.addEventListener('selectionchange', report);
    tell({ type: 'geulgyeol:edit-open', page });
    report();
  }

  function send() {
    if (cur) tell({ type: 'geulgyeol:edit', text: cur.ta.value });
  }

  /* keep: 고친 대로 둔다. 아니면 고치기 전 글로 되돌린다 */
  function close(keep) {
    if (!cur) return;
    const c = cur;
    cur = null;
    document.removeEventListener('selectionchange', report);
    tell({ type: 'geulgyeol:edit', text: keep ? c.ta.value : c.before });
    c.box.remove();
    c.col.classList.remove('ip-hidden');
    tell({ type: 'geulgyeol:edit-done', page: c.page, replay: keep ? c.replay : null });
  }

  /* ---------- 고른 곳 ---------- */

  function blockAtSel() {
    const a = cur.ta.selectionStart;
    const b = cur.ta.selectionEnd;
    return S.blocks(cur.ta.value).find((k) => k.os <= a && b <= k.ce) || null;
  }

  /* 고른 곳의 모습을 하단바에 알린다. 바뀐 때만 */
  function report() {
    if (!cur) return;
    const { ta } = cur;
    const blk = blockAtSel();
    const on = ta.selectionStart !== ta.selectionEnd || !!blk;
    const h = blk ? blk.head : null;
    const msg = {
      type: 'geulgyeol:sel', on,
      head: h ? { fx: h.fx || null, em: !!blk.em, styles: h.styles.slice(), color: h.color || null } : null
    };
    const key = JSON.stringify(msg);
    if (key === cur.last) return;
    cur.last = key;
    tell(msg);
  }

  /* 고친 글을 편집창에 넣고 편집실에 보낸다. sel: 그 뒤에 고를 범위 */
  function put(next, sel) {
    const { ta, ed } = cur;
    ed.set(next, sel);
    ta.focus({ preventScroll: true });
    if (sel) ta.setSelectionRange(sel[0], sel[1]);
    send();
    report();
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

  /*
   * 하단바에서 온 것: {act:'em', v: 효과 이름 | '' 이름 없는 강조 | null 강조 빼기}, {act:'exit', v: 퇴장 이름 | null},
   * {act:'style', v: 꾸밈 이름(켜고 끔)}, {act:'color', v: 색 이름 | null}, {act:'off'} 표시 빼기
   */
  function command(d) {
    if (d.act === 'off') { removeAll(); return; }
    const r = change((h, blk) => {
      const exitNow = !!(h.fx && E.BLOCKS[h.fx].exit);
      const emNow = !!blk && blk.em && !exitNow;
      if (d.act === 'em' || d.act === 'exit') {
        if (d.v) { h.fx = d.v; h.keep = false; } else if (d.act === 'em' && d.v === '') { h.fx = null; h.keep = true; } else if (d.act === 'em' ? emNow : exitNow) { h.fx = null; h.keep = false; }
      } else if (d.act === 'style') {
        const i = h.styles.indexOf(d.v);
        if (i >= 0) h.styles.splice(i, 1); else h.styles.push(d.v);
        if (emNow && !h.fx) h.keep = true;
      } else if (d.act === 'color') {
        h.color = d.v || null;
        if (emNow && !h.fx) h.keep = true;
      }
      return h;
    });
    if (!r) return;
    put(r.next, r.sel);
    if ((d.act === 'em' || d.act === 'exit') && d.v) {
      const needle = E.stripMarks(r.next.slice(r.sel[0], r.sel[1])).replace(/\s+/g, ' ').trim().slice(0, 14);
      cur.replay = { page: cur.page, needle };
    }
  }

  function removeAll() {
    const blk = blockAtSel();
    if (!blk) return;
    put(S.unwrap(cur.ta.value, blk), [blk.os, blk.os + (blk.cs - blk.oe)]);
  }

  window.GeulInplace = { open, close, editing: () => !!cur || !!pending };
})();
