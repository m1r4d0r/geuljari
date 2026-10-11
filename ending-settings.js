/* 카드 문구와 배치를 편집실·미리보기·발행 뷰어에서 같은 범위로 읽어요. */
(function () {
  'use strict';
  const number = (v, min, max, fallback) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  window.GeulCardSettings = {
    normalize(raw) {
      const o = raw && typeof raw === 'object' ? raw : {};
      return {
        text: typeof o.text === 'string' ? o.text.replace(/\s+/g, ' ').trim().slice(0, 120) : null,
        size: number(o.size, 28, 120, 86), width: number(o.width, 30, 90, 76),
        x: number(o.x, 0, 100, 50), y: number(o.y, 0, 100, 43),
        align: ['left','center','right'].includes(o.align) ? o.align : 'center'
      };
    }
  };
})();
