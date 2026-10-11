/* 편집 설정은 필요할 때만 서랍으로 열어요. */
(function () {
  'use strict';
  const dialog = document.getElementById('write-settings');
  const trigger = document.getElementById('settings-open');
  trigger.onclick = () => { dialog.showModal(); trigger.setAttribute('aria-expanded', 'true'); };
  document.getElementById('settings-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => trigger.setAttribute('aria-expanded', 'false'));
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
  for (const id of ['sample','clear','guide-open','load-open','mood-look']) {
    document.getElementById(id).addEventListener('click', () => dialog.close(), true);
  }
})();
