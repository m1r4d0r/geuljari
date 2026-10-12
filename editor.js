/*
 * 글결 편집창
 * 투명한 입력창(textarea) 뒤에 같은 글을 같은 글꼴·폭으로 그려 표시만 보이게 한다. 두 층은 글자 자리가 같아야 하므로
 * 표시층은 글자를 한 자도 더하거나 빼지 않고 감싸기만 한다.
 *   블록 표시 글자는 옅게, 강조 안 글은 물결 밑줄과 번진 면(이름 없는 강조는 더 진한 면),
 *   꾸밈은 글자 폭이 바뀌지 않는 모양으로(굵게는 겹친 그림자, 기울임·밑줄·취소선·색은 그대로),
 *   쪽 표시 줄은 면, 어절 사이 두 번째 칸부터는 빈 네모, 끊을 자리(｜)는 가는 연필색 세로선, 쪽이 바뀌는 자리에는 겹줄과 쪽 번호, 다크 쪽 글줄은 밝은 글자.
 * 글 화면과 미리보기의 '강조' 판이 함께 쓴다. 전역 GeulEditor.
 */
(function (global) {
  'use strict';
  const E = global.Geulgyeol;
  const S = global.GeulSense;

  const TOKEN_RE = new RegExp(`\\{\\{(?:(${E.HEAD_SRC}):)?|\\}\\}`, 'g');

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
    /* 블록 차례(글 안에서 몇 번째 {{인지). 블록의 글·표시 칸에 data-b로 달아 미리보기 안 고치기가 찾는다 */
    let bi = -1;
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
      const emOpen = () => {
        const h = open.head;
        const cls = [open.em ? 'm-em' : 'm-st'];
        if (open.em && !h.fx) cls.push('focus');
        h.styles.forEach((w) => cls.push('m-s' + E.STYLES[w]));
        let style = '';
        if (h.color && E.COLORS[h.color]) cls.push('m-c-' + E.COLORS[h.color]);
        else if (h.color) style = ` style="color:${h.color}"`;
        return `<span class="${cls.join(' ')}" data-b="${open.b}"${style}>`;
      };
      let html = open ? emOpen() : '';
      const textPart = (a, b) => esc(line.slice(a, b)).replace(/(\S) ( +)/g, (all, c, more) => c + ' ' + more.split('').map(() => '<span class="m-sp"> </span>').join(''))
        .split(E.BREAK).join(`<span class="m-brk">${E.BREAK}</span>`);
      const lead = line.match(/^[^\S\n]*/)[0].length;
      html += esc(line.slice(0, lead));
      let i = lead;
      TOKEN_RE.lastIndex = lead;
      let m;
      while ((m = TOKEN_RE.exec(line))) {
        html += textPart(i, m.index);
        if (m[0] === '}}') {
          html += (open ? '</span>' : '') + `<span class="m-mark"${open ? ` data-b="${open.b}"` : ''}>}}</span>`;
          open = null;
        } else {
          html += (open ? '</span>' : '') + `<span class="m-mark" data-b="${bi + 1}">${esc(m[0])}</span>`;
          const head = E.parseHead(m[1] || '');
          open = { head, em: !!(head.fx || head.keep || !m[1]), b: ++bi };
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
      if (!quiet && o.onInput) o.onInput(ta.value);
      api.draw();
    });
    ta.addEventListener('scroll', () => { mirror.scrollTop = ta.scrollTop; if (o.onScroll) o.onScroll(); });
    new ResizeObserver(() => api.draw()).observe(ta);
    /* 웹 글꼴이 늦게 들어오면 글줄 자리가 바뀌므로 다시 그린다(쪽 면·구분선이 글과 어긋나지 않게) */
    if (document.fonts) {
      document.fonts.ready.then(() => api.draw());
      document.fonts.addEventListener('loadingdone', () => api.draw());
    }
    return api;
  }

  global.GeulEditor = { TOKEN_RE, esc, markup, attach };
})(typeof window !== 'undefined' ? window : globalThis);
