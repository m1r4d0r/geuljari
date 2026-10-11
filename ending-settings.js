/* 카드 문구와 배치를 편집실·미리보기·발행 뷰어에서 같은 범위로 읽어요. */
(function () {
  'use strict';
  const number = (v, min, max, fallback) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  window.GeulCardSettings = {
    normalize(raw) {
      const o = raw && typeof raw === 'object' ? raw : {};
      return {
        /* 줄은 엔터로 나누고(많아야 넷), 줄 안의 빈칸은 한 칸으로 */
        text: typeof o.text === 'string'
          ? o.text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).slice(0, 4).join('\n').replace(/^\n+|\n+$/g, '').slice(0, 120)
          : null,
        /* 카드 글꼴 이름(GeulTune.FONTS). null이면 본문 글꼴 */
        font: typeof o.font === 'string' && o.font.length <= 20 ? o.font : null,
        size: number(o.size, 28, 120, 86), width: number(o.width, 30, 90, 76),
        x: number(o.x, 0, 100, 50), y: number(o.y, 0, 100, 43),
        align: ['left','center','right'].includes(o.align) ? o.align : 'center'
      };
    }
  };
})();
