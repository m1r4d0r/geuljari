/* 시안의 모든 입력과 의도는 이 문서의 메모리에만 보관한다. */
(function () {
  'use strict';
  const E = window.GeulIntent, $ = id => document.getElementById(id);
  const state = { moods: [], focus: null, turn: null, draft: null, page: 0, speed: 1, rest: 1, effect: 'flow', scenes: {}, picker: null, pickerReturn: null, frame: 0, elapsed: 0, started: 0, playing: false, schedule: null, nodes: [], reduced: matchMedia('(prefers-reduced-motion: reduce)') };
  let toastTimer;
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2500); }
  function goTop() { window.scrollTo({ top: $('device').getBoundingClientRect().top + scrollY - 78, behavior: state.reduced.matches ? 'instant' : 'smooth' }); }
  function mode(mobile) { $('device').dataset.mode = mobile ? 'mobile' : 'desktop'; $('desktop-mode').setAttribute('aria-pressed', String(!mobile)); $('mobile-mode').setAttribute('aria-pressed', String(mobile)); }
  $('desktop-mode').addEventListener('click', () => mode(false)); $('mobile-mode').addEventListener('click', () => mode(true));
  new ResizeObserver(([entry]) => { $('viewport-size').textContent = `${$('device').dataset.mode === 'mobile' ? '모바일' : 'PC'} · ${Math.round(entry.contentRect.width)}px`; }).observe($('device'));

  function currentAnalysis() { return E.analyze($('source').value); }
  function getSelected(id) { return id ? currentAnalysis().sentences.find(s => s.id === id) : null; }
  function intentLabels() {
    const focus = getSelected(state.focus), turn = getSelected(state.turn);
    $('choose-focus').textContent = focus ? `✓ “${focus.text}”에 머물기` : '＋ 꼭 남기고 싶은 한 문장';
    $('choose-turn').textContent = turn ? `✓ “${turn.text}”부터 전환` : '＋ 분위기가 바뀌는 곳';
    $('choose-focus').classList.toggle('chosen', !!focus); $('choose-turn').classList.toggle('chosen', !!turn);
    $('refine-focus').textContent = focus ? '강조 문장 바꾸기 ↗' : '강조할 문장 고르기 ↗';
    $('refine-turn').textContent = turn ? '전환 위치 바꾸기 ↗' : '전환할 곳 고르기 ↗';
  }
  function sourceChanged() {
    const hadSelection = state.focus || state.turn;
    state.focus = null; state.turn = null; state.draft = null; state.scenes = {};
    const value = E.normalize($('source').value);
    $('input-count').textContent = `${E.graphemes(value.replace(/\n/g, '')).length.toLocaleString()}자`;
    $('generate').disabled = !value.trim();
    if (hadSelection) state.intentInvalidated = true;
    if (!value.trim()) state.intentInvalidated = false;
    $('input-message').textContent = state.intentInvalidated ? '글이 바뀌어서 강조와 전환 위치는 다시 골라 주세요.' : '';
    intentLabels();
  }
  $('source').addEventListener('input', sourceChanged);
  $('sample').addEventListener('click', () => {
    if ($('source').value.trim() && $('source').value !== window.GEUL_SAMPLE) { toast('쓰던 글을 지우면 예시를 넣을 수 있어요.'); return; }
    $('source').value = window.GEUL_SAMPLE; sourceChanged(); $('source').focus();
  });
  document.querySelectorAll('[data-mood]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.mood;
    if (state.moods.includes(key)) state.moods = state.moods.filter(item => item !== key);
    else if (state.moods.length >= 2) { toast('느낌은 두 개까지 골라 주세요. 먼저 하나를 눌러 해제할 수 있어요.'); return; }
    else state.moods.push(key);
    document.querySelectorAll('[data-mood]').forEach(b => b.setAttribute('aria-pressed', String(state.moods.includes(b.dataset.mood))));
    $('mood-caption').textContent = E.profile(state.moods).description;
  }));

  function closePicker() { $('picker-layer').hidden = true; $('intake').inert = false; $('result').inert = false; state.pickerReturn?.focus({ preventScroll: true }); state.picker = null; }
  function openPicker(type) {
    const analysis = currentAnalysis();
    if (!analysis.sentences.length) { toast('먼저 글을 놓아 주세요.'); $('source').focus(); return; }
    state.picker = type; state.pickerReturn = document.activeElement;
    $('picker-kicker').textContent = type === 'focus' ? '한 문장이면 충분해요.' : '여기서부터 달라지게';
    $('picker-title').textContent = type === 'focus' ? '어디에 머물까요.' : '어디서 분위기가 바뀌나요.';
    $('picker-description').textContent = type === 'focus' ? '유난히 남기고 싶은 문장을 골라 주세요. 앞뒤에 조금 더 여유를 둘게요.' : '고른 문장에서 새 쪽을 시작하고 낮밤을 바꿀게요. 반전이 없다면 고르지 않아도 좋아요.';
    $('sentence-list').replaceChildren();
    analysis.sentences.forEach((sentence, index) => {
      const button = document.createElement('button'); button.className = 'sentence-option'; button.dataset.sentence = sentence.id;
      button.setAttribute('aria-pressed', String(state[type] === sentence.id));
      const number = document.createElement('span'); number.className = 'sentence-number'; number.textContent = String(index + 1).padStart(2, '0');
      const text = document.createElement('span'); text.className = 'sentence-content'; text.textContent = sentence.text;
      if (type === 'turn' && sentence.turnCue) { const hint = document.createElement('small'); hint.textContent = '전환 표현이 있는 문장'; text.append(hint); }
      button.append(number, text); button.addEventListener('click', () => { state[type] = sentence.id; state.scenes = {}; state.intentInvalidated = false; $('input-message').textContent = ''; closePicker(); intentLabels(); if (!$('result').hidden) generate(true); });
      $('sentence-list').append(button);
    });
    $('picker-layer').hidden = false; $('intake').inert = true; $('result').inert = true;
    const appTop = $('application').getBoundingClientRect().top + scrollY;
    const viewTop = Math.max(0, scrollY - appTop + 18);
    $('picker-layer').style.paddingTop = `${Math.max(26, viewTop)}px`;
    const dialog = document.querySelector('.sentence-picker'); dialog.style.maxHeight = `${Math.min(700, innerHeight - 64)}px`; dialog.focus({ preventScroll: true });
  }
  ['choose-focus', 'refine-focus'].forEach(id => $(id).addEventListener('click', () => openPicker('focus')));
  ['choose-turn', 'refine-turn'].forEach(id => $(id).addEventListener('click', () => openPicker('turn')));
  $('close-picker').addEventListener('click', closePicker);
  $('picker-layer').addEventListener('click', event => { if (event.target === $('picker-layer')) closePicker(); });
  $('clear-selection').addEventListener('click', () => { const type = state.picker; state[type] = null; state.scenes = {}; closePicker(); intentLabels(); if (!$('result').hidden) generate(true); });
  document.addEventListener('keydown', event => {
    if ($('picker-layer').hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closePicker(); }
    if (event.key === 'Tab') {
      const focusable = [...$('picker-layer').querySelectorAll('button:not(:disabled)')], first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('sentence-picker'))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  function stop() { cancelAnimationFrame(state.frame); state.frame = 0; state.playing = false; }
  function returnToInput() { stop(); $('result').hidden = true; $('intake').hidden = false; goTop(); }
  ['back-input', 'return-writing', 'brand'].forEach(id => $(id).addEventListener('click', returnToInput));
  function appearance() {
    const style = $('application').style, p = state.draft.appearance, t = p.temperature;
    const colors = t > .25 ? ['#f5eedf', '#41392c', '#2d2821', '#f0e6d4', '#f2d3a680'] : t < -.25 ? ['#eaf0f2', '#2c3c42', '#1e292e', '#dfebef', '#d4e4f280'] : ['#f0f2e8', '#30382c', '#212b24', '#e0e9d8', '#e3ecc980'];
    ['--stage-paper', '--stage-ink', '--stage-night', '--stage-night-ink', '--glow'].forEach((key, i) => style.setProperty(key, colors[i]));
    style.setProperty('--reveal', `${p.reveal}ms`); style.setProperty('--rise', state.moods.includes('light') ? '3px' : '7px');
  }
  function generate(keepRefine = false) {
    if (!$('source').value.trim()) return;
    state.intentInvalidated = false; $('input-message').textContent = '';
    const wasRefining = keepRefine && !$('refine').hidden;
    state.draft = E.plan($('source').value, state);
    if (!state.draft.pages.length) return;
    if (!keepRefine) { state.scenes = {}; state.effect = state.draft.appearance.effect; state.speed = 1; state.rest = 1; $('speed').value = '1'; $('rest').value = '1'; }
    state.page = Math.min(keepRefine ? state.page : 0, state.draft.pages.length - 1);
    $('intake').hidden = true; $('result').hidden = false;
    $('draft-title').textContent = state.draft.appearance.labels.length ? `${state.draft.appearance.labels.join(' · ')} 결로 읽어요.` : '이런 호흡은 어때요.';
    $('draft-meta').textContent = `${state.draft.pages.length}쪽${state.focus ? ' · 한 문장에 머물기' : ''}${state.turn ? ' · 한 번의 분위기 전환' : ''}`;
    $('reason-list').replaceChildren();
    state.draft.reasons.forEach(reason => { const li = document.createElement('li'); li.textContent = reason; $('reason-list').append(li); });
    if (state.draft.analysis.quoted.length) { const li = document.createElement('li'); li.textContent = `따옴표가 있는 문장 ${state.draft.analysis.quoted.length}개는 원래 부호를 그대로 남겼어요.`; $('reason-list').append(li); }
    renderSuggestions(); appearance(); buildPageNav(); intentLabels(); setRefine(wasRefining, false); renderPage();
    $('speed-output').textContent = `${state.speed.toFixed(1)}×`; $('rest-output').textContent = `${state.rest.toFixed(1)}×`;
    if (!keepRefine) { $('reasoning').open = false; goTop(); }
  }
  $('generate').addEventListener('click', () => generate());
  function buildPageNav() {
    $('page-nav').replaceChildren();
    state.draft.pages.forEach((page, index) => {
      const button = document.createElement('button'); button.dataset.page = index; button.setAttribute('aria-label', `${index + 1}번째 쪽`);
      const number = document.createElement('span'); number.className = 'page-number'; number.textContent = String(index + 1).padStart(2, '0');
      const map = document.createElement('span'); map.className = 'page-map'; map.setAttribute('aria-hidden', 'true');
      page.text.split(/\s+/u).slice(0, 24).forEach(word => { const bar = document.createElement('i'); bar.style.width = `${Math.min(8, E.graphemes(word).length) * 2}px`; map.append(bar); });
      button.append(number, map); button.addEventListener('click', () => { state.page = index; renderPage(); }); $('page-nav').append(button);
    });
  }
  function actualScene() { return state.scenes[state.page] || (state.draft.pages[state.page].afterTurn ? 'night' : 'day'); }
  function syncControls() {
    const scene = actualScene();
    $('reading-stage').dataset.scene = scene; $('reading-stage').dataset.effect = state.effect;
    $('scene-label').textContent = scene === 'night' ? '밤 · 영사광' : '낮 · 창빛';
    document.querySelectorAll('#scene-options button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scene === scene)));
    document.querySelectorAll('#effect-options button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.effect === state.effect)));
    $('prev').disabled = state.page === 0; $('next').disabled = state.page === state.draft.pages.length - 1;
  }
  function renderPage() {
    stop(); state.elapsed = 0; state.nodes = [];
    const page = state.draft.pages[state.page]; state.schedule = E.timeline(page, state.draft, state);
    const text = $('reading-text'); text.replaceChildren(); $('reading-scroll').scrollTop = 0;
    state.schedule.tokens.forEach(token => {
      if (token.before) text.append(document.createTextNode(token.before));
      const span = document.createElement('span'); span.className = `word pending${token.focus ? ' focus' : ''}${token.short ? ' short' : ''}`; span.textContent = token.text;
      text.append(span); state.nodes.push(span);
    });
    $('page-count').textContent = `${String(state.page + 1).padStart(2, '0')} / ${String(state.draft.pages.length).padStart(2, '0')}`;
    document.querySelectorAll('#page-nav button').forEach((b, i) => { if (i === state.page) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    syncControls();
    if (state.reduced.matches) { state.nodes.forEach(node => node.classList.remove('pending')); $('play').textContent = '모두 펼쳐 보기'; $('play').setAttribute('aria-label', '움직임 줄이기가 적용되어 모든 글을 보여 줍니다'); $('play').disabled = true; return; }
    $('play').disabled = false; resume();
  }
  function tick(now) {
    state.elapsed = now - state.started;
    state.schedule.tokens.forEach((token, index) => {
      const age = state.elapsed - token.at, node = state.nodes[index];
      node.classList.toggle('pending', age < 0); node.classList.toggle('wet', age >= 0 && age < state.draft.appearance.reveal);
    });
    if (state.elapsed >= state.schedule.duration) { state.playing = false; $('play').textContent = '다 읽었어요'; $('play').setAttribute('aria-label', '다시 재생'); return; }
    state.frame = requestAnimationFrame(tick);
  }
  function resume() { state.playing = true; state.started = performance.now() - state.elapsed; $('play').textContent = '잠깐 멈춤'; $('play').setAttribute('aria-label', '일시 정지'); state.frame = requestAnimationFrame(tick); }
  $('play').addEventListener('click', () => {
    if (state.playing) { state.elapsed = performance.now() - state.started; stop(); $('play').textContent = '계속 읽기'; $('play').setAttribute('aria-label', '재생'); }
    else if (state.elapsed >= state.schedule.duration) renderPage(); else resume();
  });
  $('replay').addEventListener('click', renderPage);
  $('prev').addEventListener('click', () => { if (state.page > 0) { state.page--; renderPage(); } });
  $('next').addEventListener('click', () => { if (state.page < state.draft.pages.length - 1) { state.page++; renderPage(); } });
  $('reading-text').addEventListener('keydown', event => { if (event.key === 'ArrowRight') { event.preventDefault(); $('next').click(); } if (event.key === 'ArrowLeft') { event.preventDefault(); $('prev').click(); } });
  state.reduced.addEventListener('change', () => { if (!$('result').hidden) renderPage(); });

  function setRefine(open, scroll = true) {
    $('refine').hidden = !open; $('result-workspace').classList.toggle('refining', open); $('refine-toggle').setAttribute('aria-expanded', String(open)); $('refine-toggle').textContent = open ? '다듬기 −' : '다듬기 ＋';
    if (open && scroll && $('device').clientWidth <= 760) $('refine').scrollIntoView({ behavior: state.reduced.matches ? 'instant' : 'smooth', block: 'start' });
  }
  $('refine-toggle').addEventListener('click', () => setRefine($('refine').hidden)); $('close-refine').addEventListener('click', () => { setRefine(false); $('refine-toggle').focus(); });
  document.querySelectorAll('#scene-options button').forEach(b => b.addEventListener('click', () => { state.scenes[state.page] = b.dataset.scene; syncControls(); }));
  document.querySelectorAll('#effect-options button').forEach(b => b.addEventListener('click', () => { state.effect = b.dataset.effect; renderPage(); }));
  $('speed').addEventListener('input', () => { state.speed = Number($('speed').value); $('speed-output').textContent = `${state.speed.toFixed(1)}×`; renderPage(); });
  $('rest').addEventListener('input', () => { state.rest = Number($('rest').value); $('rest-output').textContent = `${state.rest.toFixed(1)}×`; renderPage(); });

  function renderSuggestions() {
    const host = $('suggestion-list'); host.replaceChildren(); const a = state.draft.analysis;
    function suggestion(description, excerpt, action, onClick) {
      const item = document.createElement('div'); item.className = 'suggestion';
      if (excerpt) { const quote = document.createElement('blockquote'); quote.textContent = `“${excerpt}”`; item.append(quote); }
      const p = document.createElement('p'); p.textContent = description; item.append(p);
      if (action) { const b = document.createElement('button'); b.textContent = action; b.addEventListener('click', onClick); item.append(b); }
      host.append(item);
    }
    if (!state.focus && a.focusCandidates.length) { const candidate = a.focusCandidates[0]; suggestion('짧게 독립해 읽히는 문장이에요. 여기에 조금 더 머물까요?', candidate.text, '이 문장에 머물기', () => { state.focus = candidate.id; generate(true); }); }
    if (!state.turn && a.turns.length) { const candidate = a.turns[0]; suggestion('전환 표현이 있어요. 분위기가 바뀌는 지점이라면 골라 주세요.', candidate.text, '여기서 분위기 바꾸기', () => { state.turn = candidate.id; state.scenes = {}; generate(true); }); }
    if (a.repeated.length) { const repeat = a.repeated[0]; suggestion(`같은 형태의 말이 ${repeat.total}번 나와요. 강조 문장을 고를 때 실마리로 삼을 수 있어요.`, repeat.word, '', null); }
    if (a.nightWords.length) suggestion(`‘${a.nightWords.join('·')}’이라는 말이 있어요. 지금 쪽을 어두운 바탕으로도 볼까요?`, '', '지금 쪽을 밤으로', () => { state.scenes[state.page] = 'night'; syncControls(); toast('지금 쪽을 밤으로 바꿨어요.'); });
    if (!host.childElementCount) suggestion('지금은 글의 간격과 문장 끝을 따라 읽고 있어요. 강조는 직접 고를 수 있어요.', '', '', null);
  }
  sourceChanged();
})();
