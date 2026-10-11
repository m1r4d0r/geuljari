/*
 * 글자리 끝 장
 * 마지막 쪽 뒤에 붙는 장 하나(.sheet.ending). 바탕은 편집실에서 고른 끝 장 바탕(라이트·다크 바탕 중 하나, 기본 라이트 편지지)이다.
 * 가운데에는 링크 카드(1200×630)를 캔버스에 그려 그림으로 보여 준다.
 *   카드 바탕은 같은 바탕의 멈춘 한 장면(GeulBackdrop.still), 그릴 수 없으면 장면의 종이색.
 *   제목을 가장 크게(두 줄까지, 넘치면 글자를 줄이다가 줄임표), 제목이 없으면 글의 첫 문장을 작게 놓는다. 아래에 ■□ 글자리와 만든 날.
 * 카드 밑에는 만든 날 한 줄과 글자 단추 둘: '다시 보기'(첫 쪽부터 다시 씀), '새로 만들기'(편집실로. 글을 본 사람을 다시 데려오는 단추라 더 진하게).
 * 편집실 미리보기(html.in-studio) 안에서는 카드의 제목 자리를 눌러 그 자리에서 제목을 고친다.
 *   고칠 때마다 편집실에 geulgyeol:title로 알리고 카드는 잠깐 모았다가 다시 그린다. 편집실이 보내는 geulgyeol:title(병렬의 다른 틀에서 고친 제목)도 받는다.
 *   제목이 비어 있으면 고치지 않는 동안에는 읽는 사람이 받을 카드(첫 문장) 그대로 두고, 고칠 때만 자리 글을 보인다.
 *   '새로 만들기'는 모양만 보이고 어디로도 가지 않는다(편집실은 이미 열려 있고 쓰던 글은 한 벌이라).
 * 제목은 문서 제목(document.title)과 og:title에도 건다. 다 그린 카드는 GeulEnding.card()로 꺼낸다(발행 때 씀).
 * 읽기 틀(reader.js)이 GeulEnding.build로 장을 받아 무대 끝에 붙인다. 전역 GeulEnding.
 */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  if (!E) return;

  const W = 1200;
  const H = 630;
  /* 제목 자리(카드 좌표). 편지지는 가운데 종이 위에 머물도록 좁게, 이 자리에는 편지지 줄을 긋지 않는다 */
  const ZONES = { wide: { x: 140, y: 92, w: 920, h: 356 }, letter: { x: 270, y: 92, w: 660, h: 356 } };
  const SIZES = [100, 86, 74];                       // 제목 글자 크기: 두 줄에 들 때까지 차례로 줄인다
  const LEAD = 1.3;                                  // 제목 줄 간격(글자 크기의 배수)
  const LINE_SIZE = 52;                              // 제목이 없을 때 첫 문장 글자 크기
  const META_Y = 552;                                // ■□ 글자리 · 날짜 줄의 가운데
  const TITLE_MAX = 40;
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

  /* 만든 날(YYYY-MM-DD, 없으면 오늘) → 안내 한 줄과 카드에 넣을 짧은 꼴 */
  function madeOn(s) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s || ''));
    const now = new Date();
    const [y, mo, d] = m ? [+m[1], +m[2], +m[3]] : [now.getFullYear(), now.getMonth() + 1, now.getDate()];
    const two = (n) => String(n).padStart(2, '0');
    return { line: `${y}년 ${mo}월 ${d}일에 만들었어요.`, mark: `${y}.${two(mo)}.${two(d)}` };
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
    const key = [st.end.ground, st.end.scene, L.paper, L.ink].join('|');
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

  function drawTitle(ctx, st) {
    const L = st.look;
    const title = clean(st.title);
    const Z = st.Z;
    const f = title ? fit(ctx, title, L.title, SIZES, 2, Z.w) : fit(ctx, st.line, L.title, [LINE_SIZE], 2, Z.w);
    ctx.font = `400 ${f.size}px ${L.title}`;
    ctx.fillStyle = L.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lh = f.size * (title ? LEAD : 1.6);
    const top = Z.y + (Z.h - lh * f.lines.length) / 2;
    f.lines.forEach((ln, i) => ctx.fillText(ln, W / 2, top + lh * (i + 0.5)));
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
    const key = lookKey(st.look);
    if (st.bare && st.bareKey !== key) {
      st.bareKey = key;
      await show(st.bare, drawCard(st, false), st, 'bareUrl');
      if (seq !== st.seq) return;
    }
    const c = drawCard(st, true);
    st.canvas = c;
    st.drawnKey = key;
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

  /*
   * 고치는 칸의 글자 크기를 카드에 그릴 크기에 맞추고(카드 폭에 대한 비율 --ts), 높이를 글 줄 수에 맞춘다.
   * 칸은 카드처럼 두 줄까지만 보이고(ending.css의 max-height), 더 길면 칸 안에서 굴러간다.
   */
  function sizeField(st) {
    const ta = st.field;
    if (!ta) return;
    const L = st.look || readLook(st.sheet);
    const title = clean(ta.value);
    const f = title ? fit(probe, title, L.title, SIZES, 2, st.Z.w) : fit(probe, ta.placeholder, L.title, SIZES.slice(1), 1, st.Z.w);
    st.zone.style.setProperty('--ts', String(f.size / W));
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  function makeField(st) {
    const zone = el('div', 'end-edit');
    const Z = st.Z;
    zone.style.left = (Z.x / W) * 100 + '%';
    zone.style.top = (Z.y / H) * 100 + '%';
    zone.style.width = (Z.w / W) * 100 + '%';
    zone.style.height = (Z.h / H) * 100 + '%';
    const ta = el('textarea', 'end-title');
    ta.rows = 1;
    ta.maxLength = TITLE_MAX;
    ta.spellcheck = false;
    ta.placeholder = '제목을 적어 주세요.';
    ta.setAttribute('aria-label', '제목');
    ta.value = clean(st.title).slice(0, TITLE_MAX);
    zone.append(ta);
    st.zone = zone;
    st.field = ta;

    ta.addEventListener('input', () => {
      const v = ta.value.replace(/[\r\n]+/g, ' ');
      if (v !== ta.value) ta.value = v;
      st.title = v;
      sizeField(st);
      setMeta(v);
      if (window.parent !== window) window.parent.postMessage({ type: 'geulgyeol:title', title: clean(v) }, location.origin);
      later();
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); ta.blur(); }
    });
    ta.addEventListener('focus', () => st.fig.classList.add('editing'));
    /* 새 카드가 다 그려진 뒤에 고치는 칸을 걷는다(앞 제목이 잠깐 비치지 않게) */
    ta.addEventListener('blur', () => {
      flush().then(() => { if (document.activeElement !== ta) st.fig.classList.remove('editing'); });
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
    const madeLine = el('p', 'end-made', made.line);
    const acts = el('p', 'end-acts');
    const again = el('button', 'end-again', '다시 보기');
    again.type = 'button';
    again.addEventListener('click', () => { if (o.onReplay) o.onReplay(); });
    const fresh = el('a', 'end-new', '새로 만들기');
    if (!studio) fresh.href = '/';
    acts.append(again, fresh);
    box.append(fig, madeLine, acts);
    scroll.append(box);
    sheet.append(scroll);

    if (cur) {
      clearTimeout(cur.timer);
      cur.seq++;
    }
    cur = {
      sheet, fig, full, bare, end, made, studio, Z: end.ground === 'letter' ? ZONES.letter : ZONES.wide,
      title: clean(o.title).slice(0, TITLE_MAX), line: firstSentence(o.text),
      look: null, bg: null, canvas: null, blob: null, url: '', bareUrl: '', bareKey: '', drawnKey: '',
      seq: 0, timer: 0, dirty: false, field: null, zone: null
    };
    if (studio) fig.append(makeField(cur));
    setMeta(cur.title);

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

  /* 편집실이 건넨 제목(병렬의 다른 틀에서 고친 것)을 건다. 이 틀에서 고치는 중이면 그대로 둔다 */
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.origin !== location.origin || e.source !== window.parent || !d || d.type !== 'geulgyeol:title') return;
    if (!cur || typeof d.title !== 'string') return;
    if (cur.field && document.activeElement === cur.field) return;
    cur.title = clean(d.title).slice(0, TITLE_MAX);
    if (cur.field) cur.field.value = cur.title;
    setMeta(cur.title);
    sizeField(cur);
    later();
  });

  /* 다 그린 카드: { canvas(1200×630), blob(PNG), url, title }. 아직 그리기 전이면 null */
  function card() {
    if (!cur || !cur.canvas) return null;
    return { canvas: cur.canvas, blob: cur.blob, url: cur.url, title: clean(cur.title) };
  }

  window.GeulEnding = { build, card, W, H };
})();
