/*
 * 글결 미리보기 읽기 틀 준비
 * 루트의 reader.js가 글을 세우기 전에 돈다(defer 차례). 편집실이 남긴 조판값(속도·쉼·흐름·글꼴·넘김)을 엔진과 읽기 틀에 걸고,
 * 넘어온 글이 없을 때 쓸 예시 글을 채운다. ?embed로 열리면 작은 미리보기 모양으로 줄인다.
 * 모양 조판값(글꼴·글자 크기·글 상자 폭·정렬·주색)은 CSS 변수로 걸어서, 편집실이 geulgyeol:style로 보내면 다시 쓰지 않고 바로 바꾼다.
 * 편집실 안(iframe)에서는 손짓 몇 가지를 편집실로 넘긴다.
 * - 글 상자 끌기: 넓은 화면에서 글 상자를 옆으로 끌면 왼쪽·가운데·오른쪽 중 가까운 자리에 붙고, 편집실에 그 쪽의 자리를 알린다.
 * - 확대: 손가락 벌리기와 Ctrl+휠(트랙패드 벌리기)은 편집실이 미리보기 틀을 키우고 줄이게 한다.
 *   확대된 동안에는 끌기·휠이 쪽을 넘기지 않고 틀을 옮긴다.
 * - 빈 바탕·글 상자를 한 번 누르면 편집실에 알려 그 갈래를 열게 하고, 글 상자를 두 번 누르면 그 자리에서 고친다(inplace.js).
 * - 편집실 하단바가 겹치는 높이(geulgyeol:inset)만큼 눈금을 올린다.
 * - Esc는 편집실에 판을 접어 달라고 알린다.
 */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  const T = window.GeulTune;
  if (!E || !T) return;

  function read(k) {
    try { return JSON.parse(sessionStorage.getItem(k) || localStorage.getItem(k) || 'null'); } catch (e) { return null; }
  }

  const s = T.normalize(read('geulgyeol.tune'));
  T.apply(E, s, window.GeulFx);
  T.patchFlow(E, s);
  look(s);

  /* 모양 조판값: 글꼴, 글자 크기(배율), 글 상자 폭(em, 0은 저절로), 정렬, 주색(라이트 장면 글자색) */
  function look(v) {
    const root = document.documentElement.style;
    T.useFont(document, v);
    root.setProperty('--fs-k', String(v.size));
    if (v.measure) root.setProperty('--m-user', v.measure + 'em'); else root.removeProperty('--m-user');
    if (T.ALIGNS[v.align]) root.setProperty('--a-user', T.ALIGNS[v.align]); else root.removeProperty('--a-user');
    const tv = T.themeVars(v.theme);
    root.setProperty('--theme-ink', tv['--ink']);
    root.setProperty('--theme-lead', tv['--lead']);
    root.setProperty('--theme-wet', tv['--wet-ink']);
    root.setProperty('--theme-night-paper', tv['--night-paper']);
    root.setProperty('--theme-night-ink', tv['--night-ink']);
    root.setProperty('--theme-night-soft', tv['--night-soft']);
    root.setProperty('--theme-night-wet', tv['--night-wet']);
  }
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'geulgyeol:style') return;
    const v = T.normalize(e.data.settings);
    look(v);
    /* 전환 속도는 다음 넘김부터 */
    if (window.GeulReaderOpts) window.GeulReaderOpts.turnPace = T.turnPace(v);
    if (window.GeulFx) window.GeulFx.recolor();
    window.dispatchEvent(new Event('resize'));
  });
  window.GeulReaderOpts = { turn: T.TURNS[s.turn], turnPace: T.turnPace(s) };
  document.documentElement.style.setProperty('--dry', T.dryTime(s) + 's');
  if (/[?&]embed\b/.test(location.search)) document.documentElement.classList.add('embed');

  const holder = document.getElementById('glog-text');
  if (holder && !holder.textContent.trim() && window.GeulgyeolSample) holder.textContent = window.GeulgyeolSample.text;

  const embedded = window.parent !== window;
  const tell = (msg) => { if (embedded) window.parent.postMessage(msg, location.origin); };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) tell({ type: 'geulgyeol:close' });
  });
  if (!embedded) return;
  document.documentElement.classList.add('in-studio');

  const stage = document.getElementById('stage');
  const PLACES = [['왼쪽', 0.2], ['가운데', 0.5], ['오른쪽', 0.8]];
  let zoomed = false;
  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data && e.data.type === 'geulgyeol:zoomed') zoomed = !!e.data.on;
  });

  /* 읽기 틀이 잡은 끌기를 놓게 한다(같은 포인터의 취소를 보낸다) */
  function cancelReader(id) {
    try { stage.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, bubbles: true })); } catch (err) { /* 오래된 브라우저 */ }
  }

  /* ---------- 확대: Ctrl+휠, 확대된 동안의 휠 ---------- */

  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      tell({ type: 'geulgyeol:zoom', dy: e.deltaY * (e.deltaMode === 1 ? 33 : 1), x: e.clientX, y: e.clientY });
    } else if (zoomed) {
      e.preventDefault();
      e.stopPropagation();
      tell({ type: 'geulgyeol:scroll', dx: -e.deltaX, dy: -e.deltaY });
    }
  }, { capture: true, passive: false });

  /* ---------- 손가락·포인터 ---------- */
  /* 자리는 이 문서 좌표로 보내고, 편집실이 지금 틀의 크기·자리로 화면 좌표로 바꾼다 */

  const touches = new Map();
  let pinch = false;
  let pan = null;
  let move = null;
  const pts = () => [...touches.values()].slice(0, 2);

  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a, input, .end-title')) return;
    if (e.pointerType === 'touch') touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2) {
      move = null;
      pan = null;
      touches.forEach((v, id) => cancelReader(id));
      pinch = true;
      tell({ type: 'geulgyeol:pinch', phase: 'start', pts: pts() });
      e.stopPropagation();
      return;
    }
    if (zoomed) {
      pan = { id: e.pointerId };
      tell({ type: 'geulgyeol:pan', phase: 'start', x: e.clientX, y: e.clientY });
      e.stopPropagation();
      return;
    }
    const col = e.target.closest('.sheet.is-current .column');
    if (col && e.button === 0 && window.innerWidth >= 600) move = { id: e.pointerId, col, x: e.clientX, y: e.clientY, on: false };
  }, true);

  document.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && touches.size === 2) {
      e.stopPropagation();
      tell({ type: 'geulgyeol:pinch', phase: 'move', pts: pts() });
      return;
    }
    if (pan && e.pointerId === pan.id) {
      e.stopPropagation();
      tell({ type: 'geulgyeol:pan', phase: 'move', x: e.clientX, y: e.clientY });
      return;
    }
    if (!move || e.pointerId !== move.id) return;
    const dx = e.clientX - move.x;
    if (!move.on) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - move.y)) return;
      if (!startMove(e)) { move = null; return; }
    }
    e.stopPropagation();
    dragMove(dx);
  }, true);

  function end(e) {
    touches.delete(e.pointerId);
    if (pinch) {
      e.stopPropagation();
      if (touches.size < 2) { pinch = false; tell({ type: 'geulgyeol:pinch', phase: 'end' }); }
      return;
    }
    if (pan && e.pointerId === pan.id) { pan = null; e.stopPropagation(); return; }
    if (move && e.pointerId === move.id) {
      if (move.on) { e.stopPropagation(); dropMove(e.clientX - move.x); movedAt = performance.now(); }
      move = null;
    }
  }
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', (e) => { if (e.isTrusted) end(e); }, true);

  /* ---------- 누르기: 한 번은 다듬을 갈래, 두 번은 고치기 ---------- */
  /*
   * 빈 바탕을 한 번 누르면 편집실이 '바탕' 갈래를, 글 상자를 누르면 '글씨' 갈래를 연다(geulgyeol:tap).
   * 글 상자를 두 번 누르면(더블클릭·두 번 톡) 그 자리에서 고친다(inplace.js). 끌거나 오래 누른 뒤의 누름은 빼고.
   */
  let movedAt = 0;
  let down = null;
  let lastTap = null;
  const DOUBLE = 360;
  document.addEventListener('pointerdown', (e) => { down = { t: performance.now(), x: e.clientX, y: e.clientY }; }, true);
  document.addEventListener('click', (e) => {
    const now = performance.now();
    const d = down;
    down = null;
    if (!d || zoomed || now - movedAt < 400 || now - d.t > 450 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
    if (e.target.closest('button, a, input, textarea, .ip, .end-card, .end-acts, .ops')) return;
    if (window.GeulInplace && window.GeulInplace.editing()) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const col = e.target.closest('.sheet.is-current .column');
    const twice = lastTap && col && lastTap.col === col && now - lastTap.t < DOUBLE;
    lastTap = col ? { col, t: now } : null;
    if (twice && window.GeulInplace) {
      lastTap = null;
      window.GeulInplace.open(col, Number(col.closest('.sheet').dataset.i));
      return;
    }
    tell({ type: 'geulgyeol:tap', on: col ? 'box' : 'ground' });
  });

  /* 쪽마다 글자 크기·글 상자 폭: 편집실이 바꾸면 그 장에 바로 건다(다시 쓰지 않음) */
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'geulgyeol:sheet') return;
    const sheet = document.querySelector(`.sheet[data-i="${Number(e.data.page)}"]`);
    if (!sheet) return;
    if (e.data.size) sheet.style.setProperty('--page-k', String(e.data.size)); else sheet.style.removeProperty('--page-k');
    if (e.data.measure) sheet.style.setProperty('--page-m', e.data.measure + 'em'); else sheet.style.removeProperty('--page-m');
    const col = sheet.querySelector('.column');
    const A = { '왼쪽': 'left', '가운데': 'center', '오른쪽': 'right', '양쪽': 'justify' };
    if (col && 'align' in e.data) {
      if (e.data.align) col.style.setProperty('--a-user', A[e.data.align] || 'var(--align)'); else col.style.removeProperty('--a-user');
    }
    window.dispatchEvent(new Event('resize'));
  });

  /* 편집실 하단바가 미리보기 위에 겹치는 높이만큼 눈금·기다림 표시를 올린다 */
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'geulgyeol:inset') return;
    document.documentElement.style.setProperty('--studio-bottom', (Number(e.data.bottom) || 0) + 'px');
  });

  /* ---------- 글 상자 끌기 ---------- */

  function box(col) {
    const sc = col.parentElement;
    const cs = getComputedStyle(sc);
    const r = sc.getBoundingClientRect();
    const left = r.left + parseFloat(cs.paddingLeft);
    const w = sc.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const cw = col.offsetWidth;
    return { left, room: w - cw, cw };
  }

  function startMove(e) {
    const b = box(move.col);
    if (b.room < 40) return false;
    move.on = true;
    move.b = b;
    move.x0 = parseFloat(move.col.style.getPropertyValue('--x')) || 0;
    cancelReader(e.pointerId);
    move.col.classList.add('is-moving');
    const r = move.col.getBoundingClientRect();
    move.guides = PLACES.map(([name, x]) => {
      const g = document.createElement('i');
      g.className = 'place-guide';
      g.style.left = b.left + b.room * x + b.cw / 2 + 'px';
      g.style.top = r.top + 'px';
      g.style.height = r.height + 'px';
      g.dataset.place = name;
      document.body.append(g);
      return g;
    });
    return true;
  }

  function nearest(dx) {
    const x = Math.min(1, Math.max(0, move.x0 + dx / move.b.room));
    return PLACES.reduce((best, p) => (Math.abs(p[1] - x) < Math.abs(best[1] - x) ? p : best));
  }

  function dragMove(dx) {
    move.col.style.transform = `translateX(${dx}px)`;
    const [name] = nearest(dx);
    move.guides.forEach((g) => g.classList.toggle('on', g.dataset.place === name));
  }

  function dropMove(dx) {
    const { col, b, x0, guides } = move;
    const [name, x] = nearest(dx);
    guides.forEach((g) => g.remove());
    col.classList.remove('is-moving');
    col.style.setProperty('--x', String(x));
    const from = dx - (x - x0) * b.room;
    col.style.transition = 'none';
    col.style.transform = `translateX(${from}px)`;
    void col.offsetWidth;
    col.style.transition = 'transform .28s cubic-bezier(.2, .8, .2, 1)';
    col.style.transform = '';
    const sheet = col.closest('.sheet');
    tell({ type: 'geulgyeol:place', page: Number(sheet.dataset.i), place: name });
  }
})();
