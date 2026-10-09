/*
 * 글결 먹지판 읽기 틀 준비
 * 루트의 reader.js가 글을 세우기 전에 돈다(defer 차례). 편집실이 남긴 조판값을 엔진에 걸고,
 * 넘어온 글이 없을 때 쓸 예시 글을 채운다. ?embed로 열리면 편집실 안의 작은 미리보기 모양으로 줄인다.
 */
(function () {
  'use strict';
  const E = window.Geulgyeol;
  const T = window.GeulTune;
  if (!E || !T) return;

  function read(k) {
    try { return JSON.parse(sessionStorage.getItem(k) || localStorage.getItem(k) || 'null'); } catch (e) { return null; }
  }

  const s = T.normalize(read('geulgyeol.tune'));
  T.apply(E, s);
  T.patchFlow(E, s);
  document.documentElement.style.setProperty('--dry', T.DRY[s.dry] + 's');
  if (/[?&]embed\b/.test(location.search)) document.documentElement.classList.add('embed');

  const holder = document.getElementById('glog-text');
  if (holder && !holder.textContent.trim() && window.GeulgyeolSample) holder.textContent = window.GeulgyeolSample.text;
})();
