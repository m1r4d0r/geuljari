/* 같은 편집 설정을 PC에서는 옆 칸에, 폰에서는 오른쪽 가장자리 '설정' 손잡이로 여는 서랍에 놓아요. 손잡이는 누르거나 안쪽으로 끌어요. */
(function () {
  'use strict';
  const dialog = document.getElementById('write-settings');
  const trigger = document.getElementById('settings-open');
  const slot = document.getElementById('write-settings-slot');
  const rail = dialog.querySelector('.rail');
  const mobile = matchMedia('(max-width: 760px)');
  function place() {
    if (!mobile.matches && dialog.open) dialog.close();
    (mobile.matches ? dialog : slot).append(rail);
  }
  mobile.addEventListener('change', place); place();
  function open() { if (!dialog.open) { dialog.showModal(); trigger.setAttribute('aria-expanded', 'true'); } }
  trigger.addEventListener('click', open);
  let from = null;
  trigger.addEventListener('pointerdown', e => { from = e.clientX; });
  trigger.addEventListener('pointermove', e => { if (from !== null && from - e.clientX > 16) { from = null; open(); } });
  ['pointerup', 'pointercancel'].forEach(t => trigger.addEventListener(t, () => { from = null; }));
  document.getElementById('settings-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => trigger.setAttribute('aria-expanded', 'false'));
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
  // 서랍 안의 글 단추(불러오기·초안 저장·새로 쓰기)와 살펴보기는 서랍을 닫고 열어요.
  ['mood-look', 'load-open', 'file-save', 'clear'].forEach(id => document.getElementById(id).addEventListener('click', () => { if (dialog.open) dialog.close(); }, true));
})();
