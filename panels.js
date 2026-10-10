/*
 * 글결 미리보기 판
 * 미리보기 오른쪽 가장자리의 책갈피를 누르면 그 판 하나만 열린다. 다시 누르거나 닫기·Esc로 접는다.
 * - 분위기: 심상 세 축(온도·물기·숨).
 * - 글씨: 글꼴, 글자 크기(PC·폰 함께), 정렬, 글 상자 폭(PC). 바꾸면 미리보기가 다시 쓰지 않고 바로 바뀐다.
 * - 움직임: 나타나는 결, 쓰는 빠르기, 띄어 쓴 쉼, 마르는 빠르기. '다시 보기'를 눌러야 움직임으로 보인다.
 * - 배경: 지금 보는 쪽의 장면(첫 쪽)·반전(둘째 쪽부터)·바탕·넘어오는 결, 글 자리.
 *   넘어오는 결을 고르면 앞 쪽을 다 쓴 모습에서 바로 넘겨 넘김만 보인다.
 * 글 고치기·강조·꾸밈은 판이 아니라 미리보기의 글 상자를 눌러서 한다(inplace.js).
 * 폰 폭에서는 아래에서 올라오는 판이 된다. 전역 GeulPanels.
 */
(function (global) {
  'use strict';
  const E = global.Geulgyeol;
  const T = global.GeulTune;
  const S = global.GeulSense;
  const SCENE_WORD = { day: '라이트', night: '다크' };
  const groundName = (g) => Object.keys(E.GROUNDS).find((k) => E.GROUNDS[k] === g) || g;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function segment(names, current, onPick, cls) {
    const box = el('div', 'seg' + (cls ? ' ' + cls : ''));
    box.setAttribute('role', 'group');
    names.forEach((n) => {
      const b = el('button', null, Array.isArray(n) ? n[1] : n);
      const v = Array.isArray(n) ? n[0] : n;
      b.type = 'button';
      b.setAttribute('aria-pressed', String(v === current));
      b.addEventListener('click', () => onPick(v));
      box.append(b);
    });
    return box;
  }

  function row(label, ...kids) {
    const r = el('div', 'pn-row');
    r.append(el('span', 'pn-name', label), ...kids);
    return r;
  }

  function range(min, max, step, value, shown, onInput) {
    const wrap = el('label', 'pn-range');
    const v = el('span', 'k', shown(value));
    const input = el('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => { v.textContent = shown(Number(input.value)); onInput(Number(input.value)); });
    wrap.append(input, v);
    return wrap;
  }

  /* 심상: 축(반대말 한 쌍)마다 한 줄. 줄 안에서 하나만 고르고, 고른 것을 다시 누르면 뺀다 */
  function moodGrid(box, moods, onPick) {
    box.replaceChildren();
    T.AXES.forEach((ax) => {
      box.append(el('span', 'ax', ax.name));
      ax.words.forEach((w) => {
        const b = el('button', null, w);
        b.type = 'button';
        b.title = T.MOOD[w].note;
        b.setAttribute('aria-pressed', String(moods.includes(w)));
        b.addEventListener('click', () => {
          const list = moods.filter((x) => !ax.words.includes(x));
          if (!moods.includes(w)) list.push(w);
          onPick(list);
        });
        box.append(b);
      });
    });
  }

  /* 조판값 요약 한 줄(장면·글꼴은 뺀다) */
  function mix(box, s) {
    box.replaceChildren();
    T.describe(s).filter(([k]) => k !== '장면' && k !== '글꼴').forEach(([k, v]) => {
      const sp = el('span');
      sp.append(k + ' ', el('b', null, v));
      box.append(sp);
    });
  }

  /*
   * ctx: get() 본문, set(text) 본문 바꾸기, head(), settings(), setSettings(part), moods(), setMoods(list),
   *      page() 지금 쪽(0부터), show(start) 다 쓴 모습으로 바로 보이기, play(start) 움직임으로 다시 쓰기, replay() 이 쪽 다시 보기,
   *      wide() 넓은 틀(PC)을 보고 있는지
   */
  function mount(ctx) {
    const panels = {};
    ['mood', 'type', 'motion', 'ground'].forEach((name) => { panels[name] = document.getElementById('panel-' + name); });
    let current = null;
    let onChange = () => {};

    function pages() { return E.pages(E.parse(ctx.head() + ctx.get())); }

    function open(name) {
      Object.entries(panels).forEach(([n, p]) => { p.hidden = n !== name; });
      current = name;
      render(name);
      onChange();
    }
    function close() {
      Object.values(panels).forEach((p) => { p.hidden = true; });
      current = null;
      onChange();
    }
    const toggle = (name) => (current === name ? close() : open(name));
    Object.values(panels).forEach((p) => p.querySelector('.panel-x').addEventListener('click', close));

    function render(name) {
      ({ mood: renderMood, type: renderType, motion: renderMotion, ground: renderGround })[name]();
    }
    function refresh() { if (current) render(current); }
    function body(name) { return panels[name].querySelector('.panel-body'); }
    function sub(name, text) { panels[name].querySelector('.panel-sub').textContent = text; }

    /* ---------- 분위기 ---------- */

    function renderMood() {
      const b = body('mood');
      b.replaceChildren();
      const grid = el('div', 'moods');
      moodGrid(grid, ctx.moods(), (list) => { ctx.setMoods(list); renderMood(); });
      const m = el('p', 'mix');
      mix(m, ctx.settings());
      const look = el('a', 'link small', '낱말 하나씩 살펴보기');
      look.href = 'simsang.html';
      b.append(grid, m, replayRow(), look);
    }

    function replayRow() {
      const r = el('div', 'pn-foot');
      r.append(el('span', 'pn-note', '움직임은 다시 보기로 확인해요.'));
      const again = el('button', 'link', '다시 보기');
      again.type = 'button';
      again.addEventListener('click', () => ctx.replay());
      r.append(again);
      return r;
    }

    /* ---------- 글씨 ---------- */

    function renderType() {
      const b = body('type');
      const st = ctx.settings();
      b.replaceChildren();
      const set = (k, v) => { ctx.setSettings({ [k]: v }); renderType(); };
      b.append(row('글꼴', segment(T.FONT_NAMES, st.font, (v) => set('font', v), 'wide grid3')));
      b.append(row('글자 크기', range(80, 150, 5, Math.round(st.size * 100), (v) => v + '%', (v) => ctx.setSettings({ size: v / 100 }))));
      b.append(row('정렬', segment(T.ALIGN_NAMES, st.align, (v) => set('align', v), 'wide')));
      const width = row('글 상자 폭', range(12, 44, 1, st.measure || 12, (v) => (v < 14 ? '저절로' : v + '자'), (v) => ctx.setSettings({ measure: v < 14 ? 0 : v })));
      if (!ctx.wide()) width.append(el('span', 'pn-note', 'PC 화면에서만 티가 나요.'));
      b.append(width);
    }

    /* ---------- 움직임 ---------- */

    function renderMotion() {
      const b = body('motion');
      const st = ctx.settings();
      b.replaceChildren();
      const set = (k, v) => { ctx.setSettings({ [k]: v }); renderMotion(); };
      b.append(row('나타나는 결', segment(T.FLOW_NAMES, st.flow, (v) => set('flow', v), 'wide')));
      b.append(row('쓰는 빠르기', range(50, 160, 5, Math.round(st.speed * 100), (v) => (v / 100).toFixed(2) + '×', (v) => ctx.setSettings({ speed: v / 100 }))));
      b.append(row('띄어 쓴 쉼', range(0, 3, 1, st.rest, (v) => T.REST_NAMES[v], (v) => ctx.setSettings({ rest: v }))));
      b.append(row('마르는 빠르기', segment(T.DRY_NAMES, st.dry, (v) => set('dry', v), 'wide')));
      b.append(replayRow());
    }

    /* ---------- 배경 ---------- */

    function renderGround() {
      const b = body('ground');
      const all = pages();
      const k = Math.min(ctx.page(), all.length - 1);
      const pg = all[k];
      const before = all[k - 1];
      const src = ctx.get();
      sub('ground', `${k + 1}쪽 · ${SCENE_WORD[pg.scene]} · ${groundName(pg.ground)}`);
      b.replaceChildren();
      const sceneName = SCENE_WORD[pg.scene];

      if (k === 0) {
        const st = ctx.settings();
        b.append(row('장면', segment(Object.keys(T.GROUNDS), st.scene, (v) => { ctx.setSettings({ scene: v }); renderGround(); }, 'wide')));
        b.append(row('바탕', segment(T.GROUNDS[st.scene], st.ground, (v) => { ctx.setSettings({ ground: v }); renderGround(); }, 'wide')));
      } else {
        const turned = pg.scene !== before.scene;
        const rev = el('button', 'pn-check');
        rev.type = 'button';
        rev.setAttribute('aria-pressed', String(turned));
        rev.innerHTML = '<i class="box"></i>';
        rev.append(turned ? `이 쪽부터 ${sceneName}` : `이 쪽부터 ${before.scene === 'night' ? '라이트' : '다크'}로 바꾸기`);
        rev.addEventListener('click', () => {
          let t = ctx.get();
          if (turned) {
            t = S.setPageMark(t, k, 'turn', null);
            t = S.setPageMark(t, k, 'ground', null);
            t = S.setPageMark(t, k, 'scene', null);
          } else t = S.setPageMark(t, k, 'scene', before.scene === 'night' ? '라이트' : '다크');
          ctx.set(t);
          ctx.show({ page: k - 1, done: true, next: true });
          renderGround();
        });
        b.append(row('반전', rev));
        b.append(row('바탕', segment(T.GROUNDS[sceneName], groundName(pg.ground), (v) => {
          ctx.set(S.setPageMark(ctx.get(), k, 'ground', v));
          ctx.show({ page: k, done: true });
          renderGround();
        }, 'wide')));
        if (turned) {
          const ownTurn = S.pageMark(src, k, 'turn');
          b.append(row('넘어오는 결', segment(T.SCENE_TURNS, ownTurn || ctx.settings().turn, (v) => {
            ctx.set(S.setPageMark(ctx.get(), k, 'turn', v));
            ctx.show({ page: k - 1, done: true, next: true });
            renderGround();
          }, 'wide grid4')));
        }
      }

      const own = S.pageMark(src, k, 'place') || '';
      const place = row('글 자리', segment([['', '저절로'], ['왼쪽', '왼쪽'], ['가운데', '가운데'], ['오른쪽', '오른쪽']], own, (v) => {
        ctx.set(S.setPageMark(ctx.get(), k, 'place', v || null));
        ctx.show({ page: k, done: true });
        renderGround();
      }, 'wide'));
      place.append(el('span', 'pn-note', ctx.wide() ? '미리보기에서 글 상자를 끌어 옮겨도 돼요.' : 'PC 화면에서만 티가 나요.'));
      b.append(place);
    }

    return {
      open, close, toggle, refresh,
      current: () => current,
      set onChange(fn) { onChange = fn; }
    };
  }

  global.GeulPanels = { mount, moodGrid, mix };
})(typeof window !== 'undefined' ? window : globalThis);
