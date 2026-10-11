/*
 * 글결 엔진
 * 빈 줄로 나뉜 덩어리를 문단으로 보고, 문단 안의 글자마다 등장 시각과 효과를 정한다.
 * 기본은 고른 속도로 이어 쓰되 문장이 끝나면 조금 더 쉬고, 생김새(짧은 줄, 한 글자씩 띄운 어절, 두 칸 이상 띄어쓰기)와
 * 작성자가 블록으로 지정한 효과({{…}}, {{효과이름:…}})에서만 흐름을 바꾼다. 낱말의 뜻은 읽지 않는다.
 * 읽기 틀(reader.js), 가림판(mask.js), 효과 견본(effects.js)이 같은 판정을 쓴다.
 */
(function (global) {
  'use strict';

  /* 판정 기준. 숫자를 바꾸면 읽기 틀의 움직임과 가림판의 규칙 설명이 함께 바뀐다. */
  const RULES = {
    shortMaxTokens: 4,      // 어절이 이 개수 이하이면서
    shortMaxChars: 12,      // 공백 빼고 이 글자수 이하인 줄 → 짧은 줄(조금 뜸 들이고 천천히)
    dripRun: 4,             // 한 글자 어절이 이만큼 이어지면 → 흘러내림
    dripRunWholeLine: 3,    // 줄 전체가 한 글자 어절일 때는 이만큼부터
    longToken: 18,          // 이보다 긴 어절은 줄 끝에서 쪼개질 수 있음
    indentMax: 24           // 들여쓰기로 인정하는 줄 앞 공백 칸수 상한
  };

  /* 시간표(ms) */
  const TIME = {
    firstDelay: 600,        // 첫 문단 앞
    flowSlow: 30,           // 짧은 문단의 글자 간격
    flowFast: 17,           // 360자 이상 문단의 글자 간격
    flowEase: 0.9,          // 문단 첫머리만 살짝 느리게 시작(첫 글자 간격 = 기본 × (1 + 이 값))
    lineBreak: 90,          // 문단 안 줄바꿈
    stop: 240,              // 보통 글에서 마침표·물음표·느낌표·말줄임표로 끝난 어절 뒤
    shortBefore: 380,
    shortChar: 56,
    shortAfter: 260,
    dripBefore: 380,
    dripChar: 260,
    dripAfter: 380,
    restPerSpace: 320,      // 띄어쓰기 두 번째 칸부터 한 칸마다
    exitStagger: 45         // 퇴장 블록에서 글자 사이
  };

  /*
   * 블록 효과. {{이름:글}}로 지정하고, 이름 없이 {{글}}이면 강조(떠오름. 한 글에 여럿이면 DEFAULT_CYCLE을 차례로 돈다).
   * fx: 글자에 거는 움직임 / before·after: 블록 앞뒤 뜸 / char: 글자 사이 / group: 어절 사이 / line: 블록 안 줄바꿈
   * char가 'type'이면 자판 치듯 들쭉날쭉.
   * unit이 있으면 글자 단위가 아니라 문장(또는 줄) 단위로 한꺼번에 나오고, 단위 사이를 unitGap만큼 쉰다.
   * exit가 있으면 퇴장 블록: 다 나타난 뒤 hold만큼 머물고 그 움직임으로 물러난다. 다음 글은 물러난 뒤에 온다.
   */
  const BLOCKS = {
    '떠오름': { fx: 'rise', unit: true, before: 500, unitGap: 900, char: 22, group: 40, line: 900, after: 350 },
    '번짐': { fx: 'bleed', before: 500, char: 85, group: 200, line: 500, after: 500 },
    '타자': { fx: 'type', before: 400, char: 'type', group: 160, line: 400, after: 700 },
    '초점': { fx: 'focus', before: 500, char: 0, group: 0, line: 0, after: 1900 },
    '모여듦': { fx: 'gather', before: 400, char: 32, group: 60, line: 200, after: 1100 },
    '떨림': { fx: 'tremble', before: 400, char: 70, group: 140, line: 300, after: 600 },
    '흘러내림': { fx: 'fall', before: 420, char: 170, group: 260, line: 380, after: 600 },
    '조명': { fx: 'rise', cls: 'lit', spot: true, unit: true, before: 500, unitGap: 900, char: 0, group: 0, line: 900, after: 350 },
    '사라짐': { fx: 'fade', exit: 'vanish', hold: 1600, before: 400, char: 70, group: 140, line: 300, after: 300 },
    '흩날림': { fx: 'fade', exit: 'scatter', hold: 1300, before: 400, char: 70, group: 140, line: 300, after: 300 },
    '지워짐': { fx: 'fade', exit: 'erase', hold: 1400, before: 400, char: 70, group: 140, line: 300, after: 300 },
    '희미해짐': { fx: 'fade', exit: 'dim', hold: 1400, before: 400, char: 70, group: 140, line: 300, after: 300 },
    '걷힘': { fx: 'fade', exit: 'fold', hold: 1500, before: 400, char: 70, group: 140, line: 300, after: 300 },
    '가라앉음': { fx: 'fade', exit: 'sink', hold: 1500, before: 400, char: 70, group: 140, line: 300, after: 300 }
  };
  /* 블록 갈래(편집실이 효과 막대를 나눌 때 씀). 등장·머묾은 강조, 퇴장은 따로 고른다. docs/효과-규칙.md */
  /* 편집실 '고른 곳'은 등장과 퇴장만 고르게 둔다. 머묾(떨림·조명)은 적힌 글은 그대로 읽지만 고르는 판에는 없다 */
  const BLOCK_GROUPS = {
    '등장': ['떠오름', '번짐', '타자', '초점', '모여듦', '흘러내림'],
    '머묾': ['떨림', '조명'],
    '퇴장': ['사라짐', '흩날림', '지워짐', '희미해짐', '걷힘', '가라앉음']
  };
  const BLOCK_DEFAULT = '떠오름';
  const DEFAULT_CYCLE = ['떠오름', '번짐', '초점', '떠오름', '모여듦'];
  const BLOCK_NAMES = Object.keys(BLOCKS);
  /*
   * 글자 꾸밈. 효과와 함께 +로 이어 적는다: {{굵게:…}} · {{떨림+밑줄:…}} · {{강조+빨강:…}}(강조 = 이름 없는 강조).
   * 꾸밈만 적은 블록은 강조가 아니어서 흐름대로 나오고 모양만 바뀐다.
   */
  const KEEP = '강조';
  const STYLES = { '굵게': 'b', '기울임': 'i', '밑줄': 'u', '취소선': 's' };
  const COLORS = { '빨강': 'red', '주황': 'orange', '초록': 'green', '파랑': 'blue', '보라': 'violet', '회색': 'gray' };
  const HEAD_WORDS = [...BLOCK_NAMES, KEEP, ...Object.keys(STYLES), ...Object.keys(COLORS)].sort((a, b) => b.length - a.length);
  const WORD_ALT = HEAD_WORDS.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  /* 직접 고른 색은 #rrggbb 그대로 머리에 적는다: {{#A63C33:…}}, {{번짐+#A63C33:…}} */
  const HEX_WORD = '#[0-9A-Fa-f]{6}';
  const HEAD_SRC = `(?:${WORD_ALT}|${HEX_WORD})(?:\\+(?:${WORD_ALT}|${HEX_WORD}))*`;

  /* 블록 머리('떨림+굵게+빨강')를 {fx, keep, styles, color}로 읽는다. fx는 효과 이름(없으면 null) */
  function parseHead(head) {
    const out = { fx: null, keep: false, styles: [], color: null };
    String(head || '').split('+').forEach((w) => {
      if (BLOCKS[w]) out.fx = w;
      else if (w === KEEP) out.keep = true;
      else if (STYLES[w]) { if (!out.styles.includes(w)) out.styles.push(w); }
      else if (COLORS[w] || /^#[0-9A-Fa-f]{6}$/.test(w)) out.color = w;
    });
    return out;
  }
  /* {fx, keep, styles, color} → 블록 머리 글(이름 없는 강조만이면 빈 글) */
  function headText(h) {
    const words = [];
    if (h.fx) words.push(h.fx);
    else if (h.keep && (h.styles.length || h.color)) words.push(KEEP);
    words.push(...h.styles);
    if (h.color) words.push(h.color);
    return words.join('+');
  }

  /* 쉼 앞뒤 완급: 쉼 앞 마지막 글자들은 점점 느려지고(끝에서부터), 쉼 뒤 첫 글자들은 느리게 시작해 원래 속도로 돌아온다 */
  const EASE_INTO_REST = [2.6, 2.1, 1.7, 1.35];
  const EASE_OUT_OF_REST = [2.2, 1.7, 1.35, 1.12];

  /* 글자가 다 자리 잡을 때까지 걸리는 시간(ms) */
  const SETTLE = { fade: 700, soft: 1000, rise: 2000, bleed: 1600, type: 0, focus: 2400, gather: 1500, tremble: 4000, fall: 1300 };
  /* 글자가 다 나타날 때까지 걸리는 시간(ms). 다음 글은 앞 글자가 다 나타난 뒤에 온다. 떨림은 나타난 뒤에도 흔들리므로 나타나는 데까지만 센다. */
  const ENTER = {
    fade: 700, soft: 1000, rise: 1100, bleed: 1600, type: 0, focus: 2400, gather: 1500, tremble: 700, fall: 1300,
    vanish: 1100, scatter: 1300, erase: 1500, dim: 1200, fold: 1100, sink: 1400
  };
  const AFTER_GAP = 120;

  const MASK = '■';
  const EM_OPEN = '{{';
  const EM_CLOSE = '}}';
  /*
   * 쪽 표시 줄: 장면(라이트·다크, 예전 이름 낮·밤도 읽음)·바탕·넘김·글 자리·글자 크기(크기110 = 110%)·글 상자 폭(폭30 = 30자)·속도(속도120 = 글 전체 속도의 1.2배)·나타나는 결(결번짐·결이어쓰기…)·정렬(정렬가운데…)·
   * 전환 속도(전환속도120 = 이 쪽으로 넘어올 때 글 전체 전환 속도의 1.2배)를 :로 이어 적는다.
   * [[다크]] · [[다크:오로라]] · [[다크:영사광:조리개]] · [[가운데]] · [[크기120:폭24]]
   * 이 줄에서 새 쪽이 시작되고, 장면·바탕은 적지 않으면 앞 쪽을 따른다(장면이 바뀌고 바탕이 없으면 그 장면의 기본 바탕).
   * 넘김·자리·크기·폭·속도·결·정렬·전환 속도는 그 쪽에만 걸린다.
   */
  const SCENES = { '밤': 'night', '낮': 'day', '라이트': 'day', '다크': 'night' };
  const GROUNDS = { '창빛': 'window', '원고지': 'wongoji', '잎그늘': 'leaf', '새벽': 'dawn', '편지지': 'letter', '오로라': 'aurora', '영사광': 'projector', '빛커튼': 'drape', '물빛': 'caustic', '타자': 'typing' };
  const TURNS = { '스밈': 'drift', '쓸기': 'sweep', '조리개': 'iris', '셔터': 'blinds', '막': 'curtain', '해돋이': 'sunrise', '해넘이': 'sunset', '섬광': 'flash', '잠수': 'dive', '먹자국': 'ink', '글리치': 'glitch', '피어남': 'bloom' };
  const PLACES = { '왼쪽': 'left', '가운데': 'center', '오른쪽': 'right' };
  const DEFAULT_GROUND = { day: 'window', night: 'projector' };
  const MARK_WORD = [...Object.keys(SCENES), ...Object.keys(GROUNDS), ...Object.keys(TURNS), ...Object.keys(PLACES), '크기\\d{2,3}', '폭\\d{2}', '속도\\d{2,3}', '전환속도\\d{2,3}', '결(?:바로|이어쓰기|번짐|떠오름|타자)', '정렬(?:저절로|왼쪽|가운데|오른쪽|양쪽)'].join('|');
  const MARK_BODY = `(?:${MARK_WORD})(?:\\s*[:·]\\s*(?:${MARK_WORD}))*`;
  const SCENE_LINE_RE = new RegExp(`^[^\\S\\n]*\\[\\[(${MARK_BODY})\\]\\][^\\S\\n]*$`);
  const SCENE_LINES_RE = new RegExp(`^[^\\S\\n]*\\[\\[${MARK_BODY}\\]\\][^\\S\\n]*$`, 'gm');

  /* 쪽 표시 줄 안쪽 글을 {scene, ground, turn, place, size(배율), measure(자), speed(배율), flow(결 이름, 띄어쓰기 없이), align(정렬 이름), turnSpeed(배율)}로 읽는다(없는 것은 null) */
  function readMark(body) {
    const parts = String(body).split(/\s*[:·]\s*/);
    const pick = (map) => { const k = parts.find((x) => map[x]); return k ? map[k] : null; };
    const num = (re) => { const m = parts.map((x) => x.match(re)).find(Boolean); return m ? Number(m[1]) : null; };
    const size = num(/^크기(\d{2,3})$/);
    const speed = num(/^속도(\d{2,3})$/);
    const turnSpeed = num(/^전환속도(\d{2,3})$/);
    const word = (re) => { const m = parts.map((x) => x.match(re)).find(Boolean); return m ? m[1] : null; };
    return { scene: pick(SCENES), ground: pick(GROUNDS), turn: pick(TURNS), place: pick(PLACES), size: size ? size / 100 : null, measure: num(/^폭(\d{2})$/), speed: speed ? speed / 100 : null,
      flow: word(/^결(\S+)$/), align: word(/^정렬(\S+)$/), turnSpeed: turnSpeed ? turnSpeed / 100 : null };
  }
  const PREFIX_RE = new RegExp(`^(${HEAD_SRC}):`);
  const MARKS_RE = new RegExp(`(\\{\\{(?:${HEAD_SRC}):|\\{\\{|\\}\\}|\\[\\[${MARK_BODY}\\]\\])`);

  const segmenter = (typeof Intl !== 'undefined' && Intl.Segmenter)
    ? new Intl.Segmenter('ko', { granularity: 'grapheme' })
    : null;

  function graphemes(s) {
    if (!s) return [];
    if (!segmenter) return Array.from(s);
    const out = [];
    for (const g of segmenter.segment(s)) out.push(g.segment);
    return out;
  }

  const SPACE_RE = /^[^\S\n]$/u;
  const PUNCT_RE = /^[\p{P}~～]+$/u;
  const CLOSERS_RE = /["'”’」』）)\]〉》]+$/u;
  const STOP_RE = /[.?!。？！…⋯‥]$/u;

  function isSpace(c) { return SPACE_RE.test(c); }
  function spaceWidth(c) { return c === '　' ? 2 : 1; }
  function isPunct(c) { return c !== MASK && PUNCT_RE.test(c); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function normalize(text) {
    return String(text || '').replace(/\r\n?/g, '\n');
  }

  /* 글 앞의 빈 줄과 끝의 공백을 걷어 낸다. 첫 줄 앞 공백(들여쓰기)은 남긴다. */
  function trimSource(text) {
    return normalize(text).replace(/^(?:[^\S\n]*\n)+/, '').replace(/\s+$/, '');
  }

  /* 글자수를 셀 때 쓰는 글: 장면 표시 줄과 블록 표시를 뺀다. */
  function stripMarks(text) {
    return normalize(text)
      .replace(SCENE_LINES_RE, '')
      .replace(new RegExp(`\\{\\{(?:${HEAD_SRC}):`, 'g'), '')
      .split(EM_OPEN).join('').split(EM_CLOSE).join('');
  }

  /*
   * 문단 하나를 {ch, em, fx, block, st, color} 칸으로 펼친다. 블록 표시는 문단 끝에서 저절로 닫힌다.
   * st는 꾸밈 기호(b·i·u·s)를 이은 글, color는 색 이름(COLORS의 값) 또는 직접 고른 색(#rrggbb).
   * ctr.k는 글 전체에서 이름 없는 강조를 센다(DEFAULT_CYCLE을 돌 때 씀).
   * 표시가 있던 자리는 open(여는 표시 글자열)·close로 남겨 가림판이 같은 폭으로 그릴 수 있게 한다.
   */
  function flagCells(paraText, ctr) {
    const g = graphemes(paraText);
    const cells = [];
    let em = false;
    let fx = null;
    let st = '';
    let color = null;
    let block = -1;
    let pendingOpen = null;
    for (let i = 0; i < g.length; i++) {
      if (g[i] === '{' && g[i + 1] === '{') {
        const m = g.slice(i + 2, i + 48).join('').match(PREFIX_RE);
        const h = parseHead(m ? m[1] : '');
        em = !!(h.fx || h.keep || !m);
        fx = em ? (h.fx || DEFAULT_CYCLE[(ctr.k++) % DEFAULT_CYCLE.length]) : null;
        st = h.styles.map((w) => STYLES[w]).join('');
        color = h.color ? (COLORS[h.color] || h.color) : null;
        if (em) block++;
        pendingOpen = EM_OPEN + (m ? m[0] : '');
        i += 1 + (m ? graphemes(m[0]).length : 0);
        continue;
      }
      if (g[i] === '}' && g[i + 1] === '}') {
        em = false;
        fx = null;
        st = '';
        color = null;
        for (let k = cells.length - 1; k >= 0; k--) {
          if (cells[k].ch === '\n' || isSpace(cells[k].ch)) continue;
          cells[k].close = (cells[k].close || 0) + 1;
          break;
        }
        i++;
        continue;
      }
      const cell = { ch: g[i], em, fx: em ? fx : null, block: em ? block : -1 };
      if (st) cell.st = st;
      if (color) cell.color = color;
      if (g[i] !== '\n' && !isSpace(g[i]) && pendingOpen) { cell.open = pendingOpen; pendingOpen = null; }
      cells.push(cell);
    }
    return cells;
  }

  function finishToken(tk) {
    const chars = tk.cells.map((c) => c.ch);
    tk.text = chars.join('');
    tk.letters = chars.filter((c) => !isPunct(c)).length;
    tk.long = chars.length > RULES.longToken;
    tk.stop = STOP_RE.test(tk.text.replace(CLOSERS_RE, ''));
    tk.role = null;
  }

  function parseLine(cells) {
    let end = cells.length;
    while (end > 0 && isSpace(cells[end - 1].ch)) end--;
    let i = 0;
    let indent = 0;
    let indentText = '';
    while (i < end && isSpace(cells[i].ch)) {
      indent += spaceWidth(cells[i].ch);
      indentText += cells[i].ch;
      i++;
    }
    const tokens = [];
    let cur = null;
    let gap = 0;
    let gapText = '';
    for (; i < end; i++) {
      const c = cells[i];
      if (isSpace(c.ch)) {
        if (cur) { tokens.push(cur); cur = null; }
        gap += 1;
        gapText += c.ch;
        continue;
      }
      if (!cur) {
        cur = { cells: [], gap: tokens.length ? gap : 0, gapText: tokens.length ? gapText : '' };
        gap = 0;
        gapText = '';
      }
      cur.cells.push(c);
    }
    if (cur) tokens.push(cur);
    tokens.forEach(finishToken);
    return {
      indent: Math.min(indent, RULES.indentMax),
      indentText,
      tokens,
      count: tokens.reduce((n, t) => n + t.cells.length, 0)
    };
  }

  function markDrips(line) {
    const toks = line.tokens;
    const single = toks.map((t) => t.letters === 1 && t.cells.length <= 2 && !t.cells[0].em);
    const whole = toks.length > 0 && single.every(Boolean);
    const need = whole ? RULES.dripRunWholeLine : RULES.dripRun;
    let depth = 0;
    for (let a = 0; a < toks.length;) {
      if (!single[a]) { a++; continue; }
      let b = a;
      while (b < toks.length && single[b]) b++;
      if (b - a >= need) {
        for (let k = a; k < b; k++) {
          toks[k].role = 'drip';
          toks[k].dripIndex = k - a;
        }
        toks[b - 1].dripLast = true;
        depth = Math.max(depth, b - a - 1);
      }
      a = b;
    }
    line.dripDepth = depth;
    return whole && toks.every((t) => t.role === 'drip');
  }

  function classify(line) {
    const allDrip = markDrips(line);
    let kind = 'flow';
    if (allDrip) kind = 'drip';
    else if (line.tokens.length <= RULES.shortMaxTokens && line.count <= RULES.shortMaxChars) kind = 'short';
    line.kind = kind;
    line.tokens.forEach((t) => { if (!t.role) t.role = kind === 'drip' ? 'drip' : kind; });
  }

  function stepOf(cfg, key, k) {
    const v = cfg[key];
    /* 문장 단위 블록: 줄 사이는 단위 쉼, 단위 안 글자·어절 사이는 적어 둔 만큼만(떠오름은 잔물결처럼 조금씩) */
    if (cfg.unit) return key === 'line' ? cfg.unitGap : (typeof v === 'number' ? v : 0);
    if (v === 'type') return 50 + ((k * 73) % 100);
    return v;
  }

  /*
   * 문단 시작 기준으로 글자마다 등장 시각(t)과 효과(anim)를 붙인다.
   * 조명과 퇴장은 para.events에 남긴다.
   */
  function schedule(para) {
    const rate = TIME.flowSlow - (TIME.flowSlow - TIME.flowFast) * clamp((para.count - 60) / 300, 0, 1);
    const blocks = {};
    let t = 0;
    let flowIndex = 0;
    let prevRole = null;
    let prev = null;
    let bi = 0;
    let end = 0;
    let unitBreak = false;
    let emEnd = 0;          // 강조 글자가 다 나타나는 가장 늦은 시각
    let flowEnd = 0;        // 보통 글자가 다 나타나는 가장 늦은 시각
    /*
     * 블록에서 빠져나올 때: 블록의 뒤 뜸만큼 쉬되, 블록 글자가 다 나타나기 전에는 다음 글을 시작하지 않는다.
     * 퇴장 블록도 여기서는 보통 블록처럼 지나가고, 물러나는 시각은 그 쪽 글을 끝까지 쓴 뒤로 미룬다(fx.buildParagraph·읽기 틀).
     */
    const leave = (pc) => {
      const cfg = BLOCKS[pc.fx];
      t = Math.max(t + cfg.after, emEnd + AFTER_GAP);
    };

    para.lines.forEach((line, li) => {
      const cells = line.tokens.flatMap((tk) => tk.cells);
      const first = cells[0];
      const continues = li > 0 && prev && first.em && first.block === prev.block;
      const lastEm = cells[cells.length - 1].em;
      if (li > 0) t += continues ? stepOf(BLOCKS[prev.fx], 'line', bi) : TIME.lineBreak;
      if (continues) unitBreak = false;
      const short = line.kind === 'short';
      if (short && !continues) t += TIME.shortBefore;

      line.tokens.forEach((tk, ti) => {
        const c0 = tk.cells[0];
        const drip = tk.role === 'drip';
        const next = line.tokens[ti + 1];
        tk.restAfter = !!(next && next.gap > 1);
        tk.afterRest = ti > 0 && tk.gap > 1;
        if (ti > 0) {
          if (tk.afterRest) t += (tk.gap - 1) * TIME.restPerSpace;
          if (prev && c0.em && !drip && c0.block === prev.block) t += stepOf(BLOCKS[prev.fx], 'group', bi);
          else if (!c0.em || drip) t += (short ? TIME.shortChar : rate) * (tk.afterRest ? 1.8 : 1);
        }
        if (drip && prevRole !== 'drip') t += TIME.dripBefore;

        tk.cells.forEach((c, j) => {
          const em = c.em && !drip;
          const fromEnd = tk.cells.length - 1 - j;
          const nearRest = (tk.restAfter && fromEnd < EASE_INTO_REST.length) || (tk.afterRest && j < EASE_OUT_OF_REST.length);
          const slow = (tk.restAfter && fromEnd < EASE_INTO_REST.length ? EASE_INTO_REST[fromEnd] : 1) *
                       (tk.afterRest && j < EASE_OUT_OF_REST.length ? EASE_OUT_OF_REST[j] : 1);
          const cfg = em ? BLOCKS[c.fx] : null;
          if (em && (!prev || prev.block !== c.block)) {
            if (prev) leave(prev);
            t = Math.max(t + cfg.before, flowEnd);
            bi = 0;
            unitBreak = false;
            blocks[c.block] = { cfg, start: t, end: t, cells: [] };
          } else if (!em && prev) {
            leave(prev);
          } else if (em && cfg.unit && unitBreak && tk.letters > 0) {
            t += cfg.unitGap;
          }
          if (tk.letters > 0) unitBreak = false;

          c.t = Math.round(t);
          if (drip) c.anim = 'fall';
          else if (em) c.anim = cfg.fx;
          else c.anim = (tk.afterRest || (tk.restAfter && fromEnd < 2)) ? 'soft' : 'fade';
          c.cls = em && cfg.cls ? cfg.cls : null;

          if (drip) t += TIME.dripChar;
          else if (em) {
            t += stepOf(cfg, 'char', bi);
            bi++;
            const B = blocks[c.block];
            B.end = c.t;
            B.cells.push(c);
          } else if (short) t += TIME.shortChar * (nearRest ? slow : 1);
          else { t += rate * (1 + TIME.flowEase * Math.exp(-flowIndex / 5)) * (nearRest ? slow : 1); flowIndex++; }

          end = Math.max(end, c.t + SETTLE[c.anim]);
          if (em) emEnd = Math.max(emEnd, c.t + ENTER[c.anim]);
          else flowEnd = Math.max(flowEnd, c.t + ENTER[c.anim]);
          prev = em ? c : null;
        });

        if (drip && tk.dripLast) t += TIME.dripAfter;
        const last = tk.cells[tk.cells.length - 1];
        if (tk.stop && !drip) {
          if (last.em) unitBreak = !!BLOCKS[last.fx].unit;
          else t += TIME.stop;
        }
        prevRole = tk.role;
      });

      if (short && !lastEm) t += TIME.shortAfter;
    });
    if (prev) leave(prev);

    para.events = [];
    Object.values(blocks).forEach((B) => {
      if (B.cfg.spot) {
        para.events.push({ type: 'spot', t: Math.round(B.start), end: Math.round(B.end + 2600) });
        end = Math.max(end, B.end + 3600);
      }
      if (B.cfg.exit) para.events.push({ type: 'exit', fx: B.cfg.exit, hold: B.cfg.hold, cells: B.cells });
    });
    para.lead = Math.round(t);
    para.span = Math.round(end);
  }

  /*
   * 빈 줄 하나로 문단을, 빈 줄 둘 이상으로 페이지를 나눈다. 문단 안의 줄바꿈 한 번은 그냥 줄바꿈이다.
   * [[밤]]·[[낮]](바탕 이름을 붙일 수 있음)만 적은 줄은 장면 표시다. 장면 표시가 있으면 거기서 새 페이지가 시작된다.
   * rows에는 표시 줄까지 원래 순서대로 남기고(가림판 표시용), lines에는 글 줄만 둔다.
   * pageStart: 이 문단 앞에서 페이지가 나뉘었는지(빈 줄 둘 이상).
   */
  function parse(text) {
    const src = trimSource(text).replace(/\t/g, '  ');
    const paragraphs = [];
    if (!src) return { paragraphs };
    const parts = src.split(/(\n(?:[^\S\n]*\n)+)/);
    const ctr = { k: 0 };
    for (let i = 0; i < parts.length; i += 2) {
      const block = parts[i];
      const sep = i ? parts[i - 1] : '';
      const pageStart = i === 0 || (sep.match(/\n/g) || []).length >= 3;
      const cells = flagCells(block, ctr);
      const rawLines = [[]];
      cells.forEach((c) => {
        if (c.ch === '\n') rawLines.push([]);
        else rawLines[rawLines.length - 1].push(c);
      });
      const rows = [];
      let scene = null;
      let ground = null;
      rawLines.forEach((rl) => {
        const m = rl.map((c) => c.ch).join('').match(SCENE_LINE_RE);
        if (m) {
          const mk = readMark(m[1]);
          scene = mk.scene;
          ground = mk.ground;
          rows.push({ sceneMark: mk.scene || 'same', scene: mk.scene, ground: mk.ground, turn: mk.turn, place: mk.place, size: mk.size, measure: mk.measure, speed: mk.speed, flow: mk.flow, align: mk.align, turnSpeed: mk.turnSpeed, text: m[0].trim() });
          return;
        }
        const line = parseLine(rl);
        if (line.tokens.length) rows.push(line);
      });
      const lines = rows.filter((r) => !r.sceneMark);
      if (!rows.length) continue;
      if (!lines.length) {
        paragraphs.push({ rows, lines, scene, ground, pageStart, sceneOnly: true, count: 0, lead: 0, span: 0, events: [] });
        continue;
      }
      lines.forEach(classify);
      const para = { rows, lines, scene, ground, pageStart, count: lines.reduce((n, l) => n + l.count, 0) };
      schedule(para);
      paragraphs.push(para);
    }
    return { paragraphs };
  }

  /*
   * 문단을 페이지로 묶는다. 페이지마다 장면(day·night)·바탕(ground)·이 쪽으로 들어올 때의 넘김(turn)·글 자리(place)를 정한다
   * (넘김·자리는 적지 않으면 null). 한 문단에 쪽 표시 줄이 여럿이면 차례로 합친다(뒤의 것이 앞의 것을 덮는다).
   * 쪽 표시가 없으면 앞 페이지의 장면과 바탕을 이어받고, 장면을 바꾸며 바탕 이름이 없으면 그 장면의 기본 바탕을 쓴다.
   */
  /*
   * 나타나는 결은 조판(tune.js)이 정한다. 쪽마다 그 쪽 표시의 결(없으면 null)로 한 번 부른다(setFlowHook).
   */
  let flowHook = null;
  function setFlowHook(fn) { flowHook = fn; }

  /* 쪽 표시의 속도: 그 쪽 문단의 시간표를 그 배율만큼 줄이고 늘인다(한 번만) */
  function pace(para, k) {
    if (para.paced) return;
    para.paced = k;
    para.lines.forEach((l) => l.tokens.forEach((tk) => tk.cells.forEach((c) => { c.t = Math.round(c.t / k); })));
    para.lead = Math.round(para.lead / k);
    para.span = Math.round(para.span / k);
    (para.events || []).forEach((ev) => { if (typeof ev.t === 'number') ev.t = Math.round(ev.t / k); if (typeof ev.end === 'number') ev.end = Math.round(ev.end / k); if (ev.hold) ev.hold = Math.round(ev.hold / k); });
  }

  function pages(parsed) {
    const out = [];
    let cur = null;
    let scene = 'day';
    let ground = DEFAULT_GROUND.day;
    let pending = null;
    parsed.paragraphs.forEach((para) => {
      const marks = para.rows.filter((r) => r.sceneMark);
      const mark = marks.length ? marks.reduce((a, r) => ({
        scene: r.scene || a.scene, ground: r.ground || a.ground, turn: r.turn || a.turn, place: r.place || a.place,
        size: r.size || a.size, measure: r.measure || a.measure, speed: r.speed || a.speed,
        flow: r.flow || a.flow, align: r.align || a.align, turnSpeed: r.turnSpeed || a.turnSpeed
      }), {}) : null;
      if (mark) pending = mark;
      if (para.sceneOnly) {
        if (cur && cur.paragraphs.length) cur = null;
        return;
      }
      if (!cur || para.pageStart || mark) {
        let turn = null;
        let place = null;
        let size = null;
        let measure = null;
        let speed = null;
        let flow = null;
        let align = null;
        let turnSpeed = null;
        if (pending) {
          if (pending.scene) {
            ground = pending.ground || (pending.scene !== scene ? DEFAULT_GROUND[pending.scene] : ground);
            scene = pending.scene;
          } else if (pending.ground) ground = pending.ground;
          turn = pending.turn || null;
          place = pending.place || null;
          size = pending.size || null;
          measure = pending.measure || null;
          speed = pending.speed || null;
          flow = pending.flow || null;
          align = pending.align || null;
          turnSpeed = pending.turnSpeed || null;
          pending = null;
        }
        cur = { paragraphs: [], scene, ground, turn, place, size, measure, speed, flow, align, turnSpeed, count: 0 };
        out.push(cur);
      }
      if (flowHook && !para.flowed) { para.flowed = true; flowHook(para, cur.flow); }
      if (cur.speed) pace(para, cur.speed);
      cur.paragraphs.push(para);
      cur.count += para.count;
    });
    return out;
  }

  function stats(text, parsed) {
    const p = parsed || parse(text);
    let withSpaces = 0;
    let noSpaces = 0;
    graphemes(stripMarks(text)).forEach((c) => {
      if (c === '\n') return;
      withSpaces++;
      if (!/^\s$/u.test(c)) noSpaces++;
    });
    let tokens = 0;
    let lines = 0;
    let marks = 0;
    let scenes = 0;
    const real = p.paragraphs.filter((para) => !para.sceneOnly);
    let ms = real.length ? TIME.firstDelay : 0;
    p.paragraphs.forEach((para) => {
      scenes += para.rows.filter((r) => r.sceneMark).length;
      ms += para.lead;
      lines += para.lines.length;
      const seen = new Set();
      para.lines.forEach((l) => {
        tokens += l.tokens.length;
        l.tokens.forEach((t) => t.cells.forEach((c) => { if (c.em) seen.add(c.block); }));
      });
      marks += seen.size;
    });
    return { withSpaces, noSpaces, tokens, lines, paragraphs: real.length, pages: pages(p).length, marks, scenes, ms };
  }

  /* 공백·줄바꿈·블록 표시·장면 표시는 그대로 두고 나머지 글자를 가린다. keepPunct면 문장부호도 남긴다. */
  function mask(text, opts) {
    const keep = !!(opts && opts.keepPunct);
    const glyph = (opts && opts.glyph) || MASK;
    return normalize(text)
      .split(MARKS_RE)
      .map((part, i) => (i % 2 === 1)
        ? part
        : graphemes(part).map((c) => (c === '\n' || /^\s$/u.test(c) || (keep && isPunct(c)) ? c : glyph)).join(''))
      .join('');
  }

  global.Geulgyeol = {
    setFlowHook,
    RULES, TIME, SETTLE, ENTER, BLOCKS, BLOCK_GROUPS, BLOCK_NAMES, BLOCK_DEFAULT, DEFAULT_CYCLE, MASK, EM_OPEN, EM_CLOSE, PREFIX_RE,
    KEEP, STYLES, COLORS, HEAD_SRC, parseHead, headText,
    SCENES, GROUNDS, TURNS, PLACES, DEFAULT_GROUND, SCENE_LINE_RE, readMark,
    graphemes, isPunct, trimSource, stripMarks, parse, pages, stats, mask
  };
})(typeof window !== 'undefined' ? window : globalThis);
