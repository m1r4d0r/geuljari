/* 끝 장 카드. 문구·배치를 브라우저에서 편집하고 암호화된 글 자료에 함께 보관해요. */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  if (!E) return;

  const W = 1200;
  const H = 630;
  const SIZES = [100, 86, 74];                       // 제목 글자 크기: 두 줄에 들 때까지 차례로 줄인다
  const LEAD = 1.3;                                  // 제목 줄 간격(글자 크기의 배수)
  const META_Y = 552;                                // 로고 · 날짜 줄의 가운데
  const TITLE_MAX = 120;
  const REDRAW_MS = 220;
  const FONT_WAIT = 1500;
  const DEFAULT = { scene: '라이트', ground: '편지지' };
  /* 장면마다 쓸 수 있는 바탕(엔진 값). 편지지·오로라는 두 장면 모두 */
  const SCENE_GROUNDS = {
    day: ['window', 'wongoji', 'leaf', 'dawn', 'letter', 'aurora', 'plain'],
    night: ['projector', 'drape', 'caustic', 'typing', 'letter', 'aurora', 'plain']
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

  /* 글꼴 목록 link가 다 붙을 때까지(없거나 이미 붙었으면 바로) */
  function sheetLoaded(id) {
    const link = document.getElementById(id);
    if (!link) return Promise.resolve();
    if (link.sheetReady) return link.sheetReady;
    if (link.sheet) return Promise.resolve();
    return new Promise((r) => { link.addEventListener('load', r, { once: true }); link.addEventListener('error', r, { once: true }); });
  }

  /* 카드 글꼴: 고른 이름이 있으면 그 글꼴을 불러 쓰고, 없으면 본문 글꼴(--f-title) */
  function cardFont(name) {
    const T = window.GeulTune;
    const f = name && T && T.FONTS && T.FONTS[name];
    if (!f) return '';
    const id = 'geul-card-font';
    let link = document.getElementById(id);
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.append(link);
    }
    const href = `https://fonts.googleapis.com/css2?family=${f.q}&display=swap`;
    if (link.href !== href) {
      link.sheetReady = new Promise((r) => { link.onload = r; link.onerror = r; });
      link.href = href;
    }
    return `${f.css}, ${FAM.mark}`;
  }

  /* 끝 장에 걸린 장면 색과 제목 글꼴 */
  function readLook(sheet, card) {
    const cs = getComputedStyle(sheet);
    const v = (k) => cs.getPropertyValue(k).trim();
    return {
      ink: color(v('--ink'), '#1D2321'),
      soft: color(v('--ink-soft'), '#5D6662'),
      paper: color(v('--paper'), '#ECEFE9'),
      title: cardFont(card && card.font) || v('--f-title') || FAM.mark
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
    /* 본문·카드 글꼴은 글꼴 목록(stylesheet)이 붙은 뒤에야 불러진다 */
    const all = Promise.all(['geul-font', 'geul-card-font'].map(sheetLoaded)).then(() => Promise.all([
      F.load(`400 ${SIZES[0]}px ${L.title}`, text || '가'),
      F.load(`400 22px ${FAM.code}`, date)
    ])).then(() => true, () => true);
    return { ready: Promise.race([all, new Promise((r) => setTimeout(() => r(false), FONT_WAIT))]), late: all };
  }

  /* ---------- 줄 나누기 ---------- */

  /* 엔터로 나눈 줄마다 어절 단위로 max 폭에 맞춰 나눈다. 빈 줄은 빈 줄로 둔다 */
  function wrap(ctx, text, max) {
    return text.split('\n').flatMap((ln) => (ln.trim() ? wrapLine(ctx, ln, max) : ['']));
  }

  /* 한 줄을 어절 단위로 나눈다. 한 어절이 한 줄보다 길면 글자 단위로 끊는다 */
  function wrapLine(ctx, text, max) {
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
    let last = Array.from(lines.slice(n - 1).join(' ').trim());
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

  /* 맨 아래 가운데: 펼친 글자리 로고(겹네모·글·자·리) | 2026.10.10 */
  function drawMeta(ctx, st) {
    const L = st.look;
    const LOGO_H = 34;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `400 20px ${FAM.code}`;
    const dateW = ctx.measureText(st.made.mark).width;
    const logoW = window.GeulLogo ? LOGO_H * window.GeulLogo.ratio : 0;
    const total = logoW + 44 + dateW;
    let x = (W - total) / 2;
    const y = META_Y;
    if (window.GeulLogo) window.GeulLogo.draw(ctx, x, y - LOGO_H / 2, LOGO_H, L.ink);
    x += logoW + 22;
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

  function toBlob(c, type = 'image/png', quality) {
    return new Promise((resolve) => {
      if (!c.toBlob) { resolve(null); return; }
      try { c.toBlob((b) => resolve(b && b.type === type ? b : null), type, quality); } catch (e) { resolve(null); }
    });
  }
  /* 공유 그림은 JPEG: 바탕의 번짐이 PNG보다 훨씬 작게 담겨 미리보기 그림 크기 제한이 작은 곳(구버전 마스토돈 등)에서도 받는다 */
  const OG_TYPE = 'image/jpeg', OG_QUALITY = 0.88;

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
    st.look = readLook(st.sheet, st.card);
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
    st.field.style.fontFamily = cardFont(st.card.font) || '';
    st.field.style.maxHeight = `${Math.max(1, Math.floor(st.Z.h / (st.card.size * LEAD))) * LEAD}em`;
    st.field.style.height = 'auto';
    st.field.style.height = st.field.scrollHeight + 'px';
  }

  function changed(st, syncField = false) {
    st.title = st.card.text === null ? st.editorTitle || st.line : st.card.text;
    if (syncField && st.field) st.field.value = st.title;
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
      st.card.text = ta.value;
      changed(st);
    });
    /* 엔터는 줄 나눔(카드에 드는 줄까지), Esc는 끝내기 */
    ta.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); ta.blur(); return; }
      if (e.key !== 'Enter' || e.isComposing) return;
      const room = Math.max(1, Math.floor(st.Z.h / (st.card.size * LEAD)));
      if (ta.value.split('\n').length >= Math.min(4, room)) e.preventDefault();
    });
    ta.addEventListener('focus', () => st.fig.classList.add('editing'));
    ta.addEventListener('blur', () => { flush().then(() => { if (document.activeElement !== ta) st.fig.classList.remove('editing'); }); });
    let drag = null;
    move.addEventListener('pointerdown', e => {
      e.preventDefault(); move.setPointerCapture(e.pointerId);
      drag = { x:e.clientX, y:e.clientY, cx:st.card.x, cy:st.card.y, scale:st.fig.getBoundingClientRect().width / W };
    });
    /* 끄는 동안 가로·세로 가운데에 SNAP(카드 px) 안으로 들면 가운데에 붙고 가운데 선이 보인다 */
    const SNAP = 16;
    move.addEventListener('pointermove', e => {
      if (!drag) return;
      const span = Math.max(1, W - 120 - st.Z.w);
      let x = Math.max(0, Math.min(100, drag.cx + (e.clientX - drag.x) / drag.scale / span * 100));
      let y = Math.max(0, Math.min(100, drag.cy + (e.clientY - drag.y) / drag.scale / 160 * 100));
      const midY = window.GeulCardSettings.MID_Y;
      const onX = Math.abs(x - 50) * span / 100 < SNAP, onY = Math.abs(y - midY) * 160 / 100 < SNAP;
      if (onX) x = 50;
      if (onY) y = midY;
      st.fig.classList.toggle('snap-x', onX);
      st.fig.classList.toggle('snap-y', onY);
      st.card.x = x; st.card.y = y;
      changed(st);
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(type => move.addEventListener(type, () => {
      drag = null;
      st.fig.classList.remove('snap-x', 'snap-y');
    }));
    move.addEventListener('keydown', e => {
      const delta = { ArrowLeft:['x',-2], ArrowRight:['x',2], ArrowUp:['y',-2], ArrowDown:['y',2] }[e.key];
      if (!delta) return; e.preventDefault(); e.stopPropagation();
      st.card[delta[0]] = Math.max(0, Math.min(100, st.card[delta[0]] + delta[1])); changed(st);
    });
    return zone;
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
    const fresh = el(studio ? 'button' : 'a', 'end-new', studio ? '이대로 발행하기' : '새로 쓰기');
    if (studio) { fresh.type = 'button'; fresh.onclick = () => window.parent.postMessage({ type:'geulgyeol:publish' }, location.origin); }
    else fresh.href = '/';
    /* 카드 폭의 한 줄: 가운데에 다시 보기(면) · 새로 쓰기(채움), 공개 뷰어면 오른쪽 끝에 작은 작성자 수정 */
    const pair = el('span', 'end-pair');
    pair.append(again, fresh);
    acts.append(pair);
    const editHref = !studio && window.GeulReaderOpts && window.GeulReaderOpts.editHref;
    if (editHref) { const a = el('a', 'end-author', '작성자 수정'); a.href = editHref; acts.append(a); }
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
    if (studio) fig.append(makeField(cur));
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
      const L = readLook(cur.sheet, cur.card);
      if (lookKey(L) !== cur.drawnKey) redraw();
      sizeField(cur);
    }, 150);
  });

  /* 늦게 받은 글꼴이 있으면 카드를 다시 그린다(캔버스는 글꼴이 바뀌어도 저절로 다시 그려지지 않는다) */
  if (document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener('loadingdone', () => {
      if (!cur || !cur.sheet.isConnected) return;
      cur.bareKey = '';
      later();
    });
  }

  /* 병렬 미리보기의 다른 틀에서 바꾼 카드도 같은 값으로 그려요. */
  window.addEventListener('message', e => {
    const d = e.data;
    if (e.origin !== location.origin || e.source !== window.parent || !cur || !d || d.type !== 'geulgyeol:ending') return;
    cur.card = window.GeulCardSettings.normalize(d.ending);
    cur.title = cur.card.text === null ? cur.editorTitle || cur.line : cur.card.text;
    if (cur.field && document.activeElement !== cur.field) cur.field.value = cur.title;
    sizeField(cur); later();
  });

  /* 다 그린 카드: { canvas(1200×630), blob(PNG), url, title }. 아직 그리기 전이면 null */
  function card() {
    if (!cur || !cur.canvas) return null;
    return { canvas: cur.canvas, blob: cur.blob, url: cur.url, title: clean(cur.title) };
  }

  /* 발행용 한 장. 현재 미리보기와 무관하게 전달받은 설정만 그려요. */
  async function exportCard(o) {
    const end = pickEnding(o.ending), card = window.GeulCardSettings.normalize(o.ending);
    const sheet = el('section', 'sheet ending');
    sheet.dataset.scene = end.scene; sheet.dataset.ground = end.ground;
    document.body.append(sheet);
    try {
      const st = { sheet, end, card, made:madeOn(o.made), title:card.text === null ? clean(o.title).slice(0, 40) || firstSentence(o.text) : card.text };
      position(st); st.look = readLook(sheet, card);
      const fonts = fontsFor(st.look, st.title, st.made.mark);
      await (fonts.late || fonts.ready);
      const blob = await toBlob(drawCard(st, true), OG_TYPE, OG_QUALITY);
      if (!blob) throw new Error('카드 이미지를 만들지 못했어요. 다시 시도해 주세요.');
      return blob;
    } finally { sheet.remove(); }
  }

  window.GeulEnding = { build, card, exportCard, W, H, OG_TYPE, OG_QUALITY };
})();
