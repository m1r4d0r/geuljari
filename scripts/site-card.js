/* 사이트 대표 카드(og.jpg) 1200×630. 라이트 창빛 바탕 가운데에 로고, 그 아래 한 줄 소개와 주소. scripts/site-card.mjs가 찍는다 */
(function () {
  'use strict';
  const W = 1200, H = 630;
  const LINE = '당신의 글을 당신의 호흡대로 담는 자리';
  const HOST = 'geuljari.netlify.app';
  window.drawSiteCard = async function () {
    const T = window.GeulTune;
    T.useReaderTheme(document, T.normalize({}).theme);
    await document.fonts.load('400 44px "Song Myung"', LINE);
    await document.fonts.load('400 22px "Nanum Gothic Coding"', HOST);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const ground = window.GeulBackdrop.still('window', W, H, 'day');
    if (ground) ctx.drawImage(ground, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    const ink = cs.getPropertyValue('--theme-ink').trim() || '#2C2F6B';
    const paper = cs.getPropertyValue('--theme-paper').trim() || '#ECEDF0';
    /* 글 놓일 자리만 종이를 한 겹 덮어 바탕의 빛 위에서도 읽히게(끝 장 카드의 veil과 같은 결) */
    ctx.save();
    ctx.translate(W / 2, 300);
    ctx.scale(1, 0.46);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.5);
    g.addColorStop(0, paper + 'B3');
    g.addColorStop(0.6, paper + '4D');
    g.addColorStop(1, paper + '00');
    ctx.fillStyle = g;
    ctx.fillRect(-W / 2, -H, W, H * 2);
    ctx.restore();
    const LOGO_H = 84, logoW = LOGO_H * window.GeulLogo.ratio;
    window.GeulLogo.draw(ctx, (W - logoW) / 2, 196, LOGO_H, ink);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '400 44px "Song Myung"';
    ctx.fillText(LINE, W / 2, 364);
    ctx.globalAlpha = 0.62;
    ctx.font = '400 22px "Nanum Gothic Coding"';
    ctx.fillText(HOST, W / 2, 548);
    ctx.globalAlpha = 1;
    /* 홈 화면 아이콘 180×180: 종이 면 가운데에 파비콘 그대로 */
    const mark = new Image();
    mark.src = '/favicon.svg';
    await mark.decode();
    const t = document.createElement('canvas');
    t.width = t.height = 180;
    const tx = t.getContext('2d');
    tx.fillStyle = paper; tx.fillRect(0, 0, 180, 180);
    tx.drawImage(mark, 22, 22, 136, 136);
    /* 공유 그림은 끝 장 카드처럼 JPEG(바탕 번짐이 작게 담김) */
    return { card: c.toDataURL('image/jpeg', 0.9).split(',')[1], icon: t.toDataURL('image/png').split(',')[1] };
  };
})();
