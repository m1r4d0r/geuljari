/*
 * 글결 미리보기 판
 * 미리보기 오른쪽 가장자리의 책갈피를 누르면 그 판 하나만 열린다. 다시 누르거나 닫기·Esc로 접는다.
 * - 분위기: 심상 세 축(온도·물기·숨)과 주색. 주색은 다시 쓰지 않고 바로 바뀌고, 심상은 '다시 보기'를 눌러야 움직임으로 보인다.
 * - 글씨: 글꼴, 글자 크기(PC·폰 함께), 정렬, 글 상자 폭(PC). 바꾸면 미리보기가 다시 쓰지 않고 바로 바뀐다.
 * - 움직임: 나타나는 결, 쓰는 빠르기, 띄어 쓴 쉼, 마르는 빠르기. '다시 보기'를 눌러야 움직임으로 보인다.
 * - 배경: 지금 보는 쪽의 장면(첫 쪽)·반전(둘째 쪽부터)·바탕·넘어오는 결, 글 자리.
 *   넘어오는 결을 고르면 앞 쪽을 다 쓴 모습에서 바로 넘겨 넘김만 보인다.
 *   마지막 화면(글을 다 읽은 뒤의 한 장)에 있으면 그 화면의 장면·바탕을 고른다.
 * 글 고치기·강조·꾸밈은 판이 아니라 미리보기의 글 상자를 눌러서 한다(inplace.js).
 * 폰 폭에서는 아래에서 올라오는 판이 된다.
 * 심상 고르기(moodGrid), 주색 고르기(themeSwatches), 조각 고르기(pieces)는 편집실 글 화면의 오른쪽 칸도 같이 쓴다. 전역 GeulPanels.
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

  /* 조각 고르기: 이름마다 떨어진 조각 하나. 고른 것은 먹으로 채운다. names의 항목은 이름 또는 [값, 보이는 이름] */
  function pieces(names, current, onPick, cls) {
    const box = el('div', 'pieces' + (cls ? ' ' + cls : ''));
    box.setAttribute('role', 'group');
    names.forEach((n) => {
      const v = Array.isArray(n) ? n[0] : n;
      const b = el('button', 'piece', Array.isArray(n) ? n[1] : n);
      b.type = 'button';
      b.dataset.v = v;
      b.setAttribute('aria-pressed', String(v === current));
      b.addEventListener('click', () => onPick(v));
      box.append(b);
    });
    return box;
  }

  /* 심상: 축(반대말 한 쌍)마다 이름과 조각 둘. 축 안에서 하나만 고르고, 고른 것을 다시 누르면 뺀다 */
  function moodGrid(box, moods, onPick) {
    box.replaceChildren();
    T.AXES.forEach((ax) => {
      const r = el('div', 'mood-ax');
      r.setAttribute('role', 'group');
      r.setAttribute('aria-label', ax.name);
      r.append(el('span', 'ax', ax.name));
      ax.words.forEach((w) => {
        const b = el('button', 'piece', w);
        b.type = 'button';
        b.title = T.MOOD[w].note;
        b.setAttribute('aria-pressed', String(moods.includes(w)));
        b.addEventListener('click', () => {
          const list = moods.filter((x) => !ax.words.includes(x));
          if (!moods.includes(w)) list.push(w);
          onPick(list);
        });
        r.append(b);
      });
      box.append(r);
    });
  }

  /*
   * 주색: 이름 있는 색마다 네모 하나, 마지막 칸은 색 고르기. 고르면 onPick(이름 또는 #rrggbb).
   * 고른 표시는 그 자리에서 바꾸므로 색을 끌어 고르는 동안에도 고르기 창이 닫히지 않는다.
   */
  function themeSwatches(box, current, onPick) {
    box.replaceChildren();
    box.setAttribute('role', 'group');
    const named = T.THEME_NAMES.map((name) => {
      const b = el('button', 'swatch');
      b.type = 'button';
      b.style.setProperty('--sw', T.THEMES[name]);
      b.title = name;
      b.setAttribute('aria-label', '주색 ' + name);
      b.addEventListener('click', () => { mark(name); onPick(name); });
      return [name, b];
    });
    const pick = el('label', 'swatch picker');
    pick.title = '직접 고르기';
    const input = el('input');
    input.type = 'color';
    input.setAttribute('aria-label', '주색 직접 고르기');
    input.addEventListener('input', () => { mark(input.value); onPick(input.value); });
    pick.append(input);
    box.append(...named.map(([, b]) => b), pick);
    function mark(v) {
      const custom = T.HEX_RE.test(String(v));
      named.forEach(([n, b]) => b.setAttribute('aria-pressed', String(n === v)));
      pick.classList.toggle('on', custom);
      if (custom) pick.style.setProperty('--sw', v); else pick.style.removeProperty('--sw');
      const hex = custom ? v.toLowerCase() : T.themeInk(v).toLowerCase();
      if (input.value !== hex) input.value = hex;
    }
    mark(current);
  }

  /*
   * ctx: get() 본문, set(text) 본문 바꾸기, head(), settings(), setSettings(part), moods(), setMoods(list),
   *      page() 지금 쪽(0부터), show(start) 다 쓴 모습으로 바로 보이기, play(start) 움직임으로 다시 쓰기, replay() 이 쪽 다시 보기,
   *      wide() 넓은 틀(PC)을 보고 있는지, atEnd() 마지막 화면에 있는지, ending() 마지막 화면의 {scene, ground},
   *      setEnding(part) 마지막 화면 바꾸기(바꾼 뒤 그 화면을 보인다),
   *      look 분위기 살펴보기 덮개를 여는 함수(없으면 판 머리의 '살펴보기'를 감춘다)
   */
  function mount(ctx) {
    const panels = {};
    ['mood', 'type', 'motion', 'ground'].forEach((name) => { panels[name] = document.getElementById('panel-' + name); });
    let current = null;
    let onChange = () => {};
    const closing = new Map();
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

    function disclose(name, on) {
      const p = panels[name];
      const item = p.closest('.index-item');
      const trigger = document.querySelector('.tab[data-panel="' + name + '"]');
      clearTimeout(closing.get(name));
      closing.delete(name);
      if (!on && p.contains(document.activeElement) && trigger) trigger.focus({ preventScroll: true });
      p.inert = !on;
      p.setAttribute('aria-hidden', String(!on));
      if (!item) { p.hidden = !on; return; }
      if (on) {
        p.hidden = false;
        /* 0fr의 크기를 먼저 재야 새로 연 판도 아래로 부드럽게 펼쳐진다. */
        item.offsetHeight;
        item.classList.add('is-open');
      } else {
        item.classList.remove('is-open');
        if (p.hidden || reducedMotion.matches) p.hidden = true;
        else closing.set(name, setTimeout(() => {
          if (current !== name) p.hidden = true;
          closing.delete(name);
        }, 380));
      }
    }

    function pages() { return E.pages(E.parse(ctx.head() + ctx.get())); }

    function open(name) {
      current = name;
      render(name);
      Object.keys(panels).forEach((n) => disclose(n, n === name));
      onChange();
    }
    function close() {
      current = null;
      Object.keys(panels).forEach((n) => disclose(n, false));
      onChange();
    }
    const toggle = (name) => (current === name ? close() : open(name));
    Object.values(panels).forEach((p) => p.querySelector('.panel-x').addEventListener('click', close));
    const lookBtn = panels.mood.querySelector('.panel-look');
    if (lookBtn) lookBtn.addEventListener('click', () => { if (ctx.look) ctx.look(); });

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
      const sw = el('span', 'themes');
      sw.setAttribute('aria-label', '주색');
      themeSwatches(sw, ctx.settings().theme, (v) => ctx.setSettings({ theme: v }));
      const theme = el('div', 'set-row');
      theme.append(el('span', 'set-name', '주색'), sw);
      b.append(grid, theme, replayRow());
      const look = panels.mood.querySelector('.panel-look');
      if (look) look.hidden = !ctx.look;
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
      if (ctx.atEnd && ctx.atEnd()) { renderEnding(); return; }
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
        b.append(row('바탕', segment(T.GROUNDS[st.scene], st.ground, (v) => { ctx.setSettings({ ground: v }); renderGround(); }, 'wide grid3')));
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
        }, 'wide grid3')));
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

    /* 마지막 화면: 글을 다 읽은 뒤의 한 장. 장면과 바탕을 고르면 그 화면을 바로 다시 보인다 */
    function renderEnding() {
      const b = body('ground');
      const en = ctx.ending();
      sub('ground', '마지막 화면');
      b.replaceChildren();
      b.append(row('장면', segment(Object.keys(T.GROUNDS), en.scene, (v) => { ctx.setEnding({ scene: v }); renderGround(); }, 'wide')));
      b.append(row('바탕', segment(T.GROUNDS[en.scene], en.ground, (v) => { ctx.setEnding({ ground: v }); renderGround(); }, 'wide grid3')));
    }

    return {
      open, close, toggle, refresh,
      current: () => current,
      set onChange(fn) { onChange = fn; }
    };
  }

  global.GeulPanels = { mount, moodGrid, themeSwatches, pieces };
})(typeof window !== 'undefined' ? window : globalThis);
