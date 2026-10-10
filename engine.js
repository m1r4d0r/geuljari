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
    restPerSpace: 320       // 띄어쓰기 두 번째 칸부터 한 칸마다
  };

  /*
   * 블록 효과. {{이름:글}}로 지정하고, 이름 없이 {{글}}이면 떠오름.
   * fx: 글자에 거는 움직임 / before·after: 블록 앞뒤 뜸 / char: 글자 사이 / group: 어절 사이 / line: 블록 안 줄바꿈
   * char가 'type'이면 자판 치듯 들쭉날쭉, 'rush'면 갈수록 빨라짐.
   * unit이 있으면 글자 단위가 아니라 문장(또는 줄) 단위로 한꺼번에 나오고, 단위 사이를 unitGap만큼 쉰다.
   */
  const BLOCKS = {
    '떠오름': { fx: 'rise', unit: true, before: 500, unitGap: 900, char: 0, group: 0, line: 900, after: 350 },
    '번짐': { fx: 'bleed', before: 500, char: 85, group: 200, line: 500, after: 500 },
    '타자': { fx: 'type', before: 400, char: 'type', group: 160, line: 400, after: 700 },
    '초점': { fx: 'focus', before: 500, char: 0, group: 0, line: 0, after: 1900 },
    '모여듦': { fx: 'gather', before: 400, char: 32, group: 60, line: 200, after: 1100 },
    '떨림': { fx: 'tremble', before: 400, char: 70, group: 140, line: 300, after: 600 },
    '흘러내림': { fx: 'fall', before: 380, char: 150, group: 220, line: 300, after: 450 },
    '크게': { fx: 'rise', cls: 'fx-big', before: 700, char: 90, group: 500, line: 700, after: 700 },
    '조명': { fx: 'rise', cls: 'lit', spot: true, unit: true, before: 500, unitGap: 900, char: 0, group: 0, line: 900, after: 350 },
    '숨가쁨': { fx: 'fade', before: 150, char: 'rush', group: 'rush', line: 40, after: 300 },
    '벌어짐': { fx: 'fade', lines: 'spread', before: 300, char: 40, group: 40, line: 160, after: 800 },
    '어긋남': { fx: 'fade', lines: 'drift', before: 300, char: 40, group: 40, line: 160, after: 800 },
    '고쳐 씀': { fx: 'fade', rewrite: true, before: 300, char: 45, group: 45, line: 200, after: 500 }
  };
  const BLOCK_DEFAULT = '떠오름';
  const BLOCK_NAMES = Object.keys(BLOCKS);

  /* 쉼 앞뒤 완급: 쉼 앞 마지막 글자들은 점점 느려지고(끝에서부터), 쉼 뒤 첫 글자들은 느리게 시작해 원래 속도로 돌아온다 */
  const EASE_INTO_REST = [2.6, 2.1, 1.7, 1.35];
  const EASE_OUT_OF_REST = [2.2, 1.7, 1.35, 1.12];

  /* 글자가 다 자리 잡을 때까지 걸리는 시간(ms) */
  const SETTLE = { fade: 700, soft: 1000, rise: 2000, bleed: 1600, type: 0, focus: 2400, gather: 1500, tremble: 4000, fall: 820 };
  /* 글자가 다 나타날 때까지 걸리는 시간(ms). 다음 글은 앞 글자가 다 나타난 뒤에 온다. 떨림은 나타난 뒤에도 흔들리므로 나타나는 데까지만 센다. */
  const ENTER = { fade: 700, soft: 1000, rise: 750, bleed: 1600, type: 0, focus: 2400, gather: 1500, tremble: 700, fall: 820 };
  const AFTER_GAP = 120;

  const MASK = '■';
  const EM_OPEN = '{{';
  const EM_CLOSE = '}}';
  /* 장면 표시: [[밤]]·[[낮]], 바탕을 고르려면 [[밤:오로라]]처럼 이름을 붙인다 */
  const SCENES = { '밤': 'night', '낮': 'day' };
  const GROUNDS = { '창빛': 'window', '한지': 'hanji', '영사광': 'projector', '오로라': 'aurora', '물빛': 'caustic' };
  const DEFAULT_GROUND = { day: 'window', night: 'projector' };
  const GROUND_ALT = Object.keys(GROUNDS).join('|');
  const SCENE_LINE_RE = new RegExp(`^[^\\S\\n]*\\[\\[(밤|낮)(?:[:·]\\s*(${GROUND_ALT}))?\\]\\][^\\S\\n]*$`);
  const SCENE_LINES_RE = new RegExp(`^[^\\S\\n]*\\[\\[(?:밤|낮)(?:[:·]\\s*(?:${GROUND_ALT}))?\\]\\][^\\S\\n]*$`, 'gm');
  const NAME_ALT = BLOCK_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const PREFIX_RE = new RegExp(`^(${NAME_ALT}):`);
  const MARKS_RE = new RegExp(`(\\{\\{(?:${NAME_ALT}):|\\{\\{|\\}\\}|\\[\\[(?:밤|낮)(?:[:·]\\s*(?:${GROUND_ALT}))?\\]\\]|\\|)`);

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

  /* 글자수를 셀 때 쓰는 글: 장면 표시 줄, 블록 표시, 고쳐 씀의 | 를 뺀다. */
  function stripMarks(text) {
    return normalize(text)
      .replace(SCENE_LINES_RE, '')
      .replace(new RegExp(`\\{\\{(?:${NAME_ALT}):`, 'g'), '')
      .split(EM_OPEN).join('').split(EM_CLOSE).join('')
      .split('|').join('');
  }

  /*
   * 문단 하나를 {ch, em, fx, block, part} 칸으로 펼친다. 블록 표시는 문단 끝에서 저절로 닫힌다.
   * 표시가 있던 자리는 open(여는 표시 글자열)·close·pipe로 남겨 가림판이 같은 폭으로 그릴 수 있게 한다.
   */
  function flagCells(paraText) {
    const g = graphemes(paraText);
    const cells = [];
    let em = false;
    let fx = null;
    let block = -1;
    let part = 0;
    let pendingOpen = null;
    let pendingPipe = false;
    for (let i = 0; i < g.length; i++) {
      if (g[i] === '{' && g[i + 1] === '{') {
        const m = g.slice(i + 2, i + 10).join('').match(PREFIX_RE);
        em = true;
        fx = m ? m[1] : BLOCK_DEFAULT;
        block++;
        part = 0;
        pendingOpen = EM_OPEN + (m ? m[0] : '');
        i += 1 + (m ? graphemes(m[0]).length : 0);
        continue;
      }
      if (g[i] === '}' && g[i + 1] === '}') {
        em = false;
        fx = null;
        for (let k = cells.length - 1; k >= 0; k--) {
          if (cells[k].ch === '\n' || isSpace(cells[k].ch)) continue;
          cells[k].close = (cells[k].close || 0) + 1;
          break;
        }
        i++;
        continue;
      }
      if (em && BLOCKS[fx].rewrite && g[i] === '|' && part === 0) {
        part = 1;
        pendingPipe = true;
        continue;
      }
      const cell = { ch: g[i], em, fx: em ? fx : null, block: em ? block : -1, part: em ? part : 0 };
      if (g[i] !== '\n' && !isSpace(g[i])) {
        if (pendingOpen) { cell.open = pendingOpen; pendingOpen = null; }
        if (pendingPipe) { cell.pipe = true; pendingPipe = false; }
      }
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

  function stepOf(cfg, key, k, cell) {
    const v = cfg[key];
    if (cfg.unit) return key === 'line' ? cfg.unitGap : 0;
    if (cfg.rewrite && cell && cell.part) return key === 'group' ? 400 : 60;
    if (v === 'type') return 50 + ((k * 73) % 100);
    if (v === 'rush') return Math.max(7, 95 * Math.pow(0.93, k));
    return v;
  }

  /*
   * 문단 시작 기준으로 글자마다 등장 시각(t)과 효과(anim)를 붙인다.
   * 고쳐 씀은 먼저 쓴 글자에 줄 긋는 시각(strikeAt)을, 줄 단위 효과(벌어짐·어긋남·조명)는 para.events를 남긴다.
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
    /* 블록에서 빠져나올 때: 블록의 뒤 뜸만큼 쉬되, 블록 글자가 다 나타나기 전에는 다음 글을 시작하지 않는다 */
    const leave = (fx) => { t = Math.max(t + BLOCKS[fx].after, emEnd + AFTER_GAP); };

    para.lines.forEach((line, li) => {
      const cells = line.tokens.flatMap((tk) => tk.cells);
      const first = cells[0];
      const continues = li > 0 && prev && first.em && first.block === prev.block;
      const lastEm = cells[cells.length - 1].em;
      if (li > 0) t += continues ? stepOf(BLOCKS[prev.fx], 'line', bi, first) : TIME.lineBreak;
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
          if (prev && c0.em && !drip && c0.block === prev.block) t += stepOf(BLOCKS[prev.fx], 'group', bi, c0);
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
            if (prev) leave(prev.fx);
            t = Math.max(t + cfg.before, flowEnd);
            bi = 0;
            unitBreak = false;
            blocks[c.block] = { cfg, start: t, end: t, lines: [], old: [] };
          } else if (!em && prev) {
            leave(prev.fx);
          } else if (em && cfg.unit && unitBreak && tk.letters > 0) {
            t += cfg.unitGap;
          }
          if (tk.letters > 0) unitBreak = false;

          if (em && cfg.rewrite && c.part === 1 && prev && prev.block === c.block && prev.part === 0) {
            const B = blocks[c.block];
            const strikeStart = t + 700;
            B.old.forEach((oc, k) => { oc.strikeAt = Math.round(strikeStart + k * 35); });
            t = strikeStart + B.old.length * 35 + 900;
            end = Math.max(end, t + 1000);
          }

          c.t = Math.round(t);
          if (drip) c.anim = 'fall';
          else if (em) c.anim = cfg.rewrite ? (c.part ? 'rise' : 'fade') : cfg.fx;
          else c.anim = (tk.afterRest || (tk.restAfter && fromEnd < 2)) ? 'soft' : 'fade';
          c.cls = em && cfg.cls ? cfg.cls : null;

          if (drip) t += TIME.dripChar;
          else if (em) {
            t += stepOf(cfg, 'char', bi, c);
            bi++;
            const B = blocks[c.block];
            B.end = c.t;
            if (!B.lines.includes(li)) B.lines.push(li);
            if (cfg.rewrite && !c.part) B.old.push(c);
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
    if (prev) leave(prev.fx);

    para.events = [];
    Object.values(blocks).forEach((B) => {
      if (B.cfg.lines) para.events.push({ type: B.cfg.lines, t: Math.round(B.start), lines: B.lines });
      if (B.cfg.spot) {
        para.events.push({ type: 'spot', t: Math.round(B.start), end: Math.round(B.end + 2600) });
        end = Math.max(end, B.end + 3600);
      }
      if (B.cfg.lines) end = Math.max(end, B.start + 3800);
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
    for (let i = 0; i < parts.length; i += 2) {
      const block = parts[i];
      const sep = i ? parts[i - 1] : '';
      const pageStart = i === 0 || (sep.match(/\n/g) || []).length >= 3;
      const cells = flagCells(block);
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
          scene = SCENES[m[1]];
          ground = m[2] ? GROUNDS[m[2]] : null;
          rows.push({ sceneMark: scene, ground, text: m[0].trim() });
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
   * 문단을 페이지로 묶는다. 페이지마다 장면(day·night)과 바탕(ground)을 정한다.
   * 장면 표시가 없으면 앞 페이지의 장면과 바탕을 이어받고, 표시에 바탕 이름이 없으면 그 장면의 기본 바탕을 쓴다.
   */
  function pages(parsed) {
    const out = [];
    let cur = null;
    let scene = 'day';
    let ground = DEFAULT_GROUND.day;
    let pending = null;
    parsed.paragraphs.forEach((para) => {
      const mark = para.rows.filter((r) => r.sceneMark).pop();
      if (mark) pending = { scene: mark.sceneMark, ground: mark.ground };
      if (para.sceneOnly) {
        if (cur && cur.paragraphs.length) cur = null;
        return;
      }
      if (!cur || para.pageStart || mark) {
        if (pending) {
          scene = pending.scene;
          ground = pending.ground || DEFAULT_GROUND[scene];
          pending = null;
        }
        cur = { paragraphs: [], scene, ground, count: 0 };
        out.push(cur);
      }
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

  /* 공백·줄바꿈·블록 표시·장면 표시·| 는 그대로 두고 나머지 글자를 가린다. keepPunct면 문장부호도 남긴다. */
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
    RULES, TIME, SETTLE, BLOCKS, BLOCK_NAMES, BLOCK_DEFAULT, MASK, EM_OPEN, EM_CLOSE, PREFIX_RE,
    GROUNDS, DEFAULT_GROUND,
    graphemes, isPunct, trimSource, stripMarks, parse, pages, stats, mask
  };
})(typeof window !== 'undefined' ? window : globalThis);
