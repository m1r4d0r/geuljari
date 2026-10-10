/*
 * 글결 조판값
 * 편집실(index.js)·심상 검수(simsang.js)·읽기 틀(view.js)이 같은 조판값을 같은 방식으로 엔진에 건다.
 * 조판값: 흐름, 속도, 쉼, 처음 장면(라이트·다크), 바탕, 마름, 넘김(장면이 바뀌는 쪽에 넘김을 적지 않았을 때), 글꼴,
 *   글자 크기(배율), 글 상자 폭(PC, 0이면 저절로), 정렬(저절로·왼쪽·가운데·오른쪽·양쪽), 주색(테마).
 * 심상은 반대말 세 쌍(축)이고 축마다 하나만 고른다. 축은 저마다 맡은 값만 바꾸므로 서로 덮지 않는다.
 *   온도 → 넘김·마름 / 물기 → 흐름 / 숨 → 속도·쉼
 * 속도는 흐름·블록·효과 움직임의 시간을 함께 늘이고 줄인다(docs/효과-규칙.md). 넘김은 속도와 상관없다.
 * 전역 GeulTune.
 */
(function (global) {
  'use strict';

  const AXES = [
    { name: '온도', words: ['따뜻한', '차가운'] },
    { name: '물기', words: ['젖은', '마른'] },
    { name: '숨', words: ['고요한', '숨찬'] }
  ];
  const WORDS = AXES.flatMap((a) => a.words);

  /* 낱말마다 조판값에 주는 영향과 고를 때 보이는 짧은 풀이 */
  const MOOD = {
    '따뜻한': { turn: '조리개', dry: '느리게', note: '천천히 마르고, 빛이 열리듯 넘겨요' },
    '차가운': { turn: '셔터', dry: '빨리', note: '빨리 마르고, 짧게 끊어 넘겨요' },
    '젖은': { flow: '번짐', note: '글자가 번지며 나타나요' },
    '마른': { flow: '이어 쓰기', note: '번짐 없이 또박또박 나타나요' },
    '고요한': { speed: 0.85, rest: 2, note: '느리게 쓰고 쉼은 길게' },
    '숨찬': { speed: 1.2, rest: 0, note: '빠르게 쓰고 쉼은 짧게' }
  };

  /* 흐름 이름 → 보통 글자에 거는 효과(fx.js의 FX 이름). 이어 쓰기는 엔진 기본(fade·soft) 그대로 */
  const FLOWS = { '이어 쓰기': null, '번짐': 'bleed', '떠오름': 'rise', '타자': 'type' };
  const FLOW_NAMES = Object.keys(FLOWS);
  const REST_MS = [200, 320, 460, 620];
  const REST_NAMES = ['짧게', '보통', '길게', '아주 길게'];
  const DRY = { '빨리': 0.9, '보통': 1.8, '느리게': 3.2 };
  const DRY_NAMES = Object.keys(DRY);
  const GROUNDS = { '라이트': ['창빛', '한지', '잎그늘', '새벽', '편지지', '오로라'], '다크': ['영사광', '빛커튼', '물빛', '편지지', '오로라'] };
  const OLD_SCENE = { '낮': '라이트', '밤': '다크' };
  /* 넘김 이름은 엔진의 TURNS를 따른다. 장면이 바뀌는 쪽에는 스밈을 빼고 고른다. */
  const TURNS = (global.Geulgyeol && global.Geulgyeol.TURNS) || { '쓸기': 'sweep' };
  const TURN_NAMES = Object.keys(TURNS);
  const SCENE_TURNS = TURN_NAMES.filter((n) => n !== '스밈');
  /* 본문 글꼴. css는 font-family, q는 Google Fonts 이름 */
  const FONTS = {
    '송명': { css: "'Song Myung'", q: 'Song+Myung' },
    '함렛': { css: "'Hahmlet'", q: 'Hahmlet:wght@300..600' },
    '고운바탕': { css: "'Gowun Batang'", q: 'Gowun+Batang' },
    '나눔명조': { css: "'Nanum Myeongjo'", q: 'Nanum+Myeongjo' },
    '노토 세리프': { css: "'Noto Serif KR'", q: 'Noto+Serif+KR:wght@300..500' }
  };
  const FONT_NAMES = Object.keys(FONTS);
  const ALIGNS = { '저절로': null, '왼쪽': 'left', '가운데': 'center', '오른쪽': 'right', '양쪽': 'justify' };
  const ALIGN_NAMES = Object.keys(ALIGNS);
  /*
   * 주색: 이름 있는 여섯 가지 또는 직접 고른 색(#rrggbb). 편집실의 먹과 라이트 장면 글자색이 되고,
   * 나머지 색(흐린 글씨·선·고름 면)은 종이색과 섞어 만든다. 다크 장면의 바탕·글자·젖은 먹에도 주색을 조금 섞어 결을 맞춘다.
   * 이름 있는 색은 빛깔이 서로 멀고, 모두 종이(#ECEDF0) 위 글자 대비 7:1을 넘는 차분한 색이다.
   */
  const THEMES = { '남보라': '#2C2F6B', '먹': '#24221F', '솔': '#2C5536', '황토': '#624815', '벽돌': '#6E3B33', '자두': '#5E3050' };
  /* 목록에서 빠진 이름은 그 색 그대로 직접 고른 색이 된다 */
  const RETIRED_THEMES = { '쪽': '#1E4A66' };
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  const THEME_NAMES = Object.keys(THEMES);
  const PAPER = '#ECEDF0';
  /* 속도에 따라 줄이고 늘리는 시간표 항목 */
  const PACED = ['flowSlow', 'flowFast', 'lineBreak', 'stop', 'shortBefore', 'shortChar', 'shortAfter', 'dripBefore', 'dripChar', 'dripAfter', 'exitStagger'];
  const BLOCK_PACED = ['before', 'char', 'group', 'line', 'after', 'unitGap', 'hold'];

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function defaults() {
    return {
      flow: '이어 쓰기', speed: 1, rest: 1, scene: '라이트', ground: '창빛', dry: '보통', turn: '쓸기', font: '송명',
      size: 1, measure: 0, align: '저절로', theme: '남보라'
    };
  }

  /* 빠진 값·어긋난 값을 기본값으로 메운다 */
  function normalize(s) {
    const d = defaults();
    const o = Object.assign(d, s || {});
    if (!(o.flow in FLOWS)) o.flow = d.flow;
    o.speed = clamp(Number(o.speed) || 1, 0.5, 1.6);
    o.rest = clamp(Math.round(Number(o.rest)), 0, REST_MS.length - 1);
    if (OLD_SCENE[o.scene]) o.scene = OLD_SCENE[o.scene];
    if (!GROUNDS[o.scene]) o.scene = '라이트';
    if (!GROUNDS[o.scene].includes(o.ground)) o.ground = GROUNDS[o.scene][0];
    if (!(o.dry in DRY)) o.dry = '보통';
    if (!SCENE_TURNS.includes(o.turn)) o.turn = '쓸기';
    if (!(o.font in FONTS)) o.font = '송명';
    o.size = clamp(Number(o.size) || 1, 0.8, 1.5);
    o.measure = Number(o.measure) >= 14 ? clamp(Math.round(Number(o.measure)), 14, 44) : 0;
    if (!(o.align in ALIGNS)) o.align = '저절로';
    if (RETIRED_THEMES[o.theme]) o.theme = RETIRED_THEMES[o.theme];
    if (!(o.theme in THEMES) && !HEX_RE.test(String(o.theme))) o.theme = '남보라';
    return o;
  }

  /* 축마다 하나만 남긴다(나중에 고른 것이 이긴다) */
  function oneEach(words) {
    const out = [];
    (words || []).forEach((w) => {
      const ax = AXES.find((a) => a.words.includes(w));
      if (!ax) return;
      const k = out.findIndex((x) => ax.words.includes(x));
      if (k >= 0) out.splice(k, 1);
      out.push(w);
    });
    return AXES.flatMap((a) => out.filter((w) => a.words.includes(w)));
  }

  /*
   * 심상에서 조판값을 만든다. 심상이 맡지 않는 값(장면·바탕·글꼴)은 keep(지금 조판값)을 그대로 둔다.
   */
  function fromMoods(words, keep) {
    const s = defaults();
    if (keep) ['scene', 'ground', 'font', 'size', 'measure', 'align', 'theme'].forEach((k) => { if (keep[k] != null) s[k] = keep[k]; });
    oneEach(words).forEach((w) => {
      const m = MOOD[w];
      ['flow', 'speed', 'rest', 'dry', 'turn'].forEach((k) => { if (m[k] != null) s[k] = m[k]; });
    });
    return normalize(s);
  }

  /* 화면에 보일 조판값 [이름, 값] 목록 */
  function describe(s) {
    return [
      ['흐름', s.flow],
      ['속도', s.speed.toFixed(2) + '×'],
      ['쉼', REST_NAMES[s.rest]],
      ['장면', s.scene + ' ' + s.ground],
      ['넘김', s.turn],
      ['마름', s.dry],
      ['글꼴', s.font]
    ];
  }

  /* 첫 장의 쪽 표시 줄 */
  function sceneLine(s) {
    return `[[${s.scene}:${s.ground}]]`;
  }

  /*
   * 엔진 시간표·블록 시간·효과 움직임에 속도와 쉼을 건다.
   * 처음 부를 때의 값을 기준으로 삼아 여러 번 불러도 쌓이지 않는다. fx는 GeulFx(있으면 효과 움직임도 같이).
   */
  let base = null;
  function apply(E, s, fx) {
    if (!base) {
      base = { time: Object.assign({}, E.TIME), enter: Object.assign({}, E.ENTER), blocks: {} };
      Object.keys(E.BLOCKS).forEach((k) => { base.blocks[k] = Object.assign({}, E.BLOCKS[k]); });
    }
    const k = s.speed;
    PACED.forEach((n) => { E.TIME[n] = base.time[n] / k; });
    E.TIME.restPerSpace = REST_MS[s.rest] / Math.sqrt(k);
    Object.keys(base.enter).forEach((n) => { E.ENTER[n] = base.enter[n] / k; });
    Object.keys(base.blocks).forEach((name) => {
      BLOCK_PACED.forEach((n) => {
        const v = base.blocks[name][n];
        if (typeof v === 'number') E.BLOCKS[name][n] = v / k;
      });
    });
    if (fx && fx.setPace) fx.setPace(k);
  }

  /* 흐름 효과: 엔진이 보통 글자에 붙인 fade·soft를 고른 효과로 바꾼다. 강조 블록과 흘러내림은 그대로 둔다. */
  function flowCells(para, s) {
    const fx = FLOWS[s.flow];
    if (!fx) return para;
    para.lines.forEach((l) => l.tokens.forEach((tk) => tk.cells.forEach((c) => {
      if (!c.em && (c.anim === 'fade' || c.anim === 'soft')) c.anim = fx;
    })));
    return para;
  }
  function patchFlow(E, s) {
    if (!FLOWS[s.flow]) return;
    const parse = E.parse;
    E.parse = function (text) {
      const out = parse(text);
      out.paragraphs.forEach((p) => flowCells(p, s));
      return out;
    };
  }

  /* 두 색을 t만큼 섞는다(#rrggbb) */
  function mix(a, b, t) {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  /* 밝기(0~1) */
  function light(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  /* 주색 이름·색 → 글자로 쓸 수 있는 먹색(너무 밝게 고른 색은 종이 위에서 읽히도록 어둡게 누른다) */
  function themeInk(theme) {
    let ink = THEMES[theme] || (HEX_RE.test(String(theme)) ? String(theme).toUpperCase() : THEMES['남보라']);
    for (let k = 0; k < 6 && light(ink) > 0.42; k++) ink = mix(ink, '#000000', 0.25);
    return ink;
  }
  /* 주색에서 만든 색 변수들(편집실·미리보기 공통). 다크 쪽 색은 --dark·--dark-ink, 미리보기에서는 --theme-night-* */
  function themeVars(theme) {
    const ink = themeInk(theme);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
    const night = mix(ink, '#090A0D', 0.8);
    const nightInk = mix(ink, '#F1F2F5', 0.86);
    return {
      '--ink': ink, '--lead': mix(ink, PAPER, 0.22), '--faint': mix(ink, PAPER, 0.48), '--line': mix(ink, PAPER, 0.74),
      '--empty': mix(ink, PAPER, 0.6), '--pick': mix(ink, PAPER, 0.84), '--smudge': `rgba(${r}, ${g}, ${b}, .10)`,
      '--carbon': `.6px .45px 0 rgba(${r}, ${g}, ${b}, .24)`, '--wet-ink': mix(ink, PAPER, 0.45),
      '--dark': mix(ink, '#0F1016', 0.72), '--dark-ink': nightInk,
      '--night-paper': night, '--night-ink': nightInk, '--night-soft': mix(nightInk, night, 0.42), '--night-wet': mix(ink, '#FFFFFF', 0.55)
    };
  }
  function useTheme(doc, s) {
    Object.entries(themeVars(s.theme)).forEach(([k, v]) => doc.documentElement.style.setProperty(k, v));
  }

  /* 글꼴을 문서에 불러오고 --f-read에 건다 */
  function useFont(doc, s) {
    const f = FONTS[s.font];
    const id = 'geul-font';
    let link = doc.getElementById(id);
    if (!link) {
      link = doc.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      doc.head.append(link);
    }
    const href = `https://fonts.googleapis.com/css2?family=${f.q}&display=swap`;
    if (link.href !== href) link.href = href;
    doc.documentElement.style.setProperty('--f-read', `${f.css}, 'Song Myung', 'Noto Serif KR', serif`);
  }

  global.GeulTune = {
    AXES, WORDS, MOOD, FLOWS, FLOW_NAMES, REST_NAMES, DRY, DRY_NAMES, GROUNDS, TURNS, TURN_NAMES, SCENE_TURNS, FONTS, FONT_NAMES,
    ALIGNS, ALIGN_NAMES, THEMES, THEME_NAMES, HEX_RE,
    defaults, normalize, oneEach, fromMoods, describe, sceneLine, apply, flowCells, patchFlow, useFont, themeInk, themeVars, useTheme
  };
})(typeof window !== 'undefined' ? window : globalThis);
