/*
 * 글결 조판값
 * 편집실(index.js)·심상 검수(simsang.js)·읽기 틀(view.js)이 같은 조판값을 같은 방식으로 엔진에 건다.
 * 조판값: 흐름, 속도, 쉼, 처음 장면(라이트·다크), 바탕, 바뀐 장면의 바탕(altGround), 마름,
 *   넘김(장면이 바뀌는 쪽에 넘김을 적지 않았을 때: turn은 다크로, turnLight는 라이트로, 비면 turn과 같음), 글꼴,
 *   글자 크기(배율), 글 상자 폭(PC, 0이면 저절로), 정렬(저절로·왼쪽·가운데·오른쪽·양쪽), 주색(테마).
 * 심상은 세 축이고 축마다 하나만 고른다. 축은 저마다 맡은 값만 바꾸므로 서로 덮지 않는다.
 *   심상(빛·바람·물·시간·종이) → 두 장면의 바탕과 장면이 바뀔 때의 넘김 / 물기 → 흐름·마름 / 호흡 → 글 상자 폭
 *   축을 바꾸면 그 축이 맡은 값만 바뀐다(setAxis). 속도·쉼 같은 나머지 값은 전체 설정에서 고른다.
 * 속도는 흐름·블록·효과 움직임의 시간과 띄어 쓴 쉼·마르는 시간을 함께 늘이고 줄인다(docs/효과-규칙.md).
 * 넘김은 따로 전환 속도(turnSpeed)를 따른다. 둘 다 화면의 1.0×가 엔진 기본보다 조금 빠르다(PACE·TURN_PACE).
 * 전역 GeulTune.
 */
