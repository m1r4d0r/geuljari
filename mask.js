/*
 * 글결 가림판
 * 원문을 띄어쓰기·줄바꿈·강조 표시만 남기고 가린다. 집계와 움직임 판정은 원문으로 하고,
 * 가린 글의 글자마다 읽기 틀이 쓸 움직임 종류를 색으로 칠해 보여 준다.
 * 원문에서 드래그한 뒤 효과 메뉴에서 고르면 그 부분을 {{효과:…}}로 감싼다(떠오름은 이름 없이 {{…}}).
 * 이미 효과가 붙은 블록 안에서 고르면 효과를 바꾸고, 효과 풀기를 고르면 표시를 걷어 낸다.
 * Ctrl/⌘+B는 마지막에 고른 효과를 붙인다.
 * 블록 표시·장면 표시 [[밤]]·[[낮]]([[밤:오로라]]처럼 바탕 이름 포함)는 가리지 않는다.
 * 새 페이지가 시작되는 자리(빈 줄 둘, 장면 표시)에는 가린 글에 가는 선을 긋는다.
 */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  if (!E) return;

  const $ = (id) => document.getElementById(id);
  const src = $('src-in');
  const out = $('masked');
  const countEl = $('count');
  const gauge = $('gauge');
  const keep = $('keep-punct');
  const colorBtn = $('toggle-color');
  const fxSelect = $('fx-select');
  const copyBtn = $('copy');
  const previewBtn = $('preview');
  const rulesBox = $('rules');
  const rulesList = $('rules-list');

  const DRAFT = 'geulgyeol.draft';
  const PREFS = 'geulgyeol.mask-prefs';
  const UNWRAP = '풀기';
  const PREFIX_ALL = new RegExp(`\\{\\{(?:${E.HEAD_SRC}):`, 'g');
  const GOAL = 1000;
  const SCALE = 1200;

  const store = {
    get(area, k) { try { return window[area].getItem(k); } catch (e) { return null; } },
    set(area, k, v) { try { window[area].setItem(k, v); } catch (e) { /* 저장할 수 없는 환경에서는 넘어간다 */ } }
  };
  const fmt = (n) => n.toLocaleString('ko-KR');

  let isSample = false;
  let colorOn = true;
  let renderTimer = 0;
  let lastFx = E.BLOCK_DEFAULT;

  function duration(ms) {
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`;
  }

  function setColor(on) {
    colorOn = on;
    out.classList.toggle('is-color', on);
    colorBtn.setAttribute('aria-pressed', String(on));
  }

  function drawRules() {
    const R = E.RULES;
    const T = E.TIME;
    const items = [
      ['flow', '보통', '문단을 고른 속도로 이어 씀, 마침표 뒤에서 조금 더 쉬고 문단이 길수록 조금 빨라짐'],
      ['em', '블록 효과', '드래그한 뒤 효과 메뉴에서 고르면 {{효과:…}}로 감쌈, 이름 없는 {{…}}는 떠오름(문장·줄 단위로 떠오름). 효과마다 움직임은 효과 견본에서 볼 수 있음'],
      ['short', '짧은 줄', `어절 ${R.shortMaxTokens}개·${R.shortMaxChars}자 이하인 줄은 조금 뜸 들이고 천천히 씀`],
      ['drip', '흘러내림', `한 글자 어절이 ${R.dripRun}개 이상(줄 전체면 ${R.dripRunWholeLine}개) 이어지면 한 자씩 떨어짐`],
      ['rest', '쉼', `띄어쓰기 두 칸부터 한 칸마다 ${(T.restPerSpace / 1000).toFixed(1)}초 쉼, 앞뒤 글자는 느려졌다 다시 빨라짐, 읽기 틀 화면에는 한 칸으로 보임`],
      ['scene', '낮밤', '[[밤]]이나 [[낮]]만 적은 줄에서 새 페이지가 시작되고 넘길 때 바닥선이 휙 돌며 밤이나 낮으로 뒤집힘, 바탕은 [[밤:오로라]]처럼 고를 수 있음(낮 창빛·한지, 밤 영사광·오로라·물빛)'],
      ['place', '문단·페이지', '빈 줄 하나는 문단, 빈 줄 둘은 페이지 나눔, 페이지마다 글 폭과 자리가 바뀌고 장면이 같은 페이지끼리는 스미듯 넘어감, 줄 앞 공백은 들여쓰기']
    ];
    rulesList.textContent = '';
    items.forEach(([role, name, desc]) => {
      const wrap = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.dataset.role = role;
      dt.textContent = name;
      dd.textContent = desc;
      wrap.append(dt, dd);
      rulesList.append(wrap);
    });
  }

  /* 가린 표시는 원래 글자 폭을 그대로 차지해서 원문과 같은 자리에서 줄이 바뀐다. */
  const measure = (() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext ? canvas.getContext('2d') : null;
    const cache = new Map();
    return {
      reset() {
        if (!ctx) return;
        const cs = getComputedStyle(out);
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        cache.clear();
      },
      width(c) {
        if (!ctx) return 0;
        let w = cache.get(c);
        if (w === undefined) { w = ctx.measureText(c).width; cache.set(c, w); }
        return w;
      }
    };
  })();

  function maskNode(c) {
    if (keep.checked && E.isPunct(c)) return document.createTextNode(c);
    const m = document.createElement('i');
    m.className = 'm';
    m.textContent = E.MASK;
    const w = measure.width(c);
    if (w) m.style.width = w.toFixed(2) + 'px';
    return m;
  }

  /* 강조 표시 {{ }}는 가린 글에도 그대로 남는다(복사한 글에도 들어감). */
  function markNode(text) {
    const s = document.createElement('span');
    s.className = 'mk';
    s.textContent = text;
    return s;
  }

  function drawMasked(parsed) {
    const frag = document.createDocumentFragment();
    if (!parsed.paragraphs.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = '원문을 넣으면 가린 글이 여기 나타남';
      frag.append(p);
      return frag;
    }
    parsed.paragraphs.forEach((para, pi) => {
      if (pi) {
        const turn = para.pageStart || para.rows.some((r) => r.sceneMark);
        const blank = document.createElement('div');
        blank.className = turn ? 'ml page' : 'ml blank';
        frag.append(blank);
      }
      para.rows.forEach((line) => {
        if (line.sceneMark) {
          const mark = document.createElement('div');
          mark.className = 'ml scene';
          mark.dataset.scene = line.sceneMark;
          mark.textContent = line.text;
          frag.append(mark);
          return;
        }
        const row = document.createElement('div');
        row.className = 'ml';
        if (line.indentText) {
          const ind = document.createElement('span');
          ind.className = 'ind';
          ind.textContent = line.indentText;
          row.append(ind);
        }
        line.tokens.forEach((tk, i) => {
          if (i) {
            const sp = document.createElement('span');
            sp.className = 'sp';
            if (tk.gap > 1) sp.dataset.rest = '';
            sp.textContent = tk.gapText;
            row.append(sp);
          }
          const w = document.createElement('span');
          w.className = 'tk';
          w.dataset.role = tk.role;
          tk.cells.forEach((c) => {
            if (c.open) w.append(markNode(c.open));
            const node = maskNode(c.ch);
            if (c.em) {
              const wrap = document.createElement('span');
              wrap.className = 'em';
              wrap.append(node);
              w.append(wrap);
            } else {
              w.append(node);
            }
            for (let k = 0; k < (c.close || 0); k++) w.append(markNode(E.EM_CLOSE));
          });
          row.append(w);
        });
        frag.append(row);
      });
    });
    return frag;
  }

  function render() {
    const text = src.value;
    const parsed = E.parse(text);
    const st = E.stats(text, parsed);

    const parts = [];
    if (isSample) parts.push('예시 글');
    parts.push(
      `${fmt(st.withSpaces)}자`,
      `공백 제외 ${fmt(st.noSpaces)}자`,
      `어절 ${fmt(st.tokens)}`,
      `문단 ${fmt(st.paragraphs)}`,
      `페이지 ${fmt(st.pages)}`,
      `효과 ${fmt(st.marks)}`,
      `장면 ${fmt(st.scenes)}`,
      `쓰는 시간 약 ${duration(st.ms)}`
    );
    countEl.textContent = parts.join(' · ');

    gauge.style.setProperty('--fill', (Math.min(st.withSpaces, GOAL) / SCALE).toFixed(4));
    gauge.style.setProperty('--over', (Math.max(0, Math.min(st.withSpaces, SCALE) - GOAL) / SCALE).toFixed(4));
    gauge.title = `공백 포함 ${fmt(st.withSpaces)}자, 기준 ${fmt(GOAL)}자`;

    out.replaceChildren(drawMasked(parsed));
    previewBtn.disabled = !st.paragraphs;
    copyBtn.disabled = !st.paragraphs;
  }

  function saveDraft() {
    if (isSample) return;
    store.set('localStorage', DRAFT, JSON.stringify({ text: src.value }));
  }

  function savePrefs() {
    store.set('localStorage', PREFS, JSON.stringify({ keepPunct: keep.checked, color: colorOn }));
  }

  function edited() {
    isSample = false;
    saveDraft();
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 80);
  }

  function flash(btn, label) {
    const original = btn.dataset.label || btn.textContent;
    btn.dataset.label = original;
    btn.textContent = label;
    clearTimeout(btn._flash);
    btn._flash = setTimeout(() => { btn.textContent = original; }, 1600);
  }

  /* 실행 취소(Ctrl/⌘+Z)가 되도록 브라우저 입력으로 바꿔 끼운다. */
  function replaceRange(start, end, text) {
    src.focus();
    src.setSelectionRange(start, end);
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) src.setRangeText(text, start, end, 'end');
  }

  /* 커서나 선택이 들어 있는 블록 {{…}}을 찾는다. */
  function enclosing(v, s, e) {
    const before = v.slice(0, s);
    const open = before.lastIndexOf(E.EM_OPEN);
    if (open === -1 || open < before.lastIndexOf(E.EM_CLOSE)) return null;
    const close = v.indexOf(E.EM_CLOSE, open + 2);
    if (close === -1 || close < e) return null;
    const m = v.slice(open + 2, open + 50).match(E.PREFIX_RE);
    return { open, close, prefixLen: m ? m[0].length : 0, name: m ? m[1] : E.BLOCK_DEFAULT };
  }

  const prefixOf = (name) => (name === E.BLOCK_DEFAULT ? '' : name + ':');

  function hint(text) {
    const first = fxSelect.options[0];
    first.textContent = text;
    clearTimeout(fxSelect._hint);
    fxSelect._hint = setTimeout(() => { first.textContent = '효과'; }, 1600);
  }

  function applyEffect(name) {
    const v = src.value;
    let s = src.selectionStart;
    let e = src.selectionEnd;
    const b = enclosing(v, s, e);

    if (b) {
      const innerStart = b.open + 2 + b.prefixLen;
      let inner = v.slice(innerStart, b.close);
      if (name === UNWRAP) {
        replaceRange(b.open, b.close + 2, inner);
        src.setSelectionRange(b.open, b.open + inner.length);
      } else {
        const body = E.EM_OPEN + prefixOf(name) + inner + E.EM_CLOSE;
        replaceRange(b.open, b.close + 2, body);
        const at = b.open + 2 + prefixOf(name).length;
        src.setSelectionRange(at, at + inner.length);
      }
      edited();
      return;
    }

    if (name === UNWRAP) { hint('효과 안에 커서를 두세요'); return; }
    while (s < e && /\s/.test(v[s])) s++;
    while (e > s && /\s/.test(v[e - 1])) e--;
    if (s === e) { hint('먼저 드래그'); return; }

    const inner = v.slice(s, e).replace(PREFIX_ALL, '').split(E.EM_OPEN).join('').split(E.EM_CLOSE).join('');
    const prefix = prefixOf(name);
    replaceRange(s, e, E.EM_OPEN + prefix + inner + E.EM_CLOSE);
    src.setSelectionRange(s + 2 + prefix.length, s + 2 + prefix.length + inner.length);
    edited();
  }

  function selectOutput() {
    const range = document.createRange();
    range.selectNodeContents(out);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (ok) flash(copyBtn, '복사됨');
    else { selectOutput(); flash(copyBtn, '선택됨'); }
  }

  /* ---------- 시작 ---------- */

  drawRules();
  rulesBox.open = window.matchMedia('(min-width: 900px)').matches;

  let prefs = null;
  try { prefs = JSON.parse(store.get('localStorage', PREFS) || 'null'); } catch (e) { prefs = null; }
  if (prefs) {
    keep.checked = !!prefs.keepPunct;
    setColor(prefs.color !== false);
  }

  let draft = null;
  try { draft = JSON.parse(store.get('localStorage', DRAFT) || 'null'); } catch (e) { draft = null; }
  if (draft && typeof draft.text === 'string') {
    src.value = draft.text;
  } else if (window.GeulgyeolSample) {
    src.value = window.GeulgyeolSample.text;
    isSample = true;
  }
  measure.reset();
  render();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { measure.reset(); render(); });
  }

  src.addEventListener('input', edited);
  src.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      applyEffect(lastFx);
    }
  });

  E.BLOCK_NAMES.concat(UNWRAP).forEach((name) => {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name === UNWRAP ? '효과 풀기' : name;
    fxSelect.append(o);
  });
  fxSelect.addEventListener('change', () => {
    const name = fxSelect.value;
    fxSelect.value = '';
    if (!name) return;
    if (name !== UNWRAP) lastFx = name;
    applyEffect(name);
  });

  keep.addEventListener('change', () => { savePrefs(); render(); });
  colorBtn.addEventListener('click', () => { setColor(!colorOn); savePrefs(); });

  copyBtn.addEventListener('click', () => {
    const text = E.mask(src.value, { keepPunct: keep.checked });
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => flash(copyBtn, '복사됨'), () => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  });

  previewBtn.addEventListener('click', () => {
    const data = JSON.stringify({ text: src.value });
    store.set('sessionStorage', 'geulgyeol.preview', data);
    store.set('localStorage', 'geulgyeol.preview', data);
    store.set('sessionStorage', 'geulgyeol.go', '1');
    location.href = 'reader.html#preview';
  });
})();
