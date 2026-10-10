/*
 * 글결 합본 결 보기
 * 원문을 엔진으로 읽어 글자는 네모로, 문장부호는 그대로, 구조는 표시로 그린다(가림판의 그림).
 * 쪽 나눔은 겹줄과 쪽 번호, 문단 사이는 빈 칸, 두 칸 이상 띄어쓰기는 쉼 막대, 블록은 밑줄, 장면 줄은 이름표.
 * 함께 규칙별 쓰임 수(쪽·쉼·문단·강조)를 돌려준다. 전역 GeulGyeol.
 */
(function (global) {
  'use strict';
  const E = global.Geulgyeol;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* box 안을 text의 결로 채운다. 돌려주는 값 {pages, rests, paras, marks} */
  function draw(box, text) {
    const parsed = E.parse(text);
    const pages = E.pages(parsed);
    const frag = document.createDocumentFragment();
    let page = 0;
    let rests = 0;
    let marks = 0;
    let paras = 0;
    const blocks = new Set();
    const groundName = (g) => Object.keys(E.GROUNDS).find((k) => E.GROUNDS[k] === g) || g;

    if (!parsed.paragraphs.length) {
      frag.append(el('p', 'g-empty', '글을 놓으면 여기서 결이 보여요.'));
      box.replaceChildren(frag);
      return { pages: 0, rests: 0, paras: 0, marks: 0 };
    }

    parsed.paragraphs.forEach((para, pi) => {
      const turn = pi === 0 || para.pageStart || para.rows.some((r) => r.sceneMark);
      if (turn && !(pi > 0 && parsed.paragraphs[pi - 1].sceneOnly)) {
        page++;
        const pg = pages[page - 1];
        const rule = el('div', 'g-page' + (pi === 0 ? ' first' : ''));
        rule.append(el('span', 'g-pn', String(page)));
        if (pg) rule.append(el('span', 'g-scene', `${pg.scene === 'night' ? '밤' : '낮'} · ${groundName(pg.ground)}`));
        frag.append(rule);
      } else if (pi > 0 && !para.sceneOnly) {
        paras++;
        frag.append(el('div', 'g-gap'));
      }
      para.rows.forEach((line) => {
        if (line.sceneMark) return;
        const row = el('div', 'g-ln');
        if (line.indent) row.style.paddingLeft = Math.min(line.indent * 0.5, 8) + 'em';
        line.tokens.forEach((tk, i) => {
          if (i) {
            const sp = el('span', 'g-sp', ' ');
            if (tk.gap > 1) {
              sp.classList.add('rest');
              sp.style.setProperty('--n', String(tk.gap - 1));
              rests++;
            }
            row.append(sp);
          }
          const w = el('span', 'g-tk');
          w.dataset.role = tk.role;
          tk.cells.forEach((c) => {
            const node = E.isPunct(c.ch) ? el('span', 'g-p', c.ch) : el('i', 'g-m');
            if (c.em) {
              node.classList.add('em');
              if (!blocks.has(pi + ':' + c.block)) {
                blocks.add(pi + ':' + c.block);
                marks++;
                w.append(el('span', 'g-fx', c.fx));
              }
            }
            w.append(node);
          });
          row.append(w);
        });
        frag.append(row);
      });
    });
    box.replaceChildren(frag);
    return { pages: pages.length, rests, paras, marks };
  }

  global.GeulGyeol = { draw };
})(typeof window !== 'undefined' ? window : globalThis);
