/*
 * 글결 편집창
 * 투명한 입력창(textarea) 뒤에 같은 글을 같은 글꼴·폭으로 그려 표시만 보이게 한다. 두 층은 글자 자리가 같아야 하므로
 * 표시층은 글자를 한 자도 더하거나 빼지 않고 감싸기만 한다.
 *   블록 표시 글자는 옅게, 블록 안 글은 물결 밑줄과 번진 면(이름 없는 블록 '남길 곳'은 더 진한 면),
 *   쪽 표시 줄은 면, 어절 사이 두 번째 칸부터는 빈 네모, 쪽이 바뀌는 자리에는 겹줄과 쪽 번호, 다크 쪽 글줄은 밝은 글자.
 * 글 화면과 미리보기의 '강조' 판이 함께 쓴다. 전역 GeulEditor.
 */
(function (global) {
  'use strict';
  const E = global.Geulgyeol;
  const S = global.GeulSense;

  const NAME_ALT = E.BLOCK_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const TOKEN_RE = new RegExp(`\\{\\{(?:(${NAME_ALT}):)?|\\}\\}`, 'g');

  function esc(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /* 표시층 html. firstPage는 이 글의 첫 쪽 번호(쪽 하나만 고칠 때 쓴다), nights는 다크 쪽 번호 모음(없으면 칠하지 않음) */
  function markup(text, firstPage, nights) {
    const ls = S.lines(text);
    const base = firstPage || 0;
    const out = [];
    const pageMark = (n) => `<span class="m-page" data-n="${n + base}"></span>`;
    let open = null;
    let blank = 0;
    ls.forEach((ln, k) => {
      if (ln.empty) {
        blank++;
        let mark = '';
        if (blank === 1) {
          const run = ls.slice(k).findIndex((x) => !x.empty);
          const next = run >= 0 ? ls[k + run] : null;
          if (next && run >= 2 && ls.slice(0, k).some((x) => !x.empty && !x.scene)) mark = pageMark(next.page + 1);
        }
        open = null;
        out.push(mark + esc(ln.text));
        return;
      }
      const afterBreak = blank >= 2;
      blank = 0;
      if (ln.scene) {
        const mark = !afterBreak && ls.slice(0, k).some((x) => !x.empty && !x.scene) ? pageMark(ln.page + 1) : '';
        out.push(mark + `<span class="m-scene">${esc(ln.text)}</span>`);
        return;
      }
      const night = nights && nights.has(ln.page);
      const line = ln.text;
      const emOpen = () => `<span class="m-em${open && !open.named ? ' focus' : ''}">`;
      let html = open ? emOpen() : '';
      const textPart = (a, b) => esc(line.slice(a, b)).replace(/(\S) ( +)/g, (all, c, more) => c + ' ' + more.split('').map(() => '<span class="m-sp"> </span>').join(''));
      const lead = line.match(/^[^\S\n]*/)[0].length;
      html += esc(line.slice(0, lead));
      let i = lead;
      TOKEN_RE.lastIndex = lead;
      let m;
      while ((m = TOKEN_RE.exec(line))) {
        html += textPart(i, m.index);
        if (m[0] === '}}') {
          html += (open ? '</span>' : '') + '<span class="m-mark">}}</span>';
          open = null;
        } else {
          html += (open ? '</span>' : '') + `<span class="m-mark">${esc(m[0])}</span>`;
          open = { named: !!m[1] };
          html += emOpen();
        }
        i = m.index + m[0].length;
      }
      html += textPart(i, line.length);
      if (open) html += '</span>';
      out.push(night ? `<span class="m-night">${html}</span>` : html);
    });
    return out.join('\n') + (text.endsWith('\n') ? ' ' : '');
  }

  /*
   * ta(입력창)·mirror(표시층)를 묶는다. opts.onInput(value)는 사람이 고칠 때만 부른다.
   * opts.nights()는 다크 쪽 번호 모음, opts.onDraw()는 표시층을 다시 그린 뒤마다, opts.onScroll()은 굴릴 때마다 부른다
   * (쪽 면·구분선을 얹을 때).
   * 돌려주는 것: draw, set(text, sel) 실행 취소가 남도록 한 번에 갈아 끼움, rectAt(offset), reveal(offset), firstPage
   */
  function attach(ta, mirror, opts) {
    const o = opts || {};
    let quiet = false;
    const api = { firstPage: 0 };

    api.draw = () => {
      mirror.innerHTML = markup(ta.value, api.firstPage, o.nights ? o.nights() : null);
      mirror.scrollTop = ta.scrollTop;
      if (o.onDraw) o.onDraw();
    };

    api.set = (text, sel) => {
      if (ta.value === text) { if (sel) ta.setSelectionRange(sel[0], sel[1]); return; }
      const ro = ta.readOnly;
      ta.readOnly = false;
      const top = ta.scrollTop;
      quiet = true;
      ta.focus({ preventScroll: true });
      ta.select();
      let ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
      if (!ok || ta.value !== text) ta.value = text;
      quiet = false;
      ta.readOnly = ro;
      ta.scrollTop = top;
      if (sel) ta.setSelectionRange(sel[0], sel[1]);
      api.draw();
      if (sel) api.reveal(sel[0]);
    };

    /* 본문 offset 자리 글자의 화면 상자(표시층에서 잰다) */
    api.rectAt = (offset) => {
      const walker = document.createTreeWalker(mirror, NodeFilter.SHOW_TEXT);
      let left = offset;
      let node;
      while ((node = walker.nextNode())) {
        if (left < node.length) {
          const r = document.createRange();
          r.setStart(node, left);
          r.setEnd(node, left + 1);
          const b = r.getBoundingClientRect();
          return b.height ? b : null;
        }
        left -= node.length;
      }
      return null;
    };

    /* offset 자리가 안 보이면 굴려서 보인다 */
    api.reveal = (offset) => {
      const box = api.rectAt(offset);
      if (!box) return;
      const m = mirror.getBoundingClientRect();
      if (box.top < m.top + 20 || box.bottom > m.bottom - 40) {
        ta.scrollTop = Math.max(0, box.top - m.top + mirror.scrollTop - ta.clientHeight * 0.35);
        mirror.scrollTop = ta.scrollTop;
      }
    };

    ta.addEventListener('input', () => {
      api.draw();
      if (!quiet && o.onInput) o.onInput(ta.value);
    });
    ta.addEventListener('scroll', () => { mirror.scrollTop = ta.scrollTop; if (o.onScroll) o.onScroll(); });
    new ResizeObserver(() => api.draw()).observe(ta);
    return api;
  }

  global.GeulEditor = { TOKEN_RE, esc, markup, attach };
})(typeof window !== 'undefined' ? window : globalThis);
