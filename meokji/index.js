/*
 * 글결 먹지판 편집실
 * 쓰기 → 세 가지 묻기 → 1차 안 → 다듬기를 한 페이지 안에서 오간다.
 * - 쓰기: 제목과 본문만. 결 짜기를 누르면 글을 읽어(sense.js) 심상·반전·강조의 첫 짐작을 채운다.
 * - 묻기: 심상 낱말 셋, 반전 자리, 남기고 싶은 한 문장. 반전 자리와 문장은 글에서 직접 누른다.
 * - 1차 안: 고른 것을 원문에 표시로 넣고(compose) 읽기 틀(read.html)을 iframe으로 띄운다.
 *   오른쪽에는 쪽마다 붙인 것(■)과 낱말을 보고 한 제안(□)을 둔다. 제안을 누르면 받아들이고 미리보기를 다시 쓴다.
 * - 다듬기: 표시가 들어간 글을 직접 고친다. 입력창 뒤에 같은 글을 그려 표시를 보이고, 고른 자리에 효과를 감싼다.
 * 상태는 이 브라우저의 localStorage에만 둔다. 미리보기 글과 조판값은 sessionStorage로 read.html에 넘긴다.
 */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  const T = window.GeulTune;
  const S = window.GeulSense;
  if (!E || !T || !S) return;

  const $ = (id) => document.getElementById(id);
  const KEY = 'meokji.state';
  const STEPS = ['write', 'ask', 'draft', 'refine'];
  const OPPOSITE = { '낮': '밤', '밤': '낮' };
  const NAME_ALT = E.BLOCK_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const BLOCK_TOKEN_RE = new RegExp(`\\{\\{(?:(${NAME_ALT}):)?|\\}\\}`, 'g');
  const SCENE_RE = /^[^\S\n]*\[\[(밤|낮)(?:[:·]\s*[^\]]+)?\]\][^\S\n]*$/;

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장할 수 없는 환경에서는 넘어간다 */ } }
  };

  function sampleText() {
    const raw = window.GeulgyeolSample ? window.GeulgyeolSample.text : '';
    return E.stripMarks(raw).replace(/\n{4,}/g, '\n\n\n');
  }

  const st = Object.assign({
    step: 'write',
    title: '',
    source: '',
    analyzed: null,
    moods: [],
    settings: T.defaults(),
    turn: { on: false, line: null },
    focus: null,
    accepted: [],
    marked: null
  }, store.get(KEY) || {});
  st.settings = T.normalize(st.settings);
  if (!st.source) {
    st.source = sampleText();
    if (!st.title) st.title = '마르기 전에';
  }

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

  /* ---------- 글 짜기 ---------- */

  /* 글을 읽어 첫 짐작을 채운다. 글이 그대로면 사용자가 고른 것을 지킨다. */
  function analyze(force) {
    const h = hash(st.source);
    if (st.analyzed === h && !force) return;
    st.moods = S.guessMoods(st.source);
    st.settings = T.fromMoods(st.moods);
    const t = S.turnCandidate(st.source, st.settings.scene);
    st.turn = { on: t != null, line: t };
    const f = S.emphasisCandidates(st.source)[0];
    st.focus = f ? { start: f.start, end: f.end, text: f.text } : null;
    st.accepted = [];
    st.marked = null;
    st.analyzed = h;
  }

  function suggestions() {
    return S.suggestions(st.source, st.focus);
  }

  function composedBody() {
    const acc = suggestions().filter((s) => st.accepted.includes(s.id));
    return S.compose(st.source, {
      focus: st.focus,
      accepted: acc,
      turnLine: st.turn.on ? st.turn.line : null,
      turnScene: OPPOSITE[st.settings.scene]
    });
  }

  function body() {
    return st.marked != null ? st.marked : composedBody();
  }

  function fullText() {
    return T.sceneLine(st.settings) + '\n' + body();
  }

  /* text의 offset 자리가 몇째 쪽인지(1부터) */
  function pageAt(text, offset) {
    return E.pages(E.parse(text.slice(0, offset) + '■')).length;
  }

  function countLine(text) {
    const n = E.stats(text).withSpaces;
    return `${n.toLocaleString('ko-KR')}자 · 원고지 ${(n / 200).toFixed(1)}매`;
  }

  /* ---------- 미리보기 ---------- */

  let pvN = 0;
  function handOff() {
    const data = JSON.stringify({ text: fullText() });
    const tune = JSON.stringify(st.settings);
    try {
      sessionStorage.setItem('geulgyeol.preview', data);
      sessionStorage.setItem('geulgyeol.tune', tune);
      localStorage.setItem('geulgyeol.preview', data);
      localStorage.setItem('geulgyeol.tune', tune);
    } catch (e) { /* 저장할 수 없는 환경에서는 예시 글이 뜬다 */ }
  }
  function preview(frame) {
    handOff();
    frame.src = `read.html?embed&v=${++pvN}#preview`;
  }
  let pvTimer = 0;
  function previewSoon(frame, ms) {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => preview(frame), ms);
  }
  function openPreview() {
    handOff();
    window.open('read.html#preview', '_blank');
  }

  /* ---------- 단계 ---------- */

  function show(step) {
    if (!STEPS.includes(step)) step = 'write';
    st.step = step;
    document.body.dataset.step = step;
    STEPS.forEach((s) => { $('s-' + s).hidden = s !== step; });
    $('doc-title').textContent = step === 'write' ? '' : (st.title || '');
    if (step === 'write') renderWrite();
    if (step === 'ask') renderAsk();
    if (step === 'draft') renderDraft();
    if (step === 'refine') renderRefine();
    save();
  }

  /* ---------- 1. 쓰기 ---------- */

  function drawGyeol(el, text) {
    el.textContent = '';
    text.split(/\s+/).filter(Boolean).slice(0, 90).forEach((w) => {
      const n = Math.max(1, Math.min(6, w.replace(/[\p{P}]/gu, '').length));
      const g = document.createElement('span');
      for (let k = 0; k < n; k++) {
        const i = document.createElement('i');
        i.style.height = (6 + n * 2) + 'px';
        g.append(i);
      }
      el.append(g);
    });
  }

  function renderWrite() {
    if ($('title').value !== st.title) $('title').value = st.title;
    if ($('src').value !== st.source) $('src').value = st.source;
    writeBar();
  }
  function writeBar() {
    drawGyeol($('gyeol'), E.stripMarks(st.source));
    $('count-w').textContent = countLine(st.source);
  }

  $('title').addEventListener('input', (e) => { st.title = e.target.value; save(); });
  $('src').addEventListener('input', (e) => { st.source = e.target.value; writeBar(); save(); });
  $('go-ask').addEventListener('click', () => {
    if (!st.source.trim()) { $('src').focus(); return; }
    analyze(false);
    show('ask');
  });
  $('home').addEventListener('click', () => show('write'));

  /* ---------- 2. 묻기 ---------- */

  let pickMode = 'focus';
  const phone = window.matchMedia('(max-width: 760px)');

  function renderAsk() {
    renderAskText();
    renderAskPanel();
  }

  function renderAskText() {
    const box = $('ask-text');
    box.textContent = '';
    box.classList.toggle('picking-turn', pickMode === 'turn');
    const ls = S.lines(st.source);
    const sents = S.sentences(st.source);
    let blank = 0;
    ls.forEach((ln, k) => {
      if (ln.empty) {
        blank++;
        const nextFull = ls.slice(k + 1).find((x) => !x.empty);
        if (blank === 1 && nextFull) {
          const run = ls.slice(k).findIndex((x) => !x.empty);
          const div = document.createElement('div');
          div.className = 'pk ' + (run >= 2 ? 'page' : 'blank');
          div.setAttribute('aria-hidden', 'true');
          box.append(div);
        }
        return;
      }
      blank = 0;
      const div = document.createElement('div');
      div.className = 'pk';
      div.dataset.line = String(ln.i);
      if (st.turn.on && st.turn.line === ln.i) {
        div.classList.add('turn-at');
        div.dataset.scene = OPPOSITE[st.settings.scene];
      }
      let at = ln.start;
      sents.filter((s) => s.line === ln.i).forEach((s) => {
        if (s.start > at) div.append(st.source.slice(at, s.start));
        const span = document.createElement('span');
        span.className = 'sent';
        span.tabIndex = 0;
        span.dataset.start = String(s.start);
        span.textContent = s.text;
        if (st.focus && st.focus.start === s.start && st.focus.text === s.text) span.classList.add('is-focus');
        div.append(span);
        at = s.end;
      });
      if (at < ln.start + ln.text.length) div.append(st.source.slice(at, ln.start + ln.text.length));
      box.append(div);
    });
  }

  function pickAt(target) {
    const line = target.closest('.pk[data-line]');
    if (!line) return;
    if (pickMode === 'turn') {
      st.turn = { on: true, line: Number(line.dataset.line) };
      pickMode = 'focus';
    } else {
      const sp = target.closest('.sent');
      if (!sp) return;
      const s = S.sentences(st.source).find((x) => x.start === Number(sp.dataset.start));
      if (!s) return;
      const same = st.focus && st.focus.start === s.start;
      st.focus = same ? null : { start: s.start, end: s.end, text: s.text };
      st.accepted = st.accepted.filter((id) => !st.focus || id < st.focus.start || id >= st.focus.end);
    }
    save();
    renderAsk();
  }
  $('ask-text').addEventListener('click', (e) => pickAt(e.target));
  $('ask-text').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('sent')) { e.preventDefault(); pickAt(e.target); }
  });

  function renderAskPanel() {
    const moods = $('moods');
    moods.textContent = '';
    T.WORDS.forEach((w) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = w;
      b.setAttribute('aria-pressed', String(st.moods.includes(w)));
      b.addEventListener('click', () => {
        const i = st.moods.indexOf(w);
        if (i >= 0) st.moods.splice(i, 1);
        else {
          st.moods.push(w);
          if (st.moods.length > 3) st.moods.shift();
        }
        st.settings = T.fromMoods(st.moods);
        save();
        renderAsk();
      });
      moods.append(b);
    });
    $('mood-n').textContent = `${st.moods.length} / 3`;
    const mix = $('mix');
    mix.textContent = '';
    if (st.moods.length) {
      T.describe(st.settings).forEach(([k, v]) => {
        const s = document.createElement('span');
        const b = document.createElement('b');
        b.textContent = v;
        s.append(k + ' ', b);
        mix.append(s);
      });
    }

    [...$('turn-seg').children].forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.v === 'on') === st.turn.on)));
    $('turn-row').hidden = !st.turn.on;
    const line = st.turn.line != null ? st.source.split('\n')[st.turn.line] : null;
    if (st.turn.on && line != null && line.trim()) {
      const full = fullText();
      const lines = full.split('\n');
      const sceneLineAt = lines.findIndex((l, i) => i > 0 && SCENE_RE.test(l) && lines[i + 1] === line);
      const off = sceneLineAt > 0 ? lines.slice(0, sceneLineAt + 1).join('\n').length + 1 : 0;
      $('turn-page').textContent = `${pageAt(full, off)}쪽부터 ${OPPOSITE[st.settings.scene]}`;
      $('turn-line').textContent = line.trim();
      $('turn-line').classList.remove('none');
    } else {
      $('turn-page').textContent = '';
      $('turn-line').textContent = '글에서 줄을 짚어 주세요.';
      $('turn-line').classList.add('none');
    }
    $('turn-mode').setAttribute('aria-pressed', String(pickMode === 'turn'));
    $('turn-mode').textContent = pickMode === 'turn' ? '짚는 중' : '글에서 짚기';

    const ft = $('focus-text');
    ft.textContent = st.focus ? st.focus.text : '글에서 문장을 눌러 골라요.';
    ft.classList.toggle('none', !st.focus);
    $('focus-clear').hidden = !st.focus;
  }

  $('turn-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const on = b.dataset.v === 'on';
    st.turn.on = on;
    if (on && st.turn.line == null) {
      st.turn.line = S.turnCandidate(st.source, st.settings.scene);
      if (st.turn.line == null) pickMode = 'turn';
    }
    if (!on && pickMode === 'turn') pickMode = 'focus';
    save();
    renderAsk();
  });
  $('turn-mode').addEventListener('click', () => {
    pickMode = pickMode === 'turn' ? 'focus' : 'turn';
    renderAsk();
    if (pickMode === 'turn' && phone.matches) $('ask-text').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('focus-clear').addEventListener('click', () => { st.focus = null; save(); renderAsk(); });
  $('skip').addEventListener('click', () => { analyze(true); show('draft'); });
  $('go-draft').addEventListener('click', () => show('draft'));

  /* ---------- 3. 1차 안 ---------- */

  function renderDraft() {
    st.marked = null;
    const full = fullText();
    preview($('pv-draft'));
    T.apply(E, st.settings);
    const stats = E.stats(full);
    const parsed = E.parse(full);
    const pages = E.pages(parsed);
    const tone = st.moods.length ? `${st.moods.join(' ')} → ${st.settings.flow} · ${st.settings.speed.toFixed(2)}× · 쉼 ${T.REST_NAMES[st.settings.rest]}` : `${st.settings.flow} · ${st.settings.speed.toFixed(2)}×`;
    $('facts').textContent = `${pages.length}쪽 · 약 ${Math.round(stats.ms / 1000)}초 · ${tone}`;
    $('count-d').textContent = countLine(st.source);
    renderPageList(full, pages);
  }

  /* 쪽마다 붙인 것과 제안을 줄 세운다. 붙인 것 중 받아들인 제안은 다시 눌러 뺄 수 있다. */
  function renderPageList(full, pages) {
    const list = $('pagelist');
    list.textContent = '';
    const sugg = suggestions();
    const squash = (s) => s.replace(/\s+/g, '');
    const fullLines = full.split('\n');
    const lineOffset = (j) => fullLines.slice(0, j).join('\n').length + (j ? 1 : 0);
    const bodyLine = (i) => 1 + i + (st.turn.on && st.turn.line != null && i >= st.turn.line ? 1 : 0);
    const suggPage = (s) => pageAt(full, lineOffset(bodyLine(S.lines(st.source).find((l) => s.start >= l.start && s.start <= l.start + l.text.length).i)));

    pages.forEach((pg, i) => {
      const tags = [];
      const prev = pages[i - 1];
      if (i === 0) tags.push({ on: true, name: `${sceneName(pg.scene)} · ${groundName(pg.ground)}`, why: '처음 장면' });
      else if (prev.scene !== pg.scene) tags.push({ on: true, name: `쓸기 → ${sceneName(pg.scene)} · ${groundName(pg.ground)}`, why: st.turn.on ? '짚은 자리' : '표시' });

      const blocks = new Map();
      let drip = 0;
      let dripRun = 0;
      let shortN = 0;
      let indent = 0;
      const rests = [];
      pg.paragraphs.forEach((para, pi) => {
        para.lines.forEach((l) => {
          if (l.kind === 'short') shortN++;
          if (l.indent) indent = Math.max(indent, l.indent);
          let run = 0;
          l.tokens.forEach((tk) => {
            if (tk.role === 'drip') { run++; drip = Math.max(drip, 1); }
            if (tk.gap > 1) rests.push(tk.gap);
            tk.cells.forEach((c, ci) => {
              if (!c.em) return;
              const key = pi + ':' + c.block;
              if (!blocks.has(key)) blocks.set(key, { fx: c.fx, text: '' });
              const blk = blocks.get(key);
              blk.text += (ci === 0 && blk.text ? ' ' : '') + c.ch;
            });
          });
          dripRun = Math.max(dripRun, run);
        });
      });
      blocks.forEach((b) => {
        if (st.focus && squash(b.text) === squash(st.focus.text)) tags.push({ on: true, name: `${b.fx} · ${clip(b.text)}`, why: '고른 문장', act: () => show('ask') });
        else {
          const s = sugg.find((x) => st.accepted.includes(x.id) && squash(x.text) === squash(b.text));
          if (s) tags.push({ on: true, name: `${b.fx} · ${clip(b.text)}`, why: s.why, act: () => { st.accepted = st.accepted.filter((id) => id !== s.id); renderDraft(); } });
          else tags.push({ on: true, name: `${b.fx} · ${clip(b.text)}`, why: '표시' });
        }
      });
      if (drip) tags.push({ on: true, name: '흘러내림', why: `한 글자 어절 ${dripRun}` });
      rests.forEach((g) => tags.push({ on: true, name: `쉼 ${g - 1}칸`, why: `띄어쓰기 ${g}` }));
      if (shortN) tags.push({ on: true, name: '천천히', why: `짧은 줄 ${shortN}` });
      if (indent) tags.push({ on: true, name: '들여쓰기', why: `${indent}칸` });
      sugg.forEach((s) => {
        if (st.accepted.includes(s.id) || suggPage(s) !== i + 1) return;
        tags.push({ on: false, name: `${s.fx} · ${clip(s.text)}`, why: s.why, act: () => { st.accepted.push(s.id); renderDraft(); } });
      });

      const li = document.createElement('li');
      const n = document.createElement('span');
      n.className = 'pg-n';
      n.textContent = String(i + 1);
      const head = document.createElement('span');
      head.className = 'pg-head';
      const first = pg.paragraphs[0].lines[0];
      head.textContent = first ? first.tokens.map((t) => t.text).join(' ') : '';
      const tg = document.createElement('span');
      tg.className = 'tags';
      tags.forEach((t) => {
        const el = document.createElement(t.act ? 'button' : 'span');
        el.className = 'tag';
        if (t.act) {
          el.type = 'button';
          el.setAttribute('aria-pressed', String(t.on));
          el.addEventListener('click', () => { t.act(); save(); });
        }
        const box = document.createElement('i');
        box.className = 'box' + (t.on ? ' on' : '');
        const why = document.createElement('span');
        why.className = 'why';
        why.textContent = t.why;
        el.append(box, t.name, why);
        tg.append(el);
      });
      li.append(n, head, tg);
      list.append(li);
    });
  }

  function clip(s) {
    const t = s.trim();
    return t.length > 14 ? t.slice(0, 13) + '…' : t;
  }
  function sceneName(scene) { return scene === 'night' ? '밤' : '낮'; }
  function groundName(g) { return Object.keys(E.GROUNDS).find((k) => E.GROUNDS[k] === g) || g; }

  $('back-ask').addEventListener('click', () => show('ask'));
  $('go-refine').addEventListener('click', () => show('refine'));
  $('open-d').addEventListener('click', openPreview);

  /* ---------- 4. 다듬기 ---------- */

  const ta = $('marked');
  const mirror = $('mirror');

  function esc(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /*
   * 표시층 그리기. 글자는 한 자도 더하거나 빼지 않고(자리가 어긋나지 않게) 감싸기만 한다.
   * 블록 표시 글자는 옅게, 블록 안 글은 물결 밑줄과 번진 면, 장면 줄은 면, 어절 사이 두 번째 칸부터는 빈 네모,
   * 빈 줄 둘 이상의 첫 빈 줄에는 겹줄과 쪽 번호.
   */
  function markup(text) {
    const out = [];
    const ls = text.split('\n');
    let inBlock = false;
    let page = 1;
    let blank = 0;
    ls.forEach((line, k) => {
      if (!line.trim()) {
        blank++;
        const run = ls.slice(k).findIndex((x) => x.trim());
        let mark = '';
        if (blank === 1 && run >= 2) {
          page++;
          mark = `<span class="m-page" data-n="${page}"></span>`;
        }
        inBlock = false;
        out.push(mark + esc(line));
        return;
      }
      const freshPage = blank >= 2 || k === 0;
      blank = 0;
      if (SCENE_RE.test(line)) {
        if (!freshPage) page++;
        out.push(`<span class="m-scene">${esc(line)}</span>`);
        return;
      }
      let html = inBlock ? '<span class="m-em">' : '';
      let i = 0;
      const lead = line.match(/^[^\S\n]*/)[0].length;
      html += esc(line.slice(0, lead));
      i = lead;
      BLOCK_TOKEN_RE.lastIndex = lead;
      const marks = [];
      let m;
      while ((m = BLOCK_TOKEN_RE.exec(line))) marks.push({ at: m.index, s: m[0] });
      const textPart = (a, b) => esc(line.slice(a, b)).replace(/(\S) ( +)/g, (all, c, more) => c + ' ' + more.split('').map(() => '<span class="m-sp"> </span>').join(''));
      marks.forEach((mk) => {
        html += textPart(i, mk.at);
        if (mk.s === '}}') {
          html += (inBlock ? '</span>' : '') + `<span class="m-mark">}}</span>`;
          inBlock = false;
        } else {
          html += (inBlock ? '</span>' : '') + `<span class="m-mark">${esc(mk.s)}</span><span class="m-em">`;
          inBlock = true;
        }
        i = mk.at + mk.s.length;
      });
      html += textPart(i, line.length);
      if (inBlock) html += '</span>';
      out.push(html);
    });
    return out.join('\n') + (text.endsWith('\n') ? ' ' : '');
  }

  function drawMirror() {
    mirror.innerHTML = markup(ta.value);
    mirror.scrollTop = ta.scrollTop;
  }

  /* 고른 자리(또는 커서)를 품은 블록 */
  function blockAt(text, a, b) {
    BLOCK_TOKEN_RE.lastIndex = 0;
    let open = null;
    let m;
    while ((m = BLOCK_TOKEN_RE.exec(text))) {
      if (m[0] === '}}') {
        if (open) {
          const blk = Object.assign(open, { cs: m.index, ce: m.index + 2 });
          if (blk.os <= a && b <= blk.ce && !text.slice(blk.os, blk.ce).includes('\n\n')) return blk;
          open = null;
        }
      } else {
        open = { os: m.index, oe: m.index + m[0].length, fx: m[1] || E.BLOCK_DEFAULT };
      }
    }
    return null;
  }

  function edit(start, end, text) {
    ta.focus();
    ta.setSelectionRange(start, end);
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) {
      ta.setRangeText(text, start, end, 'end');
      ta.dispatchEvent(new Event('input'));
    }
  }

  function prefix(fx) { return '{{' + (fx === E.BLOCK_DEFAULT ? '' : fx + ':'); }

  function applyFx(fx) {
    const a = ta.selectionStart;
    const b = ta.selectionEnd;
    const blk = blockAt(ta.value, a, b);
    if (blk) {
      if (blk.fx !== fx) edit(blk.os, blk.oe, prefix(fx));
    } else {
      if (a === b) return;
      let s = a;
      let e = b;
      const v = ta.value;
      while (s < e && /\s/.test(v[s])) s++;
      while (e > s && /\s/.test(v[e - 1])) e--;
      if (s === e || v.slice(s, e).includes('\n\n')) return;
      edit(s, e, prefix(fx) + v.slice(s, e) + '}}');
    }
    syncFxbar();
  }

  function unwrap() {
    const blk = blockAt(ta.value, ta.selectionStart, ta.selectionEnd);
    if (!blk) return;
    edit(blk.cs, blk.ce, '');
    edit(blk.os, blk.oe, '');
    syncFxbar();
  }

  function syncFxbar() {
    const a = ta.selectionStart;
    const b = ta.selectionEnd;
    const blk = document.activeElement === ta || fxbarBusy ? blockAt(ta.value, a, b) : null;
    const on = (a !== b && document.activeElement === ta) || !!blk;
    $('fxbar').hidden = !on && !fxbarBusy;
    const cur = blk ? blk.fx : null;
    $('fxbar').querySelectorAll('[data-fx]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.fx === cur)));
    $('fx-off').hidden = !blk;
  }
  let fxbarBusy = false;

  function buildFxbar() {
    const rest = $('fx-rest');
    E.BLOCK_NAMES.filter((n) => n !== E.BLOCK_DEFAULT).forEach((n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.fx = n;
      b.textContent = n;
      rest.append(b);
    });
    $('fxbar').addEventListener('pointerdown', () => { fxbarBusy = true; });
    $('fxbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-fx]');
      if (b) applyFx(b.dataset.fx);
      else if (e.target.closest('#fx-off')) unwrap();
      fxbarBusy = false;
      syncFxbar();
    });
  }

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

  function renderTune() {
    const s = st.settings;
    const set = (k, v) => { st.settings = T.normalize(Object.assign({}, st.settings, { [k]: v })); save(); renderTune(); previewSoon($('pv-refine'), 200); };
    segment($('set-flow'), T.FLOW_NAMES, s.flow, (v) => set('flow', v));
    segment($('set-scene'), Object.keys(T.GROUNDS), s.scene, (v) => set('scene', v));
    segment($('set-ground'), T.GROUNDS[s.scene], s.ground, (v) => set('ground', v));
    segment($('set-dry'), T.DRY_NAMES, s.dry, (v) => set('dry', v));
    $('set-speed').value = String(Math.round(s.speed * 100));
    $('speed-v').textContent = s.speed.toFixed(2) + '×';
    $('set-rest').value = String(s.rest);
    $('rest-v').textContent = T.REST_NAMES[s.rest];
  }

  $('set-speed').addEventListener('input', (e) => {
    st.settings.speed = Number(e.target.value) / 100;
    $('speed-v').textContent = st.settings.speed.toFixed(2) + '×';
    save();
    previewSoon($('pv-refine'), 450);
    refineBar();
  });
  $('set-rest').addEventListener('input', (e) => {
    st.settings.rest = Number(e.target.value);
    $('rest-v').textContent = T.REST_NAMES[st.settings.rest];
    save();
    previewSoon($('pv-refine'), 450);
    refineBar();
  });
  $('more').addEventListener('click', () => {
    const open = $('more-box').hidden;
    $('more-box').hidden = !open;
    $('more').setAttribute('aria-expanded', String(open));
  });

  function refineBar() {
    T.apply(E, st.settings);
    const full = fullText();
    $('count-r').textContent = `${countLine(full)} · ${E.pages(E.parse(full)).length}쪽 · 약 ${Math.round(E.stats(full).ms / 1000)}초`;
  }

  function renderRefine() {
    if (st.marked == null) st.marked = composedBody();
    if (ta.value !== st.marked) ta.value = st.marked;
    drawMirror();
    renderTune();
    syncFxbar();
    refineBar();
    preview($('pv-refine'));
  }

  ta.addEventListener('input', () => {
    st.marked = ta.value;
    drawMirror();
    syncFxbar();
    save();
    refineBar();
    previewSoon($('pv-refine'), 900);
  });
  ta.addEventListener('scroll', () => { mirror.scrollTop = ta.scrollTop; });
  document.addEventListener('selectionchange', () => { if (st.step === 'refine') syncFxbar(); });
  ta.addEventListener('blur', () => setTimeout(syncFxbar, 0));
  new ResizeObserver(() => { if (st.step === 'refine') drawMirror(); }).observe(ta);

  $('back-draft').addEventListener('click', () => {
    if (st.marked != null && st.marked !== composedBody() && !window.confirm('다듬은 내용을 두고 1차 안으로 돌아갈까요? 고친 곳은 사라져요.')) return;
    st.marked = null;
    show('draft');
  });
  $('open-r').addEventListener('click', openPreview);
  $('copy-mask').addEventListener('click', () => {
    const btn = $('copy-mask');
    const masked = E.mask(fullText());
    const done = () => {
      btn.textContent = '복사했어요';
      setTimeout(() => { btn.textContent = '가린 글 복사'; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(masked).then(done, () => {});
  });

  /* ---------- 시작 ---------- */

  buildFxbar();
  if (st.step !== 'write' && !st.analyzed) st.step = 'write';
  show(st.step);
})();
