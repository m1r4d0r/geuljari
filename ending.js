/* 끝 장 카드. 문구·배치를 브라우저에서 편집하고 암호화된 글 자료에 함께 보관해요. */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  if (!E) return;

  const W = 1200;
  const H = 630;
  const SIZES = [100, 86, 74];                       // 제목 글자 크기: 두 줄에 들 때까지 차례로 줄인다
  const LEAD = 1.3;                                  // 제목 줄 간격(글자 크기의 배수)
  const META_Y = 552;                                // ■□ 글자리 · 날짜 줄의 가운데
  const TITLE_MAX = 120;
  const REDRAW_MS = 220;
  const FONT_WAIT = 1500;
  const DEFAULT = { scene: '라이트', ground: '편지지' };
  /* 장면마다 쓸 수 있는 바탕(엔진 값). 편지지·오로라는 두 장면 모두 */
  const SCENE_GROUNDS = {
    day: ['window', 'wongoji', 'leaf', 'dawn', 'letter', 'aurora'],
    night: ['projector', 'drape', 'caustic', 'typing', 'letter', 'aurora']
  };
  const FAM = {
    mark: "'Song Myung', 'Noto Serif KR', serif",
    code: "'Nanum Gothic Coding', 'Noto Sans KR', monospace"
  };

  let cur = null;

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- 자료 ---------- */

  /* 끝 장 바탕: {scene, ground}(한글 이름)를 엔진 값으로. 모르는 이름이거나 그 장면에 없는 바탕이면 편지지 */
  function pickEnding(raw) {
    const d = raw && typeof raw === 'object' ? raw : {};
    const scene = E.SCENES[d.scene] || E.SCENES[DEFAULT.scene];
    const ground = E.GROUNDS[d.ground];
    return { scene, ground: ground && SCENE_GROUNDS[scene].includes(ground) ? ground : E.GROUNDS[DEFAULT.ground] };
  }

  /* 만든 날(YYYY-MM-DD, 없으면 오늘)을 카드의 작은 날짜 표시로 바꿔요. */
  function madeOn(s) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s || ''));
    const now = new Date();
    const [y, mo, d] = m ? [+m[1], +m[2], +m[3]] : [now.getFullYear(), now.getMonth() + 1, now.getDate()];
    const two = (n) => String(n).padStart(2, '0');
    return { mark: `${y}.${two(mo)}.${two(d)}` };
  }

  /* 제목이 없을 때 카드에 놓을 글: 표시를 뺀 본문의 첫 줄에서 첫 문장 */
  function firstSentence(text) {
    const line = E.stripMarks(String(text || '')).split('\n').map(clean).find(Boolean) || '';
    const m = /^.*?[.?!…。](?=\s|$)/.exec(line);
    return clean(m ? m[0] : line);
  }

  /* ---------- 색과 글꼴 ---------- */

  const probe = document.createElement('canvas').getContext('2d');

  /* CSS 색을 캔버스가 읽는 꼴로. 읽을 수 없으면 dflt */
  function color(v, dflt) {
    probe.fillStyle = dflt;
    if (v) probe.fillStyle = v;
    return probe.fillStyle;
  }

  function rgba(c, a) {
    if (c[0] === '#') {
      const n = parseInt(c.slice(1, 7), 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
    }
    const m = /rgba?\(([^)]+)\)/.exec(c);
    return `rgba(${m ? m[1].split(',').slice(0, 3).join(',') : '0, 0, 0'}, ${a})`;
  }

  /* 끝 장에 걸린 장면 색과 제목 글꼴(--f-title, ending.css) */
  function readLook(sheet) {
    const cs = getComputedStyle(sheet);
    const v = (k) => cs.getPropertyValue(k).trim();
    return {
      ink: color(v('--ink'), '#1D2321'),
      soft: color(v('--ink-soft'), '#5D6662'),
      paper: color(v('--paper'), '#ECEFE9'),
      title: v('--f-title') || FAM.mark
    };
  }

  const lookKey = (L) => [L.ink, L.soft, L.paper, L.title].join('|');

  /*
   * 그릴 글자가 든 글꼴 조각을 불러 둔다(한글 글꼴은 글자 범위마다 나뉘어 있다).
   * ready는 다 불렀거나 FONT_WAIT가 지나면 풀리고, late는 늦게라도 다 부른 뒤에 풀린다(그때 한 번 더 그린다).
   */
  function fontsFor(L, text, date) {
    const F = document.fonts;
    if (!F || !F.load) return { ready: Promise.resolve(true), late: null };
    const all = Promise.all([
      F.load(`400 ${SIZES[0]}px ${L.title}`, text || '가'),
      F.load(`400 30px ${FAM.mark}`, '글자리'),
      F.load(`400 22px ${FAM.code}`, date)
    ]).then(() => true, () => true);
    return { ready: Promise.race([all, new Promise((r) => setTimeout(() => r(false), FONT_WAIT))]), late: all };
  }

  /* ---------- 줄 나누기 ---------- */

  /* 어절 단위로 max 폭에 맞춰 줄을 나눈다. 한 어절이 한 줄보다 길면 글자 단위로 끊는다 */
  function wrap(ctx, text, max) {
    const out = [];
    let line = '';
    text.split(' ').forEach((w) => {
      const next = line ? line + ' ' + w : w;
      if (ctx.measureText(next).width <= max) { line = next; return; }
      if (line) out.push(line);
      line = '';
      Array.from(w).forEach((ch) => {
        if (line && ctx.measureText(line + ch).width > max) { out.push(line); line = ch; } else line += ch;
      });
    });
    if (line) out.push(line);
    return out;
  }

  /* sizes를 차례로 써 보며 max 폭 n줄 안에 드는 크기를 찾는다. 끝까지 넘치면 가장 작은 크기로 n줄째 끝에 줄임표 */
  function fit(ctx, text, fam, sizes, n, max) {
    for (const size of sizes) {
      ctx.font = `400 ${size}px ${fam}`;
      const lines = wrap(ctx, text, max);
      if (lines.length <= n) return { size, lines };
    }
    const size = sizes[sizes.length - 1];
    ctx.font = `400 ${size}px ${fam}`;
    const lines = wrap(ctx, text, max);
    const keep = lines.slice(0, n);
    let last = Array.from(lines.slice(n - 1).join(' '));
    while (last.length && ctx.measureText(last.join('').trimEnd() + '…').width > max) last.pop();
    keep[n - 1] = last.join('').trimEnd() + '…';
    return { size, lines: keep };
  }

  /* ---------- 카드 그리기 ---------- */

  function canvas() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  }

  /* 같은 바탕의 멈춘 한 장면. 없거나 그릴 수 없으면 종이색에 아주 옅은 빛 */
  function backdrop(st) {
    const L = st.look;
    const key = [st.end.ground, st.end.scene, L.paper, L.ink, st.Z.y, st.Z.h].join('|');
    if (st.bg && st.bg.key === key) return st.bg.canvas;
    const c = canvas();
    const ctx = c.getContext('2d');
    ctx.fillStyle = L.paper;
    ctx.fillRect(0, 0, W, H);
    const B = window.GeulBackdrop;
    let still = null;
    if (B && typeof B.still === 'function') {
      try { still = B.still(st.end.ground, W, H, st.end.scene, { clear: [st.Z.y, st.Z.y + st.Z.h] }); } catch (e) { still = null; }
    }
    if (still) ctx.drawImage(still, 0, 0, W, H);
    else {
      const night = st.end.scene === 'night';
      const glow = ctx.createRadialGradient(W * 0.5, H * 0.38, 0, W * 0.5, H * 0.38, W * 0.62);
      glow.addColorStop(0, night ? rgba(L.ink, 0.07) : 'rgba(255, 255, 255, .34)');
      glow.addColorStop(1, night ? rgba(L.ink, 0) : 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      const dim = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.45, W * 0.5, H * 0.5, W * 0.72);
      dim.addColorStop(0, 'rgba(0, 0, 0, 0)');
      dim.addColorStop(1, night ? 'rgba(0, 0, 0, .32)' : rgba(L.ink, 0.07));
      ctx.fillStyle = dim;
      ctx.fillRect(0, 0, W, H);
    }
    st.bg = { key, canvas: c };
    return c;
  }

  /* 제목 뒤에 종이색을 옅게 깔아 어떤 바탕 위에서도 읽히게 한다 */
  function veil(ctx, L, Z) {
    const cy = Z.y + Z.h / 2;
    ctx.save();
    ctx.translate(W / 2, cy);
    ctx.scale(1, 0.46);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.5);
    g.addColorStop(0, rgba(L.paper, 0.5));
    g.addColorStop(0.6, rgba(L.paper, 0.22));
    g.addColorStop(1, rgba(L.paper, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-W / 2, -H, W, H * 2);
    ctx.restore();
  }

  function titleLayout(st) {
    const size = st.card.size;
    return fit(probe, st.title, st.look.title, [size], Math.max(1, Math.floor(st.Z.h / (size * LEAD))), st.Z.w);
  }

  function drawTitle(ctx, st) {
    const f = titleLayout(st), Z = st.Z;
    ctx.font = `400 ${f.size}px ${st.look.title}`;
    ctx.fillStyle = st.look.ink;
    ctx.textAlign = st.card.align;
    ctx.textBaseline = 'middle';
    const x = st.card.align === 'left' ? Z.x : st.card.align === 'right' ? Z.x + Z.w : Z.x + Z.w / 2;
    const lh = f.size * LEAD, top = Z.y + (Z.h - lh * f.lines.length) / 2;
    f.lines.forEach((ln, i) => ctx.fillText(ln, x, top + lh * (i + .5)));
  }

  /* 맨 아래 가운데: ■□ 글자리 | 2026.10.10 */
  function drawMeta(ctx, st) {
    const L = st.look;
    const sq = 12;
    const gap = 4;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `400 27px ${FAM.mark}`;
    const nameW = ctx.measureText('글자리').width;
    ctx.font = `400 20px ${FAM.code}`;
    const dateW = ctx.measureText(st.made.mark).width;
    const markW = sq * 2 + gap + 10 + nameW;
    const total = markW + 44 + dateW;
    let x = (W - total) / 2;
    const y = META_Y;
    ctx.fillStyle = L.ink;
    ctx.fillRect(x, y - sq / 2, sq, sq);
    ctx.strokeStyle = L.ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + sq + gap + 0.75, y - sq / 2 + 0.75, sq - 1.5, sq - 1.5);
    x += sq * 2 + gap + 10;
    ctx.font = `400 27px ${FAM.mark}`;
    ctx.fillText('글자리', x, y + 1);
    x += nameW + 22;
    ctx.fillStyle = rgba(L.soft, 0.6);
    ctx.fillRect(x - 0.5, y - 9, 1, 18);
    x += 22;
    ctx.fillStyle = L.soft;
    ctx.font = `400 20px ${FAM.code}`;
    ctx.fillText(st.made.mark, x, y + 1);
  }

  function drawCard(st, withTitle) {
    const c = canvas();
    const ctx = c.getContext('2d');
    ctx.drawImage(backdrop(st), 0, 0);
    veil(ctx, st.look, st.Z);
    if (withTitle) drawTitle(ctx, st);
    drawMeta(ctx, st);
    return c;
  }

  function toBlob(c) {
    return new Promise((resolve) => {
      if (!c.toBlob) { resolve(null); return; }
      try { c.toBlob((b) => resolve(b), 'image/png'); } catch (e) { resolve(null); }
    });
  }

  /* 캔버스를 img에 건다. 앞에 쓰던 주소는 새 그림이 뜬 뒤 거둔다 */
  async function show(img, c, st, slot) {
    const blob = await toBlob(c);
    const url = blob ? URL.createObjectURL(blob) : c.toDataURL('image/png');
    const old = st[slot];
    st[slot] = url;
    if (slot === 'url') st.blob = blob;
    await new Promise((r) => {
      img.onload = r;
      img.onerror = r;
      img.src = url;
    });
    if (old && old.startsWith('blob:')) URL.revokeObjectURL(old);
  }

  /* 카드를 다시 그린다. 늦게 끝난 앞 그리기는 버린다 */
  async function redraw() {
    const st = cur;
    if (!st) return;
    const seq = ++st.seq;
    st.dirty = false;
    st.look = readLook(st.sheet);
    const title = clean(st.title);
    const fonts = fontsFor(st.look, title || st.line || '가', st.made.mark);
    if (!(await fonts.ready)) fonts.late.then(() => { if (seq === st.seq) { st.bareKey = ''; redraw(); } });
    if (seq !== st.seq) return;
    sizeField(st);
    const key = lookKey(st.look) + JSON.stringify(st.Z);
    if (st.bare && st.bareKey !== key) {
      st.bareKey = key;
      await show(st.bare, drawCard(st, false), st, 'bareUrl');
      if (seq !== st.seq) return;
    }
    const c = drawCard(st, true);
    st.canvas = c;
    st.drawnKey = lookKey(st.look);
    st.full.alt = `${title || st.line} · 글자리`;
    await show(st.full, c, st, 'url');
    if (seq === st.seq) st.fig.classList.add('is-drawn');
  }

  function later() {
    clearTimeout(cur.timer);
    cur.dirty = true;
    cur.timer = setTimeout(redraw, REDRAW_MS);
  }

  function flush() {
    clearTimeout(cur.timer);
    return cur.dirty ? redraw() : Promise.resolve();
  }

  /* ---------- 문서 제목 ---------- */

  function setMeta(t) {
    const title = clean(t);
    document.title = title || '글자리';
    let m = document.querySelector('meta[property="og:title"]');
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute('property', 'og:title');
      document.head.append(m);
    }
    m.setAttribute('content', title || '글자리');
  }

  /* ---------- 제목 고치기(편집실 미리보기 안) ---------- */

  /* 카드 좌표를 편집 칸의 화면 비율로 옮겨요. */
  function position(st) {
    const width = W * st.card.width / 100;
    st.Z = { x:60 + (W - 120 - width) * st.card.x / 100, y:40 + 160 * st.card.y / 100, w:width, h:312 };
    if (!st.zone) return;
    Object.assign(st.zone.style, { left:st.Z.x / W * 100 + '%', top:st.Z.y / H * 100 + '%', width:st.Z.w / W * 100 + '%', height:st.Z.h / H * 100 + '%' });
  }

  function sizeField(st) {
    position(st);
    if (!st.field) return;
    st.zone.style.setProperty('--ts', String(st.card.size / W));
    st.field.style.textAlign = st.card.align;
    st.field.style.maxHeight = `${Math.max(1, Math.floor(st.Z.h / (st.card.size * LEAD))) * LEAD}em`;
    st.field.style.height = 'auto';
    st.field.style.height = st.field.scrollHeight + 'px';
  }

  function changed(st, syncField = false) {
    st.title = st.card.text === null ? st.editorTitle || st.line : st.card.text;
    if (syncField && st.field) st.field.value = st.title;
    if (st.follow) st.follow.checked = st.card.text === null;
    sizeField(st);
    window.parent.postMessage({ type:'geulgyeol:ending', ending:st.card }, location.origin);
    later();
  }

  function makeField(st) {
    const zone = el('div', 'end-edit');
    const ta = el('textarea', 'end-title');
    ta.rows = 1; ta.maxLength = TITLE_MAX; ta.spellcheck = false;
    ta.placeholder = '카드에 남길 문장';
    ta.setAttribute('aria-label', '카드 문구');
    ta.value = st.title;
    const move = el('button', 'end-move', '위치 이동'); move.type = 'button';
    move.setAttribute('aria-label', '카드 문구 위치 이동. 끌거나 방향키를 사용하세요.');
    zone.append(ta, move); st.zone = zone; st.field = ta;
    ta.addEventListener('input', () => {
      st.card.text = ta.value.replace(/[\r\n]+/g, ' ');
      changed(st);
    });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); ta.blur(); } });
    ta.addEventListener('focus', () => st.fig.classList.add('editing'));
    ta.addEventListener('blur', () => { flush().then(() => { if (document.activeElement !== ta) st.fig.classList.remove('editing'); }); });
    let drag = null;
    move.addEventListener('pointerdown', e => {
      e.preventDefault(); move.setPointerCapture(e.pointerId);
      drag = { x:e.clientX, y:e.clientY, cx:st.card.x, cy:st.card.y, scale:st.fig.getBoundingClientRect().width / W };
    });
    move.addEventListener('pointermove', e => {
      if (!drag) return;
      st.card.x = Math.max(0, Math.min(100, drag.cx + (e.clientX - drag.x) / drag.scale / Math.max(1, W - 120 - st.Z.w) * 100));
      st.card.y = Math.max(0, Math.min(100, drag.cy + (e.clientY - drag.y) / drag.scale / 160 * 100));
      changed(st); syncControls(st);
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(type => move.addEventListener(type, () => { drag = null; }));
    move.addEventListener('keydown', e => {
      const delta = { ArrowLeft:['x',-2], ArrowRight:['x',2], ArrowUp:['y',-2], ArrowDown:['y',2] }[e.key];
      if (!delta) return; e.preventDefault(); e.stopPropagation();
      st.card[delta[0]] = Math.max(0, Math.min(100, st.card[delta[0]] + delta[1])); changed(st); syncControls(st);
    });
    return zone;
  }

  function syncControls(st) {
    if (!st.controls) return;
    st.controls.querySelectorAll('[data-card]').forEach(n => {
      const v = st.card[n.dataset.card]; n.value = v;
      const output = n.parentElement.querySelector('output'); if (output) output.value = Math.round(v) + (n.dataset.card === 'size' ? 'px' : '%');
    });
  }

  function makeControls(st) {
    const controls = el('div', 'end-controls'); st.controls = controls;
    const followLabel = el('label', 'end-follow');
    const follow = el('input'); follow.type = 'checkbox'; follow.checked = st.card.text === null; st.follow = follow;
    followLabel.append(follow, document.createTextNode('편집 제목을 카드 문구로'));
    follow.onchange = () => { st.card.text = follow.checked ? null : st.title; changed(st, true); };
    controls.append(followLabel);
    const group = el('div', 'end-layout');
    for (const [key, label, min, max] of [['size','글자 크기',28,120],['width','문구 폭',30,90],['x','가로 위치',0,100],['y','세로 위치',0,100]]) {
      const row = el('label', 'end-range'); row.append(el('span','',label));
      const input = el('input'); input.type = 'range'; input.min = min; input.max = max; input.step = 1; input.dataset.card = key;
      input.setAttribute('aria-label', '카드 ' + label);
      input.oninput = () => { st.card[key] = Number(input.value); changed(st); syncControls(st); };
      row.append(input, el('output')); group.append(row);
    }
    const alignRow = el('label','end-align','정렬');
    const align = el('select'); align.dataset.card = 'align'; align.setAttribute('aria-label','카드 정렬');
    for (const [value, label] of [['left','왼쪽'],['center','가운데'],['right','오른쪽']]) { const opt = el('option','',label); opt.value = value; align.append(opt); }
    align.onchange = () => { st.card.align = align.value; changed(st); };
    alignRow.append(align); group.append(alignRow);
    controls.append(group, el('p','end-hint','카드의 문장을 눌러 고쳐요. ‘위치 이동’을 끌거나 방향키로 옮겨요. 긴 문구는 카드 안에서 줄여 보여요.'));
    syncControls(st);
    return controls;
  }

  /* ---------- 장 ---------- */

  /*
   * opts: text(본문), title, made(YYYY-MM-DD), ending({scene, ground} 한글 이름), onReplay(다시 보기)
   * 돌려주는 것: sheet(.sheet.ending), scroll, scene·ground(엔진 값)
   */
  function build(opts) {
    const o = opts || {};
    const end = pickEnding(o.ending);
    const studio = document.documentElement.classList.contains('in-studio');

    const sheet = el('section', 'sheet ending');
    sheet.dataset.scene = end.scene;
    sheet.dataset.ground = end.ground;
    const scroll = el('div', 'scroll');
    const box = el('div', 'end');
    const fig = el('figure', 'end-card');
    const full = el('img', 'end-full');
    full.draggable = false;
    const bare = studio ? el('img', 'end-bare') : null;
    if (bare) {
      bare.alt = '';
      bare.draggable = false;
      fig.append(bare);
    }
    fig.append(full);

    const made = madeOn(o.made);

    const acts = el('p', 'end-acts');
    const again = el('button', 'end-again', '다시 보기');
    again.type = 'button';
    again.addEventListener('click', () => { if (o.onReplay) o.onReplay(); });
    const fresh = el(studio ? 'button' : 'a', 'end-new', studio ? '이대로 발행하기' : '새로 만들기');
    if (studio) { fresh.type = 'button'; fresh.onclick = () => window.parent.postMessage({ type:'geulgyeol:publish' }, location.origin); }
    else fresh.href = '/';
    acts.append(again, fresh);
    box.append(fig);
    scroll.append(box);
    sheet.append(scroll);

    if (cur) {
      clearTimeout(cur.timer);
      cur.seq++;
    }
    cur = {
      sheet, fig, full, bare, end, made, studio, Z:null,
      editorTitle:clean(o.title).slice(0, 40), title:'', line:firstSentence(o.text), card:window.GeulCardSettings.normalize(o.ending),
      look: null, bg: null, canvas: null, blob: null, url: '', bareUrl: '', bareKey: '', drawnKey: '',
      seq: 0, timer: 0, dirty: false, field: null, zone: null
    };
    cur.title = cur.card.text === null ? cur.editorTitle || cur.line : cur.card.text;
    position(cur);
    if (studio) { fig.append(makeField(cur)); box.append(makeControls(cur)); }
    box.append(acts);
    setMeta(cur.editorTitle);

    /* 무대에 붙은 뒤(장면 색이 걸린 뒤) 그린다 */
    const st = cur;
    Promise.resolve().then(() => {
      if (st !== cur) return;
      sizeField(st);
      redraw();
    });
    return { sheet, scroll, scene: end.scene, ground: end.ground };
  }

  /* 화면 크기·주색·글꼴이 바뀌면(편집실의 geulgyeol:style도 resize로 온다) 고치는 칸을 다시 재고, 색·글꼴이 바뀌었으면 카드를 다시 그린다 */
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!cur || !cur.sheet.isConnected) return;
      const L = readLook(cur.sheet);
      if (lookKey(L) !== cur.drawnKey) redraw();
      sizeField(cur);
    }, 150);
  });

  /* 병렬 미리보기의 다른 틀에서 바꾼 카드도 같은 값으로 그려요. */
  window.addEventListener('message', e => {
    const d = e.data;
    if (e.origin !== location.origin || e.source !== window.parent || !cur || !d || d.type !== 'geulgyeol:ending') return;
    cur.card = window.GeulCardSettings.normalize(d.ending);
    cur.title = cur.card.text === null ? cur.editorTitle || cur.line : cur.card.text;
    if (cur.field && document.activeElement !== cur.field) cur.field.value = cur.title;
    if (cur.follow) cur.follow.checked = cur.card.text === null;
    syncControls(cur); sizeField(cur); later();
  });

  /* 다 그린 카드: { canvas(1200×630), blob(PNG), url, title }. 아직 그리기 전이면 null */
  function card() {
    if (!cur || !cur.canvas) return null;
    return { canvas: cur.canvas, blob: cur.blob, url: cur.url, title: clean(cur.title) };
  }

  window.GeulEnding = { build, card, W, H };
})();