(function (global) {
  'use strict';

  const AXES = [
    { name: '심상', words: ['빛', '바람', '물', '시간', '종이'] },
    { name: '물기', words: ['젖은', '마른'] },
    { name: '호흡', words: ['긴', '짧은'] }
  ];
  const WORDS = AXES.flatMap((a) => a.words);

  /* 낱말마다 조판값에 주는 영향과 고를 때 보이는 짧은 풀이 */
  /* 심상 한 벌: 라이트·다크 바탕과, 다크로·라이트로 바뀔 때의 넘김 */
  const IMAGES = {
    '빛': { day: '창빛', night: '영사광', toNight: '피어남', toDay: '피어남' },
    '바람': { day: '잎그늘', night: '빛커튼', toNight: '쓸기', toDay: '쓸기' },
    '물': { day: '오로라', night: '물빛', toNight: '잠수', toDay: '잠수' },
    '시간': { day: '새벽', night: '오로라', toNight: '해넘이', toDay: '해돋이' },
    '종이': { day: '원고지', night: '타자', toNight: '먹자국', toDay: '글리치' }
  };
  const MOOD = {
    '빛': { image: IMAGES['빛'], note: '창으로 드는 빛과 영사기 빛, 빛이 피어나듯 넘겨요' },
    '바람': { image: IMAGES['바람'], note: '잎 그늘과 빛 커튼이 흔들리고, 바람이 쓸듯 넘겨요' },
    '물': { image: IMAGES['물'], note: '물빛이 일렁이고, 물속으로 잠기듯 넘겨요' },
    '시간': { image: IMAGES['시간'], note: '새벽과 오로라, 해가 지고 뜨듯 넘겨요' },
    '종이': { image: IMAGES['종이'], note: '원고지와 타자, 먹이 번지고 글자가 튀듯 넘겨요' },
    '젖은': { flow: '번짐', dry: '느리게', note: '글자가 번지며 나타나고 천천히 말라요' },
    '마른': { flow: '이어 쓰기', dry: '빨리', note: '번짐 없이 또박또박 나타나고 빨리 말라요' },
    '긴': { measure: 34, note: '한 줄에 많이 담아 길게 읽혀요' },
    '짧은': { measure: 18, note: '줄을 짧게 끊어 한 줄씩 읽혀요' }
  };

  /* 흐름 이름 → 보통 글자에 거는 효과(fx.js의 FX 이름). 이어 쓰기는 엔진 기본(fade·soft) 그대로, 바로는 효과 없이 한 번에 놓는다 */
  const FLOWS = { '바로': 'now', '이어 쓰기': null, '번짐': 'bleed', '떠오름': 'rise', '초점': 'focus', '타자': 'type' };
  /* 바로: 보통 글자를 처음부터 놓고, 강조는 그 뒤 잠깐 쉬었다가 제 움직임으로 */
  const NOW_LEAD = 400;
  const FLOW_NAMES = Object.keys(FLOWS);
  const REST_MS = [200, 320, 460, 620];
  const REST_NAMES = ['짧게', '보통', '길게', '아주 길게'];
  const DRY = { '빨리': 0.9, '보통': 1.8, '느리게': 3.2 };
  /* 화면의 속도 1.0×가 엔진 기본보다 이만큼 빠르다. 전환(넘김)도 같은 식 */
  const PACE = 1.15;
  const TURN_PACE = 1.2;
  const DRY_NAMES = Object.keys(DRY);
  const GROUNDS = { '라이트': ['창빛', '원고지', '잎그늘', '새벽', '편지지', '오로라', '단색'], '다크': ['영사광', '빛커튼', '물빛', '타자', '편지지', '오로라', '단색'] };
  const OLD_SCENE = { '낮': '라이트', '밤': '다크' };
  /* 넘김 이름은 엔진의 TURNS를 따른다. 장면이 바뀌는 쪽에는 스밈을 빼고 고른다.
     막·셔터·조리개는 고르는 판에서 뺐다(이미 적힌 쪽 표시는 그대로 넘긴다). */
  const TURNS = (global.Geulgyeol && global.Geulgyeol.TURNS) || { '쓸기': 'sweep' };
  const RETIRED_TURNS = ['막', '셔터', '조리개'];
  const TURN_NAMES = Object.keys(TURNS).filter((n) => !RETIRED_TURNS.includes(n));
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
   * 이름 있는 색은 빛깔이나 밝기가 서로 멀고(어느 둘도 CIELAB ΔE 28 안으로 붙지 않음), 모두 종이(#ECEDF0) 위 글자 대비 7:1을 넘는 차분한 색이다.
   */
  const THEMES = { '남보라': '#2C2F6B', '먹': '#24221F', '솔': '#2C5536', '황토': '#5F4D13', '벽돌': '#744137', '자두': '#531C3C' };
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
      flow: '이어 쓰기', speed: 1, rest: 1, scene: '라이트', ground: '창빛', altGround: '', dry: '보통', turn: '쓸기', turnLight: '', font: '송명',
      size: 1, measure: 0, align: '저절로', theme: '남보라', turnSpeed: 1
    };
  }

  const otherScene = (sc) => (sc === '다크' ? '라이트' : '다크');

  /* 빠진 값·어긋난 값을 기본값으로 메운다 */
  function normalize(s) {
    const d = defaults();
    const o = Object.assign(d, s || {});
    if (!(o.flow in FLOWS)) o.flow = d.flow;
    o.speed = clamp(Number(o.speed) || 1, 0.5, 1.6);
    o.turnSpeed = clamp(Number(o.turnSpeed) || 1, 0.6, 1.6);
    o.rest = clamp(Math.round(Number(o.rest)), 0, REST_MS.length - 1);
    if (OLD_SCENE[o.scene]) o.scene = OLD_SCENE[o.scene];
    if (!GROUNDS[o.scene]) o.scene = '라이트';
    if (!GROUNDS[o.scene].includes(o.ground)) o.ground = GROUNDS[o.scene][0];
    if (!(o.dry in DRY)) o.dry = '보통';
    if (!SCENE_TURNS.includes(o.turn)) o.turn = '쓸기';
    if (!SCENE_TURNS.includes(o.turnLight)) o.turnLight = '';
    if (!GROUNDS[otherScene(o.scene)].includes(o.altGround)) o.altGround = '';
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

  /* 축이 맡은 값 */
  const AXIS_KEYS = { '심상': ['ground', 'altGround', 'turn', 'turnLight'], '물기': ['flow', 'dry'], '호흡': ['measure'] };
  /* 목록에서 빠진 낱말(숨: 고요한·숨찬). 이 낱말을 고른 글은 속도·쉼을 기본으로 돌린다 */
  const RETIRED_WORDS = ['고요한', '숨찬'];

  /*
   * 축 하나의 낱말을 바꾼 조판값. 그 축이 맡은 값만 바뀌고 나머지는 s 그대로다.
   * 심상을 고르면 처음 장면의 바탕·바뀐 장면의 바탕·두 방향 넘김이 그 한 벌로 바뀌고, 빼면 바탕·넘김은 지금 것을 둔다.
   * 물기·호흡은 빼면 그 값이 기본(이어 쓰기·보통 마름, 저절로 폭)으로 돌아간다.
   */
  function setAxis(s, axis, word) {
    const o = normalize(s);
    const m = word ? MOOD[word] : null;
    if (axis === '심상') {
      if (m && m.image) {
        o.ground = o.scene === '다크' ? m.image.night : m.image.day;
        o.altGround = o.scene === '다크' ? m.image.day : m.image.night;
        o.turn = m.image.toNight;
        o.turnLight = m.image.toDay;
      }
      return normalize(o);
    }
    const d = defaults();
    (AXIS_KEYS[axis] || []).forEach((k) => { o[k] = m && m[k] != null ? m[k] : d[k]; });
    return normalize(o);
  }

  /* 낱말 모음에서 조판값을 만든다(축마다 setAxis). keep이 없으면 기본값에서 */
  function fromMoods(words, keep) {
    const list = oneEach(words);
    return AXES.reduce((s, ax) => setAxis(s, ax.name, list.find((w) => ax.words.includes(w)) || null), normalize(keep || defaults()));
  }

  /* 저장된 낱말에서 빠진 낱말을 걷고, 숨을 골랐던 글은 속도·쉼을 기본으로 */
  function retire(words, s) {
    const had = (words || []).some((w) => RETIRED_WORDS.includes(w));
    return { moods: oneEach(words), settings: had ? normalize(Object.assign({}, s, { speed: 1, rest: 1 })) : normalize(s) };
  }

  /* 장면이 바뀔 때의 넘김(엔진 이름): 다크로 · 라이트로 */
  function turnsOf(s) {
    return { turn: TURNS[s.turn], turnLight: TURNS[s.turnLight || s.turn] };
  }

  /* 장면마다 바탕(엔진 이름): 처음 장면은 ground, 다른 장면은 altGround(비면 엔진 기본) */
  function sceneGrounds(E, s) {
    const key = (n) => (n && E.GROUNDS[n]) || null;
    const first = s.scene === '다크' ? 'night' : 'day';
    const out = {};
    out[first] = key(s.ground);
    out[first === 'day' ? 'night' : 'day'] = key(s.altGround);
    return out;
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
    const k = s.speed * PACE;
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
    if (E.setSceneGrounds) E.setSceneGrounds(sceneGrounds(E, s));
  }

  /* 마르는 시간(초): 고른 마름을 속도에 맞춰 줄이고 늘인다 */
  function dryTime(s) { return DRY[s.dry] / (s.speed * PACE); }
  /* 넘김 시간을 나눌 값(클수록 빨리 넘김) */
  function turnPace(s) { return (s.turnSpeed || 1) * TURN_PACE; }

  /* 흐름 효과: 엔진이 보통 글자에 붙인 fade·soft를 고른 효과로 바꾼다. 강조 블록과 흘러내림은 그대로 둔다. */
  function flowCells(para, s) {
    const fx = FLOWS[s.flow];
    if (!fx) return para;
    if (fx === 'now') return nowCells(para);
    para.lines.forEach((l) => l.tokens.forEach((tk) => tk.cells.forEach((c) => {
      if (!c.em && (c.anim === 'fade' || c.anim === 'soft')) c.anim = fx;
    })));
    return para;
  }
  function nowCells(para) {
    const cells = para.lines.flatMap((l) => l.tokens.flatMap((tk) => tk.cells));
    const em = cells.filter((c) => c.em && c.anim !== 'fall');
    const shift = em.length ? Math.max(0, Math.min(...em.map((c) => c.t)) - NOW_LEAD) : para.lead;
    cells.forEach((c) => {
      if (em.includes(c)) c.t = Math.max(0, c.t - shift);
      else { c.t = 0; if (c.anim === 'soft') c.anim = 'fade'; }
    });
    (para.events || []).forEach((ev) => { if (typeof ev.t === 'number') { ev.t = Math.max(0, ev.t - shift); ev.end -= shift; } });
    para.lead = Math.max(0, para.lead - shift);
    para.span = Math.max(em.length ? para.span - shift : 0, 700);
    return para;
  }
  /* 쪽 표시의 결 이름(띄어쓰기 없음) → 흐름 이름 */
  const flowName = (w) => FLOW_NAMES.find((n) => n.replace(/\s/g, '') === w) || null;
  /* 쪽마다: 그 쪽 표시의 결이 있으면 그것, 없으면 글 전체 결 */
  function patchFlow(E, s) {
    if (!E.setFlowHook) return;
    E.setFlowHook((para, w) => flowCells(para, { flow: flowName(w) || s.flow }));
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
  /*
   * 주색이 바탕에 스미는 세기(0~1). paper: 라이트 종이색에 주색, light: 바탕의 빛(볕·영사광·물빛·커튼·타자 화면)에 주색을 밝힌 빛,
   * line: 원고지 칸 선에 주색. 바탕 스밈 시험판에서 바꿔 보며 정한다.
   */
  const TINT = { paper: 0.035, light: 0.18, line: 0.45 };
  /* 주색을 빛으로: 색상은 그대로, 채도는 누르고 아주 밝게 */
  function lightTint(ink) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
    const s = d ? Math.min(0.6, Math.max(0.28, d / (1 - Math.abs(mx + mn - 1)))) : 0;
    const l = 0.84;
    const k = (n) => (n + (h + 360) / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255).toString(16).padStart(2, '0');
    return '#' + f(0) + f(8) + f(4);
  }
  /* 읽기 틀(미리보기·공개 뷰어·공유 그림)에 거는 주색 변수. 장면 변수는 이것을 받아 쓴다(view.css) */
  function readerVars(theme, tint) {
    const t = Object.assign({}, TINT, tint || {});
    const v = themeVars(theme);
    const ink = v['--ink'];
    return {
      '--theme-ink': ink, '--theme-lead': v['--lead'], '--theme-wet': v['--wet-ink'],
      '--theme-paper': mix(PAPER, ink, t.paper),
      '--theme-night-paper': v['--night-paper'], '--theme-night-ink': v['--night-ink'], '--theme-night-soft': v['--night-soft'], '--theme-night-wet': v['--night-wet'],
      '--theme-light': lightTint(ink), '--tint-light': String(t.light), '--tint-line': String(t.line), '--tint-line-pc': Math.round(t.line * 100) + '%'
    };
  }
  function useReaderTheme(doc, theme, tint) {
    Object.entries(readerVars(theme, tint)).forEach(([k, v]) => doc.documentElement.style.setProperty(k, v));
  }

  /* 주색에서 만든 색 변수들(편집실·미리보기 공통). 다크 쪽 색은 --dark·--dark-ink, 미리보기에서는 --theme-night-* */
  function themeVars(theme) {
    const ink = themeInk(theme);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
    /* 종이 위 먹은 네 단계뿐: 먹 · 납 22% · 흐림 50%(젖은 먹도 같음) · 선 74% · 고름 84%(면) */
    const faint = mix(ink, PAPER, 0.5);
    const night = mix(ink, '#090A0D', 0.8);
    const nightInk = mix(ink, '#F1F2F5', 0.86);
    return {
      '--ink': ink, '--lead': mix(ink, PAPER, 0.22), '--faint': faint, '--line': mix(ink, PAPER, 0.74), '--pick': mix(ink, PAPER, 0.84), '--smudge': `rgba(${r}, ${g}, ${b}, .10)`,
      '--carbon': `.6px .45px 0 rgba(${r}, ${g}, ${b}, .24)`, '--wet-ink': faint,
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
    AXES, AXIS_KEYS, WORDS, MOOD, setAxis, retire, IMAGES, FLOWS, FLOW_NAMES, REST_NAMES, DRY, DRY_NAMES, GROUNDS, TURNS, TURN_NAMES, SCENE_TURNS, FONTS, FONT_NAMES,
    ALIGNS, ALIGN_NAMES, THEMES, THEME_NAMES, HEX_RE,
    PACE, TURN_PACE, dryTime, turnPace, flowName,
    defaults, normalize, oneEach, fromMoods, turnsOf, describe, sceneLine, apply, flowCells, patchFlow, useFont, themeInk, themeVars, useTheme, TINT, readerVars, useReaderTheme, lightTint
  };
})(typeof window !== 'undefined' ? window : globalThis);
