/*
 * 글결 글 읽기
 * 가리지 않은 원문을 이 브라우저 안에서만 읽어 1차 안의 재료를 만든다. 글은 어디로도 보내지 않는다.
 * 본문 하나가 모든 것을 담는다: 쪽 표시 줄 [[…]](장면·바탕·넘김·자리), 강조는 이름 없는 {{…}}, 효과·꾸밈은 {{떨림+굵게:…}}.
 * 반전은 장면이 적힌 첫 쪽 표시 줄이다. 장면 이름은 라이트·다크로 쓴다.
 * - 짐작: 심상 낱말, 반전 자리, 남기고 싶은 곳 후보, 문장별 효과 제안.
 * - 고치기: 반전 줄 옮기기, 쪽마다 넘김·자리 정하기, 강조 바꾸기, 효과·꾸밈 감싸기·벗기기·바꾸기, 긴 쪽 나누기.
 * 전역 GeulSense.
 */
(function (global) {
  'use strict';

  const E = global.Geulgyeol;

  /* 심상 낱말마다 글에서 세는 말 */
  const LEX = {
    '따뜻한': /따뜻|데워|데운|온기|햇살|불빛|포근/g,
    '차가운': /차갑|차가|식었|식어|얼어|얼음|서늘|겨울/g,
    '젖은': /젖|축축|번지|번진|번져|스미|스며|잉크|눈물|빗/g,
    '마른': /마르|말라|마른|바삭|건조/g,
    '고요한': /고요|조용|적막|숨을 고르|지워진|느린|천천히/g,
    '숨찬': /급하|서둘|빨리|즉시|숨차|헐떡|달려/g
  };
  const NIGHT = /밤|새벽|어둠|어두|자정|별빛|불을 끄/;
  const DAY = /아침|햇빛|햇볕|한낮|오후|정오|해가 뜨|날이 밝/;
  /* 낱말로 고르는 효과 제안. 앞에 있는 것부터 본다. */
  const SUGGEST = [
    { fx: '번짐', re: /번지|번진|번져|스미|스며|젖은|젖어|흐려/ },
    { fx: '흘러내림', re: /떨어지|떨어졌|흘러|쏟아|무너|내려앉/ },
    { fx: '떨림', re: /떨리|떨렸|흔들|두근|덜컥/ }
  ];
  const PAGE_LIMIT = 240;    // 공백 빼고 이보다 긴 쪽은 1차 안에서 나눈다
  const PAGE_MIN = 50;       // 나눈 뒤 한쪽이 이보다 짧아지면 나누지 않는다
  const MARK_RE = /\{\{|\}\}|\[\[|\]\]/;
  const SENT_RE = /[^.?!…。]*[.?!…。]+["'”’」』)\]]*|[^.?!…。]+$/g;
  const SCENE_RE = E.SCENE_LINE_RE;
  const NAMES = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
  const SCENE_NAME = NAMES(E.SCENES);
  const GROUND_NAME = NAMES(E.GROUNDS);
  const TURN_NAME = NAMES(E.TURNS);
  const PLACE_NAME = NAMES(E.PLACES);
  const TOKEN_RE = new RegExp(`\\{\\{(?:(${E.HEAD_SRC}):)?|\\}\\}`, 'g');

  const letters = (s) => s.replace(/\s/g, '').length;
  const plain = (s) => E.stripMarks(s);

  /*
   * 줄마다 {i, start, text, empty, scene, page, para}.
   * 쪽은 빈 줄 둘 이상이나 장면 줄에서 넘어가고, 문단은 빈 줄에서 넘어간다.
   */
  function lines(text) {
    const out = [];
    let o = 0;
    let page = 0;
    let para = 0;
    let blank = 0;
    let seen = false;
    let sceneOpen = false;
    String(text).split('\n').forEach((t, i) => {
      const empty = !t.trim();
      const scene = !empty && SCENE_RE.test(t);
      if (empty) blank++;
      else {
        if (seen) {
          if ((blank >= 2 || scene) && !sceneOpen) page++;
          if (blank >= 1 || scene) para++;
        }
        sceneOpen = scene;
        if (!scene) seen = true;
        blank = 0;
      }
      out.push({ i, start: o, text: t, empty, scene, page, para });
      o += t.length + 1;
    });
    return out;
  }

  function sentences(text) {
    const out = [];
    lines(text).forEach((ln) => {
      if (ln.empty || ln.scene) return;
      SENT_RE.lastIndex = 0;
      let m;
      while ((m = SENT_RE.exec(ln.text))) {
        const lead = m[0].match(/^\s*/)[0].length;
        const raw = m[0].slice(lead).replace(/\s+$/, '');
        if (raw) {
          const start = ln.start + m.index + lead;
          out.push({ start, end: start + raw.length, text: raw, line: ln.i, page: ln.page, para: ln.para });
        }
      }
    });
    return out;
  }

  /*
   * 본문 안의 블록 {os, oe, cs, ce, fx, named, head}. 문단 끝에서 닫히지 않은 블록은 빼고 센다.
   * head는 머리를 읽은 {fx, keep, styles, color}, em은 강조(효과가 있거나 이름 없는 강조)인지, named는 효과 이름이 적혔는지.
   */
  function blocks(text) {
    const out = [];
    let open = null;
    let m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(text))) {
      if (m[0] === '}}') {
        if (open) out.push(Object.assign(open, { cs: m.index, ce: m.index + 2 }));
        open = null;
      } else {
        const head = E.parseHead(m[1] || '');
        open = { os: m.index, oe: m.index + m[0].length, head, fx: head.fx || E.BLOCK_DEFAULT, named: !!head.fx, em: !!(head.fx || head.keep || !m[1]) };
      }
    }
    return out.filter((b) => !/\n[^\S\n]*\n/.test(text.slice(b.os, b.ce)));
  }

  function guessMoods(text) {
    const t = plain(text);
    const counts = Object.keys(LEX).map((w, k) => ({ w, k, n: (t.match(LEX[w]) || []).length }));
    return counts.filter((c) => c.n > 0).sort((a, b) => b.n - a.n || a.k - b.k).slice(0, 3).map((c) => c.w);
  }

  /*
   * 남기고 싶은 곳 후보: 긴 문장 바로 뒤에 오는 짧은 문장, 문단을 닫는 짧은 문장일수록 앞에 둔다.
   * 표시가 이미 들어 있는 문장은 고르지 않는다.
   */
  function emphasisCandidates(text) {
    const ss = sentences(text);
    const out = [];
    ss.forEach((s, k) => {
      const n = letters(s.text);
      if (n < 3 || n > 14 || MARK_RE.test(s.text)) return;
      const prev = k > 0 && ss[k - 1].para === s.para ? ss[k - 1] : null;
      const next = ss[k + 1];
      const closes = !next || next.para !== s.para;
      let score = prev ? letters(prev.text) / n : 0;
      if (closes) score = score * 1.3 + 0.5;
      if (score >= 2) out.push(Object.assign({ score }, s));
    });
    return out.sort((a, b) => b.score - a.score);
  }

  /*
   * 반전 자리 후보: 처음 장면과 반대되는 시간의 낱말이 처음 나오는 쪽(첫 쪽 빼고)의 첫 줄.
   * 그런 낱말이 없으면 세 쪽 이상일 때 가운데 쪽의 첫 줄. 돌려주는 값은 줄 번호(없으면 null).
   */
  function turnCandidate(text, scene) {
    const re = scene === '다크' ? DAY : NIGHT;
    const ls = lines(text).filter((l) => !l.empty && !l.scene);
    const firstOf = (p) => { const l = ls.find((x) => x.page === p); return l ? l.i : null; };
    const hit = ls.find((l) => l.page > 0 && re.test(l.text));
    if (hit) return firstOf(hit.page);
    const pages = ls.length ? ls[ls.length - 1].page + 1 : 0;
    return pages >= 3 ? firstOf(Math.floor(pages / 2)) : null;
  }

  /* 낱말로 찾은 효과 제안. 쪽마다 하나, 모두 다섯까지. 이미 표시가 걸친 문장은 뺀다. */
  function suggestions(text) {
    const out = [];
    const used = new Set();
    const bl = blocks(text);
    sentences(text).forEach((s) => {
      if (out.length >= 5 || used.has(s.page) || MARK_RE.test(s.text)) return;
      if (bl.some((b) => s.start < b.ce && b.os < s.end)) return;
      let fx = null;
      let why = '';
      const words = s.text.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter((w) => w.length > 1);
      const rep = words.find((w) => words.filter((x) => x === w).length >= 3);
      if (rep) { fx = '떨림'; why = `“${rep}” 세 번`; }
      else {
        const hit = SUGGEST.find((r) => r.re.test(s.text));
        if (hit) { fx = hit.fx; why = `“${s.text.match(hit.re)[0]}”`; }
      }
      if (!fx) return;
      used.add(s.page);
      out.push({ start: s.start, end: s.end, text: s.text, fx, why, page: s.page });
    });
    return out;
  }

  /* ---------- 고치기: 모두 새 본문을 돌려준다 ---------- */

  function cut(text, a, b) { return text.slice(0, a) + text.slice(b); }

  /* 블록 표시만 걷어 낸다(안의 글은 남김) */
  function unwrap(text, blk) {
    return cut(cut(text, blk.cs, blk.ce), blk.os, blk.oe);
  }

  /*
   * start~end를 fx 효과로 감싼다(fx가 없으면 이름 없는 {{…}} = 남기고 싶은 곳).
   * 걸치는 블록은 먼저 걷고, 빈 줄을 넘는 범위는 문단마다 따로 감싼다. 감싼 뒤 범위 {text, start, end}.
   */
  function wrap(text, start, end, fx) {
    let t = text;
    let a = start;
    let b = end;
    blocks(t).filter((k) => k.os < b && a < k.ce).sort((x, y) => y.os - x.os).forEach((k) => {
      const lenO = k.oe - k.os;
      const lenC = k.ce - k.cs;
      t = unwrap(t, k);
      const shift = (p) => p - (p > k.cs ? Math.min(lenC, p - k.cs) : 0) - (p > k.os ? Math.min(lenO, p - k.os) : 0);
      a = shift(a);
      b = shift(b);
    });
    const open = '{{' + (fx ? fx + ':' : '');
    const segs = [];
    const re = /\n[^\S\n]*\n/g;
    let from = a;
    let m;
    re.lastIndex = a;
    while ((m = re.exec(t)) && m.index < b) {
      segs.push([from, m.index]);
      from = m.index + m[0].length;
      re.lastIndex = from;
    }
    segs.push([from, b]);
    const ranges = segs.map(([s, e]) => {
      while (s < e && /\s/.test(t[s])) s++;
      while (e > s && /\s/.test(t[e - 1])) e--;
      return [s, e];
    }).filter(([s, e]) => e > s);
    if (!ranges.length) return { text, start, end };
    for (let k = ranges.length - 1; k >= 0; k--) {
      const [s, e] = ranges[k];
      t = t.slice(0, s) + open + t.slice(s, e) + '}}' + t.slice(e);
    }
    const last = ranges[ranges.length - 1];
    return { text: t, start: ranges[0][0], end: last[1] + (open.length + 2) * ranges.length };
  }

  /* 블록 머리를 바꾼다(빈 머리면 이름 없는 강조). 머리에 아무것도 없고 강조도 아니면 표시를 걷는다 */
  function setHead(text, blk, head) {
    const h = Object.assign({ fx: null, keep: false, styles: [], color: null }, head);
    if (!h.fx && !h.keep && !h.styles.length && !h.color) return unwrap(text, blk);
    const word = E.headText(h);
    return text.slice(0, blk.os) + '{{' + (word ? word + ':' : '') + text.slice(blk.oe);
  }

  /* 남기고 싶은 곳(이름 없는 블록)을 모두 걷고 start~end에 새로 감싼다. start가 null이면 걷기만. */
  function setFocus(text, start, end) {
    let t = text;
    let a = start;
    let b = end;
    blocks(t).filter((k) => k.em && !k.named).sort((x, y) => y.os - x.os).forEach((k) => {
      t = unwrap(t, k);
      if (a != null) {
        const shift = (p) => p - (p > k.cs ? Math.min(2, p - k.cs) : 0) - (p > k.os ? Math.min(k.oe - k.os, p - k.os) : 0);
        a = shift(a);
        b = shift(b);
      }
    });
    return a == null ? t : wrap(t, a, b, null).text;
  }

  /* 지금 남기고 싶은 곳의 글(띄어쓰기 그대로, 여러 조각이면 이어서) */
  function focusText(text) {
    return blocks(text).filter((k) => k.em && !k.named).map((k) => text.slice(k.oe, k.cs)).join(' ');
  }

  /* 쪽 표시 줄 → {scene, ground, turn, place}(한글 이름, 없으면 null) */
  function readMarkLine(textLine) {
    const m = textLine.match(SCENE_RE);
    if (!m) return null;
    const k = E.readMark(m[1]);
    return { scene: SCENE_NAME[k.scene] || null, ground: GROUND_NAME[k.ground] || null, turn: TURN_NAME[k.turn] || null, place: PLACE_NAME[k.place] || null,
      size: k.size ? Math.round(k.size * 100) : null, measure: k.measure || null };
  }
  /* {scene, ground, turn, place, size(%), measure(자)} → 쪽 표시 줄(다 비면 빈 문자열) */
  function markLine(mk) {
    const parts = [mk.scene, mk.ground, mk.turn, mk.place, mk.size ? '크기' + mk.size : null, mk.measure ? '폭' + mk.measure : null].filter(Boolean);
    return parts.length ? `[[${parts.join(':')}]]` : '';
  }

  /* 줄 하나를 바꾼다(빈 문자열이면 그 줄을 지운다) */
  function setLine(text, ln, next) {
    const e = ln.start + ln.text.length;
    if (next) return text.slice(0, ln.start) + next + text.slice(e);
    return text.slice(0, ln.start) + text.slice(Math.min(text.length, e + 1));
  }

  /* 반전 줄: 장면이 적힌 첫 쪽 표시 줄의 줄 번호. 없으면 null */
  function turnLine(text) {
    const l = lines(text).find((x) => x.scene && readMarkLine(x.text).scene);
    return l ? l.i : null;
  }

  /*
   * 반전을 line 줄 앞으로 옮긴다. line이 null이면 지우기만. scene은 넣을 장면(라이트·다크).
   * 넘김은 장면이 바뀌는 자리의 것이므로 반전과 함께 옮긴다. 옛 줄에 자리 표시가 있으면 그것만 남긴다.
   * 새 자리가 이미 쪽 표시 줄이면 거기에 장면과 넘김을 더한다.
   */
  function setTurn(text, line, scene) {
    let t = text;
    let target = line;
    let carry = null;
    const old = turnLine(t);
    if (old != null) {
      if (old === target || old + 1 === target) target = target === old ? null : target;
      const ln = lines(t)[old];
      const mk = readMarkLine(ln.text);
      carry = mk.turn;
      const rest = markLine({ scene: null, ground: null, turn: null, place: mk.place });
      t = setLine(t, ln, rest);
      if (!rest && target != null && target > old) target--;
      if (old + 1 === line && rest) target = old;
    }
    if (target == null) return t;
    const ls = lines(t);
    const at = ls[target];
    if (!at || at.empty) return t;
    const prevMark = at.scene ? at : (ls[target - 1] && ls[target - 1].scene ? ls[target - 1] : null);
    if (prevMark) {
      const mk = readMarkLine(prevMark.text);
      return setLine(t, prevMark, markLine({ scene, ground: null, turn: carry || mk.turn, place: mk.place }));
    }
    return t.slice(0, at.start) + markLine({ scene, turn: carry }) + '\n' + t.slice(at.start);
  }

  /*
   * 쪽 page(0부터)의 쪽 표시 하나(key: turn·place)를 value로 정한다. value가 null이면 걷는다.
   * 그 쪽 첫 줄이 쪽 표시 줄이면 거기에 적고, 아니면 새 쪽 표시 줄을 넣는다. 첫 쪽에는 넘김이 없다.
   */
  function setPageMark(text, page, key, value) {
    if (key === 'turn' && page < 1) return text;
    const ls = lines(text);
    const first = ls.find((l) => !l.empty && l.page === page);
    if (!first) return text;
    if (first.scene) {
      const mk = readMarkLine(first.text);
      mk[key] = value;
      return setLine(text, first, markLine(mk));
    }
    if (!value) return text;
    return text.slice(0, first.start) + markLine({ [key]: value }) + '\n' + text.slice(first.start);
  }

  /* 쪽 page(0부터)에 적힌 쪽 표시 하나(key: turn·place·size·measure). 없으면 null */
  function pageMark(text, page, key) {
    const first = lines(text).find((l) => !l.empty && l.page === page);
    return first && first.scene ? readMarkLine(first.text)[key] : null;
  }

  /*
   * 긴 쪽 나누기: 공백 빼고 PAGE_LIMIT자를 넘는 쪽을 가운데에 가까운 줄 경계(문단 경계를 조금 더 좋아함)에서 나눈다.
   * 줄 경계가 없으면 가운데에 가까운 문장 끝에서 줄을 바꿔 나눈다. 블록 안은 나누지 않는다. {text, count}
   */
  function autoBreaks(text) {
    let t = text;
    let count = 0;
    for (let guard = 0; guard < 24; guard++) {
      const ls = lines(t);
      const pages = new Map();
      ls.forEach((l) => {
        if (l.empty || l.scene) return;
        if (!pages.has(l.page)) pages.set(l.page, []);
        pages.get(l.page).push(l);
      });
      let edit = null;
      for (const [, pl] of pages) {
        const sizes = pl.map((l) => letters(plain(l.text)));
        const total = sizes.reduce((a, b) => a + b, 0);
        if (total <= PAGE_LIMIT) continue;
        let best = null;
        let before = 0;
        pl.forEach((l, k) => {
          if (k > 0 && !insideBlock(t, l.start)) {
            const prevBlank = ls[l.i - 1] && ls[l.i - 1].empty;
            const score = Math.min(before, total - before) * (prevBlank ? 1.15 : 1);
            if (Math.min(before, total - before) >= PAGE_MIN && (!best || score > best.score)) best = { score, at: l.start, line: l.i };
          }
          before += sizes[k];
        });
        if (best) {
          let blanks = 0;
          for (let i = best.line - 1; i >= 0 && ls[i].empty; i--) blanks++;
          edit = { at: best.at, s: '\n'.repeat(Math.max(0, 2 - blanks)) };
          if (!edit.s) edit = null;
        } else {
          const longest = pl[sizes.indexOf(Math.max(...sizes))];
          const ss = sentences(t).filter((s) => s.line === longest.i && !insideBlock(t, s.end));
          const half = letters(plain(longest.text)) / 2;
          let acc = 0;
          let pick = null;
          ss.forEach((s, k) => {
            acc += letters(plain(s.text));
            if (k < ss.length - 1 && acc >= PAGE_MIN && (!pick || Math.abs(acc - half) < Math.abs(pick.acc - half))) pick = { acc, end: s.end };
          });
          if (pick) {
            let e = pick.end;
            while (t[e] === ' ') e++;
            edit = { at: pick.end, s: '\n\n\n', del: e - pick.end };
          }
        }
        if (edit) break;
      }
      if (!edit) break;
      t = t.slice(0, edit.at) + edit.s + t.slice(edit.at + (edit.del || 0));
      count++;
    }
    return { text: t, count };
  }

  /* offset 자리가 블록 안인지 */
  function insideBlock(text, offset) {
    return blocks(text).some((b) => b.oe <= offset && offset < b.cs);
  }

  global.GeulSense = {
    SCENE_RE, lines, sentences, blocks, guessMoods, emphasisCandidates, turnCandidate, suggestions,
    unwrap, wrap, setHead, setFocus, focusText, readMarkLine, markLine, turnLine, setTurn, setPageMark, pageMark, autoBreaks, letters
  };
})(typeof window !== 'undefined' ? window : globalThis);
