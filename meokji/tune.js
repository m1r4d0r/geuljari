/*
 * 글결 먹지판 조판값
 * 편집실(index.js)과 읽기 틀(read.js)이 같은 조판값을 같은 방식으로 엔진에 건다.
 * 조판값: 흐름(문단 기본 효과), 속도, 쉼, 처음 장면, 바탕, 마름.
 * 심상 낱말을 고르면 낱말마다 정해 둔 영향을 고른 차례대로 겹쳐 조판값을 만든다. 나중 낱말이 앞 낱말을 덮는다.
 * 전역 GeulTune.
 */
(function (global) {
  'use strict';

  const WORDS = ['따뜻한', '차가운', '젖은', '마른', '고요한', '숨찬', '먼', '가까운', '새벽', '한낮', '물', '종이'];

  const MOOD = {
    '따뜻한': { speed: -0.05, dry: '느리게' },
    '차가운': { speed: 0.1, rest: -1, dry: '빨리' },
    '젖은': { flow: '번짐', dry: '느리게' },
    '마른': { flow: '이어 쓰기', dry: '빨리' },
    '고요한': { speed: -0.15, rest: 1 },
    '숨찬': { speed: 0.2, rest: -1 },
    '먼': { speed: -0.05, rest: 1, flow: '떠오름' },
    '가까운': { speed: 0.05, flow: '타자' },
    '새벽': { scene: '밤', ground: '영사광' },
    '한낮': { scene: '낮', ground: '창빛' },
    '물': { scene: '밤', ground: '물빛' },
    '종이': { scene: '낮', ground: '원고지' }
  };

  /* 흐름 이름 → 보통 글자에 거는 효과(fx.js의 FX 이름). 이어 쓰기는 엔진 기본(fade·soft) 그대로 */
  const FLOWS = { '이어 쓰기': null, '번짐': 'bleed', '떠오름': 'rise', '타자': 'type' };
  const FLOW_NAMES = Object.keys(FLOWS);
  const REST_MS = [200, 320, 460, 620];
  const REST_NAMES = ['짧게', '보통', '길게', '아주 길게'];
  const DRY = { '빨리': 0.9, '보통': 1.8, '느리게': 3.2 };
  const DRY_NAMES = Object.keys(DRY);
  const GROUNDS = { '낮': ['창빛', '원고지'], '밤': ['영사광', '오로라', '물빛'] };
  /* 속도에 따라 줄이고 늘리는 시간표 항목 */
  const PACED = ['flowSlow', 'flowFast', 'lineBreak', 'stop', 'shortBefore', 'shortChar', 'shortAfter', 'dripBefore', 'dripChar', 'dripAfter'];

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function defaults() {
    return { flow: '이어 쓰기', speed: 1, rest: 1, scene: '낮', ground: '창빛', dry: '보통' };
  }

  /* 빠진 값·어긋난 값을 기본값으로 메운다 */
  function normalize(s) {
    const d = defaults();
    const o = Object.assign(d, s || {});
    if (!(o.flow in FLOWS)) o.flow = d.flow;
    o.speed = clamp(Number(o.speed) || 1, 0.5, 1.6);
    o.rest = clamp(Math.round(Number(o.rest)), 0, REST_MS.length - 1);
    if (!GROUNDS[o.scene]) o.scene = '낮';
    if (!GROUNDS[o.scene].includes(o.ground)) o.ground = GROUNDS[o.scene][0];
    if (!(o.dry in DRY)) o.dry = '보통';
    return o;
  }

  function fromMoods(words) {
    const s = defaults();
    (words || []).forEach((w) => {
      const m = MOOD[w];
      if (!m) return;
      if (m.speed) s.speed += m.speed;
      if (m.rest) s.rest += m.rest;
      ['flow', 'scene', 'ground', 'dry'].forEach((k) => { if (m[k]) s[k] = m[k]; });
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
      ['마름', s.dry]
    ];
  }

  /* 첫 장의 장면 표시 줄 */
  function sceneLine(s) {
    return `[[${s.scene}:${s.ground}]]`;
  }

  /* 엔진 시간표에 속도와 쉼을 건다. 처음 부를 때의 값을 기준으로 삼아 여러 번 불러도 쌓이지 않는다. */
  let base = null;
  function apply(E, s) {
    if (!base) base = Object.assign({}, E.TIME);
    PACED.forEach((k) => { E.TIME[k] = base[k] / s.speed; });
    E.TIME.restPerSpace = REST_MS[s.rest];
  }

  /* 흐름 효과: 엔진이 보통 글자에 붙인 fade·soft를 고른 효과로 바꾼다. 강조 블록과 흘러내림은 그대로 둔다. */
  function patchFlow(E, s) {
    const fx = FLOWS[s.flow];
    if (!fx) return;
    const parse = E.parse;
    E.parse = function (text) {
      const out = parse(text);
      out.paragraphs.forEach((p) => p.lines.forEach((l) => l.tokens.forEach((tk) => tk.cells.forEach((c) => {
        if (!c.em && (c.anim === 'fade' || c.anim === 'soft')) c.anim = fx;
      }))));
      return out;
    };
  }

  global.GeulTune = {
    WORDS, MOOD, FLOW_NAMES, REST_NAMES, DRY, DRY_NAMES, GROUNDS,
    defaults, normalize, fromMoods, describe, sceneLine, apply, patchFlow
  };
})(typeof window !== 'undefined' ? window : globalThis);
