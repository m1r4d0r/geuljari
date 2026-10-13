/*
 * 분위기 살펴보기(look.js)의 심상 장면 하나. 주소의 w(심상 낱말)와 s(편집실 조판값)로 실제 읽기 틀을 세운다.
 * 라이트 쪽 한 줄을 쓰고, 그 심상의 넘김으로 다크 쪽에 넘어가 한 줄을 쓴다. 바탕·넘김·글꼴·주색은 실제 글과 같다.
 * 되풀이(다크에서 라이트로 돌아가는 넘김 포함)는 look.js가 geulgyeol:goto·again으로 맡는다. reader.js 앞에 돈다.
 */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  const T = window.GeulTune;
  if (!E || !T) return;
  const q = new URLSearchParams(location.search);
  let base = {};
  try { base = JSON.parse(q.get('s') || '{}') || {}; } catch (e) { base = {}; }
  const s = T.setAxis(T.normalize(Object.assign({}, base, { scene: '라이트' })), '심상', q.get('w'));
  T.apply(E, s, window.GeulFx);
  T.patchFlow(E, s);
  T.useFont(document, s);
  const root = document.documentElement.style;
  root.setProperty('--fs-k', String(s.size));
  if (s.measure) root.setProperty('--m-user', s.measure + 'em');
  if (T.ALIGNS[s.align]) root.setProperty('--a-user', T.ALIGNS[s.align]);
  T.useReaderTheme(document, s.theme);
  root.setProperty('--dry', T.dryTime(s) + 's');
  document.documentElement.classList.add('embed');
  const text = T.sceneLine(s) + '\n밤이 깊어지면\n\n\n[[다크]]\n그리고 잉크';
  window.GeulReaderOpts = Object.assign(T.turnsOf(s), { turnPace: T.turnPace(s), source: { text, title: '', made: '', ending: null } });
})();
