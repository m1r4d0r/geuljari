/*
 * 글결 합본 편집실
 * 한 화면, 하나의 본문. 모드만 바뀐다.
 * - 쓰기: 본문과 결 보기(글자는 네모, 쪽·쉼·문단·강조는 표시). 규칙 네 가지는 쓰인 만큼 불이 켜진다.
 * - 묻기: 글 위에 문항을 하나씩 띄운다. 1 결(심상 낱말, 견본 한 줄이 바로 움직임) → 2 반전 줄(글에서 누름)
 *   → 3 남기고 싶은 곳(글에서 끌어 고름) → 1차 안을 전체 화면 미리보기로 보여 준다.
 *   처음 묻을 때는 글을 읽어 긴 쪽을 나누고 심상·반전·남길 곳의 짐작을 채워 둔다.
 * - 다듬기: 본문을 그대로 고치며, 고른 자리에 효과를 감싼다. 오른쪽 미리보기는 바뀐 자리부터 다시 쓴다.
 * 반전·남길 곳·효과는 모두 본문 안의 표시로 들어가므로 언제든 쓰기·묻기로 돌아가 바꿀 수 있다.
 * 상태는 이 브라우저의 localStorage에만, 미리보기 글과 조판값은 sessionStorage로 read.html에 넘긴다.
 */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  const G = window.GeulFx;
  const T = window.GeulTune;
  const S = window.GeulSense;
  const Y = window.GeulGyeol;
  if (!E || !G || !T || !S || !Y) return;

  const $ = (id) => document.getElementById(id);
  const KEY = 'hapbon.state';
  const MODES = ['write', 'ask', 'tune'];
  const OPPOSITE = { '낮': '밤', '밤': '낮' };
  const phone = window.matchMedia('(max-width: 860px)');

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장할 수 없는 환경에서는 넘어간다 */ } }
  };

  const st = Object.assign({
    mode: 'write',
    title: '',
    source: '',
    moods: [],
    settings: T.defaults(),
    prepped: null,
    askStep: 1,
    askFrom: 'write',
    tab: 'paper',
    lastStart: null
  }, store.get(KEY) || {});
  st.settings = T.normalize(st.settings);
  if (!MODES.includes(st.mode)) st.mode = 'write';
  if (!st.source.trim() && st.mode !== 'write') st.mode = 'write';

  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set(KEY, st), 250);
  }

  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return String(h);
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
  }

  /* ---------- 글 ---------- */

  const ta = $('src');
  const mirror = $('mirror');

  function head() { return T.sceneLine(st.settings) + '\n'; }
  function fullText() { return head() + st.source; }
  /* 전체 글의 offset 자리가 몇째 쪽인지(0부터) */
  function pageAt(full, offset) {
    return Math.max(0, E.pages(E.parse(full.slice(0, offset) + '■')).length - 1);
  }
  const squash = (s) => E.stripMarks(s).replace(/\s+/g, '');

  /* 본문을 바꾼다. 실행 취소가 남도록 입력창 전체를 한 번에 갈아 끼우고 고른 자리를 되돌린다. */
  let quiet = false;
  function setSource(text, sel) {
    if (text === st.source && ta.value === text) return;
    const ro = ta.readOnly;
    ta.readOnly = false;
    const top = ta.scrollTop;
    quiet = true;
    ta.focus({ preventScroll: true });
    ta.select();
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok || ta.value !== text) ta.value = text;
    quiet = false;
    ta.readOnly = ro;
    ta.scrollTop = top;
    if (sel) ta.setSelectionRange(sel[0], sel[1]);
    sourceChanged();
    if (sel) scrollToOffset(sel[0]);
  }

  function sourceChanged() {
    st.source = ta.value;
    drawMirror();
    refreshSide();
    save();
  }

  ta.addEventListener('input', () => {
    if (quiet || st.mode === 'ask') return;
    sourceChanged();
    if (st.mode === 'tune') { clearTimeout(typeTimer); typeTimer = setTimeout(() => playAt(startAtCaret()), 1200); }
  });
  let typeTimer = 0;
  ta.addEventListener('scroll', () => { mirror.scrollTop = ta.scrollTop; });
  new ResizeObserver(() => drawMirror()).observe(ta);

  $('title').addEventListener('input', (e) => { st.title = e.target.value; save(); });

  /* ---------- 표시층 ---------- */

  function esc(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  const NAME_ALT = E.BLOCK_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const TOKEN_RE = new RegExp(`\\{\\{(?:(${NAME_ALT}):)?|\\}\\}`, 'g');

  /*
   * 표시층 그리기. 글자는 한 자도 더하거나 빼지 않고(자리가 어긋나지 않게) 감싸기만 한다.
   * 블록 표시 글자는 옅게, 블록 안 글은 물결 밑줄과 번진 면(남길 곳은 더 진한 면), 장면 줄은 면,
   * 어절 사이 두 번째 칸부터는 빈 네모, 쪽이 바뀌는 자리에는 겹줄과 쪽 번호.
   */
  function markup(text) {
    const ls = S.lines(text);
    const out = [];
    const pageMark = (n) => `<span class="m-page" data-n="${n}"></span>`;
    let open = null;
    let blank = 0;
    ls.forEach((ln, k) => {
      if (ln.empty) {
        blank++;
        let mark = '';
        if (blank === 1) {
          const run = ls.slice(k).findIndex((x) => !x.empty);
          const next = run >= 0 ? ls[k + run] : null;
          if (next && run >= 2 && ls.slice(0, k).some((x) => !x.empty && !x.scene)) mark = pageMark(next.page + 1);
        }
        open = null;
        out.push(mark + esc(ln.text));
        return;
      }
      const afterBreak = blank >= 2;
      blank = 0;
      if (ln.scene) {
        const mark = !afterBreak && ls.slice(0, k).some((x) => !x.empty && !x.scene) ? pageMark(ln.page + 1) : '';
        out.push(mark + `<span class="m-scene">${esc(ln.text)}</span>`);
        return;
      }
      const line = ln.text;
      const emOpen = () => `<span class="m-em${open && !open.named ? ' focus' : ''}">`;
      let html = open ? emOpen() : '';
      const textPart = (a, b) => esc(line.slice(a, b)).replace(/(\S) ( +)/g, (all, c, more) => c + ' ' + more.split('').map(() => '<span class="m-sp"> </span>').join(''));
      const lead = line.match(/^[^\S\n]*/)[0].length;
      html += esc(line.slice(0, lead));
      let i = lead;
      TOKEN_RE.lastIndex = lead;
      let m;
      while ((m = TOKEN_RE.exec(line))) {
        html += textPart(i, m.index);
        if (m[0] === '}}') {
          html += (open ? '</span>' : '') + '<span class="m-mark">}}</span>';
          open = null;
        } else {
          html += (open ? '</span>' : '') + `<span class="m-mark">${esc(m[0])}</span>`;
          open = { named: !!m[1] };
          html += emOpen();
        }
        i = m.index + m[0].length;
      }
      html += textPart(i, line.length);
      if (open) html += '</span>';
      out.push(html);
    });
    return out.join('\n') + (text.endsWith('\n') ? ' ' : '');
  }

  function drawMirror() {
    mirror.innerHTML = markup(ta.value);
    mirror.scrollTop = ta.scrollTop;
  }

  /* 표시층의 sel 요소가 보이도록 편집창을 굴린다 */
  function scrollToMark(sel) {
    const el = mirror.querySelector(sel);
    if (!el) return;
    scrollToTop(el.getBoundingClientRect().top);
  }
  function scrollToTop(y) {
    const top = y - mirror.getBoundingClientRect().top + mirror.scrollTop;
    ta.scrollTop = Math.max(0, top - ta.clientHeight * 0.35);
    mirror.scrollTop = ta.scrollTop;
  }

  /* 본문 offset 자리가 편집창 안에 보이지 않으면 굴려서 보인다. 표시층의 글자는 입력창과 한 자도 다르지 않으므로 거기서 잰다. */
  function scrollToOffset(offset) {
    const walker = document.createTreeWalker(mirror, NodeFilter.SHOW_TEXT);
    let left = offset;
    let node;
    while ((node = walker.nextNode())) {
      if (left < node.length) {
        const r = document.createRange();
        r.setStart(node, left);
        r.setEnd(node, left + 1);
        const box = r.getBoundingClientRect();
        if (!box.height) return;
        const m = mirror.getBoundingClientRect();
        if (box.top < m.top + 20 || box.bottom > m.bottom - 40) scrollToTop(box.top);
        return;
      }
      left -= node.length;
    }
  }

  /* ---------- 결 보기 ---------- */

  function drawGyeol() {
    const n = Y.draw($('gyeol'), st.source.trim() ? fullText() : '');
    const set = (rule, v) => {
      const r = $('rules').querySelector(`[data-rule="${rule}"]`);
      r.classList.toggle('on', v > 0);
      r.querySelector('.n').textContent = v > 0 ? String(v) : '';
    };
    set('page', Math.max(0, n.pages - 1));
    set('rest', n.rests);
    set('para', n.paras);
    set('mark', n.marks);
  }

  function countLine() {
    if (!st.source.trim()) return '';
    T.apply(E, st.settings);
    const full = fullText();
    const s = E.stats(full);
    return `${s.withSpaces.toLocaleString('ko-KR')}자 · 원고지 ${(s.withSpaces / 200).toFixed(1)}매 · ${s.pages}쪽 · 약 ${Math.round(s.ms / 1000)}초`;
  }

  let sideTimer = 0;
  function refreshSide() {
    clearTimeout(sideTimer);
    sideTimer = setTimeout(() => {
      $('count').textContent = countLine();
      if (st.mode !== 'tune') drawGyeol();
      else drawPageList();
      syncCrumbs();
    }, 120);
  }

  /* ---------- 모드 ---------- */

  function setMode(mode) {
    st.mode = mode;
    document.body.dataset.mode = mode;
    ta.readOnly = mode === 'ask';
    $('ask').hidden = mode !== 'ask';
    if (mode !== 'tune') $('fxbar').hidden = true;
    syncCrumbs();
    syncTabs();
    refreshSide();
    if (mode === 'tune') { renderTune(); playAt(st.lastStart || { page: 0 }); }
    save();
  }

  function syncCrumbs() {
    const has = !!st.source.trim();
    document.querySelectorAll('.crumbs button').forEach((b) => {
      const go = b.dataset.go;
      b.disabled = go !== 'write' && !has;
      if (go === st.mode) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
  }

  document.querySelector('.crumbs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.go === 'ask') enterAsk(1);
    else setMode(b.dataset.go);
  });
  $('home').addEventListener('click', () => setMode('write'));

  /* 폰: 다듬기에서 글·미리보기·조판을 탭으로 */
  function syncTabs() {
    $('tabs').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === st.tab)));
    $('paper-col').toggleAttribute('data-show', st.tab === 'paper');
    document.querySelectorAll('.pane[data-for="tune"]').forEach((p) => p.toggleAttribute('data-show', p.dataset.tab === st.tab));
  }
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    st.tab = b.dataset.tab;
    syncTabs();
    if (st.tab === 'look') playAt(st.lastStart || startAtCaret());
    save();
  });

  /* ---------- 쓰기 ---------- */

  function sampleText() {
    return E.stripMarks(window.GeulgyeolSample ? window.GeulgyeolSample.text : '').replace(/\n{4,}/g, '\n\n\n');
  }
  $('sample').addEventListener('click', () => {
    if (st.source.trim() && !window.confirm('지금 글을 예시 글로 바꿀까요?')) return;
    st.prepped = null;
    setSource(sampleText(), [0, 0]);
    ta.scrollTop = 0;
  });
  $('clear').addEventListener('click', () => {
    if (st.source.trim() && !window.confirm('지금 글을 지우고 새로 쓸까요?')) return;
    st.prepped = null;
    st.title = '';
    $('title').value = '';
    st.moods = [];
    st.settings = T.defaults();
    st.lastStart = null;
    setSource('', [0, 0]);
    setMode('write');
    ta.focus();
  });
  $('go-ask').addEventListener('click', () => {
    if (!st.source.trim()) { toast('글을 먼저 놓아 주세요.'); ta.focus(); return; }
    enterAsk(1);
  });

  /* ---------- 묻기 ---------- */

  /* 표시가 없는 새 글이면 글을 읽어 첫 짐작을 채운다: 긴 쪽 나누기, 심상, 반전 줄, 남길 곳 */
  function prepare() {
    const plainHash = hash(E.stripMarks(st.source).replace(/\s+/g, ''));
    if (/\{\{|\[\[/.test(st.source) || st.prepped === plainHash) return;
    let t = st.source;
    const ab = S.autoBreaks(t);
    t = ab.text;
    st.moods = S.guessMoods(t);
    st.settings = T.fromMoods(st.moods);
    const tl = S.turnCandidate(t, st.settings.scene);
    if (tl != null) t = S.setTurn(t, tl, OPPOSITE[st.settings.scene]);
    const f = S.emphasisCandidates(t)[0];
    if (f) t = S.setFocus(t, f.start, f.end);
    st.prepped = plainHash;
    setSource(t, [0, 0]);
    ta.scrollTop = 0;
    if (ab.count) toast(`긴 쪽 ${ab.count}곳을 나눴어요.`);
  }

  function enterAsk(step) {
    if (st.mode !== 'ask') st.askFrom = st.mode;
    prepare();
    st.askStep = step;
    setMode('ask');
    renderAsk();
  }

  const TITLES = { 1: '어떤 결이에요', 2: '낮과 밤이 뒤집히는 곳', 3: '남기고 싶은 곳' };

  function renderAsk() {
    const n = st.askStep;
    $('ask').dataset.q = String(n);
    $('ask-title').textContent = TITLES[n];
    $('ask-n').textContent = `${n} / 3`;
    [...$('ask-steps').children].forEach((i, k) => i.classList.toggle('on', k < n));
    $('ask-prev').hidden = n === 1;
    $('ask-next').textContent = n === 3 ? '1차 안 보기' : '다음';
    if (n === 1) { drawMoods($('moods'), true); playSample(); }
    if (n === 2) { renderTurn(); scrollToMark('.m-scene'); }
    if (n === 3) { renderFocus(); scrollToMark('.m-em.focus'); }
  }

  $('ask-next').addEventListener('click', () => {
    if (st.askStep < 3) { st.askStep++; renderAsk(); save(); return; }
    stopSample();
    setMode('tune');
    openFull({ page: 0 });
  });
  $('ask-prev').addEventListener('click', () => { st.askStep = Math.max(1, st.askStep - 1); renderAsk(); });
  $('ask-close').addEventListener('click', () => { stopSample(); setMode(st.askFrom === 'tune' ? 'tune' : 'write'); });

  /* 1. 결 */

  function setMoods(list) {
    st.moods = list;
    st.settings = T.fromMoods(st.moods);
    fixTurnScene();
    save();
  }

  /* 처음 장면이 바뀌면 반전 줄의 장면도 반대로 맞춘다 */
  function fixTurnScene() {
    const li = S.turnLine(st.source);
    if (li == null) return;
    const ls = st.source.split('\n');
    const want = OPPOSITE[st.settings.scene];
    if (ls[li].includes(`[[${want}`)) return;
    ls[li] = `[[${want}]]`;
    setSource(ls.join('\n'), [ta.selectionStart, ta.selectionEnd]);
  }

  function drawMoods(box, withNotes) {
    box.textContent = '';
    T.WORDS.forEach((w) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = w;
      b.title = T.MOOD[w].note;
      b.setAttribute('aria-pressed', String(st.moods.includes(w)));
      b.addEventListener('click', () => {
        const list = st.moods.slice();
        const i = list.indexOf(w);
        if (i >= 0) list.splice(i, 1);
        else {
          list.push(w);
          if (list.length > 3) list.shift();
        }
        setMoods(list);
        if (st.mode === 'ask') { drawMoods($('moods'), true); playSample(); }
        else { renderTune(); playAt(st.lastStart || startAtCaret()); }
      });
      box.append(b);
    });
    const mix = box === $('moods') ? $('mix') : $('mix-t');
    mix.textContent = '';
    T.describe(st.settings).forEach(([k, v]) => {
      const s = document.createElement('span');
      const b = document.createElement('b');
      b.textContent = v;
      s.append(k + ' ', b);
      mix.append(s);
    });
    if (withNotes) $('notes').textContent = st.moods.length ? st.moods.map((w) => `${w}: ${T.MOOD[w].note}`).join(' · ') : '고르지 않으면 글의 생김새만 따라요.';
  }

  /* 견본 한 줄: 남길 곳(없으면 첫 문장)을 지금 조판값으로 써 보인다 */
  let sampleTl = null;
  let sampleTimer = 0;
  function stopSample() { if (sampleTl) sampleTl.cancel(); sampleTl = null; clearTimeout(sampleTimer); }
  function playSample() {
    stopSample();
    sampleTimer = setTimeout(() => {
      const box = $('sample-line');
      const pick = S.focusText(st.source) || (S.sentences(st.source)[0] || {}).text || '';
      const line = E.stripMarks(pick).replace(/\s+/g, ' ').trim().slice(0, 60);
      box.textContent = '';
      if (!line) return;
      T.apply(E, st.settings);
      const para = E.parse(line).paragraphs[0];
      if (!para) return;
      const fx = T.FLOWS[st.settings.flow];
      if (fx) para.lines.forEach((l) => l.tokens.forEach((tk) => tk.cells.forEach((c) => { if (c.anim === 'fade' || c.anim === 'soft') c.anim = fx; })));
      box.style.setProperty('--dry', T.DRY[st.settings.dry] + 's');
      const inner = document.createElement('div');
      box.append(inner);
      const built = G.buildParagraph(para, inner);
      sampleTl = G.timeline(built.items, { onDone() { sampleTl = null; } });
    }, 180);
  }

  /* 2. 반전 */

  function renderTurn() {
    const li = S.turnLine(st.source);
    [...$('turn-seg').children].forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.v === 'on') === (li != null))));
    const q = $('turn-line');
    if (li != null) {
      const ls = st.source.split('\n');
      const next = ls.slice(li + 1).find((x) => x.trim()) || '';
      const off = head().length + ls.slice(0, li + 1).join('\n').length + 1;
      q.textContent = `${pageAt(fullText(), off) + 1}쪽부터 ${OPPOSITE[st.settings.scene]} · ${E.stripMarks(next).trim()}`;
      q.classList.remove('none');
    } else {
      q.textContent = '뒤집지 않아요.';
      q.classList.add('none');
    }
  }
  $('turn-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const has = S.turnLine(st.source) != null;
    if (b.dataset.v === 'off' && has) setSource(S.setTurn(st.source, null), [0, 0]);
    if (b.dataset.v === 'on' && !has) {
      const tl = S.turnCandidate(st.source, st.settings.scene);
      if (tl != null) setSource(S.setTurn(st.source, tl, OPPOSITE[st.settings.scene]), [0, 0]);
      else toast('글에서 줄을 눌러 골라요.');
    }
    renderTurn();
    scrollToMark('.m-scene');
  });

  /* 3. 남길 곳 */

  function renderFocus() {
    const f = S.focusText(st.source);
    const q = $('focus-line');
    q.textContent = f ? E.stripMarks(f).replace(/\s+/g, ' ').trim() : '고르지 않았어요.';
    q.classList.toggle('none', !f);
    q.classList.toggle('em', !!f);
    $('focus-off').hidden = !f;
  }
  $('focus-off').addEventListener('click', () => { setSource(S.setFocus(st.source, null), [0, 0]); renderFocus(); });

  /* 묻기에서 글을 누르거나 끌었을 때 */
  function pickInText() {
    if (st.mode !== 'ask') return;
    const a = ta.selectionStart;
    const b = ta.selectionEnd;
    const v = ta.value;
    if (st.askStep === 2) {
      const li = v.slice(0, a).split('\n').length - 1;
      const ln = S.lines(v)[li];
      if (!ln || ln.empty || ln.scene) return;
      setSource(S.setTurn(v, li, OPPOSITE[st.settings.scene]), [a, a]);
      renderTurn();
    } else if (st.askStep === 3) {
      let s = a;
      let e = b;
      if (s === e) {
        const sent = S.sentences(v).find((x) => x.start <= a && a <= x.end);
        if (!sent) return;
        s = sent.start;
        e = sent.end;
      }
      setSource(S.setFocus(v, s, e), [s, s]);
      renderFocus();
    }
  }
  ta.addEventListener('pointerup', () => setTimeout(pickInText, 0));
  ta.addEventListener('keyup', (e) => { if (e.shiftKey || e.key === 'Enter') pickInText(); });

  /* ---------- 미리보기 ---------- */

  let pvN = 0;
  function handOff(start) {
    const data = JSON.stringify({ text: fullText() });
    const tune = JSON.stringify(st.settings);
    try {
      sessionStorage.setItem('geulgyeol.preview', data);
      sessionStorage.setItem('geulgyeol.tune', tune);
      localStorage.setItem('geulgyeol.preview', data);
      localStorage.setItem('geulgyeol.tune', tune);
      if (start) sessionStorage.setItem('geulgyeol.start', JSON.stringify(start));
      else sessionStorage.removeItem('geulgyeol.start');
    } catch (e) { /* 저장할 수 없는 환경에서는 예시 글이 뜬다 */ }
  }

  /* 오른쪽 미리보기를 start({page, needle}) 자리부터 다시 쓴다 */
  function playAt(start) {
    if (st.mode !== 'tune' || !st.source.trim()) return;
    if (phone.matches && st.tab !== 'look') { st.lastStart = start; return; }
    st.lastStart = start;
    handOff(start);
    $('pv').src = `read.html?embed&v=${++pvN}#preview`;
    const where = start && start.needle ? ` · “${start.needle.slice(0, 10)}…”부터` : '';
    $('pv-where').textContent = `${((start && start.page) || 0) + 1}쪽${where}`;
    save();
  }

  /* 입력창 커서가 있는 문장 자리 */
  function startAtCaret() {
    const a = ta.selectionStart || 0;
    const sent = S.sentences(st.source).find((x) => x.start <= a && a <= x.end + 1);
    const page = pageAt(fullText(), head().length + a);
    const needle = sent ? E.stripMarks(sent.text).replace(/\s+/g, ' ').trim().slice(0, 14) : '';
    return needle ? { page, needle } : { page };
  }

  function startAtRange(a, b) {
    const page = pageAt(fullText(), head().length + a);
    const needle = E.stripMarks(st.source.slice(a, b)).replace(/\s+/g, ' ').trim().slice(0, 14);
    return { page, needle };
  }

  function openFull(start) {
    handOff(start || null);
    $('pv-layer').hidden = false;
    $('pv-full-frame').src = `read.html?v=${++pvN}#preview`;
    $('pv-full-frame').focus();
  }
  function closeFull(toMode) {
    $('pv-layer').hidden = true;
    $('pv-full-frame').src = 'about:blank';
    if (toMode === 'ask') enterAsk(1);
    else if (toMode) setMode(toMode);
  }
  $('pv-ask').addEventListener('click', () => closeFull('ask'));
  $('pv-tune').addEventListener('click', () => closeFull('tune'));
  $('pv-full').addEventListener('click', () => openFull(st.lastStart));
  $('open-full').addEventListener('click', () => openFull({ page: 0 }));
  $('pv-again').addEventListener('click', () => playAt(st.lastStart || startAtCaret()));
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'geulgyeol:close' && !$('pv-layer').hidden) closeFull('tune');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('pv-layer').hidden) closeFull('tune');
    else if (st.mode === 'ask') $('ask-close').click();
  });

  /* ---------- 다듬기: 효과 막대 ---------- */

  function blockAtSel() {
    const a = ta.selectionStart;
    const b = ta.selectionEnd;
    return S.blocks(ta.value).find((k) => k.os <= a && b <= k.ce) || null;
  }

  function buildFxbar() {
    const list = $('fx-list');
    E.BLOCK_NAMES.forEach((n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.fx = n;
      b.textContent = n;
      list.append(b);
    });
    let busy = false;
    $('fxbar').addEventListener('pointerdown', () => { busy = true; });
    $('fxbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-fx]');
      if (b) applyFx(b.dataset.fx);
      else if (e.target.closest('#fx-off')) removeFx();
      busy = false;
      syncFxbar();
    });
    ta.addEventListener('blur', () => setTimeout(() => { if (!busy) syncFxbar(); }, 0));
    document.addEventListener('selectionchange', () => { if (st.mode === 'tune' && document.activeElement === ta) syncFxbar(); });
  }

  function syncFxbar() {
    if (st.mode !== 'tune') { $('fxbar').hidden = true; return; }
    const blk = blockAtSel();
    const on = (ta.selectionStart !== ta.selectionEnd && document.activeElement === ta) || (!!blk && document.activeElement === ta);
    $('fxbar').hidden = !on;
    const cur = blk ? blk.fx : null;
    $('fx-list').querySelectorAll('[data-fx]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.fx === cur)));
    $('fx-off').hidden = !blk;
  }

  function applyFx(fx) {
    const v = ta.value;
    const blk = blockAtSel();
    let a = ta.selectionStart;
    let b = ta.selectionEnd;
    let next;
    if (blk && a >= blk.oe && b <= blk.cs) {
      next = v.slice(0, blk.os) + '{{' + fx + ':' + v.slice(blk.oe);
      a = blk.os;
      b = blk.cs + (fx.length + 3 - (blk.oe - blk.os));
    } else {
      if (a === b) return;
      const r = S.wrap(v, a, b, fx);
      next = r.text;
      a = r.start;
      b = r.end;
    }
    setSource(next, [a, a]);
    playAt(startAtRange(a, b));
  }

  function removeFx() {
    const blk = blockAtSel();
    if (!blk) return;
    setSource(S.unwrap(ta.value, blk), [blk.os, blk.os]);
    playAt(startAtCaret());
  }

  /* ---------- 다듬기: 조판 ---------- */

  function segment(box, names, current, onPick) {
    box.textContent = '';
    names.forEach((n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = n;
      b.setAttribute('aria-pressed', String(n === current));
      b.addEventListener('click', () => onPick(n));
      box.append(b);
    });
  }

  /* 넘김을 보려면 장면이 바뀌기 바로 앞 쪽의 끝에서 시작한다 */
  function startBeforeTurn() {
    const pages = E.pages(E.parse(fullText()));
    const k = pages.findIndex((p, i) => i > 0 && p.scene !== pages[i - 1].scene);
    if (k < 1) return { page: 0 };
    const lines = pages[k - 1].paragraphs.flatMap((p) => p.lines);
    const last = lines[lines.length - 1];
    return { page: k - 1, needle: last ? last.tokens.slice(-3).map((t) => t.text).join(' ') : '' };
  }

  function renderTune() {
    const s = st.settings;
    const set = (k, v, start) => {
      st.settings = T.normalize(Object.assign({}, st.settings, { [k]: v }));
      if (k === 'scene') fixTurnScene();
      save();
      renderTune();
      refreshSide();
      playAt(start || st.lastStart || startAtCaret());
      if (k === 'turn') toast('다음 쪽으로 넘기면 넘김이 보여요.');
    };
    drawMoods($('moods-t'), false);
    segment($('set-flow'), T.FLOW_NAMES, s.flow, (v) => set('flow', v));
    segment($('set-scene'), Object.keys(T.GROUNDS), s.scene, (v) => set('scene', v, { page: 0 }));
    segment($('set-ground'), T.GROUNDS[s.scene], s.ground, (v) => set('ground', v, { page: 0 }));
    segment($('set-turn'), T.TURN_NAMES, s.turn, (v) => set('turn', v, startBeforeTurn()));
    segment($('set-dry'), T.DRY_NAMES, s.dry, (v) => set('dry', v));
    $('set-speed').value = String(Math.round(s.speed * 100));
    $('speed-v').textContent = s.speed.toFixed(2) + '×';
    $('set-rest').value = String(s.rest);
    $('rest-v').textContent = T.REST_NAMES[s.rest];
  }

  let sliderTimer = 0;
  function slid() {
    save();
    refreshSide();
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(() => playAt(st.lastStart || startAtCaret()), 450);
  }
  $('set-speed').addEventListener('input', (e) => {
    st.settings.speed = Number(e.target.value) / 100;
    $('speed-v').textContent = st.settings.speed.toFixed(2) + '×';
    slid();
  });
  $('set-rest').addEventListener('input', (e) => {
    st.settings.rest = Number(e.target.value);
    $('rest-v').textContent = T.REST_NAMES[st.settings.rest];
    slid();
  });

  /* ---------- 다듬기: 이렇게 읽었어요 ---------- */

  function clip(s) {
    const t = E.stripMarks(s).replace(/\s+/g, ' ').trim();
    return t.length > 14 ? t.slice(0, 13) + '…' : t;
  }
  const groundName = (g) => Object.keys(E.GROUNDS).find((k) => E.GROUNDS[k] === g) || g;

  /* 본문 offset으로 고르고 그 자리부터 미리보기 */
  function goRange(a, b) {
    if (phone.matches) { st.tab = 'paper'; syncTabs(); }
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(a, b);
    scrollToOffset(a);
    playAt(startAtRange(a, b));
  }

  function drawPageList() {
    const list = $('pagelist');
    if (!list) return;
    list.textContent = '';
    const full = fullText();
    const pages = E.pages(E.parse(full));
    const srcBlocks = S.blocks(st.source);
    const used = new Set();
    const sugg = S.suggestions(st.source);
    const here = st.lastStart ? st.lastStart.page || 0 : -1;

    pages.forEach((pg, i) => {
      const tags = [];
      const prev = pages[i - 1];
      if (i === 0) tags.push({ on: true, name: `${pg.scene === 'night' ? '밤' : '낮'} · ${groundName(pg.ground)}`, why: '처음 장면' });
      else if (prev.scene !== pg.scene) tags.push({ on: true, name: `${st.settings.turn} → ${pg.scene === 'night' ? '밤' : '낮'} · ${groundName(pg.ground)}`, why: '반전', act: () => playAt({ page: i - 1, needle: '' }) });

      const blocks = [];
      let dripRun = 0;
      let shortN = 0;
      let indent = 0;
      const rests = [];
      pg.paragraphs.forEach((para) => {
        const seen = new Map();
        para.lines.forEach((l) => {
          if (l.kind === 'short') shortN++;
          if (l.indent) indent = Math.max(indent, l.indent);
          let run = 0;
          l.tokens.forEach((tk) => {
            if (tk.role === 'drip') run++;
            if (tk.gap > 1) rests.push(tk.gap);
            tk.cells.forEach((c, ci) => {
              if (!c.em) return;
              if (!seen.has(c.block)) { seen.set(c.block, { fx: c.fx, text: '' }); blocks.push(seen.get(c.block)); }
              const b = seen.get(c.block);
              b.text += (ci === 0 && b.text ? ' ' : '') + c.ch;
            });
          });
          dripRun = Math.max(dripRun, run);
        });
      });
      blocks.forEach((b) => {
        const k = srcBlocks.findIndex((x, j) => !used.has(j) && squash(st.source.slice(x.oe, x.cs)) === squash(b.text));
        const src = k >= 0 ? srcBlocks[k] : null;
        if (k >= 0) used.add(k);
        tags.push({
          on: true,
          name: `${src && !src.named ? '남길 곳' : b.fx} · ${clip(b.text)}`,
          why: src && !src.named ? '고른 곳' : '표시',
          act: src ? () => goRange(src.os, src.ce) : null
        });
      });
      if (dripRun) tags.push({ on: true, name: '흘러내림', why: `한 글자 어절 ${dripRun}` });
      rests.forEach((g) => tags.push({ on: true, name: `쉼 ${g - 1}칸`, why: `띄어쓰기 ${g}` }));
      if (shortN) tags.push({ on: true, name: '천천히', why: `짧은 줄 ${shortN}` });
      if (indent) tags.push({ on: true, name: '들여쓰기', why: `${indent}칸` });
      sugg.forEach((s) => {
        if (pageAt(full, head().length + s.start) !== i) return;
        tags.push({
          on: false,
          name: `${s.fx} · ${clip(s.text)}`,
          why: s.why,
          act: () => {
            const r = S.wrap(st.source, s.start, s.end, s.fx);
            setSource(r.text, [r.start, r.start]);
            playAt(startAtRange(r.start, r.end));
          }
        });
      });

      const li = document.createElement('li');
      if (i === here) li.classList.add('is-here');
      const n = document.createElement('button');
      n.type = 'button';
      n.className = 'pg-n';
      n.textContent = String(i + 1);
      n.setAttribute('aria-label', `${i + 1}쪽부터 미리보기`);
      n.addEventListener('click', () => playAt({ page: i }));
      const headEl = document.createElement('span');
      headEl.className = 'pg-head';
      const first = pg.paragraphs[0] && pg.paragraphs[0].lines[0];
      headEl.textContent = first ? first.tokens.map((t) => t.text).join(' ') : '';
      const tg = document.createElement('span');
      tg.className = 'tags';
      tags.forEach((t) => {
        const el = document.createElement(t.act ? 'button' : 'span');
        el.className = 'tag';
        if (t.act) {
          el.type = 'button';
          el.addEventListener('click', t.act);
        }
        const box = document.createElement('i');
        box.className = 'box' + (t.on ? ' on' : '');
        const why = document.createElement('span');
        why.className = 'why';
        why.textContent = t.why;
        el.append(box, t.name, why);
        tg.append(el);
      });
      li.append(n, headEl, tg);
      list.append(li);
    });
  }

  $('copy-mask').addEventListener('click', () => {
    const btn = $('copy-mask');
    const masked = E.mask(fullText());
    const done = () => {
      btn.textContent = '복사했어요';
      setTimeout(() => { btn.textContent = '가린 글 복사'; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(masked).then(done, () => toast('복사하지 못했어요.'));
  });

  /* ---------- 시작 ---------- */

  buildFxbar();
  $('title').value = st.title || '';
  ta.value = st.source;
  drawMirror();
  setMode(st.mode);
  if (st.mode === 'ask') renderAsk();
})();
