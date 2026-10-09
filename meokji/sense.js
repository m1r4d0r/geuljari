/*
 * 글결 먹지판 글 읽기
 * 가리지 않은 원문을 이 브라우저 안에서만 읽어 1차 안의 재료를 만든다. 글은 어디로도 보내지 않는다.
 * - 생김새(문장 길이, 빈 줄, 띄어쓰기)는 엔진이 판정하고, 여기서는 낱말을 읽어 제안 거리를 찾는다.
 *   심상 낱말 추정, 반전 자리 후보, 강조 문장 후보, 문장별 효과 제안.
 * - compose: 원문에 고른 강조·받아들인 제안·반전 자리를 블록 문법으로 넣는다.
 * 전역 GeulSense.
 */
(function (global) {
  'use strict';

  /* 심상 낱말마다 글에서 세는 말 */
  const LEX = {
    '따뜻한': /따뜻|데워|데운|온기|햇살|불빛|포근/g,
    '차가운': /차갑|차가|식었|식어|얼어|얼음|서늘|겨울/g,
    '젖은': /젖|축축|번지|번진|번져|스미|스며|잉크|눈물|빗/g,
    '마른': /마르|말라|마른|바삭|건조/g,
    '고요한': /고요|조용|적막|숨을 고르|지워진|느린|천천히/g,
    '숨찬': /급하|서둘|빨리|즉시|숨차|헐떡|달려/g,
    '먼': /멀리|먼 |오래|기억|아득|그때/g,
    '가까운': /곁에|가까|손안|손바닥|닿/g,
    '새벽': /밤|새벽|어둠|어두|자정|별빛/g,
    '한낮': /한낮|햇빛|햇볕|오후|정오|아침/g,
    '물': /빗물|물방울|강물|바다|파도|방울|물결/g,
    '종이': /종이|편지|펜|연필|만년필|봉투|우표|글자|문장/g
  };
  const NIGHT = /밤|새벽|어둠|어두|자정|별빛|불을 끄/;
  const DAY = /아침|햇빛|햇볕|한낮|오후|정오|해가 뜨|날이 밝/;
  /* 낱말로 고르는 효과 제안. 앞에 있는 것부터 본다. */
  const SUGGEST = [
    { fx: '번짐', re: /번지|번진|번져|스미|스며|젖은|젖어|흐려/ },
    { fx: '흘러내림', re: /떨어지|떨어졌|흘러|쏟아|무너|내려앉/ },
    { fx: '떨림', re: /떨리|떨렸|흔들|두근|덜컥/ }
  ];
  const MARK_RE = /\{\{|\}\}|\[\[|\]\]/;
  const SENT_RE = /[^.?!…。]*[.?!…。]+["'”’」』)\]]*|[^.?!…。]+$/g;

  const letters = (s) => s.replace(/\s/g, '').length;

  /* 줄마다 {i, start, text}와 쪽 번호(빈 줄 둘 이상에서 넘어감), 문단 번호(빈 줄에서 넘어감) */
  function lines(text) {
    const out = [];
    let o = 0;
    let page = 0;
    let para = 0;
    let blank = 0;
    String(text).split('\n').forEach((t, i) => {
      const empty = !t.trim();
      if (empty) blank++;
      else {
        if (out.some((l) => !l.empty)) {
          if (blank >= 2) page++;
          if (blank >= 1) para++;
        }
        blank = 0;
      }
      out.push({ i, start: o, text: t, empty, page, para });
      o += t.length + 1;
    });
    return out;
  }

  function sentences(text) {
    const out = [];
    lines(text).forEach((ln) => {
      if (ln.empty) return;
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

  function guessMoods(text) {
    const counts = Object.keys(LEX).map((w, k) => ({ w, k, n: (String(text).match(LEX[w]) || []).length }));
    return counts.filter((c) => c.n > 0).sort((a, b) => b.n - a.n || a.k - b.k).slice(0, 3).map((c) => c.w);
  }

  /*
   * 강조할 한 문장 후보: 긴 문장 바로 뒤에 오는 짧은 문장, 문단을 닫는 짧은 문장일수록 앞에 둔다.
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
    const re = scene === '밤' ? DAY : NIGHT;
    const ls = lines(text).filter((l) => !l.empty);
    const firstOf = (p) => { const l = ls.find((x) => x.page === p); return l ? l.i : null; };
    const hit = ls.find((l) => l.page > 0 && re.test(l.text));
    if (hit) return firstOf(hit.page);
    const pages = ls.length ? ls[ls.length - 1].page + 1 : 0;
    return pages >= 3 ? firstOf(Math.floor(pages / 2)) : null;
  }

  /* 낱말로 찾은 효과 제안. 쪽마다 하나, 모두 다섯까지. 고른 강조 문장과 겹치는 문장은 뺀다. */
  function suggestions(text, focus) {
    const out = [];
    const used = new Set();
    sentences(text).forEach((s) => {
      if (out.length >= 5 || used.has(s.page) || MARK_RE.test(s.text)) return;
      if (focus && s.start < focus.end && focus.start < s.end) return;
      let fx = null;
      let why = '';
      const words = s.text.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter((w) => w.length > 1);
      const rep = words.find((w) => words.filter((x) => x === w).length >= 3);
      const commas = (s.text.match(/,/g) || []).length;
      if (rep) { fx = '숨가쁨'; why = `“${rep}” 세 번`; }
      else if (commas >= 3) { fx = '숨가쁨'; why = `쉼표 ${commas}`; }
      else {
        const hit = SUGGEST.find((r) => r.re.test(s.text));
        if (hit) { fx = hit.fx; why = `“${s.text.match(hit.re)[0]}”`; }
      }
      if (!fx) return;
      used.add(s.page);
      out.push({ id: s.start, start: s.start, end: s.end, text: s.text, fx, why, page: s.page });
    });
    return out;
  }

  /*
   * 원문에 표시를 넣는다. plan: { focus, accepted: [{start, end, text, fx}], turnLine, turnScene }
   * 범위는 원문 그대로일 때만 쓰고(글이 바뀌었으면 버림), 고른 강조와 겹치는 제안은 넣지 않는다.
   * 같은 자리에 여럿이 들어가면 장면 줄 → 닫는 표시 → 여는 표시 차례가 되도록 뒤에서부터 끼운다.
   */
  function compose(text, plan) {
    const p = plan || {};
    const edits = [];
    const fits = (r) => r && text.slice(r.start, r.end) === r.text;
    const wrap = (r, fx) => {
      edits.push({ at: r.start, s: '{{' + (fx && fx !== '떠오름' ? fx + ':' : ''), rank: 0 });
      edits.push({ at: r.end, s: '}}', rank: 1 });
    };
    const focus = fits(p.focus) ? p.focus : null;
    if (focus) wrap(focus, null);
    (p.accepted || []).forEach((a) => {
      if (!fits(a)) return;
      if (focus && a.start < focus.end && focus.start < a.end) return;
      wrap(a, a.fx);
    });
    if (p.turnLine != null) {
      const ln = lines(text)[p.turnLine];
      if (ln && !ln.empty) edits.push({ at: ln.start, s: `[[${p.turnScene}]]\n`, rank: 2 });
    }
    edits.sort((x, y) => y.at - x.at || x.rank - y.rank);
    let out = text;
    edits.forEach((e) => { out = out.slice(0, e.at) + e.s + out.slice(e.at); });
    return out;
  }

  global.GeulSense = { lines, sentences, guessMoods, emphasisCandidates, turnCandidate, suggestions, compose, letters };
})(typeof window !== 'undefined' ? window : globalThis);
