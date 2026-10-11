/*
 * 글결 심상 낱말 살펴보기
 * 견본 글(편집실에 쓴 글의 남길 곳이나 첫 두 문장, 없으면 예시 글)을 두고,
 * 기본 조판 한 칸과 낱말 열두 칸(축마다 한 줄)에 낱말 하나만 건 조판으로 써 보인다.
 * 칸마다 기본과 달라진 값만 진하게 적는다. 한 번에 한 칸만 쓴다(속도가 칸마다 달라서).
 */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  const G = window.GeulFx;
  const T = window.GeulTune;
  const S = window.GeulSense;
  if (!E || !G || !T || !S) return;
  const $ = (id) => document.getElementById(id);

  function sampleText() {
    let src = '';
    try { src = (JSON.parse(localStorage.getItem('geul.studio') || 'null') || {}).source || ''; } catch (e) { src = ''; }
    if (!src.trim() && window.GeulgyeolSample) src = window.GeulgyeolSample.text;
    const focus = S.focusText(src);
    const pick = focus || S.sentences(src).slice(0, 2).map((x) => x.text).join(' ');
    return E.stripMarks(pick).replace(/\s+/g, ' ').trim().slice(0, 90);
  }

  const text = sampleText();
  const base = T.defaults();
  let playing = null;

  function play(tile, settings) {
    if (playing) playing.tl.cancel();
    document.querySelectorAll('.tile.on').forEach((t) => t.classList.remove('on'));
    tile.classList.add('on');
    const stage = tile.querySelector('.stage');
    stage.textContent = '';
    T.apply(E, settings, G);
    const para = E.parse(text).paragraphs[0];
    if (!para) return;
    T.flowCells(para, settings);
    stage.style.setProperty('--dry', T.dryTime(settings) + 's');
    const inner = document.createElement('div');
    stage.append(inner);
    const built = G.buildParagraph(para, inner);
    playing = { tl: G.timeline(built.items, { onDone() { playing = null; } }) };
  }

  function tile(word, settings) {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'tile';
    t.dataset.scene = settings.scene;
    const head = document.createElement('span');
    head.className = 'tile-head';
    const w = document.createElement('span');
    w.className = 'word';
    w.textContent = word;
    const note = document.createElement('span');
    note.className = 'note';
    note.textContent = word === '기본' ? '아무것도 고르지 않았을 때' : T.MOOD[word].note;
    head.append(w, note);
    const vals = document.createElement('span');
    vals.className = 'vals';
    const baseVals = Object.fromEntries(T.describe(base));
    T.describe(settings).forEach(([k, v]) => {
      const s = document.createElement('span');
      const b = document.createElement('b');
      b.textContent = v;
      s.append(k + ' ', b);
      if (word !== '기본' && baseVals[k] === v) s.className = 'same';
      vals.append(s);
    });
    const stage = document.createElement('span');
    stage.className = 'stage';
    stage.style.fontFamily = `${T.FONTS[settings.font].css}, 'Song Myung', serif`;
    stage.textContent = text;
    t.append(head, vals, stage);
    t.addEventListener('click', () => play(t, settings));
    return t;
  }

  const b = $('base');
  const bn = document.createElement('span');
  bn.className = 'name';
  bn.textContent = '기본';
  b.append(bn, tile('기본', base));

  T.AXES.forEach((ax) => {
    const row = document.createElement('div');
    row.className = 'axis';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = ax.name;
    row.append(name);
    ax.words.forEach((word) => row.append(tile(word, T.fromMoods([word]))));
    $('axes').append(row);
  });
})();
