(async function () {
  'use strict';
  window.addEventListener('hashchange', () => location.reload());
  const status = document.getElementById('read-status');
  try {
    const target = window.GeulCrypto.parseLink(location.href);
    // 작성자 수정은 카드 아래 단추 줄 오른쪽 끝(ending.js)과, 글을 열 수 없을 때의 안내에만 둬요.
    const editHref = '/#edit=' + target.id + '.' + target.key;
    const edit = document.getElementById('author-edit');
    edit.href = editHref;
    const response = await fetch('/api/articles/' + target.id, { cache:'no-store' });
    if (!response.ok) throw new Error(response.status === 404 ? '삭제됐거나 발행이 중단된 글이에요.' : '글을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.');
    const record = await response.json();
    if (record.id !== target.id) throw new Error('글의 주소가 맞지 않아요.');
    const d = await window.GeulCrypto.open(record, target.key);
    const T = window.GeulTune, E = window.Geulgyeol, s = T.normalize(d.settings);
    T.apply(E, s, window.GeulFx); T.patchFlow(E, s); T.useFont(document, s);
    const root = document.documentElement.style;
    root.setProperty('--fs-k', String(s.size));
    if (s.measure) root.setProperty('--m-user', s.measure + 'em');
    if (T.ALIGNS[s.align]) root.setProperty('--a-user', T.ALIGNS[s.align]);
    const theme = T.themeVars(s.theme);
    for (const [name, variable] of Object.entries({ ink:'ink', lead:'lead', wet:'wet-ink', 'night-paper':'night-paper', 'night-ink':'night-ink', 'night-soft':'night-soft', 'night-wet':'night-wet' })) root.setProperty('--theme-' + name, theme['--' + variable]);
    root.setProperty('--dry', T.dryTime(s) + 's');
    window.GeulReaderOpts = { turn:T.TURNS[s.turn], turnPace:T.turnPace(s), source:{ text:T.sceneLine(s) + '\n' + d.source, title:d.title, made:d.made, ending:d.ending }, editHref };
    await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = '/reader.js'; script.onload = resolve; script.onerror = () => reject(new Error('읽기 화면을 불러오지 못했어요. 다시 열어 주세요.')); document.head.append(script);
    });
    status.hidden = true;
  } catch (e) {
    status.querySelector('h1').textContent = '글의 자리를 찾지 못했어요.';
    document.getElementById('author-edit').hidden = !document.getElementById('author-edit').href;
    document.getElementById('read-message').textContent = e.message;
  }
})();
