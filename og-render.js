(function () {
  'use strict';
  window.GeulOGRenderer = { async render(d) {
    const T = window.GeulTune, s = T.normalize(d.settings);
    T.useFont(document, s);
    T.useReaderTheme(document, s.theme);
    const blob = await window.GeulEnding.exportCard({ text:d.source, title:d.title, made:d.made, ending:d.ending });
    if (blob.size > 2000000) throw new Error('카드 이미지가 너무 커요. 바탕을 바꾼 뒤 다시 시도해 주세요.');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(new Error('카드 이미지를 읽지 못했어요. 다시 시도해 주세요.'));
      reader.readAsDataURL(blob);
    });
  } };
})();
