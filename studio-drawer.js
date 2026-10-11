/* 같은 편집 설정을 PC에서는 옆 칸에, 모바일에서는 서랍에 놓아요. */
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
  trigger.onclick = () => { dialog.showModal(); trigger.setAttribute('aria-expanded', 'true'); };
  document.getElementById('settings-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => trigger.setAttribute('aria-expanded', 'false'));
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
  document.getElementById('mood-look').addEventListener('click', () => { if (dialog.open) dialog.close(); }, true);
})();
